import assert from "node:assert/strict";
import test from "node:test";

import {
  PROCESS_ORDER,
  createEmptyMethods,
  type ProcessExecution,
  type ProcessExecutionStatus,
  type ProcessState,
  type Project,
} from "../domain";
import { applyExecutionProjectProjection } from "./project-projection";

function project(): Project {
  return {
    id: "project",
    title: "Project",
    channelId: "channel",
    currentStage: "title",
    state: "processing",
    progress: 37,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Antes",
    stages: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [processType, "not_started"]),
    ) as Project["stages"],
    assignee: { name: "Não atribuído", initials: "—" },
    thumbHue: 180,
    createdAt: "2026-09-29T00:00:00.000Z",
  };
}

function execution(status: ProcessExecutionStatus, processType = "theme"): ProcessExecution {
  return {
    id: "execution",
    projectId: "project",
    channelId: "channel",
    processType: processType as ProcessExecution["processType"],
    methodSnapshot: createEmptyMethods()[processType as ProcessExecution["processType"]],
    blocks: [],
    status,
    outputStatus: "pending",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  };
}

test("projects every non-completed execution status through one explicit matrix", () => {
  const cases = [
    ["not_started", "not_started"],
    ["running", "processing"],
    ["awaiting_human", "awaiting_human"],
    ["awaiting_output", "awaiting_human"],
    ["blocked_executor", "blocked"],
    ["failed", "error"],
    ["cancelled", "not_started"],
  ] as const satisfies readonly (readonly [ProcessExecutionStatus, ProcessState])[];

  for (const [executionStatus, expectedProjectState] of cases) {
    const target = project();
    applyExecutionProjectProjection(target, execution(executionStatus));

    assert.equal(target.stages.theme, expectedProjectState, executionStatus);
    assert.equal(target.currentStage, "theme", executionStatus);
    assert.equal(target.state, expectedProjectState, executionStatus);
    assert.equal(target.progress, 37, `${executionStatus} must preserve progress`);
    assert.equal(target.updatedAt, "Antes", `${executionStatus} must not own metadata`);
  }
});

test("completed uses the frozen order and run range, marks done, and recalculates progress", () => {
  const target = project();
  target.strategySnapshot = {
    processOrder: [
      "title",
      "thumbnail",
      "theme",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ],
    methods: createEmptyMethods(),
    definitionRevision: 4,
    capturedAt: "2026-09-29T00:00:00.000Z",
  };
  target.stages.thumbnail = "done";
  target.runFrom = "title";
  target.runThrough = "theme";

  applyExecutionProjectProjection(target, execution("completed", "title"));

  assert.equal(target.stages.title, "done");
  assert.equal(target.currentStage, "theme");
  assert.equal(target.state, "not_started");
  assert.equal(target.progress, 25);
});

test("completed leaves the last eligible Process as done when no next Process exists", () => {
  const target = project();
  target.runFrom = "title";
  target.runThrough = "title";

  applyExecutionProjectProjection(target, execution("completed", "title"));

  assert.equal(target.stages.title, "done");
  assert.equal(target.currentStage, "title");
  assert.equal(target.state, "done");
  assert.equal(target.progress, 13);
});
