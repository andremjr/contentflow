import assert from "node:assert/strict";
import test from "node:test";
import type { PluginFieldContract } from "../src/lib/plugin-contract";
import {
  normalizePluginResponseValues,
  PluginResponseContractError,
  requireNormalizedPluginResponseValues,
} from "./plugin-response-normalization";

const block = { type: "CRIAR" as const };

function contract(
  value: Partial<PluginFieldContract> & Pick<PluginFieldContract, "key" | "portKey">,
): PluginFieldContract {
  return {
    key: value.key,
    portKey: value.portKey,
    label: value.label ?? value.key,
    shape: value.shape ?? {
      kind: "content",
      family: "text",
      cardinality: "one",
      representation: "inline",
    },
    required: value.required ?? true,
    presentation: value.presentation,
  };
}

test("maps each declared technical port to its strategic output key", () => {
  const result = normalizePluginResponseValues({
    block,
    responseValues: { generated_text: "roteiro", score_port: 9 },
    outputContract: [
      contract({ key: "script", portKey: "generated_text" }),
      contract({
        key: "quality",
        portKey: "score_port",
        shape: { kind: "control", control: "number", cardinality: "one" },
      }),
    ],
    completion: "final",
  });
  assert.deepEqual(result, {
    ok: true,
    values: { script: "roteiro", quality: 9 },
    compatibility: "canonical",
  });
});

test("does not accept strategic keys, generic result, labels, unknown keys or object order", () => {
  for (const [responseValues, code] of [
    [{ script: "roteiro" }, "STRATEGIC_KEY_ALIAS_NOT_ALLOWED"],
    [{ result: "roteiro" }, "GENERIC_RESULT_ALIAS_NOT_ALLOWED"],
    [{ Roteiro: "roteiro" }, "UNKNOWN_OUTPUT_PORT"],
    [{ first: "roteiro", generated_text: "correto" }, "UNKNOWN_OUTPUT_PORT"],
  ] as const) {
    const result = normalizePluginResponseValues({
      block,
      responseValues,
      outputContract: [contract({ key: "script", portKey: "generated_text" })],
      completion: "final",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === code));
  }
});

test("validates required only on final responses and validates present partial types", () => {
  const outputContract = [
    contract({ key: "script", portKey: "generated_text" }),
    contract({ key: "notes", portKey: "notes_port", required: false }),
  ];
  assert.deepEqual(
    normalizePluginResponseValues({
      block,
      responseValues: {},
      outputContract,
      completion: "partial",
    }),
    { ok: true, values: {}, compatibility: "canonical" },
  );
  const missing = normalizePluginResponseValues({
    block,
    responseValues: {},
    outputContract,
    completion: "final",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issues[0]?.code, "MISSING_REQUIRED_OUTPUT");

  const invalidPartial = normalizePluginResponseValues({
    block,
    responseValues: { generated_text: 1 },
    outputContract,
    completion: "partial",
  });
  assert.equal(invalidPartial.ok, false);
  if (!invalidPartial.ok) assert.equal(invalidPartial.issues[0]?.code, "INCOMPATIBLE_OUTPUT_SHAPE");
});

test("allows a final response to complete from previously normalized partial values", () => {
  const result = normalizePluginResponseValues({
    block,
    responseValues: {},
    outputContract: [contract({ key: "script", portKey: "generated_text" })],
    completion: "final",
    existingValues: { script: "roteiro parcial consolidado" },
  });
  assert.deepEqual(result, {
    ok: true,
    values: { script: "roteiro parcial consolidado" },
    compatibility: "canonical",
  });
});

test("rejects scalar text for an explicitly many-shaped output", () => {
  const result = normalizePluginResponseValues({
    block,
    responseValues: { suggestions_port: "1. Um\n- Dois" },
    outputContract: [
      contract({
        key: "suggestions",
        portKey: "suggestions_port",
        shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      }),
    ],
    completion: "final",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.code === "INCOMPATIBLE_OUTPUT_SHAPE"));
  }
});

test("rejects invalid media, records and ambiguous port bindings", () => {
  const invalid = normalizePluginResponseValues({
    block,
    responseValues: {
      image_port: { id: "f", name: "audio.mp3", mimeType: "audio/mpeg", size: 1, url: "/f" },
      records_port: [{}],
    },
    outputContract: [
      contract({
        key: "cover",
        portKey: "image_port",
        shape: { kind: "content", family: "image", cardinality: "one", representation: "artifact" },
      }),
      contract({
        key: "scenes",
        portKey: "records_port",
        shape: {
          kind: "record",
          cardinality: "many",
          fields: [
            {
              id: "title",
              key: "title",
              label: "Título",
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
      }),
    ],
    completion: "final",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.issues.some((issue) => issue.code === "INCOMPATIBLE_OUTPUT_SHAPE"));
    assert.ok(invalid.issues.some((issue) => issue.code === "MISSING_REQUIRED_RECORD_FIELD"));
  }

  const ambiguous = normalizePluginResponseValues({
    block,
    responseValues: { shared: "value" },
    outputContract: [
      contract({ key: "first", portKey: "shared" }),
      contract({ key: "second", portKey: "shared" }),
    ],
    completion: "final",
  });
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.equal(ambiguous.issues[0]?.code, "AMBIGUOUS_OUTPUT_PORT");
});

test("keeps ESCOLHER on the canonical contract while requiring its exact declared port", () => {
  const outputContract = [
    contract({
      key: "selectedItemId",
      portKey: "choice_result",
      shape: { kind: "control", control: "identifier", cardinality: "one" },
    }),
  ];
  const valid = normalizePluginResponseValues({
    block: { type: "ESCOLHER" },
    responseValues: { choice_result: "item-1" },
    outputContract,
    completion: "final",
  });
  assert.deepEqual(valid, {
    ok: true,
    values: { selectedItemId: "item-1" },
    compatibility: "canonical",
  });

  const alias = normalizePluginResponseValues({
    block: { type: "ESCOLHER" },
    responseValues: { selectedItemId: "item-1" },
    outputContract,
    completion: "final",
  });
  assert.equal(alias.ok, false);
  if (!alias.ok) assert.equal(alias.issues[0]?.code, "STRATEGIC_KEY_ALIAS_NOT_ALLOWED");
});

test("throws a typed contract error for boundary callers", () => {
  assert.throws(
    () =>
      requireNormalizedPluginResponseValues({
        block,
        responseValues: { result: "legacy" },
        outputContract: [contract({ key: "script", portKey: "generated_text" })],
        completion: "final",
      }),
    (error) =>
      error instanceof PluginResponseContractError && error.code === "OUTPUT_CONTRACT_VIOLATION",
  );
});

test("aceita somente referências a IDs concedidos pela entrada declarada", () => {
  const outputContract = [
    contract({
      key: "characters",
      portKey: "records",
      shape: {
        kind: "record",
        cardinality: "many",
        fields: [
          {
            id: "name",
            key: "name",
            label: "Nome",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
          {
            id: "scenes",
            key: "scene_ids",
            label: "Cenas",
            shape: { kind: "control", control: "identifier", cardinality: "many" },
            required: true,
            referencesInputId: "all-scenes",
          },
        ],
      },
    }),
  ];
  const inputDeliveries = [
    {
      inputId: "all-scenes",
      portKey: "context_1",
      deliveryId: "delivery-scenes",
      itemIds: ["scene-1", "scene-2"],
    },
  ];
  const valid = normalizePluginResponseValues({
    block,
    responseValues: { records: [{ name: "Ana", scene_ids: ["scene-1"] }] },
    outputContract,
    inputDeliveries,
    completion: "final",
  });
  assert.equal(valid.ok, true);

  const invalid = normalizePluginResponseValues({
    block,
    responseValues: { records: [{ name: "Ana", scene_ids: ["invented"] }] },
    outputContract,
    inputDeliveries,
    completion: "final",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.issues[0]?.code, "UNKNOWN_INPUT_ITEM_REFERENCE");
});

test("aceita uma ou mais saídas atômicas para uma unidade de output many", () => {
  const image = (id: string) => ({
    id,
    name: `${id}.png`,
    mimeType: "image/png",
    size: 1,
    url: `/api/files/${id}.png`,
  });
  const outputContract = [
    contract({
      key: "images",
      portKey: "images",
      shape: {
        kind: "content",
        family: "image",
        cardinality: "many",
        representation: "artifact",
      },
    }),
  ];

  for (const value of [image("one"), [image("one"), image("two")]]) {
    const result = normalizePluginResponseValues({
      block,
      responseValues: { images: value },
      outputContract,
      completion: "final",
      valueShape: "item",
    });
    assert.equal(result.ok, true);
  }

  const invalid = normalizePluginResponseValues({
    block,
    responseValues: { images: [image("one"), "not-an-image"] },
    outputContract,
    completion: "final",
    valueShape: "item",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.issues[0]?.code, "INCOMPATIBLE_OUTPUT_SHAPE");
});

test("valida referências em registros atômicos e variantes de uma unidade", () => {
  const outputContract = [
    contract({
      key: "relations",
      portKey: "relations",
      shape: {
        kind: "record",
        cardinality: "many",
        fields: [
          {
            id: "sources",
            key: "source_ids",
            label: "Origens",
            shape: { kind: "control", control: "identifier", cardinality: "many" },
            required: true,
            referencesInputId: "sources",
          },
        ],
      },
    }),
  ];
  const result = normalizePluginResponseValues({
    block,
    responseValues: {
      relations: [{ source_ids: ["source-1"] }, { source_ids: ["invented"] }],
    },
    outputContract,
    inputDeliveries: [{ inputId: "sources", portKey: "sources", itemIds: ["source-1"] }],
    completion: "final",
    valueShape: "item",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "UNKNOWN_INPUT_ITEM_REFERENCE");
});
