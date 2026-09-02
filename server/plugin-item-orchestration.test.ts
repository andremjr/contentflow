import assert from "node:assert/strict";
import test from "node:test";
import type { PluginCapability, PluginExecutionRequest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import {
  appendOrchestratedOutput,
  declaredItemOrchestration,
  invocationRequestForJob,
} from "./plugin-item-orchestration";

const request = {
  executionId: "execution",
  traceId: "trace",
  blockId: "block",
  capabilityId: "images",
  attempt: 1,
  invocation: { mode: "start" },
  configuration: { accountProfile: "primary" },
  settings: {},
  inputs: { prompts: ["one", "two", "three"] },
  inputContract: [],
  outputContract: [],
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
    project: { id: "project", title: "Projeto" },
    processType: "assets",
    block: { type: "CRIAR", name: "Imagens", instructions: "" },
    previousProcessOutputs: [],
    previousBlockOutputs: [],
  },
} satisfies PluginExecutionRequest;

const capability = {
  execution: {
    mode: "immediate",
    itemOrchestration: { inputPort: "prompts", outputPort: "images", mode: "sequential" },
  },
} as PluginCapability;

test("expande uma lista em chamadas atômicas com ID e posição", () => {
  const itemOrchestration = declaredItemOrchestration(capability, request);
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration,
    profileFallback: {
      configurationKey: "accountProfile",
      candidates: ["primary", "backup"],
      activeIndex: 1,
      history: [],
    },
  });
  job.itemOrchestration!.currentIndex = 1;
  const invocation = invocationRequestForJob(job, { mode: "start" });
  assert.equal(invocation.inputs.prompts, "two");
  assert.equal(invocation.configuration.accountProfile, "backup");
  assert.deepEqual(invocation.batch, {
    itemId: job.itemOrchestration!.itemIds[1],
    index: 1,
    total: 3,
  });
});

test("acumula outputs parciais sem repetir itens anteriores", () => {
  const first = appendOrchestratedOutput({}, { images: ["image-a"] }, "images");
  const second = appendOrchestratedOutput(first, { images: ["image-b"] }, "images");
  assert.deepEqual(second.images, ["image-a", "image-b"]);
});

test("incrementa a tentativa lógica ao repetir um job", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
  });
  job.retryCount = 2;
  assert.equal(invocationRequestForJob(job, { mode: "start" }).attempt, 3);
});

test("troca continuação por contexto quando o fallback muda de perfil", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request: {
      ...request,
      conversation: {
        mode: "reuse",
        id: "https://provider.test/chat/1",
        sourceProfile: "primary",
        fallbackContext: "Resultado anterior",
        continuationMessage: "Ajuste somente o contraste.",
      },
    },
    timeoutMs: 60_000,
    profileFallback: {
      configurationKey: "accountProfile",
      candidates: ["primary", "backup"],
      activeIndex: 1,
      history: [],
    },
  });
  assert.deepEqual(invocationRequestForJob(job, { mode: "start" }).conversation, {
    mode: "new",
    fallbackContext: "Resultado anterior",
    continuationMessage: "Ajuste somente o contraste.",
  });
});
