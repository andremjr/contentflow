import assert from "node:assert/strict";
import test from "node:test";
import type { ChannelLibraryItem, StrategicCollection } from "../src/lib/domain";
import { collectionItemValuesForPlugin } from "../src/lib/plugin-collection";

test("envia todos os campos do item estratégico ao plugin com nomes compreensíveis", () => {
  const collection: StrategicCollection = {
    id: "angles",
    channelId: "channel-1",
    name: "Ângulos",
    fields: [
      { id: "name", label: "Ângulo", type: "text", required: true },
      { id: "description", label: "Descrição", type: "textarea", required: true },
    ],
    createdAt: "2026-08-30T00:00:00.000Z",
  };
  const item: ChannelLibraryItem = {
    id: "angle-1",
    channelId: "channel-1",
    collectionId: "angles",
    values: { name: "Imersivo", description: "Coloca o espectador dentro do evento." },
    createdAt: "2026-08-30T00:00:00.000Z",
  };

  assert.deepEqual(collectionItemValuesForPlugin(collection, item), {
    Ângulo: "Imersivo",
    Descrição: "Coloca o espectador dentro do evento.",
  });
});
