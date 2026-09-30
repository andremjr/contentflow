import assert from "node:assert/strict";
import test from "node:test";
import {
  areValueShapesCompatible,
  contentShape,
  controlShape,
  recordShape,
  validateValueShape,
} from "./data-shape";

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
  assert.equal(areValueShapesCompatible(png, jpeg), false);
  assert.equal(areValueShapesCompatible(png, anyImage), true);
});

test("registro exige chaves únicas", () => {
  const invalid = recordShape("many", [
    { id: "a", label: "A", key: "value", shape: contentShape("text"), required: true },
    { id: "b", label: "B", key: "value", shape: contentShape("text"), required: true },
  ]);
  assert.equal(validateValueShape(invalid)[0]?.code, "DUPLICATE_RECORD_FIELD");
});
