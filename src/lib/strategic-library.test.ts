import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessExecution, StrategicCollection, ChannelLibraryItem } from "./domain";
import {
  captureCollectionSelection,
  completedConsumableItemIds,
  libraryReservation,
  libraryValuesIssues,
} from "./strategic-library";

const collection: StrategicCollection = {
  id: "collection",
  channelId: "channel",
  name: "Collection",
  usage: "consumable",
  createdAt: "now",
  fields: [
    {
      id: "text",
      label: "Text",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      required: true,
    },
  ],
};
const item: ChannelLibraryItem = {
  id: "item",
  channelId: "channel",
  collectionId: collection.id,
  values: { text: "Original" },
  createdAt: "now",
};
function execution(id = "execution"): ProcessExecution {
  return {
    id,
    projectId: "project",
    channelId: "channel",
    processType: "theme",
    methodSnapshot: {
      contractVersion: 3,
      name: "Method",
      processType: "theme",
      blocks: [
        {
          id: "choose",
          type: "ESCOLHER",
          operator: "Humano",
          collectionId: collection.id,
          inputs: [],
          outputs: [],
          parameters: [],
          order: 0,
        },
      ],
    },
    blocks: [{ blockId: "choose", status: "completed", values: { selectedItemId: item.id } }],
    status: "awaiting_output",
    outputStatus: "pending",
    createdAt: "now",
    updatedAt: "now",
  };
}

test("failure and cancellation preserve reservation; only Process completion consumes", () => {
  const run = execution();
  captureCollectionSelection(run, "choose", item, collection, []);
  for (const status of ["awaiting_output", "failed", "cancelled"] as const) {
    run.status = status;
    assert.equal(libraryReservation(item.id, [run])?.executionId, run.id);
    assert.deepEqual(completedConsumableItemIds(run), []);
  }
  run.status = "completed";
  assert.deepEqual(completedConsumableItemIds(run), []);
  run.outputStatus = "completed";
  run.output = { processType: "theme", values: { theme: "Complete" }, createdAt: "now" };
  assert.equal(libraryReservation(item.id, [run]), undefined);
  assert.deepEqual(completedConsumableItemIds(run), [item.id]);
});

test("selection freezes fields and usage; concurrent or foreign-channel choice is rejected", () => {
  const run = execution();
  const source = structuredClone(item);
  const definition = structuredClone(collection);
  captureCollectionSelection(run, "choose", source, definition, []);
  source.values.text = "Changed";
  definition.fields[0].label = "Changed";
  definition.usage = "fixed";
  assert.equal(run.blocks[0].collectionSelection?.item.values.text, "Original");
  assert.equal(run.blocks[0].collectionSelection?.collection.fields[0].label, "Text");
  assert.equal(run.blocks[0].collectionSelection?.usage, "consumable");
  assert.throws(() =>
    captureCollectionSelection(execution("other"), "choose", item, collection, [run]),
  );
  const foreign = execution();
  foreign.channelId = "foreign";
  assert.throws(() => captureCollectionSelection(foreign, "choose", item, collection, []));
});

test("invalidated choice releases its reservation and existing fixed collection never consumes", () => {
  const run = execution();
  captureCollectionSelection(run, "choose", item, collection, []);
  run.blocks[0].status = "pending";
  run.blocks[0].values = {};
  assert.equal(libraryReservation(item.id, [run]), undefined);
  run.blocks[0].status = "completed";
  run.blocks[0].values = { selectedItemId: item.id };
  captureCollectionSelection(run, "choose", item, { ...collection, usage: undefined }, []);
  run.status = "completed";
  assert.deepEqual(completedConsumableItemIds(run), []);
});

test("batch validation preserves canonical cardinality, family, required and URL contracts", () => {
  const fields: StrategicCollection = {
    ...collection,
    fields: [
      ...collection.fields,
      {
        id: "image",
        label: "Image",
        shape: { kind: "content", family: "image", cardinality: "one", representation: "artifact" },
        required: true,
      },
      {
        id: "url",
        label: "Link",
        shape: { kind: "control", control: "url", cardinality: "one" },
        required: true,
      },
    ],
  };
  const file = {
    id: "file",
    name: "image.png",
    size: 1,
    mimeType: "image/png",
    url: "/api/files/file.png",
  };
  const valid = { text: "Text", image: file, url: "https://example.com" };
  assert.deepEqual(libraryValuesIssues(fields, valid), []);
  for (const values of [
    { ...valid, text: "   " },
    { ...valid, text: ["list"] },
    { ...valid, image: { ...file, mimeType: "audio/wav" } },
    { ...valid, url: "javascript:alert(1)" },
  ]) {
    assert.ok(libraryValuesIssues(fields, values).length);
  }
});
