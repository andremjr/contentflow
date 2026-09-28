import assert from "node:assert/strict";
import test from "node:test";
import type { BlockExecution } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { normalizeBlockExecutionWorkUnits } from "./work-unit-normalization";
import { createPersistentPluginJob } from "./plugin-job-store";

const request = {
  executionId: "execution-1",
  traceId: "trace-1",
  blockId: "block-1",
  capabilityId: "capability-1",
  attempt: 1,
  invocation: { mode: "start" },
  configuration: {},
  settings: {},
  inputs: { prompts: ["a", "b"] },
  inputContract: [],
  outputContract: [],
  inputDeliveries: [
    {
      inputId: "input-1",
      portKey: "prompts",
      deliveryId: "delivery-source",
      itemIds: ["source-a", "source-b"],
    },
  ],
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
    project: { id: "project", title: "Projeto" },
    processType: "assets",
    block: { type: "CRIAR", name: "Gerar", instructions: "" },
    previousProcessOutputs: [],
    previousBlockOutputs: [],
  },
} satisfies PluginExecutionRequest;

function block(): BlockExecution {
  return { blockId: "block-1", status: "in_progress", values: {}, attempt: 1 };
}

test("normaliza job legado usando os IDs já concedidos pelo núcleo", () => {
  const job = createPersistentPluginJob({
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: ["a", "b"],
      itemIds: ["core-a", "core-b"],
      currentIndex: 1,
      accumulatedItems: ["image-a"],
    },
  });
  const items = normalizeBlockExecutionWorkUnits(block(), [job]);
  assert.deepEqual(
    items.map((item) => item.id),
    ["core-a", "core-b"],
  );
  assert.equal(items[0].kind, "list_item");
  assert.deepEqual(items[0].provenance, {
    origin: "block_input",
    inputPort: "prompts",
    sourceDeliveryId: "delivery-source",
    sourceDeliveryItemId: "source-a",
  });
  assert.match(items[0].attempts[0].id ?? "", /^work-unit-attempt:/);
});

test("une item de lote e derivado em uma hierarquia sem criar delivery paralela", () => {
  const parent = {
    id: "core-parent",
    kind: "list_item" as const,
    order: 0,
    input: "a",
    status: "completed" as const,
    attempt: 1,
    output: "image-a",
    attempts: [],
  };
  const job = createPersistentPluginJob({
    pluginId: "plugin.test",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: {
      inputPort: "prompts",
      outputPort: "images",
      items: ["a"],
      itemIds: [parent.id],
      workItems: [parent],
      currentIndex: 0,
      accumulatedItems: ["image-a"],
    },
  });
  job.incrementalItems = [
    {
      id: "core-child",
      order: 0,
      input: "a",
      status: "completed",
      attempt: 1,
      output: "variant-a",
      attempts: [],
      pluginCorrelation: {
        key: "provider",
        batchItemId: parent.id,
        outputPort: "images",
        outputKey: "images",
      },
    },
  ];
  const executionBlock = block();
  const items = normalizeBlockExecutionWorkUnits(executionBlock, [job]);
  assert.equal(items.length, 2);
  assert.equal(items[1].kind, "derived");
  assert.equal(items[1].parentItemId, parent.id);
  assert.equal(items[1].provenance?.origin, "plugin_derived");
  assert.equal("delivery" in (items[1] as unknown as Record<string, unknown>), false);
});
