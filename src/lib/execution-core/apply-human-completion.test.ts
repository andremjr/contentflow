import assert from "node:assert/strict";
import test from "node:test";

import type { ActionBlock, ProcessExecution, ProcessMethod, RuntimeValue } from "../domain";
import { applyHumanBlockCompletion } from "./index";

const NOW = "2026-09-29T18:30:00.000Z";

function block(
  id: string,
  operator: ActionBlock["operator"] = "Humano",
  plugin = operator !== "Humano",
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
            pluginId: "com.contentflow.task012",
            capabilityId: "execute",
            configuration: {},
          },
        }
      : {}),
  };
}

function execution(
  blocks: ActionBlock[] = [block("human")],
  statuses: ProcessExecution["blocks"][number]["status"][] = ["awaiting_human"],
  status: ProcessExecution["status"] = "awaiting_human",
): ProcessExecution {
  const methodSnapshot: ProcessMethod = {
    contractVersion: 3,
    name: "TASK-012",
    processType: "theme",
    blocks: blocks.map((item, order) => ({ ...item, order })),
  };
  return {
    id: "task-012-execution",
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
  return applyHumanBlockCompletion(state, {
    type: "human_block_completed",
    blockId,
    values,
    now: NOW,
  });
}

test("H01/H03 — native human completion stores values and explicit now", () => {
  const state = execution();
  const result = complete(state, "human", { answer: "done" });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "completed");
  assert.deepEqual(state.blocks[0].values, { answer: "done" });
  assert.equal(state.blocks[0].status, "completed");
  assert.equal(state.blocks[0].completedAt, NOW);
});

test("H02 — completion clones caller values", () => {
  const state = execution();
  const values: Record<string, RuntimeValue> = {
    tags: ["before", "stable"],
  };
  const result = complete(state, "human", values);
  assert.equal(result.ok, true);
  const tags = values.tags;
  assert.ok(Array.isArray(tags));
  tags[0] = "after";
  assert.deepEqual(state.blocks[0].values, {
    tags: ["before", "stable"],
  });
});

test("H04 — inactive human block is rejected without mutation", () => {
  const state = execution([block("human")], ["pending"]);
  const before = structuredClone(state);
  const result = complete(state, "human", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "human_block_not_awaiting");
  assert.deepEqual(state, before);
});

test("H05 — automatic and plugin-backed human blocks reject direct human completion", () => {
  for (const automatic of [block("code", "Código"), block("plugin-human", "Humano", true)]) {
    const state = execution([automatic]);
    const before = structuredClone(state);
    const result = complete(state, automatic.id, { answer: "invalid" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.decision.reason, "block_not_human");
    assert.deepEqual(state, before);
  }
});

test("H06 — unknown block is rejected without mutation", () => {
  const state = execution();
  const before = structuredClone(state);
  const result = complete(state, "missing", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "unknown_human_block");
  assert.deepEqual(state, before);
});

test("H07 — malformed state is rejected without partial mutation", () => {
  const state = execution([block("human"), block("other")], ["awaiting_human", "awaiting_human"]);
  const before = structuredClone(state);
  const result = complete(state, "human", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "malformed_state");
  assert.deepEqual(state, before);
});

test("missing corresponding BlockExecution is malformed and does not mutate", () => {
  const state = execution();
  state.blocks = [];
  const before = structuredClone(state);
  const result = complete(state, "human", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "malformed_state");
  assert.deepEqual(state, before);
});

test("incompatible execution state is rejected without mutation", () => {
  const state = execution([block("human")], ["awaiting_human"], "blocked_executor");
  const before = structuredClone(state);
  const result = complete(state, "human", { answer: "invalid" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision.reason, "execution_not_awaiting_human");
  assert.deepEqual(state, before);
});

test("identical state, fact and now produce identical completion", () => {
  const first = execution();
  const second = structuredClone(first);
  assert.deepEqual(
    complete(first, "human", { answer: "same" }),
    complete(second, "human", { answer: "same" }),
  );
  assert.deepEqual(first, second);
});
