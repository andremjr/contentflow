import assert from "node:assert/strict";
import test from "node:test";
import type { StoredFile } from "../src/lib/domain";
import type { PluginCapability, PluginExecutionRequest } from "../src/lib/plugin-contract";
import { declaredItemOrchestration, workItemPolicy } from "./plugin-item-orchestration";
import { materializeReceivedInputWorkUnits } from "./work-unit-materialization";

const baseRequest = {
  executionId: "execution-v82",
  traceId: "trace-v82",
  blockId: "block-v82",
  capabilityId: "capability-v82",
  attempt: 1,
  invocation: { mode: "start" },
  configuration: {},
  settings: {},
  inputs: {},
  inputContract: [],
  outputContract: [],
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel", name: "", language: "", niche: "" },
    project: { id: "project", title: "" },
    processType: "assets",
    block: { type: "CRIAR", name: "Teste", instructions: "" },
    previousProcessOutputs: [],
    previousBlockOutputs: [],
  },
} satisfies PluginExecutionRequest;

test("a porta declarada define 16 unidades; duas imagens e texto permanecem contexto", () => {
  const request = {
    ...baseRequest,
    inputs: {
      prompts: Array.from({ length: 16 }, (_, index) => `scene ${index}`),
      references: ["reference A", "reference B"],
      context: "project context",
    },
  } satisfies PluginExecutionRequest;
  const capability = {
    execution: {
      itemOrchestration: { mode: "sequential", inputPort: "prompts", outputPort: "images" },
    },
  } as PluginCapability;
  const previous = materializeReceivedInputWorkUnits(request, undefined);
  assert.equal(previous.length, 19);
  const items = materializeReceivedInputWorkUnits(
    request,
    previous,
    workItemPolicy(capability, request)?.inputPort,
  );
  assert.equal(items.length, 16);
  assert.deepEqual(
    items.map((item) => item.order),
    Array.from({ length: 16 }, (_, index) => index),
  );
  assert.deepEqual(
    items.map((item) => item.id),
    previous.slice(0, 16).map((item) => item.id),
  );
  assert.equal(request.inputs.references.length, 2);
  assert.equal(request.inputs.context, "project context");
});

test("materializa escalar como uma unidade e lista como uma unidade por elemento", () => {
  const request = {
    ...baseRequest,
    inputs: {
      prompt: "texto único",
      records: [
        { id: "a", value: "A" },
        { id: "b", value: "B" },
      ],
    },
  } satisfies PluginExecutionRequest;

  const items = materializeReceivedInputWorkUnits(request, undefined);
  const promptItems = items.filter((item) => item.provenance?.inputPort === "prompt");
  const recordItems = items.filter((item) => item.provenance?.inputPort === "records");

  assert.equal(promptItems.length, 1);
  assert.equal(promptItems[0].kind, "scalar");
  assert.equal(promptItems[0].order, 0);
  assert.equal(recordItems.length, 2);
  assert.deepEqual(
    recordItems.map((item) => item.kind),
    ["list_item", "list_item"],
  );
  assert.deepEqual(
    recordItems.map((item) => item.order),
    [0, 1],
  );
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
});

test("preserva sourceItemId para arquivos e mantém identidade mesmo quando a ordem muda", () => {
  const firstFile = {
    id: "stored-a",
    name: "a.png",
    mimeType: "image/png",
    size: 10,
    url: "/api/files/stored-a",
  } as StoredFile;
  const secondFile = {
    id: "stored-b",
    name: "b.png",
    mimeType: "image/png",
    size: 20,
    url: "/api/files/stored-b",
  } as StoredFile;
  const firstRequest = {
    ...baseRequest,
    inputs: { media: [firstFile, secondFile] },
    inputDeliveries: [
      {
        inputId: "media-input",
        portKey: "media",
        deliveryId: "delivery-media",
        itemIds: ["source-a", "source-b"],
      },
    ],
  } satisfies PluginExecutionRequest;
  const first = materializeReceivedInputWorkUnits(firstRequest, undefined);
  assert.deepEqual(
    first.map((item) => item.sourceItemId),
    ["source-a", "source-b"],
  );

  const reorderedRequest = {
    ...firstRequest,
    attempt: 2,
    inputs: { media: [secondFile, firstFile] },
    inputDeliveries: [
      {
        inputId: "media-input",
        portKey: "media",
        deliveryId: "delivery-media",
        itemIds: ["source-b", "source-a"],
      },
    ],
  } satisfies PluginExecutionRequest;
  const reordered = materializeReceivedInputWorkUnits(reorderedRequest, first);
  const idBySource = new Map(first.map((item) => [item.sourceItemId, item.id]));

  assert.equal(reordered[0].id, idBySource.get("source-b"));
  assert.equal(reordered[1].id, idBySource.get("source-a"));
  assert.deepEqual(
    reordered.map((item) => item.order),
    [0, 1],
  );
});

test("item orchestration reutiliza os IDs já materializados pelo núcleo", () => {
  const request = {
    ...baseRequest,
    inputs: { prompts: ["um", "dois"] },
    inputDeliveries: [
      {
        inputId: "prompts-input",
        portKey: "prompts",
        deliveryId: "delivery-prompts",
        itemIds: ["source-1", "source-2"],
      },
    ],
  } satisfies PluginExecutionRequest;
  const capability = {
    execution: {
      mode: "immediate",
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential",
      },
    },
  } as PluginCapability;
  const materialized = materializeReceivedInputWorkUnits(request, undefined);
  const orchestration = declaredItemOrchestration(capability, request, materialized);

  assert.deepEqual(
    orchestration?.itemIds,
    materialized.map((item) => item.id),
  );
  assert.deepEqual(
    orchestration?.workItems?.map((item) => item.sourceItemId),
    ["source-1", "source-2"],
  );
});
