import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BlockExecutionItem } from "../src/lib/domain";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginManifest,
} from "../src/lib/plugin-contract";
import {
  claimOrchestratedItems,
  completeContinuousSessionClaims,
  continuousInvocationRequestForJob,
  releaseContinuousSessionClaims,
  usesContinuousItemSession,
} from "./plugin-item-orchestration";
import { createPersistentPluginJob, type PersistentPluginJob } from "./plugin-job-store";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v84",
    traceId: "trace-v84",
    blockId: "block-v84",
    capabilityId: "capability-v84",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: { prompts: ["um", "dois", "tres"] },
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "", language: "", niche: "" },
      project: { id: "project", title: "" },
      processType: "script",
      block: { type: "CRIAR", name: "Teste", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function workItems(): BlockExecutionItem[] {
  return ["um", "dois", "tres"].map((input, order) => ({
    id: `item-${order}`,
    kind: "list_item",
    provenance: { origin: "block_input", inputPort: "prompts" },
    order,
    input,
    status: "pending",
    attempt: 1,
    attempts: [],
  }));
}

function job(): PersistentPluginJob {
  return {
    ...createPersistentPluginJob({
      pluginId: "v84.fixture",
      pluginVersion: "1.0.0",
      request: request(),
      timeoutMs: 30_000,
    }),
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "results",
      items: ["um", "dois", "tres"],
      itemIds: ["item-0", "item-1", "item-2"],
      workItems: workItems(),
      currentIndex: 0,
      accumulatedItems: [],
    },
  };
}

function capability(preferredStrategy?: "continuous_session" | "per_item") {
  return {
    id: "capability-v84",
    name: "Fixture",
    description: "Fixture",
    processTypes: ["script"],
    blockTypes: ["CRIAR"],
    inputPorts: [],
    outputPorts: [],
    execution: {
      mode: "immediate",
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "results",
        mode: "sequential",
        strategies: ["continuous_session", "per_item"],
        preferredStrategy,
      },
    },
  } as unknown as PluginCapability;
}

test("negocia continuous_session somente quando ela é a estratégia preferida", () => {
  assert.equal(usesContinuousItemSession(capability("continuous_session")), true);
  assert.equal(usesContinuousItemSession(capability("per_item")), false);
  assert.equal(usesContinuousItemSession(capability()), false);
});

test("request contínuo mantém a coleção materializada e não envia batch unitário", () => {
  const continuous = continuousInvocationRequestForJob(job(), { mode: "start" });
  assert.deepEqual(continuous.inputs.prompts, ["um", "dois", "tres"]);
  assert.equal(continuous.batch, undefined);
});

test("claimItems concede vários itens na mesma invocação e preserva ownership até conclusão", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-v84-"));
  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    `export async function execute(request, services) {
  const first = await services.claimItems(2);
  const second = await services.claimItems(2);
  const all = [...first, ...second];
  return {
    status: "success",
    values: {
      results: all.map((item) => String(item.input).toUpperCase()),
      grants: all.map(({ itemId, index, total, attempt }) => ({ itemId, index, total, attempt }))
    }
  };
}`,
    "utf8",
  );
  const manifest = {
    apiVersion: "2",
    id: "v84.fixture",
    version: "1.0.0",
    permissions: [],
    capabilities: [],
  } as unknown as PluginManifest;
  const plugin: RegisteredPlugin = {
    id: manifest.id,
    source: "local",
    directory: root,
    absoluteDirectory: root,
    entrypoint,
    manifest,
    executable: true,
  };
  let currentJob = job();
  const invocationId = "invocation-v84";
  try {
    const response = await executeRegisteredPlugin(
      plugin,
      request(),
      10_000,
      {},
      {
        workspaceDirectory: root,
        artifactDirectory: path.join(root, "artifacts"),
        onClaimItems: async (limit) => {
          const result = claimOrchestratedItems({
            job: currentJob,
            limit,
            invocationId,
            profileId: "profile-v84",
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
          });
          currentJob = result.job;
          return result.claimed;
        },
      },
    );

    assert.equal(response.status, "success");
    if (response.status !== "success") return;
    assert.deepEqual(response.values.grants, [
      { itemId: "item-0", index: 0, total: 3, attempt: 1 },
      { itemId: "item-1", index: 1, total: 3, attempt: 1 },
      { itemId: "item-2", index: 2, total: 3, attempt: 1 },
    ]);
    assert.equal(currentJob.itemOrchestration?.claims?.length, 3);
    assert.ok(
      currentJob.itemOrchestration?.claims?.every(
        (claim) => claim.invocationId === invocationId && claim.profileId === "profile-v84",
      ),
    );

    currentJob = completeContinuousSessionClaims(
      currentJob,
      invocationId,
      response.values.results as string[],
    );
    assert.deepEqual(
      currentJob.itemOrchestration?.workItems?.map((item) => [item.status, item.output]),
      [
        ["completed", "UM"],
        ["completed", "DOIS"],
        ["completed", "TRES"],
      ],
    );
    assert.deepEqual(currentJob.itemOrchestration?.claims, []);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("concessão sem commit volta a pending quando a invocação termina com erro", () => {
  const claimed = claimOrchestratedItems({
    job: job(),
    limit: 2,
    invocationId: "invocation-error",
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const released = releaseContinuousSessionClaims(claimed.job, "invocation-error");
  assert.deepEqual(
    released.itemOrchestration?.workItems?.map((item) => item.status),
    ["pending", "pending", "pending"],
  );
  assert.deepEqual(released.itemOrchestration?.claims, []);
});
