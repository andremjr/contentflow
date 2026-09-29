import assert from "node:assert/strict";
import test from "node:test";
import type { Channel, ProcessMethod } from "../src/lib/domain";
import type { RegisteredPlugin } from "./plugin-runner";
import { type BuilderPluginContext, validateBuilderMethods } from "./builder-methods";

const channel = {
  id: "channel-1",
  name: "Canal de teste",
  handle: "@teste",
  niche: "Educação",
  language: "pt-BR",
  methods: {},
} as Channel;

function manualThemeMethod(): ProcessMethod {
  return {
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
            type: "textarea",
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  };
}

function pluginContext(inputPortKeys: string[]): BuilderPluginContext {
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.port-test",
    source: "local",
    directory: "port-test",
    absoluteDirectory: "C:/plugins/port-test",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "1",
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
            acceptedTypes: ["number"],
            required: false,
          })),
          outputPorts: [
            {
              key: "theme",
              label: "Tema",
              producedTypes: ["textarea"],
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
        type: "number",
        source: "static",
        staticValue: "1",
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
      type: "text",
      source: "previous_block",
      blockId: "future-block",
      sourceKey: "future",
    },
  ];
  method.blocks.push({
    id: "future-block",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      { id: "future-output", label: "Futuro", key: "future", type: "text", required: true },
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
            type: "textarea",
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
            type: "textarea",
            source: "previous_process",
            sourceProcessType: "script",
            blockId: "__process_output__",
            sourceKey: "script",
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

test("builder materializes a canonical binding only from an explicit legacy reference", () => {
  const method = manualThemeMethod();
  method.blocks.push({
    id: "use-theme",
    type: "CRIAR",
    operator: "Humano",
    inputs: [
      {
        id: "theme-reference",
        label: "Tema",
        type: "textarea",
        source: "previous_block",
        blockId: "theme-input",
        sourceKey: "theme",
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
