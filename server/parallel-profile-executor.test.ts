import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { PluginCapability, PluginExecutionResponse } from "../src/lib/plugin-contract";
import { BrowserProfileLeaseStore } from "./browser-profile-leases";
import { executeParallelProfileLanes } from "./parallel-profile-executor";
import { PluginJobStore, type PersistentPluginJob } from "./plugin-job-store";
import { materializeProfileLanePool, recoverProfileLanePool } from "./profile-lane-pool";
import type { RegisteredPlugin } from "./plugin-runner";

const aliases = ["A", "B", "C", "D"] as const;

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
      maxConcurrency: 4,
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential",
        strategies: ["continuous_session"],
        preferredStrategy: "continuous_session",
        profileParallelism: { supported: true, maxProfiles: 4 },
      },
    },
  } as unknown as PluginCapability;
}

function plugin(): RegisteredPlugin {
  return {
    id: "local.test.browser",
    source: "local",
    directory: "test",
    absoluteDirectory: "C:\\test",
    entrypoint: "handler.mjs",
    executable: true,
    manifest: {
      id: "local.test.browser",
      apiVersion: "1",
      version: "1.0.0",
      name: "Test browser",
      description: "Test",
      runtime: { type: "node", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      profileSetup: { configurationKey: "profile" },
      capabilities: [capability()],
    },
  } as unknown as RegisteredPlugin;
}

function job(total = 200): PersistentPluginJob {
  const workItems = Array.from({ length: total }, (_, order) => ({
    id: `item-${order + 1}`,
    order,
    input: `prompt-${order + 1}`,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  const base: PersistentPluginJob = {
    id: `job-parallel-${total}`,
    pluginId: "local.test.browser",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: `execution-${total}`,
    blockId: "block-assets",
    attempt: 1,
    traceId: `trace-${total}`,
    request: {
      executionId: `execution-${total}`,
      blockId: "block-assets",
      capabilityId: "generate",
      attempt: 1,
      traceId: `trace-${total}`,
      invocation: { mode: "start" },
      inputs: { prompts: workItems.map((item) => item.input) },
      configuration: {},
      settings: {},
      context: {
        locale: "pt-BR",
        timeZone: "America/Sao_Paulo",
        channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "Teste" },
        project: { id: "project", title: "Projeto" },
        processType: "assets",
        block: { type: "CRIAR", name: "Assets", instructions: "" },
      },
      inputContract: [],
      outputContract: [],
      inputDeliveries: [],
    } as PersistentPluginJob["request"],
    status: "starting",
    nextPollAt: new Date(0).toISOString(),
    deadlineAt: "2099-01-01T00:00:00.000Z",
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    profileExecution: {
      mode: "parallel",
      profileIds: aliases.map((_, index) => `p${index + 1}`),
      maxParallel: 4,
      configurationKey: "profile",
      profiles: aliases.map((alias, index) => ({ profileId: `p${index + 1}`, alias })),
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

function fixture(total = 200) {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      alias TEXT NOT NULL,
      storage_kind TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE browser_profile_leases (
      profile_id TEXT PRIMARY KEY,
      lease_token TEXT NOT NULL UNIQUE,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      plugin_id TEXT,
      acquired_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    `INSERT INTO browser_profiles
      (id, name, alias, storage_kind, storage_key, created_at, updated_at)
     VALUES (?, ?, ?, 'managed', ?, ?, ?)`,
  );
  aliases.forEach((alias, index) => {
    const now = new Date(0).toISOString();
    insert.run(`p${index + 1}`, `Perfil ${alias}`, alias, `profile-${alias}`, now, now);
  });
  const store = new PluginJobStore(database);
  const initial = job(total);
  store.create(initial);
  const leases = new BrowserProfileLeaseStore(database);
  return { database, store, leases, initial };
}

function dependencies(
  store: PluginJobStore,
  leases: BrowserProfileLeaseStore,
  executePlugin: Parameters<typeof executeParallelProfileLanes>[0]["dependencies"]["executePlugin"],
) {
  return {
    pluginJobs: store,
    browserProfileLeases: leases,
    resolveProfile: (_pluginId: string, profileId: string) => ({
      profile: { alias: aliases[Number(profileId.slice(1)) - 1]! },
      profileDirectory: `C:\\profiles\\${profileId}`,
    }),
    executePlugin,
    leaseTtlMs: 30_000,
    leaseHeartbeatMs: 10_000,
  };
}

test("executor integrado distribui 200 itens A,B,C,D e consolida na ordem original", async () => {
  const { database, store, leases, initial } = fixture();
  const ownerByItem = new Map<string, string>();
  const activeProfiles = new Set<string>();
  try {
    const result = await executeParallelProfileLanes({
      plugin: plugin(),
      capability: capability(),
      job: initial,
      timeoutMs: 60_000,
      secrets: {},
      dependencies: dependencies(
        store,
        leases,
        async (_plugin, request, _timeout, _secrets, options) => {
          const alias = String(request.configuration.profile);
          assert.equal(
            activeProfiles.has(alias),
            false,
            `perfil ${alias} recebeu uma segunda sessão física`,
          );
          activeProfiles.add(alias);
          try {
            while (true) {
              const claimed = (await options?.onClaimItems?.(1))?.[0];
              if (!claimed) break;
              ownerByItem.set(claimed.itemId, alias);
              await options?.onPublishItemUpdate?.(
                {
                  itemId: claimed.itemId,
                  expectedRevision: claimed.revision,
                  state: "completed",
                  outputPort: "images",
                  value: `out-${claimed.order + 1}`,
                },
                [],
              );
            }
            return { status: "success", values: {} } satisfies PluginExecutionResponse;
          } finally {
            activeProfiles.delete(alias);
          }
        },
      ),
    });

    assert.equal(result.response.status, "success");
    if (result.response.status !== "success") return;
    assert.deepEqual(
      result.response.values.images,
      Array.from({ length: 200 }, (_, index) => `out-${index + 1}`),
    );
    for (let index = 0; index < 200; index += 1) {
      assert.equal(ownerByItem.get(`item-${index + 1}`), aliases[index % 4]);
    }
    assert.equal(new Set(ownerByItem.keys()).size, 200);
    const leaseCountRow = database
      .prepare("SELECT COUNT(*) AS count FROM browser_profile_leases")
      .get() as { count: number };
    assert.equal(leaseCountRow.count, 0);
  } finally {
    database.close();
  }
});

test("falha segura em C redistribui somente itens não enviados para A/B/D", async () => {
  const { database, store, leases, initial } = fixture(20);
  const ownerByItem = new Map<string, string>();
  let failedC = false;
  try {
    const result = await executeParallelProfileLanes({
      plugin: plugin(),
      capability: capability(),
      job: initial,
      timeoutMs: 60_000,
      secrets: {},
      dependencies: dependencies(
        store,
        leases,
        async (_plugin, request, _timeout, _secrets, options) => {
          const alias = String(request.configuration.profile);
          if (alias === "C" && !failedC) {
            failedC = true;
            return {
              status: "error",
              code: "BROWSER_DISCONNECTED",
              message: "falha antes do envio",
              retryable: true,
            };
          }
          while (true) {
            const claimed = (await options?.onClaimItems?.(1))?.[0];
            if (!claimed) break;
            ownerByItem.set(claimed.itemId, alias);
            await options?.onPublishItemUpdate?.(
              {
                itemId: claimed.itemId,
                expectedRevision: claimed.revision,
                state: "completed",
                outputPort: "images",
                value: `out-${claimed.order + 1}`,
              },
              [],
            );
          }
          return { status: "success", values: {} };
        },
      ),
    });

    assert.equal(result.response.status, "success");
    for (const itemId of initial.profileLanePool!.lanes[2]!.itemIds) {
      assert.ok(["A", "B", "D"].includes(ownerByItem.get(itemId) as "A" | "B" | "D"));
    }
    assert.equal(ownerByItem.size, 20);
  } finally {
    database.close();
  }
});

test("falha depois de envio em C exige reconciliação e não repete o item incerto", async () => {
  const { database, store, leases, initial } = fixture(12);
  let submittedItemId: string | undefined;
  try {
    const result = await executeParallelProfileLanes({
      plugin: plugin(),
      capability: capability(),
      job: initial,
      timeoutMs: 60_000,
      secrets: {},
      dependencies: dependencies(
        store,
        leases,
        async (_plugin, request, _timeout, _secrets, options) => {
          const alias = String(request.configuration.profile);
          if (alias === "C") {
            const claimed = (await options?.onClaimItems?.(1))?.[0];
            assert.ok(claimed);
            submittedItemId = claimed.itemId;
            await options?.onPublishItemUpdate?.(
              {
                itemId: claimed.itemId,
                expectedRevision: claimed.revision,
                state: "submitted",
                externalReceipt: "external-receipt-c",
              },
              [],
            );
            return {
              status: "error",
              code: "BROWSER_DISCONNECTED",
              message: "conexão perdida após envio",
              retryable: true,
            };
          }
          while (true) {
            const claimed = (await options?.onClaimItems?.(1))?.[0];
            if (!claimed) break;
            await options?.onPublishItemUpdate?.(
              {
                itemId: claimed.itemId,
                expectedRevision: claimed.revision,
                state: "completed",
                outputPort: "images",
                value: `out-${claimed.order + 1}`,
              },
              [],
            );
          }
          return { status: "success", values: {} };
        },
      ),
    });

    assert.equal(result.response.status, "error");
    if (result.response.status !== "error") return;
    assert.equal(result.response.code, "RECONCILIATION_REQUIRED");
    assert.ok(submittedItemId);
    const persisted = store.get(initial.id)!;
    const laneC = persisted.profileLanePool!.lanes.find((lane) => lane.alias === "C")!;
    assert.deepEqual(laneC.reconciliationItemIds, [submittedItemId]);
    assert.equal(
      persisted.itemOrchestration!.workItems!.find((item) => item.id === submittedItemId)!
        .durableState,
      "submitted",
    );
    assert.equal(
      persisted.itemOrchestration!.workItems!.find((item) => item.id === submittedItemId)!
        .externalReceipt,
      "external-receipt-c",
    );
  } finally {
    database.close();
  }
});

test("reinício recupera claim seguro persistido e o executor conclui a partir do snapshot", async () => {
  const { database, store, leases, initial } = fixture(8);
  try {
    const laneA = initial.profileLanePool!.lanes[0]!;
    const claimed = store.mutateActiveJobAtomically(initial.id, (current) => {
      const item = current.itemOrchestration!.workItems![0]!;
      return {
        job: {
          ...current,
          itemOrchestration: {
            ...current.itemOrchestration!,
            workItems: current.itemOrchestration!.workItems!.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, status: "in_progress" as const, durableState: "leased" as const }
                : candidate,
            ),
            claims: [
              {
                itemId: item.id,
                invocationId: "crashed-invocation",
                profileId: laneA.profileId,
                claimedAt: "2026-09-27T21:59:00-03:00",
                expiresAt: initial.deadlineAt,
              },
            ],
          },
          profileLanePool: {
            ...current.profileLanePool!,
            lanes: current.profileLanePool!.lanes.map((lane) =>
              lane.laneId === laneA.laneId ? { ...lane, state: "running" as const } : lane,
            ),
          },
        },
        value: item.id,
      };
    })!;
    assert.ok(claimed.value);
    const recovered = recoverProfileLanePool(
      store.get(initial.id)!,
      new Date("2026-09-27T22:00:00-03:00"),
    );
    store.mutateActiveJobAtomically(initial.id, () => ({ job: recovered, value: true }));

    const result = await executeParallelProfileLanes({
      plugin: plugin(),
      capability: capability(),
      job: recovered,
      timeoutMs: 60_000,
      secrets: {},
      dependencies: dependencies(
        store,
        leases,
        async (_plugin, _request, _timeout, _secrets, options) => {
          while (true) {
            const next = (await options?.onClaimItems?.(1))?.[0];
            if (!next) break;
            await options?.onPublishItemUpdate?.(
              {
                itemId: next.itemId,
                expectedRevision: next.revision,
                state: "completed",
                outputPort: "images",
                value: `out-${next.order + 1}`,
              },
              [],
            );
          }
          return { status: "success", values: {} };
        },
      ),
    });
    assert.equal(result.response.status, "success");
    assert.equal(store.get(initial.id)!.itemOrchestration!.claims?.length ?? 0, 0);
    assert.ok(
      store
        .get(initial.id)!
        .itemOrchestration!.workItems!.every((item) => item.status === "completed"),
    );
  } finally {
    database.close();
  }
});
