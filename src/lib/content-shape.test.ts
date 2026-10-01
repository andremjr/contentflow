import assert from "node:assert/strict";
import test from "node:test";
import {
  areInputShapesCompatible,
  areValueShapesCompatible,
  consumeInputValue,
  contentShape,
  controlShape,
  recordShape,
  validateValueShape,
} from "./data-shape";
import { validateRuntimeValueAgainstShape } from "./runtime-value-validation";

test("o contrato canônico possui somente quatro famílias de conteúdo", () => {
  for (const family of ["text", "image", "audio", "video"] as const) {
    assert.equal(contentShape(family).family, family);
  }
  assert.throws(() => contentShape("image", "one", "inline"), /artifact/);
});

test("cardinalidade é explícita e participa da compatibilidade", () => {
  const one = contentShape("text", "one", "inline");
  const many = contentShape("text", "many", "inline");
  assert.equal(areValueShapesCompatible(one, one), true);
  assert.equal(areValueShapesCompatible(one, many), false);
});

test("somente texto inline many pode ser consumido como texto inline one", () => {
  const many = contentShape("text", "many", "inline");
  const one = contentShape("text", "one", "inline");
  assert.equal(areValueShapesCompatible(many, one), false);
  assert.equal(areInputShapesCompatible(many, one), true);
  assert.equal(consumeInputValue(many, one, ["Cena 1", "Cena 2"]), "Cena 1\n\nCena 2");
  assert.equal(
    areInputShapesCompatible(
      contentShape("image", "many", "artifact"),
      contentShape("image", "one", "artifact"),
    ),
    false,
  );
});

test("arquivo é representação, não família", () => {
  const inline = contentShape("text", "one", "inline");
  const artifact = contentShape("text", "one", "artifact", {
    mimeTypes: ["text/plain", "text/markdown"],
    extensions: ["txt", ".md"],
  });
  assert.equal(inline.family, "text");
  assert.equal(artifact.family, "text");
  assert.equal(artifact.representation, "artifact");
  assert.deepEqual(artifact.formats?.extensions, ["txt", "md"]);
  assert.equal(areValueShapesCompatible(inline, artifact), false);
});

test("controle e registros não viram famílias de conteúdo", () => {
  const approval = controlShape("approval");
  const records = recordShape("many", [
    {
      id: "scene-prompt",
      label: "Prompt",
      key: "prompt",
      shape: contentShape("text"),
      required: true,
    },
  ]);
  assert.equal(approval.kind, "control");
  assert.equal(records.kind, "record");
  assert.equal(validateValueShape(records).length, 0);
});

test("restrições materiais participam da compatibilidade", () => {
  const png = contentShape("image", "one", "artifact", { mimeTypes: ["image/png"] });
  const jpeg = contentShape("image", "one", "artifact", { mimeTypes: ["image/jpeg"] });
  const anyImage = contentShape("image", "one", "artifact", { mimeTypes: ["image/*"] });
  const pngOrJpeg = contentShape("image", "one", "artifact", {
    mimeTypes: ["image/png", "image/jpeg"],
  });
  assert.equal(areValueShapesCompatible(png, jpeg), false);
  assert.equal(areValueShapesCompatible(png, anyImage), true);
  assert.equal(areValueShapesCompatible(anyImage, png), false);
  assert.equal(areValueShapesCompatible(pngOrJpeg, png), false);
  assert.equal(areValueShapesCompatible(png, pngOrJpeg), true);
});

test("restrições de extensão também são direcionais", () => {
  const png = contentShape("image", "one", "artifact", { extensions: ["png"] });
  const pngOrJpeg = contentShape("image", "one", "artifact", {
    extensions: ["png", "jpeg"],
  });
  const unconstrained = contentShape("image", "one", "artifact");
  assert.equal(areValueShapesCompatible(png, pngOrJpeg), true);
  assert.equal(areValueShapesCompatible(pngOrJpeg, png), false);
  assert.equal(areValueShapesCompatible(unconstrained, png), false);
  assert.equal(areValueShapesCompatible(png, unconstrained), true);
});

test("RuntimeValue é validado pela família, representação, formatos e cardinalidade", () => {
  const shape = contentShape("image", "one", "artifact", {
    mimeTypes: ["image/png"],
    extensions: ["png"],
  });
  const png = {
    id: "image-1",
    name: "frame.png",
    mimeType: "image/png",
    size: 12,
    url: "/api/files/image-1",
  };
  assert.deepEqual(validateRuntimeValueAgainstShape(shape, png), []);
  assert.equal(
    validateRuntimeValueAgainstShape(shape, { ...png, name: "frame.jpg" })[0]?.code,
    "EXTENSION_MISMATCH",
  );
  assert.equal(
    validateRuntimeValueAgainstShape(shape, { ...png, mimeType: "image/jpeg" })[0]?.code,
    "MIME_TYPE_MISMATCH",
  );
  assert.equal(validateRuntimeValueAgainstShape(shape, [png])[0]?.code, "CARDINALITY_MISMATCH");
  assert.equal(
    validateRuntimeValueAgainstShape(contentShape("audio", "one", "artifact"), png)[0]?.code,
    "CONTENT_FAMILY_MISMATCH",
  );
});

test("registro exige chaves únicas", () => {
  const invalid = recordShape("many", [
    { id: "a", label: "A", key: "value", shape: contentShape("text"), required: true },
    { id: "b", label: "B", key: "value", shape: contentShape("text"), required: true },
  ]);
  assert.equal(validateValueShape(invalid)[0]?.code, "DUPLICATE_RECORD_FIELD");
});

test("relação entre itens só pode ser declarada em identifier", () => {
  const valid = recordShape("many", [
    {
      id: "scenes",
      label: "Cenas",
      key: "scene_ids",
      shape: controlShape("identifier", "many"),
      required: true,
      referencesInputId: "scene-prompts",
    },
  ]);
  assert.deepEqual(validateValueShape(valid), []);
  const invalid = recordShape("many", [
    {
      id: "scenes",
      label: "Cenas",
      key: "scene_ids",
      shape: contentShape("text", "many", "inline"),
      required: true,
      referencesInputId: "scene-prompts",
    },
  ]);
  assert.equal(validateValueShape(invalid)[0]?.code, "INVALID_ITEM_REFERENCE_FIELD");
});
