import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessMethod } from "./domain";
import {
  createValidationFields,
  getMethodConfigurationIssue,
  normalizeMethodBlocks,
} from "./human-workflow";

function createBlock(id: string, order: number, outputs = ["value"]): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "Humano",
    name: id,
    inputs: [],
    outputs: outputs.map((key, index) => ({
      id: `${id}-${key}`,
      label: key,
      key,
      shape: {
        kind: "content",
        family: "text",
        cardinality: index === 0 ? "many" : "one",
        representation: "inline",
      },
      required: true,
    })),
    parameters: [],
    order,
  };
}

function validateBlock(
  id: string,
  order: number,
  targetBlockId: string,
  mode: "approval" | "select_one" | "select_many" = "approval",
  targetOutputKey?: string,
): ActionBlock {
  return {
    id,
    type: "VALIDAR",
    operator: "Humano",
    name: id,
    inputs: [],
    outputs: createValidationFields(mode, targetBlockId, targetOutputKey, {
      kind: "content",
      family: "text",
      cardinality: "many",
      representation: "inline",
    }),
    validation: {
      targetBlockId,
      targetOutputKey,
      mode,
      onReject: "retry_target",
      maxAttempts: 3,
      retryMode: "full",
    },
    parameters: [],
    order,
  };
}

function method(blocks: ActionBlock[]): ProcessMethod {
  return { contractVersion: 3, name: "Explicit validation", processType: "theme", blocks };
}

test("explicit target remains authoritative when another block is immediately before VALIDAR", () => {
  const blocks = [createBlock("a", 0), createBlock("b", 1), validateBlock("review", 2, "a")];
  const normalized = normalizeMethodBlocks(blocks, "theme");

  assert.equal(normalized[2].validation?.targetBlockId, "a");
  assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
});

test("missing target remains missing and fails configuration instead of selecting the prior block", () => {
  const normalized = normalizeMethodBlocks(
    [createBlock("a", 0), validateBlock("review", 1, "")],
    "theme",
  );

  assert.equal(normalized[1].validation?.targetBlockId, "");
  assert.match(
    getMethodConfigurationIssue(method(normalized)) ?? "",
    /Selecione um bloco anterior/,
  );
});

test("future and VALIDAR targets fail structural configuration", () => {
  const future = method([validateBlock("review", 0, "future"), createBlock("future", 1)]);
  assert.match(getMethodConfigurationIssue(future) ?? "", /Selecione um bloco anterior/);

  const firstReview = validateBlock("first-review", 1, "source");
  const secondReview = validateBlock("second-review", 2, "first-review");
  assert.match(
    getMethodConfigurationIssue(method([createBlock("source", 0), firstReview, secondReview])) ??
      "",
    /Buscar, Escolher ou Criar/,
  );
});

for (const mode of ["select_one", "select_many"] as const) {
  test(`${mode} preserves the explicitly selected output and mirrors it in its own output`, () => {
    const target = createBlock("generator", 0, ["other", "candidates"]);
    const review = validateBlock("review", 1, target.id, mode, "candidates");
    const normalized = normalizeMethodBlocks([target, review], "theme");
    const selected = normalized[1].outputs?.find((output) =>
      ["selected_value", "selected_values"].includes(output.key),
    );

    assert.equal(normalized[1].validation?.targetOutputKey, "candidates");
    assert.equal(selected?.optionsSourceBlockId, "generator");
    assert.equal(selected?.optionsSourceKey, "candidates");
    assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
  });
}

test("selection without an existing explicit output fails and never falls back by type or order", () => {
  const target = createBlock("generator", 0, ["first-list", "second"]);
  const review = validateBlock("review", 1, target.id, "select_one", "missing");
  const normalized = normalizeMethodBlocks([target, review], "theme");

  assert.equal(normalized[1].validation?.targetOutputKey, "missing");
  assert.match(getMethodConfigurationIssue(method(normalized)) ?? "", /Selecione qual saída/);
});

test("reordering outputs or inserting a block does not reinterpret explicit validation references", () => {
  const target = createBlock("target", 0, ["first", "chosen"]);
  const review = validateBlock("review", 1, target.id, "select_one", "chosen");
  const reorderedTarget = { ...target, outputs: [...(target.outputs ?? [])].reverse() };
  const inserted = createBlock("inserted", 1);
  const reorderedReview = { ...review, order: 2 };

  const outputReordered = normalizeMethodBlocks([reorderedTarget, review], "theme");
  const blockInserted = normalizeMethodBlocks([target, inserted, reorderedReview], "theme");

  assert.equal(outputReordered[1].validation?.targetOutputKey, "chosen");
  assert.equal(blockInserted[2].validation?.targetBlockId, "target");
});

test("approval validates the block as a unit and does not require targetOutputKey", () => {
  const blocks = [
    createBlock("target", 0, ["draft", "notes"]),
    validateBlock("review", 1, "target"),
  ];
  const normalized = normalizeMethodBlocks(blocks, "theme");

  assert.equal(normalized[1].validation?.targetOutputKey, undefined);
  assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
});
