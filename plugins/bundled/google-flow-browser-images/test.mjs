import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test } from "./handler.mjs";
import { testExtensionBridge } from "../../../extensions/contentflow-browser-bridge/test.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
assert.equal(manifest.version, "1.2.0");
assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
assert.equal(manifest.id, "local.contentflow.google-flow-batch-images");
assert.ok(manifest.permissions.includes("filesystem:read"));
assert.ok(manifest.permissions.includes("filesystem:write"));
assert.ok(manifest.permissions.includes("network"));
assert.ok(manifest.permissions.includes("process"));
assert.deepEqual(manifest.deliveryTypes, ["image"]);

const cap = manifest.capabilities.find((item) => item.id === "generate-images-in-browser");
assert.ok(cap);
assert.deepEqual(
  cap.inputPorts.map((port) => port.key),
  ["prompts", "reference_images"],
);
assert.deepEqual(
  cap.outputPorts.map((port) => port.key),
  ["images"],
);
assert.equal(cap.blockConfigSchema.properties.accountProfile.default, "default");
assert.equal(cap.blockConfigSchema.properties.imageModel.default, "flow_auto");
assert.equal(cap.blockConfigSchema.properties.fallbackOnModelLimit.default, true);
assert.equal(cap.blockConfigSchema.properties.aspectRatio.default, "flow_current");
assert.equal(cap.blockConfigSchema.properties.maxConcurrentGenerations.default, 1);
assert.equal(cap.blockConfigSchema.properties.delayBetweenPromptsMs.default, 5000);
assert.equal(cap.blockConfigSchema.properties.maxReferenceImages.maximum, 10);
assert.equal(cap.blockConfigSchema.properties.maxImagesPerPrompt.maximum, 4);

assert.deepEqual(__test.normalizePrompts(["primeiro", ["segundo"]]), ["primeiro", "segundo"]);
assert.deepEqual(__test.normalizeReferenceImages([{ id: "a" }, [{ id: "b" }]]), [
  { id: "a" },
  { id: "b" },
]);
assert.equal(__test.normalizeAccountProfile("canal_01"), "canal_01");
assert.throws(() => __test.normalizeAccountProfile("../perfil"), /accountProfile/);

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
assert.equal(automatic.imageModelName, null);
assert.equal(automatic.imageAspectRatio, null);
const explicit = __test.resolveGenerationPreferences({
  imageModel: "nano_banana_pro",
  aspectRatio: "landscape",
});
assert.equal(explicit.imageModelName, "GEM_PIX_2");
assert.equal(explicit.imageAspectRatio, "IMAGE_ASPECT_RATIO_LANDSCAPE");

const raw = JSON.stringify({
  clientContext: { projectId: "dynamic-project", recaptchaContext: { token: "dynamic-token" } },
  requests: [
    {
      imageModelName: "GEM_PIX_2",
      imageAspectRatio: "IMAGE_ASPECT_RATIO_PORTRAIT",
      structuredPrompt: { parts: [{ text: "teste" }] },
      clientContext: { recaptchaContext: { token: "dynamic-token" } },
      seed: 123,
    },
  ],
});
const preserved = __test.applyGenerationPreferences(raw, null, null);
assert.equal(preserved.changed, 0);
assert.deepEqual(JSON.parse(preserved.postData), JSON.parse(raw));
const patched = __test.applyGenerationPreferences(raw, "GEM_PIX", "IMAGE_ASPECT_RATIO_SQUARE");
const body = JSON.parse(patched.postData);
assert.equal(body.requests[0].imageModelName, "GEM_PIX");
assert.equal(body.requests[0].imageAspectRatio, "IMAGE_ASPECT_RATIO_SQUARE");
assert.equal(body.requests[0].clientContext.recaptchaContext.token, "dynamic-token");
assert.equal(body.clientContext.projectId, "dynamic-project");

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
assert.equal(quota.retryAfterMs, 60_000);

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

const source = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");
const extensionManifest = JSON.parse(
  await readFile(
    new URL("../../../extensions/contentflow-browser-bridge/manifest.json", import.meta.url),
    "utf8",
  ),
);
const extensionWorker = await readFile(
  new URL("../../../extensions/contentflow-browser-bridge/service-worker.js", import.meta.url),
  "utf8",
);
const extensionContent = await readFile(
  new URL("../../../extensions/contentflow-browser-bridge/content-script.js", import.meta.url),
  "utf8",
);
assert.equal(extensionManifest.manifest_version, 3);
assert.equal(extensionManifest.version, "0.1.0");
assert.deepEqual(extensionManifest.host_permissions, ["https://labs.google/*"]);
assert.deepEqual(extensionManifest.permissions, ["tabs", "storage"]);
assert.ok(extensionWorker.includes("globalThis.contentFlowBridge"));
assert.ok(extensionWorker.includes('BRIDGE_ID = "com.contentflow.browser-bridge"'));
assert.ok(extensionWorker.includes("command.executionKey"));
assert.ok(extensionWorker.includes("sessionToken"));
assert.ok(extensionContent.includes('action === "setPrompt"'));
assert.ok(extensionContent.includes('action === "clickGenerate"'));
assert.ok(!source.includes("--load-extension="));
assert.ok(source.includes("Carregar sem compactação"));
assert.ok(source.includes("ContentFlow Browser Bridge conectada"));
assert.ok(!/client\.send\(\s*["']Input\./.test(source));
assert.equal((source.match(/Page\.bringToFront/g) || []).length, 1);
assert.equal((source.match(/Target\.activateTarget/g) || []).length, 1);
assert.ok(source.includes("Modo Automático do Flow"));
assert.ok(source.includes("fresh-project"));
assert.ok(source.includes("!navigation.pinned"));
assert.ok(source.includes("Retomando o projeto recém-verificado após CAPTCHA"));
assert.ok(source.includes("DOM.setFileInputFiles"));
assert.ok(source.includes("limite do Nano Banana Pro atingido"));
assert.ok(!source.includes("createFallbackArtifact"));
assert.ok(!source.includes("FALLBACK_IMAGE_BASE64"));
await assert.rejects(readFile(new URL("./fallback-data.mjs", import.meta.url)), /ENOENT/);
await testExtensionBridge(extensionWorker);

console.log(
  "OK: v1.2.0 usa a ponte comum no Chrome, isola input e valida 300 comandos idempotentes.",
);
