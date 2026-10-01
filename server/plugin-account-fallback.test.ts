import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import { canAdvanceProfileFallback, orderedProfileCandidates } from "./plugin-account-fallback";

const manifest = {
  profileSetup: {
    configurationKey: "accountProfile",
    fallbackConfigurationKey: "fallbackAccountProfiles",
    label: "Salvar perfil",
  },
} as Pick<PluginManifest, "profileSetup">;

function jobWithFallback() {
  const profileFallback = orderedProfileCandidates(manifest, {
    accountProfile: "primary",
    fallbackAccountProfiles: "backup-a\nbackup-b, backup-a; inválido!",
  });
  return createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    timeoutMs: 60_000,
    profileFallback,
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
        previousProcessOutputs: [],
        previousBlockOutputs: [],
      },
    },
  });
}

test("normaliza aliases ordenados e remove duplicatas ou valores inválidos", () => {
  assert.deepEqual(jobWithFallback().profileFallback?.candidates, [
    "primary",
    "backup-a",
    "backup-b",
  ]);
});

for (const code of ["AUTHENTICATION_FAILED", "PERMISSION_DENIED", "QUOTA_EXCEEDED"]) {
  test(`avança perfil em erro seguro associado ao perfil ${code}`, () => {
    assert.equal(
      canAdvanceProfileFallback(jobWithFallback(), {
        status: "error",
        code,
        message: `Falha com ${code}`,
        retryable: false,
      }),
      true,
    );
  });
}

for (const code of [
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "JOB_FAILED",
  "RATE_LIMIT",
  "OUTPUT_VALIDATION_FAILED",
  "BRIDGE_PAGE_UNAVAILABLE",
  "BRIDGE_MISSING",
  "BRIDGE_INCOMPATIBLE",
  "PROVIDER_SECURITY_CHALLENGE",
]) {
  test(`não usa outra identidade para erro que não é fallback de conta ${code}`, () => {
    assert.equal(
      canAdvanceProfileFallback(jobWithFallback(), {
        status: "error",
        code,
        message: `Falha com ${code}`,
        retryable: true,
      }),
      false,
    );
  });
}

test("não troca de identidade por erro desconhecido sem fatos de segurança", () => {
  assert.equal(
    canAdvanceProfileFallback(jobWithFallback(), {
      status: "error",
      code: "UNEXPECTED_ERROR",
      message: "Falha desconhecida.",
      retryable: true,
    }),
    false,
  );
});

test("não avança perfil em cancelamento explícito CANCELLED", () => {
  assert.equal(
    canAdvanceProfileFallback(jobWithFallback(), {
      status: "error",
      code: "CANCELLED",
      message: "Execução cancelada pelo usuário.",
    }),
    false,
  );
});

test("não avança perfil se a execução já teve cancelamento solicitado", () => {
  const job = jobWithFallback();
  job.cancelRequested = true;
  assert.equal(
    canAdvanceProfileFallback(job, {
      status: "error",
      code: "RATE_LIMIT",
      message: "Limite atingido.",
    }),
    false,
  );
});

test("não avança perfil quando a lista de candidatos for esgotada", () => {
  const job = jobWithFallback();
  if (job.profileFallback) {
    job.profileFallback.activeIndex = job.profileFallback.candidates.length - 1;
  }
  assert.equal(
    canAdvanceProfileFallback(job, {
      status: "error",
      code: "UPSTREAM_UNAVAILABLE",
      message: "Falha final.",
    }),
    false,
  );
});
