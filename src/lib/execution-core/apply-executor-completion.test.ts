import assert from "node:assert/strict";
import test from "node:test";

import type { ActionBlock, ProcessExecution, ProcessMethod, RuntimeValue } from "../domain";
import { applyExecutorBlockCompletion, evaluateExecutionCore } from "./index";

const NOW = "2026-09-29T19:00:00.000Z";

function block(
  id: string,
  operator: ActionBlock["operator"] = "Código",
  plugin = true,
): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator,
    name: id,
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
    ...(plugin
      ? {
          plugin: {
            pluginId: "com.contentflow.task013",
            capabilityId: "execute",
            configuration: {},
          },
        }
      : {}),
  };
}

function execution(
  blocks: ActionBlock[] = [block("executor")],
  statuses: ProcessExecution["blocks"][number]["status"][] = ["in_progress"],
  status: ProcessExecution["status"] = "running",
): ProcessExecution {
  const methodSnapshot: ProcessMethod = {
    contractVersion: 3,
    name: "TASK-013",
    processType: "theme",
    blocks: blocks.map((item, order) => ({ ...item, order })),
  };
  return {
    id: "task-013-execution",
    projectId: "project",
    channelId: "channel",
    processType: "theme",
    methodSnapshot,
    blocks: methodSnapshot.blocks.map((item, index) => ({
      blockId: item.id,
      status: statuses[index] ?? "pending",
      values: {},
      attempt: 1,
    })),
    status,
    outputStatus: "pending",
    createdAt: "2026-09-29T18:00:00.000Z",
    updatedAt: "2026-09-29T18:00:00.000Z",
  };
}

function complete(state: ProcessExecution, blockId: string, values: Record<string, RuntimeValue>) {
  return applyExecutorBlockCompletion(state, {
    type: "executor_block_completed",
    blockId,
    values,
    now: NOW,
  });
}

test("E01 — active executor completion stores values, explicit now and clears error", () => {
  const state = execution();
  state.blocks[0].error = "previous technical error";
  const result = complete(state, "executor", { answer: "done" });
  assert.equal(result.ok, true);
  assert.deepEqual(state.blocks[0].values, { answer: "done" });
  assert.equal(state.blocks[0].status, "completed");
  assert.equal(state.blocks[0].completedAt, NOW);
  assert.equal(state.blocks[0].error, undefined);
});

test("E02 — executor completion clones caller values", () => {
  const state = execution();
  const values: Record<string, RuntimeValue> = { tags: ["before", "stable"] };
  const result = complete(state, "executor", values);
  assert.equal(result.ok, true);
  const tags = values.tags;
  assert.ok(Array.isArray(tags));
  tags[0] = "after";
  assert.deepEqual(state.blocks[0].values, { tags: ["before", "stable"] });
});

test("E03 — evaluator accepts the characterized in_progress/running success state", () => {
  const state = execution();
  const result = evaluateExecutionCore(state, {
    type: "executor_block_completed",
    blockId: "executor",
    values: { answer: "done" },
    now: NOW,
  });
  assert.equal(result.decision.type, "complete_executor_block");
});

test("E04 — unknown executor block is rejected without mutation", () => {
  const state = execution();
  const before = structuredClone(state);
  const result = complete(state, "missing", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "unknown_executor_block");
  assert.deepEqual(state, before);
});

test("E05 — native and plugin-backed human blocks are not automatic executor completion", () => {
  for (const human of [
    block("native-human", "Humano", false),
    block("plugin-human", "Humano", true),
  ]) {
    const state = execution([human]);
    const before = structuredClone(state);
    const result = complete(state, human.id, { answer: "invalid" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.decision.reason, "block_not_executor");
    assert.deepEqual(state, before);
  }
});

test("E06 — pending or blocked executor cannot report final completion", () => {
  for (const status of ["pending", "blocked_executor"] as const) {
    const state = execution([block("executor")], [status]);
    const before = structuredClone(state);
    const result = complete(state, "executor", { answer: "invalid" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.decision.reason, "executor_block_not_active");
    assert.deepEqual(state, before);
  }
});

test("E07 — executor completion requires a running ProcessExecution", () => {
  const state = execution([block("executor")], ["in_progress"], "blocked_executor");
  const before = structuredClone(state);
  const result = complete(state, "executor", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "execution_not_running");
  assert.deepEqual(state, before);
});

test("E08 — malformed state is rejected with deep equality preserved", () => {
  const state = execution(
    [block("first"), block("second")],
    ["in_progress", "blocked_executor"],
    "running",
  );
  const before = structuredClone(state);
  const result = complete(state, "first", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "malformed_state");
  assert.deepEqual(state, before);
});

test("E09 — missing corresponding BlockExecution is malformed and does not mutate", () => {
  const state = execution();
  state.blocks = [];
  const before = structuredClone(state);
  const result = complete(state, "executor", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "malformed_state");
  assert.deepEqual(state, before);
});

test("E10 — identical state, fact and now produce identical completion", () => {
  const first = execution();
  const second = structuredClone(first);
  assert.deepEqual(
    complete(first, "executor", { answer: "same" }),
    complete(second, "executor", { answer: "same" }),
  );
  assert.deepEqual(first, second);
});
