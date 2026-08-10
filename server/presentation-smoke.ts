import assert from "node:assert/strict";
import { PRESENTATION_RENDERER_IDS } from "../src/lib/domain";
import { parseMethodFile, serializeMethodFile } from "../src/lib/method-file";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
  normalizeFieldPresentation,
  resolvePresentationRenderer,
} from "../src/lib/presentation";

const legacyMethod = {
  format: "contentflow-method",
  version: 1,
  name: "Método legado",
  exportedAt: "2026-08-10T00:00:00.000Z",
  method: {
    processType: "assets",
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Humano",
        name: "Produzir assets",
        inputs: [{ id: "input-1", label: "Referências", type: "files", source: "previous_block" }],
        outputs: [
          {
            id: "output-1",
            label: "Assets",
            key: "assets",
            type: "files",
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  },
};

const parsedLegacy = parseMethodFile(JSON.stringify(legacyMethod));
assert.equal(parsedLegacy.method.blocks[0].inputs?.[0].presentation.renderer, "auto");
assert.equal(parsedLegacy.method.blocks[0].outputs?.[0].presentation.renderer, "auto");

const gallery = normalizeFieldPresentation("files", {
  renderer: "image-gallery",
  itemType: "image",
  acceptedMimeTypes: [" IMAGE/PNG ", "image/*", "image/*", "invalid"],
});
assert.deepEqual(gallery, {
  renderer: "image-gallery",
  itemType: "image",
  acceptedMimeTypes: ["image/png", "image/*"],
});
assert.equal(resolvePresentationRenderer("files", gallery), "image-gallery");
assert.equal(resolvePresentationRenderer("text", gallery), "text-short");
assert.equal(
  resolvePresentationRenderer("files", { renderer: "auto" }, [
    { id: "image", name: "image.png", mimeType: "image/png", size: 1, url: "local" },
  ]),
  "image-gallery",
);
assert.deepEqual(getCompatiblePresentationRenderers("records"), ["auto", "table", "cards"]);
assert.equal(new Set(PRESENTATION_RENDERER_IDS).size, PRESENTATION_RENDERER_IDS.length);
assert.equal(
  getPresentationRestrictionIssue(gallery, [
    { id: "audio", name: "audio.mp3", mimeType: "audio/mpeg", size: 1, url: "local" },
  ]),
  "deve conter apenas arquivos image",
);

const exported = serializeMethodFile("Método normalizado", parsedLegacy.method);
const reparsed = parseMethodFile(exported);
assert.equal(reparsed.method.blocks[0].outputs?.[0].presentation.renderer, "auto");

console.log("Presentation contract smoke test passed.");
