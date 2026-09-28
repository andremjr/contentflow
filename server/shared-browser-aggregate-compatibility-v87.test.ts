import assert from "node:assert/strict";
import test from "node:test";
import type { PluginCapability, PluginExecutionRequest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import {
  aggregateCompatibilityItemOrchestration,
  deterministicAggregateMapping,
  invocationRequestForJob,
  supportsIncrementalItemCorrelation,
} from "./plugin-item-orchestration";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v87",
    traceId: "trace-v87",
    blockId: "block-v87",
    capabilityId: "aggregate-v87",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: { prompts: ["um", "dois", "tres"] },
    inputContract: [],
    outputContract: [
      {
        key: "images",
        portKey: "images",
        label: "Imagens",
        type: "files",
        required: true,
      },
    ],
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
  };
}

function aggregateCapability(): PluginCapability {
  return {
    id: "aggregate-v87",
    name: "Aggregate",
    operator: "IA",
    blockTypes: ["CRIAR"],
    inputPorts: [
      { key: "prompts", label: "Prompts", types: ["text"], required: true, multiple: true },
    ],
    outputPorts: [
      { key: "images", label: "Imagens", types: ["file"], required: true, multiple: true },
    ],
    execution: { mode: "immediate" },
    sideEffects: [],
    cost: { type: "unknown" },
    dataPolicy: { leavesDevice: false, providers: [] },
    blockConfigSchema: { type: "object", additionalProperties: false, properties: {} },
  } as unknown as PluginCapability;
}

test("handler agregado legado continua recebendo a coleção inteira", () => {
  const currentRequest = request();
  const job = createPersistentPluginJob({
    pluginId: "fixture.aggregate",
    pluginVersion: "1.0.0",
    request: currentRequest,
    timeoutMs: 30_000,
  });

  const invocation = invocationRequestForJob(job, { mode: "start" });
  assert.deepEqual(invocation.inputs.prompts, ["um", "dois", "tres"]);
  assert.equal(invocation.batch, undefined);
  assert.equal(supportsIncrementalItemCorrelation(aggregateCapability()), false);
});

test("saída agregada determinística é materializada após a conclusão com limitações explícitas", () => {
  const capability = aggregateCapability();
  const currentRequest = request();
  const values = { images: ["img-a", "img-b", "img-c"] };

  const inferred = deterministicAggregateMapping(capability, currentRequest, values);
  assert.deepEqual(inferred, {
    mode: "sequential",
    inputPort: "prompts",
    outputPort: "images",
  });
  assert.equal(capability.execution.itemOrchestration, undefined);

  const materialized = aggregateCompatibilityItemOrchestration(
    capability,
    currentRequest,
    values,
    "2026-09-27T12:00:00.000Z",
  );
  assert.ok(materialized);
  assert.deepEqual(
    materialized.workItems?.map((item) => [
      item.input,
      "output" in item ? item.output : undefined,
      item.status,
    ]),
    [
      ["um", "img-a", "completed"],
      ["dois", "img-b", "completed"],
      ["tres", "img-c", "completed"],
    ],
  );
  assert.deepEqual(materialized.compatibility, {
    mode: "aggregate_completion",
    lateUpdates: false,
    realtimeUpdates: false,
    profileParallelism: false,
  });
});

test("compatibilidade agregada não inventa correlação quando o mapeamento é ambíguo ou incompleto", () => {
  const capability = aggregateCapability();
  const ambiguousRequest = {
    ...request(),
    inputs: {
      prompts: ["um", "dois"],
      contexts: ["a", "b"],
    },
  } satisfies PluginExecutionRequest;

  assert.equal(
    aggregateCompatibilityItemOrchestration(capability, ambiguousRequest, {
      images: ["img-a", "img-b"],
    }),
    undefined,
  );
  assert.equal(
    aggregateCompatibilityItemOrchestration(capability, request(), { images: ["img-a"] }),
    undefined,
  );
});

test("correlação incremental declarada não passa pelo modo agregado de compatibilidade", () => {
  const declared = {
    ...aggregateCapability(),
    execution: {
      mode: "immediate" as const,
      itemOrchestration: {
        inputPort: "prompts",
        outputPort: "images",
        mode: "sequential" as const,
        strategies: ["per_item" as const],
      },
    },
  } satisfies PluginCapability;

  assert.equal(supportsIncrementalItemCorrelation(declared), true);
  assert.equal(
    aggregateCompatibilityItemOrchestration(declared, request(), {
      images: ["img-a", "img-b", "img-c"],
    }),
    undefined,
  );
});
