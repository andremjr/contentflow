import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { PersistentPluginJob } from "./plugin-job-store";
import { PluginJobStore } from "./plugin-job-store";
import {
  claimNextProfileLaneItem,
  reconcileProfileLaneItemForRetry,
} from "./profile-lane-distribution";

function fixture(id = "job-104") {
  const database = new Database(":memory:");
  const store = new PluginJobStore(database);
  const items = ["a", "b", "c", "d"].map((itemId, order) => ({
    id: itemId,
    order,
    input: itemId,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  const job: PersistentPluginJob = {
    id,
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: `execution-${id}`,
    blockId: "block-104",
    attempt: 1,
    traceId: "trace-104",
    request: {} as PersistentPluginJob["request"],
    status: "pending",
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
        { laneId: "lane-a", profileId: "p1", alias: "A", itemIds: ["a", "c"], state: "running" },
        { laneId: "lane-b", profileId: "p2", alias: "B", itemIds: ["b", "d"], state: "running" },
      ],
    },
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: items.map((item) => item.input),
      itemIds: items.map((item) => item.id),
      workItems: items,
      claims: [],
      currentIndex: 0,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  store.create(job);
  return { database, store, job };
}

test("10.4 cancelamento encerra todas as lanes e impede novas concessões", () => {
  const { database, store, job } = fixture();
  try {
    const current = store.get(job.id)!;
    current.itemOrchestration!.workItems![0] = {
      ...current.itemOrchestration!.workItems![0]!,
      status: "completed",
      durableState: "completed",
      output: "done",
    };
    current.itemOrchestration!.workItems![2] = {
      ...current.itemOrchestration!.workItems![2]!,
      status: "in_progress",
      durableState: "submitted",
      attempts: [{ attempt: 1, status: "in_progress", input: "c" }],
    };
    current.itemOrchestration!.claims = [
      {
        itemId: "c",
        invocationId: "session-a",
        profileId: "p1",
        claimedAt: new Date(0).toISOString(),
        expiresAt: new Date(60_000).toISOString(),
      },
    ];
    store.mutateActiveJobAtomically(job.id, () => ({ job: current, value: true }));

    assert.equal(store.requestCancellation(job.executionId), 1);
    const cancelled = store.get(job.id)!;
    assert.equal(cancelled.cancelRequested, true);
    assert.ok(cancelled.profileLanePool!.lanes.every((lane) => lane.state === "cancelled"));
    assert.equal(cancelled.itemOrchestration!.workItems![0]!.status, "completed");
    assert.equal(cancelled.itemOrchestration!.workItems![2]!.durableState, "submitted");
    assert.deepEqual(cancelled.profileLanePool!.lanes[0]!.reconciliationItemIds, ["c"]);
    assert.deepEqual(cancelled.itemOrchestration!.claims, []);

    const claimed = claimNextProfileLaneItem({
      store,
      jobId: job.id,
      laneId: "lane-b",
      invocationId: "session-new",
      expiresAt: new Date(120_000).toISOString(),
    });
    assert.deepEqual(claimed?.value, []);
  } finally {
    database.close();
  }
});

test("10.4 reinício reconstrói lanes do banco e devolve somente lease sem efeito", () => {
  const { database, store, job } = fixture("job-restart-104");
  try {
    const current = store.get(job.id)!;
    current.itemOrchestration!.workItems![0] = {
      ...current.itemOrchestration!.workItems![0]!,
      status: "in_progress",
      durableState: "leased",
      attempts: [{ attempt: 1, status: "in_progress", input: "a" }],
    };
    current.itemOrchestration!.workItems![1] = {
      ...current.itemOrchestration!.workItems![1]!,
      status: "completed",
      durableState: "completed",
      output: "done-b",
    };
    current.itemOrchestration!.workItems![2] = {
      ...current.itemOrchestration!.workItems![2]!,
      status: "in_progress",
      durableState: "awaiting_result",
      attempts: [{ attempt: 1, status: "in_progress", input: "c" }],
    };
    current.itemOrchestration!.claims = [
      {
        itemId: "a",
        invocationId: "session-a",
        profileId: "p1",
        claimedAt: new Date(0).toISOString(),
        expiresAt: new Date(60_000).toISOString(),
      },
      {
        itemId: "c",
        invocationId: "session-a",
        profileId: "p1",
        claimedAt: new Date(0).toISOString(),
        expiresAt: new Date(60_000).toISOString(),
      },
    ];
    store.mutateActiveJobAtomically(job.id, () => ({ job: current, value: true }));

    assert.equal(store.recoverInterrupted(new Date(5_000)), 1);
    const recovered = store.get(job.id)!;
    assert.deepEqual(recovered.itemOrchestration!.claims, []);
    assert.equal(recovered.itemOrchestration!.workItems![0]!.status, "pending");
    assert.equal(recovered.itemOrchestration!.workItems![0]!.attempt, 2);
    assert.equal(recovered.itemOrchestration!.workItems![1]!.status, "completed");
    assert.equal(recovered.itemOrchestration!.workItems![2]!.durableState, "awaiting_result");
    assert.equal(recovered.profileLanePool!.lanes[0]!.state, "reconciliation_required");
    assert.deepEqual(recovered.profileLanePool!.lanes[0]!.reconciliationItemIds, ["c"]);
    assert.equal(recovered.profileLanePool!.lanes[1]!.state, "planned");

    const blocked = claimNextProfileLaneItem({
      store,
      jobId: job.id,
      laneId: "lane-a",
      invocationId: "session-after-restart",
      expiresAt: new Date(120_000).toISOString(),
    });
    assert.deepEqual(blocked?.value, []);

    const reconciled = reconcileProfileLaneItemForRetry({
      store,
      jobId: job.id,
      laneId: "lane-a",
      itemId: "c",
      reasonCode: "EFFECT_NOT_FOUND",
    })!;
    assert.equal(reconciled.job.profileLanePool!.lanes[0]!.state, "planned");
    assert.equal(reconciled.job.itemOrchestration!.workItems![2]!.status, "pending");
    assert.equal(reconciled.job.itemOrchestration!.workItems![2]!.attempt, 2);
  } finally {
    database.close();
  }
});
