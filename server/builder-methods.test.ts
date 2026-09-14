import assert from "node:assert/strict";
import test from "node:test";
import type { Channel, ProcessMethod } from "../src/lib/domain";
import { validateBuilderMethods } from "./builder-methods";

const channel = {
  id: "channel-1",
  name: "Canal de teste",
  handle: "@teste",
  niche: "Educação",
  language: "pt-BR",
  methods: {},
} as Channel;

function manualThemeMethod(): ProcessMethod {
  return {
    name: "Tema manual",
    processType: "theme",
    blocks: [
      {
        id: "theme-input",
        type: "CRIAR",
        operator: "Humano",
        name: "Inserir tema",
        instructions: "Insira o tema definido externamente.",
        inputs: [],
        outputs: [
          {
            id: "theme-output",
            label: "Tema final",
            key: "theme",
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

test("accepts a complete manual Method without requiring a plugin", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: manualThemeMethod() },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.methods?.theme?.blocks[0].operator, "Humano");
});

test("rejects unknown universal processes", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { research: { ...manualThemeMethod(), processType: "theme" } },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Processo universal desconhecido/);
});

test("rejects a previous_block reference to a later block", () => {
  const method = manualThemeMethod();
  method.blocks[0].inputs = [
    {
      id: "future-input",
      label: "Resultado futuro",
      type: "text",
      source: "previous_block",
      blockId: "future-block",
      sourceKey: "future",
    },
  ];
  method.blocks.push({
    id: "future-block",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      { id: "future-output", label: "Futuro", key: "future", type: "text", required: true },
    ],
    parameters: [],
    order: 1,
  });
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /referência inválida/);
});
