import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translate } from "../src/lib/app-preferences";
import type { PersistentPluginJob } from "./plugin-job-store";
import { profileLaneProgressForJob } from "./profile-lane-progress";

const builderSource = readFileSync(
  new URL("../src/components/method-builder.tsx", import.meta.url),
  "utf8",
);
const runnerSource = readFileSync(
  new URL("../src/components/process-runner.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("11.3 mostra resumo da política antes de salvar", () => {
  assert.match(builderSource, /Resumo antes de salvar/);
  assert.match(builderSource, /Perfis selecionados/);
  assert.match(builderSource, /Ordem dos perfis/);
  assert.match(builderSource, /Workers efetivos/);
  assert.match(builderSource, /role="status"/);
  assert.match(builderSource, /aria-live="polite"/);
});

test("11.3 projeta progresso multiperfil seguro na execução", () => {
  assert.match(serverSource, /profileLaneProgressForJob/);
  assert.match(serverSource, /blockExecution\.profileLaneProgress/);
  assert.match(runnerSource, /ProfileLaneProgressSummary/);
  assert.match(runnerSource, /Progresso por perfil/);
  assert.match(runnerSource, /Reconciliação necessária/);
  assert.doesNotMatch(runnerSource, /lane\.profileId/);
});

test("11.3 mantém progresso agregado derivado das unidades do núcleo", () => {
  const job = {
    profileLanePool: {
      mode: "parallel",
      maxParallel: 2,
      lanes: [
        { laneId: "lane-1", profileId: "opaque-1", itemIds: ["a"], state: "running" },
        { laneId: "lane-2", profileId: "opaque-2", itemIds: ["b"], state: "running" },
      ],
    },
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: ["a", "b"],
      itemIds: ["a", "b"],
      workItems: [
        {
          id: "a",
          order: 0,
          input: "a",
          status: "completed",
          durableState: "completed",
          attempt: 1,
          attempts: [],
          output: "out-a",
        },
        {
          id: "b",
          order: 1,
          input: "b",
          status: "in_progress",
          durableState: "awaiting_result",
          attempt: 1,
          attempts: [],
        },
      ],
      currentIndex: 1,
    },
  } as unknown as PersistentPluginJob;
  const progress = profileLaneProgressForJob(job)!;
  assert.deepEqual(progress.counts, {
    total: 2,
    completed: 1,
    active: 1,
    pending: 0,
    failed: 0,
  });
  assert.equal(progress.lanes.length, 2);
});

test("11.3 traduz resumo e feedback em inglês e espanhol", () => {
  for (const phrase of [
    "Resumo antes de salvar",
    "Perfis selecionados",
    "Ordem dos perfis",
    "Progresso por perfil",
    "Progresso do perfil",
    "Ativos",
    "Pendentes",
    "Falhos",
    "Reconciliação necessária",
  ]) {
    assert.notEqual(translate(phrase, "en"), phrase, "missing English translation: " + phrase);
    assert.notEqual(translate(phrase, "es"), phrase, "missing Spanish translation: " + phrase);
  }
});
