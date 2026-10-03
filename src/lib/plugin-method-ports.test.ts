import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ContentShape } from "./domain";
import { addPluginOutput, bindPluginInput, pluginInputSources } from "./plugin-method-ports";
import { normalizePluginResponseValues } from "../../server/plugin-response-normalization";
import { validatePluginOutputContract } from "../../server/plugin-output-contract";

const text: ContentShape = {
  kind: "content",
  family: "text",
  cardinality: "one",
  representation: "inline",
};
const block = (id: string, order: number): ActionBlock => ({
  id,
  order,
  type: "CRIAR",
  operator: "IA",
  instructions: "",
  inputs: [],
  outputs: [],
  parameters: [],
});

test("an ordinary text delivery transports provider context only through an explicit binding", () => {
  const port = { key: "provider_context", label: "Context", required: false, shape: text };
  const producer = addPluginOutput(block("producer", 0), port);
  const consumer = block("consumer", 2);
  const blocks = [producer, block("middle", 1), consumer];
  const source = pluginInputSources(blocks, consumer.id, port)[0];
  const connected = bindPluginInput(consumer, blocks, port, source.value);
  assert.deepEqual(connected.inputs?.[0].binding, {
    kind: "previous_block",
    blockId: producer.id,
    outputKey: port.key,
  });
  const outputContract = validatePluginOutputContract(producer.outputs!, [port]).outputContract;
  const response = normalizePluginResponseValues({
    block: producer,
    outputContract,
    completion: "final",
    responseValues: { provider_context: "https://example.com/project/1" },
  });
  assert.equal(response.ok, true);
  if (response.ok) assert.equal(response.values.provider_context, "https://example.com/project/1");
  assert.equal(producer.outputs?.[0].shape.kind, "content");
  assert.equal(addPluginOutput(producer, port).outputs?.length, 1);
  assert.throws(() =>
    bindPluginInput(consumer, blocks, port, JSON.stringify([consumer.id, port.key])),
  );
});

test("port selection preserves other content and internal contracts and disambiguates keys", () => {
  const producer = block("producer", 0);
  producer.outputs = [
    {
      id: "internal",
      key: "context",
      label: "Internal",
      shape: { kind: "control", control: "identifier", cardinality: "one" },
      required: false,
    },
  ];
  const result = addPluginOutput(producer, {
    key: "context",
    label: "Context",
    required: false,
    shape: text,
  });
  assert.equal(result.outputs?.[0], producer.outputs[0]);
  assert.equal(result.outputs?.[1].key, "context_2");
  assert.equal(result.outputs?.[1].portKey, "context");
});
