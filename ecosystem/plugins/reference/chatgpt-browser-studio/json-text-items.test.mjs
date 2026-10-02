import assert from "node:assert/strict";
import test from "node:test";
import { jsonTextInstruction, jsonTextValues } from "./json-text-items.mjs";
import { __test as chatgpt } from "./handler.mjs";
import { __test as flow } from "../google-flow-browser-images/handler.mjs";

const request = {
  configuration: {
    textItemFormat: "json",
    textItemFields: '{"prompt":"string","referenceItemIds":"string[]"}',
    textItemReferenceInputs: '{"referenceItemIds":"context_items"}',
  },
  inputDeliveries: [
    {
      portKey: "context_items",
      items: [{ id: "character-a", value: '{"name":"Ana","prompt":"portrait"}' }],
    },
  ],
};
test("JSON remains text and canonical input IDs are supplied by the producing plugin", () => {
  assert.match(jsonTextInstruction(request), /character-a/);
  const texts = jsonTextValues('[{"prompt":"scene","referenceItemIds":["character-a"]}]', request);
  assert.equal(typeof texts[0], "string");
  assert.deepEqual(flow.normalizePrompts(texts, "json"), ["scene"]);
});

test("the actual producer prompt and output mapping keep serialized items as text", () => {
  const configured = {
    ...request,
    inputs: { context_1: "Script", context_items: ['{"name":"Ana","prompt":"portrait"}'] },
    resolvedInstruction: "Create scene prompts with character associations.",
    outputContract: [
      { portKey: "parts", shape: { kind: "content", family: "text", cardinality: "many" } },
      { portKey: "result", shape: { kind: "content", family: "text", cardinality: "one" } },
    ],
  };
  assert.match(chatgpt.buildParts(configured)[0], /character-a/);
  const response = '[{"prompt":"scene","referenceItemIds":["character-a"]}]';
  const values = chatgpt.generationResponseValues(response, [{ text: response }], configured);
  assert.deepEqual(values.parts, [response.slice(1, -1)]);
  assert.equal(values.result, response);
});

test("animation uses the selected image contents as frames", () => {
  assert.deepEqual(
    flow
      .referenceImagesForCurrentItem({
        capabilityId: "animate-image-in-browser",
        inputs: { images: [{ id: "selected", url: "/selected.png" }] },
      })
      .map((item) => item.id),
    ["selected"],
  );
});

test("per-item generation serializes exactly one JSON text without nested collections", () => {
  const configured = {
    ...request,
    outputContract: [
      { portKey: "parts", shape: { kind: "content", family: "text", cardinality: "one" } },
    ],
  };
  const item = '{"prompt":"scene","referenceItemIds":[]}';
  assert.deepEqual(chatgpt.generationResponseValues(`[${item}]`, [], configured), { parts: item });
  assert.throws(() => chatgpt.generationResponseValues(`[${item},${item}]`, [], configured));
  assert.match(jsonTextInstruction(configured), /exactly one object/);
});

test("JSON validation errors are localized in all supported languages", () => {
  for (const [locale, expected] of [
    ["pt-BR", /ID desconhecido/],
    ["en", /unknown ContentFlow ID/],
    ["es", /ID desconocido/],
  ])
    assert.throws(
      () =>
        jsonTextValues('[{"prompt":"scene","referenceItemIds":["unknown"]}]', {
          ...request,
          context: { locale },
        }),
      expected,
    );
});
test("malformed objects and invented IDs cannot become scene prompts", () => {
  for (const value of [
    "[]",
    '[{"prompt":"scene","referenceItemIds":["unknown"]}]',
    '[{"prompt":"scene"}]',
    '[{"prompt":"scene","referenceItemIds":[],"extra":true}]',
  ])
    assert.throws(() => jsonTextValues(value, request));
});
const flowRequest = {
  context: { locale: "en" },
  configuration: { promptFormat: "json", referenceMode: "per_prompt" },
  batch: { sourceItemId: "scene-a" },
  inputDeliveries: [
    {
      portKey: "prompts",
      items: [{ id: "scene-a", value: '{"prompt":"scene","referenceItemIds":["character-a"]}' }],
    },
    {
      portKey: "reference_images",
      items: [
        {
          id: "image-a",
          value: { id: "file-a", url: "/a.png" },
          references: [{ role: "derived_from", itemId: "character-a" }],
        },
        {
          id: "image-b",
          value: { id: "file-b", url: "/b.png" },
          references: [{ role: "derived_from", itemId: "character-b" }],
        },
      ],
    },
  ],
};
test("Flow resolves only references chosen in the text, using core provenance", () => {
  assert.deepEqual(
    flow.referenceImagesForCurrentItem(flowRequest).map((item) => item.id),
    ["file-a"],
  );
  assert.deepEqual(
    flow.referenceImagesForSourceItem(flowRequest, "scene-a").map((item) => item.id),
    ["file-a"],
  );
  assert.deepEqual(
    flow.referenceImagesForSourceItem({ ...flowRequest, batch: undefined }, undefined),
    [],
  );
});
test("Flow allows scenes without characters and rejects missing reference lineage", () => {
  const changed = structuredClone(flowRequest);
  changed.inputDeliveries[0].items[0].value = '{"prompt":"landscape","referenceItemIds":[]}';
  assert.deepEqual(flow.referenceImagesForCurrentItem(changed), []);
  changed.inputDeliveries[0].items[0].value = '{"prompt":"scene","referenceItemIds":["unknown"]}';
  assert.throws(() => flow.referenceImagesForCurrentItem(changed), /provenance/);
  assert.throws(() => flow.normalizePrompts(["bad JSON"], "json"));
  assert.deepEqual(flow.normalizePrompts(["literal {prompt}"]), ["literal {prompt}"]);
});
