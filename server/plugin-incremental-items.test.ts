import assert from "node:assert/strict";
import test from "node:test";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginFieldContract,
} from "../src/lib/plugin-contract";
import { applyPluginIncrementalItemUpdates } from "./plugin-incremental-items";
import { declaredItemOrchestration } from "./plugin-item-orchestration";
import { createPersistentPluginJob } from "./plugin-job-store";

const outputContract = [
  {
    key: "images",
    portKey: "media",
    label: "Imagens",
    type: "files",
    required: true,
  },
] satisfies PluginFieldContract[];

function job() {
  const request = {
    executionId: "execution",
    traceId: "trace",
    blockId: "block",
    capabilityId: "generate",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: {},
    inputContract: [],
    outputContract,
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
      project: { id: "project", title: "Projeto" },
      processType: "assets",
      block: { type: "CRIAR", name: "Imagens", instructions: "" },
    },
  } satisfies PluginExecutionRequest;
  return createPersistentPluginJob({
    pluginId: "test.plugin",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
  });
}

const image = (id: string) => ({
  id,
  name: `${id}.png`,
  mimeType: "image/png",
  size: 10,
  url: `/api/files/${id}.png`,
});

test("materializa slots incrementais com identidade do núcleo e valor parcial ordenado", () => {
  const pending = job();
  const created = applyPluginIncrementalItemUpdates({
    job: pending,
    updates: [
      { key: "prompt-1", outputPort: "media", state: "created", input: "primeiro" },
      {
        key: "prompt-2",
        outputPort: "media",
        state: "completed",
        input: "segundo",
        value: image("two"),
      },
    ],
    outputContract,
    now: "2026-09-24T10:00:00.000Z",
    createId: (() => {
      const ids = ["core-1", "core-2"];
      return () => ids.shift()!;
    })(),
  });
  pending.incrementalItems = created.items;
  assert.deepEqual(
    created.items.map((item) => [item.id, item.status]),
    [
      ["item:core-1", "pending"],
      ["item:core-2", "completed"],
    ],
  );
  assert.deepEqual(created.values.images, [image("two")]);
  assert.equal(created.items[0]?.input, "primeiro");
  assert.equal(created.items[1]?.attempts[0]?.input, "segundo");

  const completed = applyPluginIncrementalItemUpdates({
    job: pending,
    updates: [
      { key: "prompt-1", outputPort: "media", state: "running" },
      { key: "prompt-1", outputPort: "media", state: "completed", value: image("one") },
    ],
    outputContract,
    now: "2026-09-24T10:01:00.000Z",
  });
  assert.equal(completed.items[0]?.id, "item:core-1");
  assert.deepEqual(completed.values.images, [image("one"), image("two")]);
});

test("rejeita porta desconhecida, valor incompatível e regressão de estado terminal", () => {
  const pending = job();
  assert.throws(
    () =>
      applyPluginIncrementalItemUpdates({
        job: pending,
        updates: [{ key: "slot", outputPort: "unknown", state: "created" }],
        outputContract,
      }),
    /porta desconhecida/,
  );
  assert.throws(
    () =>
      applyPluginIncrementalItemUpdates({
        job: pending,
        updates: [{ key: "slot", outputPort: "media", state: "completed", value: "texto" }],
        outputContract,
      }),
    /incompatível/,
  );
  const completed = applyPluginIncrementalItemUpdates({
    job: pending,
    updates: [{ key: "slot", outputPort: "media", state: "completed", value: image("one") }],
    outputContract,
    createId: () => "core",
  });
  pending.incrementalItems = completed.items;
  assert.throws(
    () =>
      applyPluginIncrementalItemUpdates({
        job: pending,
        updates: [{ key: "slot", outputPort: "media", state: "running" }],
        outputContract,
      }),
    /estado terminal/,
  );
});

test("separa variantes locais de dois itens de lote sem o plugin inventar IDs universais", () => {
  const batchRequest = {
    ...job().request,
    inputs: { prompts: ["cidade", "floresta"] },
  } satisfies PluginExecutionRequest;
  const capability = {
    execution: {
      mode: "immediate",
      itemOrchestration: { inputPort: "prompts", outputPort: "media", mode: "sequential" },
    },
  } as PluginCapability;
  const pending = createPersistentPluginJob({
    pluginId: "test.plugin",
    pluginVersion: "1.0.0",
    request: batchRequest,
    timeoutMs: 60_000,
    itemOrchestration: declaredItemOrchestration(capability, batchRequest),
  });
  const batchItemIds = pending.itemOrchestration!.itemIds;
  const ids = ["output-1a", "output-1b", "output-2a", "output-2b"];

  const first = applyPluginIncrementalItemUpdates({
    job: pending,
    updates: [
      {
        key: "provider-generation",
        variantKey: "candidate-a",
        outputPort: "media",
        state: "completed",
        input: "cidade",
        value: image("city-a"),
      },
      {
        key: "provider-generation",
        variantKey: "candidate-b",
        outputPort: "media",
        state: "completed",
        input: "cidade",
        value: image("city-b"),
      },
    ],
    outputContract,
    createId: () => ids.shift()!,
  });
  pending.incrementalItems = first.items;
  pending.itemOrchestration!.currentIndex = 1;

  const second = applyPluginIncrementalItemUpdates({
    job: pending,
    updates: [
      {
        key: "provider-generation",
        variantKey: "candidate-a",
        outputPort: "media",
        state: "completed",
        input: "floresta",
        value: image("forest-a"),
      },
      {
        key: "provider-generation",
        variantKey: "candidate-b",
        outputPort: "media",
        state: "completed",
        input: "floresta",
        value: image("forest-b"),
      },
    ],
    outputContract,
    createId: () => ids.shift()!,
  });

  assert.deepEqual(
    second.items.map((item) => [
      item.id,
      item.pluginCorrelation?.batchItemId,
      item.pluginCorrelation?.variantKey,
    ]),
    [
      ["item:output-1a", batchItemIds[0], "candidate-a"],
      ["item:output-1b", batchItemIds[0], "candidate-b"],
      ["item:output-2a", batchItemIds[1], "candidate-a"],
      ["item:output-2b", batchItemIds[1], "candidate-b"],
    ],
  );
  assert.deepEqual(second.values.images, [
    image("city-a"),
    image("city-b"),
    image("forest-a"),
    image("forest-b"),
  ]);
});

test("preserva a porta singular legada quando uma porta plural é adicionada", () => {
  const singularAndPlural = [
    { key: "image", portKey: "image", label: "Imagem", type: "image", required: false },
    { key: "images", portKey: "images", label: "Imagens", type: "files", required: false },
  ] satisfies PluginFieldContract[];
  const result = applyPluginIncrementalItemUpdates({
    job: job(),
    updates: [
      {
        key: "legacy-primary",
        outputPort: "image",
        state: "completed",
        value: image("primary"),
      },
      {
        key: "plural-primary",
        outputPort: "images",
        state: "completed",
        value: image("primary"),
      },
      {
        key: "plural-alternative",
        outputPort: "images",
        state: "completed",
        value: image("alternative"),
      },
    ],
    outputContract: singularAndPlural,
  });

  assert.deepEqual(result.values.image, image("primary"));
  assert.deepEqual(result.values.images, [image("primary"), image("alternative")]);
});
