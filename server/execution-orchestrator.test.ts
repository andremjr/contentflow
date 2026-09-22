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

test("agrupa os três primeiros processos e mantém os demais por projeto no lote híbrido", () => {
  const steps = buildOrchestratorSteps(["project-1", "project-2"], "batch");

  assert.equal(steps.length, 13);
  assert.deepEqual(steps.slice(0, 5), [
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "theme" },
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "title" },
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "thumbnail" },
    { projectId: "project-1", processType: "script" },
    { projectId: "project-2", processType: "script" },
  ]);
});

test("preserva o planejamento legado para filas em lote já persistidas", () => {
  const steps = buildOrchestratorSteps(["project-1", "project-2"], "batch", 1);

  assert.equal(steps.length, 16);
  assert.deepEqual(steps.slice(0, 4), [
    { projectId: "project-1", processType: "theme" },
    { projectId: "project-2", processType: "theme" },
    { projectId: "project-1", processType: "title" },
    { projectId: "project-2", processType: "title" },
  ]);

  const customOrder = [
    "theme",
    "script",
    "title",
    "thumbnail",
    "narration",
    "assets",
    "editing",
    "publishing",
  ] as const;
  const v2 = buildOrchestratorSteps(["project-1", "project-2"], "batch", 2, customOrder);
  assert.deepEqual(v2.slice(0, 4), [
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "theme" },
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "title" },
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "thumbnail" },
    { projectId: "project-1", processType: "script" },
  ]);
});

test("o lote V4 respeita a ordem congelada e só agrega processos elegíveis na posição correta", () => {
  const order = [
    "theme",
    "script",
    "title",
    "thumbnail",
    "narration",
    "assets",
    "editing",
    "publishing",
  ] as const;
  const steps = buildOrchestratorSteps(["project-1", "project-2"], "batch", 4, order);

  assert.deepEqual(steps.slice(0, 7), [
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "theme" },
    { projectId: "project-1", processType: "script" },
    { projectId: "project-2", processType: "script" },
    { kind: "aggregate", projectIds: ["project-1", "project-2"], processType: "title" },
    {
      kind: "aggregate",
      projectIds: ["project-1", "project-2"],
      processType: "thumbnail",
    },
    { projectId: "project-1", processType: "narration" },
    { projectId: "project-2", processType: "narration" },
  ]);
  assert.equal(steps.length, 13);
});

test("calcula o progresso apenas pelas etapas concluídas", () => {
  const orchestrator = {
    currentStep: 4,
    totalSteps: 16,
  } as ExecutionOrchestrator;

  assert.equal(orchestratorProgress(orchestrator), 25);
});
