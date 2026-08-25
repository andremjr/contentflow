import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  buildOrchestratorSteps,
  orchestratorProgress,
  STOPPABLE_ORCHESTRATOR_STATUSES,
  type ExecutionOrchestrator,
} from "../src/lib/execution-orchestrator";

test("separa estados executáveis de estados que ainda podem ser encerrados", () => {
  assert.deepEqual([...ACTIVE_ORCHESTRATOR_STATUSES], ["running", "awaiting_human", "blocked"]);
  assert.equal(ACTIVE_ORCHESTRATOR_STATUSES.has("failed"), false);
  assert.equal(STOPPABLE_ORCHESTRATOR_STATUSES.has("failed"), true);
  assert.equal(STOPPABLE_ORCHESTRATOR_STATUSES.has("completed"), false);
});

test("ordena todos os processos de cada projeto no modo ponta a ponta", () => {
  const steps = buildOrchestratorSteps(["project-1", "project-2"], "end_to_end");

  assert.equal(steps.length, 16);
  assert.deepEqual(steps.slice(0, 3), [
    { projectId: "project-1", processType: "theme" },
    { projectId: "project-1", processType: "title" },
    { projectId: "project-1", processType: "thumbnail" },
  ]);
  assert.deepEqual(steps[8], { projectId: "project-2", processType: "theme" });
});

test("ordena todos os projetos por processo no modo em lote", () => {
  const steps = buildOrchestratorSteps(["project-1", "project-2"], "batch");

  assert.equal(steps.length, 16);
  assert.deepEqual(steps.slice(0, 4), [
    { projectId: "project-1", processType: "theme" },
    { projectId: "project-2", processType: "theme" },
    { projectId: "project-1", processType: "title" },
    { projectId: "project-2", processType: "title" },
  ]);
});

test("calcula o progresso apenas pelas etapas concluídas", () => {
  const orchestrator = {
    currentStep: 4,
    totalSteps: 16,
  } as ExecutionOrchestrator;

  assert.equal(orchestratorProgress(orchestrator), 25);
});
