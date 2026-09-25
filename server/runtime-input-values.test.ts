import assert from "node:assert/strict";
import test from "node:test";
import type { BlockInputBinding, StoredFile } from "../src/lib/domain";
import { runtimeInputsReady, validateRuntimeInputValues } from "./runtime-input-values";

const imageInput: BlockInputBinding = {
  id: "references",
  label: "Referências",
  type: "files",
  source: "runtime",
  portKey: "reference_images",
  presentation: {
    renderer: "image-gallery",
    itemType: "image",
    acceptedMimeTypes: ["image/*"],
  },
};

const image: StoredFile = {
  id: "image-1",
  name: "reference.png",
  mimeType: "image/png",
  size: 42,
  url: "/api/files/image-1.png",
};

test("accepts core-managed runtime files declared by a plugin port", () => {
  const result = validateRuntimeInputValues([imageInput], { references: [image] });
  assert.deepEqual(result, { values: { references: [image] } });
  assert.equal(runtimeInputsReady([imageInput], result.values), true);
});

test("rejects external and MIME-incompatible runtime files", () => {
  const external = validateRuntimeInputValues([imageInput], {
    references: [{ ...image, url: "https://example.com/reference.png" }],
  });
  assert.match(external.error ?? "", /incompatível/);

  const video = validateRuntimeInputValues([imageInput], {
    references: [{ ...image, mimeType: "video/mp4", name: "reference.mp4" }],
  });
  assert.match(video.error ?? "", /apenas arquivos image/);
});

test("requires every runtime binding before automatic execution", () => {
  assert.equal(runtimeInputsReady([imageInput], undefined), false);
  assert.match(validateRuntimeInputValues([imageInput], {}).error ?? "", /Referências/);
});
