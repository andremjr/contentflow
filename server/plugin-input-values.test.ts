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

test("não compõe silenciosamente várias entradas na mesma porta", () => {
  const value = composePluginPortValue([
    { label: "Tema", value: "oceano" },
    { label: "Tom", value: "cinematográfico" },
  ]);

  assert.equal(value, undefined);
});

test("não escolhe porta por apresentação ou MIME sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "images",
      label: "Imagens",
      shape: { kind: "content", family: "image", cardinality: "many", representation: "artifact" },
      required: true,
      presentation: {
        renderer: "image-gallery",
        itemType: "image",
      },
    },
    {
      key: "subtitles",
      label: "Legendas",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "artifact" },
      required: false,
      presentation: {
        renderer: "file-list",
        itemType: "file",
      },
    },
  ];
  const subtitles: BlockInputBinding = {
    id: "srt",
    label: "English SRT",
    shape: { kind: "content", family: "text", cardinality: "many", representation: "artifact" },
    binding: { kind: "previous_process", processType: "editing", outputKey: "subtitles" },
    presentation: {
      renderer: "file-list",
      itemType: "file",
    },
  };

  assert.equal(selectPluginInputPort(subtitles, ports, new Set()), undefined);
});

test("não escolhe porta por sourceKey sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "images",
      label: "Imagens",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "artifact" },
      required: true,
    },
    {
      key: "subtitles",
      label: "Legendas",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "artifact" },
      required: false,
    },
  ];
  const subtitles: BlockInputBinding = {
    id: "editing-subtitles-input",
    label: "English SRT",
    shape: { kind: "content", family: "text", cardinality: "many", representation: "artifact" },
    binding: { kind: "previous_process", processType: "editing", outputKey: "subtitles" },
    presentation: { renderer: "auto" },
  };

  assert.equal(selectPluginInputPort(subtitles, ports, new Set()), undefined);
});

test("não escolhe porta por label mesmo com duas candidatas compatíveis", () => {
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto para geração",
      shape: { kind: "control", control: "number", cardinality: "one" },
      required: false,
    },
    {
      key: "sections",
      label: "Quantidade de blocos",
      shape: { kind: "control", control: "number", cardinality: "one" },
      required: false,
    },
  ];
  const input: BlockInputBinding = {
    id: "section-count",
    label: "Quantidade de blocos",
    shape: { kind: "control", control: "number", cardinality: "one" },
    binding: { kind: "static", value: "1" },
  };

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("não escolhe a única porta compatível sem portKey explícita", () => {
  const ports: PluginInputPort[] = [
    {
      key: "additional_context",
      label: "Contexto adicional",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      required: false,
    },
  ];

  const input: BlockInputBinding = {
    id: "context",
    label: "Contexto adicional",
    shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
    binding: { kind: "previous_block", blockId: "source", outputKey: "context" },
  };

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("respeita a porta explícita escolhida no editor mesmo quando outra aparece primeiro", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
    binding: { kind: "previous_block", blockId: "source", outputKey: "prompts" },
    portKey: "outline",
  };
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      required: false,
    },
    {
      key: "outline",
      label: "Estrutura",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      required: false,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set())?.key, "outline");
});

test("não mascara uma porta explícita inválida com binding automático", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
    binding: { kind: "previous_block", blockId: "source", outputKey: "prompts" },
    portKey: "sections",
  };
  const ports: PluginInputPort[] = [
    {
      key: "content",
      label: "Contexto",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      required: false,
    },
    {
      key: "sections",
      label: "Quantidade",
      shape: { kind: "control", control: "number", cardinality: "one" },
      required: false,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set()), undefined);
});

test("não remapeia a segunda entrada de uma porta explícita não-multiple", () => {
  const input: BlockInputBinding = {
    id: "prompts",
    label: "Sequência de prompts",
    shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
    binding: { kind: "previous_block", blockId: "source", outputKey: "prompts" },
    portKey: "outline",
  };
  const ports: PluginInputPort[] = [
    {
      key: "outline",
      label: "Estrutura",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      required: false,
    },
    {
      key: "fallback",
      label: "Alternativa",
      shape: { kind: "content", family: "text", cardinality: "many", representation: "inline" },
      required: false,
    },
  ];

  assert.equal(selectPluginInputPort(input, ports, new Set(["outline"])), undefined);
});
