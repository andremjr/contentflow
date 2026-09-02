import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { __test, execute, validateConversationUrl } from "./handler.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const handlerSource = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");

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

test("manifesto declara oito capabilities modulares", () => {
  assert.equal(manifest.id, "local.contentflow.chatgpt-browser-studio");
  assert.equal(manifest.version, "1.0.4");
  assert.equal(manifest.supportsConversationContinuation, undefined);
  assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
  assert.equal(manifest.settingsSchema.properties.allowExistingChromeProfile.default, false);
  const generation = manifest.capabilities.find((item) => item.id === "generate-text-in-browser");
  assert.equal(generation.instructionUsage, "required");
  assert.deepEqual(Object.keys(generation.blockConfigSchema.properties), [
    "fallbackAccountProfiles",
    "accountProfile",
  ]);
  assert.deepEqual(generation.outputPorts.find((port) => port.key === "result").producedTypes, [
    "text",
    "textarea",
  ]);
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
