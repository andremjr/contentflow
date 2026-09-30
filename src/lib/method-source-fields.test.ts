import assert from "node:assert/strict";
import test from "node:test";

import type { ActionBlock, StrategicCollection } from "./domain";
import { getBlockSourceFields } from "./method-source-fields";

test("expõe os campos da coleção como saídas selecionáveis de ESCOLHER", () => {
  const block: ActionBlock = {
    id: "choose-layout",
    type: "ESCOLHER",
    operator: "Humano",
    name: "Escolher layout",
    collectionId: "thumbnail-layouts",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const collections: StrategicCollection[] = [
    {
      id: "thumbnail-layouts",
      channelId: "channel-a",
      name: "Layouts de thumbnail",
      fields: [
        {
          id: "layout-name",
          label: "Nome do layout",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          required: true,
        },
        {
          id: "layout",
          label: "Layout",
          shape: { kind: "control", control: "thumbnail_layout", cardinality: "one" },
          required: true,
        },
      ],
      createdAt: "2026-09-11T00:00:00.000Z",
    },
  ];

  assert.deepEqual(
    getBlockSourceFields(block, collections).map((field) => ({
      key: field.key,
      label: field.label,
      shape: field.shape,
    })),
    [
      {
        key: "layout-name",
        label: "Nome do layout",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
      {
        key: "layout",
        label: "Layout",
        shape: { kind: "control", control: "thumbnail_layout", cardinality: "one" },
      },
    ],
  );
});

test("preserva as saídas declaradas dos demais blocos", () => {
  const block: ActionBlock = {
    id: "create-title",
    type: "CRIAR",
    operator: "IA",
    name: "Criar título",
    inputs: [],
    outputs: [
      {
        id: "title-output",
        label: "Título",
        key: "title",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };

  assert.equal(getBlockSourceFields(block, [])[0], block.outputs?.[0]);
});
