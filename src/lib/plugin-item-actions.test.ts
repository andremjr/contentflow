import assert from "node:assert/strict";
import test from "node:test";
import { isLocalStoredFileUrl, normalizeItemReplacement } from "./plugin-item-actions";

const image = (url: string) => ({
  id: "image",
  name: "image.png",
  mimeType: "image/png",
  size: 10,
  url,
});

test("replace valida texto e mídia local no núcleo", () => {
  assert.equal(normalizeItemReplacement("antes", "depois"), "depois");
  assert.deepEqual(normalizeItemReplacement(["antes"], "depois"), ["depois"]);
  assert.deepEqual(
    normalizeItemReplacement(image("/api/files/original.png"), image("/api/files/new.png")),
    image("/api/files/new.png"),
  );
  assert.throws(
    () => normalizeItemReplacement("antes", image("/api/files/new.png")),
    /somente texto/,
  );
  assert.throws(
    () =>
      normalizeItemReplacement(
        image("/api/files/original.png"),
        image("https://cdn.example/new.png"),
      ),
    /vídeo local/,
  );
});

test("download local aceita somente URLs materializadas pelo núcleo", () => {
  assert.equal(isLocalStoredFileUrl("/api/files/image.png"), true);
  assert.equal(isLocalStoredFileUrl("https://cdn.example/image.png"), false);
  assert.equal(isLocalStoredFileUrl("artifact://image"), false);
});
