import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyMethods, type BlockType, type ProcessExecution } from "../domain";
import { applyCurrentBlockDeliveryAcceptance } from "./apply-current-delivery-acceptance";

const NOW = "2026-09-29T15:00:00.000Z";

function executionWithBlock(
  status: ProcessExecution["blocks"][number]["status"],
  type: BlockType = "CRIAR",
): ProcessExecution {
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "images",
      type,
      operator: "IA",
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
    id: "execution",
    projectId: "project",
    channelId: "channel",
    processType: "assets",
    methodSnapshot: method,
    status: status === "cancelled" ? "cancelled" : status === "failed" ? "failed" : "running",
    outputStatus: "pending",
    error: "execution error",
    createdAt: "2026-09-29T13:00:00.000Z",
    updatedAt: "2026-09-29T13:00:00.000Z",
    blocks: [
      {
        blockId: "images",
        status,
        values: { assets: ["a", "b"] },
        attempt: 3,
        error: "block error",
        completedAt: "2026-09-29T14:00:00.000Z",
        progress: 0.5,
        progressMessage: "working",
        itemProgress: { total: 2, completed: 1, pending: 1 },
        itemRetryScope: "selected",
        itemRetryId: "item-b",
        items: [
          {
            id: "item-a",
            order: 0,
            input: "prompt-a",
            status: "completed",
            attempt: 1,
            attempts: [],
            externalReceipt: "receipt-a",
            artifacts: [
              {
                id: "artifact-a",
                name: "a.png",
                mimeType: "image/png",
                size: 100,
                url: "/api/files/a.png",
              },
            ],
          },
        ],
      },
    ],
  };
}

test("accepts a cancelled current delivery and preserves its produced data", () => {
  const execution = executionWithBlock("cancelled");
  const valuesBefore = structuredClone(execution.blocks[0].values);
  const itemsBefore = structuredClone(execution.blocks[0].items);

  const result = applyCurrentBlockDeliveryAcceptance(execution, {
    type: "current_block_delivery_accepted",
    blockId: "images",
    now: NOW,
  });

  assert.deepEqual(result, { ok: true, outcome: "completed", blockId: "images" });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].completedAt, NOW);
  assert.equal(execution.blocks[0].attempt, 3);
  assert.equal(execution.blocks[0].error, undefined);
  assert.equal(execution.blocks[0].progress, 1);
  assert.equal(execution.blocks[0].progressMessage, undefined);
  assert.equal(execution.blocks[0].itemProgress, undefined);
  assert.equal(execution.blocks[0].itemRetryScope, undefined);
  assert.equal(execution.blocks[0].itemRetryId, undefined);
  assert.equal(execution.error, undefined);
  assert.deepEqual(execution.blocks[0].values, valuesBefore);
  assert.deepEqual(execution.blocks[0].items, itemsBefore);
});

test("accepts a failed current delivery with the same canonical completion", () => {
  const execution = executionWithBlock("failed");

  const result = applyCurrentBlockDeliveryAcceptance(execution, {
    type: "current_block_delivery_accepted",
    blockId: "images",
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].completedAt, NOW);
  assert.equal(execution.blocks[0].progress, 1);
  assert.equal(execution.error, undefined);
});

test("blocks unsupported, ineligible, unknown and malformed states without mutation", () => {
  for (const type of ["ESCOLHER", "VALIDAR"] as const) {
    const execution = executionWithBlock("failed", type);
    const before = structuredClone(execution);
    assert.deepEqual(
      applyCurrentBlockDeliveryAcceptance(execution, {
        type: "current_block_delivery_accepted",
        blockId: "images",
        now: NOW,
      }),
      { ok: false, outcome: "blocked", reason: "unsupported_delivery_acceptance" },
    );
    assert.deepEqual(execution, before);
  }

  const ineligible = executionWithBlock("completed");
  const ineligibleBefore = structuredClone(ineligible);
  assert.deepEqual(
    applyCurrentBlockDeliveryAcceptance(ineligible, {
      type: "current_block_delivery_accepted",
      blockId: "images",
      now: NOW,
    }),
    { ok: false, outcome: "blocked", reason: "block_not_accepting_current_delivery" },
  );
  assert.deepEqual(ineligible, ineligibleBefore);

  const unknown = executionWithBlock("failed");
  const unknownBefore = structuredClone(unknown);
  assert.deepEqual(
    applyCurrentBlockDeliveryAcceptance(unknown, {
      type: "current_block_delivery_accepted",
      blockId: "unknown",
      now: NOW,
    }),
    { ok: false, outcome: "blocked", reason: "unknown_delivery_block" },
  );
  assert.deepEqual(unknown, unknownBefore);

  const malformed = executionWithBlock("failed");
  malformed.methodSnapshot.processType = "theme";
  const malformedBefore = structuredClone(malformed);
  assert.deepEqual(
    applyCurrentBlockDeliveryAcceptance(malformed, {
      type: "current_block_delivery_accepted",
      blockId: "images",
      now: NOW,
    }),
    { ok: false, outcome: "blocked", reason: "malformed_state" },
  );
  assert.deepEqual(malformed, malformedBefore);
});
