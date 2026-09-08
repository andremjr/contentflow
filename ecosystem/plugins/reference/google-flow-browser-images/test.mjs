import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test } from "./handler.mjs";
import { testExtensionBridge } from "../../../browser-bridge/test.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
assert.equal(manifest.version, "1.3.1");
assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
assert.equal(manifest.id, "local.contentflow.google-flow-batch-images");
assert.ok(manifest.permissions.includes("filesystem:read"));
assert.ok(manifest.permissions.includes("filesystem:write"));
assert.ok(manifest.permissions.includes("network"));
assert.ok(manifest.permissions.includes("process"));
assert.deepEqual(manifest.deliveryTypes, ["image", "video"]);
assert.ok(manifest.networkHosts.includes("flow.google.com"));
assert.equal(manifest.settingsSchema.properties.keepBrowserOpen.default, false);

const cap = manifest.capabilities.find((item) => item.id === "generate-images-in-browser");
assert.ok(cap);
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
assert.equal(cap.blockConfigSchema.properties.maxPrompts.default, 100);
assert.equal(cap.blockConfigSchema.properties.maxPrompts.maximum, 100);
assert.equal(cap.execution.itemOrchestration, undefined);
assert.equal(cap.blockConfigSchema.properties.maxConcurrentGenerations.default, 1);
assert.equal(cap.blockConfigSchema.properties.delayBetweenPromptsMs.default, 6000);
assert.equal(cap.blockConfigSchema.properties.rateLimitRetryAttempts.default, 8);
assert.equal(cap.blockConfigSchema.properties.maxReferenceImages.maximum, 10);
assert.equal(cap.blockConfigSchema.properties.maxImagesPerPrompt.maximum, 4);

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
const failedRequest = { executionId: "execution-1", blockId: "flow-1", attempt: 1 };
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
const explicit = __test.resolveGenerationPreferences({
  imageModel: "nano_banana_pro",
  aspectRatio: "landscape",
});
assert.equal(explicit.imageModelName, "GEM_PIX_2");
assert.equal(explicit.imageAspectRatio, "IMAGE_ASPECT_RATIO_LANDSCAPE");
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
const volumePrompts = Array.from({ length: 100 }, (_, index) => `prompt ${index + 1}`);
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
assert.equal(volumeSubmissions, 100);
assert.equal(volumePlan.results.length, 100);
assert.equal(volumePlan.failures.length, 0);

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
assert.equal(extensionManifest.version, "0.3.6");
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
]);
assert.deepEqual(extensionManifest.permissions, ["tabs", "storage", "debugger"]);
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
assert.ok(!source.includes("createFallbackArtifact"));
assert.ok(!source.includes("FALLBACK_IMAGE_BASE64"));
await assert.rejects(readFile(new URL("./fallback-data.mjs", import.meta.url)), /ENOENT/);
await testExtensionBridge(extensionWorker);

console.log(
  "OK: v1.3.1 validado (lotes dinâmicos para qualquer quantidade de prompts, entrega image/video e ponte testada com estresse de 300 comandos).",
);
