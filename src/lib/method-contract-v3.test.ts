import assert from "node:assert/strict";
import test from "node:test";
import { parseProcessMethodV3 } from "./method-contract-v3";
import { parseMethodFile, serializeMethodFile } from "./method-file";

const method = {
  contractVersion: 3,
  name: "Roteiro",
  processType: "script",
  blocks: [
    {
      id: "create-script",
      type: "CRIAR",
      operator: "IA",
      inputs: [
        {
          id: "theme",
          label: "Tema",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          binding: { kind: "previous_process", processType: "theme", outputKey: "theme" },
        },
      ],
      outputs: [
        {
          id: "script",
          label: "Roteiro",
          key: "script",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          required: true,
        },
      ],
      parameters: [],
      order: 0,
    },
  ],
} as const;

test("accepts the definitive Method v3 contract", () => {
  assert.equal(parseProcessMethodV3(method).contractVersion, 3);
});

test("rejects Method v2 instead of adapting it", () => {
  assert.throws(() => parseProcessMethodV3({ ...method, contractVersion: 2 }));
});

test("rejects legacy pseudo-types instead of inferring a shape", () => {
  const legacy = structuredClone(method) as unknown as Record<string, unknown>;
  const blocks = legacy.blocks as Array<Record<string, unknown>>;
  const outputs = blocks[0].outputs as Array<Record<string, unknown>>;
  delete outputs[0].shape;
  outputs[0].type = "textarea";
  assert.throws(() => parseProcessMethodV3(legacy));
});

test("the public Method file path serializes and parses only envelope v3", () => {
  const serialized = serializeMethodFile("Roteiro", parseProcessMethodV3(method));
  const envelope = JSON.parse(serialized) as { version: number };
  assert.equal(envelope.version, 3);
  assert.equal(parseMethodFile(serialized).method.contractVersion, 3);

  const oldEnvelope = JSON.stringify({ ...JSON.parse(serialized), version: 1 });
  assert.throws(() => parseMethodFile(oldEnvelope));
});
