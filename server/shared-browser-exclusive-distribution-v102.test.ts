import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { PluginCapability } from "../src/lib/plugin-contract";
import { PluginJobStore, type PersistentPluginJob } from "./plugin-job-store";
import { consolidatedOrchestratedOutputs } from "./plugin-item-orchestration";
import { materializeProfileLanePool } from "./profile-lane-pool";
import { claimNextProfileLaneItem, commitProfileLaneItemUpdate } from "./profile-lane-distribution";

function capability(): PluginCapability {
  return {
    id: "generate",
    label: "Generate",
    blockTypes: ["CRIAR"],
    processTypes: ["ASSETS_VISUAIS"],
    inputPorts: [{ key: "prompts", dataType: "text", cardinality: "many", required: true }],
    outputPorts: [{ key: "images", dataType: "image", cardinality: "many", required: true }],
    execution: {
      mode: "immediate",
      maxConcurrency: 3,
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential",
        strategies: ["continuous_session"],
        preferredStrategy: "continuous_session",
        profileParallelism: { supported: true, maxProfiles: 3 },
      },
    },
  } as unknown as PluginCapability;
}

function job(): PersistentPluginJob {
  const workItems = Array.from({ length: 6 }, (_, order) => ({
    id: `item-${order + 1}`,
    order,
    input: `prompt-${order + 1}`,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  const base: PersistentPluginJob = {
    id: "job-102",
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: "execution-102",
    blockId: "block-102",
    attempt: 1,
    traceId: "trace-102",
    request: {} as PersistentPluginJob["request"],
    status: "starting",
    nextPollAt: new Date(0).toISOString(),
    deadlineAt: new Date(60_000).toISOString(),
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    profileExecution: {
      mode: "parallel",
      profileIds: ["p1", "p2", "p3"],
      maxParallel: 3,
      configurationKey: "profile",
      profiles: [
        { profileId: "p1", alias: "A" },
        { profileId: "p2", alias: "B" },
        { profileId: "p3", alias: "C" },
      ],
    },
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: workItems.map((item) => item.input),
      itemIds: workItems.map((item) => item.id),
      workItems,
      currentIndex: 0,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  return { ...base, profileLanePool: materializeProfileLanePool(base, capability()) };
}

function fixture() {
  const database = new Database(":memory:");
  const store = new PluginJobStore(database);
  store.create(job());
  return { database, store };
}

test("10.2 serializa pending -> leased e impede duas lanes de receberem a mesma unidade", () => {
  const { database, store } = fixture();
  try {
    const expiresAt = new Date(60_000).toISOString();
    const [lane1, lane2] = job().profileLanePool!.lanes;
    const first = claimNextProfileLaneItem({
      store,
      jobId: "job-102",
      laneId: lane1.laneId,
      invocationId: "invocation-a",
      expiresAt,
      now: new Date(1_000).toISOString(),
    })!;
    const second = claimNextProfileLaneItem({
      store,
      jobId: "job-102",
      laneId: lane2.laneId,
      invocationId: "invocation-b",
      expiresAt,
      now: new Date(1_000).toISOString(),
    })!;
    assert.equal(first.value.length, 1);
    assert.equal(first.value[0].state, "leased");
    assert.equal(second.value.length, 1);
    assert.notEqual(first.value[0].itemId, second.value[0].itemId);
    assert.equal(
      new Set(store.get("job-102")!.itemOrchestration!.claims!.map((claim) => claim.itemId)).size,
      2,
    );
  } finally {
    database.close();
  }
});

test("10.2 uma lane só avança depois do commit terminal do item anterior", () => {
  const { database, store } = fixture();
  try {
    const lane = job().profileLanePool!.lanes[0];
    const common = {
      store,
      jobId: "job-102",
      laneId: lane.laneId,
      invocationId: "same-session",
      expiresAt: new Date(60_000).toISOString(),
    };
    const first = claimNextProfileLaneItem(common)!;
    assert.equal(first.value[0].itemId, lane.itemIds[0]);
    assert.deepEqual(claimNextProfileLaneItem(common)!.value, []);
    commitProfileLaneItemUpdate({
      store,
      jobId: "job-102",
      laneId: lane.laneId,
      invocationId: "same-session",
      update: {
        itemId: first.value[0].itemId,
        expectedRevision: 0,
        state: "completed",
        outputPort: "images",
        value: "output-1",
      },
    });
    const next = claimNextProfileLaneItem(common)!;
    assert.equal(next.value[0].itemId, lane.itemIds[1]);
  } finally {
    database.close();
  }
});

test("10.2 consolida a saída na ordem original mesmo com commits fora de ordem entre lanes", () => {
  const { database, store } = fixture();
  try {
    const lanes = job().profileLanePool!.lanes;
    const expiresAt = new Date(60_000).toISOString();
    const sessions = lanes.map((lane, index) => ({ lane, invocationId: `session-${index}` }));
    let remaining = 6;
    while (remaining > 0) {
      for (const { lane, invocationId } of [...sessions].reverse()) {
        const claimed = claimNextProfileLaneItem({
          store,
          jobId: "job-102",
          laneId: lane.laneId,
          invocationId,
          expiresAt,
        })?.value[0];
        if (!claimed) continue;
        commitProfileLaneItemUpdate({
          store,
          jobId: "job-102",
          laneId: lane.laneId,
          invocationId,
          update: {
            itemId: claimed.itemId,
            expectedRevision: claimed.revision,
            state: "completed",
            outputPort: "images",
            value: `out-${claimed.order + 1}`,
          },
        });
        remaining -= 1;
      }
    }
    const final = store.get("job-102")!;
    assert.deepEqual(consolidatedOrchestratedOutputs(final).outputs, [
      "out-1",
      "out-2",
      "out-3",
      "out-4",
      "out-5",
      "out-6",
    ]);
  } finally {
    database.close();
  }
});
