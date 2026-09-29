import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyMethods, type ProcessExecution } from "../domain";
import { applyExecutionCancellation } from "./apply-execution-cancellation";
import type { ExecutionCoreFact } from "./types";

const CANCELLATION_FACT = {
  type: "execution_cancellation_requested",
} satisfies ExecutionCoreFact;

function cancellableExecution(status: ProcessExecution["status"] = "running"): ProcessExecution {
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "completed",
      type: "CRIAR",
      operator: "Código",
      name: "Completed",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "active",
      type: "CRIAR",
      operator: "IA",
      name: "Active",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 1,
    },
    {
      id: "pending",
      type: "VALIDAR",
      operator: "Humano",
      name: "Pending",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 2,
    },
  ];

  return {
    id: "execution",
    projectId: "project",
    channelId: "channel",
    processType: "assets",
    methodSnapshot: method,
    status,
    outputStatus: "pending",
    error: "preserved execution error",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T13:00:00.000Z",
    deliveries: [
      {
        id: "delivery",
        projectId: "project",
        channelId: "channel",
        processType: "assets",
        executionId: "execution",
        blockId: "active",
        outputKey: "assets",
        label: "Assets",
        type: "files",
        cardinality: "many",
        attempt: 4,
        status: "partial",
        items: [{ id: "delivery-item", order: 0, value: "partial" }],
        createdAt: "2026-09-29T12:30:00.000Z",
        updatedAt: "2026-09-29T12:45:00.000Z",
      },
    ],
    blocks: [
      {
        blockId: "completed",
        status: "completed",
        values: { result: "consolidated" },
        attempt: 2,
        completedAt: "2026-09-29T12:20:00.000Z",
      },
      {
        blockId: "active",
        status: "in_progress",
        values: { result: "partial" },
        attempt: 4,
        error: "preserved block error",
        logs: ["preserved log"],
        items: [
          {
            id: "work-item",
            order: 0,
            input: "prompt",
            output: "partial",
            status: "completed",
            attempt: 1,
            attempts: [],
            externalReceipt: "receipt",
            artifacts: [
              {
                id: "artifact",
                name: "image.png",
                mimeType: "image/png",
                size: 10,
                url: "/api/files/image.png",
              },
            ],
          },
        ],
      },
      { blockId: "pending", status: "pending", values: {}, attempt: 1 },
    ],
  };
}

test("cancels every currently eligible execution state with one canonical block policy", () => {
  const eligibleStatuses = [
    "not_started",
    "running",
    "awaiting_human",
    "awaiting_output",
    "blocked_executor",
    "failed",
  ] as const;

  for (const status of eligibleStatuses) {
    const execution = cancellableExecution(status);
    const producedData = {
      completed: structuredClone(execution.blocks[0]),
      values: structuredClone(execution.blocks[1].values),
      items: structuredClone(execution.blocks[1].items),
      deliveries: structuredClone(execution.deliveries),
      attempt: execution.blocks[1].attempt,
      error: execution.blocks[1].error,
      logs: structuredClone(execution.blocks[1].logs),
      executionError: execution.error,
    };

    assert.deepEqual(applyExecutionCancellation(execution, CANCELLATION_FACT), {
      ok: true,
      outcome: "cancelled",
    });
    assert.equal(execution.status, "cancelled");
    assert.deepEqual(
      execution.blocks.map((block) => block.status),
      ["completed", "cancelled", "cancelled"],
    );
    assert.deepEqual(execution.blocks[0], producedData.completed);
    assert.deepEqual(execution.blocks[1].values, producedData.values);
    assert.deepEqual(execution.blocks[1].items, producedData.items);
    assert.deepEqual(execution.deliveries, producedData.deliveries);
    assert.equal(execution.blocks[1].attempt, producedData.attempt);
    assert.equal(execution.blocks[1].error, producedData.error);
    assert.deepEqual(execution.blocks[1].logs, producedData.logs);
    assert.equal(execution.error, producedData.executionError);
  }
});

test("blocks completed and malformed executions before mutation", () => {
  const completed = cancellableExecution("completed");
  completed.blocks[1].status = "completed";
  completed.blocks[2].status = "completed";
  const completedBefore = structuredClone(completed);
  assert.deepEqual(applyExecutionCancellation(completed, CANCELLATION_FACT), {
    ok: false,
    outcome: "blocked",
    reason: "execution_already_completed",
  });
  assert.deepEqual(completed, completedBefore);

  const malformed = cancellableExecution();
  malformed.methodSnapshot.processType = "theme";
  const malformedBefore = structuredClone(malformed);
  assert.deepEqual(applyExecutionCancellation(malformed, CANCELLATION_FACT), {
    ok: false,
    outcome: "blocked",
    reason: "malformed_state",
  });
  assert.deepEqual(malformed, malformedBefore);
});

test("reports an already cancelled execution idempotently without mutation", () => {
  const execution = cancellableExecution("cancelled");
  execution.blocks[1].status = "cancelled";
  execution.blocks[2].status = "cancelled";
  const before = structuredClone(execution);

  assert.deepEqual(applyExecutionCancellation(execution, CANCELLATION_FACT), {
    ok: true,
    outcome: "already_cancelled",
  });
  assert.deepEqual(execution, before);
});
