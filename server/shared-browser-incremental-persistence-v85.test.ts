import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import {
  claimOrchestratedItems,
  publishOrchestratedItemUpdate,
  releaseContinuousSessionClaims,
} from "./plugin-item-orchestration";
import { createPersistentPluginJob, type PersistentPluginJob } from "./plugin-job-store";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v85",
    traceId: "trace-v85",
    blockId: "block-v85",
    capabilityId: "capability-v85",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: { prompts: ["um"] },
    inputContract: [],
    outputContract: [
      { key: "results", portKey: "results", label: "Resultados", type: "files", required: false },
    ],
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

function job(): PersistentPluginJob {
  const item: BlockExecutionItem = {
    id: "item-v85",
    kind: "list_item",
    provenance: { origin: "block_input", inputPort: "prompts" },
    order: 0,
    input: "um",
    status: "pending",
    attempt: 1,
    attempts: [],
  };
  return {
    ...createPersistentPluginJob({
      pluginId: "v85.fixture",
      pluginVersion: "1.0.0",
      request: request(),
      timeoutMs: 30_000,
    }),
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "results",
      items: ["um"],
      itemIds: [item.id],
      workItems: [item],
      currentIndex: 0,
      accumulatedItems: [],
    },
  };
}

test("publishItemUpdate incrementa revisão e submitted não volta a pending após queda", () => {
  const claimed = claimOrchestratedItems({
    job: job(),
    limit: 1,
    invocationId: "invocation-v85",
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const published = publishOrchestratedItemUpdate({
    job: claimed.job,
    invocationId: "invocation-v85",
    update: {
      itemId: "item-v85",
      expectedRevision: 0,
      state: "submitted",
      externalReceipt: "provider-job-123",
    },
  });
  assert.deepEqual(published.receipt, { itemId: "item-v85", revision: 1 });
  const item = published.job.itemOrchestration!.workItems![0]!;
  assert.equal(item.status, "in_progress");
  assert.equal(item.durableState, "submitted");
  assert.equal(item.revision, 1);
  const released = releaseContinuousSessionClaims(published.job, "invocation-v85");
  assert.equal(released.itemOrchestration!.workItems![0]!.durableState, "submitted");
  assert.equal(released.itemOrchestration!.workItems![0]!.status, "in_progress");
  assert.throws(
    () =>
      publishOrchestratedItemUpdate({
        job: published.job,
        invocationId: "invocation-v85",
        update: { itemId: "item-v85", expectedRevision: 0, state: "awaiting_result" },
      }),
    /revisão/i,
  );
});

test("worker importa artifact antes de confirmar publishItemUpdate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-v85-"));
  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    [
      'import { writeFile } from "node:fs/promises";',
      "export async function execute(_request, services) {",
      "  const [item] = await services.claimItems(1);",
      '  const output = services.getOutputPath("result.txt");',
      '  await writeFile(output, "resultado", "utf8");',
      '  const submitted = await services.publishItemUpdate({ itemId: item.itemId, expectedRevision: item.revision, state: "submitted", externalReceipt: "remote-1" });',
      "  const completed = await services.publishItemUpdate({",
      '    itemId: item.itemId, expectedRevision: submitted.revision, state: "completed", outputPort: "results",',
      '    value: { id: "artifact-v85", name: "result.txt", mimeType: "text/plain", size: 9, url: "artifact://artifact-v85" },',
      '    artifacts: [{ id: "artifact-v85", name: "result.txt", mimeType: "text/plain", source: { kind: "path", path: output } }]',
      "  });",
      '  return { status: "success", values: { revisions: [submitted.revision, completed.revision] } };',
      "}",
    ].join("\n"),
    "utf8",
  );
  const manifest = {
    id: "v85.fixture",
    version: "1.0.0",
    permissions: ["filesystem:write"],
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
  const invocationId = "invocation-v85-runtime";
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
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
          });
          currentJob = result.job;
          return result.claimed;
        },
        onPublishItemUpdate: async (update, storedArtifacts) => {
          const result = publishOrchestratedItemUpdate({
            job: currentJob,
            invocationId,
            update,
            storedArtifacts,
          });
          currentJob = result.job;
          return result.receipt;
        },
      },
    );
    assert.equal(response.status, "success");
    if (response.status !== "success") return;
    assert.deepEqual(response.values.revisions, [1, 2]);
    const item = currentJob.itemOrchestration!.workItems![0]!;
    assert.equal(item.status, "completed");
    assert.equal(item.durableState, "completed");
    assert.equal(item.revision, 2);
    assert.equal(item.artifacts?.length, 1);
    assert.match(String((item.output as { url?: string }).url), /^\/api\/files\//);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
