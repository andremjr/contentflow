import assert from "node:assert/strict";
import test from "node:test";
import {
  instructionInputKey,
  instructionInputLabel,
  instructionVariables,
  resolveInstructionTemplate,
} from "../src/lib/instruction-template";

const context = {
  channel: { name: "Captain Workout", language: "EN-US", niche: "Fitness" },
  project: { title: "Knee workout", deadline: "2026-09-01" },
  block: { name: "Criar roteiro", type: "CRIAR" },
  inputs: [
    {
      id: "input-title",
      label: "Título final",
      sourceKey: "title",
      portKey: "content",
      value: "Protect Your Knees",
    },
  ],
  parameters: { target_characters: 20_000 },
};

test("resolve variáveis universais, parâmetros e entradas declaradas", () => {
  const result = resolveInstructionTemplate(
    "{{channel.name}} | {{project.title}} | {{inputs.titulo_do_video}} | {{inputs.title}} | {{parameters.target_characters}}",
    context,
  );
  assert.equal(
    result.instruction,
    "Captain Workout | Knee workout | Protect Your Knees | Protect Your Knees | 20000",
  );
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.referencedInputIds, ["input-title"]);
});

test("preserva placeholders desconhecidos para compatibilidade e os reporta", () => {
  const result = resolveInstructionTemplate(
    "Use {{inputs.outline}} e {{LEGACY_TOKEN.value}}.",
    context,
  );
  assert.equal(result.instruction, "Use {{inputs.outline}} e {{LEGACY_TOKEN.value}}.");
  assert.deepEqual(result.unresolved, ["inputs.outline", "LEGACY_TOKEN.value"]);
  assert.deepEqual(result.referencedInputIds, []);
});

test("resolve a chave efetivamente escolhida pelo binding automático", () => {
  const result = resolveInstructionTemplate("Resultados: {{inputs.items_found}}", {
    ...context,
    inputs: [
      {
        id: "automatic-input",
        label: "Nova entrada",
        sourceKey: "items_found",
        portKey: "content",
        value: ["Título A", "Título B"],
      },
    ],
  });

  assert.equal(result.instruction, 'Resultados: [\n  "Título A",\n  "Título B"\n]');
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.referencedInputIds, ["automatic-input"]);
});

test("gera chaves humanas estáveis para o seletor de variáveis", () => {
  assert.equal(
    instructionInputKey({ id: "abc", label: "Título final", sourceKey: "title" }),
    "titulo_do_video",
  );
  assert.equal(instructionInputKey({ id: "abc", label: "Referência visual" }), "referencia_visual");
  assert.equal(
    instructionInputLabel({ id: "abc", label: "Video topic", sourceKey: "video_topic" }),
    "Tema do vídeo",
  );
  assert.deepEqual(instructionVariables("{{project.title}} {{ inputs.title }}"), [
    "project.title",
    "inputs.title",
  ]);
});

test("padroniza os oito resultados universais na linguagem da interface", () => {
  const cases = [
    ["Video topic", "video_topic", "tema_do_video", "Tema do vídeo"],
    ["Final title", "title", "titulo_do_video", "Título do vídeo"],
    ["Final thumbnail", "thumbnail", "thumbnail_do_video", "Thumbnail do vídeo"],
    ["Final script", "script", "roteiro_do_video", "Roteiro do vídeo"],
    ["Final narration", "audio", "narracao_do_video", "Narração do vídeo"],
    ["Visual assets", "assets", "assets_visuais_do_video", "Assets visuais do vídeo"],
    ["Edited video", "video", "video_editado", "Vídeo editado"],
    ["Publication URL", "url", "link_da_publicacao", "Link da publicação"],
  ] as const;

  for (const [label, sourceKey, key, displayLabel] of cases) {
    const input = { id: sourceKey, label, sourceKey };
    assert.equal(instructionInputKey(input), key);
    assert.equal(instructionInputLabel(input), displayLabel);
  }
});
