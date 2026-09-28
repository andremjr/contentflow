import assert from "node:assert/strict";
import test from "node:test";
import {
  areHumanFieldTypesCompatible,
  legacyTypeListAccepts,
  normalizeDataShape,
} from "./data-shape";

test("normaliza tipos legados em dimensões semânticas independentes", () => {
  assert.deepEqual(normalizeDataShape("textarea"), {
    kind: "text",
    cardinality: "one",
    visualFamily: "text",
    inputControl: "textarea",
  });
  assert.deepEqual(normalizeDataShape("records"), {
    kind: "record",
    cardinality: "many",
    visualFamily: "text",
    inputControl: "records",
  });
  assert.deepEqual(normalizeDataShape("image"), {
    kind: "artifact",
    cardinality: "one",
    visualFamily: "image",
    inputControl: "image",
  });
  assert.deepEqual(normalizeDataShape("files", { renderer: "image-gallery", itemType: "image" }), {
    kind: "artifact",
    cardinality: "many",
    visualFamily: "image",
    inputControl: "files",
  });
});

test("compatibilidade ignora controle visual mas preserva cardinalidade e família de artifact", () => {
  assert.equal(areHumanFieldTypesCompatible("text", "textarea"), true);
  assert.equal(areHumanFieldTypesCompatible("textarea", "text"), true);
  assert.equal(areHumanFieldTypesCompatible("image", "file"), true);
  assert.equal(areHumanFieldTypesCompatible("audio", "image"), false);
  assert.equal(areHumanFieldTypesCompatible("list", "text"), false);
  assert.equal(legacyTypeListAccepts(["textarea"], "text"), true);
  assert.equal(
    areHumanFieldTypesCompatible(
      "file",
      "file",
      { renderer: "file-list", acceptedMimeTypes: ["image/png"] },
      { renderer: "file-list", acceptedMimeTypes: ["image/*"] },
    ),
    true,
  );
  assert.equal(
    areHumanFieldTypesCompatible(
      "file",
      "file",
      { renderer: "file-list", acceptedMimeTypes: ["audio/mpeg"] },
      { renderer: "file-list", acceptedMimeTypes: ["image/*"] },
    ),
    false,
  );
});
