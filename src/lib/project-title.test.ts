import assert from "node:assert/strict";
import test from "node:test";

import type { ProcessExecution, Project } from "./domain";
import { applyGeneratedProjectTitle, reconcileGeneratedProjectTitles } from "./project-title";

const project = {
  id: "project-1",
  title: "Nome provisório",
  channelId: "channel-1",
  currentStage: "title",
  state: "processing",
  progress: 13,
  deadline: "",
  duration: "",
  assignee: { name: "", initials: "" },
  thumbHue: 0,
  stages: {
    theme: "done",
    title: "processing",
    thumbnail: "not_started",
    script: "not_started",
    narration: "not_started",
    assets: "not_started",
    editing: "not_started",
    publishing: "not_started",
  },
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
} satisfies Project;

function execution(overrides: Partial<ProcessExecution> = {}): ProcessExecution {
  return {
    id: "title-execution",
    projectId: project.id,
    channelId: project.channelId,
    processType: "title",
    methodSnapshot: { name: "Título", processType: "title", blocks: [] },
    blocks: [],
    status: "completed",
    outputStatus: "completed",
    output: {
      processType: "title",
      values: { title: "  O título final  " },
      createdAt: "2026-09-12T00:00:00.000Z",
    },
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

test("promove o título oficial concluído como nome do Projeto", () => {
  const target = structuredClone(project);
  assert.equal(applyGeneratedProjectTitle(target, execution()), true);
  assert.equal(target.title, "O título final");
});

test("não altera o nome por uma execução incompleta ou output sem texto", () => {
  const target = structuredClone(project);
  assert.equal(applyGeneratedProjectTitle(target, execution({ status: "running" })), false);
  assert.equal(target.title, "Nome provisório");
  assert.equal(
    applyGeneratedProjectTitle(
      target,
      execution({ output: { processType: "title", values: { title: ["Opção"] }, createdAt: "" } }),
    ),
    false,
  );
  assert.equal(target.title, "Nome provisório");
});

test("reconcilia projetos existentes que já possuem um título final", () => {
  const existing = structuredClone(project);
  const untouched = { ...structuredClone(project), id: "project-2", title: "Ainda manual" };
  const changed = reconcileGeneratedProjectTitles([existing, untouched], [execution()]);

  assert.deepEqual(
    changed.map((item) => item.id),
    [existing.id],
  );
  assert.equal(existing.title, "O título final");
  assert.equal(untouched.title, "Ainda manual");
});
