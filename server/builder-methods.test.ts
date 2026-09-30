import assert from "node:assert/strict";
import test from "node:test";
import type { Channel, ProcessMethod } from "../src/lib/domain";
import type { RegisteredPlugin } from "./plugin-runner";
import {
  BUILDER_METHOD_CONTRACT,
  type BuilderPluginContext,
  validateBuilderMethods,
} from "./builder-methods";

const channel = {
  id: "channel-1",
  name: "Canal de teste",
  handle: "@teste",
  niche: "Educação",
  language: "pt-BR",
  methods: {},
} as Channel;

test("builder contract exposes separate canonical image and video asset outputs", () => {
  assert.deepEqual(
    BUILDER_METHOD_CONTRACT.processOutputs.assets.map((output) => output.key),
    ["images", "videos"],
  );
  assert.match(BUILDER_METHOD_CONTRACT.strategyGuidance.example, /CRIAR images/);
  assert.match(BUILDER_METHOD_CONTRACT.strategyGuidance.layerResponsibilities.core, /work units/);
  assert.ok(
    BUILDER_METHOD_CONTRACT.strategyGuidance.avoidExtraBlocksFor.some((item) =>
      item.includes("perfis"),
    ),
  );
});

function manualThemeMethod(): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Tema manual",
    processType: "theme",
    blocks: [
      {
        id: "theme-input",
        type: "CRIAR",
        operator: "Humano",
        name: "Inserir tema",
        instructions: "Insira o tema definido externamente.",
        inputs: [],
        outputs: [
          {
            id: "theme-output",
            label: "Tema final",
            key: "theme",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  };
}

function pluginContext(
  inputPortKeys: string[],
  outputPortKeys: string[] = ["theme"],
): BuilderPluginContext {
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.port-test",
    source: "local",
    directory: "port-test",
    absoluteDirectory: "C:/plugins/port-test",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.port-test",
      name: "Port test",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "create-theme",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: inputPortKeys.map((key) => ({
            key,
            label: key,
            shape: { kind: "control", control: "number", cardinality: "one" },
            required: false,
          })),
          outputPorts: outputPortKeys.map((key) => ({
            key,
            label: key,
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: key === "theme",
          })),
          execution: { mode: "immediate" },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
          outputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    },
  };
  return { plugin, enabled: true, connections: [], profiles: [] };
}

function pluginThemeMethod(): ProcessMethod {
  const method = manualThemeMethod();
  method.blocks[0] = {
    ...method.blocks[0],
    operator: "IA",
    inputs: [
      {
        id: "section-count",
        label: "Quantidade de blocos",
        shape: { kind: "control", control: "number", cardinality: "one" },
        binding: { kind: "static", value: "1" },
      },
    ],
    outputs: method.blocks[0].outputs?.map((output) => ({ ...output, portKey: "theme" })),
    plugin: {
      pluginId: "dev.contentflow.port-test",
      capabilityId: "create-theme",
      configuration: {},
    },
  };
  return method;
}

function validationPluginContext(inputPortKeys: string[]): BuilderPluginContext {
  const base = pluginContext([]);
  base.plugin.manifest.capabilities = [
    {
      id: "validate-theme",
      operator: "IA",
      blockTypes: ["VALIDAR"],
      processTypes: ["theme"],
      inputPorts: inputPortKeys.map((key) => ({
        key,
        label: key,
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: inputPortKeys.length === 1,
      })),
      outputPorts: [
        {
          key: "decision",
          label: "Decisão",
          shape: { kind: "control", control: "approval", cardinality: "one" },
          required: true,
        },
      ],
      execution: { mode: "immediate" },
      sideEffects: [],
      cost: { model: "free", estimateSupported: false },
      dataPolicy: { sendsDataToThirdParties: false },
      blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
  return base;
}

function pluginValidationMethod(): ProcessMethod {
  const method = manualThemeMethod();
  method.blocks.push({
    id: "review-theme",
    type: "VALIDAR",
    operator: "IA",
    name: "Revisar tema",
    inputs: [],
    outputs: [
      {
        id: "decision-output",
        label: "Decisão",
        key: "decision",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        required: true,
        portKey: "decision",
      },
    ],
    validation: {
      targetBlockId: "theme-input",
      targetOutputKey: "theme",
      mode: "approval",
      onReject: "retry_target",
      maxAttempts: 3,
    },
    plugin: {
      pluginId: "dev.contentflow.port-test",
      capabilityId: "validate-theme",
      configuration: {},
    },
    parameters: [],
    order: 1,
  });
  return method;
}

test("accepts a complete manual Method without requiring a plugin", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: manualThemeMethod() },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.methods?.theme?.blocks[0].operator, "Humano");
});

test("rejects unknown universal processes", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { research: { ...manualThemeMethod(), processType: "theme" } },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Processo universal desconhecido/);
});

test("rejects a previous_block reference to a later block", () => {
  const method = manualThemeMethod();
  method.blocks[0].inputs = [
    {
      id: "future-input",
      label: "Resultado futuro",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      binding: { kind: "previous_block", blockId: "future-block", outputKey: "future" },
    },
  ];
  method.blocks.push({
    id: "future-block",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      {
        id: "future-output",
        label: "Futuro",
        key: "future",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
    parameters: [],
    order: 1,
  });
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /referência inválida/);
});

test("builder validates cross process references against the channel sequence", () => {
  const script: ProcessMethod = {
    ...manualThemeMethod(),
    processType: "script",
    blocks: [
      {
        ...manualThemeMethod().blocks[0],
        id: "script-input",
        outputs: [
          {
            id: "script-output",
            label: "Roteiro",
            key: "script",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
      },
    ],
  };
  const thumbnail: ProcessMethod = {
    ...manualThemeMethod(),
    processType: "thumbnail",
    blocks: [
      {
        ...manualThemeMethod().blocks[0],
        id: "thumbnail-input",
        inputs: [
          {
            id: "script-reference",
            label: "Roteiro",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            binding: { kind: "previous_process", processType: "script", outputKey: "script" },
          },
        ],
      },
    ],
  };
  const methods = { script, thumbnail };
  const legacy = validateBuilderMethods({ channel, methods, plugins: [], collections: [] });
  assert.equal(legacy.ok, false);
  assert.match(legacy.errors.join("\n"), /processo anterior inválido/);
  const reordered = validateBuilderMethods({
    channel: {
      ...channel,
      processOrder: [
        "theme",
        "title",
        "script",
        "thumbnail",
        "narration",
        "assets",
        "editing",
        "publishing",
      ],
    },
    methods,
    plugins: [],
    collections: [],
  });
  assert.equal(reordered.ok, true, reordered.errors.join("\n"));
});

test("builder preserves an explicit canonical binding", () => {
  const method = manualThemeMethod();
  method.blocks.push({
    id: "use-theme",
    type: "CRIAR",
    operator: "Humano",
    inputs: [
      {
        id: "theme-reference",
        label: "Tema",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        binding: { kind: "previous_block", blockId: "theme-input", outputKey: "theme" },
      },
    ],
    outputs: [],
    parameters: [],
    order: 1,
  });

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.methods?.theme?.blocks[1].inputs?.[0].binding, {
    kind: "previous_block",
    blockId: "theme-input",
    outputKey: "theme",
  });
});

test("builder materializes the only compatible plugin input port before runtime", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginThemeMethod() },
    plugins: [pluginContext(["sections"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[0].inputs?.[0].portKey, "sections");
});

test("builder requires an explicit portKey when multiple plugin ports are compatible", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginThemeMethod() },
    plugins: [pluginContext(["sections", "count"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe portKey para a entrada ambígua/);
});

test("builder materializes the only compatible plugin output port before runtime", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs = method.blocks[0].outputs?.map((output) => ({
    ...output,
    portKey: undefined,
  }));

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [pluginContext(["sections"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[0].outputs?.[0].portKey, "theme");
});

test("builder requires an explicit portKey when multiple plugin output ports are compatible", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs = method.blocks[0].outputs?.map((output) => ({
    ...output,
    portKey: undefined,
  }));

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [pluginContext(["sections"], ["theme", "draft"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe portKey para a saída ambígua/);
});

test("builder materializes the only compatible validation target port before runtime", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginValidationMethod() },
    plugins: [validationPluginContext(["content"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[1].validation?.targetPortKey, "content");
});

test("builder requires targetPortKey when multiple plugin ports accept the validation target", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginValidationMethod() },
    plugins: [validationPluginContext(["content", "reference"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe targetPortKey/);
});

test("explicit validation target port wins over another compatible port", () => {
  const method = pluginValidationMethod();
  method.blocks[1].validation!.targetPortKey = "reference";
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [validationPluginContext(["content", "reference"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[1].validation?.targetPortKey, "reference");
});
