import assert from "node:assert/strict";
import test from "node:test";
import { materializeBlockDeliveries } from "../src/lib/deliveries";
import { contentShape } from "../src/lib/data-shape";
import type { ActionBlock, ProcessExecution, RuntimeValue } from "../src/lib/domain";
import { normalizePluginResponseValues } from "./plugin-response-normalization";
import { pluginManifestSchema } from "./plugin-validation";

function execution(block: ActionBlock): ProcessExecution {
  return {
    id: "execution-1",
    projectId: "project-1",
    channelId: "channel-1",
    processType: "title",
    methodSnapshot: { contractVersion: 3, name: "Contrato", processType: "title", blocks: [block] },
    blocks: [{ blockId: block.id, status: "completed", values: {}, attempt: 1 }],
    status: "running",
    outputStatus: "pending",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  };
}

function block(operator: "Humano" | "IA", cardinality: "one" | "many"): ActionBlock {
  return {
    id: `block-${operator}-${cardinality}`,
    type: "CRIAR",
    operator,
    name: "Produzir títulos",
    inputs: [],
    outputs: [
      {
        id: "titles",
        label: "Títulos",
        key: "titles",
        portKey: operator === "Humano" ? undefined : "titles",
        shape: contentShape("text", cardinality),
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
}

test("Humano e plugin materializam delivery semanticamente equivalente", () => {
  for (const cardinality of ["one", "many"] as const) {
    const humanBlock = block("Humano", cardinality);
    const pluginBlock = block("IA", cardinality);
    const value: RuntimeValue = cardinality === "one" ? "Título" : ["Título A", "Título B"];
    const human = materializeBlockDeliveries({
      execution: execution(humanBlock),
      block: humanBlock,
      values: { titles: value },
      status: "completed",
    })[0];
    const pluginResult = normalizePluginResponseValues({
      block: pluginBlock,
      responseValues: { titles: value },
      outputContract: [
        {
          label: "Títulos",
          key: "titles",
          portKey: "titles",
          shape: contentShape("text", cardinality),
          required: true,
        },
      ],
      completion: "final",
    });
    assert.equal(pluginResult.ok, true);
    const plugin = materializeBlockDeliveries({
      execution: execution(pluginBlock),
      block: pluginBlock,
      values: pluginResult.ok ? pluginResult.values : {},
      status: "completed",
    })[0];
    assert.deepEqual(plugin.shape, human.shape);
    assert.deepEqual(
      plugin.items.map((item) => item.value),
      human.items.map((item) => item.value),
    );
  }
});

test("plugin não pode devolver array para shape one nem escalar para shape many", () => {
  const outputContract = [
    {
      label: "Título",
      key: "title",
      portKey: "title",
      shape: contentShape("text", "one"),
      required: true,
    },
  ];
  const result = normalizePluginResponseValues({
    block: block("IA", "one"),
    responseValues: { title: ["A", "B"] },
    outputContract,
    completion: "final",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "INCOMPATIBLE_OUTPUT_SHAPE");
});

const pluginV2 = {
  apiVersion: "2",
  id: "com.example.contract",
  name: "Contract",
  version: "1.0.0",
  description: "Contract fixture",
  author: "ContentFlow",
  license: "Proprietary",
  runtime: { kind: "node", version: ">=26 <27", module: "esm" },
  entrypoint: "handler.mjs",
  permissions: [],
  capabilities: [
    {
      id: "create",
      operator: "Código",
      blockTypes: ["CRIAR"],
      inputPorts: [],
      outputPorts: [
        {
          key: "result",
          label: "Result",
          shape: contentShape("text", "one"),
          required: true,
        },
      ],
      execution: { mode: "immediate" },
      sideEffects: [],
      cost: { model: "free", estimateSupported: true },
      dataPolicy: { sendsDataToThirdParties: false },
      blockConfigSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ],
} as const;

test("Plugin API v2 accepts only canonical shape ports", () => {
  assert.equal(pluginManifestSchema.parse(pluginV2).apiVersion, "2");
});

test("Plugin API v1 is rejected instead of adapted", () => {
  assert.equal(pluginManifestSchema.safeParse({ ...pluginV2, apiVersion: "1" }).success, false);
});

test("legacy port type lists are rejected", () => {
  const legacy = structuredClone(pluginV2) as unknown as Record<string, unknown>;
  const capabilities = legacy.capabilities as Array<Record<string, unknown>>;
  const ports = capabilities[0].outputPorts as Array<Record<string, unknown>>;
  delete ports[0].shape;
  ports[0].producedTypes = ["textarea"];
  assert.equal(pluginManifestSchema.safeParse(legacy).success, false);
});
