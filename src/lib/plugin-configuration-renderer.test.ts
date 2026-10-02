import assert from "node:assert/strict";
import test from "node:test";
import { buildPluginConfigurationRendererModel } from "./plugin-configuration-renderer";

test("separa campos avançados declarados pelo plugin e preserva a ordem", () => {
  const model = buildPluginConfigurationRendererModel({
    capability: {
      id: "demo",
      blockTypes: ["CRIAR"],
      operator: "Código",
      inputPorts: [],
      outputPorts: [],
      execution: { mode: "immediate" },
      sideEffects: [],
      cost: { model: "free", estimateSupported: false },
      dataPolicy: { sendsDataToThirdParties: false },
      blockConfigSchema: {
        type: "object",
        properties: {
          advanced: { type: "number", ui: { section: "advanced", order: 1 } },
          primary: { type: "string", ui: { section: "primary", order: 0 } },
        },
      },
      outputSchema: { type: "object" },
    } as never,
    configuration: {},
  });
  assert.deepEqual(
    model.capabilityEntries.map(([key]) => key),
    ["primary"],
  );
  assert.deepEqual(
    model.advancedEntries.map(([key]) => key),
    ["advanced"],
  );
});

test("renders plugin execution choices normally and applies declared visibility defaults", () => {
  const capability = {
    blockConfigSchema: {
      properties: {
        generationMode: { type: "string", default: "custom", title: "Plugin mode" },
        references: {
          type: "boolean",
          visibleWhen: { property: "generationMode", values: ["custom"] },
        },
      },
    },
    execution: { itemOrchestration: { mode: "sequential" } },
  } as never;
  const defaults = buildPluginConfigurationRendererModel({ capability, configuration: {} });
  assert.deepEqual(
    defaults.capabilityEntries.map(([key]) => key),
    ["generationMode", "references"],
  );
  const changed = buildPluginConfigurationRendererModel({
    capability,
    configuration: { generationMode: "other" },
  });
  assert.deepEqual(
    changed.capabilityEntries.map(([key]) => key),
    ["generationMode"],
  );
  assert.deepEqual(Object.keys(defaults), ["capabilityEntries", "advancedEntries"]);
});
