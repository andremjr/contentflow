import assert from "node:assert/strict";
import test from "node:test";

import type {
  ActionBlock,
  ProcessExecution,
  ProcessMethod,
  ProcessOutput,
  RuntimeValue,
} from "../domain";
import { applyCompletedBlockTransition } from "./index";

const NOW = "2026-09-29T16:00:00.000Z";

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
            pluginId: "com.contentflow.task011",
            capabilityId: "execute",
            configuration: {},
          },
        }),
  };
}

function execution(
  blocks: ActionBlock[],
  statuses: ProcessExecution["blocks"][number]["status"][],
): ProcessExecution {
  const methodSnapshot: ProcessMethod = {
    name: "TASK-011",
    processType: "theme",
    blocks: blocks.map((item, order) => ({ ...item, order })),
  };
  return {
    id: "task-011-execution",
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
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: "2026-09-29T15:00:00.000Z",
    updatedAt: "2026-09-29T15:00:00.000Z",
  };
}

function dependencies(output?: ProcessOutput) {
  return {
    deriveProcessOutput: () => output,
    recordProcessOutputDelivery: (
      state: ProcessExecution,
      values: Record<string, RuntimeValue>,
      now: string,
    ) => {
      state.deliveries = [
        {
          id: "output-delivery",
          projectId: state.projectId,
          channelId: state.channelId,
          processType: state.processType,
          executionId: state.id,
          blockId: "__process_output__",
          outputKey: "final_theme",
          label: "output",
          type: "text",
          cardinality: "one",
          attempt: 1,
          status: "completed",
          items: [{ id: "item", order: 0, value: values.final_theme }],
          createdAt: now,
          updatedAt: now,
        },
      ];
    },
  };
}

test("T01/T03 — completed block activates the same human state regardless of origin", () => {
  for (const origin of ["human", "plugin"]) {
    const state = execution([block("done"), block("next")], ["completed", "pending"]);
    state.blocks[0].values = { origin };
    const result = applyCompletedBlockTransition(state, "done", NOW, dependencies());
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "activate_block");
    assert.equal(state.blocks[1].status, "awaiting_human");
    assert.equal(state.blocks[1].startedAt, NOW);
    assert.equal(state.status, "awaiting_human");
  }
});

test("T02/T04 — completed block activates automatic state from the Core decision", () => {
  const state = execution([block("done"), block("next", "IA")], ["completed", "pending"]);
  const result = applyCompletedBlockTransition(state, "done", NOW, dependencies());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "activate_block");
  assert.equal(state.blocks[1].status, "blocked_executor");
  assert.equal(state.blocks[1].startedAt, NOW);
  assert.equal(state.status, "blocked_executor");
});

test("T05/T06 — finish_blocks with derivable output completes the execution", () => {
  const state = execution([block("done")], ["completed"]);
  const output: ProcessOutput = {
    processType: "theme",
    values: { final_theme: "resultado" },
    sourceBlockId: "done",
    createdAt: NOW,
  };
  const result = applyCompletedBlockTransition(state, "done", NOW, dependencies(output));
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "finish_blocks");
  assert.deepEqual(state.output, output);
  assert.equal(state.outputStatus, "completed");
  assert.equal(state.status, "completed");
  assert.equal(state.deliveries?.[0]?.createdAt, NOW);
});

test("T07 — finish_blocks without derivable output requests human output", () => {
  const state = execution([block("done")], ["completed"]);
  const result = applyCompletedBlockTransition(state, "done", NOW, dependencies());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "finish_blocks");
  assert.equal(state.outputStatus, "awaiting_human");
  assert.equal(state.status, "awaiting_output");
});

test("T08 — blocked transition does not mutate execution", () => {
  const state = execution([block("done"), block("next")], ["completed", "awaiting_human"]);
  state.status = "awaiting_human";
  const before = structuredClone(state);
  const result = applyCompletedBlockTransition(state, "done", NOW, dependencies());
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "blocked");
  if (!result.ok) assert.equal(result.decision.reason, "next_block_not_pending");
  assert.deepEqual(state, before);
});

test("T09/T10 — snapshot order selects exactly one next block and explicit now is deterministic", () => {
  const state = execution(
    [block("first"), block("snapshot-next", "Código"), block("later")],
    ["completed", "pending", "pending"],
  );
  const result = applyCompletedBlockTransition(state, "first", NOW, dependencies());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "activate_block");
  if (result.ok && result.outcome === "activate_block") {
    assert.equal(result.decision.blockId, "snapshot-next");
    assert.equal(result.decision.blockIndex, 1);
  }
  assert.deepEqual(
    state.blocks.map(({ status, startedAt }) => ({ status, startedAt })),
    [
      { status: "completed", startedAt: undefined },
      { status: "blocked_executor", startedAt: NOW },
      { status: "pending", startedAt: undefined },
    ],
  );
});
