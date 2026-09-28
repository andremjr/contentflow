import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { PluginCapability, PluginExecutionRequest } from "../src/lib/plugin-contract";
import { invocationRequestForJob, usesContinuousItemSession } from "./plugin-item-orchestration";
import { createPersistentPluginJob, type PersistentPluginJob } from "./plugin-job-store";

const chatGptManifestPath = path.resolve(
  "ecosystem/plugins/reference/chatgpt-browser-studio/contentflow.plugin.json",
);
const chatGptHandlerModule = "../ecosystem/plugins/reference/chatgpt-browser-studio/handler.mjs";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v89",
    traceId: "trace-v89",
    blockId: "block-v89",
    capabilityId: "generate-text-in-browser",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: { accountProfile: "shared-chatgpt" },
    settings: { diagnosticMockResponse: "resposta incremental" },
    inputs: { content: ["primeiro", "segundo", "terceiro"] },
    inputContract: [],
    outputContract: [
      { key: "result", portKey: "result", label: "Texto", type: "textarea", required: true },
      { key: "parts", portKey: "parts", label: "Partes", type: "list", required: false },
    ],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "", language: "", niche: "" },
      project: { id: "project", title: "" },
      processType: "script",
      block: { type: "CRIAR", name: "ChatGPT", instructions: "Produza o item solicitado." },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function job(): PersistentPluginJob {
  return {
    ...createPersistentPluginJob({
      pluginId: "local.contentflow.chatgpt-browser-studio",
      pluginVersion: "1.0.14",
      request: request(),
      timeoutMs: 30_000,
    }),
    itemOrchestration: {
      inputPort: "content",
      outputPort: "parts",
      combinedOutputPort: "result",
      separator: "\n\n",
      items: ["primeiro", "segundo", "terceiro"],
      itemIds: ["item-0", "item-1", "item-2"],
      currentIndex: 1,
      accumulatedItems: ["resposta anterior"],
    },
  };
}

test("ChatGPT declara per_item como estratégia incremental explícita para geração textual", async () => {
  const manifest = JSON.parse(await readFile(chatGptManifestPath, "utf8"));
  const capability = manifest.capabilities.find(
    (candidate: { id?: string }) => candidate.id === "generate-text-in-browser",
  ) as PluginCapability;

  assert.deepEqual(capability.execution.itemOrchestration?.strategies, ["per_item"]);
  assert.equal(capability.execution.itemOrchestration?.preferredStrategy, "per_item");
  assert.equal(usesContinuousItemSession(capability), false);
});

test("núcleo entrega somente a unidade atual ao ChatGPT e mantém correlação batch", () => {
  const invocation = invocationRequestForJob(job(), { mode: "start" });

  assert.equal(invocation.inputs.content, "segundo");
  assert.deepEqual(invocation.batch, { itemId: "item-1", index: 1, total: 3 });
});

test("handler mantém uma resposta por invocação per_item sem depender de sessão contínua", async () => {
  const { execute } = await import(chatGptHandlerModule);
  const invocation = invocationRequestForJob(job(), { mode: "start" });
  const response = await execute(invocation, { signal: AbortSignal.timeout(5_000) });

  assert.equal(response.status, "success");
  if (response.status !== "success") return;
  assert.equal(response.values.result, "resposta incremental");
  assert.deepEqual(response.values.parts, ["resposta incremental"]);
  assert.deepEqual(response.bridgeDiagnostics, []);
});

test("8.9 preserva a geração de imagens sem declarar estratégia incremental nova", async () => {
  const manifest = JSON.parse(await readFile(chatGptManifestPath, "utf8"));
  const imageCapability = manifest.capabilities.find(
    (capability: PluginCapability) => capability.id === "generate-image-in-browser",
  );

  assert.ok(imageCapability?.execution.itemOrchestration);
  assert.equal(imageCapability.execution.itemOrchestration.strategies, undefined);
  assert.equal(imageCapability.execution.itemOrchestration.preferredStrategy, undefined);
  assert.equal(usesContinuousItemSession(imageCapability), false);
});
