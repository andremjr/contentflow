import assert from "node:assert/strict";
import test from "node:test";

import { composePluginPortValue } from "./plugin-input-values";

test("preserva uma lista atribuída sozinha a uma porta de plugin", () => {
  const prompts = ["primeiro prompt", "segundo prompt", "terceiro prompt"];

  const value = composePluginPortValue([{ label: "Prompts", value: prompts }]);

  assert.deepEqual(value, prompts);
  assert.ok(Array.isArray(value));
});

test("mantém a composição textual para várias entradas atribuídas à mesma porta", () => {
  const value = composePluginPortValue([
    { label: "Tema", value: "oceano" },
    { label: "Tom", value: "cinematográfico" },
  ]);

  assert.equal(value, 'Tema: "oceano"\nTom: "cinematográfico"');
});
