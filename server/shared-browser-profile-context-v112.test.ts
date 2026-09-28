import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PluginCapability } from "../src/lib/plugin-contract";
import { translate } from "../src/lib/app-preferences";
import type { PersistentPluginJob } from "./plugin-job-store";
import { materializeProfileLanePool, profileParallelEligibility } from "./profile-lane-pool";
import { resolveProfileExecutionSnapshot } from "./profile-execution-policy";

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
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential",
        strategies: ["continuous_session", "per_item"],
        preferredStrategy: "continuous_session",
        profileParallelism: { supported: true, maxProfiles: 3 },
      },
    },
  } as unknown as PluginCapability;
}

function job(): PersistentPluginJob {
  const workItems = ["a", "b", "c"].map((value, order) => ({
    id: `item-${order + 1}`,
    kind: "list_item" as const,
    order,
    input: value,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: 1,
    attempts: [],
  }));
  return {
    id: "job-112",
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId: "execution-112",
    blockId: "block-112",
    attempt: 1,
    traceId: "trace-112",
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
      profileIds: ["p1", "p2"],
      maxParallel: 2,
      configurationKey: "profile",
      profiles: [
        { profileId: "p1", alias: "A" },
        { profileId: "p2", alias: "B" },
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
}

test("11.2 exige coleção materializada e correlação incremental para parallel", () => {
  const valid = job();
  assert.deepEqual(profileParallelEligibility(valid, capability()), { eligible: true });

  const withoutItems = job();
  withoutItems.itemOrchestration!.workItems = [];
  assert.deepEqual(profileParallelEligibility(withoutItems, capability()), {
    eligible: false,
    reason: "COLLECTION_NOT_MATERIALIZED",
  });

  const aggregateOnly = job();
  aggregateOnly.itemOrchestration!.compatibility = {
    mode: "aggregate_completion",
    lateUpdates: false,
    realtimeUpdates: false,
    profileParallelism: false,
  };
  assert.deepEqual(profileParallelEligibility(aggregateOnly, capability()), {
    eligible: false,
    reason: "INCREMENTAL_CORRELATION_REQUIRED",
  });
});

test("11.2 mantém hierarquia dependente fora do pool paralelo", () => {
  const dependent = job();
  dependent.itemOrchestration!.workItems![1] = {
    ...dependent.itemOrchestration!.workItems![1]!,
    kind: "derived",
    parentItemId: dependent.itemOrchestration!.workItems![0]!.id,
  };
  assert.deepEqual(profileParallelEligibility(dependent, capability()), {
    eligible: false,
    reason: "ITEM_DEPENDENCY_REQUIRES_SEQUENTIAL",
  });
  assert.equal(materializeProfileLanePool(dependent, capability()), undefined);

  dependent.profileExecution = { ...dependent.profileExecution!, mode: "fallback" };
  assert.deepEqual(profileParallelEligibility(dependent, capability()), {
    eligible: false,
    reason: "PARALLEL_NOT_SELECTED",
  });
});

test("11.2 distingue perfil revogado de perfil não preparado", () => {
  assert.throws(
    () =>
      resolveProfileExecutionSnapshot({
        policy: { mode: "single", profileIds: ["revoked"] },
        configurationKey: "profile",
        resolveProfile: () => undefined,
      }),
    /não está mais vinculado/,
  );
  assert.throws(
    () =>
      resolveProfileExecutionSnapshot({
        policy: { mode: "single", profileIds: ["not-ready"] },
        configurationKey: "profile",
        resolveProfile: () => ({
          profileId: "not-ready",
          alias: "Conta",
          readinessState: "needs_login",
        }),
      }),
    /ainda não está preparado/,
  );
});

test("11.2 mostra readiness, ocupação e revogação no editor sem expor lease", () => {
  const builder = readFileSync(
    new URL("../src/components/method-builder.tsx", import.meta.url),
    "utf8",
  );
  const server = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(builder, /profile-inventory/);
  assert.match(builder, /readinessState/);
  assert.match(builder, /occupiedProfiles/);
  assert.match(builder, /profiles\.length \|\| revokedProfileIds\.length/);
  assert.match(builder, /foi desvinculado deste plugin/);
  assert.match(builder, /ainda não preparado para este plugin/);
  assert.match(builder, /ocupado por outra execução/);
  assert.match(
    server,
    /occupied: Boolean\(lease && Date\.parse\(lease\.expiresAt\) > Date\.now\(\)\)/,
  );
  assert.doesNotMatch(builder, /leaseToken/);
});

test("11.2 traduz as novas mensagens em inglês e espanhol", () => {
  const phrases = [
    "Não preparado",
    "Ocupado",
    "O modo simultâneo exige sessão contínua com correlação incremental compatível.",
    "O modo simultâneo só inicia quando a coleção estiver materializada em itens independentes pelo núcleo.",
    "Um perfil selecionado foi desvinculado deste plugin. Escolha outro perfil antes de executar.",
    "Há perfil selecionado ainda não preparado para este plugin. Prepare-o na Central de Plugins antes de executar.",
    "Há perfil selecionado ocupado por outra execução. Ele ficará indisponível até o lease atual ser liberado.",
  ];
  for (const phrase of phrases) {
    assert.notEqual(translate(phrase, "en"), phrase, `missing English translation: ${phrase}`);
    if (phrase !== "Ocupado") {
      assert.notEqual(translate(phrase, "es"), phrase, `missing Spanish translation: ${phrase}`);
    }
  }
  assert.equal(translate("Ocupado", "es"), "Ocupado");
});
