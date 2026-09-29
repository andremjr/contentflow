import assert from "node:assert/strict";
import test from "node:test";

import { adaptLegacyExecutionCreatePayload } from "./legacy-execution-boundary";

function validLegacyPayload() {
  return {
    revision: 9,
    id: "legacy-execution",
    projectId: "legacy-project",
    channelId: "legacy-channel",
    processType: "theme",
    methodSnapshot: {
      processType: "theme",
      blocks: [
        {
          id: "legacy-block",
          type: "CRIAR",
          operator: "Código",
          plugin: { pluginId: "legacy.plugin", capabilityId: "generate", configuration: {} },
          parameters: [],
          order: 0,
        },
      ],
    },
    blocks: [
      {
        blockId: "legacy-block",
        status: "blocked_executor",
        values: { result: "already materialized" },
        attempt: 4,
        retryFeedback: { feedback: "keep" },
        pluginConversation: {
          pluginId: "legacy.plugin",
          id: "conversation-1",
        },
        items: [
          {
            id: "item-1",
            order: 0,
            input: "input",
            status: "completed",
            attempt: 2,
            output: "output",
            artifacts: [
              {
                id: "artifact-1",
                name: "artifact.txt",
                mimeType: "text/plain",
                size: 3,
                url: "/api/files/artifact-1",
              },
            ],
            externalReceipt: "receipt-1",
            attempts: [],
          },
        ],
      },
    ],
    deliveries: [],
    status: "blocked_executor",
    outputStatus: "pending",
    output: {
      processType: "theme",
      values: { result: "historical output" },
      sourceBlockId: "legacy-block",
      createdAt: "2026-09-29T09:30:00.000Z",
    },
    createdAt: "2026-09-29T09:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
  };
}

test("accepts and preserves an already-materialized legacy execution", () => {
  const input = validLegacyPayload();
  const result = adaptLegacyExecutionCreatePayload(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.execution, input);
  assert.notEqual(result.execution, input);
  assert.notEqual(result.execution.blocks, input.blocks);
});

test("accepts the historical method snapshot shape without inventing canonical fields", () => {
  const input = validLegacyPayload();
  assert.equal("name" in input.methodSnapshot, false);

  const result = adaptLegacyExecutionCreatePayload(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("name" in result.execution.methodSnapshot, false);
});

test("rejects an invalid UniversalProcess", () => {
  const result = adaptLegacyExecutionCreatePayload({
    ...validLegacyPayload(),
    processType: "unknown-process",
  });
  assert.deepEqual(result, {
    ok: false,
    reason: "invalid_process_type",
    message: "Execution processType must be a UniversalProcess.",
  });
});

test("rejects missing or malformed methodSnapshot", () => {
  const missing = validLegacyPayload() as Record<string, unknown>;
  delete missing.methodSnapshot;
  assert.equal(adaptLegacyExecutionCreatePayload(missing).ok, false);

  const malformed = validLegacyPayload();
  malformed.methodSnapshot.blocks = [
    { parameters: [], order: 0 },
  ] as typeof malformed.methodSnapshot.blocks;
  const result = adaptLegacyExecutionCreatePayload(malformed);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid_method_snapshot");
});

test("rejects missing or malformed execution blocks", () => {
  const missing = validLegacyPayload() as Record<string, unknown>;
  delete missing.blocks;
  assert.equal(adaptLegacyExecutionCreatePayload(missing).ok, false);

  const malformed = validLegacyPayload();
  malformed.blocks = {} as typeof malformed.blocks;
  const result = adaptLegacyExecutionCreatePayload(malformed);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid_blocks");
});

test("rejects structurally invalid execution and block statuses", () => {
  const executionStatus = adaptLegacyExecutionCreatePayload({
    ...validLegacyPayload(),
    status: "teleported",
  });
  assert.equal(executionStatus.ok, false);
  if (!executionStatus.ok) assert.equal(executionStatus.reason, "invalid_status");

  const input = validLegacyPayload();
  input.blocks[0].status = "teleported";
  const blockStatus = adaptLegacyExecutionCreatePayload(input);
  assert.equal(blockStatus.ok, false);
  if (!blockStatus.ok) assert.equal(blockStatus.reason, "invalid_blocks");
});

test("rejects invalid outputStatus and missing structural identity/timestamps", () => {
  const outputStatus = adaptLegacyExecutionCreatePayload({
    ...validLegacyPayload(),
    outputStatus: "unknown",
  });
  assert.equal(outputStatus.ok, false);
  if (!outputStatus.ok) assert.equal(outputStatus.reason, "invalid_output_status");

  const missingChannel = validLegacyPayload() as Record<string, unknown>;
  delete missingChannel.channelId;
  const identity = adaptLegacyExecutionCreatePayload(missingChannel);
  assert.equal(identity.ok, false);
  if (!identity.ok) assert.equal(identity.reason, "missing_identity");

  const missingCreatedAt = validLegacyPayload() as Record<string, unknown>;
  delete missingCreatedAt.createdAt;
  const timestamps = adaptLegacyExecutionCreatePayload(missingCreatedAt);
  assert.equal(timestamps.ok, false);
  if (!timestamps.ok) assert.equal(timestamps.reason, "invalid_timestamps");
});
