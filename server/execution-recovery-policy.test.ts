import assert from "node:assert/strict";
import test from "node:test";
import { createPersistentPluginJob } from "./plugin-job-store";
import {
  RATE_LIMIT_MAX_RETRIES,
  RATE_LIMIT_WITH_PROGRESS_DELAY_MS,
  RATE_LIMIT_WITHOUT_PROGRESS_DELAY_MS,
  decideExecutionRecovery,
} from "./execution-recovery-policy";

function job(overrides: Record<string, unknown> = {}) {
  return {
    ...createPersistentPluginJob({
      pluginId: "test.browser",
      pluginVersion: "1.0.0",
      timeoutMs: 60_000,
      profileFallback: {
        configurationKey: "profile",
        candidates: ["A", "B"],
        activeIndex: 0,
        history: [],
      },
      request: {
        executionId: "execution",
        traceId: "trace",
        blockId: "block",
        capabilityId: "capability",
        attempt: 1,
        invocation: { mode: "start" },
        configuration: {},
        settings: {},
        inputs: {},
        inputContract: [],
        outputContract: [],
        context: {
          locale: "pt-BR",
          timeZone: "America/Sao_Paulo",
          channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
          project: { id: "project", title: "Projeto" },
          processType: "assets",
          block: { type: "CRIAR", name: "Gerar", instructions: "" },
        },
      },
    }),
    ...overrides,
  };
}

test("efeito externo possível exige reconciliação antes de retry ou fallback", () => {
  assert.deepEqual(
    decideExecutionRecovery({
      job: job(),
      failure: { code: "TIMEOUT", retryable: true, recovery: { externalEffect: "possible" } },
    }),
    { action: "reconcile", reasonCode: "TIMEOUT", receipt: undefined },
  );
});

test("falha segura e ligada ao perfil avança para outro perfil preparado", () => {
  assert.equal(
    decideExecutionRecovery({
      job: job(),
      failure: {
        code: "AUTHENTICATION_FAILED",
        retryable: false,
        recovery: { stage: "before_effect" },
      },
    }).action,
    "switch_profile",
  );
});

test("autenticação sem fallback vira intervenção explícita", () => {
  const withoutFallback = job({ profileFallback: undefined });
  assert.equal(
    decideExecutionRecovery({ job: withoutFallback, failure: { code: "AUTHENTICATION_FAILED" } })
      .action,
    "intervene",
  );
});

test("retry técnico respeita política central e deadline", () => {
  assert.equal(
    decideExecutionRecovery({
      job: job({
        profileFallback: undefined,
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      failure: { code: "UPSTREAM_UNAVAILABLE", retryable: false },
    }).action,
    "retry",
  );
  assert.equal(
    decideExecutionRecovery({
      job: job({ retryCount: 2, profileFallback: undefined }),
      failure: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    }).action,
    "fail",
  );
});

test("limite temporário sem fallback espera mais quando nenhum item chegou a concluir", () => {
  const current = job({
    profileFallback: undefined,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  assert.deepEqual(decideExecutionRecovery({ job: current, failure: { code: "RATE_LIMIT" } }), {
    action: "retry",
    reasonCode: "RATE_LIMIT",
    delayMs: RATE_LIMIT_WITHOUT_PROGRESS_DELAY_MS,
  });
});

test("limite temporário no meio do lote preservado tenta novamente mais cedo", () => {
  const current = job({
    profileFallback: undefined,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "results",
      items: ["one", "two"],
      itemIds: ["one", "two"],
      currentIndex: 1,
      accumulatedItems: ["done"],
      workItems: [
        {
          id: "one",
          kind: "list_item",
          order: 0,
          input: "one",
          status: "completed",
          attempt: 1,
          attempts: [],
          output: "done",
        },
        {
          id: "two",
          kind: "list_item",
          order: 1,
          input: "two",
          status: "in_progress",
          attempt: 1,
          attempts: [],
        },
      ],
    },
  });
  assert.deepEqual(decideExecutionRecovery({ job: current, failure: { code: "RATE_LIMIT" } }), {
    action: "retry",
    reasonCode: "RATE_LIMIT",
    delayMs: RATE_LIMIT_WITH_PROGRESS_DELAY_MS,
  });
});

test("limite temporário respeita retryAfter do plugin e orçamento próprio", () => {
  const current = job({
    profileFallback: undefined,
    deadlineAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    retryCount: RATE_LIMIT_MAX_RETRIES - 1,
  });
  assert.deepEqual(
    decideExecutionRecovery({
      job: current,
      failure: { code: "RATE_LIMIT", retryAfterMs: 90_000 },
    }),
    { action: "retry", reasonCode: "RATE_LIMIT", delayMs: 90_000 },
  );
  assert.equal(
    decideExecutionRecovery({
      job: { ...current, retryCount: RATE_LIMIT_MAX_RETRIES },
      failure: { code: "RATE_LIMIT", retryAfterMs: 90_000 },
    }).action,
    "fail",
  );
});

test("perfil ocupado continua aguardando enquanto o deadline permitir", () => {
  const current = job({
    profileFallback: undefined,
    retryCount: 50,
    deadlineAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  assert.equal(
    decideExecutionRecovery({ job: current, failure: { code: "PROFILE_BUSY" } }).action,
    "retry",
  );
});

test("retryable legado não autoriza repetir efeito sem prova de segurança", () => {
  assert.equal(
    decideExecutionRecovery({
      job: job(),
      failure: { code: "UNEXPECTED_ERROR", retryable: true },
    }).action,
    "fail",
  );
});
