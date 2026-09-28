import assert from "node:assert/strict";
import test from "node:test";
import type { PluginCapability } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";
import {
  materializeProfileLanePool,
  runProfileLanePool,
  supportsProfileLanePool,
} from "./profile-lane-pool";

function capability(
  input: {
    maxProfiles?: number;
    maxConcurrency?: number;
    supported?: boolean;
    preferred?: "continuous_session" | "per_item";
  } = {},
): PluginCapability {
  return {
    id: "generate",
    label: "Generate",
    blockTypes: ["CRIAR"],
    processTypes: ["ASSETS_VISUAIS"],
    inputPorts: [{ key: "prompts", dataType: "text", cardinality: "many", required: true }],
    outputPorts: [{ key: "images", dataType: "image", cardinality: "many", required: true }],
    execution: {
      mode: "immediate",
      maxConcurrency: input.maxConcurrency,
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential",
        strategies: ["continuous_session", "per_item"],
        preferredStrategy: input.preferred ?? "continuous_session",
        profileParallelism: {
          supported: input.supported ?? true,
          maxProfiles: input.maxProfiles,
        },
      },
    },
  } as unknown as PluginCapability;
}

function job(): PersistentPluginJob {
  const items = Array.from({ length: 7 }, (_, index) => ({
    id: `item-${index + 1}`,
    order: index,
    sourceItemId: `source-${index + 1}`,
    input: `prompt-${index + 1}`,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  return {
    id: "job-101",
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: "execution-1",
    blockId: "block-1",
    attempt: 1,
    traceId: "trace-1",
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
      items: items.map((item) => item.input),
      itemIds: items.map((item) => item.id),
      workItems: items,
      currentIndex: 0,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test("10.1 materializa uma lane por perfil dentro dos três limites", () => {
  const current = job();
  const pool = materializeProfileLanePool(
    current,
    capability({ maxProfiles: 3, maxConcurrency: 2 }),
  );
  assert.equal(pool?.maxParallel, 2);
  assert.deepEqual(
    pool?.lanes.map((lane) => lane.profileId),
    ["p1", "p2"],
  );
  assert.deepEqual(
    pool?.lanes.map((lane) => lane.itemIds),
    [
      ["item-1", "item-3", "item-5", "item-7"],
      ["item-2", "item-4", "item-6"],
    ],
  );
});

test("10.1 não cria pool sem opt-in simultâneo da política e capability", () => {
  const current = job();
  current.profileExecution = { ...current.profileExecution!, mode: "fallback" };
  assert.equal(supportsProfileLanePool(current, capability()), false);
  current.profileExecution = { ...current.profileExecution!, mode: "parallel" };
  assert.equal(supportsProfileLanePool(current, capability({ supported: false })), false);
  assert.equal(supportsProfileLanePool(current, capability({ preferred: "per_item" })), false);
});

test("10.1 mantém partição persistível, determinística e sem duplicar unidades", () => {
  const current = job();
  current.itemOrchestration!.workItems![2]!.status = "completed";
  const pool = materializeProfileLanePool(current, capability({ maxProfiles: 3 }));
  const assigned = pool!.lanes.flatMap((lane) => lane.itemIds);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.equal(assigned.includes("item-3"), false);
  assert.deepEqual(materializeProfileLanePool(current, capability({ maxProfiles: 3 })), pool);
});

test("10.1 adquire um lease e abre exatamente uma invocação contínua por lane ativa", async () => {
  const pool = materializeProfileLanePool(job(), capability({ maxProfiles: 3 }))!;
  const acquired: string[] = [];
  const invoked: string[] = [];
  const released: string[] = [];
  const result = await runProfileLanePool({
    pool,
    acquireLease: async (lane) => {
      acquired.push(lane.laneId);
      return {
        laneId: lane.laneId,
        profileId: lane.profileId,
        release: async () => {
          released.push(lane.laneId);
        },
      };
    },
    invokeContinuousLane: async (lane) => {
      invoked.push(lane.laneId);
      return lane.itemIds.length;
    },
  });
  assert.deepEqual(
    acquired,
    pool.lanes.map((lane) => lane.laneId),
  );
  assert.deepEqual(invoked.sort(), pool.lanes.map((lane) => lane.laneId).sort());
  assert.deepEqual(released.sort(), pool.lanes.map((lane) => lane.laneId).sort());
  assert.ok(result.pool.lanes.every((lane) => lane.state === "completed"));
});
