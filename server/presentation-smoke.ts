import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESENTATION_RENDERER_IDS, type ValueShape } from "../src/lib/domain";
import { parseMethodFile, serializeMethodFile } from "../src/lib/method-file";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
  normalizeFieldPresentation,
  resolvePresentationRenderer,
} from "../src/lib/presentation";

const canonicalMethod = {
  format: "contentflow-method",
  version: 3,
  name: "Método canônico",
  exportedAt: "2026-08-10T00:00:00.000Z",
  method: {
    contractVersion: 3,
    name: "Método canônico",
    processType: "assets",
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Humano",
        name: "Produzir assets",
        inputs: [
          {
            id: "input-1",
            label: "Referências",
            shape: {
              kind: "content",
              family: "image",
              cardinality: "many",
              representation: "artifact",
            },
            binding: { kind: "runtime" },
          },
        ],
        outputs: [
          {
            id: "output-1",
            label: "Assets",
            key: "assets",
            shape: {
              kind: "content",
              family: "image",
              cardinality: "many",
              representation: "artifact",
            },
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  },
};

const parsedCanonical = parseMethodFile(JSON.stringify(canonicalMethod));
assert.equal(parsedCanonical.method.blocks[0].inputs?.[0].presentation, undefined);
assert.equal(parsedCanonical.method.blocks[0].outputs?.[0].presentation, undefined);

const imageMany = {
  kind: "content",
  family: "image",
  cardinality: "many",
  representation: "artifact",
} as const;
const textOne = {
  kind: "content",
  family: "text",
  cardinality: "one",
  representation: "inline",
} as const;
const records: ValueShape = { kind: "record", cardinality: "many", fields: [] };
const gallery = normalizeFieldPresentation(imageMany, {
  renderer: "image-gallery",
});
assert.deepEqual(gallery, {
  renderer: "image-gallery",
});
assert.equal(resolvePresentationRenderer(imageMany, gallery), "image-gallery");
assert.equal(resolvePresentationRenderer(textOne, gallery), "text-short");
assert.equal(
  resolvePresentationRenderer(imageMany, { renderer: "auto" }, [
    { id: "image", name: "image.png", mimeType: "image/png", size: 1, url: "local" },
  ]),
  "image-gallery",
);
assert.deepEqual(getCompatiblePresentationRenderers(records), ["auto", "table", "cards"]);
assert.equal(new Set(PRESENTATION_RENDERER_IDS).size, PRESENTATION_RENDERER_IDS.length);
assert.equal(
  getPresentationRestrictionIssue(imageMany, gallery, [
    { id: "audio", name: "audio.mp3", mimeType: "audio/mpeg", size: 1, url: "local" },
  ]),
  "deve conter apenas image",
);

const exported = serializeMethodFile("Método normalizado", parsedCanonical.method);
const reparsed = parseMethodFile(exported);
assert.equal(reparsed.method.blocks[0].outputs?.[0].presentation, undefined);

const processRunnerSource = readFileSync(
  new URL("../src/components/process-runner.tsx", import.meta.url),
  "utf8",
);
const executionResultsSource = processRunnerSource.slice(
  processRunnerSource.indexOf("function ExecutionResults"),
  processRunnerSource.indexOf("function ResultValue"),
);
assert.match(executionResultsSource, /item\.status === "cancelled"/);
assert.match(executionResultsSource, /open=\{blockExecution\.status !== "completed"\}/);
assert.match(processRunnerSource, /w-full max-w-6xl border-t/);

const rendererSource = readFileSync(
  new URL("../src/components/runtime-value-renderers.tsx", import.meta.url),
  "utf8",
);
const imageGallerySource = rendererSource.slice(
  rendererSource.indexOf("function ImageGalleryRenderer"),
  rendererSource.indexOf("function AudioRenderer"),
);
assert.match(imageGallerySource, /lg:grid-cols-4/);

console.log("Presentation contract smoke test passed.");
