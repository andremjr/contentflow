import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { ActionBlock, ProcessExecution, ProcessMethod } from "../domain";
import { evaluateExecutionCore, validateExecutionCoreInvariants } from "./index";

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
            pluginId: "com.contentflow.execution-core-test",
            capabilityId: "execute",
            configuration: {},
          },
        }),
  };
}

function execution(
  methodBlocks: ActionBlock[],
  statuses: ProcessExecution["blocks"][number]["status"][] = methodBlocks.map(() => "pending"),
  status: ProcessExecution["status"] = "not_started",
): ProcessExecution {
  const methodSnapshot: ProcessMethod = {
    name: "Core test",
    processType: "theme",
    blocks: methodBlocks.map((item, order) => ({ ...item, order })),
  };
  return {
    id: "execution-core-test",
    projectId: "project-core-test",
    channelId: "channel-core-test",
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
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
  };
}

test("C01 — snapshot sovereignty ignores later changes to a live Method", () => {
  const liveMethod: ProcessMethod = {
    name: "Live",
    processType: "theme",
    blocks: [block("snapshot-human")],
  };
  const state = execution(structuredClone(liveMethod.blocks));
  const before = evaluateExecutionCore(state, { type: "start_requested" });
  liveMethod.blocks = [block("live-replaced", "Código")];
  const after = evaluateExecutionCore(state, { type: "start_requested" });
  assert.deepEqual(after.decision, before.decision);
  assert.equal(after.decision.type, "activate_block");
  if (after.decision.type === "activate_block")
    assert.equal(after.decision.blockId, "snapshot-human");
});

test("C02 — first block is selected from methodSnapshot order", () => {
  const result = evaluateExecutionCore(execution([block("first"), block("second")]), {
    type: "start_requested",
  });
  assert.deepEqual(result.decision, {
    type: "activate_block",
    blockId: "first",
    blockIndex: 0,
    blockStatus: "awaiting_human",
    executionStatus: "awaiting_human",
    reason: "first_block_human",
    expectedRevision: undefined,
  });
});

test("C03 — completed first block advances exactly to the next snapshot block", () => {
  const state = execution(
    [block("first"), block("second"), block("third")],
    ["completed", "pending", "pending"],
    "awaiting_human",
  );
  const result = evaluateExecutionCore(state, { type: "block_completed", blockId: "first" });
  assert.equal(result.decision.type, "activate_block");
  if (result.decision.type === "activate_block") {
    assert.equal(result.decision.blockId, "second");
    assert.equal(result.decision.blockIndex, 1);
  }
});

test("C04 — native human block produces awaiting_human", () => {
  const result = evaluateExecutionCore(execution([block("human")]), { type: "start_requested" });
  assert.equal(result.decision.type, "activate_block");
  if (result.decision.type === "activate_block") {
    assert.equal(result.decision.blockStatus, "awaiting_human");
    assert.equal(result.decision.executionStatus, "awaiting_human");
  }
});

test("C05 — automatic block produces blocked_executor", () => {
  const result = evaluateExecutionCore(execution([block("automatic", "Código")]), {
    type: "start_requested",
  });
  assert.equal(result.decision.type, "activate_block");
  if (result.decision.type === "activate_block") {
    assert.equal(result.decision.blockStatus, "blocked_executor");
    assert.equal(result.decision.executionStatus, "blocked_executor");
  }
});

test("C06 — pending predecessor blocks arbitrary downstream activation", () => {
  const state = execution(
    [block("first"), block("second"), block("third")],
    ["completed", "pending", "awaiting_human"],
    "awaiting_human",
  );
  const result = evaluateExecutionCore(state, { type: "block_completed", blockId: "first" });
  assert.equal(result.decision.type, "blocked");
  if (result.decision.type === "blocked") assert.equal(result.decision.reason, "malformed_state");
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "downstream_active_before_predecessor",
    ),
  );
});

test("C07 — terminal snapshot block produces explicit finish decision", () => {
  const state = execution([block("only")], ["completed"], "awaiting_human");
  const result = evaluateExecutionCore(state, { type: "block_completed", blockId: "only" });
  assert.deepEqual(result.decision, {
    type: "finish_blocks",
    reason: "method_blocks_complete",
    expectedRevision: undefined,
  });
});

test("C08 — ambiguous active state produces explicit diagnostics", () => {
  const state = execution(
    [block("first"), block("second")],
    ["awaiting_human", "blocked_executor"],
    "awaiting_human",
  );
  const violations = validateExecutionCoreInvariants(state);
  assert.ok(violations.some((diagnostic) => diagnostic.code === "multiple_active_blocks"));
  const result = evaluateExecutionCore(state, { type: "block_completed", blockId: "first" });
  assert.equal(result.decision.type, "blocked");
  if (result.decision.type === "blocked") assert.equal(result.decision.reason, "malformed_state");
});

test("C09 — identical inputs produce structurally identical decisions", () => {
  const state = execution([block("first"), block("second", "IA")]);
  const fact = { type: "start_requested" } as const;
  assert.deepEqual(evaluateExecutionCore(state, fact), evaluateExecutionCore(state, fact));
});

test("C10 — evaluation never mutates the received state", () => {
  const state = execution([block("first"), block("second")]);
  const before = structuredClone(state);
  evaluateExecutionCore(state, { type: "start_requested" });
  assert.deepEqual(state, before);
});

test("execution Core production files cannot import forbidden infrastructure", () => {
  const directory = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
  const forbidden = [
    "express",
    "better-sqlite3",
    "plugin-runner",
    "browser-session-manager",
    "server/index",
    "react",
    "electron",
    "node:fs",
    "node:http",
    "node:https",
  ];
  const productionFiles = readdirSync(directory).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  for (const file of productionFiles) {
    const source = readFileSync(path.join(directory, file), "utf8");
    const imports = [...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/gi)].map(
      (match) => match[1].toLowerCase(),
    );
    for (const dependency of forbidden) {
      assert.equal(
        imports.some((specifier) => specifier.includes(dependency)),
        false,
        `${file} imports forbidden dependency ${dependency}`,
      );
    }
  }
});
