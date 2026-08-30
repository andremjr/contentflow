import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __test, execute } from "./handler.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const handlerSource = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");

test("manifesto prepara perfis antes da execução", () => {
  assert.equal(manifest.version, "0.4.3");
  assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
  assert.equal(manifest.settingsSchema.properties.allowExistingChromeProfile.default, false);
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

function request(overrides = {}) {
  return {
    capabilityId: overrides.capabilityId ?? "generate-text-in-browser",
    resolvedInstruction: overrides.resolvedInstruction,
    configuration: {
      promptTemplate: "{{BLOCK_INSTRUCTIONS}}\n\nTema: {{CONTENT}}\nCanal: {{CHANNEL_NAME}}",
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

test("manifesto declara as seis capabilities do Claude Browser Studio", () => {
  assert.equal(manifest.apiVersion, "1");
  assert.equal(manifest.id, "local.contentflow.claude-browser-text");
  const capability = manifest.capabilities.find((item) => item.id === "generate-text-in-browser");
  assert.ok(capability);
  assert.equal(capability.instructionUsage, "optional");
  assert.deepEqual(capability.blockTypes, ["CRIAR"]);
  assert.deepEqual(
    capability.outputPorts.map((item) => item.key),
    ["result", "parts"],
  );
  assert.deepEqual(
    manifest.capabilities.map((item) => item.id),
    [
      "generate-text-in-browser",
      "search-web-in-browser",
      "choose-library-item-in-browser",
      "validate-content-in-browser",
      "analyze-images-in-browser",
      "analyze-documents-in-browser",
    ],
  );
  assert.ok(manifest.permissions.includes("process"));
  assert.ok(manifest.permissions.includes("filesystem:read"));
  assert.deepEqual(manifest.networkHosts, ["claude.ai"]);
  assert.deepEqual(manifest.secretKeys ?? [], []);
});

test("reúne anexos autorizados sem duplicar arquivos", () => {
  const image = { id: "img-1", name: "frame.png", url: "staging://img-1" };
  assert.deepEqual(__test.collectStoredFiles([image, { nested: image }]), [image, image]);
});

test("monta prompts especializados de visão e documentos", () => {
  const vision = __test.buildImageAnalysisPrompt(
    request({
      capabilityId: "analyze-images-in-browser",
      configuration: {
        analysisPromptTemplate: "VISÃO {{ANALYSIS_CONTEXT}} | {{BLOCK_INSTRUCTIONS}}",
      },
      inputs: { images: [{ id: "i", name: "a.png", url: "staging://i" }], context: "thumbnail" },
    }),
  );
  const documents = __test.buildDocumentAnalysisPrompt(
    request({
      capabilityId: "analyze-documents-in-browser",
      configuration: {
        analysisPromptTemplate: "DOC {{ANALYSIS_CONTEXT}} | {{BLOCK_INSTRUCTIONS}}",
      },
      inputs: {
        documents: [{ id: "d", name: "a.pdf", url: "staging://d" }],
        context: "referências",
      },
    }),
  );
  assert.equal(vision, "VISÃO thumbnail | Escreva com clareza.");
  assert.equal(documents, "DOC referências | Escreva com clareza.");
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

test("inclui a instrução resolvida quando o template personalizado não possui o token", () => {
  const [prompt] = __test.buildParts(
    request({
      resolvedInstruction: "Não repita o tema anterior.",
      configuration: { promptTemplate: "Gere um tema." },
    }),
  );
  assert.match(prompt, /^INSTRUÇÕES DO BLOCO:\nNão repita o tema anterior\./);
});

test("isola contas por alias sem aceitar traversal", () => {
  assert.equal(__test.normalizeAccountProfile("canal-a"), "canal-a");
  assert.throws(() => __test.normalizeAccountProfile("../perfil"), /Perfil da conta/);
  assert.match(
    __test.profilePathFor({}, "canal-a").replaceAll("\\", "/"),
    /claude-browser-profiles\/canal-a$/,
  );
  assert.notEqual(__test.profilePort(9444, "canal-a"), __test.profilePort(9444, "canal-b"));
  assert.equal(
    __test.runtimeProfilePath({}, "canal-a", {
      getWorkspacePath: (relativePath) => `workspace/${relativePath}`,
    }),
    "workspace/canal-a",
  );
});

test("expande contexto e placeholders legados", () => {
  const expanded = __test.expandTemplate(
    "{{TEMA}} | {{NICHO}} | {{PROJECT_TITLE}} | {{INPUT:content}}",
    request(),
  );
  assert.equal(expanded, "Tema principal | Histórias | Projeto A | Tema principal");
});

test("monta uma resposta genérica", () => {
  const parts = __test.buildParts(request());
  assert.equal(parts.length, 1);
  assert.match(parts[0], /Tema principal/);
  assert.match(parts[0], /texto puro/i);
});

test("preserva o roteiro legado em três partes", () => {
  const parts = __test.buildParts(
    request({ configuration: { generationMode: "legacy_script_3_parts" } }),
  );
  assert.equal(parts.length, 3);
  assert.match(parts[0], /TÓPICOS 1, 2 e 3/);
  assert.match(parts[1], /TÓPICOS 4, 5 e 6/);
  assert.match(parts[2], /TÓPICOS 7 e 8/);
});

test("transforma records em uma parte por bloco", () => {
  const parts = __test.buildParts(
    request({
      configuration: { generationMode: "legacy_script_blocks" },
      inputs: {
        content: [
          { titulo_bloco: "Abertura", objetivo: "Criar curiosidade" },
          { titulo_bloco: "Virada" },
        ],
      },
    }),
  );
  assert.equal(parts.length, 2);
  assert.match(parts[0], /Abertura/);
  assert.match(parts[0], /Criar curiosidade/);
  assert.match(parts[1], /Virada/);
});

test("desenvolve outlines de quantidade variável com templates configuráveis", () => {
  const outline = Array.from({ length: 12 }, (_, index) => ({
    titulo_bloco: `Ponto ${index + 1}`,
    objetivo: `Objetivo ${index + 1}`,
  }));
  const parts = __test.buildParts(
    request({
      configuration: {
        generationMode: "outline_sequence",
        outlineFirstPromptTemplate:
          "INÍCIO {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK_JSON}} {{PROMPT_BASE}}",
        outlineNextPromptTemplate: "MEIO {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
        outlineLastPromptTemplate: "FIM {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
      },
      inputs: { content: "Contexto geral", outline },
    }),
  );
  assert.equal(parts.length, 12);
  assert.match(parts[0], /INÍCIO 1\/12/);
  assert.match(parts[0], /Ponto 1/);
  assert.match(parts[6], /MEIO 7\/12/);
  assert.match(parts[11], /FIM 12\/12/);
  assert.match(parts[11], /Ponto 12/);
});

test("separa partes personalizadas", () => {
  const parts = __test.buildParts(
    request({
      configuration: {
        generationMode: "custom_parts",
        customParts: "Comece agora\n---PARTE---\nContinue e finalize",
      },
    }),
  );
  assert.equal(parts.length, 2);
  assert.match(parts[0], /Comece agora/);
  assert.match(parts[1], /Continue e finalize/);
});

test("preserva cada resposta quando a saída parts é conectada", () => {
  const values = __test.generationResponseValues(
    "Parte A\n\nParte B",
    [{ text: "Parte A" }, { text: "Parte B" }],
    {
      outputContract: [
        { key: "result", type: "textarea" },
        { key: "parts", type: "list" },
      ],
    },
  );
  assert.deepEqual(values, { result: "Parte A\n\nParte B", parts: ["Parte A", "Parte B"] });
});

test("monta pesquisa web com consulta e contexto", () => {
  const prompt = __test.buildSearchPrompt(
    request({
      capabilityId: "search-web-in-browser",
      configuration: { searchPromptTemplate: "PESQUISE {{QUERY}} | {{SEARCH_CONTEXT}}" },
      inputs: { query: "tendências atuais", context: "YouTube" },
    }),
  );
  assert.equal(
    prompt,
    "INSTRUÇÕES DO BLOCO:\nEscreva com clareza.\n\nPESQUISE tendências atuais | YouTube",
  );
  assert.doesNotMatch(handlerSource, /ensureWebSearchEnabled|enable-web-search|open-tools/);
});

test("Buscar respeita as chaves e tipos do outputContract do bloco", () => {
  const values = __test.searchResponseValues(
    "- Tendência A\n- Tendência B",
    ["https://example.com/a"],
    {
      outputContract: [
        { key: "items_found", label: "Itens encontrados", type: "list" },
        { key: "sources", label: "Fontes consultadas", type: "list" },
      ],
    },
  );
  assert.deepEqual(values, {
    items_found: ["Tendência A", "Tendência B"],
    sources: ["https://example.com/a"],
  });
});

test("Escolher aceita somente ID real da coleção", () => {
  const chooseRequest = request({
    capabilityId: "choose-library-item-in-browser",
    context: {
      selectedCollection: {
        collectionId: "collection-1",
        items: [
          { id: "item-a", values: { titulo: "A" } },
          { id: "item-b", values: { titulo: "B" } },
        ],
      },
    },
  });
  assert.equal(__test.parseSelectedItemId('{"selectedItemId":"item-b"}', chooseRequest), "item-b");
  assert.throws(
    () => __test.parseSelectedItemId('{"selectedItemId":"inventado"}', chooseRequest),
    /ID exato/,
  );
});

test("Validar interpreta aprovação, seleção única e múltipla", () => {
  assert.deepEqual(
    __test.parseValidationValues(
      '{"decision":"rejected","feedback":"Falta fonte"}',
      request({ validation: { mode: "approval" } }),
    ),
    { decision: "rejected", feedback: "Falta fonte" },
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

test("rotas simuladas devolvem contratos de Buscar, Escolher e Validar", async () => {
  const search = await execute(
    request({
      capabilityId: "search-web-in-browser",
      settings: { diagnosticMockResponse: "Pesquisa pronta" },
    }),
    { signal: AbortSignal.timeout(5000) },
  );
  assert.deepEqual(search.values, { result: "Pesquisa pronta", sources: [] });

  const choose = await execute(
    request({
      capabilityId: "choose-library-item-in-browser",
      settings: { diagnosticMockResponse: '{"selectedItemId":"item-a"}' },
      context: { selectedCollection: { collectionId: "c", items: [{ id: "item-a", values: {} }] } },
    }),
    { signal: AbortSignal.timeout(5000) },
  );
  assert.deepEqual(choose.values, { result: "item-a" });

  const validate = await execute(
    request({
      capabilityId: "validate-content-in-browser",
      settings: { diagnosticMockResponse: '{"decision":"approved","feedback":"OK"}' },
      validation: { mode: "approval" },
    }),
    { signal: AbortSignal.timeout(5000) },
  );
  assert.deepEqual(validate.values, { decision: "approved", feedback: "OK" });
});

test("limpa artefatos, código e títulos markdown como o script original", () => {
  const cleaned = __test.cleanGeneratedText(
    "# Título interno\n\nTexto narrativo.\n\n```js\nconst segredo = 1;\n```\n\nContinuação.",
  );
  assert.equal(cleaned, "Texto narrativo.\n\nContinuação.");
});

test("fixture de diagnóstico respeita o contrato sem abrir navegador", async () => {
  const response = await execute(request(), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, "success");
  assert.equal(response.values.result, "TESTE OK");
});
