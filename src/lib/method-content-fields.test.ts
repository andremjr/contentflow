import assert from "node:assert/strict";
import test from "node:test";
import { contentShape, controlShape, recordShape } from "./data-shape";
import { isMethodContentField, replaceMethodContentFields } from "./method-content-fields";
import type { BlockFieldDefinition } from "./domain";

test("strategic projection exposes only the four content families without changing internal contracts", () => {
  const fields: BlockFieldDefinition[] = [
    ...(["text", "image", "audio", "video"] as const).map((family) => ({
      id: family,
      key: family,
      label: family,
      shape: contentShape(family),
      required: true,
    })),
    {
      id: "relation",
      key: "relation",
      label: "Relation",
      shape: recordShape("many", []),
      required: true,
    },
    {
      id: "decision",
      key: "decision",
      label: "Decision",
      shape: controlShape("approval"),
      required: true,
    },
  ];
  const before = structuredClone(fields);
  assert.deepEqual(
    fields.filter(isMethodContentField).map((field) => field.key),
    ["text", "image", "audio", "video"],
  );
  assert.deepEqual(fields, before);
  const replacement = replaceMethodContentFields(fields, [
    { ...fields[0], key: "new_text" },
    { ...fields[0], key: "relation" },
    fields[5],
  ]);
  assert.deepEqual(
    replacement.map((field) => field.key),
    ["relation", "decision", "new_text"],
  );
  assert.equal(replacement[0], fields[4]);
  assert.equal(replacement[1], fields[5]);
});
