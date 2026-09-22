import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_OPERATORS,
  BLOCK_TYPES,
  PROCESS_META,
  PROCESS_ORDER,
  createEmptyMethods,
} from "./domain";

test("preserves the ContentFlow universal grammar", () => {
  assert.deepEqual(PROCESS_ORDER, [
    "theme",
    "title",
    "thumbnail",
    "script",
    "narration",
    "assets",
    "editing",
    "publishing",
  ]);
  assert.equal(new Set(PROCESS_ORDER).size, 8);
  assert.deepEqual(BLOCK_TYPES, ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]);
  assert.deepEqual(BLOCK_OPERATORS, ["IA", "Humano", "Código"]);
});

test("keeps every universal process represented by metadata and an empty Method slot", () => {
  const methods = createEmptyMethods();
  assert.deepEqual(Object.keys(PROCESS_META).sort(), [...PROCESS_ORDER].sort());
  assert.deepEqual(Object.keys(methods).sort(), [...PROCESS_ORDER].sort());
  for (const processType of PROCESS_ORDER) {
    assert.equal(methods[processType].processType, processType);
  }
});
