import assert from "node:assert/strict";
import test from "node:test";

import type { BlockInputBinding } from "../src/lib/domain";
import type { PluginInputPort } from "../src/lib/plugin-contract";
import { composePluginPortValue, selectPluginInputPort } from "./plugin-input-values";

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

test("não escolhe porta por apresentação ou MIME sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "images",
      label: "Imagens",
      acceptedTypes: ["image", "files"],
      required: true,
      multiple: true,
      presentation: {
        renderer: "image-gallery",
        itemType: "image",
        acceptedMimeTypes: ["image/jpeg", "image/png"],
      },
    },
    {
      key: "subtitles",
      label: "Legendas",
      acceptedTypes: ["file", "files"],
      required: false,
      multiple: true,
      presentation: {
        renderer: "file-list",
        itemType: "file",
        acceptedMimeTypes: ["application/x-subrip", "text/plain"],
      },
    },
  ];
  const subtitles: BlockInputBinding = {
    id: "srt",
    label: "English SRT",
    type: "files",
    source: "previous_process",
    presentation: {
      renderer: "file-list",
      itemType: "file",
      acceptedMimeTypes: ["text/srt", "text/plain"],
    },
  };

  assert.equal(selectPluginInputPort(subtitles, ports, new Set()), undefined);
});

test("não escolhe porta por sourceKey sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "images",
      label: "Imagens",
      acceptedTypes: ["files"],
      required: true,
      multiple: true,
    },
    {
      key: "subtitles",
      label: "Legendas",
      acceptedTypes: ["files"],
      required: false,
      multiple: true,
    },
  ];
  const subtitles: BlockInputBinding = {
    id: "editing-subtitles-input",
    label: "English SRT",
    type: "files",
    source: "previous_process",
    sourceKey: "subtitles",
    presentation: { renderer: "auto" },
  };

  assert.equal(selectPluginInputPort(subtitles, ports, new Set()), undefined);
});

test("não escolhe porta por label mesmo com duas candidatas compatíveis", () => {
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto para geração",
      acceptedTypes: ["text", "textarea", "number"],
      required: false,
      multiple: true,
    },
    {
      key: "sections",
      label: "Quantidade de blocos",
      acceptedTypes: ["number", "text", "textarea"],
      required: false,
      multiple: false,
    },
  ];
  const input: BlockInputBinding = {
    id: "section-count",
    label: "Quantidade de blocos",
    type: "number",
    source: "static",
    staticValue: "1",
  };

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("não escolhe a única porta compatível sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "additional_context",
      label: "Contexto adicional",
      acceptedTypes: ["textarea"],
      required: false,
      multiple: true,
    },
  ];

  const input: BlockInputBinding = {
    id: "context",
    label: "Contexto adicional",
    type: "textarea",
    source: "previous_block",
  };

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("respeita a porta explícita escolhida no editor mesmo quando outra aparece primeiro", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    type: "list",
    source: "previous_block",
    portKey: "outline",
  };
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto",
      acceptedTypes: ["list"],
      required: false,
      multiple: true,
    },
    {
      key: "outline",
      label: "Estrutura",
      acceptedTypes: ["list"],
      required: false,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set())?.key, "outline");
});

test("não mascara uma porta explícita inválida com binding automático", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    type: "list",
    source: "previous_block",
    portKey: "sections",
  };
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto",
      acceptedTypes: ["list"],
      required: false,
      multiple: true,
    },
    {
      key: "sections",
      label: "Quantidade",
      acceptedTypes: ["number"],
      required: false,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("não remapeia a segunda entrada de uma porta explícita não-multiple", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    type: "list",
    source: "previous_block",
    portKey: "outline",
  };
  const ports: PluginInputPort[] = [
    {
      key: "outline",
      label: "Estrutura",
      acceptedTypes: ["list"],
      required: false,
      multiple: false,
    },
    {
      key: "fallback",
      label: "Alternativa",
      acceptedTypes: ["list"],
      required: false,
      multiple: true,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set(["outline"])), undefined);
});
