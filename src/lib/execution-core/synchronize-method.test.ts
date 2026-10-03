import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyMethods, type ProcessExecution } from "../domain";
import { synchronizeExecutionMethod } from "./synchronize-method";

const now = "2026-10-03T02:00:00.000Z";
function fixture(): ProcessExecution {
  const method = createEmptyMethods().assets;
  method.blocks = ["first", "images", "scenes"].map((id, order) => ({
    id,
    order,
    type: "CRIAR",
    operator: "Humano",
    inputs: [],
    outputs: [],
    parameters: [],
    instructions: "old",
  }));
  return {
    id: "exec",
    projectId: "project",
    channelId: "channel",
    processType: "assets",
    methodSnapshot: method,
    status: "failed",
    outputStatus: "pending",
    createdAt: now,
    updatedAt: now,
    blocks: [
      { blockId: "first", status: "completed", values: { result: "done" }, attempt: 1 },
      {
        blockId: "images",
        status: "failed",
        values: { images: ["preserved"] },
        attempt: 2,
        items: [
          { id: "item", order: 0, input: "prompt", status: "completed", attempt: 1, attempts: [] },
        ],
      },
      { blockId: "scenes", status: "pending", values: {}, attempt: 1 },
    ],
  };
}

test("saving new definitions immediately updates open work without resetting completed images or attempts", () => {
  const execution = fixture();
  const preserved = structuredClone(execution.blocks);
  const next = structuredClone(execution.methodSnapshot);
  next.blocks[1].outputs = [
    {
      id: "context",
      key: "context",
      label: "Context",
      required: false,
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
    },
  ];
  next.blocks[2].instructions = "new";
  assert.equal(synchronizeExecutionMethod(execution, next, now), true);
  assert.equal(execution.methodSnapshot.blocks[2].instructions, "new");
  assert.deepEqual(execution.blocks, preserved);
  assert.equal(execution.methodSnapshotHistory, undefined);
  assert.equal(synchronizeExecutionMethod(execution, next, now), false);
});

test("completed executions remain history and synchronization never deletes started work", () => {
  const execution = fixture();
  const next = structuredClone(execution.methodSnapshot);
  next.blocks.splice(1, 1);
  assert.throws(() => synchronizeExecutionMethod(execution, next, now));
  execution.status = "completed";
  assert.equal(synchronizeExecutionMethod(execution, next, now), false);
});

test("reordering work cannot activate a downstream block before its new predecessor", () => {
  const execution = fixture();
  execution.blocks[1].status = "in_progress";
  execution.status = "running";
  const next = structuredClone(execution.methodSnapshot);
  next.blocks = [next.blocks[0], next.blocks[2], next.blocks[1]];
  assert.throws(() => synchronizeExecutionMethod(execution, next, now));
  assert.equal(execution.methodSnapshot.blocks[1].id, "images");
});
