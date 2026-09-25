import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { __test, execute } from "./handler.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const p50Boundary = JSON.parse(
  await readFile(new URL("./fixtures/p50-meta-vibes-boundary.json", import.meta.url), "utf8"),
);
const handlerSource = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");

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
    outputContract: overrides.outputContract,
    executionId: overrides.executionId,
    blockId: overrides.blockId,
    attempt: overrides.attempt,
    batch: overrides.batch,
  };
}

test("não repete no contexto uma entrada já interpolada na instrução", () => {
  assert.equal(
    __test.expandTemplate(
      "{{BLOCK_INSTRUCTIONS}} | contexto={{CONTENT}}",
      request({ resolvedInstruction: "Use Tema principal.", instructionContextInputs: {} }),
    ),
    "Use Tema principal. | contexto=",
  );
});

test("manifesto declara capabilities reais de texto, imagem, animação e vídeo legado", () => {
  assert.equal(manifest.id, "local.contentflow.meta-ai-browser-studio");
  assert.equal(manifest.version, "1.0.5");
  assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
  assert.equal(manifest.capabilities[0].instructionUsage, "required");
  assert.deepEqual(Object.keys(manifest.capabilities[0].blockConfigSchema.properties), [
    "fallbackAccountProfiles",
    "accountProfile",
    "startMinimized",
  ]);
  assert.equal(manifest.settingsSchema.properties.allowExistingChromeProfile.default, false);
  assert.deepEqual(
    manifest.capabilities.map((item) => item.id),
    [
      "generate-text-in-browser",
      "generate-image-in-browser",
      "animate-image-in-browser",
      "generate-video-in-browser",
    ],
  );
  for (const capabilityId of [
    "generate-image-in-browser",
    "animate-image-in-browser",
    "generate-video-in-browser",
  ]) {
    assert.deepEqual(
      manifest.capabilities
        .find((item) => item.id === capabilityId)
        .itemActions.map((item) => item.action),
      ["regenerate", "replace", "select", "download"],
    );
  }
  assert.deepEqual(manifest.permissions, [
    "network",
    "filesystem:read",
    "filesystem:write",
    "process",
  ]);
  assert.deepEqual(manifest.secretKeys ?? [], []);
});

test("P50 congela IDs, portas e bindings das três capabilities legadas", () => {
  assert.equal(manifest.id, p50Boundary.pluginId);
  assert.deepEqual(
    manifest.capabilities
      .map((capability) => capability.id)
      .filter((capabilityId) => p50Boundary.capabilityIds.includes(capabilityId)),
    p50Boundary.capabilityIds,
  );

  for (const capabilityId of p50Boundary.capabilityIds) {
    const capability = manifest.capabilities.find((item) => item.id === capabilityId);
    const expected = p50Boundary.capabilities[capabilityId];
    assert.ok(capability, `capability ausente: ${capabilityId}`);
    assert.deepEqual(
      capability.inputPorts.map((port) => port.key),
      expected.inputPorts,
    );
    for (const outputPort of expected.outputPorts) {
      assert.ok(
        capability.outputPorts.some((port) => port.key === outputPort),
        `porta legada ausente em ${capabilityId}: ${outputPort}`,
      );
    }
  }
});

test("P50 mantém Meta em meta.ai e separa a origem standalone vibes.ai", () => {
  assert.deepEqual(manifest.networkHosts, p50Boundary.networkHosts);
  assert.doesNotMatch(handlerSource, /https:\/\/vibes\.ai/);
  assert.match(
    handlerSource,
    /allowedOrigins: \["https:\/\/meta\.ai", "https:\/\/www\.meta\.ai"\]/,
  );
  assert.match(handlerSource, /const CHATGPT_CHAT_URL = "https:\/\/www\.meta\.ai\/"/);
  assert.match(handlerSource, /const CHATGPT_NEW_URL = "https:\/\/www\.meta\.ai\/create"/);
  assert.match(handlerSource, /const META_VIBES_URL = "https:\/\/www\.meta\.ai\/vibes"/);
  assert.equal(p50Boundary.standaloneVibesOrigin, "https://vibes.ai");
});

test("P50 congela a semântica da capability de vídeo legada do Meta", () => {
  const capability = manifest.capabilities.find((item) => item.id === "generate-video-in-browser");
  const expected = p50Boundary.capabilities["generate-video-in-browser"];

  assert.ok(capability);
  assert.deepEqual(
    capability.inputPorts.map((port) => port.key),
    expected.inputPorts,
  );
  assert.deepEqual(
    capability.outputPorts.map((port) => port.key),
    expected.outputPorts,
  );
  assert.deepEqual(
    capability.inputPorts.find((port) => port.key === "references")?.acceptedTypes,
    expected.acceptedReferenceTypes,
  );
  assert.deepEqual(capability.producedOutputTypes, expected.producedTypes);
  assert.ok(
    capability.outputSchema.required.includes(expected.requiredOutput),
    "a saída singular video continua obrigatória no contrato legado",
  );
  assert.match(
    handlerSource,
    /capabilityId === "generate-video-in-browser"[\s\S]*?\? META_VIBES_URL/,
  );
  assert.match(
    handlerSource,
    /values: \{ video: captured\.file, description: combined\.trim\(\) \}/,
  );
});

test("P51 preserva image e adiciona images plural opcional com ações", () => {
  const capability = manifest.capabilities.find((item) => item.id === "generate-image-in-browser");
  assert.ok(capability);
  assert.deepEqual(
    capability.outputPorts.map((port) => port.key),
    ["image", "images", "description"],
  );
  assert.equal(capability.outputPorts.find((port) => port.key === "image")?.required, true);
  assert.equal(capability.outputPorts.find((port) => port.key === "images")?.required, false);
  assert.deepEqual(capability.outputPorts.find((port) => port.key === "images")?.producedTypes, [
    "files",
  ]);
  assert.deepEqual(capability.outputSchema.required, ["image"]);
  assert.deepEqual(
    capability.itemActions.map((item) => item.action),
    ["regenerate", "replace", "select", "download"],
  );
});

test("P51 exclui histórico/referências e estabiliza variantes por src", () => {
  const baseline = ["https://cdn.example/history.png", "https://cdn.example/reference.png"];
  const candidates = __test.newImageCandidates(baseline, [
    { src: "https://cdn.example/history.png" },
    { src: "https://cdn.example/reference.png" },
    { src: "https://cdn.example/new-a.png" },
    { src: "https://cdn.example/new-b.png" },
    { src: "https://cdn.example/new-a.png" },
  ]);
  assert.deepEqual(
    candidates.map((item) => item.src),
    ["https://cdn.example/new-a.png", "https://cdn.example/new-b.png"],
  );
  const first = __test.imageCollectionStability(candidates);
  const second = __test.imageCollectionStability(candidates, first.signature, first.stablePolls);
  const third = __test.imageCollectionStability(candidates, second.signature, second.stablePolls);
  assert.equal(first.stablePolls, 0);
  assert.equal(second.stablePolls, 1);
  assert.equal(third.stablePolls, 2);
});

test("P51 declara proporções e prompt preview em imagem", () => {
  const capability = manifest.capabilities.find((item) => item.id === "generate-image-in-browser");
  const aspectRatio = capability.blockConfigSchema.properties.aspectRatio;
  assert.deepEqual(
    aspectRatio.oneOf.map((item) => item.const),
    ["16:9", "1:1", "9:16"],
  );
  assert.match(capability.promptPreview.template, /CONFIG:aspectRatio/);
  const prompt = __test.buildImagePrompt(
    request({
      capabilityId: "generate-image-in-browser",
      configuration: { aspectRatio: "16:9" },
      inputs: { prompt: "cena ampla" },
    }),
  );
  assert.match(prompt, /PROPORÇÃO DA IMAGEM: 16:9/);
});

test("P51 localiza a moldura nova em inglês e espanhol", () => {
  for (const locale of ["en", "es"]) {
    const localized = manifest.localizations[locale].capabilities["generate-image-in-browser"];
    assert.ok(localized.outputPorts.images.label);
    assert.ok(localized.blockConfigSchema.properties.aspectRatio.title);
    assert.equal(localized.blockConfigSchema.properties.aspectRatio.options.length, 3);
    assert.deepEqual(Object.keys(localized.itemActions), [
      "regenerate",
      "replace",
      "select",
      "download",
    ]);
  }
});

test("P51 publica cada variante incrementalmente sem perder a saída singular", () => {
  const first = {
    file: { id: "a", url: "artifact://a", mimeType: "image/png", size: 10 },
    artifact: { id: "a", name: "a.png", mimeType: "image/png", size: 10 },
  };
  const second = {
    file: { id: "b", url: "artifact://b", mimeType: "image/png", size: 20 },
    artifact: { id: "b", name: "b.png", mimeType: "image/png", size: 20 },
  };
  const req = request({
    capabilityId: "generate-image-in-browser",
    inputs: { prompt: "cena" },
    batch: { itemId: "scene-1", index: 0, total: 1 },
  });
  const partial1 = __test.imagePartialUpdate(req, first, 0, 2, [first], "ok");
  const partial2 = __test.imagePartialUpdate(req, second, 1, 2, [first, second], "ok");
  assert.equal(partial1.values.image.id, "a");
  assert.deepEqual(
    partial2.values.images.map((file) => file.id),
    ["a", "b"],
  );
  assert.deepEqual(
    partial1.itemUpdates.map((item) => [item.outputPort, item.variantKey]),
    [
      ["image", "image:0"],
      ["images", "image:0"],
    ],
  );
  assert.deepEqual(
    partial2.itemUpdates.map((item) => [item.outputPort, item.variantKey]),
    [["images", "image:1"]],
  );
  assert.equal(partial1.progress, 0.5);
  assert.equal(partial2.progress, 1);
});

test("P52 adiciona animação sem alterar o contrato de vídeo legado", () => {
  const animation = manifest.capabilities.find((item) => item.id === "animate-image-in-browser");
  const legacy = manifest.capabilities.find((item) => item.id === "generate-video-in-browser");
  const expectedLegacy = p50Boundary.capabilities["generate-video-in-browser"];

  assert.ok(animation);
  assert.deepEqual(
    animation.inputPorts.map((port) => port.key),
    ["image", "prompt"],
  );
  assert.deepEqual(
    animation.outputPorts.map((port) => port.key),
    ["video", "videos", "description"],
  );
  assert.equal(animation.inputPorts.find((port) => port.key === "image")?.required, true);
  assert.equal(animation.inputPorts.find((port) => port.key === "image")?.multiple, false);
  assert.deepEqual(animation.outputSchema.required, ["video"]);
  assert.deepEqual(
    animation.itemActions.map((item) => item.action),
    ["regenerate", "replace", "select", "download"],
  );

  assert.deepEqual(
    legacy.inputPorts.map((port) => port.key),
    expectedLegacy.inputPorts,
  );
  assert.deepEqual(
    legacy.outputPorts.map((port) => port.key),
    expectedLegacy.outputPorts,
  );
  assert.deepEqual(legacy.producedOutputTypes, expectedLegacy.producedTypes);
});

test("P52 preserva uma ou duas variantes e identidade determinística", () => {
  assert.equal(
    __test.animationVariantCount(request({ capabilityId: "animate-image-in-browser" })),
    1,
  );
  assert.equal(
    __test.animationVariantCount(
      request({ capabilityId: "animate-image-in-browser", configuration: { videoVariants: 2 } }),
    ),
    2,
  );
  const req = {
    executionId: "exec-1",
    blockId: "block-1",
    attempt: 3,
    batch: { itemId: "scene-7" },
  };
  assert.equal(__test.videoArtifactIdentity(req), "exec-1:block-1:3");
  assert.equal(__test.videoArtifactIdentity(req, 0), "exec-1:block-1:3:scene-7:animate:0");
  assert.equal(__test.videoArtifactIdentity(req, 1), "exec-1:block-1:3:scene-7:animate:1");
});

test("P52 usa somente a imagem-base como referência de animação", () => {
  const baseImage = { id: "base", name: "base.png", url: "staging://base" };
  const references = [{ id: "ref", name: "ref.png", url: "staging://ref" }];
  const animation = request({
    capabilityId: "animate-image-in-browser",
    inputs: { image: baseImage, prompt: "movimento suave", references },
  });
  assert.equal(__test.attachmentInput(animation), baseImage);
  assert.match(__test.buildAnimationPrompt(animation), /movimento suave/);
});

test("P52 não faz retry automático de geração após efeito externo incerto", () => {
  assert.match(handlerSource, /const responses = \[\],\s*retryAttempts = 0,/);
  assert.match(
    handlerSource,
    /throw codedError\("TIMEOUT", "O Meta AI não concluiu o vídeo no prazo\.", true\)/,
  );
});

test("P52 localiza a moldura da animação em inglês e espanhol", () => {
  for (const locale of ["en", "es"]) {
    const localized = manifest.localizations[locale].capabilities["animate-image-in-browser"];
    assert.ok(localized.inputPorts.image.label);
    assert.ok(localized.inputPorts.prompt.label);
    assert.ok(localized.outputPorts.videos.label);
    assert.equal(localized.blockConfigSchema.properties.videoVariants.options.length, 2);
    assert.deepEqual(Object.keys(localized.itemActions), [
      "regenerate",
      "replace",
      "select",
      "download",
    ]);
  }
});

test("P53 aplica lote serial somente onde o contrato é plural", () => {
  const text = manifest.capabilities.find((item) => item.id === "generate-text-in-browser");
  const image = manifest.capabilities.find((item) => item.id === "generate-image-in-browser");
  const animation = manifest.capabilities.find((item) => item.id === "animate-image-in-browser");
  const legacyVideo = manifest.capabilities.find((item) => item.id === "generate-video-in-browser");

  assert.deepEqual(text.execution.itemOrchestration, {
    inputPort: "content",
    outputPort: "parts",
    combinedOutputPort: "result",
    separator: "\n\n",
    mode: "sequential",
  });
  assert.deepEqual(image.execution.itemOrchestration, {
    inputPort: "prompt",
    outputPort: "images",
    mode: "sequential",
  });
  assert.equal(image.execution.maxConcurrency, 1);
  assert.equal(animation.execution.itemOrchestration, undefined);
  assert.equal(legacyVideo.execution.itemOrchestration, undefined);
});

test("P53 mantém respiro técnico configurável fora do Método", () => {
  const queueDelay = manifest.settingsSchema.properties.queueDelayMs;
  assert.deepEqual(
    {
      type: queueDelay.type,
      minimum: queueDelay.minimum,
      maximum: queueDelay.maximum,
      default: queueDelay.default,
    },
    { type: "integer", minimum: 0, maximum: 60000, default: 1500 },
  );
  for (const capability of manifest.capabilities) {
    assert.equal(capability.blockConfigSchema?.properties?.queueDelayMs, undefined);
  }
  assert.match(handlerSource, /Number\(request\?\.batch\?\.index\) > 0 && queueDelayMs > 0/);
});

test("P53 preserva identidade de lote para artifacts e updates incrementais", () => {
  const reqA = request({
    capabilityId: "generate-image-in-browser",
    inputs: { prompt: "cena A" },
    batch: { itemId: "scene-a", index: 0, total: 2 },
  });
  const reqB = request({
    capabilityId: "generate-image-in-browser",
    inputs: { prompt: "cena B" },
    batch: { itemId: "scene-b", index: 1, total: 2 },
  });
  const current = {
    file: { id: "a", url: "artifact://a", mimeType: "image/png", size: 10 },
    artifact: { id: "a", name: "a.png", mimeType: "image/png", size: 10 },
  };
  assert.notEqual(
    __test.imagePartialUpdate(reqA, current, 0, 1, [current]).itemUpdates[1].key,
    __test.imagePartialUpdate(reqB, current, 0, 1, [current]).itemUpdates[1].key,
  );
  assert.match(
    __test.imagePartialUpdate(reqA, current, 0, 1, [current]).itemUpdates[1].key,
    /^batch:scene-a:/,
  );
});

test("P53 reconcilia a mesma submissão entre tentativas sem duplicar efeito externo", () => {
  const base = request({
    capabilityId: "generate-image-in-browser",
    executionId: "exec-53",
    blockId: "block-53",
    attempt: 1,
    batch: { itemId: "scene-53", index: 0, total: 2 },
    inputs: { prompt: "cidade ao amanhecer" },
    configuration: { aspectRatio: "16:9", accountProfile: "meta-e2e" },
  });
  const retry = { ...base, attempt: 2 };
  const changed = { ...retry, inputs: { prompt: "floresta na chuva" } };

  assert.equal(__test.receiptLogicalKey(base), __test.receiptLogicalKey(retry));
  assert.equal(__test.receiptInputFingerprint(base), __test.receiptInputFingerprint(retry));
  assert.notEqual(__test.receiptInputFingerprint(base), __test.receiptInputFingerprint(changed));
  assert.equal(__test.receiptPartHasExternalEffect({ state: "submitted" }), true);
  assert.equal(__test.receiptPartHasExternalEffect({ state: "unknown" }), true);
  assert.equal(__test.receiptPartHasExternalEffect({ state: "rejected" }), false);
  assert.equal(__test.validMetaPageUrl("https://www.meta.ai/create/abc"), true);
  assert.equal(__test.validMetaPageUrl("https://vibes.ai/project/abc"), false);
});

test("P53 trata regeneração explícita como novo efeito externo", () => {
  const original = request({
    capabilityId: "generate-image-in-browser",
    executionId: "exec-53",
    blockId: "block-53",
    batch: { itemId: "scene-53", index: 0, total: 1 },
    inputs: { prompt: "cidade" },
  });
  const regenerate = {
    ...original,
    invocation: { mode: "start" },
    itemAction: { key: "result", variantKey: "image:0", attempt: 2, input: "cidade" },
  };
  assert.notEqual(__test.receiptLogicalKey(original), __test.receiptLogicalKey(regenerate));
});

test("P53 localiza os estados novos de execução em pt-BR, inglês e espanhol", () => {
  const expected = {
    "pt-BR": ["sem produzir mídia", "reenvio seguro"],
    en: ["without producing media", "safe resubmission"],
    es: ["sin producir contenido multimedia", "reenviarlo de forma segura"],
  };
  for (const [locale, fragments] of Object.entries(expected)) {
    const localizedRequest = request({ context: { locale } });
    assert.match(__test.p53Message(localizedRequest, "mediaRefusal"), new RegExp(fragments[0]));
    assert.match(__test.p53Message(localizedRequest, "unsafeResume"), new RegExp(fragments[1]));
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

test("isola contas por alias e porta", () => {
  assert.equal(__test.normalizeAccountProfile("canal-a"), "canal-a");
  assert.throws(() => __test.normalizeAccountProfile("../x"), /Perfil Meta AI/);
  assert.match(
    __test.profilePathFor({}, "canal-a").replaceAll("\\", "/"),
    /meta-ai-browser-profiles\/canal-a$/,
  );
  assert.notEqual(__test.profilePort(9844, "canal-a"), __test.profilePort(9844, "canal-b"));
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

test("expande placeholders ContentFlow e legados", () => {
  assert.equal(
    __test.expandTemplate("{{TEMA}} | {{NICHO}} | {{PROJECT_TITLE}}", request()),
    "Tema principal | Histórias | Projeto A",
  );
});

test("gera uma resposta simples", () => {
  const parts = __test.buildParts(request());
  assert.equal(parts.length, 1);
  assert.match(parts[0], /Tema principal/);
  assert.match(parts[0], /FORMATO OBRIGATÓRIO/);
});

test("inclui a instrução resolvida quando o template personalizado não possui o token", () => {
  const [prompt] = __test.buildParts(
    request({
      resolvedInstruction: "Preserve o contexto histórico.",
      configuration: { promptTemplate: "Gere opções." },
    }),
  );
  assert.match(prompt, /^INSTRUÇÕES DO BLOCO:\nPreserve o contexto histórico\./);
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

test("ignora modos antigos e faz somente um envio", () => {
  const parts = __test.buildParts(
    request({ configuration: { generationMode: "legacy_script_3_parts" } }),
  );
  assert.equal(parts.length, 1);
  assert.doesNotMatch(parts[0], /TÓPICOS 1, 2 e 3/);
});

test("não divide outline em várias chamadas", () => {
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

test("monta pesquisa com instrução e entradas", () => {
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
