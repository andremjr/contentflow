import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyMethods, type BlockOperator, type ProcessExecution } from "../domain";
import { applyManualBlockRetry } from "./apply-manual-retry";

const NOW = "2026-09-29T12:00:00.000Z";

function executionWithBlock(
  operator: BlockOperator,
  status: ProcessExecution["blocks"][number]["status"] = "failed",
): ProcessExecution {
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "images",
      type: "CRIAR",
      operator,
      name: "Images",
      inputs: [],
      outputs: [{
        id: "assets",
        key: "assets",
        label: "Assets",
        shape: { kind: "content", family: "image", cardinality: "many", representation: "artifact" },
        required: true,
      }],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  return {
    id: `execution-${operator}`,
    projectId: "project",
    channelId: "channel",
    processType: "assets",
    methodSnapshot: method,
    status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
    outputStatus: "pending",
    error: "execution error",
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
    blocks: [
      {
        blockId: "images",
        status,
        values: { assets: ["a", "b"] },
        attempt: 3,
        error: "block error",
        jobId: "job",
        traceId: "trace",
        completedAt: "2026-09-29T11:00:00.000Z",
        progress: 0.5,
        progressMessage: "working",
        itemProgress: { total: 2, completed: 1, pending: 1 },
        items: [
          {
            id: "item-a",
            order: 0,
            input: "prompt-a",
            status: "completed",
            attempt: 1,
            attempts: [],
          },
          {
            id: "item-b",
            order: 1,
            input: "prompt-b",
            status: "completed",
            attempt: 1,
            attempts: [],
          },
        ],
        pluginConversation: { pluginId: "plugin", id: "conversation" },
      },
    ],
    deliveries: [
      {
        id: "delivery",
        projectId: "project",
        channelId: "channel",
        processType: "assets",
        executionId: `execution-${operator}`,
        blockId: "images",
        outputKey: "assets",
        label: "Assets",
        shape: { kind: "content", family: "image", cardinality: "many", representation: "artifact" },
        attempt: 3,
        status: "completed",
        items: [],
        createdAt: "2026-09-29T11:00:00.000Z",
        updatedAt: "2026-09-29T11:00:00.000Z",
      },
    ],
  };
}

test("applies failed + all as a canonical manual retry", () => {
  const execution = executionWithBlock("Código");

  const result = applyManualBlockRetry(
    execution,
    { type: "manual_block_retry_requested", blockId: "images", scope: "all" },
    NOW,
  );

  assert.deepEqual(result, {
    ok: true,
    outcome: "retried",
    blockId: "images",
    blockStatus: "blocked_executor",
    executionStatus: "blocked_executor",
  });
  assert.equal(execution.blocks[0].attempt, 4);
  assert.equal(execution.blocks[0].status, "blocked_executor");
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.blocks[0].itemProgress, undefined);
  assert.equal(execution.blocks[0].progress, undefined);
  assert.equal(execution.blocks[0].itemRetryScope, "all");
  assert.equal(execution.blocks[0].itemRetryId, undefined);
  assert.equal(execution.blocks[0].error, undefined);
  assert.equal(execution.blocks[0].pluginConversation, undefined);
  assert.equal(execution.blocks[0].jobId, undefined);
  assert.equal(execution.blocks[0].traceId, undefined);
  assert.equal(execution.blocks[0].completedAt, undefined);
  assert.equal(execution.blocks[0].progressMessage, undefined);
  assert.equal(execution.blocks[0].items?.length, 2);
  assert.equal(execution.deliveries?.[0].status, "invalidated");
  assert.equal(execution.deliveries?.[0].updatedAt, NOW);
  assert.equal(execution.error, undefined);
  assert.equal(execution.status, "blocked_executor");
});

test("applies completed + selected while preserving items, values and the official output", () => {
  const execution = executionWithBlock("Código", "completed");
  execution.outputStatus = "completed";
  execution.output = {
    processType: "assets",
    values: { assets: ["a", "b"] },
    sourceBlockId: "images",
    createdAt: "2026-09-29T11:00:00.000Z",
  };
  const valuesBefore = structuredClone(execution.blocks[0].values);
  const itemsBefore = structuredClone(execution.blocks[0].items);
  const outputBefore = structuredClone(execution.output);

  const result = applyManualBlockRetry(
    execution,
    {
      type: "manual_block_retry_requested",
      blockId: "images",
      scope: "selected",
      itemId: "item-b",
    },
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(execution.blocks[0].attempt, 4);
  assert.equal(execution.blocks[0].itemRetryScope, "selected");
  assert.equal(execution.blocks[0].itemRetryId, "item-b");
  assert.deepEqual(execution.blocks[0].values, valuesBefore);
  assert.deepEqual(execution.blocks[0].items, itemsBefore);
  assert.equal(execution.blocks[0].progress, 0.5);
  assert.equal(execution.outputStatus, "completed");
  assert.deepEqual(execution.output, outputBefore);
});

test("blocks selected retry for an unknown item without partial mutation", () => {
  const execution = executionWithBlock("Código", "completed");
  const before = structuredClone(execution);

  const result = applyManualBlockRetry(
    execution,
    {
      type: "manual_block_retry_requested",
      blockId: "images",
      scope: "selected",
      itemId: "unknown-item",
    },
    NOW,
  );

  assert.deepEqual(result, {
    ok: false,
    outcome: "blocked",
    reason: "selected_item_missing",
  });
  assert.deepEqual(execution, before);

  const inactiveExecution = executionWithBlock("Código");
  inactiveExecution.blocks[0].status = "pending";
  inactiveExecution.status = "not_started";
  const inactiveBefore = structuredClone(inactiveExecution);
  assert.deepEqual(
    applyManualBlockRetry(
      inactiveExecution,
      { type: "manual_block_retry_requested", blockId: "images", scope: "all" },
      NOW,
    ),
    { ok: false, outcome: "blocked", reason: "block_not_retryable" },
  );
  assert.deepEqual(inactiveExecution, inactiveBefore);

  const malformedExecution = executionWithBlock("Código");
  malformedExecution.methodSnapshot.processType = "theme";
  const malformedBefore = structuredClone(malformedExecution);
  assert.deepEqual(
    applyManualBlockRetry(
      malformedExecution,
      { type: "manual_block_retry_requested", blockId: "images", scope: "all" },
      NOW,
    ),
    { ok: false, outcome: "blocked", reason: "malformed_state" },
  );
  assert.deepEqual(malformedExecution, malformedBefore);
});

test("reactivates native human and executor blocks with distinct canonical states", () => {
  const humanExecution = executionWithBlock("Humano");
  const executorExecution = executionWithBlock("IA");

  const humanResult = applyManualBlockRetry(
    humanExecution,
    { type: "manual_block_retry_requested", blockId: "images", scope: "remaining" },
    NOW,
  );
  const executorResult = applyManualBlockRetry(
    executorExecution,
    { type: "manual_block_retry_requested", blockId: "images", scope: "remaining" },
    NOW,
  );

  assert.equal(humanResult.ok && humanResult.executionStatus, "awaiting_human");
  assert.equal(humanExecution.blocks[0].status, "awaiting_human");
  assert.equal(humanExecution.status, "awaiting_human");
  assert.equal(executorResult.ok && executorResult.executionStatus, "blocked_executor");
  assert.equal(executorExecution.blocks[0].status, "blocked_executor");
  assert.equal(executorExecution.status, "blocked_executor");
});
