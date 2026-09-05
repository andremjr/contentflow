import assert from "node:assert/strict";
import test from "node:test";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";
import { executionCommands } from "./execution-commands";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Project,
  type ProcessExecution,
} from "../src/lib/domain";

test("tentativas técnicas não esgotam as rodadas da validação humana", () => {
  const project: Project = {
    id: "project",
    channelId: "channel",
    title: "Isolated retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
  };
  const method = createEmptyMethods().theme;
  method.blocks = [
    {
      id: "create",
      type: "CRIAR",
      operator: "Humano",
      name: "Create",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "review",
      type: "VALIDAR",
      operator: "Humano",
      name: "Review",
      inputs: [],
      outputs: [
        { id: "decision", key: "decision", label: "Decision", type: "approval", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
      validation: {
        mode: "approval",
        onReject: "retry_target",
        targetBlockId: "create",
        maxAttempts: 3,
        retryMode: "full",
      },
    },
  ];
  const execution: ProcessExecution = {
    id: "execution",
    projectId: project.id,
    channelId: project.channelId,
    processType: "theme",
    methodSnapshot: method,
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "create", status: "completed", values: {}, attempt: 9 },
      { blockId: "review", status: "awaiting_human", values: {}, attempt: 1 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    true,
  );
  assert.equal(execution.blocks[0].attempt, 10);
  assert.equal(execution.blocks[1].attempt, 2);
  execution.blocks[0].status = "completed";
  execution.blocks[1].status = "awaiting_human";
  execution.blocks[1].attempt = 3;
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    false,
  );
});

test("invalida a identidade dos jobs já executados ao repetir um trecho validado", () => {
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "completed",
      attempt: 1,
      completedAt: "2026-08-24T00:00:00.000Z",
    }),
    2,
  );
  assert.equal(attemptAfterRetryInvalidation({ status: "blocked_executor", attempt: 2 }), 3);
  assert.equal(attemptAfterRetryInvalidation({ status: "pending", attempt: 1 }), 1);
});
