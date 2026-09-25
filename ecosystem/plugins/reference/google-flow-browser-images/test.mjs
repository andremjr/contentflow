import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test } from "./handler.mjs";
import { testExtensionBridge } from "../../../browser-bridge/test.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const canonicalFixture = JSON.parse(
  await readFile(new URL("./fixtures/asset-generation-canonical-v1.json", import.meta.url), "utf8"),
);
assert.equal(canonicalFixture.fixtureId, "asset-generation-canonical-v1");
assert.deepEqual(
  canonicalFixture.slots.map((slot) => slot.expectedItemId),
  ["asset-slot-image-city-dawn", "asset-slot-image-forest-rain", "asset-slot-stock-commute"],
);
assert.equal(manifest.version, "1.3.7");
assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
assert.equal(manifest.id, "local.contentflow.google-flow-batch-images");
assert.ok(manifest.permissions.includes("filesystem:read"));
assert.ok(manifest.permissions.includes("filesystem:write"));
assert.ok(manifest.permissions.includes("network"));
assert.ok(manifest.permissions.includes("process"));
assert.deepEqual(manifest.deliveryTypes, ["image", "video"]);
assert.ok(manifest.networkHosts.includes("flow.google.com"));
assert.equal(manifest.settingsSchema.properties.keepBrowserOpen.default, false);
assert.deepEqual(Object.keys(manifest.localizations).sort(), ["en", "es"]);
for (const locale of ["en", "es"]) {
  const localization = manifest.localizations[locale];
  assert.ok(localization.name);
  assert.ok(localization.description);
  assert.ok(localization.profileSetup.label);
  assert.ok(localization.profileSetup.description);
  for (const capability of manifest.capabilities) {
    const localizedCapability = localization.capabilities[capability.id];
    assert.ok(localizedCapability, `${locale} precisa traduzir ${capability.id}`);
    assert.ok(localizedCapability.name);
    assert.ok(localizedCapability.description);
    assert.deepEqual(
      Object.keys(localizedCapability.inputPorts ?? {}).sort(),
      capability.inputPorts.map((port) => port.key).sort(),
      `${locale}/${capability.id} precisa traduzir todas as portas de entrada`,
    );
    for (const port of capability.inputPorts) {
      assert.ok(localizedCapability.inputPorts[port.key].label);
      if (port.description) assert.ok(localizedCapability.inputPorts[port.key].description);
    }
    assert.deepEqual(
      Object.keys(localizedCapability.outputPorts ?? {}).sort(),
      capability.outputPorts.map((port) => port.key).sort(),
      `${locale}/${capability.id} precisa traduzir todas as portas de saída`,
    );
    for (const port of capability.outputPorts) {
      assert.ok(localizedCapability.outputPorts[port.key].label);
      if (port.description) assert.ok(localizedCapability.outputPorts[port.key].description);
    }
    const localizedProperties = localizedCapability.blockConfigSchema?.properties ?? {};
    assert.deepEqual(
      Object.keys(localizedProperties).sort(),
      Object.keys(capability.blockConfigSchema.properties).sort(),
      `${locale}/${capability.id} precisa traduzir todos os campos do bloco`,
    );
    for (const [propertyKey, propertySchema] of Object.entries(
      capability.blockConfigSchema.properties,
    )) {
      assert.ok(localizedProperties[propertyKey].title);
      if (propertySchema.description) assert.ok(localizedProperties[propertyKey].description);
      const baseOptions = (propertySchema.oneOf ?? [])
        .map((option) => option.const)
        .filter((value) => value !== undefined);
      if (baseOptions.length > 0) {
        assert.deepEqual(
          localizedProperties[propertyKey].options.map((option) => option.value),
          baseOptions,
          `${locale}/${capability.id}/${propertyKey} precisa preservar os valores técnicos`,
        );
      }
    }
  }
}
assert.ok(
  manifest.capabilities.every(
    (capability) => capability.promptPreview?.template === "{{INPUT:prompts}}",
  ),
);

const cap = manifest.capabilities.find((item) => item.id === "generate-images-in-browser");
assert.ok(cap);
assert.deepEqual(cap.configurationOptions, [
  {
    property: "imageModel",
    providerId: "flow-image-models",
    dependsOn: ["accountProfile"],
    cacheTtlMs: 300000,
  },
]);
assert.equal(cap.execution.defaultTimeoutMs, 86_400_000);
assert.deepEqual(
  cap.inputPorts.map((port) => port.key),
  ["prompts", "reference_images", "project_url"],
);
assert.deepEqual(
  cap.outputPorts.map((port) => port.key),
  ["images", "project_url"],
);
assert.deepEqual(cap.outputPorts[0].producedTypes, ["image", "files"]);
assert.deepEqual(cap.producedOutputTypes, ["image", "files", "text", "url"]);
assert.equal(cap.blockConfigSchema.properties.accountProfile.default, "default");
assert.equal(cap.blockConfigSchema.properties.imageModel.default, "flow_auto");
assert.equal(cap.blockConfigSchema.properties.fallbackOnModelLimit.default, true);
assert.equal(cap.blockConfigSchema.properties.aspectRatio.default, "flow_current");
assert.deepEqual(
  cap.blockConfigSchema.properties.aspectRatio.oneOf.map((item) => item.const),
  ["flow_current", "landscape", "landscape_4_3", "portrait", "portrait_3_4", "square"],
);
assert.equal(cap.blockConfigSchema.properties.maxPrompts, undefined);
assert.deepEqual(cap.execution.itemOrchestration, {
  mode: "sequential",
  inputPort: "prompts",
  outputPort: "images",
});
assert.deepEqual(
  cap.itemActions.map((item) => item.action),
  ["regenerate", "replace", "select", "download"],
);
assert.equal(__test.actionableOutputPort(cap.id), "images");
assert.equal(cap.blockConfigSchema.properties.maxConcurrentGenerations.default, 1);
assert.equal(cap.blockConfigSchema.properties.delayBetweenPromptsMs.default, 6000);
assert.equal(cap.blockConfigSchema.properties.rateLimitRetryAttempts.default, 8);
assert.equal(cap.blockConfigSchema.properties.maxReferenceImages.maximum, 10);
assert.equal(cap.blockConfigSchema.properties.maxImagesPerPrompt.maximum, 4);
assert.match(
  await readFile(new URL("./handler.mjs", import.meta.url), "utf8"),
  /\(async \(\) => window\.FlowAuto\?\.adapter\?\.listModels/,
);
assert.match(
  await readFile(new URL("./handler.mjs", import.meta.url), "utf8"),
  /\(async \(\) => Boolean\(window\.FlowAuto\?\.adapter\?\.setModel/,
);
assert.deepEqual(
  __test
    .sortGeneratedOutputs([
      { id: "google-flow-image-002-v01" },
      { id: "google-flow-image-001-v02" },
      { id: "google-flow-image-001-v01" },
    ])
    .map((item) => item.id),
  ["google-flow-image-001-v01", "google-flow-image-001-v02", "google-flow-image-002-v01"],
);

const productionCap = manifest.capabilities.find(
  (item) => item.id === "produce-visual-assets-in-browser",
);
assert.ok(productionCap);
assert.deepEqual(
  productionCap.configurationOptions.map((provider) => [
    provider.property,
    provider.providerId,
    provider.cacheTtlMs,
  ]),
  [
    ["imageModel", "flow-image-models", 300000],
    ["videoModel", "flow-video-models", 300000],
  ],
);
assert.equal(productionCap.itemActions, undefined);
assert.equal(__test.actionableOutputPort(productionCap.id), undefined);
assert.deepEqual(
  productionCap.inputPorts.map((port) => port.key),
  ["prompts", "character_prompts", "animation_prompts", "reference_images", "project_url"],
);
assert.deepEqual(
  productionCap.outputPorts.map((port) => port.key),
  ["images", "character_references", "videos", "project_url"],
);
assert.equal(productionCap.blockConfigSchema.properties.productionMode.default, "images_only");
assert.deepEqual(Object.keys(productionCap.blockConfigSchema.properties), [
  "accountProfile",
  "fallbackAccountProfiles",
  "projectMode",
  "projectUrl",
  "productionMode",
  "imageModel",
  "imageModelLabel",
  "fallbackOnModelLimit",
  "aspectRatio",
  "maxImagesPerPrompt",
  "maxConcurrentGenerations",
  "enableCharacterConsistency",
  "characterPrompts",
  "maxReferenceImages",
  "maxCharacterReferences",
  "saveCharacterReferences",
  "videoModel",
  "videoModelLabel",
  "videoReferenceMode",
  "videoDurationSeconds",
  "videoResolution",
  "maxVideosToAnimate",
  "animationSelection",
  "animationIndexes",
  "imageRetention",
  "delayBetweenPromptsMs",
  "retryAttempts",
  "startMinimized",
]);
assert.deepEqual(
  productionCap.blockConfigSchema.properties.productionMode.oneOf.map((item) => item.const),
  ["images_only", "text_to_video", "images_then_selected_videos", "images_to_video_all"],
);
assert.equal(productionCap.blockConfigSchema.properties.maxVideosToAnimate.default, 3);
assert.equal(productionCap.blockConfigSchema.properties.maxCharacterReferences.default, 1);
assert.equal(productionCap.blockConfigSchema.properties.saveCharacterReferences.default, true);
assert.equal(productionCap.blockConfigSchema.properties.enableCharacterConsistency.default, false);
assert.deepEqual(productionCap.blockConfigSchema.properties.characterPrompts.visibleWhen, {
  property: "enableCharacterConsistency",
  values: [true],
});
assert.deepEqual(productionCap.blockConfigSchema.properties.projectUrl.visibleWhen, {
  property: "projectMode",
  values: ["existing"],
});
assert.deepEqual(productionCap.blockConfigSchema.properties.imageModel.visibleWhen, {
  property: "productionMode",
  values: ["images_only", "images_then_selected_videos", "images_to_video_all"],
});
assert.deepEqual(productionCap.blockConfigSchema.properties.videoModel.visibleWhen, {
  property: "productionMode",
  values: ["text_to_video", "images_then_selected_videos", "images_to_video_all"],
});
assert.deepEqual(productionCap.blockConfigSchema.properties.animationIndexes.visibleWhen, {
  property: "animationSelection",
  values: ["manual_indexes"],
});
for (const capability of manifest.capabilities) {
  assert.deepEqual(capability.blockConfigSchema.properties.projectUrl.visibleWhen, {
    property: "projectMode",
    values: ["existing"],
  });
}
assert.deepEqual(
  productionCap.blockConfigSchema.properties.animationSelection.oneOf.map((item) => item.const),
  ["first", "last", "evenly_spaced", "manual_indexes"],
);
for (const capabilityId of ["animate-image-in-browser", "generate-video-in-browser"]) {
  const capability = manifest.capabilities.find((item) => item.id === capabilityId);
  assert.deepEqual(capability.configurationOptions, [
    {
      property: "videoModel",
      providerId: "flow-video-models",
      dependsOn: ["accountProfile"],
      cacheTtlMs: 300000,
    },
  ]);
}
for (const capability of manifest.capabilities) {
  for (const property of ["imageModel", "videoModel"]) {
    const schema = capability.blockConfigSchema.properties[property];
    if (!schema) continue;
    assert.deepEqual(schema.oneOf.at(-1), {
      type: "string",
      pattern: "^flow_label:[A-Za-z0-9_-]{2,180}$",
    });
  }
}

const optionsRequest = (accountProfile, overrides = {}) => ({
  capabilityId: "generate-images-in-browser",
  invocation: {
    mode: "configure",
    action: "options",
    providerId: "flow-image-models",
    property: "imageModel",
  },
  configuration: { accountProfile },
  ...overrides,
});
const simulatedModelsByProfile = new Map([
  ["conta-a", ["Nano Banana Pro", "Imagen Experimental", "Nano Banana Pro"]],
  ["conta-b", ["Nano Banana 2 Lite"]],
]);
const simulatedDiscovery = async (request, _services, type) => {
  assert.equal(type, "image");
  return simulatedModelsByProfile.get(request.configuration.accountProfile) ?? [];
};
const accountAOptions = await __test.configureOptions(
  optionsRequest("conta-a"),
  {},
  {
    discoverModelLabels: simulatedDiscovery,
  },
);
const accountBOptions = await __test.configureOptions(
  optionsRequest("conta-b"),
  {},
  {
    discoverModelLabels: simulatedDiscovery,
  },
);
assert.equal(accountAOptions.status, "success");
assert.deepEqual(
  accountAOptions.values.options.map((option) => option.label),
  ["Automático: Pro → 2 → 2 Lite", "Nano Banana Pro", "Imagen Experimental"],
);
assert.deepEqual(
  accountBOptions.values.options.map((option) => option.label),
  ["Automático: Pro → 2 → 2 Lite", "Nano Banana 2 Lite"],
);
assert.equal(
  accountBOptions.values.options.some((option) => option.label === "Imagen Experimental"),
  false,
);
const experimentalValue = accountAOptions.values.options.at(-1).value;
assert.match(experimentalValue, /^flow_label:/);
assert.equal(__test.dynamicFlowModelLabel(experimentalValue, "image"), "Imagen Experimental");
assert.equal(
  __test.resolveGenerationPreferences({ imageModel: experimentalValue }).imageModelLabel,
  "Imagen Experimental",
);
assert.equal(
  __test.normalizeFlowModelOptions(["Nano Banana Pro"], "image", "en-US")[0].label,
  "Automatic: Pro → 2 → 2 Lite",
);
assert.equal(
  __test.normalizeFlowModelOptions(["Nano Banana Pro"], "image", "es-ES")[0].description,
  "Fallback seguro entre los modelos de imagen conocidos de esta cuenta.",
);
const emptyOptions = await __test.configureOptions(
  optionsRequest("conta-vazia"),
  {},
  {
    discoverModelLabels: simulatedDiscovery,
  },
);
assert.deepEqual(emptyOptions, { status: "success", values: { options: [] } });
const failedOptions = await __test.configureOptions(
  optionsRequest("conta-a"),
  {},
  {
    discoverModelLabels: async () => {
      throw Object.assign(new Error("Catálogo temporariamente indisponível."), {
        code: "UPSTREAM_UNAVAILABLE",
        retryable: true,
      });
    },
  },
);
assert.deepEqual(failedOptions, {
  status: "error",
  code: "UPSTREAM_UNAVAILABLE",
  message: "Catálogo temporariamente indisponível.",
  retryable: true,
});
const invalidProvider = await __test.configureOptions(
  optionsRequest("conta-a", {
    invocation: {
      mode: "configure",
      action: "options",
      providerId: "outro-provider",
      property: "imageModel",
    },
  }),
  {},
  { discoverModelLabels: simulatedDiscovery },
);
assert.equal(invalidProvider.status, "error");
assert.equal(invalidProvider.code, "INVALID_CONFIGURATION");
assert.deepEqual(__test.selectAnimationIndexes(10, { maxVideosToAnimate: 3 }), [0, 1, 2]);
assert.equal(
  __test.generatedArtifactInputPath(
    { id: "google-flow-image-002-v01" },
    [
      {
        id: "google-flow-image-002-v01",
        source: { kind: "path", path: "002_v01_kite.jpg" },
      },
    ],
    { getOutputPath: (relativePath) => `C:\\output\\${relativePath}` },
  ),
  "C:\\output\\002_v01_kite.jpg",
);
assert.equal(
  __test.generatedArtifactInputPath({ id: "external-image" }, [], {
    getOutputPath: (relativePath) => relativePath,
  }),
  null,
);
assert.deepEqual(
  __test.configurationForProjectContinuation(
    { projectMode: "new", projectUrl: "https://flow.google.com/project/old" },
    "https://flow.google.com/project/current",
  ),
  { projectMode: "auto", projectUrl: "" },
);
assert.deepEqual(__test.configurationForProjectContinuation({ projectMode: "new" }, null), {
  projectMode: "new",
});
assert.deepEqual(
  __test.selectAnimationIndexes(10, {
    maxVideosToAnimate: 3,
    animationSelection: "manual_indexes",
    animationIndexes: "1, 5-6, 9",
  }),
  [0, 4, 5],
);

const closeCalls = [];
await __test.maybeCloseBrowser(
  {
    async send(method) {
      closeCalls.push(method);
    },
    close() {
      closeCalls.push("client.close");
    },
  },
  { startedByPlugin: false },
  false,
);
assert.deepEqual(closeCalls, ["Browser.close", "client.close"]);
const animCap = manifest.capabilities.find((item) => item.id === "animate-image-in-browser");
assert.ok(animCap);
assert.deepEqual(
  animCap.inputPorts.map((port) => port.key),
  ["images", "prompts", "project_url"],
);
assert.deepEqual(
  animCap.outputPorts.map((port) => port.key),
  ["video", "project_url"],
);
assert.equal(animCap.blockConfigSchema.properties.videoReferenceMode.default, "frames");
assert.equal(animCap.blockConfigSchema.properties.videoDurationSeconds.default, 8);
assert.equal(__test.actionableOutputPort(animCap.id), "video");

const videoCap = manifest.capabilities.find((item) => item.id === "generate-video-in-browser");
assert.ok(videoCap);
assert.deepEqual(
  videoCap.inputPorts.map((port) => port.key),
  ["prompts", "reference_images", "project_url"],
);
assert.deepEqual(
  videoCap.outputPorts.map((port) => port.key),
  ["video", "project_url"],
);
assert.equal(__test.actionableOutputPort(videoCap.id), "video");

const batchAction = __test.normalizeItemActionRequest({
  capabilityId: "generate-images-in-browser",
  invocation: {
    mode: "item_action",
    action: "regenerate",
    itemId: "core-output-city-b",
    outputPort: "images",
  },
  itemAction: {
    key: "prompt:0",
    variantKey: "image:1",
    input: "cidade ao amanhecer",
    attempt: 2,
  },
  batch: { itemId: "core-batch-city", index: 0, total: 2 },
  inputs: { prompts: "entrada antiga" },
  configuration: { maxImagesPerPrompt: 4 },
});
assert.equal(batchAction.invocation.mode, "start");
assert.equal(batchAction.inputs.prompts, "cidade ao amanhecer");
assert.equal(batchAction.configuration.maxImagesPerPrompt, 1);
assert.equal(batchAction.batch.itemId, "core-batch-city");
assert.deepEqual(batchAction.__flowItemAction, {
  itemId: "core-output-city-b",
  outputPort: "images",
  key: "prompt:0",
  variantKey: "image:1",
  attempt: 2,
});
assert.equal(
  __test.normalizeItemActionRequest({
    capabilityId: "generate-images-in-browser",
    invocation: { mode: "item_action", action: "regenerate", outputPort: "video" },
    itemAction: { input: "cidade" },
  }),
  null,
);

assert.deepEqual(
  __test.mediaItemUpdate({
    key: "prompt:0",
    variantKey: "image:1",
    outputPort: "images",
    input: "cidade ao amanhecer",
    value: { id: "artifact-city-b" },
  }),
  {
    key: "prompt:0",
    variantKey: "image:1",
    outputPort: "images",
    state: "completed",
    input: "cidade ao amanhecer",
    value: { id: "artifact-city-b" },
  },
);

assert.equal(__test.artifactNamespace("character-reference"), "character-reference");
assert.equal(__test.artifactNamespace("../../video"), "media");
assert.doesNotThrow(() =>
  __test.validateImageArtifactBytes(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", 4),
);
assert.throws(
  () => __test.validateImageArtifactBytes(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/gif", 4),
  (error) => error?.code === "OUTPUT_VALIDATION_FAILED",
);
assert.throws(
  () =>
    __test.validateImageArtifactBytes(
      new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      "image/gif",
      4,
      "en-US",
    ),
  (error) => error?.message === "Unexpected MIME type: image/gif",
);
assert.throws(
  () =>
    __test.validateImageArtifactBytes(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", 5),
  (error) => error?.code === "OUTPUT_VALIDATION_FAILED",
);
assert.doesNotThrow(() =>
  __test.validateVideoArtifactBytes(
    new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    "video/mp4",
    12,
  ),
);
assert.throws(
  () => __test.validateVideoArtifactBytes(new Uint8Array([1, 2, 3, 4]), "video/mp4", 4),
  (error) => error?.code === "OUTPUT_VALIDATION_FAILED",
);
assert.throws(
  () =>
    __test.validateVideoArtifactBytes(
      new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      "text/html",
      8,
    ),
  (error) => error?.code === "OUTPUT_VALIDATION_FAILED",
);
assert.equal(
  __test.flowMediaMessage("es-ES", "videoLengthMismatch"),
  "El tamaño declarado del vídeo no coincide con los bytes recibidos.",
);
assert.equal(
  __test.flowMediaMessage("en-US", "videoModeConfirmed", { mode: "elements", duration: 4 }),
  "Video mode confirmed: Elements; duration 4s.",
);
assert.equal(
  __test.flowMediaMessage("es-ES", "generationNotConfirmed"),
  "Se hizo clic en el botón de generación, pero Flow mantuvo el prompt listo para enviar; no se confirmó ninguna generación.",
);
assert.equal(
  __test.flowMediaMessage("pt-BR", "browserVisible"),
  "Janela do Chrome confirmada em modo visível (headless desativado).",
);

const artifactTemp = await mkdtemp(join(tmpdir(), "contentflow-flow-p13-"));
const artifactFetch = globalThis.fetch;
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
globalThis.fetch = async () =>
  new Response(jpegBytes, {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": String(jpegBytes.byteLength) },
  });
try {
  const generatedItem = {
    image: {
      generatedImage: {
        fifeUrl: "https://flow-content.google/image/11111111-2222-3333-4444-555555555555",
        mediaId: "11111111-2222-3333-4444-555555555555",
      },
    },
  };
  const imageArtifact = await __test.downloadGeneratedImage(
    generatedItem,
    "mesmo prompt",
    1,
    1,
    { getOutputPath: (name) => join(artifactTemp, name) },
    "image",
  );
  const characterArtifact = await __test.downloadGeneratedImage(
    generatedItem,
    "mesmo prompt",
    1,
    1,
    { getOutputPath: (name) => join(artifactTemp, name) },
    "character-reference",
  );
  assert.equal(imageArtifact.artifact.id, "google-flow-image-001-v01");
  assert.equal(characterArtifact.artifact.id, "google-flow-character-reference-001-v01");
  assert.notEqual(imageArtifact.artifact.source.path, characterArtifact.artifact.source.path);
  assert.equal(imageArtifact.file.mimeType, "image/jpeg");
  assert.equal(imageArtifact.file.size, jpegBytes.byteLength);
} finally {
  globalThis.fetch = artifactFetch;
  await rm(artifactTemp, { recursive: true, force: true });
}

assert.deepEqual(__test.normalizePrompts(["primeiro", ["segundo"]]), ["primeiro", "segundo"]);
assert.deepEqual(__test.normalizeReferenceImages([{ id: "a" }, [{ id: "b" }]]), [
  { id: "a" },
  { id: "b" },
]);

// Isolated regression: file selection must suppress the native modal and wait
// for the provider's upload/consent UI, not merely for setFileInputFiles.
const uploadCalls = [];
let uploadReadyReads = 0;
const uploadClient = {
  async send(method, params) {
    uploadCalls.push({ method, params });
    if (method === "DOM.getDocument")
      return {
        root: { nodeId: 7, nodeName: "INPUT", attributes: ["type", "file", "accept", "image/*"] },
      };
    if (method === "Runtime.evaluate") {
      if (params.expression.includes("const dialogs =")) {
        uploadReadyReads += 1;
        return {
          result: {
            value: {
              editable: true,
              dialogs: uploadReadyReads === 1 ? 1 : 0,
              pickerOpen: false,
              consent: false,
            },
          },
        };
      }
      return { result: { value: { ok: true, changed: false } } };
    }
    return {};
  },
};
await __test.uploadReferenceImages(
  uploadClient,
  "page",
  {},
  ["fixture-reference.png"],
  {},
  undefined,
);
assert.equal(uploadCalls[0].method, "Page.setInterceptFileChooserDialog");
assert.equal(uploadCalls[0].params.enabled, true);
assert.ok(uploadCalls.some((call) => call.method === "DOM.setFileInputFiles"));
assert.equal(uploadReadyReads, 2, "waits until the modal closes before writing the prompt");
assert.deepEqual(uploadCalls.at(-1), {
  method: "Page.setInterceptFileChooserDialog",
  params: { enabled: false },
});
const consentClient = {
  async send() {
    return { result: { value: { editable: false, dialogs: 1, pickerOpen: true, consent: true } } };
  },
};
let includedReference = false;
let includeClicks = 0;
const includeClient = {
  async send() {
    return {
      result: {
        value: {
          editable: true,
          dialogs: 0,
          pickerOpen: !includedReference,
          consent: false,
          includeReady: !includedReference,
          referenceMatches: true,
        },
      },
    };
  },
};
const includeBridge = {
  async dispatch(action, payload) {
    assert.equal(action, "click");
    assert.ok(payload.textIncludes.includes("incluir"));
    includeClicks += 1;
    includedReference = true;
  },
};
await __test.waitReferenceUploadReady(
  includeClient,
  "page",
  {},
  undefined,
  undefined,
  2_000,
  includeBridge,
  ["fixture-reference.png"],
);
assert.equal(
  includeClicks,
  1,
  "includes the matching uploaded reference once before leaving the picker",
);
const wrongReferenceClient = {
  async send() {
    return {
      result: {
        value: {
          editable: true,
          dialogs: 0,
          pickerOpen: true,
          consent: false,
          includeReady: true,
          referenceMatches: false,
        },
      },
    };
  },
};
await assert.rejects(
  __test.waitReferenceUploadReady(
    wrongReferenceClient,
    "page",
    {},
    undefined,
    undefined,
    1,
    includeBridge,
    ["fixture-reference.png"],
  ),
  /não liberou/,
);
assert.equal(includeClicks, 1, "never includes unrelated media");
await assert.rejects(
  __test.waitReferenceUploadReady(consentClient, "page", {}, undefined, undefined, 1),
  (error) => error.code === "HUMAN_INTERVENTION_REQUIRED",
);
const failedUploadCalls = [];
const failedUploadClient = {
  async send(method, params) {
    failedUploadCalls.push({ method, params });
    if (method === "Runtime.evaluate") throw new Error("fixture upload failure");
    return {};
  },
};
await assert.rejects(
  __test.uploadReferenceImages(
    failedUploadClient,
    "page",
    {},
    ["fixture-reference.png"],
    {},
    undefined,
  ),
  /fixture upload failure/,
);
assert.deepEqual(failedUploadCalls.at(-1), {
  method: "Page.setInterceptFileChooserDialog",
  params: { enabled: false },
});
assert.equal(
  __test.requestsSingleImage({ outputContract: [{ portKey: "images", type: "image" }] }),
  true,
);
assert.equal(
  __test.requestsSingleImage({ outputContract: [{ portKey: "images", type: "files" }] }),
  false,
);
assert.equal(__test.normalizeAccountProfile("canal_01"), "canal_01");
assert.throws(() => __test.normalizeAccountProfile("../perfil"), /accountProfile/);
assert.equal(
  __test.validateFlowUrl("https://flow.google.com/project/project-1"),
  "https://flow.google.com/project/project-1",
);
assert.equal(
  __test.validateFlowUrl("https://labs.google/fx/pt/tools/flow/project/project-1"),
  "https://labs.google/fx/pt/tools/flow/project/project-1",
);
assert.throws(() => __test.validateFlowUrl("https://example.com/project/project-1"), /flowUrl/);
assert.deepEqual(
  __test.mediaItemsFromImageUrls([
    "https://flow-content.google/image/generated-1?Signature=abc",
    "https://flow-content.google/image/generated-1?Signature=abc",
    "https://example.com/image/generated-2",
  ]),
  [
    {
      image: {
        generatedImage: {
          fifeUrl: "https://flow-content.google/image/generated-1?Signature=abc",
          mediaId: "generated-1",
        },
      },
    },
  ],
);
assert.deepEqual(
  __test.mediaItemsFromImageCandidates([
    {
      url: "https://flow-content.google/image/real-image",
      cardType: "image",
    },
    {
      url: "https://flow-content.google/image/video-poster",
      cardType: "video",
    },
    {
      url: "https://flow-content.google/image/unclassified",
      cardType: "unknown",
    },
  ]),
  [
    {
      image: {
        generatedImage: {
          fifeUrl: "https://flow-content.google/image/real-image",
          mediaId: "real-image",
        },
      },
    },
  ],
);
assert.throws(
  () =>
    __test.parseGenerationResponse({
      status: 200,
      bodyText: JSON.stringify({
        media: [{ video: { fifeUrl: "https://flow-content.google/video/generated-video" } }],
      }),
    }),
  /poster ou frame de vídeo/,
);
assert.deepEqual(
  __test.parseGenerationResponse({
    status: 200,
    bodyText: JSON.stringify({
      media: [
        {
          image: {
            generatedImage: {
              fifeUrl: "https://flow-content.google/image/generated-image",
            },
          },
        },
      ],
    }),
  }).media,
  [
    {
      image: {
        generatedImage: {
          fifeUrl: "https://flow-content.google/image/generated-image",
        },
      },
    },
  ],
);

assert.equal(
  __test.requestsSingleVideo({ outputContract: [{ portKey: "video", type: "video" }] }),
  true,
);
assert.equal(
  __test.requestsSingleVideo({ outputContract: [{ portKey: "video", type: "files" }] }),
  false,
);
assert.deepEqual(
  __test.mediaItemsFromVideoUrls([
    "https://flow-content.google/video/video-123",
    "https://flow-content.google/video/video-123",
    "https://flow-content.google/image/image-456",
  ]),
  [{ video: { fifeUrl: "https://flow-content.google/video/video-123", mediaId: "video-123" } }],
);

const videoPrefs = __test.resolveVideoPreferences({
  videoModel: "veo_3_1_quality",
  videoResolution: "res_1080p",
});
assert.equal(videoPrefs.videoModelName, "Veo 3.1 - Quality");
assert.equal(videoPrefs.videoResolutionLabel, "1080p");

// Testes de resolução de navegação e projeto
const defaultTarget = __test.resolveNavigationTarget({});
assert.equal(defaultTarget.pinned, false);
assert.equal(defaultTarget.url, "https://flow.google.com/");

const landingUrlTarget = __test.resolveNavigationTarget({
  settings: { flowUrl: "https://flow.google.com/" },
});
assert.equal(landingUrlTarget.pinned, false);
assert.equal(landingUrlTarget.url, "https://flow.google.com/");

const newModeTarget = __test.resolveNavigationTarget({
  configuration: { projectMode: "new" },
  inputs: { project_url: "https://flow.google.com/project/should-be-ignored" },
});
assert.equal(newModeTarget.pinned, false);
assert.equal(newModeTarget.url, "https://flow.google.com/");

const blockConfigTarget = __test.resolveNavigationTarget({
  configuration: { projectUrl: "https://flow.google.com/project/config-project-123" },
});
assert.equal(blockConfigTarget.pinned, true);
assert.equal(blockConfigTarget.url, "https://flow.google.com/project/config-project-123");

const existingModeTarget = __test.resolveNavigationTarget({
  configuration: {
    projectMode: "existing",
    projectUrl: "https://flow.google.com/project/existing-mode-proj",
  },
});
assert.equal(existingModeTarget.pinned, true);
assert.equal(existingModeTarget.url, "https://flow.google.com/project/existing-mode-proj");

assert.throws(
  () =>
    __test.resolveNavigationTarget({
      configuration: { projectMode: "existing", projectUrl: "" },
    }),
  /Usar projeto específico/,
);

const projectTarget = __test.resolveNavigationTarget({
  inputs: { project_url: "https://flow.google.com/project/shared-project-123" },
});
assert.equal(projectTarget.pinned, true);
assert.equal(projectTarget.url, "https://flow.google.com/project/shared-project-123");

// Se inputs.project_url receber texto contextual de processos anteriores (tema, título, prompt),
// o modo automático ignora e cria um novo projeto normalmente sem lançar erro.
const textContextTarget = __test.resolveNavigationTarget({
  inputs: {
    project_url:
      "theme.theme: A venda de veículos no varejo atua frequentemente...\n\ntitle.title: Bancos por Trás das Vitrines...",
  },
});
assert.equal(textContextTarget.pinned, false);
assert.equal(textContextTarget.url, "https://flow.google.com/");

// Testes de navegação do attachFlowPage: um projeto fixado não volta à home.
const mockCdpTargets = [
  { targetId: "target-1", type: "page", url: "https://flow.google.com/project/old-project-999" },
];
const navigationHistory = [];
const mockAttachClient = {
  async send(method, params) {
    if (method === "Target.getTargets") return { targetInfos: mockCdpTargets };
    if (method === "Target.attachToTarget") return { sessionId: "session-1" };
    if (method === "Page.navigate") {
      navigationHistory.push(params.url);
      return {};
    }
    if (method === "Runtime.evaluate") {
      return { result: { value: { readyState: "complete", url: navigationHistory.at(-1) || "" } } };
    }
    return {};
  },
};

// Caso 1: pinned: false (criação de novo projeto). Deve navegar APENAS para https://flow.google.com/
navigationHistory.length = 0;
await __test.attachFlowPage(mockAttachClient, "https://flow.google.com/", false, undefined, false);
assert.deepEqual(navigationHistory, ["https://flow.google.com/"]);

// Caso 2: pinned: true com URL de projeto. Deve navegar diretamente para o projeto.
navigationHistory.length = 0;
await __test.attachFlowPage(
  mockAttachClient,
  "https://flow.google.com/project/target-proj-123",
  true,
  undefined,
  false,
);
assert.deepEqual(navigationHistory, ["https://flow.google.com/project/target-proj-123"]);

const retryDirectory = await mkdtemp(join(tmpdir(), "contentflow-flow-retry-"));
const retryServices = { getWorkspacePath: (relativePath) => join(retryDirectory, relativePath) };
const failedRequest = {
  executionId: "execution-1",
  blockId: "flow-1",
  attempt: 1,
  configuration: { accountProfile: "flow-e2e" },
};
await __test.saveCaptchaRetryNavigation(
  failedRequest,
  retryServices,
  "https://labs.google/fx/pt/tools/flow/project/project-1",
);
const retryNavigation = await __test.readCaptchaRetryNavigation(
  { ...failedRequest, attempt: 2 },
  retryServices,
);
assert.equal(retryNavigation?.captchaRetry, true);
assert.match(retryNavigation?.url ?? "", /\/tools\/flow\/project\/project-1/);
assert.equal(
  await __test.readCaptchaRetryNavigation(
    {
      ...failedRequest,
      attempt: 2,
      configuration: { accountProfile: "contaflow2" },
    },
    retryServices,
  ),
  undefined,
);
assert.equal(
  await __test.readCaptchaRetryNavigation({ ...failedRequest, attempt: 3 }, retryServices),
  undefined,
);
await __test.clearCaptchaRetryNavigation(failedRequest, retryServices);
await __test.saveCaptchaRetryNavigation(
  failedRequest,
  retryServices,
  "https://flow.google.com/project/project-reference",
  true,
);
const referenceRetry = await __test.readCaptchaRetryNavigation(
  { ...failedRequest, attempt: 2 },
  retryServices,
);
assert.equal(referenceRetry.referencesAttached, true);
assert.equal(referenceRetry.captchaRetry, false);
assert.equal(referenceRetry.url, "https://flow.google.com/project/project-reference");
assert.equal(
  await __test.readCaptchaRetryNavigation(
    { ...failedRequest, blockId: "other-block", attempt: 2 },
    retryServices,
  ),
  undefined,
);
await __test.clearCaptchaRetryNavigation(failedRequest, retryServices);
const checkpointRequest = {
  executionId: "execution-checkpoint",
  blockId: "flow-images",
  capabilityId: "generate-images-in-browser",
};
const checkpointPrompts = ["primeiro", "segundo", "terceiro"];
await __test.saveGenerationCheckpoint(checkpointRequest, retryServices, checkpointPrompts, {
  completedPromptIndexes: [1, 0, 1],
  files: [
    { id: "image-1", name: "001.webp", mimeType: "image/webp", url: "artifact://image-1" },
    { id: "image-2", name: "002.webp", mimeType: "image/webp", url: "artifact://image-2" },
  ],
  projectUrl: "https://flow.google.com/project/checkpoint-project",
  accountProfile: "conta-a",
});
const savedCheckpoint = await __test.readGenerationCheckpoint(
  checkpointRequest,
  retryServices,
  checkpointPrompts,
);
assert.deepEqual(savedCheckpoint.completedPromptIndexes, [0, 1]);
assert.equal(savedCheckpoint.files.length, 2);
assert.equal(savedCheckpoint.accountProfile, "conta-a");
assert.equal(savedCheckpoint.projectUrl, "https://flow.google.com/project/checkpoint-project");
assert.equal(
  await __test.readGenerationCheckpoint(checkpointRequest, retryServices, ["lista alterada"]),
  undefined,
);
await __test.clearGenerationCheckpoint(checkpointRequest, retryServices);
assert.equal(
  await __test.readGenerationCheckpoint(checkpointRequest, retryServices, checkpointPrompts),
  undefined,
);

const videoCheckpointRequest = {
  executionId: "execution-video-checkpoint",
  blockId: "flow-videos",
  capabilityId: "generate-video-in-browser",
};
await __test.saveGenerationCheckpoint(videoCheckpointRequest, retryServices, checkpointPrompts, {
  completedPromptIndexes: [0, 2],
  files: [
    { id: "video-1", name: "001.mp4", mimeType: "video/mp4", url: "artifact://video-1" },
    { id: "video-3", name: "003.mp4", mimeType: "video/mp4", url: "artifact://video-3" },
  ],
});
const savedVideoCheckpoint = await __test.readGenerationCheckpoint(
  videoCheckpointRequest,
  retryServices,
  checkpointPrompts,
);
assert.deepEqual(savedVideoCheckpoint.completedPromptIndexes, [0, 2]);
assert.equal(savedVideoCheckpoint.files.length, 2);
assert.equal(
  await __test.readGenerationCheckpoint(
    { ...videoCheckpointRequest, capabilityId: "generate-images-in-browser" },
    retryServices,
    checkpointPrompts,
  ),
  undefined,
);
await __test.clearGenerationCheckpoint(videoCheckpointRequest, retryServices);

const durableResumeRequest = {
  outputContract: [{ portKey: "images", key: "assets", type: "files" }],
  resume: {
    values: {
      assets: [
        {
          id: "google-flow-image-001-v01",
          name: "001_v01_primeira.jpg",
          mimeType: "image/jpeg",
          url: "/api/files/primeira.jpg",
        },
        {
          id: "google-flow-image-002-v01",
          name: "002_v01_segunda.jpg",
          mimeType: "image/jpeg",
          url: "/api/files/segunda.jpg",
        },
      ],
    },
    artifacts: [
      {
        id: "google-flow-image-001-v01",
        name: "001_v01_primeira.jpg",
        mimeType: "image/jpeg",
        url: "/api/files/primeira.jpg",
      },
      {
        id: "google-flow-image-002-v01",
        name: "002_v01_segunda.jpg",
        mimeType: "image/jpeg",
        url: "/api/files/segunda.jpg",
      },
    ],
  },
};
assert.deepEqual(
  __test.durableResumeOutputFiles(durableResumeRequest, "images", "image").map((file) => file.id),
  ["google-flow-image-001-v01", "google-flow-image-002-v01"],
);
assert.equal(
  __test.promptIndexFromGeneratedFile(durableResumeRequest.resume.artifacts[0], "image"),
  0,
);
assert.equal(
  __test.promptIndexFromGeneratedFile(durableResumeRequest.resume.artifacts[1], "image"),
  1,
);

const productionCheckpointRequest = {
  executionId: "execution-production-checkpoint",
  blockId: "flow-production",
};
const productionDescriptor = {
  prompts: ["imagem 1", "imagem 2"],
  characterPrompts: ["personagem"],
  animationPrompts: ["animar 1", "animar 2"],
  configuration: {
    productionMode: "images_to_video_all",
    animationSelection: "first",
    maxVideosToAnimate: 2,
    imageRetention: "keep_all",
    maxCharacterReferences: 1,
    saveCharacterReferences: true,
    enableCharacterConsistency: true,
  },
};
await __test.saveVisualProductionCheckpoint(
  productionCheckpointRequest,
  retryServices,
  productionDescriptor,
  {
    characterReferences: [{ id: "character-1", url: "artifact://character-1" }],
    images: [
      { id: "image-1", url: "artifact://image-1" },
      { id: "image-2", url: "artifact://image-2" },
    ],
    animationResults: [{ imageIndex: 0, videos: [{ id: "video-1", url: "artifact://video-1" }] }],
    projectUrl: "https://flow.google.com/project/production-checkpoint",
  },
);
const savedProductionCheckpoint = await __test.readVisualProductionCheckpoint(
  productionCheckpointRequest,
  retryServices,
  productionDescriptor,
);
assert.equal(savedProductionCheckpoint.images.length, 2);
assert.equal(savedProductionCheckpoint.characterReferences.length, 1);
assert.deepEqual(
  savedProductionCheckpoint.animationResults.map((entry) => entry.imageIndex),
  [0],
);
assert.equal(savedProductionCheckpoint.animationResults[0].videos.length, 1);
assert.equal(savedProductionCheckpoint.accountProfile, "default");
assert.equal(
  __test.checkpointProjectUrlForProfile(savedProductionCheckpoint, "default"),
  "https://flow.google.com/project/production-checkpoint",
);
assert.equal(
  __test.checkpointProjectUrlForProfile(savedProductionCheckpoint, "conta-b"),
  undefined,
);
assert.equal(
  __test.visualProductionProjectUrlForProfile(
    savedProductionCheckpoint,
    "default",
    "https://flow.google.com/project/input-project",
  ),
  "https://flow.google.com/project/production-checkpoint",
);
assert.equal(
  __test.visualProductionProjectUrlForProfile(
    savedProductionCheckpoint,
    "conta-b",
    "https://flow.google.com/project/input-project",
  ),
  undefined,
);
assert.equal(
  __test.visualProductionProjectUrlForProfile(
    undefined,
    "default",
    "https://flow.google.com/project/input-project",
  ),
  "https://flow.google.com/project/input-project",
);
assert.equal(
  __test.checkpointProjectUrlForProfile(
    { projectUrl: "https://flow.google.com/project/legacy-without-profile" },
    "default",
  ),
  undefined,
);
assert.equal(
  await __test.readVisualProductionCheckpoint(productionCheckpointRequest, retryServices, {
    ...productionDescriptor,
    prompts: ["lista alterada"],
  }),
  undefined,
);
await __test.clearVisualProductionCheckpoint(productionCheckpointRequest, retryServices);
assert.equal(
  await __test.readVisualProductionCheckpoint(
    productionCheckpointRequest,
    retryServices,
    productionDescriptor,
  ),
  undefined,
);
await rm(retryDirectory, { recursive: true, force: true });

const defaultRuntime = __test.resolveProfileRuntime({
  configuration: { accountProfile: "default" },
  settings: {},
});
const channelRuntime = __test.resolveProfileRuntime({
  configuration: { accountProfile: "canal_a" },
  settings: {},
});
const managedRuntime = __test.resolveProfileRuntime(
  { configuration: { accountProfile: "default" }, settings: {} },
  { getWorkspacePath: (relativePath) => `workspace/${relativePath}` },
);
assert.equal(defaultRuntime.port, 9333);
assert.equal(managedRuntime.profilePath, "workspace/.");
assert.notEqual(channelRuntime.port, 9333);
assert.match(
  channelRuntime.profilePath.replaceAll("\\", "/"),
  /google-flow-chrome-profiles\/canal_a$/,
);
const profileDirectory = await mkdtemp(join(tmpdir(), "contentflow-flow-profile-"));
assert.equal(await __test.profileIsPrepared(profileDirectory, "conta-a"), false);
await __test.markProfilePrepared(profileDirectory, "conta-a", { extensionVersion: "2.0.0" });
assert.equal(await __test.profileIsPrepared(profileDirectory, "conta-a"), true);
assert.equal(await __test.profileIsPrepared(profileDirectory, "conta-b"), false);
await rm(profileDirectory, { recursive: true, force: true });

const automatic = __test.resolveGenerationPreferences({
  imageModel: "flow_auto",
  aspectRatio: "flow_current",
});
assert.equal(automatic.requestedModelKey, "flow_auto");
assert.equal(automatic.modelKey, "nano_banana_pro");
assert.equal(automatic.imageModelName, "GEM_PIX_2");
assert.equal(automatic.imageAspectRatio, null);
assert.equal(automatic.fallbackOnModelLimit, true);
assert.equal(
  __test.resolveGenerationPreferences({
    imageModel: "flow_auto",
    fallbackOnModelLimit: false,
  }).fallbackOnModelLimit,
  true,
);
const explicit = __test.resolveGenerationPreferences({
  imageModel: "nano_banana_pro",
  aspectRatio: "landscape",
});
assert.equal(explicit.imageModelName, "GEM_PIX_2");
assert.equal(explicit.imageAspectRatio, "IMAGE_ASPECT_RATIO_LANDSCAPE");
assert.equal(
  __test.resolveGenerationPreferences({
    imageModel: "nano_banana_pro",
    fallbackOnModelLimit: false,
  }).fallbackOnModelLimit,
  false,
);
assert.equal(
  __test.resolveGenerationPreferences({ imageModel: "nano_banana_2" }).imageModelName,
  "NARWHAL",
);
assert.equal(
  __test.resolveGenerationPreferences({ imageModel: "nano_banana_2_lite" }).imageModelName,
  "HARBOR_SEAL",
);
assert.equal(__test.nextImageModelFallback("nano_banana_pro"), "nano_banana_2");
assert.equal(__test.nextImageModelFallback("nano_banana_2"), "nano_banana_2_lite");
assert.equal(__test.nextImageModelFallback("nano_banana_2_lite"), null);
const customImageModel = __test.resolveGenerationPreferences({
  imageModel: "flow_auto",
  imageModelLabel: "Modelo experimental do Flow",
});
assert.equal(customImageModel.imageModelLabel, "Modelo experimental do Flow");
assert.equal(customImageModel.fallbackOnModelLimit, false);
const configurableVideo = __test.resolveVideoPreferences({
  videoModel: "omni_1_1_flash",
  videoModelLabel: "Omni Flash Preview",
  videoResolution: "res_1080p",
  aspectRatio: "portrait",
  videoReferenceMode: "elements",
  videoDurationSeconds: 10,
});
assert.equal(configurableVideo.videoModelName, "Omni Flash Preview");
assert.equal(configurableVideo.videoResolutionLabel, "1080p");
assert.equal(configurableVideo.videoReferenceMode, "elements");
assert.equal(configurableVideo.durationSeconds, 10);

const modelLimit = __test.classifyGenerationHttpError(
  403,
  JSON.stringify({
    error: {
      status: "RESOURCE_EXHAUSTED",
      message: "Daily limit for Nano Banana Pro model reached",
    },
  }),
);
assert.equal(modelLimit.code, "MODEL_LIMIT");
assert.equal(modelLimit.retryable, false);
const captcha = __test.classifyGenerationHttpError(
  403,
  JSON.stringify({
    error: { status: "PERMISSION_DENIED", message: "reCAPTCHA challenge failed" },
  }),
);
assert.equal(captcha.code, "AUTHENTICATION_FAILED");
assert.equal(captcha.retryable, false);
const quota = __test.classifyGenerationHttpError(
  429,
  JSON.stringify({
    error: { status: "RESOURCE_EXHAUSTED", message: "Account credits exhausted" },
  }),
);
assert.equal(quota.code, "RATE_LIMIT");
assert.equal(quota.retryable, false);
assert.equal(quota.retryAfterMs, undefined);

let submissions = 0;
await assert.rejects(
  __test.runGenerationPlan({
    prompts: ["p1", "p2"],
    maxInFlight: 1,
    retryAttempts: 2,
    failFast: true,
    submit(task) {
      submissions += 1;
      return {
        completion: Promise.reject(
          Object.assign(new Error(`falha ${task.index}`), { code: "PERMISSION_DENIED" }),
        ),
      };
    },
  }),
  /falha 0/,
);
assert.equal(submissions, 1, "failFast não deve enviar os prompts restantes");

let volumeSubmissions = 0;
const volumePrompts = Array.from({ length: 1000 }, (_, index) => `prompt ${index + 1}`);
const volumePlan = await __test.runGenerationPlan({
  prompts: volumePrompts,
  maxInFlight: 1,
  retryAttempts: 1,
  rateLimitRetryAttempts: 8,
  failFast: true,
  wait: async () => undefined,
  submit(task) {
    volumeSubmissions += 1;
    return { completion: Promise.resolve([{ file: task.prompt, artifact: task.index }]) };
  },
});
assert.equal(volumeSubmissions, 1000);
assert.equal(volumePlan.results.length, 1000);
assert.equal(volumePlan.failures.length, 0);

// Characterization: concurrent completions may arrive in any order, but each
// prompt and every variant must remain associated with its canonical slot.
const generationSlots = canonicalFixture.slots.filter((slot) => slot.kind === "generation_prompt");
const completionOrder = [];
const associatedPlan = await __test.runGenerationPlan({
  prompts: generationSlots,
  maxInFlight: 2,
  retryAttempts: 0,
  minDelayMs: 0,
  submit(task) {
    const slot = task.prompt;
    const delayMs = task.index === 0 ? 15 : 1;
    return {
      completion: new Promise((resolve) =>
        setTimeout(() => {
          completionOrder.push(slot.expectedItemId);
          resolve(
            [0, 1].map((variantIndex) => ({
              itemId: slot.expectedItemId,
              variantKey: `${slot.expectedItemId}:variant:${variantIndex}`,
              prompt: slot.prompt,
            })),
          );
        }, delayMs),
      ),
    };
  },
});
assert.deepEqual(completionOrder, ["asset-slot-image-forest-rain", "asset-slot-image-city-dawn"]);
assert.deepEqual(
  associatedPlan.results.map((variants) => variants.map((variant) => variant.itemId)),
  generationSlots.map((slot) => [slot.expectedItemId, slot.expectedItemId]),
);
assert.deepEqual(
  associatedPlan.results.flat().map((variant) => variant.variantKey),
  generationSlots.flatMap((slot) => [
    `${slot.expectedItemId}:variant:0`,
    `${slot.expectedItemId}:variant:1`,
  ]),
);

// Characterization: cancellation between sequential items stops before the
// neighboring scene is submitted and therefore cannot exchange its media.
const cancellation = new AbortController();
let cancelledPlanSubmissions = 0;
await assert.rejects(
  __test.runGenerationPlan({
    prompts: generationSlots,
    maxInFlight: 1,
    retryAttempts: 0,
    minDelayMs: 0,
    signal: cancellation.signal,
    submit(task) {
      cancelledPlanSubmissions += 1;
      return { completion: Promise.resolve([{ itemId: task.prompt.expectedItemId }]) };
    },
    onItemCompleted() {
      cancellation.abort();
    },
  }),
  (error) => error?.code === "CANCELLED",
);
assert.equal(cancelledPlanSubmissions, 1);

const completedBeforeFailure = [];
await assert.rejects(
  __test.runGenerationPlan({
    prompts: ["ok", "falha"],
    maxInFlight: 2,
    retryAttempts: 0,
    failFast: true,
    minDelayMs: 0,
    submit(task) {
      return {
        completion:
          task.index === 0
            ? Promise.resolve([{ file: "ok", artifact: "ok" }])
            : Promise.reject(Object.assign(new Error("falha paralela"), { code: "JOB_FAILED" })),
      };
    },
    onItemCompleted({ task }) {
      completedBeforeFailure.push(task.index);
    },
  }),
  /falha paralela/,
);
assert.deepEqual(completedBeforeFailure, [0]);

let rateLimitedSubmissions = 0;
const retryWaits = [];
const rateLimitedPlan = await __test.runGenerationPlan({
  prompts: ["prompt com limite transitório"],
  maxInFlight: 1,
  retryAttempts: 0,
  rateLimitRetryAttempts: 8,
  failFast: true,
  wait: async (ms) => retryWaits.push(ms),
  submit() {
    rateLimitedSubmissions += 1;
    if (rateLimitedSubmissions < 3) {
      return {
        completion: Promise.reject(
          Object.assign(new Error("muito rápido"), {
            code: "RATE_LIMIT",
            retryable: true,
            retryAfterMs: 60_000,
          }),
        ),
      };
    }
    return { completion: Promise.resolve([{ file: "ok", artifact: "ok" }]) };
  },
});
assert.equal(rateLimitedSubmissions, 3);
assert.deepEqual(retryWaits, [60_000, 60_000]);
assert.equal(rateLimitedPlan.failures.length, 0);

let reconciledSubmissions = 0;
const reconciliationCalls = [];
const reconciledPlan = await __test.runGenerationPlan({
  prompts: ["cidade ao amanhecer"],
  maxInFlight: 1,
  retryAttempts: 1,
  submit() {
    reconciledSubmissions += 1;
    return {
      completion: Promise.reject(
        Object.assign(new Error("timeout depois do envio"), {
          code: "TIMEOUT",
          retryable: true,
          externalEffectUncertain: true,
        }),
      ),
    };
  },
  async reconcile({ task, error }) {
    reconciliationCalls.push({ index: task.index, code: error.code });
    return {
      status: "recovered",
      value: [{ file: "cidade-recuperada", artifact: "artifact-cidade" }],
    };
  },
});
assert.equal(reconciledSubmissions, 1, "reconciliação recuperada não pode reenviar o prompt");
assert.deepEqual(reconciliationCalls, [{ index: 0, code: "TIMEOUT" }]);
assert.equal(reconciledPlan.results[0][0].file, "cidade-recuperada");

let uncertainSubmissions = 0;
const uncertainPlan = await __test.runGenerationPlan({
  prompts: ["floresta sob chuva"],
  maxInFlight: 1,
  retryAttempts: 2,
  submit() {
    uncertainSubmissions += 1;
    return {
      completion: Promise.reject(
        Object.assign(new Error("efeito externo incerto"), {
          code: "TIMEOUT",
          retryable: true,
          externalEffectUncertain: true,
        }),
      ),
    };
  },
  async reconcile() {
    return { status: "uncertain" };
  },
});
assert.equal(uncertainSubmissions, 1, "estado incerto não pode ser reenviado automaticamente");
assert.equal(uncertainPlan.failures.length, 1);

// --- Testes de Remoção de CSP ---
const cdpCalls = [];
const testCdpClient = {
  async send(method, params) {
    cdpCalls.push({ method, params });
    if (method === "Target.getTargets") return { targetInfos: mockCdpTargets };
    if (method === "Target.attachToTarget") return { sessionId: "session-csp" };
    if (method === "Runtime.evaluate")
      return { result: { value: { readyState: "complete", url: "https://flow.google.com/" } } };
    return {};
  },
};
await __test.attachFlowPage(testCdpClient, "https://flow.google.com/", false, undefined, false);
assert.ok(
  cdpCalls.some((c) => c.method === "Page.setBypassCSP" && c.params?.enabled === true),
  "Page.setBypassCSP habilitado no CDP",
);
assert.ok(
  cdpCalls.some(
    (c) =>
      c.method === "Page.addScriptToEvaluateOnNewDocument" &&
      c.params?.source.includes("dataset.faFlowToken") &&
      c.params?.source.includes("trustedTypes"),
  ),
  "Script de inicialização registra bypass de Trusted Types e captura de token no DOM",
);

// --- Testes de Extração de Credenciais ---
const listeners = new Map();
const fakeClient = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  },
  async send(method) {
    if (method === "Network.getCookies") {
      return {
        cookies: [
          { name: "SAPISID", value: "cookie-val-1" },
          { name: "SID", value: "cookie-val-2" },
        ],
      };
    }
    if (method === "Runtime.evaluate") {
      return { result: { value: "Bearer ya29.from-dom-token" } };
    }
    return {};
  },
};
const tracker = __test.createCredentialsTracker(fakeClient, "session-test");
const reqHandlers = listeners.get("Network.requestWillBeSent");
assert.ok(reqHandlers && reqHandlers.size > 0);
for (const handler of reqHandlers) {
  handler(
    {
      request: {
        url: "https://aisandbox-pa.googleapis.com/v1/projects/project-12345",
        headers: {
          Authorization: "Bearer ya29.simulated-bearer-token",
          Cookie: "SAPISID=cookie-val-1",
        },
      },
    },
    "session-test",
  );
}
assert.equal(tracker.getCredentials().bearerToken, "Bearer ya29.simulated-bearer-token");
assert.equal(tracker.getCredentials().projectId, "project-12345");
assert.equal(tracker.getCredentials().cookies, "SAPISID=cookie-val-1");

await tracker.refreshCookies();
assert.equal(tracker.getCredentials().cookies, "SAPISID=cookie-val-1; SID=cookie-val-2");

tracker.setBearerToken(null);
const domToken = await tracker.readTokenFromDom();
assert.equal(domToken, "Bearer ya29.from-dom-token");
assert.equal(tracker.getCredentials().bearerToken, "Bearer ya29.from-dom-token");
tracker.close();

// --- Testes de Evasão de Controles do Provedor ---
// 1. Timing e jitter
const t0 = Date.now();
await __test.dynamicSleep(__test.TIMING.SHORT);
const elapsed = Date.now() - t0;
assert.ok(
  elapsed >= 300 && elapsed <= 1000,
  `dynamicSleep SHORT dentro da faixa esperada (${elapsed}ms)`,
);

// 2. Classificação de erros de evasão (unusual_activity, policy, rate_limit)
assert.equal(
  __test.classifyTileErrorType("Detectamos atividade incomum na sua conta"),
  "unusual_activity",
);
assert.equal(
  __test.classifyTileErrorType("Aguarde um instante, você está solicitando muito rápido"),
  "rate_limit",
);
assert.equal(__test.classifyTileErrorType("Este comando viola nossas políticas de uso"), "policy");
assert.equal(__test.classifyTileErrorType("Resolva o captcha para continuar"), "captcha");

const unusualErr = __test.classifyGenerationHttpError(
  403,
  JSON.stringify({ error: { message: "Unusual activity detected from your network" } }),
);
assert.equal(unusualErr.code, "RATE_LIMIT");
assert.equal(unusualErr.isUnusualActivity, true);
assert.equal(unusualErr.retryable, true);
assert.equal(unusualErr.retryAfterMs, 45_000);

const policyErr = __test.classifyGenerationHttpError(
  400,
  JSON.stringify({ error: { message: "Prompt violates content safety policy" } }),
);
assert.equal(policyErr.code, "OUTPUT_VALIDATION_FAILED");
assert.equal(policyErr.isPolicyViolation, true);
assert.equal(policyErr.retryable, false);

// 3. Adaptive concurrency com unusual_activity
const controller = __test.createAdaptiveConcurrencyController(3, 2);
assert.equal(controller.getLimit(), 3);
const failResult = controller.failure(unusualErr);
assert.equal(failResult.activated, true);
assert.equal(controller.getLimit(), 1, "Concorrência reduzida para 1 em atividade incomum");

// 4. Detecção de banner de sobrecarga do Google Flow
assert.ok(
  __test.RE_SOBRECARGA.test(
    "Flow is currently experiencing high demand. Requests may need to be retried at a later time.",
  ),
);
assert.ok(__test.RE_SOBRECARGA.test("Alta demanda no momento. Créditos serão reembolsados."));
assert.equal(__test.RE_SOBRECARGA.test("Geração iniciada com sucesso."), false);

// 5. Desligamento do Modo Agente
let agentClickCount = 0;
const agentClient = {
  async send(method, params) {
    if (params?.expression?.includes("button[aria-pressed]")) {
      if (params.expression.includes(".click()")) {
        agentClickCount += 1;
        return { result: { value: true } };
      }
      return { result: { value: true } };
    }
    return {};
  },
};
const toggled = await __test.ensureAgentOff(agentClient, "session-test", undefined);
assert.equal(toggled, true);
assert.equal(agentClickCount, 1, "Clica no botão de Agente quando ele está ativo para desligá-lo");

// 6. Trusted React click helper
const reactClickClient = {
  async send(method, params) {
    if (params?.expression?.includes("cfFindOnClickInTree")) {
      return { result: { value: { ok: true, depth: "self", key: "__reactProps$123" } } };
    }
    return {};
  },
};
const trustedResult = await __test.triggerTrustedReactClick(reactClickClient, "session-test", {});
assert.equal(trustedResult.ok, true);
assert.equal(trustedResult.depth, "self");

assert.equal(__test.calculateJitteredDelay(0), 0);
const jitteredVal = __test.calculateJitteredDelay(10000);
assert.ok(jitteredVal >= 8500 && jitteredVal <= 11500);

const sampleBatch =
  ')]}\'\n\n100\n[["wrb.fr","ogiZ0b","[[\\"https://flow-content.google/image/11111111-2222-3333-4444-555555555555\\"]]",null,null,null,"generic"]]';
const decodedRpc = __test.decodificarBatchExecute(sampleBatch);
assert.equal(decodedRpc.length, 1);
assert.equal(decodedRpc[0].rpcid, "ogiZ0b");
const extractedMedia = __test.extrairMidiasRpc(decodedRpc[0].payload);
assert.equal(extractedMedia.length, 1);
assert.equal(extractedMedia[0].mediaId, "11111111-2222-3333-4444-555555555555");
assert.equal(extractedMedia[0].kind, "image");

const fakeTracker = {
  async waitForToken() {
    return "Bearer fake-token-123";
  },
};
const token = await __test.waitForFlowToken(fakeTracker, 1000);
assert.equal(token, "Bearer fake-token-123");

let submitEvaluated = false;
const fakeSubmitClient = {
  async send(m, p) {
    if (p?.expression?.includes("found.depth")) {
      return { result: { value: { ok: true, depth: "self" } } };
    }
    submitEvaluated = true;
    return { result: { value: true } };
  },
};
const submitRes = await __test.clickSubmit(fakeSubmitClient, "session-test", {});
assert.equal(submitRes.ok, true);
assert.equal(submitEvaluated, true);

const origFetch = globalThis.fetch;
let patchUrl = null;
let patchHeaders = null;
let patchBody = null;
globalThis.fetch = async (url, opts) => {
  patchUrl = url;
  patchHeaders = opts?.headers;
  patchBody = opts?.body;
  return { ok: true, json: async () => ({}) };
};
try {
  await __test.apiRenameProject("Bearer tok", "proj-1", "Novo Titulo");
  assert.ok(patchUrl.includes("proj-1"));
  assert.equal(patchHeaders.Authorization, "Bearer tok");
  assert.equal(JSON.parse(patchBody).projectTitle, "Novo Titulo");

  await __test.applyTileMetadataPatch(
    "Bearer tok",
    "proj-1",
    "wf-1",
    { displayName: "Novo" },
    "metadata.displayName",
  );
  assert.ok(patchUrl.includes("wf-1"));
  assert.equal(patchHeaders.Authorization, "Bearer tok");
  assert.equal(JSON.parse(patchBody).workflow.name, "wf-1");
} finally {
  globalThis.fetch = origFetch;
}

const source = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");
const flowEngineSource = await readFile(new URL("./flow-engine.js", import.meta.url), "utf8");

// P14: the current Flow UI ignores synthetic DOM submit events. Submission
// must go through the Browser Bridge's isolated CDP click while the protected
// media ticket keeps the prompt-to-result association unchanged.
assert.doesNotMatch(source, /window\.FlowAuto\.adapter\.prepareAndSubmit/);
assert.match(source, /window\.FlowAuto\.media2\.novoBilhete/);
assert.match(source, /clickGenerateWithExtension\([\s\S]*?engine-submit/);
assert.match(source, /button\[aria-label\*="iniciar geração" i\]/);
assert.match(source, /flow-generate-icon-button button/);
assert.match(source, /open-reference-menu:[\s\S]*?preferDomActivation: true/);
assert.match(source, /selectors: \["flow-add-menu button"\]/);
assert.match(source, /const launchMinimized = startMinimized && referencePaths\.length === 0/);
assert.match(source, /keepBrowserOpen: productionMode !== "images_only"/);
assert.match(source, /position < selectedIndexes\.length - 1/);
assert.match(
  source,
  /const probe = await new CdpClient\(existing\.webSocketDebuggerUrl\)\.connect/,
);
assert.match(source, /async function clickGenerateAndConfirm/);
assert.match(source, /"pressEnter"/);
assert.match(source, /adapter\?\.configureGeneration/);
assert.match(source, /Modo de vídeo confirmado/);
assert.match(source, /Flow manteve o prompt pronto para envio/);
assert.match(source, /window\.FlowAuto\?\.media2\?\._bilhetes\?\.delete/);
assert.match(flowEngineSource, /function novoBilhete\(prompt, expected, kind\)/);

// Characterization: concurrent network responses are reserved FIFO at submit
// time and later settled by requestId, even when the responses finish reversed.
const trackerFunctionMatch = source.match(
  /function createBatchResponseTracker\(client, sessionId, signal\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction createAdaptiveConcurrencyController/,
);
assert.ok(
  trackerFunctionMatch,
  "createBatchResponseTracker remains available for characterization",
);
const trackerFactorySource = trackerFunctionMatch[0].replace(
  /\r?\n\r?\nfunction createAdaptiveConcurrencyController[\s\S]*$/,
  "",
);
const makeTracker = new Function(
  "codedError",
  "GENERATION_SUFFIX",
  `return (${trackerFactorySource.replace(/^function createBatchResponseTracker/, "function")});`,
)(
  (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable }),
  "/image:generate",
);
const trackerListeners = new Map();
const trackerBodies = new Map([
  ["request-a", "response-for-city"],
  ["request-b", "response-for-forest"],
]);
const trackerClient = {
  on(event, listener) {
    trackerListeners.set(event, listener);
    return () => trackerListeners.delete(event);
  },
  async send(method, params) {
    assert.equal(method, "Network.getResponseBody");
    return { body: trackerBodies.get(params.requestId), base64Encoded: false };
  },
};
const trackerAbort = new AbortController();
const responseTracker = makeTracker(trackerClient, "flow-session", trackerAbort.signal);
const cityReservation = responseTracker.reserve(1_000);
const forestReservation = responseTracker.reserve(1_000);
for (const [requestId, prompt] of [
  ["request-a", "city"],
  ["request-b", "forest"],
]) {
  trackerListeners.get("Network.requestWillBeSent")(
    {
      requestId,
      request: {
        method: "POST",
        url: "https://aisandbox-pa.googleapis.com/v1/projects/project/image:generate",
        postData: prompt,
      },
    },
    "flow-session",
  );
  trackerListeners.get("Network.responseReceived")(
    { requestId, response: { status: 200 } },
    "flow-session",
  );
}
trackerListeners.get("Network.loadingFinished")({ requestId: "request-b" }, "flow-session");
trackerListeners.get("Network.loadingFinished")({ requestId: "request-a" }, "flow-session");
assert.deepEqual(await cityReservation.promise, {
  status: 200,
  bodyText: "response-for-city",
});
assert.deepEqual(await forestReservation.promise, {
  status: 200,
  bodyText: "response-for-forest",
});
responseTracker.close();

const cancellationTrackerAbort = new AbortController();
const cancellationTracker = makeTracker(
  {
    on() {
      return () => undefined;
    },
  },
  "flow-session",
  cancellationTrackerAbort.signal,
);
const abortedReservation = cancellationTracker.reserve(1_000);
cancellationTrackerAbort.abort();
await assert.rejects(abortedReservation.promise, (error) => error?.code === "CANCELLED");
cancellationTracker.close();

// Characterization: expired direct URLs remain recoverable through the public
// UI download operation. The service delegates to the adapter, and the Flow
// adapter delegates to the tile menu instead of retrying a stale signed URL.
assert.match(
  flowEngineSource,
  /downloadSized:\s*\(ids, size\)\s*=>\s*R2\.uiDownloadTile\(ids, size\)/,
);
assert.match(
  flowEngineSource,
  /async function downloadSized\(ref, size\)\s*\{\s*try\s*\{\s*return await A\(\)\.downloadSized\(ref, size\)/,
);
assert.match(flowEngineSource, /async function uiDownloadTile\(ref, sizeKey = "1K"\)/);
assert.match(flowEngineSource, /const dl = itens\.find\(\(e\) => S2\.menuLabels\.download\.test/);
assert.match(flowEngineSource, /const sub = await D2\.esperar/);

// Characterization: reload keeps only queued generation jobs, restores them
// paused, and cancellation is exposed for both the whole queue and one job.
assert.match(flowEngineSource, /function pendingSnapshot\(\)/);
assert.match(flowEngineSource, /function restorePending\(arr\)/);
assert.match(flowEngineSource, /fila: \$\{n\} pendente\(s\) restaurada\(s\) — PAUSADA/);
assert.match(flowEngineSource, /function stop\(\)/);
assert.match(flowEngineSource, /function cancelJob\(id\)/);
const extensionManifest = JSON.parse(
  await readFile(new URL("../../../browser-bridge/manifest.json", import.meta.url), "utf8"),
);
const extensionWorker = await readFile(
  new URL("../../../browser-bridge/service-worker.js", import.meta.url),
  "utf8",
);
const extensionContent = await readFile(
  new URL("../../../browser-bridge/content-script.js", import.meta.url),
  "utf8",
);
assert.equal(extensionManifest.manifest_version, 3);
assert.equal(extensionManifest.version, "0.4.0");
assert.deepEqual(extensionManifest.host_permissions, [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://grok.com/*",
  "https://flow.google.com/*",
  "https://labs.google/*",
  "https://meta.ai/*",
  "https://www.meta.ai/*",
  "https://playground.microsoft.ai/*",
  "https://vibes.ai/*",
]);
assert.deepEqual(extensionManifest.permissions, ["tabs", "storage", "debugger", "alarms", "power"]);
assert.ok(extensionWorker.includes("globalThis.contentFlowBridge"));
assert.ok(extensionWorker.includes('BRIDGE_ID = "com.contentflow.browser-bridge"'));
assert.ok(extensionWorker.includes("command.executionKey"));
assert.ok(extensionWorker.includes("sessionToken"));
assert.ok(extensionWorker.includes('"Input.dispatchMouseEvent"'));
assert.ok(extensionWorker.includes('"Input.dispatchKeyEvent"'));
assert.ok(extensionWorker.includes('"Input.insertText"'));
assert.ok(!extensionWorker.includes("chrome.tabs.sendMessage"));
assert.ok(extensionContent.includes('action: "keepalive"'));
assert.ok(
  extensionContent.includes('chrome.runtime.connect({ name: "contentflow-provider-page" })'),
);
assert.ok(!extensionContent.includes("dispatchAction"));
assert.ok(!source.includes("--load-extension="));
assert.ok(source.includes("Carregar sem compactação"));
assert.ok(source.includes("ContentFlow Browser Bridge conectada"));
assert.ok(!/client\.send\(\s*["']Input\./.test(source));
assert.equal((source.match(/Page\.bringToFront/g) || []).length, 2);
assert.equal((source.match(/Target\.activateTarget/g) || []).length, 2);
assert.ok(source.includes("Modo Automático do Flow"));
assert.ok(!source.includes("AutomationControlled"));
assert.ok(!source.includes("Fetch.requestPaused"));
assert.ok(!source.includes("Fetch.continueRequest"));
assert.ok(source.includes('Page.setBypassCSP", { enabled: true }'));
assert.ok(source.includes("createCredentialsTracker(client, sessionId, services.signal)"));
assert.ok(source.includes("fresh-project"));
assert.ok(source.includes("!navigation.pinned"));
assert.ok(source.includes("flow\\.google\\.com\\/project\\/"));
assert.ok(source.includes('"iniciar geração"'));
assert.ok(source.includes("Retomando o projeto recém-verificado após CAPTCHA"));
assert.ok(source.includes("DOM.setFileInputFiles"));
assert.ok(source.includes("limite do modelo atingido"));
assert.ok(source.includes("Nano Banana 2 Lite"));
assert.ok(source.includes("Quantidade por prompt confirmada"));
assert.ok(source.includes("produce-visual-assets-in-browser"));
assert.ok(source.includes("Produção visual:"));
assert.ok(!source.includes("createFallbackArtifact"));
assert.ok(!source.includes("FALLBACK_IMAGE_BASE64"));
await assert.rejects(readFile(new URL("./fallback-data.mjs", import.meta.url)), /ENOENT/);
await testExtensionBridge(extensionWorker);

console.log(
  "OK: v1.3.7 validado (modos de produção visual, fila interna sem teto local, retomada sem duplicar concluídos, entrega image/video e ponte testada com estresse de 300 comandos).",
);
