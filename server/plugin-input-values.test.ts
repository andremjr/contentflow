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
