import assert from "node:assert/strict";
import test from "node:test";
import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import {
  claimOrchestratedItems,
  consolidatedOrchestratedOutputs,
  publishOrchestratedItemUpdate,
  requiredOrchestratedItems,
} from "./plugin-item-orchestration";
import { createPersistentPluginJob, type PersistentPluginJob } from "./plugin-job-store";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v86",
    traceId: "trace-v86",
    blockId: "block-v86",
    capabilityId: "capability-v86",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: { scripts: ["roteiro"] },
    inputContract: [],
    outputContract: [
      {
        key: "clips",
        portKey: "clips",
        label: "Clips",
        shape: {
          kind: "content",
          family: "image",
          cardinality: "many",
          representation: "artifact",
        },
        required: true,
      },
    ],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "", language: "", niche: "" },
      project: { id: "project", title: "" },
      processType: "narration",
      block: { type: "CRIAR", name: "Teste", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function item(
  id: string,
  order: number,
  parentItemId?: string,
  output?: BlockExecutionItem["output"],
): BlockExecutionItem {
  return {
    id,
    kind: parentItemId ? "derived" : "list_item",
    ...(parentItemId ? { parentItemId, semanticKey: id } : {}),
    provenance: parentItemId
      ? { origin: "plugin_derived" }
      : { origin: "block_input", inputPort: "scripts" },
    order,
    input: id,
    status: output === undefined ? "pending" : "completed",
    durableState: output === undefined ? "pending" : "completed",
    revision: output === undefined ? 0 : 1,
    attempt: 1,
    ...(output === undefined ? {} : { output }),
    attempts: [],
  };
}

function job(): PersistentPluginJob {
  const root = item("root", 0);
  const first = item("clip-a", 0, root.id);
  const second = item("clip-b", 1, root.id);
  return {
    ...createPersistentPluginJob({
      pluginId: "v86.fixture",
      pluginVersion: "1.0.0",
      request: request(),
      timeoutMs: 30_000,
    }),
    registeredItems: [first, second],
    itemOrchestration: {
      inputPort: "scripts",
      outputPort: "clips",
      items: ["roteiro"],
      itemIds: [root.id],
      workItems: [root],
      currentIndex: 0,
      accumulatedItems: [],
    },
  };
}

test("filhos derivados substituem o pai como dependências obrigatórias e preservam ordem", () => {
  const current = job();
  assert.deepEqual(
    requiredOrchestratedItems(current).map((candidate) => candidate.id),
    ["clip-a", "clip-b"],
  );
  const consolidation = consolidatedOrchestratedOutputs(current);
  assert.equal(consolidation.complete, false);
  assert.deepEqual(consolidation.outputs, []);
});

test("claimItems concede filhos pendentes e publishItemUpdate consolida sem apagar irmãos", () => {
  const invocationId = "invocation-v86";
  let current = job();
  const claimed = claimOrchestratedItems({
    job: current,
    limit: 2,
    invocationId,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  current = claimed.job;
  assert.deepEqual(
    claimed.claimed.map((candidate) => candidate.itemId),
    ["clip-a", "clip-b"],
  );
  assert.equal(
    claimed.claimed.every((candidate) => candidate.parentItemId === "root"),
    true,
  );

  const first = publishOrchestratedItemUpdate({
    job: current,
    invocationId,
    update: {
      itemId: "clip-a",
      expectedRevision: 0,
      state: "completed",
      outputPort: "clips",
      value: ["a-1", "a-2"],
    },
  });
  current = first.job;
  assert.deepEqual(consolidatedOrchestratedOutputs(current), {
    requiredItems: current.registeredItems,
    outputs: ["a-1", "a-2"],
    complete: false,
  });

  const second = publishOrchestratedItemUpdate({
    job: current,
    invocationId,
    update: {
      itemId: "clip-b",
      expectedRevision: 0,
      state: "completed",
      outputPort: "clips",
      value: "b",
    },
  });
  current = second.job;
  const consolidated = consolidatedOrchestratedOutputs(current);
  assert.equal(consolidated.complete, true);
  assert.deepEqual(consolidated.outputs, ["a-1", "a-2", "b"]);
  assert.deepEqual(
    current.registeredItems?.map((candidate) => [candidate.id, candidate.output]),
    [
      ["clip-a", ["a-1", "a-2"]],
      ["clip-b", "b"],
    ],
  );
});
