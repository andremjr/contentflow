import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CHATGPT_SEND_BUTTON_SELECTORS,
  __test,
  assertGeneratedImageCapture,
  attachmentsAreReady,
  batchOperationKey,
  composerUploadState,
  collectGeneratedImages,
  conversationForInvocation,
  imageActionBaselineHashes,
  imageConversationCorrelation,
  imageItemUpdate,
  imageRegenerationFeedback,
  materializeGeneratedImage,
  promptPageState,
  publishGeneratedImagePartial,
  sniffImageMimeType,
  waitForAttachmentsReady,
  waitAndClickSend,
  execute,
  partsForConversation,
  validateConversationUrl,
} from "./handler.mjs";
import { attachContentFlowBridge } from "./browser-bridge-client.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const handlerSource = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");
const p30Baseline = JSON.parse(
  await readFile(new URL("./fixtures/p30-non-visual-capabilities.json", import.meta.url), "utf8"),
);
const p31ImageDom = JSON.parse(
  await readFile(new URL("./fixtures/p31-image-dom.json", import.meta.url), "utf8"),
);
const p32SequentialPrompts = JSON.parse(
  await readFile(new URL("./fixtures/p32-sequential-image-prompts.json", import.meta.url), "utf8"),
);
const p33ImageRegeneration = JSON.parse(
  await readFile(new URL("./fixtures/p33-image-regeneration.json", import.meta.url), "utf8"),
);

const P30_NON_VISUAL_CAPABILITY_IDS = [
  "generate-text-in-browser",
  "search-web-in-browser",
  "deep-research-in-browser",
  "choose-library-item-in-browser",
  "validate-content-in-browser",
  "analyze-images-in-browser",
  "analyze-documents-in-browser",
];

test("aceita somente referências de conversa do ChatGPT", () => {
  assert.equal(
    validateConversationUrl("https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc"),
    "https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc",
  );
  assert.throws(() => validateConversationUrl("https://example.com/c/123"), /não pertence/);
  assert.throws(() => validateConversationUrl("javascript:alert(1)"), /não pertence/);
});

function request(overrides = {}) {
  return {
    capabilityId: overrides.capabilityId ?? "generate-text-in-browser",
    resolvedInstruction: overrides.resolvedInstruction ?? "Escreva com clareza.",
    configuration: {
      promptTemplate: "{{BLOCK_INSTRUCTIONS}}\nTema: {{CONTENT}}\nCanal: {{CHANNEL_NAME}}",
      generationMode: "single",
      plainTextOnly: true,
      cleanOutput: true,
      retryAttempts: 0,
      ...overrides.configuration,
    },
    settings: { diagnosticMockResponse: "TESTE OK", ...overrides.settings },
    executionId: overrides.executionId ?? "execution-test",
    blockId: overrides.blockId ?? "block-test",
    attempt: overrides.attempt ?? 1,
    invocation: overrides.invocation ?? { mode: "start" },
    inputs: { content: "Tema principal", ...overrides.inputs },
    instructionContextInputs: overrides.instructionContextInputs,
    context: {
      channel: { name: "Canal A", niche: "Histórias" },
      project: { title: "Projeto A" },
      processType: "script",
      block: { type: "CRIAR", name: "Criar", instructions: "Escreva com clareza." },
      ...overrides.context,
    },
    validation: overrides.validation,
    retryFeedback: overrides.retryFeedback,
    outputContract: overrides.outputContract,
    conversation: overrides.conversation,
    batch: overrides.batch,
    itemAction: overrides.itemAction,
  };
}

function p30Request(fixture) {
  return request({
    capabilityId: fixture.id,
    resolvedInstruction: fixture.resolvedInstruction,
    inputs: fixture.inputs,
    context: fixture.selectedCollection
      ? { selectedCollection: fixture.selectedCollection }
      : undefined,
    validation: fixture.validation,
    outputContract: fixture.outputContract,
    settings: { diagnosticMockResponse: fixture.mockResponse },
    conversation: { mode: "new" },
  });
}

function p30Prompt(fixture, value) {
  if (fixture.promptBuilder === "text") return __test.buildParts(value)[0];
  if (fixture.promptBuilder === "search") return __test.buildSearchPrompt(value, false);
  if (fixture.promptBuilder === "deep-research") return __test.buildSearchPrompt(value, true);
  if (fixture.promptBuilder === "choose") return __test.buildChoosePrompt(value);
  if (fixture.promptBuilder === "validate") return __test.buildValidationPrompt(value);
  if (fixture.promptBuilder === "analyze-images") return __test.buildAnalysisPrompt(value, true);
  if (fixture.promptBuilder === "analyze-documents")
    return __test.buildAnalysisPrompt(value, false);
  throw new Error(`Construtor P30 desconhecido: ${fixture.promptBuilder}`);
}

test("P30 congela as sete capabilities não visuais por fixture", async (t) => {
  assert.equal(p30Baseline.schemaVersion, 1);
  assert.deepEqual(
    p30Baseline.capabilities.map((fixture) => fixture.id),
    P30_NON_VISUAL_CAPABILITY_IDS,
  );

  for (const fixture of p30Baseline.capabilities) {
    await t.test(fixture.id, async () => {
      const capability = manifest.capabilities.find((item) => item.id === fixture.id);
      assert.ok(capability, `Capability ausente no manifesto: ${fixture.id}`);
      assert.equal(capability.instructionUsage, "required");

      const visualConfigurationKeys = Object.keys(
        capability.blockConfigSchema?.properties ?? {},
      ).filter((key) => /image|aspect|resolution|variant|reference/i.test(key));
      assert.deepEqual(visualConfigurationKeys, []);

      const value = p30Request(fixture);
      const prompt = p30Prompt(fixture, value);
      for (const expected of fixture.expectedPromptIncludes)
        assert.match(prompt, new RegExp(expected));

      if (fixture.attachmentPort) {
        assert.deepEqual(
          __test.collectStoredFiles(value.inputs[fixture.attachmentPort]).map((file) => file.id),
          fixture.expectedAttachmentIds,
        );
      }

      const response = await execute(value, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, "success");
      assert.deepEqual(response.values, fixture.expectedValues);

      if (fixture.capturedSources) {
        assert.deepEqual(
          __test.searchResponseValues(fixture.mockResponse, fixture.capturedSources, {
            outputContract: [
              { key: "result", type: "textarea" },
              { key: "sources", type: "list" },
            ],
          }),
          { result: fixture.mockResponse, sources: fixture.capturedSources },
        );
      }
    });
  }
});

test("P30 congela aprovação, escolha única e escolha múltipla", () => {
  for (const fixture of p30Baseline.validationDecisions) {
    assert.deepEqual(
      __test.parseValidationValues(
        fixture.response,
        request({
          capabilityId: "validate-content-in-browser",
          validation: { mode: fixture.mode },
          inputs: { content: fixture.content },
        }),
      ),
      fixture.expected,
    );
  }
});

test("P30 congela conversa nova, continuidade e fallback", async () => {
  const fixture = p30Baseline.conversation;
  const originalParts = ["Solicitação original"];

  assert.deepEqual(partsForConversation(originalParts, { mode: "new" }, false), originalParts);
  assert.deepEqual(
    partsForConversation(
      originalParts,
      {
        mode: "reuse",
        continuationMessage: fixture.continuationMessage,
        fallbackContext: fixture.fallbackContext,
      },
      true,
    ),
    [fixture.continuationMessage],
  );
  assert.deepEqual(
    partsForConversation(
      originalParts,
      {
        mode: "reuse",
        continuationMessage: fixture.continuationMessage,
        fallbackContext: fixture.fallbackContext,
      },
      false,
    ),
    [`${fixture.fallbackContext}\n\nNOVA SOLICITAÇÃO:\n${fixture.continuationMessage}`],
  );

  assert.deepEqual(
    attachmentsAreReady({ attachmentPresent: true, busy: false, sendEnabled: true, error: false }, [
      fixture.primaryAttachment,
    ]),
    true,
  );
  assert.deepEqual(
    __test.attachmentsForConversation(
      [fixture.primaryAttachment],
      [fixture.fallbackAttachment],
      false,
      fixture.continuationMessage,
    ),
    [fixture.primaryAttachment, fixture.fallbackAttachment],
  );
  assert.deepEqual(
    __test.attachmentsForConversation(
      [fixture.primaryAttachment],
      [fixture.fallbackAttachment],
      true,
      fixture.continuationMessage,
    ),
    [],
  );

  const navigations = [];
  const client = {
    async send(method, params = {}) {
      if (method === "Page.navigate") {
        navigations.push(params.url);
        return {};
      }
      if (method === "Runtime.evaluate") {
        if (String(params.expression).includes("location.href"))
          return { result: { value: fixture.id } };
        return {
          result: {
            value: {
              host: "chatgpt.com",
              prompt: true,
              login: false,
              captcha: false,
              bodyHint: "",
            },
          },
        };
      }
      throw new Error(`Comando inesperado: ${method}`);
    },
  };

  assert.equal(
    await __test.prepareConversation(
      client,
      "p30-session",
      { mode: "reuse", id: fixture.id },
      1000,
    ),
    true,
  );
  assert.deepEqual(navigations, [fixture.id]);
});

test("não repete no contexto uma entrada já interpolada na instrução", () => {
  assert.equal(
    __test.expandTemplate(
      "{{BLOCK_INSTRUCTIONS}} | contexto={{CONTENT}}",
      request({ resolvedInstruction: "Use Tema principal.", instructionContextInputs: {} }),
    ),
    "Use Tema principal. | contexto=",
  );
});

test("manifesto declara oito capabilities modulares", () => {
  assert.equal(manifest.id, "local.contentflow.chatgpt-browser-studio");
  assert.equal(manifest.version, "1.0.14");
  assert.equal(manifest.supportsConversationContinuation, true);
  assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
  assert.equal(manifest.settingsSchema.properties.allowExistingChromeProfile.default, false);
  const generation = manifest.capabilities.find((item) => item.id === "generate-text-in-browser");
  assert.equal(generation.instructionUsage, "required");
  assert.deepEqual(Object.keys(generation.blockConfigSchema.properties), [
    "fallbackAccountProfiles",
    "accountProfile",
    "startMinimized",
  ]);
  assert.deepEqual(generation.outputPorts.find((port) => port.key === "result").producedTypes, [
    "text",
    "textarea",
    "number",
  ]);
  const imageGeneration = manifest.capabilities.find(
    (item) => item.id === "generate-image-in-browser",
  );
  assert.deepEqual(imageGeneration.inputPorts.find((port) => port.key === "prompt").acceptedTypes, [
    "text",
    "textarea",
    "number",
    "boolean",
    "list",
    "records",
    "select",
    "multiselect",
    "datetime",
    "url",
    "thumbnail_layout",
  ]);
  assert.deepEqual(
    imageGeneration.outputPorts.find((port) => port.key === "images").producedTypes,
    ["files"],
  );
  assert.deepEqual(
    manifest.capabilities.map((item) => item.id),
    [
      "generate-text-in-browser",
      "search-web-in-browser",
      "deep-research-in-browser",
      "choose-library-item-in-browser",
      "validate-content-in-browser",
      "analyze-images-in-browser",
      "analyze-documents-in-browser",
      "generate-image-in-browser",
    ],
  );
  assert.deepEqual(manifest.permissions, [
    "network",
    "filesystem:read",
    "filesystem:write",
    "process",
  ]);
  assert.deepEqual(manifest.secretKeys ?? [], []);
});

test("P31 localiza e antecipa o prompt da capability de imagem", () => {
  const imageGeneration = manifest.capabilities.find(
    (item) => item.id === "generate-image-in-browser",
  );
  assert.equal(
    imageGeneration.promptPreview.template,
    "INSTRUÇÕES DO BLOCO:\n{{BLOCK_INSTRUCTIONS}}\n\nCONTEXTO DAS ENTRADAS:\n{{CONTEXT_INPUTS}}",
  );
  assert.equal(imageGeneration.name, "Gerar imagens");
  assert.equal(manifest.localizations.en.capabilities[imageGeneration.id].name, "Generate images");
  assert.equal(manifest.localizations.es.capabilities[imageGeneration.id].name, "Generar imágenes");
  assert.equal(
    manifest.localizations.en.capabilities[imageGeneration.id].outputPorts.images.label,
    "Generated images",
  );
  assert.equal(
    manifest.localizations.es.capabilities[imageGeneration.id].outputPorts.images.label,
    "Imágenes generadas",
  );
});

test("P32 declara prompt → images sequencial somente na capability de imagem alterada", () => {
  const imageCapability = manifest.capabilities.find(
    (capability) => capability.id === "generate-image-in-browser",
  );
  assert.equal(imageCapability.execution.maxConcurrency, 1);
  assert.deepEqual(imageCapability.execution.itemOrchestration, {
    inputPort: "prompt",
    outputPort: "images",
    mode: "sequential",
  });
  assert.ok(
    P30_NON_VISUAL_CAPABILITY_IDS.every((id) =>
      manifest.capabilities.some((capability) => capability.id === id),
    ),
  );
});

test("P32 isola os três prompts por batch.itemId e nunca reutiliza conversa", async () => {
  assert.equal(p32SequentialPrompts.schemaVersion, 1);
  assert.equal(p32SequentialPrompts.items.length, 3);
  const seenOperationKeys = new Set();
  const seenPrompts = [];

  for (const [index, item] of p32SequentialPrompts.items.entries()) {
    const value = request({
      capabilityId: "generate-image-in-browser",
      resolvedInstruction: "Gere a imagem solicitada.",
      inputs: { prompt: item.prompt },
      conversation: {
        mode: "reuse",
        id: "https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc",
      },
      batch: { itemId: item.itemId, index, total: p32SequentialPrompts.items.length },
    });
    const prompt = __test.buildImagePrompt(value);
    seenPrompts.push(value.inputs.prompt);
    assert.match(prompt, new RegExp(item.prompt));
    assert.deepEqual(conversationForInvocation(value, value.capabilityId), { mode: "new" });
    const operationKey = batchOperationKey(value, 0, 0);
    assert.match(operationKey, new RegExp(`^${item.itemId}:`));
    assert.equal(seenOperationKeys.has(operationKey), false);
    seenOperationKeys.add(operationKey);
  }

  assert.deepEqual(
    seenPrompts,
    p32SequentialPrompts.items.map((item) => item.prompt),
  );
  assert.deepEqual(
    conversationForInvocation(
      request({ conversation: { mode: "reuse", id: "https://chatgpt.com/c/example" } }),
      "generate-text-in-browser",
    ),
    { mode: "reuse", id: "https://chatgpt.com/c/example" },
  );
});

test("P32 usa batch.itemId na identidade do artifact e preserva variantes por prompt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-p32-"));
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  try {
    const artifacts = [];
    for (const [index, item] of p32SequentialPrompts.items.entries()) {
      const value = request({
        capabilityId: "generate-image-in-browser",
        inputs: { prompt: item.prompt },
        batch: { itemId: item.itemId, index, total: p32SequentialPrompts.items.length },
      });
      value.executionId = "execution-p32";
      value.blockId = "block-p32";
      value.attempt = 1;
      const materialized = await materializeGeneratedImage(
        {
          src: `https://chatgpt.com/backend-api/estuary/content?id=${item.variants[0]}`,
          base64: pngBytes.toString("base64"),
          mimeType: "image/png",
        },
        { getOutputPath: (name) => path.join(directory, name) },
        value,
      );
      artifacts.push(materialized.file.id);
      assert.equal(imageItemUpdate(value, materialized.file, 0).input, item.prompt);
    }
    assert.equal(new Set(artifacts).size, p32SequentialPrompts.items.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("P32 cancela antes de iniciar o próximo item", async () => {
  const controller = new AbortController();
  controller.abort();
  const response = await execute(
    request({
      capabilityId: "generate-image-in-browser",
      settings: { diagnosticMockResponse: "" },
      inputs: { prompt: p32SequentialPrompts.items[2].prompt },
      batch: { itemId: p32SequentialPrompts.items[2].itemId, index: 2, total: 3 },
    }),
    { signal: controller.signal },
  );
  assert.deepEqual(response, {
    status: "error",
    code: "CANCELLED",
    message: "Execução cancelada.",
    retryable: false,
  });
});

test("P33 declara ações locais e regeneração com labels em três idiomas", () => {
  const capability = manifest.capabilities.find((item) => item.id === "generate-image-in-browser");
  assert.deepEqual(capability.itemActions, [
    { action: "regenerate", label: "Regenerar" },
    { action: "replace", label: "Substituir" },
    { action: "select", label: "Selecionar" },
    { action: "download", label: "Baixar" },
  ]);
  assert.equal(
    manifest.localizations.en.capabilities[capability.id].itemActions.regenerate.label,
    "Regenerate",
  );
  assert.equal(
    manifest.localizations.es.capabilities[capability.id].itemActions.download.label,
    "Descargar",
  );
  assert.equal(capability.execution.itemOrchestration.outputPort, "images");
});

test("P33 reutiliza somente a conversa da mesma conexão e perfil", () => {
  assert.equal(p33ImageRegeneration.schemaVersion, 1);
  const previous = {
    id: p33ImageRegeneration.item.previousArtifactId,
    name: "city-b.png",
    mimeType: "image/png",
    size: 68,
    url: `/api/files/${p33ImageRegeneration.item.previousArtifactId}`,
  };
  const initial = request({
    capabilityId: "generate-image-in-browser",
    configuration: { accountProfile: p33ImageRegeneration.profile },
    settings: {
      diagnosticMockResponse: "",
      connectionId: p33ImageRegeneration.connectionId,
    },
  });
  const key = imageConversationCorrelation(initial, p33ImageRegeneration.conversationId);
  const action = request({
    capabilityId: "generate-image-in-browser",
    configuration: { accountProfile: p33ImageRegeneration.profile },
    settings: {
      diagnosticMockResponse: "",
      connectionId: p33ImageRegeneration.connectionId,
    },
    invocation: {
      mode: "item_action",
      action: "regenerate",
      itemId: p33ImageRegeneration.item.id,
      outputPort: "images",
    },
    batch: p33ImageRegeneration.batch,
    retryFeedback: { feedback: p33ImageRegeneration.item.feedback },
    itemAction: {
      key,
      variantKey: p33ImageRegeneration.item.variantKey,
      input: p33ImageRegeneration.item.input,
      output: previous,
      attempt: p33ImageRegeneration.item.attempt,
    },
  });

  const continued = conversationForInvocation(action, action.capabilityId);
  assert.deepEqual(continued, {
    mode: "reuse",
    id: p33ImageRegeneration.conversationId,
    continuationMessage: p33ImageRegeneration.item.feedback,
    fallbackAttachments: [previous],
  });
  assert.deepEqual(partsForConversation(["prompt completo"], continued, true), [
    p33ImageRegeneration.item.feedback,
  ]);
  assert.equal(imageRegenerationFeedback(action), p33ImageRegeneration.item.feedback);
  assert.match(__test.buildImagePrompt(action), /aumente o contraste do céu/i);

  const changedConnection = structuredClone(action);
  changedConnection.settings.connectionId = "connection-images-other";
  assert.deepEqual(conversationForInvocation(changedConnection, changedConnection.capabilityId), {
    mode: "new",
    continuationMessage: p33ImageRegeneration.item.feedback,
    fallbackAttachments: [previous],
  });
  const changedProfile = structuredClone(action);
  changedProfile.configuration.accountProfile = "fallback-images";
  assert.equal(conversationForInvocation(changedProfile, changedProfile.capabilityId).mode, "new");
  const wrongPort = structuredClone(action);
  wrongPort.invocation.outputPort = "image";
  assert.throws(() => conversationForInvocation(wrongPort, wrongPort.capabilityId), /porta images/);
});

test("P33 anexa a imagem reprovada somente ao abrir conversa nova", () => {
  const previous = { path: "C:/staging/previous.png", name: "previous.png", size: 68 };
  assert.deepEqual(
    __test.attachmentsForConversation([], [previous], true, "Aumente o contraste."),
    [],
  );
  assert.deepEqual(
    __test.attachmentsForConversation([], [previous], false, "Aumente o contraste."),
    [previous],
  );
});

test("P33 rejeita ausência de mudança real e materializa somente a nova tentativa", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-p33-"));
  const previousPath = path.join(directory, "previous.png");
  const previousBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01,
  ]);
  const regeneratedBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x02,
  ]);
  const previous = {
    id: p33ImageRegeneration.item.previousArtifactId,
    name: "previous.png",
    mimeType: "image/png",
    size: previousBytes.length,
    url: `/api/files/${p33ImageRegeneration.item.previousArtifactId}`,
  };
  const action = request({
    capabilityId: "generate-image-in-browser",
    attempt: p33ImageRegeneration.item.attempt,
    invocation: {
      mode: "item_action",
      action: "regenerate",
      itemId: p33ImageRegeneration.item.id,
      outputPort: "images",
    },
    batch: p33ImageRegeneration.batch,
    itemAction: {
      key: "generation",
      variantKey: p33ImageRegeneration.item.variantKey,
      input: p33ImageRegeneration.item.input,
      output: previous,
      attempt: p33ImageRegeneration.item.attempt,
    },
  });
  const services = {
    resolveInputFile: async () => previousPath,
    getOutputPath: (name) => path.join(directory, name),
  };
  try {
    await writeFile(previousPath, previousBytes);
    const baseline = await imageActionBaselineHashes(action, services);
    const unchanged = await materializeGeneratedImage(
      {
        src: "https://chatgpt.com/backend-api/estuary/content?id=unchanged",
        base64: previousBytes.toString("base64"),
        mimeType: "image/png",
      },
      services,
      action,
      { excludedContentHashes: baseline },
    );
    assert.equal(unchanged.excluded, true);
    assert.deepEqual(await readdir(directory), ["previous.png"]);
    assert.throws(
      () => assertGeneratedImageCapture(0, true),
      (error) =>
        error.code === "OUTPUT_VALIDATION_FAILED" && /sem mudança real/i.test(error.message),
    );

    const regenerated = await materializeGeneratedImage(
      {
        src: "https://chatgpt.com/backend-api/estuary/content?id=regenerated",
        base64: regeneratedBytes.toString("base64"),
        mimeType: "image/png",
      },
      services,
      action,
      { excludedContentHashes: baseline },
    );
    assert.equal(regenerated.excluded, undefined);
    assert.notEqual(regenerated.file.id, previous.id);
    assert.equal((await readdir(directory)).length, 2);

    const history = [
      {
        attempt: 1,
        output: previous.id,
      },
      {
        attempt: p33ImageRegeneration.item.attempt,
        output: regenerated.file.id,
        feedback: p33ImageRegeneration.item.feedback,
      },
    ];
    const neighbor = structuredClone(p33ImageRegeneration.neighbor);
    assert.deepEqual(
      history.map((entry) => entry.attempt),
      [1, 2],
    );
    assert.deepEqual(neighbor, p33ImageRegeneration.neighbor);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("modela as fases observáveis da resposta", () => {
  assert.equal(
    __test.responsePhase({ hasNewResponse: false, generating: false, stablePolls: 0 }),
    "awaiting_response",
  );
  assert.equal(
    __test.responsePhase({ hasNewResponse: true, generating: true, stablePolls: 2 }),
    "streaming",
  );
  assert.equal(
    __test.responsePhase({ hasNewResponse: true, generating: false, stablePolls: 1 }),
    "stabilizing",
  );
  assert.equal(
    __test.responsePhase({ hasNewResponse: true, generating: false, stablePolls: 2 }),
    "completed",
  );
});

test("identifica cada aba de tarefa sem colisão entre tentativas", () => {
  const first = __test.taskPageMarker({
    executionId: "execution",
    blockId: "block",
    attempt: 1,
    traceId: "trace",
  });
  const retry = __test.taskPageMarker({
    executionId: "execution",
    blockId: "block",
    attempt: 2,
    traceId: "trace",
  });
  assert.match(first, /^contentflow-[a-f0-9]{24}$/);
  assert.notEqual(first, retry);
});

test("não renavega uma aba nova do ChatGPT antes de usar o compositor", async () => {
  const calls = [];
  const client = {
    async send(method, params = {}, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === "Page.navigate") throw new Error("não deve navegar novamente");
      if (method === "Runtime.evaluate") {
        return {
          result: {
            value: {
              host: "chatgpt.com",
              prompt: true,
              login: false,
              captcha: false,
              bodyHint: "",
            },
          },
        };
      }
      throw new Error(`Comando inesperado: ${method}`);
    },
  };

  const reused = await __test.prepareConversation(
    client,
    "page-session",
    { mode: "new" },
    1000,
    undefined,
    true,
  );

  assert.equal(reused, false);
  assert.equal(
    calls.some((call) => call.method === "Page.navigate"),
    false,
  );
  assert.equal(
    calls.some((call) => call.method === "Runtime.evaluate"),
    true,
  );
});

test("reconhece a raiz do ChatGPT como conversa nova sem Page.navigate redundante", async () => {
  const calls = [];
  let evaluations = 0;
  const client = {
    async send(method, params = {}, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === "Page.navigate") throw new Error("não deve navegar para a mesma raiz");
      if (method === "Runtime.evaluate") {
        evaluations += 1;
        if (evaluations === 1) return { result: { value: "https://chatgpt.com/" } };
        return {
          result: {
            value: {
              host: "chatgpt.com",
              prompt: true,
              login: false,
              captcha: false,
              bodyHint: "",
            },
          },
        };
      }
      throw new Error(`Comando inesperado: ${method}`);
    },
  };

  const reused = await __test.prepareConversation(
    client,
    "page-session",
    { mode: "new" },
    1000,
    undefined,
    false,
  );

  assert.equal(reused, false);
  assert.equal(
    calls.some((call) => call.method === "Page.navigate"),
    false,
  );
});

test("não confunde texto do conteúdo com controles reais de login", () => {
  const prompt = {
    innerText: "prompt",
    textContent: "prompt",
    getBoundingClientRect: () => ({ width: 500, height: 80, bottom: 100, right: 500 }),
    getAttribute: () => null,
  };
  const unrelatedButton = {
    innerText: "Enviar prompt",
    textContent: "Enviar prompt",
    getBoundingClientRect: () => ({ width: 100, height: 40, bottom: 50, right: 100 }),
    getAttribute: () => null,
  };
  const doc = {
    location: { hostname: "chatgpt.com" },
    body: {
      innerText: "O texto do usuário menciona criar conta, mas a sessão já está autenticada.",
    },
    defaultView: {
      location: { hostname: "chatgpt.com" },
      getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    },
    querySelectorAll(selector) {
      if (selector === "a,button") return [unrelatedButton];
      return selector.includes("prompt-textarea") ? [prompt] : [];
    },
  };

  assert.deepEqual(promptPageState(doc), {
    host: "chatgpt.com",
    prompt: true,
    login: false,
    captcha: false,
    bodyHint: doc.body.innerText,
  });

  const loginButton = {
    ...unrelatedButton,
    innerText: "Entrar",
    textContent: "Entrar",
  };
  doc.querySelectorAll = (selector) => {
    if (selector === "a,button") return [loginButton];
    return selector.includes("prompt-textarea") ? [prompt] : [];
  };
  assert.equal(promptPageState(doc).login, true);
});

test("isola contas por alias e porta", () => {
  assert.equal(__test.normalizeAccountProfile("canal-a"), "canal-a");
  assert.throws(() => __test.normalizeAccountProfile("../x"), /Perfil ChatGPT/);
  assert.match(
    __test.profilePathFor({}, "canal-a").replaceAll("\\", "/"),
    /chatgpt-browser-profiles\/canal-a$/,
  );
  assert.notEqual(__test.profilePort(9544, "canal-a"), __test.profilePort(9544, "canal-b"));
  assert.equal(
    __test.runtimeProfilePath({}, "canal-a", {
      getWorkspacePath: (relativePath) => `workspace/${relativePath}`,
    }),
    "workspace/canal-a",
  );
});

test("só considera pronto o perfil marcado após login", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-profile-"));
  try {
    assert.equal(await __test.profileIsPrepared(directory, "canal-a"), false);
    await __test.markProfilePrepared(directory, "canal-a");
    assert.equal(await __test.profileIsPrepared(directory, "canal-a"), true);
    assert.equal(await __test.profileIsPrepared(directory, "canal-b"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reconecta o service worker da Browser Bridge quando a sessão CDP desaparece", async () => {
  let attachCount = 0;
  let connectCount = 0;
  let lostOnce = false;
  const client = {
    async send(method, params = {}, sessionId) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              targetId: "bridge-worker",
              type: "service_worker",
              url: "chrome-extension://bridge/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") {
        attachCount += 1;
        return { sessionId: `worker-session-${attachCount}` };
      }
      if (method === "Target.detachFromTarget" || method === "Runtime.enable") return {};
      if (method === "Runtime.evaluate") {
        const expression = String(params.expression || "");
        if (expression.includes("contentFlowBridge?.identity"))
          return {
            result: {
              value: { bridgeId: "com.contentflow.browser-bridge", protocolVersion: 2 },
            },
          };
        if (expression.includes("contentFlowBridge.connect")) {
          connectCount += 1;
          return { result: { value: { ok: true } } };
        }
        if (expression.includes("bridge.dispatch")) {
          if (!lostOnce) {
            lostOnce = true;
            throw new Error("CDP Runtime.evaluate: Session with given id not found.");
          }
          return { result: { value: { ok: true, protocolVersion: 2 } } };
        }
        if (expression.includes("contentFlowBridge?.disconnect"))
          return { result: { value: { ok: true } } };
      }
      if (method === "Target.getTargetInfo") return { targetInfo: { url: "https://chatgpt.com/" } };
      throw new Error(`Comando inesperado: ${method} (${sessionId || "browser"})`);
    },
  };

  const bridge = await attachContentFlowBridge({
    client,
    pageTargetId: "chatgpt-tab",
    expectedUrl: "https://chatgpt.com/",
    pluginId: "local.contentflow.chatgpt-browser-studio",
    profileId: "conta2",
    request: {
      executionId: "execution",
      blockId: "block",
      capabilityId: "choose-library-item-in-browser",
      attempt: 1,
    },
    allowedOrigins: ["https://chatgpt.com"],
  });
  await bridge.dispose();

  assert.equal(lostOnce, true);
  assert.equal(attachCount, 2);
  assert.equal(connectCount, 2);
});

test("usa clique DOM compatível quando a Bridge antiga ainda não conhece pressEnter", async () => {
  const calls = [];
  const bridge = {
    async dispatch(action, payload) {
      calls.push({ action, payload });
      if (action === "pressEnter") {
        const error = new Error("Ação não suportada: pressEnter");
        error.code = "UNKNOWN_ACTION";
        throw error;
      }
      return { ok: true, mechanism: "dom" };
    },
  };

  const result = await __test.clickSendWithBridge(bridge, undefined, "send");

  assert.equal(result.mechanism, "dom");
  assert.deepEqual(
    calls.map((call) => call.action),
    ["pressEnter", "click"],
  );
  assert.equal(calls[1].payload.preferDomActivation, true);
});

test("aguarda a Bridge antes de validar novamente a aba do ChatGPT", async () => {
  const calls = [];
  const bridge = { dispose() {} };
  assert.equal(
    await __test.prepareProfileSession({
      attachBridge: async () => {
        calls.push("bridge");
        return bridge;
      },
      attachPage: async () => {
        calls.push("page");
        return { sessionId: "chatgpt-session" };
      },
      waitPrompt: async (sessionId) => calls.push(`prompt:${sessionId}`),
    }),
    bridge,
  );
  assert.deepEqual(calls, ["bridge", "page", "prompt:chatgpt-session"]);
});

test("expande placeholders ContentFlow e legados", () => {
  assert.equal(
    __test.expandTemplate("{{TEMA}} | {{NICHO}} | {{PROJECT_TITLE}}", request()),
    "Tema principal | Histórias | Projeto A",
  );
});

test("prioriza a instrução resolvida pelo núcleo", () => {
  assert.equal(
    __test.expandTemplate(
      "{{BLOCK_INSTRUCTIONS}}",
      request({ resolvedInstruction: "Prompt resolvido" }),
    ),
    "Prompt resolvido",
  );
});

test("gera uma resposta simples", () => {
  const parts = __test.buildParts(request());
  assert.equal(parts.length, 1);
  assert.match(parts[0], /Tema principal/);
  assert.match(parts[0], /FORMATO OBRIGATÓRIO/);
});

test("sempre inclui a instrução resolvida mesmo quando o template personalizado omite o token", () => {
  const [prompt] = __test.buildParts(
    request({
      resolvedInstruction: "Use somente acontecimentos documentados.",
      configuration: { promptTemplate: "Crie dez temas com base no contexto: {{CONTENT}}" },
    }),
  );
  assert.match(prompt, /^INSTRUÇÕES DO BLOCO:\nUse somente acontecimentos documentados\./);
});

test("sempre inclui as entradas resolvidas quando o prompt do plugin está vazio", () => {
  const [prompt] = __test.buildParts(
    request({
      resolvedInstruction: "Crie um tema histórico.",
      configuration: { promptTemplate: "" },
      instructionContextInputs: {
        content:
          'ITEM ESCOLHIDO — Linha Editorial:\n{"Nome":"Mistérios da História","Descrição":"Civilizações desaparecidas"}\n\nITEM ESCOLHIDO — Perspectiva do canal:\n{"Ângulo":"O momento em que tudo deu errado","Descrição":"Investigue o ponto de ruptura"}',
      },
    }),
  );
  assert.match(prompt, /CONTEXTO DAS ENTRADAS:/);
  assert.match(prompt, /Mistérios da História/);
  assert.match(prompt, /Civilizações desaparecidas/);
  assert.match(prompt, /O momento em que tudo deu errado/);
  assert.match(prompt, /Investigue o ponto de ruptura/);
});

test("pesquisa web depende somente do prompt e não tenta ativar atalho visual", async () => {
  const calls = [];
  const bridge = {
    dispatch: async (_action, _payload, operationKey) => {
      calls.push({ operationKey });
      throw new Error("não deveria clicar");
    },
  };

  assert.equal(await __test.clickMode(bridge, "search"), undefined);
  assert.deepEqual(calls, []);
  assert.doesNotMatch(handlerSource, /mode\s*=\s*["']search["']/);
});

test("ignora o roteiro legado e faz somente um envio", () => {
  const parts = __test.buildParts(
    request({ configuration: { generationMode: "legacy_script_3_parts" } }),
  );
  assert.equal(parts.length, 1);
  assert.doesNotMatch(parts[0], /TÓPICOS 1, 2 e 3/);
});

test("ignora outline iterativa e faz somente um envio", () => {
  const outline = Array.from({ length: 12 }, (_, index) => ({
    titulo_bloco: `Ponto ${index + 1}`,
    objetivo: `Objetivo ${index + 1}`,
  }));
  const parts = __test.buildParts(
    request({
      configuration: {
        generationMode: "outline_sequence",
        outlineFirstPromptTemplate: "INÍCIO {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
        outlineNextPromptTemplate: "MEIO {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
        outlineLastPromptTemplate: "FIM {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
      },
      inputs: { content: "Contexto", outline },
    }),
  );
  assert.equal(parts.length, 1);
  assert.doesNotMatch(parts[0], /INÍCIO 1\/12/);
});

test("ignora partes personalizadas", () => {
  assert.equal(
    __test.buildParts(
      request({
        configuration: { generationMode: "custom_parts", customParts: "A\n---PARTE---\nB" },
      }),
    ).length,
    1,
  );
});

test("preserva respostas individuais quando parts está conectada", () => {
  const values = __test.generationResponseValues("A\n\nB", [{ text: "A" }, { text: "B" }], {
    outputContract: [{ key: "parts" }],
  });
  assert.deepEqual(values, { result: "A\n\nB", parts: ["A", "B"] });
});

test("respeita saída list em geração de texto", () => {
  assert.deepEqual(
    __test.generationResponseValues(
      "Primeiro prompt\n\nSegundo prompt\n\nTerceiro prompt",
      [{ text: "Primeiro prompt\n\nSegundo prompt\n\nTerceiro prompt" }],
      { outputContract: [{ key: "visual_prompts", type: "list" }] },
    ).visual_prompts,
    ["Primeiro prompt", "Segundo prompt", "Terceiro prompt"],
  );
});

test("converte uma resposta numérica estrita para uma entrega number", () => {
  assert.deepEqual(
    __test.generationResponseValues("7", [{ text: "7" }], {
      outputContract: [{ key: "sections", type: "number", portKey: "result" }],
    }),
    { result: 7, sections: 7 },
  );
  assert.throws(
    () =>
      __test.generationResponseValues("sete", [{ text: "sete" }], {
        outputContract: [{ key: "sections", type: "number", portKey: "result" }],
      }),
    /somente um número válido/,
  );
});

test("monta pesquisa web e deep research somente com instrução e entradas", () => {
  assert.match(
    __test.buildSearchPrompt(
      request({
        configuration: { searchPromptTemplate: "WEB {{QUERY}} | {{SEARCH_CONTEXT}}" },
        inputs: { query: "tendências", context: "YouTube" },
      }),
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*tendências[\s\S]*YouTube/,
  );
  assert.match(
    __test.buildSearchPrompt(
      request({
        configuration: { researchPromptTemplate: "DEEP {{QUERY}}" },
        inputs: { query: "mercado" },
      }),
      true,
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*mercado/,
  );
});

test("respeita o outputContract de Buscar", () => {
  assert.deepEqual(
    __test.searchResponseValues("- A\n- B", ["https://example.com"], {
      outputContract: [
        { key: "items_found", type: "list" },
        { key: "sources", type: "list" },
      ],
    }),
    { items_found: ["A", "B"], sources: ["https://example.com"] },
  );
});

test("Escolher aceita somente ID permitido", () => {
  const value = request({ context: { selectedCollection: { items: [{ id: "a" }, { id: "b" }] } } });
  assert.equal(__test.parseSelectedItemId('{"selectedItemId":"b"}', value), "b");
  assert.throws(() => __test.parseSelectedItemId('{"selectedItemId":"x"}', value), /ID exato/);
});

test("Escolher recupera um único ID permitido mesmo com texto adicional", () => {
  const request = {
    context: {
      selectedCollection: {
        items: [{ id: "item-a" }, { id: "item-b" }],
      },
    },
  };
  assert.equal(
    __test.parseSelectedItemId('Escolha concluída: {"selectedItemId":"item-b"}.', request),
    "item-b",
  );
  assert.throws(() => __test.parseSelectedItemId("item-a ou item-b", request));
});

test("Validar interpreta aprovação e seleções", () => {
  assert.deepEqual(
    __test.parseValidationValues(
      '{"decision":"approved","feedback":"OK"}',
      request({ validation: { mode: "approval" } }),
    ),
    { decision: "approved", feedback: "OK" },
  );
  assert.deepEqual(
    __test.parseValidationValues(
      '{"selectedIndex":2}',
      request({ validation: { mode: "select_one" }, inputs: { content: ["A", "B"] } }),
    ),
    { selected_value: "B" },
  );
  assert.deepEqual(
    __test.parseValidationValues(
      '{"selectedIndices":[1,3]}',
      request({ validation: { mode: "select_many" }, inputs: { content: ["A", "B", "C"] } }),
    ),
    { selected_values: ["A", "C"] },
  );
});

test("usa instrução e contexto para análise", () => {
  assert.match(
    __test.buildAnalysisPrompt(
      request({
        configuration: {
          analysisPromptTemplate: "ANALISE {{ANALYSIS_CONTEXT}} | {{BLOCK_INSTRUCTIONS}}",
        },
        inputs: { context: "thumb" },
      }),
      true,
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*thumb/,
  );
});

test("monta prompt para criação de imagem", () => {
  const prompt = __test.buildImagePrompt(
    request({
      capabilityId: "generate-image-in-browser",
      configuration: { imagePromptTemplate: "IMAGEM {{IMAGE_PROMPT}} | {{BLOCK_INSTRUCTIONS}}" },
      inputs: { prompt: "thumbnail cinematográfica" },
    }),
  );
  assert.match(prompt, /CONTEXTO DAS ENTRADAS:[\s\S]*thumbnail cinematográfica/);
});

test("identifica StoredFiles aninhados", () => {
  const file = { id: "f", name: "a.pdf", url: "staging://f" };
  assert.deepEqual(__test.collectStoredFiles({ a: [file] }), [file]);
});

test("anexa a imagem reprovada somente quando precisa abrir outra conversa", () => {
  const reference = { path: "C:/uploads/reference.png", name: "reference.png" };
  const rejected = { path: "C:/uploads/rejected.png", name: "rejected.png" };
  assert.deepEqual(
    __test.attachmentsForConversation([reference], [rejected], false, "Corrija a imagem."),
    [reference, rejected],
  );
  assert.deepEqual(
    __test.attachmentsForConversation([reference], [rejected], true, "Corrija a imagem."),
    [],
  );
});

test("considera o estado estrutural do compositor sem depender do nome do anexo", () => {
  const files = [{ name: "reprovada.png" }, { name: "referencia.webp" }];
  const ready = {
    attachmentPresent: true,
    busy: false,
    sendEnabled: true,
    error: false,
  };
  assert.equal(attachmentsAreReady(ready, files), true);
  assert.equal(attachmentsAreReady({ ...ready, attachmentPresent: false }, files), false);
  assert.equal(attachmentsAreReady({ ...ready, busy: true }, files), false);
  assert.equal(attachmentsAreReady({ ...ready, sendEnabled: false }, files), false);
  assert.equal(attachmentsAreReady({ ...ready, error: true }, files), false);
  assert.equal(attachmentsAreReady(null, files), false);
});

test("reconhece documento renomeado pelo ChatGPT sem consultar o texto ou o nome", () => {
  const ready = {
    attachmentPresent: true,
    busy: false,
    sendEnabled: true,
    error: false,
  };
  assert.equal(attachmentsAreReady(ready, [{ name: "brief.pdf" }]), true);
  assert.equal(attachmentsAreReady(ready, [{ name: "nome-totalmente-diferente.txt" }]), true);
  assert.equal(attachmentsAreReady({ ...ready, busy: true }, [{ name: "brief.pdf" }]), false);
  assert.equal(attachmentsAreReady({ ...ready, error: true }, [{ name: "brief.pdf" }]), false);
});

test("exige estabilidade antes de aceitar o anexo como pronto", async () => {
  let time = 0;
  let reads = 0;
  await waitForAttachmentsReady(
    async () => {
      reads += 1;
      if (reads === 1)
        return { attachmentPresent: true, busy: false, sendEnabled: true, error: false };
      if (reads === 2)
        return { attachmentPresent: true, busy: true, sendEnabled: false, error: false };
      return { attachmentPresent: true, busy: false, sendEnabled: true, error: false };
    },
    [{ name: "qualquer-nome.txt" }],
    undefined,
    {
      now: () => time,
      pause: async (ms) => {
        time += ms;
      },
      stablePolls: 3,
    },
  );
  assert.equal(reads, 5);
});

test("observa apenas miniaturas carregadas e controles do compositor", () => {
  const element = (extra = {}) => ({
    getClientRects: () => [1],
    getAttribute: () => null,
    ...extra,
  });
  const images = [
    element({ complete: true, naturalWidth: 120, naturalHeight: 80, src: "blob:ready" }),
    element({ complete: false, naturalWidth: 120, naturalHeight: 80, src: "blob:loading" }),
    element({ complete: true, naturalWidth: 16, naturalHeight: 16, src: "icon" }),
  ];
  const send = element({
    disabled: false,
    getAttribute: (key) => (key === "data-testid" ? "send-button" : null),
  });
  const composer = {
    innerText: "",
    querySelector: () => send,
    querySelectorAll: (selector) => (selector === "img" ? images : []),
  };
  const doc = {
    body: { innerText: "ref.png no histórico" },
    defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) },
    querySelector: () => ({ closest: () => composer, contains: () => false }),
  };
  const state = composerUploadState(doc);
  assert.deepEqual(state.previews, ["blob:ready"]);
  assert.equal(state.attachmentPresent, true);
  assert.equal(state.sendEnabled, true);
  send.disabled = true;
  assert.equal(composerUploadState(doc).sendEnabled, false);
  images.length = 0;
  send.disabled = false;
  assert.equal(composerUploadState(doc).attachmentPresent, true);
});

test("P34 reconhece o botao atual do compositor pelo id ou aria-label", () => {
  const element = (extra = {}) => ({
    getClientRects: () => [1],
    getAttribute: () => null,
    matches: () => false,
    ...extra,
  });
  const send = element({
    id: "composer-submit-button",
    disabled: false,
  });
  const prompt = element({
    innerText: "Prompt pronto para envio",
    textContent: "Prompt pronto para envio",
    contains: () => false,
  });
  const composer = {
    querySelector: (selector) =>
      selector.includes("prompt-textarea")
        ? prompt
        : selector.includes("send-button")
          ? send
          : null,
    querySelectorAll: () => [],
  };
  prompt.closest = () => composer;
  const doc = {
    body: {},
    defaultView: {
      getComputedStyle: () => ({
        display: "block",
        visibility: "visible",
        pointerEvents: "auto",
        filter: "none",
        animationName: "none",
        animationPlayState: "paused",
      }),
    },
    querySelector: (selector) => (selector.includes("prompt-textarea") ? prompt : null),
  };
  const state = composerUploadState(doc);
  assert.equal(state.hasPrompt, true);
  assert.equal(state.sendEnabled, true);
  assert.equal(state.busy, false);

  send.id = "";
  send.getAttribute = (key) => (key === "aria-label" ? "Enviar" : null);
  assert.equal(composerUploadState(doc).sendEnabled, true);
});

test("não confunde preview decodificado com upload concluído ou botão de voz com enviar", () => {
  const element = (extra = {}) => ({
    getClientRects: () => [1],
    getAttribute: () => null,
    ...extra,
  });
  const img = element({
    complete: true,
    naturalWidth: 120,
    naturalHeight: 80,
    src: "blob:preview",
    style: { filter: "blur(4px)" },
  });
  const spinner = element({
    style: { animationName: "loading-ring", animationPlayState: "running" },
  });
  const send = element({
    getAttribute: (key) => (key === "aria-label" ? "Enviar mensagem" : null),
  });
  let showSpinner = false;
  const composer = {
    innerText: "",
    querySelector: () => send,
    querySelectorAll: (selector) =>
      selector === "img" ? [img] : selector.startsWith("svg,") && showSpinner ? [spinner] : [],
  };
  const doc = {
    body: {},
    defaultView: {
      getComputedStyle: (el) => ({ display: "block", visibility: "visible", ...el.style }),
    },
    querySelector: () => ({
      innerText: "observações de correção",
      contains: () => false,
      closest: () => composer,
    }),
  };
  assert.equal(composerUploadState(doc).busy, true);
  img.style.filter = "none";
  showSpinner = true;
  assert.equal(composerUploadState(doc).busy, true);
  showSpinner = false;
  assert.equal(composerUploadState(doc).busy, false);
  assert.equal(composerUploadState(doc).hasPrompt, true);
  assert.equal(composerUploadState(doc).sendEnabled, true);
  send.getAttribute = () => "Iniciar modo de voz";
  assert.equal(composerUploadState(doc).sendEnabled, false);
});

test("aguarda upload lento após preencher prompt e só clica uma vez quando pronto", async () => {
  let time = 0,
    clicks = 0,
    reads = 0;
  const timing = {
    now: () => time,
    pause: async (ms) => {
      time += ms;
    },
  };
  await waitAndClickSend(
    async () => {
      reads++;
      // Includes a transient enabled state before the upload indicator appears.
      return {
        hasPrompt: true,
        sendEnabled: time === 0 || time >= 60000,
        busy: time > 0 && time < 60000,
      };
    },
    async () => {
      clicks++;
      assert.ok(time >= 60500);
    },
    undefined,
    timing,
  );
  assert.equal(clicks, 1);
  assert.ok(reads > 100);
});

test("reavalia botão desabilitado entre observação e clique", async () => {
  let time = 0,
    clicks = 0;
  await waitAndClickSend(
    async () => ({ hasPrompt: true, sendEnabled: true, busy: false }),
    async () => {
      if (++clicks === 1)
        throw Object.assign(new Error("Botão indisponível"), { code: "OUTPUT_VALIDATION_FAILED" });
    },
    undefined,
    {
      now: () => time,
      pause: async (ms) => {
        time += ms;
      },
    },
  );
  assert.equal(clicks, 2);
  assert.ok(time >= 1500);
});

test("espera de envio respeita falha real, cancelamento e timeout sem clicar", async () => {
  for (const scenario of ["error", "cancel", "timeout", "empty"]) {
    let time = 0,
      clicks = 0;
    const controller = new AbortController();
    if (scenario === "cancel") controller.abort();
    await assert.rejects(
      waitAndClickSend(
        async () => ({
          error: scenario === "error",
          busy: scenario === "timeout",
          sendEnabled: true,
          hasPrompt: scenario !== "empty",
        }),
        async () => {
          clicks++;
        },
        controller.signal,
        {
          now: () => time,
          pause: async (ms) => {
            time += ms;
          },
          timeoutMs: 2000,
        },
      ),
      (error) =>
        error.code ===
        { error: "INVALID_INPUT", cancel: "CANCELLED", timeout: "TIMEOUT", empty: "TIMEOUT" }[
          scenario
        ],
    );
    assert.equal(clicks, 0);
  }
});

test("entrega qualquer quantidade de imagens capturadas pela porta de vários arquivos", () => {
  const files = Array.from({ length: 5 }, (_, index) => ({
    id: `image-${index + 1}`,
    name: `image-${index + 1}.png`,
    mimeType: "image/png",
    url: `artifact://image-${index + 1}`,
  }));
  assert.deepEqual(__test.imageResponseValues({ files }, "Cinco opções"), {
    image: files[0],
    images: files,
    description: "Cinco opções",
  });
});

test("detecta imagens novas pela URL mesmo quando a quantidade de elementos não muda", () => {
  const oldImages = [
    { src: "https://chatgpt.com/backend-api/estuary/content?id=old-a" },
    { src: "https://chatgpt.com/backend-api/estuary/content?id=old-b" },
    { src: "https://chatgpt.com/backend-api/estuary/content?id=old-c" },
  ];
  const currentImages = [
    { src: "https://chatgpt.com/backend-api/estuary/content?id=new-a", alt: "Imagem gerada" },
    { src: "https://chatgpt.com/backend-api/estuary/content?id=new-b", alt: "Imagem gerada" },
    { src: "https://chatgpt.com/backend-api/estuary/content?id=new-c", alt: "Imagem gerada" },
    { src: "https://chatgpt.com/backend-api/estuary/content?id=new-c", alt: "" },
  ];

  assert.deepEqual(
    __test.generatedImagesAfterBaseline(
      currentImages,
      oldImages.map((image) => image.src),
    ),
    currentImages.slice(0, 3),
  );
});

function pageImage(role, id, overrides = {}) {
  return {
    src: `https://chatgpt.com/backend-api/estuary/content?id=${id}`,
    alt: "Imagem gerada",
    complete: true,
    naturalWidth: 1536,
    naturalHeight: 1024,
    closest(selector) {
      if (selector.startsWith("form,"))
        return role === "user" || role === "composer" || overrides.avatar === true ? {} : null;
      if (selector === "[data-message-author-role], [data-turn]")
        return role === "assistant" ? { getAttribute: () => "assistant" } : null;
      return null;
    },
    ...overrides,
  };
}

test("não captura o anexo reprovado que ganha uma nova URL após ser enviado", () => {
  const reference = pageImage("user", "uploaded-reference");
  const revised = pageImage("assistant", "new-generation");
  const images = collectGeneratedImages({
    querySelectorAll: () => [pageImage("composer", "local-preview"), reference, revised],
  });
  assert.deepEqual(
    images.map((image) => image.src),
    [revised.src],
  );
  assert.equal(__test.imageResponseValues({ files: images }, "Revisada").image.src, revised.src);
  assert.deepEqual(collectGeneratedImages({ querySelectorAll: () => [reference] }), []);
});

test("preserva todas as imagens do assistente e exclui referências e histórico", () => {
  const old = pageImage("assistant", "old-generation");
  const generated = Array.from({ length: 5 }, (_, i) => pageImage("assistant", `new-${i}`));
  const images = collectGeneratedImages({
    querySelectorAll: () => [
      old,
      pageImage("user", "reference"),
      ...generated,
      generated[0],
      pageImage("unknown", "unowned"),
      pageImage("assistant", "loading", { complete: false }),
    ],
  });
  assert.deepEqual(
    __test.generatedImagesAfterBaseline(images, [old.src]).map((image) => image.src),
    generated.map((image) => image.src),
  );
});

test("P31 aceita somente imagens novas do assistente no DOM simulado", () => {
  assert.equal(p31ImageDom.schemaVersion, 1);
  const toImage = (entry) => pageImage(entry.owner, entry.id, entry);
  const before = collectGeneratedImages({
    querySelectorAll: () => p31ImageDom.before.map(toImage),
  });
  const after = collectGeneratedImages({
    querySelectorAll: () => p31ImageDom.after.map(toImage),
  });
  const accepted = __test
    .generatedImagesAfterBaseline(
      after,
      before.map((image) => image.src),
    )
    .map((image) => new URL(image.src).searchParams.get("id"));
  assert.deepEqual(accepted, p31ImageDom.acceptedIds);
  for (const rejectedId of p31ImageDom.rejectedIds) assert.ok(!accepted.includes(rejectedId));
});

test("P31 valida assinatura e MIME antes de materializar uma imagem", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-p31-"));
  try {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    assert.equal(sniffImageMimeType(pngBytes), "image/png");
    assert.equal(sniffImageMimeType(Buffer.from("not-an-image-payload", "utf8")), undefined);
    const services = { getOutputPath: (name) => path.join(directory, name) };
    const value = request({
      capabilityId: "generate-image-in-browser",
      inputs: { prompt: "Crie duas opções." },
    });
    value.executionId = "execution-p31";
    value.blockId = "block-p31";
    value.attempt = 1;
    const accepted = await materializeGeneratedImage(
      {
        src: "https://chatgpt.com/backend-api/estuary/content?id=generated-a",
        base64: pngBytes.toString("base64"),
        mimeType: "application/octet-stream",
      },
      services,
      value,
    );
    assert.equal(accepted.file.mimeType, "image/png");
    assert.equal(accepted.file.size, pngBytes.length);
    assert.deepEqual(await readFile(path.join(directory, accepted.file.name)), pngBytes);
    assert.equal(
      await materializeGeneratedImage(
        {
          src: "https://chatgpt.com/backend-api/estuary/content?id=wrong-mime",
          base64: pngBytes.toString("base64"),
          mimeType: "image/jpeg",
        },
        services,
        value,
      ),
      undefined,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("P31 publica cada variante incremental e mantém singular e plural", async () => {
  const files = [0, 1].map((index) => ({
    id: `artifact-${index}`,
    name: `artifact-${index}.png`,
    mimeType: "image/png",
    size: 12,
    url: `artifact://artifact-${index}`,
  }));
  const entries = files.map((file) => ({
    file,
    artifact: {
      ...file,
      source: { kind: "path", path: file.name },
    },
  }));
  const partials = [];
  const value = request({
    capabilityId: "generate-image-in-browser",
    inputs: { prompt: "Crie duas opções." },
  });
  for (let index = 0; index < entries.length; index += 1) {
    await publishGeneratedImagePartial(
      { publishPartial: async (partial) => partials.push(partial) },
      value,
      entries.slice(0, index + 1),
      files[index],
      index,
    );
  }
  assert.deepEqual(
    partials.map((partial) => partial.values.images.length),
    [1, 2],
  );
  assert.equal(partials[1].values.image, files[0]);
  assert.deepEqual(partials[1].values.images, files);
  assert.deepEqual(
    partials.map((partial) => partial.itemUpdates[0]),
    files.map((file, index) => imageItemUpdate(value, file, index)),
  );
  assert.deepEqual(
    partials.map((partial) => partial.itemUpdates[0].variantKey),
    ["image:0", "image:1"],
  );
  assert.ok(partials.every((partial) => partial.itemUpdates[0].outputPort === "images"));
});

test("aceita imagem fora do texto mas dentro de um turno comprovadamente do assistente", () => {
  const img = pageImage("unknown", "tool-output", {
    closest(selector) {
      if (selector.startsWith("article"))
        return { querySelector: (query) => (query.includes('"assistant"') ? {} : null) };
      return null;
    },
  });
  assert.equal(collectGeneratedImages({ querySelectorAll: () => [img] }).length, 1);
  const turnImage = pageImage("unknown", "turn-output", {
    closest(selector) {
      if (selector === "[data-message-author-role], [data-turn]")
        return {
          getAttribute: (name) => (name === "data-turn" ? "assistant" : null),
        };
      return null;
    },
  });
  assert.equal(collectGeneratedImages({ querySelectorAll: () => [turnImage] }).length, 1);
});

test("P34 captura a galeria atual de Images sem confundi-la com anexo do usuário", () => {
  const generated = pageImage("unknown", "current-images-gallery", {
    src: "blob:https://chatgpt.com/generated-p34",
    alt: "Imagem 1 gerada",
    naturalWidth: 1254,
    naturalHeight: 1254,
    closest(selector) {
      if (selector.startsWith("form,")) return null;
      if (selector === '[data-testid="generated-image-preview"]') return {};
      if (selector === '[data-testid="generated-image-gallery"]') return {};
      return null;
    },
  });
  const uploadedReference = pageImage("user", "reference-in-prompt", {
    src: "blob:https://chatgpt.com/reference-p34",
    alt: "Imagem 1 gerada",
  });
  assert.deepEqual(
    collectGeneratedImages({ querySelectorAll: () => [uploadedReference, generated] }),
    [
      {
        src: generated.src,
        width: 1254,
        height: 1254,
        alt: "Imagem 1 gerada",
      },
    ],
  );
});

test("identifica queda de CDP sem confundir erro HTTP", () => {
  assert.equal(__test.isCdpConnectionLoss(new Error("CDP não conectado.")), true);
  assert.equal(__test.isCdpConnectionLoss(new Error("WebSocket is closed")), true);
  assert.equal(__test.isCdpConnectionLoss(new Error("HTTP 403")), false);
});

test("reconhece o controle de geração nos idiomas usados pelo ChatGPT", () => {
  assert.equal(__test.generationControlIsStop("Stop generating", "composer-submit-button"), true);
  assert.equal(
    __test.generationControlIsStop("Parar de responder", "composer-submit-button"),
    true,
  );
  assert.equal(__test.generationControlIsStop("Detener respuesta", "composer-submit-button"), true);
  assert.equal(__test.generationControlIsStop("Enviar mensagem", "composer-submit-button"), false);
  assert.equal(__test.generationControlIsStop("", "stop-button"), true);
});

test("reconhece o controle de voz pronto sem depender de um único idioma", () => {
  assert.equal(__test.voiceControlIsReady("Start Voice"), true);
  assert.equal(__test.voiceControlIsReady("Iniciar voz"), true);
  assert.equal(__test.voiceControlIsReady("Iniciar chat de voz"), true);
  assert.equal(__test.voiceControlIsReady("Start Voice", true), false);
  assert.equal(__test.voiceControlIsReady("Start Voice", false, "true"), false);
  assert.equal(__test.voiceControlIsReady("Start dictation"), false);
});

test("aceita apenas sinais fortes associados a uma nova resposta concluída", () => {
  const completed = {
    hasNewResponse: true,
    generating: false,
    voiceReady: false,
    completedActionCount: 3,
    baselineCompletedActionCount: 2,
  };
  assert.equal(__test.responseHasStrongCompletionSignal(completed), true);
  assert.equal(
    __test.responseHasStrongCompletionSignal({
      ...completed,
      completedActionCount: 2,
      voiceReady: true,
    }),
    true,
  );
  assert.equal(
    __test.responseHasStrongCompletionSignal({ ...completed, hasNewResponse: false }),
    false,
  );
  assert.equal(__test.responseHasStrongCompletionSignal({ ...completed, generating: true }), false);
  assert.equal(
    __test.responseHasStrongCompletionSignal({ ...completed, completedActionCount: 2 }),
    false,
  );
});

test("envia pelo seletor atual e pelo seletor legado do compositor", () => {
  assert.deepEqual(CHATGPT_SEND_BUTTON_SELECTORS, [
    'button[data-testid="send-button"]:not(:disabled):not([aria-disabled="true"])',
    'button#composer-submit-button:not(:disabled):not([aria-disabled="true"])',
    'button[aria-label="Enviar" i]:not(:disabled):not([aria-disabled="true"])',
    'button[aria-label="Send" i]:not(:disabled):not([aria-disabled="true"])',
  ]);
});

test("limpa markdown de saída", () => {
  assert.equal(__test.cleanGeneratedText("# Título\n\nTexto"), "Título\n\nTexto");
});

test("rotas simuladas não abrem navegador", async () => {
  const services = { signal: AbortSignal.timeout(5000) };
  assert.deepEqual((await execute(request(), services)).values, { result: "TESTE OK" });
  const search = await execute(
    request({
      capabilityId: "search-web-in-browser",
      settings: { diagnosticMockResponse: "Pesquisa" },
    }),
    services,
  );
  assert.deepEqual(search.values, { result: "Pesquisa", sources: [] });
  const analysis = await execute(
    request({
      capabilityId: "analyze-images-in-browser",
      settings: { diagnosticMockResponse: "Imagem analisada" },
    }),
    services,
  );
  assert.deepEqual(analysis.values, { result: "Imagem analisada" });
});

test("preserva o erro de perfil ausente ao encerrar uma execução real", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-unprepared-"));
  try {
    const result = await execute(request({ settings: { diagnosticMockResponse: undefined } }), {
      signal: AbortSignal.timeout(5000),
      getWorkspacePath: (relativePath) => path.join(directory, relativePath),
    });
    assert.equal(result.status, "error");
    assert.equal(result.code, "AUTHENTICATION_FAILED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
