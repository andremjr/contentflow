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
    type: value.type ?? "text",
    required: value.required ?? true,
    options: value.options,
    recordFields: value.recordFields,
    presentation: value.presentation,
  };
}

test("maps each declared technical port to its strategic output key", () => {
  const result = normalizePluginResponseValues({
    block,
    responseValues: { generated_text: "roteiro", score_port: 9 },
    outputContract: [
      contract({ key: "script", portKey: "generated_text" }),
      contract({ key: "quality", portKey: "score_port", type: "number" }),
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
  if (!invalidPartial.ok) assert.equal(invalidPartial.issues[0]?.code, "INCOMPATIBLE_OUTPUT_TYPE");
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

test("preserves the allowed text-to-list shape normalization without guessing identity", () => {
  const result = requireNormalizedPluginResponseValues({
    block,
    responseValues: { suggestions_port: "1. Um\n- Dois" },
    outputContract: [contract({ key: "suggestions", portKey: "suggestions_port", type: "list" })],
    completion: "final",
  });
  assert.deepEqual(result.values, { suggestions: ["Um", "Dois"] });
});

test("rejects invalid media, records and ambiguous port bindings", () => {
  const invalid = normalizePluginResponseValues({
    block,
    responseValues: {
      image_port: { id: "f", name: "audio.mp3", mimeType: "audio/mpeg", size: 1, url: "/f" },
      records_port: [{}],
    },
    outputContract: [
      contract({ key: "cover", portKey: "image_port", type: "image" }),
      contract({
        key: "scenes",
        portKey: "records_port",
        type: "records",
        recordFields: [
          { id: "title", key: "title", label: "Título", type: "text", required: true },
        ],
      }),
    ],
    completion: "final",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.issues.some((issue) => issue.code === "INCOMPATIBLE_OUTPUT_TYPE"));
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

test("keeps ESCOLHER specialized while requiring its exact synthetic port", () => {
  const outputContract = [contract({ key: "selectedItemId", portKey: "choice_result" })];
  const valid = normalizePluginResponseValues({
    block: { type: "ESCOLHER" },
    responseValues: { choice_result: "item-1" },
    outputContract,
    completion: "final",
  });
  assert.deepEqual(valid, {
    ok: true,
    values: { selectedItemId: "item-1" },
    compatibility: "historical_choose_contract",
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
