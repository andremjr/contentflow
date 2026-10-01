import assert from "node:assert/strict";
import test from "node:test";
import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginCapability, PluginExecutionRequest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import {
  appendOrchestratedOutput,
  blockExecutionItemsForJob,
  canFinalizeFromDurableOrchestratedItems,
  completeCurrentOrchestratedItem,
  belongsToSameItemActionGroup,
  declaredItemOrchestration,
  failCurrentOrchestratedItem,
  invocationRequestForJob,
  itemProgressForJob,
  itemActionRequestForJob,
  legacyItemOrchestration,
  resumedItemOrchestration,
  resumedItemOrchestrationFromItems,
  selectedItemOrchestrationFromItems,
  startCurrentOrchestratedItem,
} from "./plugin-item-orchestration";

const request = {
  executionId: "execution",
  traceId: "trace",
  blockId: "block",
  capabilityId: "images",
  attempt: 1,
  invocation: { mode: "start" },
  configuration: { accountProfile: "primary" },
  settings: {},
  inputs: { prompts: ["one", "two", "three"] },
  inputContract: [],
  outputContract: [],
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
    project: { id: "project", title: "Projeto" },
    processType: "assets",
    block: { type: "CRIAR", name: "Imagens", instructions: "" },
    previousProcessOutputs: [],
    previousBlockOutputs: [],
  },
} satisfies PluginExecutionRequest;

const capability = {
  execution: {
    mode: "immediate",
    itemOrchestration: { inputPort: "prompts", outputPort: "images", mode: "sequential" },
  },
} as PluginCapability;

test("expande uma lista em chamadas atômicas com ID e posição", () => {
  const itemOrchestration = declaredItemOrchestration(capability, request);
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration,
    profileFallback: {
      configurationKey: "accountProfile",
      candidates: ["primary", "backup"],
      activeIndex: 1,
      history: [],
    },
  });
  job.itemOrchestration!.currentIndex = 1;
  const invocation = invocationRequestForJob(job, { mode: "start" });
  assert.equal(invocation.inputs.prompts, "two");
  assert.equal(invocation.configuration.accountProfile, "backup");
  assert.deepEqual(invocation.batch, {
    itemId: job.itemOrchestration!.itemIds[1],
    index: 1,
    total: 3,
  });
});

test("resposta terminal pode consolidar unidades já publicadas sem repetir output agregado", () => {
  const itemOrchestration = declaredItemOrchestration(capability, request)!;
  let job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration,
  });
  for (const output of ["image-one", "image-two", "image-three"]) {
    job = completeCurrentOrchestratedItem(job, output);
    const orchestration = job.itemOrchestration;
    assert.ok(orchestration);
    const workItems = orchestration.workItems;
    assert.ok(workItems);
    const next = workItems.findIndex((item) => item.status !== "completed");
    if (next >= 0) orchestration.currentIndex = next;
  }

  assert.equal(canFinalizeFromDurableOrchestratedItems(job, undefined), true);
  assert.equal(canFinalizeFromDurableOrchestratedItems(job, "duplicate"), false);
});

test("usa uma associação estrutural declarada quando a coleção principal está ausente", () => {
  const associatedCapability = {
    ...capability,
    execution: {
      ...capability.execution,
      itemOrchestration: {
        ...capability.execution.itemOrchestration!,
        collectionAssociations: [
          {
            key: "prompt-records",
            inputPort: "prompt_records",
            outputPort: "images",
          },
        ],
      },
    },
  } satisfies PluginCapability;
  const associatedRequest = {
    ...request,
    inputs: {
      prompt_records: [{ visual_prompt: "Ana em plano médio" }, { visual_prompt: "Beto em close" }],
    },
  } satisfies PluginExecutionRequest;

  const orchestration = declaredItemOrchestration(associatedCapability, associatedRequest);
  assert.equal(orchestration?.inputPort, "prompt_records");
  assert.equal(orchestration?.outputPort, "images");
  assert.equal(orchestration?.workItems?.length, 2);
});

test("preserva a associação estrutural quando ela contém um único item", () => {
  const associatedCapability = {
    ...capability,
    execution: {
      ...capability.execution,
      itemOrchestration: {
        ...capability.execution.itemOrchestration!,
        collectionAssociations: [
          {
            key: "prompt-records",
            inputPort: "prompt_records",
            outputPort: "images",
          },
        ],
      },
    },
  } satisfies PluginCapability;
  const associatedRequest = {
    ...request,
    inputs: {
      prompt_records: [{ visual_prompt: "Ana em plano médio" }],
    },
  } satisfies PluginExecutionRequest;

  const orchestration = declaredItemOrchestration(associatedCapability, associatedRequest);
  assert.equal(orchestration?.inputPort, "prompt_records");
  assert.equal(orchestration?.workItems?.length, 1);
});

test("materializa itens operacionais com identidade e linhagem persistentes", () => {
  const requestWithDelivery = {
    ...request,
    inputDeliveries: [
      {
        inputId: "prompts",
        portKey: "prompts",
        deliveryId: "delivery-1",
        itemIds: ["source-1", "source-2", "source-3"],
      },
    ],
  } satisfies PluginExecutionRequest;
  const orchestration = declaredItemOrchestration(capability, requestWithDelivery)!;
  const originalIds = orchestration.workItems!.map((item) => item.id);
  assert.deepEqual(
    orchestration.workItems!.map((item) => item.sourceItemId),
    ["source-1", "source-2", "source-3"],
  );

  let job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request: requestWithDelivery,
    timeoutMs: 60_000,
    itemOrchestration: orchestration,
  });
  job = startCurrentOrchestratedItem(job);
  job = completeCurrentOrchestratedItem(job, "image-a");
  job.itemOrchestration!.currentIndex = 1;
  job = startCurrentOrchestratedItem(job);
  job = failCurrentOrchestratedItem(job, "falhou");

  assert.deepEqual(
    blockExecutionItemsForJob(job)?.map((item) => item.status),
    ["completed", "failed", "pending"],
  );
  assert.equal(job.itemOrchestration!.workItems![0].output, "image-a");
  assert.equal(job.itemOrchestration!.workItems![1].attempts[0].error, "falhou");

  const resumed = resumedItemOrchestration(
    capability,
    { ...requestWithDelivery, attempt: 2 },
    job,
  )!;
  assert.deepEqual(
    resumed.workItems!.map((item) => item.id),
    originalIds,
  );
  assert.deepEqual(
    resumed.workItems!.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
  assert.equal(resumed.workItems![1].attempt, 2);
});

test("progresso do lote não é substituído por variantes incrementais", () => {
  const orchestration = declaredItemOrchestration(capability, request)!;
  let job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: orchestration,
  });
  job = startCurrentOrchestratedItem(job);
  job = completeCurrentOrchestratedItem(job, ["image-a"]);
  job.incrementalItems = [
    {
      id: "variant-a",
      order: 0,
      input: "one",
      output: "image-a",
      status: "completed",
      attempt: 1,
      attempts: [],
      pluginCorrelation: { key: "variant-a", outputPort: "images", outputKey: "images" },
    },
  ];

  assert.deepEqual(itemProgressForJob(job), {
    total: 3,
    completed: 1,
    pending: 2,
    currentIndex: 0,
    failedIndex: undefined,
  });
});

test("remove unidades obsoletas de tentativas antigas sem perder unidades retomadas pelo job", () => {
  const itemOrchestration = declaredItemOrchestration(capability, request)!;
  const resumedItem = itemOrchestration.workItems![0] as BlockExecutionItem;
  resumedItem.attempt = 1;
  resumedItem.status = "completed";
  resumedItem.output = "image-a";
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request: { ...request, attempt: 2 },
    timeoutMs: 60_000,
    itemOrchestration,
  });
  const currentItems = [
    {
      id: "obsolete-input",
      kind: "list_item" as const,
      order: 0,
      input: "old",
      status: "pending" as const,
      attempt: 1,
      attempts: [],
      provenance: { origin: "block_input" as const, inputPort: "old-port" },
    },
    {
      id: "current-input",
      kind: "scalar" as const,
      order: 0,
      input: "current",
      status: "pending" as const,
      attempt: 2,
      attempts: [],
      provenance: { origin: "block_input" as const, inputPort: "context" },
    },
  ];

  const items = blockExecutionItemsForJob(job, currentItems)!;

  assert.equal(
    items.some((item) => item.id === "obsolete-input"),
    false,
  );
  assert.equal(
    items.some((item) => item.id === "current-input"),
    true,
  );
  assert.equal(
    items.some((item) => item.id === itemOrchestration.workItems![0].id),
    true,
  );
});

test("acumula outputs parciais sem repetir itens anteriores", () => {
  const first = appendOrchestratedOutput({}, { images: ["image-a"] }, "images");
  const second = appendOrchestratedOutput(first, { images: ["image-b"] }, "images");
  assert.deepEqual(second.images, ["image-a", "image-b"]);
});

test("retoma um lote a partir do primeiro item ainda não concluído", () => {
  const previous = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: declaredItemOrchestration(capability, request),
  });
  previous.status = "failed";
  previous.itemOrchestration!.currentIndex = 2;
  previous.itemOrchestration!.accumulatedItems = ["image-a", "image-b"];

  assert.deepEqual(itemProgressForJob(previous), {
    total: 3,
    completed: 2,
    pending: 1,
    currentIndex: 2,
    failedIndex: 2,
  });

  const resumed = resumedItemOrchestration(capability, { ...request, attempt: 2 }, previous);
  assert.equal(resumed?.currentIndex, 2);
  assert.deepEqual(resumed?.accumulatedItems, ["image-a", "image-b"]);
  assert.deepEqual(resumed?.itemIds, previous.itemOrchestration!.itemIds);
});

test("não retoma o cursor quando a entrada do lote mudou", () => {
  const previous = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: declaredItemOrchestration(capability, request),
  });
  previous.status = "failed";
  previous.itemOrchestration!.currentIndex = 1;
  const changed = {
    ...request,
    attempt: 2,
    inputs: { prompts: ["one", "changed", "three"] },
  } satisfies PluginExecutionRequest;
  assert.equal(resumedItemOrchestration(capability, changed, previous), undefined);
});

test("reconstrói itens de uma execução legada e permite regenerar somente um deles", () => {
  const legacy = legacyItemOrchestration(capability, request, ["image-a", "image-b", "image-c"]);
  assert.equal(legacy?.workItems?.length, 3);
  assert.deepEqual(
    legacy?.workItems?.map((item) => item.status),
    ["completed", "completed", "completed"],
  );

  const selected = selectedItemOrchestrationFromItems(
    capability,
    { ...request, attempt: 2 },
    legacy?.workItems,
    legacy!.workItems![1].id,
  );
  assert.equal(selected?.currentIndex, 1);
  assert.deepEqual(
    selected?.workItems?.map((item) => item.status),
    ["completed", "pending", "completed"],
  );
  assert.equal(selected?.workItems?.[1].attempt, 2);
  assert.deepEqual(selected?.accumulatedItems, ["image-a", "image-c"]);
});

test("retoma itens pendentes usando somente o estado persistido da execução", () => {
  const legacy = legacyItemOrchestration(capability, request, ["image-a"]);
  const resumed = resumedItemOrchestrationFromItems(
    capability,
    { ...request, attempt: 2 },
    legacy?.workItems,
  );
  assert.equal(resumed?.currentIndex, 1);
  assert.deepEqual(
    resumed?.workItems?.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
  assert.deepEqual(resumed?.accumulatedItems, ["image-a"]);
});

test("mantém fallback legado quando o snapshot ainda não possui estado durável por item", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: declaredItemOrchestration(capability, request),
  });
  job.status = "completed";
  job.itemOrchestration!.currentIndex = 2;
  assert.deepEqual(itemProgressForJob(job), {
    total: 3,
    completed: 3,
    pending: 0,
    currentIndex: undefined,
    failedIndex: undefined,
  });
});

test("reconstrói uma saída textual a partir dos itens acumulados", () => {
  const first = appendOrchestratedOutput({}, { parts: ["primeira"] }, "parts", "result", "\n\n");
  const second = appendOrchestratedOutput(first, { parts: ["segunda"] }, "parts", "result", "\n\n");
  assert.deepEqual(second.parts, ["primeira", "segunda"]);
  assert.equal(second.result, "primeira\n\nsegunda");
});

test("incrementa a tentativa lógica ao repetir um job", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
  });
  job.retryCount = 2;
  assert.equal(invocationRequestForJob(job, { mode: "start" }).attempt, 3);
});

test("troca continuação por contexto quando o fallback muda de perfil", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request: {
      ...request,
      conversation: {
        mode: "reuse",
        id: "https://provider.test/chat/1",
        sourceProfile: "primary",
        fallbackContext: "Resultado anterior",
        continuationMessage: "Ajuste somente o contraste.",
      },
    },
    timeoutMs: 60_000,
    profileFallback: {
      configurationKey: "accountProfile",
      candidates: ["primary", "backup"],
      activeIndex: 1,
      history: [],
    },
  });
  assert.deepEqual(invocationRequestForJob(job, { mode: "start" }).conversation, {
    mode: "new",
    fallbackContext: "Resultado anterior",
    continuationMessage: "Ajuste somente o contraste.",
  });
});

test("regenera uma única variante por item_action, preservando o lote, a posição e a tentativa", () => {
  const job = createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: declaredItemOrchestration(capability, request),
  });
  const batchItem = job.itemOrchestration!.workItems![1]!;
  const variant = {
    id: "core-variant-b",
    order: 3,
    input: "two",
    output: "image-b",
    status: "completed" as const,
    attempt: 1,
    attempts: [],
    pluginCorrelation: {
      key: "provider-generation",
      variantKey: "candidate-b",
      batchItemId: batchItem.id,
      outputPort: "images",
      outputKey: "images",
    },
  };
  const action = itemActionRequestForJob({
    job,
    item: variant,
    outputPort: "images",
    attempt: 2,
    traceId: "action-trace",
  });

  assert.deepEqual(action.invocation, {
    mode: "item_action",
    action: "regenerate",
    itemId: "core-variant-b",
    outputPort: "images",
  });
  assert.deepEqual(action.batch, { itemId: batchItem.id, index: 1, total: 3 });
  assert.deepEqual(action.itemAction, {
    key: "provider-generation",
    variantKey: "candidate-b",
    input: "two",
    output: "image-b",
    attempt: 2,
  });
  assert.equal(action.attempt, 2);
});

test("seleção local não desloca variantes de outro item de lote", () => {
  const first = {
    id: "variant-a1",
    order: 0,
    input: "cidade",
    status: "completed" as const,
    attempt: 1,
    attempts: [],
    pluginCorrelation: {
      key: "provider",
      variantKey: "a",
      batchItemId: "batch-city",
      outputPort: "images",
      outputKey: "images",
    },
  };
  const sibling = {
    ...first,
    id: "variant-b1",
    pluginCorrelation: { ...first.pluginCorrelation, variantKey: "b" },
  };
  const otherBatch = {
    ...first,
    id: "variant-a2",
    pluginCorrelation: { ...first.pluginCorrelation, batchItemId: "batch-forest" },
  };

  assert.equal(belongsToSameItemActionGroup(first, sibling), true);
  assert.equal(belongsToSameItemActionGroup(first, otherBatch), false);
});
