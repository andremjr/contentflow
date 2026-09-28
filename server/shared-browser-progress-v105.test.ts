import assert from "node:assert/strict";
import test from "node:test";
import type { PersistentPluginJob } from "./plugin-job-store";
import { exportBrowserDiagnostics } from "./browser-diagnostics";
import {
  areRequiredOrchestratedItemsCompleted,
  itemProgressForJob,
} from "./plugin-item-orchestration";
import { profileLaneProgressForJob } from "./profile-lane-progress";

function job(): PersistentPluginJob {
  const workItems = [
    {
      id: "a",
      order: 0,
      input: "a",
      status: "completed" as const,
      durableState: "completed" as const,
      attempt: 1,
      attempts: [],
      output: "out-a",
    },
    {
      id: "b",
      order: 1,
      input: "b",
      status: "in_progress" as const,
      durableState: "awaiting_result" as const,
      attempt: 1,
      attempts: [],
    },
    {
      id: "c",
      order: 2,
      input: "c",
      status: "pending" as const,
      durableState: "pending" as const,
      attempt: 1,
      attempts: [],
    },
    {
      id: "d",
      order: 3,
      input: "d",
      status: "failed" as const,
      durableState: "failed" as const,
      attempt: 1,
      attempts: [],
    },
  ];
  return {
    id: "job-105",
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: "execution-105",
    blockId: "block-105",
    attempt: 1,
    traceId: "trace-105",
    request: {} as PersistentPluginJob["request"],
    status: "completed",
    nextPollAt: new Date(0).toISOString(),
    deadlineAt: new Date(60_000).toISOString(),
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    profileLanePool: {
      mode: "parallel",
      maxParallel: 2,
      lanes: [
        {
          laneId: "lane-a",
          profileId: "opaque-profile-1",
          alias: "private-account@example.com",
          itemIds: ["a", "c"],
          state: "running",
        },
        {
          laneId: "lane-b",
          profileId: "opaque-profile-2",
          alias: "Conta pessoal",
          itemIds: ["b", "d"],
          state: "failed",
          attempts: [
            {
              attempt: 1,
              invocationId: "session-b",
              state: "failed",
              at: new Date(1_000).toISOString(),
              reasonCode: "PROFILE_UNAVAILABLE",
            },
          ],
        },
      ],
    },
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: workItems.map((item) => item.input),
      itemIds: workItems.map((item) => item.id),
      workItems,
      claims: [],
      currentIndex: 0,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test("10.5 agrega total, concluídos, ativos, pendentes e falhos pelo estado das unidades", () => {
  const current = job();
  assert.deepEqual(profileLaneProgressForJob(current)?.counts, {
    total: 4,
    completed: 1,
    active: 1,
    pending: 1,
    failed: 1,
  });
  assert.deepEqual(itemProgressForJob(current), {
    total: 4,
    completed: 1,
    pending: 3,
    currentIndex: 3,
    failedIndex: 3,
  });
  assert.equal(areRequiredOrchestratedItemsCompleted(current), false);
});

test("10.5 diagnóstico por perfil usa IDs opacos e não expõe alias ou conta", () => {
  const current = job();
  const diagnostics = exportBrowserDiagnostics(current.executionId, [current], new Date(2_000));
  const serialized = JSON.stringify(diagnostics);
  assert.match(serialized, /opaque-profile-1/);
  assert.match(serialized, /opaque-profile-2/);
  assert.match(serialized, /PROFILE_UNAVAILABLE/);
  assert.doesNotMatch(serialized, /private-account@example\.com|Conta pessoal/);
  assert.deepEqual(
    diagnostics.jobs[0]!.profileLaneProgress?.lanes.map((lane) => lane.counts),
    [
      { total: 2, completed: 1, active: 0, pending: 1, failed: 0 },
      { total: 2, completed: 0, active: 1, pending: 0, failed: 1 },
    ],
  );
});

test("10.5 bloco só pode concluir quando todas as unidades obrigatórias estão concluídas", () => {
  const current = job();
  for (const item of current.itemOrchestration!.workItems!) {
    item.status = "completed";
    item.durableState = "completed";
    item.output = `out-${item.id}`;
  }
  const progress = profileLaneProgressForJob(current)!;
  assert.deepEqual(progress.counts, {
    total: 4,
    completed: 4,
    active: 0,
    pending: 0,
    failed: 0,
  });
  assert.equal(progress.complete, true);
  assert.equal(areRequiredOrchestratedItemsCompleted(current), true);
  assert.equal(itemProgressForJob(current)?.completed, 4);
});
