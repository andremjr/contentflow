import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  __test,
  CAPABILITY_ID,
  ELEMENT_VIDEO_CAPABILITY_ID,
  FRAME_VIDEO_CAPABILITY_ID,
  executeWithAutomation,
  localeFor,
  resolveElementVideoInputs,
  resolveFrameVideoInputs,
  resolveReferences,
} from "./handler.mjs";
import { createVibesAutomation, __test as automationTest } from "./vibes-automation.mjs";
import {
  __test as bridgeTest,
  attachVibesBridge,
  bridgeAvailability,
  commandId,
  executionKey,
  PLUGIN_ID,
  VIBES_ORIGIN,
} from "./browser-bridge-client.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const p45Fixture = JSON.parse(
  await readFile(new URL("./fixtures/p45-elements-video.json", import.meta.url), "utf8"),
);
const automationSource = await readFile(new URL("./vibes-automation.mjs", import.meta.url), "utf8");

function storedImage(id = "reference", overrides = {}) {
  return {
    id,
    name: `${id}.png`,
    mimeType: "image/png",
    size: 1024,
    url: `stored://${id}`,
    sha256: id.padEnd(64, "0").slice(0, 64),
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    executionId: "p43-execution",
    traceId: "p43-trace",
    blockId: "p43-block",
    capabilityId: overrides.capabilityId ?? CAPABILITY_ID,
    attempt: overrides.attempt ?? 1,
    invocation: overrides.invocation ?? { mode: "start" },
    configuration: {
      accountProfile: "default",
      fallbackAccountProfiles: [],
      projectMode: "auto",
      projectUrl: "",
      startMinimized: true,
      ...overrides.configuration,
    },
    settings: {},
    inputs: { prompts: "A cinematic portrait at dawn", ...overrides.inputs },
    inputDeliveries: overrides.inputDeliveries,
    batch: overrides.batch ?? { itemId: "prompt-item-1", index: 0, total: 1 },
    itemAction: overrides.itemAction,
    resolvedInstruction: overrides.resolvedInstruction,
    context: { locale: overrides.locale ?? "pt-BR" },
  };
}

function frameVideoRequest(overrides = {}) {
  const initial = overrides.initialFrames ?? [storedImage("frame-a"), storedImage("frame-b")];
  const final = overrides.finalFrames ?? [storedImage("final-b"), storedImage("final-a")];
  const prompts = overrides.prompts ?? ["Move B", "Move A"];
  return request({
    ...overrides,
    capabilityId: FRAME_VIDEO_CAPABILITY_ID,
    configuration: { resolution: "720p", ...overrides.configuration },
    inputs: {
      initial_frames: initial,
      final_frames: final,
      prompts,
      style_references: overrides.styleReferences ?? [],
      ...overrides.inputs,
    },
    inputDeliveries: overrides.inputDeliveries ?? [
      { portKey: "initial_frames", deliveryId: "initial", itemIds: ["scene-a", "scene-b"] },
      { portKey: "final_frames", deliveryId: "final", itemIds: ["scene-b", "scene-a"] },
      { portKey: "prompts", deliveryId: "prompts", itemIds: ["scene-b", "scene-a"] },
    ],
    batch: overrides.batch ?? { itemId: "frame-operation-a", index: 0, total: 2 },
  });
}

function elementVideoRequest(overrides = {}) {
  return request({
    ...overrides,
    capabilityId: ELEMENT_VIDEO_CAPABILITY_ID,
    configuration: { resolution: "720p", ...overrides.configuration },
    inputs: {
      prompts: overrides.prompts ?? "A character crosses a rainy neon street",
      character_reference: overrides.characterReference ?? storedImage("character"),
      scene_reference: overrides.sceneReference ?? storedImage("scene"),
      style_references: overrides.styleReferences ?? [storedImage("style-1")],
      ...overrides.inputs,
    },
    batch: overrides.batch ?? { itemId: "elements-operation-a", index: 0, total: 1 },
  });
}

function services() {
  return {
    signal: new AbortController().signal,
    resolveInputFile: async (file) => `C:\\staging\\${file.name}`,
    getWorkspacePath: (value) => `C:\\workspace\\${value}`,
    publishPartial: async () => undefined,
  };
}

function fakeAutomation(overrides = {}) {
  return {
    profileStatus: async (profileAlias) => ({
      status: "success",
      values: { ready: true, profileAlias },
    }),
    prepareProfile: async (profileAlias) => ({
      status: "success",
      values: { ready: true, profileAlias },
    }),
    start: async () => ({ status: "pending", jobId: "a".repeat(64), pollAfterMs: 2500 }),
    resume: async () => ({ status: "pending", jobId: "a".repeat(64), pollAfterMs: 2500 }),
    cancel: async () => ({ status: "success", values: {} }),
    regenerate: async () => ({
      status: "success",
      values: { images: [storedImage("regenerated")] },
    }),
    ...overrides,
  };
}

test("manifesto declara B3, B4 e B5 com permissões, lotes, actions e prompt preview", () => {
  assert.equal(manifest.id, PLUGIN_ID);
  assert.equal(manifest.version, "0.1.0-dev.0");
  assert.deepEqual(manifest.permissions, [
    "network",
    "filesystem:read",
    "filesystem:write",
    "process",
  ]);
  assert.deepEqual(manifest.networkHosts, ["vibes.ai", "*.fbcdn.net"]);
  assert.deepEqual(manifest.deliveryTypes, ["image", "video", "processing"]);
  assert.deepEqual(
    manifest.capabilities.map((capability) => capability.id),
    [CAPABILITY_ID, FRAME_VIDEO_CAPABILITY_ID, ELEMENT_VIDEO_CAPABILITY_ID],
  );
  const capability = manifest.capabilities[0];
  assert.equal(capability.execution.mode, "async");
  assert.deepEqual(capability.execution.itemOrchestration, {
    mode: "sequential",
    inputPort: "prompts",
    outputPort: "images",
  });
  assert.deepEqual(
    capability.itemActions.map((entry) => entry.action),
    ["regenerate", "replace", "select", "download"],
  );
  assert.match(capability.promptPreview.template, /\{\{INPUT:prompts\}\}/);
  assert.deepEqual(capability.outputSchema.properties.images, {
    type: "array",
    minItems: 4,
    maxItems: 4,
  });
  const frames = manifest.capabilities[1];
  assert.deepEqual(frames.execution.itemOrchestration, {
    mode: "sequential",
    inputPort: "initial_frames",
    outputPort: "videos",
  });
  assert.deepEqual(
    frames.itemActions.map((entry) => entry.action),
    ["regenerate", "replace", "select", "download"],
  );
  assert.deepEqual(frames.outputSchema.properties.videos, {
    type: "array",
    minItems: 4,
    maxItems: 4,
  });
  assert.deepEqual(
    frames.blockConfigSchema.properties.resolution.oneOf.map((entry) => entry.const),
    ["480p", "720p"],
  );
  const elements = manifest.capabilities[2];
  assert.deepEqual(elements.execution.itemOrchestration, {
    mode: "sequential",
    inputPort: "prompts",
    outputPort: "videos",
  });
  assert.deepEqual(
    elements.itemActions.map((entry) => entry.action),
    ["regenerate", "replace", "select", "download"],
  );
  assert.deepEqual(elements.outputSchema.properties.videos, {
    type: "array",
    minItems: 4,
    maxItems: 4,
  });
  assert.equal(
    elements.inputPorts.find((port) => port.key === "character_reference").multiple,
    false,
  );
});

test("manifesto localiza toda a moldura de B3, B4 e B5 em inglês e espanhol", () => {
  for (const locale of ["en", "es"]) {
    for (const capability of manifest.capabilities) {
      const localized = manifest.localizations[locale].capabilities[capability.id];
      assert.ok(localized.name && localized.description);
      for (const port of capability.inputPorts) assert.ok(localized.inputPorts[port.key]?.label);
      for (const port of capability.outputPorts) assert.ok(localized.outputPorts[port.key]?.label);
      for (const action of capability.itemActions)
        assert.ok(localized.itemActions[action.action]?.label);
      for (const property of Object.keys(capability.blockConfigSchema.properties)) {
        assert.ok(localized.blockConfigSchema.properties[property]?.title);
      }
    }
  }
});

test("B4 alinha quadro final e prompt pela identidade, nunca pelo índice isolado", async () => {
  const value = frameVideoRequest();
  const resolved = await resolveFrameVideoInputs(value, services());
  assert.equal(resolved.frames[0].file.id, "frame-a");
  assert.equal(resolved.frames[1].file.id, "final-a");
  assert.equal(resolved.prompt, "Move A");

  await assert.rejects(
    () =>
      resolveFrameVideoInputs(
        frameVideoRequest({
          inputDeliveries: [
            { portKey: "initial_frames", deliveryId: "initial", itemIds: ["scene-a", "scene-b"] },
            { portKey: "final_frames", deliveryId: "final", itemIds: ["other-a", "other-b"] },
            { portKey: "prompts", deliveryId: "prompts", itemIds: ["scene-a", "scene-b"] },
          ],
        }),
        services(),
      ),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("B4 aceita quadro final ausente e encaminha resolução, frame e estilo resolvidos", async () => {
  let received;
  const response = await executeWithAutomation(
    frameVideoRequest({
      initialFrames: storedImage("initial-only"),
      finalFrames: undefined,
      prompts: "Slow camera push",
      styleReferences: [storedImage("style")],
      inputDeliveries: [],
      batch: { itemId: "single-frame", index: 0, total: 1 },
      inputs: { final_frames: undefined },
      configuration: { resolution: "480p" },
    }),
    services(),
    fakeAutomation({
      start: async (input) => {
        received = input;
        return { status: "pending", jobId: "d".repeat(64), pollAfterMs: 2500 };
      },
    }),
  );
  assert.equal(response.status, "pending");
  assert.equal(received.kind, "video-frames");
  assert.equal(received.resolution, "480p");
  assert.deepEqual(
    received.frames.map((entry) => entry.role),
    ["initial"],
  );
  assert.deepEqual(
    received.references.map((entry) => entry.role),
    ["style"],
  );
});

test("B4 retoma pelo jobId após reload sem resolver frames nem ressubmeter", async () => {
  const calls = [];
  const jobId = "e".repeat(64);
  const resumed = await executeWithAutomation(
    frameVideoRequest({
      invocation: { mode: "resume", jobId },
      inputs: { initial_frames: undefined, final_frames: undefined, prompts: undefined },
    }),
    {
      ...services(),
      resolveInputFile: async () => {
        throw new Error("resume não deve resolver arquivos");
      },
    },
    fakeAutomation({
      start: async () => {
        calls.push("start");
        throw new Error("resume não deve ressubmeter");
      },
      resume: async (receivedJobId) => {
        calls.push(["resume", receivedJobId]);
        return { status: "pending", jobId: receivedJobId, pollAfterMs: 2500 };
      },
    }),
  );
  assert.equal(resumed.status, "pending");
  assert.deepEqual(calls, [["resume", jobId]]);
});

test("B4 start repetido lê recibo submetido e não abre navegador nem duplica job", async () => {
  const root = await mkdtemp(join(tmpdir(), "contentflow-vibes-p44-"));
  try {
    const value = frameVideoRequest({
      initialFrames: storedImage("initial-reload"),
      finalFrames: undefined,
      prompts: "Continue the same shot",
      inputDeliveries: [],
      batch: { itemId: "frame-reload", index: 0, total: 1 },
      inputs: { final_frames: undefined },
    });
    const jobId = automationTest.jobKey(value, "default");
    const marker = join(root, "profiles", "default", ".vibes-profile-ready.json");
    const receipt = join(root, "receipts", `${jobId}.json`);
    await mkdir(join(root, "profiles", "default"), { recursive: true });
    await mkdir(join(root, "receipts"), { recursive: true });
    await writeFile(marker, JSON.stringify({ ready: true }), "utf8");
    await writeFile(
      receipt,
      JSON.stringify({ state: "submitted", mediaKind: "video", completed: 0 }),
      "utf8",
    );
    const automation = createVibesAutomation(value, {
      ...services(),
      getWorkspacePath: (relative) => join(root, relative),
    });
    const response = await automation.start({
      kind: "video-frames",
      profileAlias: "default",
      prompt: "Continue the same shot",
      frames: [],
      references: [],
      resolution: "720p",
      projectMode: "auto",
      projectUrl: "",
      startMinimized: true,
    });
    assert.equal(response.status, "pending");
    assert.equal(response.jobId, jobId);
    assert.match(response.message, /vídeo/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("B4 regeneração isolada preserva a porta videos", async () => {
  let received;
  const response = await executeWithAutomation(
    frameVideoRequest({
      initialFrames: storedImage("initial-regenerate"),
      finalFrames: undefined,
      prompts: "Regenerate this motion",
      inputDeliveries: [],
      batch: { itemId: "frame-regenerate", index: 0, total: 1 },
      inputs: { final_frames: undefined },
      invocation: {
        mode: "item_action",
        action: "regenerate",
        itemId: "video-2",
        outputPort: "videos",
      },
      itemAction: {
        key: "variant:2",
        variantKey: "video:2",
        input: storedImage("initial-regenerate"),
        output: { ...storedImage("old-video"), mimeType: "video/mp4", name: "old-video.mp4" },
        attempt: 2,
      },
    }),
    services(),
    fakeAutomation({
      regenerate: async (input) => {
        received = input;
        return {
          status: "success",
          values: {
            videos: [{ ...storedImage("new-video"), mimeType: "video/mp4", name: "new-video.mp4" }],
          },
        };
      },
    }),
  );
  assert.equal(response.status, "success");
  assert.equal(response.values.videos.length, 1);
  assert.equal(received.kind, "video-frames");
});

test("B5 preserva os papéis Personagem, Cena e Estilo e encaminha a resolução", async () => {
  const value = elementVideoRequest({
    styleReferences: [storedImage("style-1"), storedImage("style-2")],
    configuration: { resolution: "480p" },
  });
  const resolved = await resolveElementVideoInputs(value, services());
  assert.deepEqual(
    resolved.references.map((entry) => entry.role),
    p45Fixture.expected.roles,
  );

  let received;
  const response = await executeWithAutomation(
    value,
    services(),
    fakeAutomation({
      start: async (input) => {
        received = input;
        return { status: "pending", jobId: "f".repeat(64), pollAfterMs: 2500 };
      },
    }),
  );
  assert.equal(response.status, "pending");
  assert.equal(received.kind, "video-elements");
  assert.equal(received.resolution, "480p");
  assert.deepEqual(
    received.references.map((entry) => entry.role),
    p45Fixture.expected.roles,
  );
  assert.deepEqual(automationTest.elementRoleTerms("character"), [
    "character",
    "personagem",
    "personaje",
  ]);
  assert.deepEqual(automationTest.elementRoleTerms("scene"), ["scene", "cena", "escena"]);
  assert.deepEqual(automationTest.elementRoleTerms("style"), ["style", "estilo"]);
  assert.throws(
    () => automationTest.elementRoleTerms("character-scene"),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("B5 rejeita duas referências de Personagem com mensagem clara nos três idiomas", async () => {
  const messages = [];
  for (const locale of ["pt-BR", "en", "es"]) {
    const response = await executeWithAutomation(
      elementVideoRequest({
        locale,
        inputs: {
          character_reference: [storedImage("character-a"), storedImage("character-b")],
        },
      }),
      services(),
      fakeAutomation({
        start: async () => {
          throw new Error("a automação não deve iniciar");
        },
      }),
    );
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
    assert.match(response.message, /Personagem|Character|Personaje/);
    assert.match(response.message, /1/);
    messages.push(response.message);
  }
  assert.equal(new Set(messages).size, 3);
});

test("B5 retoma e cancela pelo jobId sem reconstruir prompt ou referências", async () => {
  const calls = [];
  const jobId = "1".repeat(64);
  const automation = fakeAutomation({
    resume: async (receivedJobId) => {
      calls.push(["resume", receivedJobId]);
      return { status: "pending", jobId: receivedJobId, pollAfterMs: 2500 };
    },
    cancel: async (receivedJobId) => {
      calls.push(["cancel", receivedJobId]);
      return { status: "success", values: {} };
    },
  });
  const withoutInputs = { prompts: undefined, character_reference: undefined };
  const resumed = await executeWithAutomation(
    elementVideoRequest({ invocation: { mode: "resume", jobId }, inputs: withoutInputs }),
    {
      ...services(),
      resolveInputFile: async () => {
        throw new Error("resume não deve resolver arquivos");
      },
    },
    automation,
  );
  const cancelled = await executeWithAutomation(
    elementVideoRequest({ invocation: { mode: "cancel", jobId }, inputs: withoutInputs }),
    services(),
    automation,
  );
  assert.equal(resumed.status, "pending");
  assert.equal(cancelled.status, "success");
  assert.deepEqual(calls, [
    ["resume", jobId],
    ["cancel", jobId],
  ]);
});

test("B5 regeneração isolada preserva a porta videos", async () => {
  let received;
  const response = await executeWithAutomation(
    elementVideoRequest({
      invocation: {
        mode: "item_action",
        action: "regenerate",
        itemId: "elements-video-3",
        outputPort: "videos",
      },
      itemAction: {
        key: "variant:3",
        variantKey: "video:3",
        input: "Regenerate only this Elements video",
        output: { ...storedImage("old-elements-video"), mimeType: "video/mp4" },
        attempt: 2,
      },
    }),
    services(),
    fakeAutomation({
      regenerate: async (input) => {
        received = input;
        return {
          status: "success",
          values: {
            videos: [
              { ...storedImage("new-elements-video"), mimeType: "video/mp4", name: "new.mp4" },
            ],
          },
        };
      },
    }),
  );
  assert.equal(response.status, "success");
  assert.equal(response.values.videos.length, 1);
  assert.equal(received.kind, "video-elements");
  assert.equal(received.prompt, "Regenerate only this Elements video");
});

test("prompt combina instrução resolvida sem duplicar conteúdo", () => {
  assert.equal(__test.composePrompt(request()), "A cinematic portrait at dawn");
  assert.equal(
    __test.composePrompt(request({ resolvedInstruction: "Keep the same character" })),
    "Keep the same character\n\nA cinematic portrait at dawn",
  );
  assert.equal(
    __test.composePrompt(request({ resolvedInstruction: "A cinematic portrait at dawn" })),
    "A cinematic portrait at dawn",
  );
  assert.throws(
    () => __test.composePrompt(request({ inputs: { prompts: ["a", "b"] } })),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("projeto novo e existente são normalizados sem aceitar outra origem", () => {
  assert.equal(__test.normalizeExecution(request()).projectMode, "auto");
  const existing = __test.normalizeExecution(
    request({
      configuration: {
        projectMode: "existing",
        projectUrl: "https://vibes.ai/projects/project-123/",
      },
    }),
  );
  assert.equal(existing.projectUrl, "https://vibes.ai/projects/project-123");
  for (const invalid of [
    "https://www.vibes.ai/projects/a",
    "https://vibes.ai/explore",
    "http://vibes.ai/projects/a",
    "https://vibes.ai/projects/a/extra",
  ]) {
    assert.throws(
      () => __test.normalizeProjectUrl(invalid, request()),
      (error) => error.code === "INVALID_CONFIGURATION",
    );
  }
});

test("referências tipadas preservam papel e rejeitam limite, MIME e tamanho", async () => {
  const value = request({
    inputs: {
      character_reference: storedImage("character"),
      scene_reference: storedImage("scene"),
      style_references: [storedImage("style-1"), storedImage("style-2")],
    },
  });
  const resolved = await resolveReferences(value, services());
  assert.deepEqual(
    resolved.map((entry) => entry.role),
    ["character", "scene", "style", "style"],
  );
  assert.equal(new Set(resolved.map((entry) => entry.path)).size, 4);
  await assert.rejects(
    () =>
      resolveReferences(
        request({ inputs: { character_reference: [storedImage("a"), storedImage("b")] } }),
        services(),
      ),
    (error) => error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () =>
      resolveReferences(
        request({ inputs: { scene_reference: storedImage("bad", { mimeType: "image/gif" }) } }),
        services(),
      ),
    (error) => error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () =>
      resolveReferences(
        request({
          inputs: {
            style_references: Array.from({ length: 7 }, (_, index) =>
              storedImage(`style-${index}`),
            ),
          },
        }),
        services(),
      ),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("start entrega um job opaco e recebe referências já resolvidas", async () => {
  let received;
  const response = await executeWithAutomation(
    request({ inputs: { character_reference: storedImage("character") } }),
    services(),
    fakeAutomation({
      start: async (value) => {
        received = value;
        return { status: "pending", jobId: "b".repeat(64), pollAfterMs: 2500 };
      },
    }),
  );
  assert.equal(response.status, "pending");
  assert.match(response.jobId, /^[a-f0-9]{64}$/);
  assert.equal(received.references[0].role, "character");
  assert.equal(received.projectMode, "auto");
});

test("resume e cancel usam o mesmo job sem reconstruir prompt ou referências", async () => {
  const calls = [];
  const automation = fakeAutomation({
    resume: async (jobId) => {
      calls.push(["resume", jobId]);
      return {
        status: "pending",
        jobId,
        pollAfterMs: 2500,
        partialValues: { images: [storedImage("one")], project_url: "https://vibes.ai/projects/p" },
      };
    },
    cancel: async (jobId) => {
      calls.push(["cancel", jobId]);
      return { status: "success", values: {} };
    },
  });
  const jobId = "c".repeat(64);
  const resumed = await executeWithAutomation(
    request({ invocation: { mode: "resume", jobId }, inputs: { prompts: undefined } }),
    services(),
    automation,
  );
  const cancelled = await executeWithAutomation(
    request({ invocation: { mode: "cancel", jobId }, inputs: { prompts: undefined } }),
    services(),
    automation,
  );
  assert.equal(resumed.partialValues.images.length, 1);
  assert.equal(cancelled.status, "success");
  assert.deepEqual(calls, [
    ["resume", jobId],
    ["cancel", jobId],
  ]);
});

test("regenerate conclui na própria item_action e mantém a porta plural", async () => {
  let input;
  const response = await executeWithAutomation(
    request({
      invocation: {
        mode: "item_action",
        action: "regenerate",
        itemId: "variant-2",
        outputPort: "images",
      },
      itemAction: {
        key: "variant:2",
        variantKey: "image:2",
        input: "Regenerate only this prompt",
        output: storedImage("old"),
        attempt: 2,
      },
    }),
    services(),
    fakeAutomation({
      regenerate: async (value) => {
        input = value;
        return { status: "success", values: { images: [storedImage("new")] } };
      },
    }),
  );
  assert.equal(response.status, "success");
  assert.equal(response.values.images.length, 1);
  assert.equal(input.prompt, "Regenerate only this prompt");
});

test("configure status/prepare e mensagens funcionam nos três idiomas", async () => {
  const samples = [];
  for (const locale of ["pt-BR", "en", "es"]) {
    const response = await executeWithAutomation(
      request({ locale, invocation: { mode: "configure", action: "status" }, inputs: {} }),
      services(),
      fakeAutomation({
        profileStatus: async (alias) => ({
          status: "success",
          values: { ready: false, profileAlias: alias, message: locale },
        }),
      }),
    );
    samples.push(response.values.message);
  }
  assert.equal(new Set(samples).size, 3);
  assert.equal(localeFor(request({ locale: "en-US" })), "en");
  assert.equal(localeFor(request({ locale: "es-MX" })), "es");
});

test("matriz P03 separa intervenção, limite, recusa e falha transitória", () => {
  assert.deepEqual(automationTest.classifyAlerts(["CAPTCHA verification"]), {
    pending: true,
    code: "AUTHENTICATION_FAILED",
    retryAfterMs: 15000,
  });
  assert.deepEqual(automationTest.classifyAlerts(["Rate limit. Try again later"]), {
    pending: true,
    code: "RATE_LIMIT",
    retryAfterMs: 30000,
  });
  assert.equal(automationTest.classifyAlerts(["Content refused"]).code, "CONTENT_REFUSED");
  assert.equal(automationTest.classifyAlerts(["Unexpected provider failure"]).retryable, true);
});

test("mídia só aceita HTTPS em fbcdn e recibo inclui identidade do item", () => {
  assert.equal(
    automationTest.validateMediaUrl("https://scontent.xx.fbcdn.net/image.jpg"),
    "https://scontent.xx.fbcdn.net/image.jpg",
  );
  for (const invalid of [
    "http://scontent.xx.fbcdn.net/image.jpg",
    "https://vibes.ai/image.jpg",
    "https://user:pass@scontent.xx.fbcdn.net/image.jpg",
  ]) {
    assert.throws(
      () => automationTest.validateMediaUrl(invalid),
      (error) => error.code === "OUTPUT_VALIDATION_FAILED",
    );
  }
  const first = automationTest.jobKey(request(), "default");
  assert.equal(first, automationTest.jobKey(request(), "default"));
  assert.notEqual(
    first,
    automationTest.jobKey(
      request({ batch: { itemId: "prompt-item-2", index: 1, total: 2 } }),
      "default",
    ),
  );
});

test("quatro variantes mantêm lote e ordem sem duplicação ou cruzamento", () => {
  const cards = [4, 2, 1, 3].map((ordinal) => ({
    mediaId: `batch-prompt-a-content-${ordinal}`,
    batchId: "batch-prompt-a",
    ordinal,
    ready: true,
  }));
  const reconciled = automationTest.reconcileCards(["historic-content-1"], cards);
  assert.equal(reconciled.batchId, "batch-prompt-a");
  assert.deepEqual(
    reconciled.ready.map((card) => card.ordinal),
    [1, 2, 3, 4],
  );
  const currentDom = automationTest.reconcileCards(
    [],
    [3, 1, 0, 2].map((ordinal) => ({
      mediaId: `batch-current-content-${ordinal}`,
      batchId: "batch-current",
      ordinal,
      ready: true,
    })),
  );
  assert.deepEqual(
    currentDom.ready.map((card) => card.ordinal),
    [1, 2, 3, 4],
  );
  const afterReload = automationTest.reconcileCards(
    [],
    [
      ...[0, 1, 2, 3].map((ordinal) => ({
        mediaId: `batch-019d0000-1000-7000-8000-000000000000-content-${ordinal}`,
        batchId: "batch-019d0000-1000-7000-8000-000000000000",
        ordinal,
        ready: true,
      })),
      ...[0, 1, 2, 3].map((ordinal) => ({
        mediaId: `batch-019c0000-1000-7000-8000-000000000000-content-${ordinal}`,
        batchId: "batch-019c0000-1000-7000-8000-000000000000",
        ordinal,
        ready: true,
      })),
    ],
    new Date(Number.parseInt("019d00001000", 16)).toISOString(),
  );
  assert.equal(afterReload.batchId, "batch-019d0000-1000-7000-8000-000000000000");
  const unbatched = automationTest.reconcileCards(
    ["historic-upload"],
    ["one", "two", "three", "four"].map((mediaId) => ({
      mediaId,
      batchId: "",
      ordinal: -1,
      ready: true,
    })),
  );
  assert.match(unbatched.batchId, /^unbatched-[a-f0-9]{64}$/);
  assert.deepEqual(
    unbatched.ready.map((card) => card.ordinal),
    [1, 2, 3, 4],
  );
  assert.throws(
    () =>
      automationTest.reconcileCards(
        [],
        [
          ...cards,
          {
            mediaId: "batch-prompt-b-content-1",
            batchId: "batch-prompt-b",
            ordinal: 1,
            ready: true,
          },
        ],
      ),
    (error) => error.code === "OUTPUT_VALIDATION_FAILED",
  );
  assert.throws(
    () =>
      automationTest.reconcileCards(
        [],
        [
          cards[0],
          {
            mediaId: "batch-prompt-a-duplicate",
            batchId: "batch-prompt-a",
            ordinal: 4,
            ready: true,
          },
        ],
      ),
    (error) => error.code === "OUTPUT_VALIDATION_FAILED",
  );
});

test("cliente fixa origem, rota e identidades idempotentes", () => {
  assert.doesNotThrow(() =>
    bridgeTest.validateProjectUrl("https://vibes.ai/projects/project-123", request()),
  );
  assert.equal(bridgeAvailability().minimumVersion, "0.4.0");
  assert.equal(VIBES_ORIGIN, "https://vibes.ai");
  const key = executionKey(request(), "default");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(commandId(key, "click", "submit"), commandId(key, "click", "other"));
});

test("cliente conecta, envia upload/lease e libera a sessão", async () => {
  const actions = [];
  const identity = {
    bridgeId: "com.contentflow.browser-bridge",
    protocolVersion: 2,
    extensionVersion: "0.4.0",
  };
  const context = vm.createContext({
    setTimeout: (callback, ms) => {
      const timer = setTimeout(callback, ms);
      timer.unref();
      return timer;
    },
    contentFlowBridge: {
      identity,
      connect: () => ({ ok: true }),
      dispatch: (command) => {
        actions.push(command.action);
        return { ok: true, protocolVersion: 2 };
      },
      cancel: () => ({ ok: true }),
      disconnect: () => ({ ok: true }),
    },
  });
  const client = {
    async send(method, params = {}, sessionId) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://bridge/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.evaluate") {
        if (sessionId === "page-session")
          return {
            result: {
              value: { url: "https://vibes.ai/projects/project-123", origin: "https://vibes.ai" },
            },
          };
        return { result: { value: await vm.runInContext(String(params.expression), context) } };
      }
      return {};
    },
  };
  const bridge = await attachVibesBridge({
    client,
    pageSessionId: "page-session",
    expectedUrl: "https://vibes.ai/projects/project-123",
    profileId: "default",
    request: request(),
    signal: new AbortController().signal,
  });
  await bridge.setFiles(["C:\\staging\\reference.png"], ['input[type="file"]']);
  await bridge.acquireLease("generation");
  await bridge.releaseLease("generation");
  await bridge.dispose();
  assert.deepEqual(actions, ["ping", "setFiles", "leaseAcquire", "leaseRelease", "leaseRelease"]);
});

test("aguarda o Chrome persistir o perfil antes de encerrar à força", async () => {
  const events = [];
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => events.push("kill");
  const client = {
    async send(command) {
      events.push(command);
      setTimeout(() => {
        child.exitCode = 0;
        child.emit("exit", 0);
      }, 10);
    },
    close() {
      events.push("client.close");
    },
  };

  await automationTest.closeBrowserGracefully(client, child);
  assert.deepEqual(events, ["Browser.close", "client.close"]);
});

test("repete somente corridas transitórias ao anexar a aba do Chrome", () => {
  assert.equal(
    automationTest.isTransientBrowserAttachmentError(new Error("Session with given id not found.")),
    true,
  );
  assert.equal(
    automationTest.isTransientBrowserAttachmentError(new Error("Target session abc not found")),
    true,
  );
  assert.equal(
    automationTest.isTransientBrowserAttachmentError(new Error("Login do Vibes necessário")),
    false,
  );
});

test("prioriza o controle real de envio do Vibes e exige confirmação observável", () => {
  assert.match(
    automationSource,
    /button\[data-analytics-id="send_message"\]\[data-analytics-prompt-type\]/,
  );
  assert.match(automationSource, /preferDomActivation:\s*true/);
  assert.match(automationSource, /!value\.generateReady/);
});

test("rejeita alias, capability e action inválidos com erro seguro", async () => {
  const invalidAlias = await executeWithAutomation(
    request({
      invocation: { mode: "configure", action: "status" },
      configuration: { accountProfile: "../profile" },
    }),
    services(),
    fakeAutomation(),
  );
  const invalidCapability = await executeWithAutomation(
    request({ capabilityId: "generate-video-in-browser" }),
    services(),
    fakeAutomation(),
  );
  const invalidAction = await executeWithAutomation(
    request({
      invocation: { mode: "item_action", action: "delete", itemId: "x", outputPort: "images" },
    }),
    services(),
    fakeAutomation(),
  );
  assert.equal(invalidAlias.code, "INVALID_CONFIGURATION");
  assert.equal(invalidCapability.code, "NOT_FOUND");
  assert.equal(invalidAction.code, "INVALID_CONFIGURATION");
});
