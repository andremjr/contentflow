import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessMethod } from "./domain";
import { adaptLegacyMethod } from "./legacy-method-adapter";

function baseMethod(): ProcessMethod {
  return {
    name: "Roteiro histórico",
    processType: "script",
    blocks: [
      {
        id: "draft",
        type: "CRIAR",
        operator: "Humano",
        inputs: [],
        outputs: [
          {
            id: "draft-output",
            label: "Roteiro",
            key: "script",
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

const textCapability = {
  pluginVersion: "1.0.0",
  capability: {
    inputPorts: [
      { key: "prompt", label: "Prompt", acceptedTypes: ["textarea" as const], required: true },
    ],
    outputPorts: [
      { key: "result", label: "Resultado", producedTypes: ["textarea" as const], required: true },
    ],
  },
};

test("canonical Method is unchanged and an invalid modern Method is never repaired", () => {
  const canonical = baseMethod();
  canonical.contractVersion = 2;
  const first = adaptLegacyMethod(canonical, { source: "builder" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.adapted, false);
  assert.deepEqual(first.method, canonical);

  const invalid = structuredClone(canonical);
  invalid.blocks.push({
    id: "review",
    type: "VALIDAR",
    operator: "Humano",
    inputs: [],
    outputs: [],
    validation: {
      targetBlockId: "",
      mode: "approval",
      onReject: "pause",
      maxAttempts: 1,
    },
    parameters: [],
    order: 1,
  });
  const rejected = adaptLegacyMethod(invalid, {
    source: "execution_snapshot",
    recoverHistoricalValidationTarget: true,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.diagnostics[0].code, "modern_contract_invalid");
});

test("flat deterministic inputs become canonical and adaptation is idempotent", () => {
  const historical = baseMethod();
  historical.blocks.push({
    id: "revise",
    type: "CRIAR",
    operator: "Humano",
    inputs: [
      {
        id: "draft-input",
        label: "Roteiro",
        type: "textarea",
        source: "previous_block",
        sourceKey: "script",
        blockId: "draft",
      },
    ],
    outputs: [],
    parameters: [],
    order: 1,
  });
  const adapted = adaptLegacyMethod(historical, { source: "persisted_channel" });
  assert.equal(adapted.ok, true);
  if (!adapted.ok) return;
  assert.deepEqual(adapted.method.blocks[1].inputs?.[0].binding, {
    kind: "previous_block",
    blockId: "draft",
    outputKey: "script",
  });
  assert.equal(adapted.method.contractVersion, 2);
  const twice = adaptLegacyMethod(adapted.method, { source: "persisted_channel" });
  assert.equal(twice.ok, true);
  if (twice.ok) assert.deepEqual(twice.method, adapted.method);
});

test("incomplete input identifiers fail instead of using labels or order", () => {
  const historical = baseMethod();
  historical.blocks[0].inputs = [
    {
      id: "ambiguous",
      label: "Roteiro",
      type: "textarea",
      source: "previous_block",
      sourceKey: "script",
    },
  ];
  const result = adaptLegacyMethod(historical, { source: "persisted_channel" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostics[0].code, "legacy_input_ambiguous");
});

test("unique plugin ports are materialized before runtime", () => {
  const historical = baseMethod();
  historical.blocks[0].operator = "IA";
  historical.blocks[0].inputs = [
    {
      id: "prompt-input",
      label: "Prompt",
      type: "textarea",
      source: "static",
      staticValue: "Escreva",
    },
  ];
  historical.blocks[0].plugin = {
    pluginId: "plugin.text",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    configuration: {},
  };
  const result = adaptLegacyMethod(historical, {
    source: "execution_snapshot",
    requireFrozenPluginVersionForPorts: true,
    resolveCapability: () => textCapability,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.method.blocks[0].inputs?.[0].portKey, "prompt");
  assert.equal(result.method.blocks[0].outputs?.[0].portKey, "result");
});

test("multiple plausible plugin ports fail without selecting the first", () => {
  const historical = baseMethod();
  historical.blocks[0].operator = "IA";
  historical.blocks[0].plugin = {
    pluginId: "plugin.text",
    capabilityId: "generate",
    configuration: {},
  };
  const result = adaptLegacyMethod(historical, {
    source: "persisted_channel",
    resolveCapability: () => ({
      pluginVersion: "1.0.0",
      capability: {
        inputPorts: [],
        outputPorts: [
          { key: "a", label: "A", producedTypes: ["textarea"], required: false },
          { key: "b", label: "B", producedTypes: ["textarea"], required: false },
        ],
      },
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostics[0].code, "legacy_output_port_ambiguous");
});

test("recognized historical VALIDAR recovers target only at an authorized boundary", () => {
  const historical = baseMethod();
  historical.blocks.push({
    id: "review",
    type: "VALIDAR",
    operator: "Humano",
    inputs: [],
    outputs: [],
    validation: {
      targetBlockId: "",
      mode: "approval",
      onReject: "pause",
      maxAttempts: 1,
    },
    parameters: [],
    order: 1,
  });
  const denied = adaptLegacyMethod(historical, {
    source: "editor_save",
    recoverHistoricalValidationTarget: false,
  });
  assert.equal(denied.ok, false);

  const recovered = adaptLegacyMethod(historical, {
    source: "execution_snapshot",
    recoverHistoricalValidationTarget: true,
  });
  assert.equal(recovered.ok, true);
  if (recovered.ok) assert.equal(recovered.method.blocks[1].validation?.targetBlockId, "draft");
});

test("historical select target with multiple eligible outputs is diagnostic", () => {
  const historical = baseMethod();
  historical.blocks[0].outputs!.push({
    id: "alternatives",
    label: "Alternativas",
    key: "alternatives",
    type: "list",
    required: false,
  });
  historical.blocks[0].outputs![0].type = "list";
  historical.blocks.push({
    id: "review",
    type: "VALIDAR",
    operator: "Humano",
    inputs: [],
    outputs: [],
    validation: {
      targetBlockId: "draft",
      mode: "select_one",
      onReject: "pause",
      maxAttempts: 1,
    },
    parameters: [],
    order: 1,
  });
  const result = adaptLegacyMethod(historical, {
    source: "execution_snapshot",
    recoverHistoricalValidationTarget: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0].code, "legacy_validation_output_ambiguous");
  }
});

test("snapshot port recovery refuses an unfrozen plugin version", () => {
  const historical = baseMethod();
  historical.blocks[0].operator = "IA";
  historical.blocks[0].plugin = {
    pluginId: "plugin.text",
    capabilityId: "generate",
    configuration: {},
  };
  const result = adaptLegacyMethod(historical, {
    source: "execution_snapshot",
    requireFrozenPluginVersionForPorts: true,
    resolveCapability: () => textCapability,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0].code, "legacy_plugin_version_unfrozen");
  }
});

test("ESCOLHER keeps its specialized collection contract", () => {
  const historical = baseMethod();
  historical.blocks[0] = {
    id: "choose",
    type: "ESCOLHER",
    operator: "Código",
    collectionId: "collection-a",
    inputs: [
      {
        id: "legacy-library",
        label: "Coleção",
        type: "records",
        source: "channel_library",
      },
    ],
    outputs: [],
    plugin: {
      pluginId: "plugin.choose",
      capabilityId: "choose",
      configuration: {},
    },
    parameters: [],
    order: 0,
  };
  const result = adaptLegacyMethod(historical, {
    source: "persisted_channel",
    resolveCapability: () => ({
      pluginVersion: "1.0.0",
      capability: {
        inputPorts: [],
        outputPorts: [{ key: "result", label: "Result", producedTypes: ["text"], required: true }],
      },
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.method.blocks[0].inputs, []);
  assert.deepEqual(result.method.blocks[0].outputs, []);
});
