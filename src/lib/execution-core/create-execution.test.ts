import assert from "node:assert/strict";
import test from "node:test";

import type { ActionBlock, ProcessExecution, ProcessMethod } from "../domain";
import { createCanonicalProcessExecution, validateExecutionCoreInvariants } from "./index";

const NOW = "2026-09-28T23:50:00.000Z";

function block(id: string, operator: ActionBlock["operator"] = "Humano"): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator,
    name: id,
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
    ...(operator === "Humano"
      ? {}
      : {
          plugin: {
            pluginId: "com.contentflow.execution-creation-test",
            capabilityId: "execute",
            configuration: {},
          },
        }),
  };
}

function method(blocks: ActionBlock[], processType: ProcessMethod["processType"] = "theme") {
  return {
    contractVersion: 3,
    name: "Creation test",
    processType,
    blocks: blocks.map((item, order) => ({ ...item, order })),
  } satisfies ProcessMethod;
}

function create(methodSnapshot: ProcessMethod, revision?: number) {
  return createCanonicalProcessExecution({
    executionId: "execution-007",
    projectId: "project-007",
    channelId: "channel-007",
    processType: methodSnapshot.processType,
    methodSnapshot,
    now: NOW,
    revision,
  });
}

function requireExecution(result: ReturnType<typeof createCanonicalProcessExecution>) {
  if (!result.ok) throw new Error(`creation failed: ${result.reason}`);
  return result.execution;
}

function expectedCurrentCreation(methodSnapshot: ProcessMethod): ProcessExecution {
  const snapshot = structuredClone(methodSnapshot);
  const human = snapshot.blocks[0].operator === "Humano" && !snapshot.blocks[0].plugin;
  return {
    id: "execution-007",
    projectId: "project-007",
    channelId: "channel-007",
    processType: snapshot.processType,
    methodSnapshot: snapshot,
    blocks: snapshot.blocks.map((item, index) => ({
      blockId: item.id,
      status: index === 0 ? (human ? "awaiting_human" : "blocked_executor") : "pending",
      values: {},
      attempt: 1,
      ...(index === 0 ? { startedAt: NOW } : {}),
    })),
    status: human ? "awaiting_human" : "blocked_executor",
    outputStatus: "pending",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("E01 — human first block starts awaiting_human", () => {
  const execution = requireExecution(create(method([block("human"), block("later")])));
  assert.equal(execution.status, "awaiting_human");
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.equal(execution.blocks[0].startedAt, NOW);
  assert.equal(execution.blocks[1].status, "pending");
});

test("E02 — automatic first block starts blocked_executor", () => {
  const execution = requireExecution(create(method([block("automatic", "IA"), block("later")])));
  assert.equal(execution.status, "blocked_executor");
  assert.equal(execution.blocks[0].status, "blocked_executor");
  assert.equal(execution.blocks[0].startedAt, NOW);
  assert.equal(execution.blocks[1].status, "pending");
});

test("E03 — canonical creation produces the complete initial shape", () => {
  const methodSnapshot = method([block("first"), block("second")], "script");
  const execution = requireExecution(create(methodSnapshot, 7));
  assert.deepEqual(
    {
      revision: execution.revision,
      id: execution.id,
      projectId: execution.projectId,
      channelId: execution.channelId,
      processType: execution.processType,
      methodSnapshot: execution.methodSnapshot,
      status: execution.status,
      outputStatus: execution.outputStatus,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    },
    {
      revision: 7,
      id: "execution-007",
      projectId: "project-007",
      channelId: "channel-007",
      processType: "script",
      methodSnapshot,
      status: "awaiting_human",
      outputStatus: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    },
  );
});

test("E04 — every block starts at attempt 1", () => {
  const execution = requireExecution(create(method([block("a"), block("b"), block("c")])));
  assert.deepEqual(
    execution.blocks.map((item) => item.attempt),
    [1, 1, 1],
  );
});

test("E05 — every block owns an independent empty values object", () => {
  const execution = requireExecution(create(method([block("a"), block("b")])));
  assert.deepEqual(
    execution.blocks.map((item) => item.values),
    [{}, {}],
  );
  assert.notEqual(execution.blocks[0].values, execution.blocks[1].values);
});

test("E06 — methodSnapshot is a defensive clone", () => {
  const liveMethod = method([block("stable")]);
  liveMethod.blocks[0].inputs = [
    {
      id: "project-title",
      label: "Título",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      binding: { kind: "project", key: "title" },
    },
  ];
  const execution = requireExecution(create(liveMethod));
  liveMethod.name = "mutated";
  liveMethod.blocks[0].name = "mutated block";
  liveMethod.blocks[0].inputs[0].binding = { kind: "project", key: "deadline" };
  liveMethod.blocks.push(block("new"));
  assert.equal(execution.methodSnapshot.name, "Creation test");
  assert.equal(execution.methodSnapshot.blocks[0].name, "stable");
  assert.deepEqual(execution.methodSnapshot.blocks[0].inputs?.[0].binding, {
    kind: "project",
    key: "title",
  });
  assert.equal(execution.methodSnapshot.blocks.length, 1);
});

test("E07 — identical explicit inputs produce identical executions", () => {
  const snapshot = method([block("first"), block("second", "Código")]);
  assert.deepEqual(create(snapshot), create(snapshot));
});

test("E08 — creation does not mutate the received Method", () => {
  const snapshot = method([block("first"), block("second")]);
  const before = structuredClone(snapshot);
  create(snapshot);
  assert.deepEqual(snapshot, before);
});

test("E09 — empty Method returns explicit empty_method failure", () => {
  const result = create(method([]));
  assert.deepEqual(result, { ok: false, reason: "empty_method", diagnostics: [] });
});

test("E10 — duplicate block IDs return an invariant diagnostic", () => {
  const result = create(method([block("duplicate"), block("duplicate")]));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "malformed_state");
  assert.ok(result.diagnostics.some((item) => item.code === "snapshot_block_ids_not_unique"));
  assert.ok(result.diagnostics.some((item) => item.code === "execution_block_ids_not_unique"));
});

test("E11 — process identity, order and blocks come from explicit canonical input", () => {
  const snapshot = method([block("z"), block("a", "Código")], "thumbnail");
  const execution = requireExecution(create(snapshot));
  assert.equal(execution.processType, "thumbnail");
  assert.deepEqual(
    execution.methodSnapshot.blocks.map((item) => item.id),
    ["z", "a"],
  );
  assert.deepEqual(
    execution.blocks.map((item) => item.blockId),
    ["z", "a"],
  );
});

test("E12 — created execution satisfies Core invariants", () => {
  const execution = requireExecution(create(method([block("first"), block("second", "IA")])));
  assert.deepEqual(validateExecutionCoreInvariants(execution), []);
});

test("E13 — canonical creation is semantically equivalent to the current creation shape", () => {
  for (const snapshot of [
    method([block("human"), block("automatic", "IA")]),
    method([block("automatic", "Código"), block("human")]),
  ]) {
    const canonical = requireExecution(create(snapshot));
    assert.deepEqual(canonical, expectedCurrentCreation(snapshot));
  }
});

test("E14 — processType mismatching methodSnapshot.processType is rejected", () => {
  const methodSnapshot = method([block("first")], "thumbnail");
  const result = createCanonicalProcessExecution({
    executionId: "execution-007",
    projectId: "project-007",
    channelId: "channel-007",
    processType: "script",
    methodSnapshot,
    now: NOW,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "malformed_state");
  assert.ok(result.diagnostics.some((item) => item.code === "process_type_snapshot_mismatch"));
});
