import assert from "node:assert/strict";
import test from "node:test";
import type { BlockFieldDefinition } from "../src/lib/domain";
import type { PluginOutputPort } from "../src/lib/plugin-contract";
import { validatePluginOutputContract } from "./plugin-output-contract";

const ports: PluginOutputPort[] = [
  {
    key: "generated_text",
    label: "Generated text",
    producedTypes: ["textarea"],
    required: true,
  },
];

function output(overrides: Partial<BlockFieldDefinition> = {}): BlockFieldDefinition {
  return {
    id: "script-output",
    label: "Roteiro",
    key: "script",
    type: "textarea",
    required: true,
    portKey: "generated_text",
    ...overrides,
  };
}

test("preserves the Block output key while binding an explicit capability output port", () => {
  const result = validatePluginOutputContract([output()], ports);

  assert.deepEqual(result.unsupportedFields, []);
  assert.deepEqual(result.outputContract, [
    {
      label: "Roteiro",
      key: "script",
      type: "textarea",
      required: true,
      options: undefined,
      recordFields: undefined,
      presentation: undefined,
      portKey: "generated_text",
    },
  ]);
  assert.notEqual(result.outputContract[0].key, result.outputContract[0].portKey);
});

test("rejects an output without portKey even when there is one compatible port", () => {
  const field = output({ portKey: undefined });
  const result = validatePluginOutputContract([field], ports);

  assert.deepEqual(result.outputContract, []);
  assert.deepEqual(result.unsupportedFields, [field]);
});

test("rejects an explicit portKey that does not exist without selecting an alternative", () => {
  const field = output({ portKey: "missing" });
  const result = validatePluginOutputContract([field], ports);

  assert.deepEqual(result.outputContract, []);
  assert.deepEqual(result.unsupportedFields, [field]);
});

test("rejects an explicit port with an incompatible type without selecting an alternative", () => {
  const field = output({ type: "number" });
  const result = validatePluginOutputContract([field], ports);

  assert.deepEqual(result.outputContract, []);
  assert.deepEqual(result.unsupportedFields, [field]);
});
