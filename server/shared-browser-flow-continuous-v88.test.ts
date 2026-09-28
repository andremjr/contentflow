import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { claimOrchestratedItems } from "./plugin-item-orchestration";
import { createPersistentPluginJob, type PersistentPluginJob } from "./plugin-job-store";

const flowHandlerModule = "../ecosystem/plugins/reference/google-flow-browser-images/handler.mjs";
const flowManifestPath = path.resolve(
  "ecosystem/plugins/reference/google-flow-browser-images/contentflow.plugin.json",
);

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v88",
    traceId: "trace-v88",
    blockId: "block-v88",
    capabilityId: "generate-images-in-browser",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: { accountProfile: "shared-flow" },
    settings: {},
    inputs: { prompts: ["um", "dois", "tres"] },
    inputContract: [],
    outputContract: [
      { key: "images", portKey: "images", label: "Imagens", type: "files", required: true },
    ],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "", language: "", niche: "" },
      project: { id: "project", title: "" },
      processType: "assets",
      block: { type: "CRIAR", name: "Flow", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function submittedJob(): PersistentPluginJob {
  const items: BlockExecutionItem[] = ["um", "dois", "tres"].map((input, order) => ({
    id: `item-${order}`,
    kind: "list_item",
    provenance: { origin: "block_input", inputPort: "prompts" },
    order,
    input,
    status: order === 1 ? "in_progress" : "pending",
    durableState: order === 1 ? "awaiting_result" : "pending",
    attempt: 1,
    revision: order === 1 ? 2 : 0,
    attempts: [],
  }));
  return {
    ...createPersistentPluginJob({
      pluginId: "com.contentflow.google-flow-browser-images",
      pluginVersion: "1.3.7",
      request: request(),
      timeoutMs: 30_000,
    }),
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: ["um", "dois", "tres"],
      itemIds: items.map((item) => item.id),
      workItems: items,
      currentIndex: 0,
      accumulatedItems: [],
    },
  };
}

test("Flow declara sessão contínua preferida para imagens e vídeos", async () => {
  const manifest = JSON.parse(await readFile(flowManifestPath, "utf8"));
  for (const capabilityId of ["generate-images-in-browser", "generate-video-in-browser"]) {
    const capability = manifest.capabilities.find(
      (candidate: { id?: string }) => candidate.id === capabilityId,
    );
    assert.deepEqual(capability.execution.itemOrchestration.strategies, [
      "continuous_session",
      "per_item",
    ]);
    assert.equal(capability.execution.itemOrchestration.preferredStrategy, "continuous_session");
  }
});

test("reclaim preserva awaiting_result para impedir retry cego após crash", () => {
  const claimed = claimOrchestratedItems({
    job: submittedJob(),
    limit: 3,
    invocationId: "invocation-v88",
    profileId: "profile-v88",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const uncertain = claimed.claimed.find((item) => item.itemId === "item-1");
  assert.equal(uncertain?.state, "awaiting_result");
  assert.equal(uncertain?.revision, 2);
  assert.equal(
    claimed.job.itemOrchestration?.workItems?.find((item) => item.id === "item-1")?.durableState,
    "awaiting_result",
  );
});

test("máquina de estados publica submitted, awaiting_result e completed com revisão monotônica", async () => {
  const { __test } = await import(flowHandlerModule);
  const state = __test.createFlowContinuousItemState([
    {
      itemId: "item-v88",
      index: 0,
      total: 1,
      order: 0,
      attempt: 1,
      revision: 4,
      state: "pending",
      input: "prompt",
    },
  ]);
  const updates: Array<{ state: string; expectedRevision: number }> = [];
  const services = {
    publishItemUpdate: async (update: { state: string; expectedRevision: number }) => {
      updates.push({ state: update.state, expectedRevision: update.expectedRevision });
      return { itemId: "item-v88", revision: update.expectedRevision + 1 };
    },
  };

  await state.publish(services, "item-v88", "submitted");
  await state.publish(services, "item-v88", "awaiting_result");
  await state.publish(services, "item-v88", "completed", {
    outputPort: "images",
    value: [{ id: "artifact-v88" }],
  });

  assert.deepEqual(updates, [
    { state: "submitted", expectedRevision: 4 },
    { state: "awaiting_result", expectedRevision: 5 },
    { state: "completed", expectedRevision: 6 },
  ]);
  assert.equal(state.get("item-v88").state, "completed");
});

test("refresh fica bloqueado depois de submissão até reconciliação explícita", async () => {
  const { __test } = await import(flowHandlerModule);
  assert.equal(__test.flowContinuousStateCanRefresh("leased"), true);
  assert.equal(__test.flowContinuousStateCanRefresh("failed"), true);
  assert.equal(__test.flowContinuousStateCanRefresh("submitted"), false);
  assert.equal(__test.flowContinuousStateCanRefresh("awaiting_result"), false);
  assert.equal(__test.flowContinuousStateCanRefresh("awaiting_human"), false);
  assert.equal(__test.flowContinuousStateCanRefresh("awaiting_human", true), true);
});

test("baseline e projeto de reconciliação ficam no workspace privado e sobrevivem à retomada", async () => {
  const { __test } = await import(flowHandlerModule);
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-flow-v88-"));
  const services = {
    getWorkspacePath: (relativePath: string) => path.join(root, relativePath),
  };
  const flowRequest = request();
  try {
    await __test.saveVisualBatchProjectUrl(
      flowRequest,
      services,
      "https://flow.google.com/project/project-v88",
    );
    await __test.saveVisualBatchItemBaseline(flowRequest, services, "item-1", "image", [
      "https://lh3.googleusercontent.com/baseline-a",
      "https://lh3.googleusercontent.com/baseline-b",
    ]);
    assert.equal(
      await __test.visualBatchProjectUrl(flowRequest, services),
      "https://flow.google.com/project/project-v88",
    );
    assert.deepEqual(
      await __test.visualBatchItemBaseline(flowRequest, services, "item-1", "image"),
      [
        "https://lh3.googleusercontent.com/baseline-a",
        "https://lh3.googleusercontent.com/baseline-b",
      ],
    );
    await __test.clearVisualBatchItemBaseline(flowRequest, services, "item-1");
    assert.equal(
      await __test.visualBatchItemBaseline(flowRequest, services, "item-1", "image"),
      undefined,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("claim contínuo usa somente IDs concedidos pelo núcleo e preserva ordem original", async () => {
  const { __test } = await import(flowHandlerModule);
  const claims = [
    {
      itemId: "item-2",
      index: 2,
      total: 3,
      order: 2,
      attempt: 1,
      revision: 0,
      state: "pending",
      input: "tres",
    },
    {
      itemId: "item-0",
      index: 0,
      total: 3,
      order: 0,
      attempt: 1,
      revision: 0,
      state: "pending",
      input: "um",
    },
  ];
  const claimed = await __test.claimFlowContinuousItems(request(), {
    claimItems: async () => claims,
    publishItemUpdate: async () => ({ itemId: "unused", revision: 1 }),
  });
  assert.deepEqual(
    claimed.map((item: { itemId: string }) => item.itemId),
    ["item-0", "item-2"],
  );
});
