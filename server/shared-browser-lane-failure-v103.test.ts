import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { PersistentPluginJob } from "./plugin-job-store";
import { PluginJobStore } from "./plugin-job-store";
import {
  claimNextProfileLaneItem,
  failProfileLane,
  reconcileProfileLaneItemForRetry,
} from "./profile-lane-distribution";

function fixture() {
  const database = new Database(":memory:");
  const store = new PluginJobStore(database);
  const items = ["a", "b", "c", "d"].map((id, order) => ({
    id,
    order,
    input: id,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  const base: PersistentPluginJob = {
    id: "job-103",
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: "execution-103",
    blockId: "block-103",
    attempt: 1,
    traceId: "trace-103",
    request: {} as PersistentPluginJob["request"],
    status: "starting",
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
  store.create(base);
  return { database, store };
}

test("10.3 falha registra tentativa/perfil/estado e redistribui somente unidade não submetida", () => {
  const { database, store } = fixture();
  try {
    const current = store.get("job-103")!;
    current.itemOrchestration!.workItems![0] = {
      ...current.itemOrchestration!.workItems![0]!,
      status: "in_progress",
      durableState: "leased",
      attempts: [{ attempt: 1, status: "in_progress", input: "a" }],
    };
    current.itemOrchestration!.workItems![2] = {
      ...current.itemOrchestration!.workItems![2]!,
      status: "in_progress",
      durableState: "submitted",
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
    store.mutateActiveJobAtomically("job-103", () => ({ job: current, value: true }));

    const failed = failProfileLane({
      store,
      jobId: "job-103",
      laneId: "lane-a",
      invocationId: "session-a",
      reasonCode: "BROWSER_DISCONNECTED",
      now: new Date(1_000).toISOString(),
    })!;

    assert.deepEqual(failed.value.releasedItemIds, ["a"]);
    assert.deepEqual(failed.value.reconciliationItemIds, ["c"]);
    const laneA = failed.job.profileLanePool!.lanes[0]!;
    const laneB = failed.job.profileLanePool!.lanes[1]!;
    assert.equal(laneA.state, "failed");
    assert.equal(laneA.profileId, "p1");
    assert.equal(laneA.attempts?.at(-1)?.attempt, 1);
    assert.equal(laneA.attempts?.at(-1)?.state, "reconciliation_required");
    assert.deepEqual(laneA.itemIds, ["c"]);
    assert.ok(laneB.itemIds.includes("a"));
    assert.equal(failed.job.itemOrchestration!.workItems![0]!.status, "pending");
    assert.equal(failed.job.itemOrchestration!.workItems![0]!.attempt, 2);
    assert.equal(failed.job.itemOrchestration!.workItems![2]!.durableState, "submitted");
    assert.deepEqual(failed.job.itemOrchestration!.claims, []);
  } finally {
    database.close();
  }
});

test("10.3 item submetido só volta ao pool depois de reconciliação explícita", () => {
  const { database, store } = fixture();
  try {
    const current = store.get("job-103")!;
    current.itemOrchestration!.workItems![0] = {
      ...current.itemOrchestration!.workItems![0]!,
      status: "in_progress",
      durableState: "submitted",
      attempts: [{ attempt: 1, status: "in_progress", input: "a" }],
    };
    current.itemOrchestration!.claims = [
      {
        itemId: "a",
        invocationId: "session-a",
        profileId: "p1",
        claimedAt: new Date(0).toISOString(),
        expiresAt: new Date(60_000).toISOString(),
      },
    ];
    store.mutateActiveJobAtomically("job-103", () => ({ job: current, value: true }));

    const failed = failProfileLane({
      store,
      jobId: "job-103",
      laneId: "lane-a",
      invocationId: "session-a",
      reasonCode: "TIMEOUT_AFTER_SUBMIT",
    })!;
    assert.deepEqual(failed.value.releasedItemIds, ["c"]);
    assert.deepEqual(failed.value.reconciliationItemIds, ["a"]);
    assert.equal(failed.job.profileLanePool!.lanes[1]!.itemIds.includes("a"), false);

    const reconciled = reconcileProfileLaneItemForRetry({
      store,
      jobId: "job-103",
      laneId: "lane-a",
      itemId: "a",
      reasonCode: "EFFECT_NOT_FOUND",
    })!;
    assert.equal(reconciled.job.itemOrchestration!.workItems![0]!.status, "pending");
    assert.equal(reconciled.job.itemOrchestration!.workItems![0]!.attempt, 2);
    assert.equal(reconciled.job.profileLanePool!.lanes[1]!.itemIds.includes("a"), true);
    assert.deepEqual(reconciled.job.profileLanePool!.lanes[0]!.reconciliationItemIds, []);
    assert.equal(reconciled.job.profileLanePool!.lanes[0]!.attempts?.at(-1)?.state, "reconciled");
  } finally {
    database.close();
  }
});

test("10.3 lane falha deixa de conceder novos itens", () => {
  const { database, store } = fixture();
  try {
    failProfileLane({
      store,
      jobId: "job-103",
      laneId: "lane-a",
      invocationId: "session-a",
      reasonCode: "PROFILE_UNAVAILABLE",
    });
    const claimed = claimNextProfileLaneItem({
      store,
      jobId: "job-103",
      laneId: "lane-a",
      invocationId: "session-new",
      expiresAt: new Date(60_000).toISOString(),
    });
    assert.deepEqual(claimed?.value, []);
  } finally {
    database.close();
  }
});
