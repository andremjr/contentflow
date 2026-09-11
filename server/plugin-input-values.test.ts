import assert from "node:assert/strict";
import test from "node:test";

import type { BlockInputBinding, RuntimeValue } from "../src/lib/domain";
import type { PluginInputPort } from "../src/lib/plugin-contract";
import {
  composePluginPortValue,
  selectPluginImplicitContextPort,
  selectPluginInputPort,
} from "./plugin-input-values";

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

test("distingue coleções de imagens e legendas pelo contrato de apresentação", () => {
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

  assert.equal(selectPluginInputPort(subtitles, ports, new Set())?.key, "subtitles");
});

test("usa a chave técnica da origem quando a apresentação do Método é automática", () => {
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

  assert.equal(selectPluginInputPort(subtitles, ports, new Set())?.key, "subtitles");
});

test("não injeta contexto implícito em uma porta textual especializada", () => {
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
  const methodInputs: BlockInputBinding[] = [
    {
      id: "title-structure",
      label: "estrutura escolhida",
      type: "text",
      source: "previous_block",
    },
    {
      id: "video-theme",
      label: "Tema do vídeo",
      type: "textarea",
      source: "previous_process",
      sourceKey: "theme",
    },
  ];
  const usedPorts = new Set<string>();
  const assigned = methodInputs.map((input) => {
    const port = selectPluginInputPort(input, ports, usedPorts);
    if (port && !port.multiple) usedPorts.add(port.key);
    return { input, port };
  });
  const assignedValues = Object.fromEntries(
    ports.flatMap((port) => {
      const matching = assigned.filter((item) => item.port?.key === port.key);
      return matching.length
        ? [
            [
              port.key,
              composePluginPortValue(
                matching.map(({ input }) => ({ label: input.label, value: input.label })),
              ),
            ],
          ]
        : [];
    }),
  ) as Record<string, RuntimeValue>;

  assert.deepEqual(
    assigned.map((item) => item.port?.key),
    ["content", "content"],
  );
  assert.equal(selectPluginImplicitContextPort(ports, assignedValues), undefined);
  assert.equal(assignedValues.sections, undefined);
});

test("usa uma porta semântica livre para o contexto implícito", () => {
  const ports: PluginInputPort[] = [
    {
      key: "sections",
      label: "Quantidade de blocos",
      acceptedTypes: ["number", "text"],
      required: false,
      multiple: false,
    },
    {
      key: "additional_context",
      label: "Contexto adicional",
      acceptedTypes: ["textarea"],
      required: false,
      multiple: true,
    },
  ];

  assert.equal(selectPluginImplicitContextPort(ports, {})?.key, "additional_context");
});

test("prioriza o rótulo semântico da porta sobre uma porta genérica", () => {
  const input: BlockInputBinding = {
    id: "title-create-section-count",
    label: "Quantidade de blocos",
    type: "number",
    source: "static",
    staticValue: "1",
  };
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

  assert.equal(selectPluginInputPort(input, ports, new Set())?.key, "sections");
});
