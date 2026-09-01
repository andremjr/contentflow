import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __test, execute } from "./handler.mjs";
const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const handlerSource = await readFile(new URL("./handler.mjs", import.meta.url), "utf8");
function req(o = {}) {
  return {
    capabilityId: o.capabilityId ?? "generate-text-in-browser",
    resolvedInstruction: o.resolvedInstruction ?? "Escreva com clareza.",
    configuration: {
      promptTemplate: "{{BLOCK_INSTRUCTIONS}} Tema: {{CONTENT}} Canal: {{CHANNEL_NAME}}",
      generationMode: "single",
      plainTextOnly: true,
      cleanOutput: true,
      retryAttempts: 0,
      ...o.configuration,
    },
    settings: { diagnosticMockResponse: "TESTE OK", ...o.settings },
    inputs: { content: "Tema principal", ...o.inputs },
    instructionContextInputs: o.instructionContextInputs,
    context: {
      channel: { name: "Canal A", niche: "Histórias" },
      project: { title: "Projeto A" },
      processType: "script",
      block: { type: "CRIAR", instructions: "Escreva com clareza." },
      ...o.context,
    },
    validation: o.validation,
    outputContract: o.outputContract,
  };
}

test("não repete no contexto uma entrada já interpolada na instrução", () => {
  assert.equal(
    __test.expand(
      "{{BLOCK_INSTRUCTIONS}} | contexto={{CONTENT}}",
      req({ resolvedInstruction: "Use Tema principal.", instructionContextInputs: {} }),
    ),
    "Use Tema principal. | contexto=",
  );
});
test("manifesto possui oito capabilities e permissões mínimas", () => {
  assert.equal(manifest.id, "local.contentflow.gemini-browser-studio");
  assert.equal(manifest.version, "1.0.1");
  assert.equal(manifest.profileSetup.configurationKey, "accountProfile");
  assert.equal(manifest.capabilities[0].instructionUsage, "required");
  assert.deepEqual(Object.keys(manifest.capabilities[0].blockConfigSchema.properties), [
    "fallbackAccountProfiles",
    "accountProfile",
  ]);
  assert.equal(manifest.settingsSchema.properties.allowExistingChromeProfile.default, false);
  assert.equal(manifest.capabilities.length, 8);
  assert.deepEqual(
    manifest.capabilities.map((x) => x.id),
    [
      "generate-text-in-browser",
      "search-web-in-browser",
      "choose-library-item-in-browser",
      "validate-content-in-browser",
      "analyze-images-in-browser",
      "analyze-documents-in-browser",
      "generate-image-in-browser",
      "generate-music-in-browser",
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
test("separa contas por perfil dedicado", () => {
  assert.equal(__test.normalizeProfile("canal-a"), "canal-a");
  assert.throws(() => __test.normalizeProfile("../x"), /Perfil Gemini/);
  assert.match(
    __test.profilePath({}, "canal-a").replaceAll("\\", "/"),
    /gemini-browser-profiles\/canal-a$/,
  );
  assert.notEqual(__test.profilePort(9644, "canal-a"), __test.profilePort(9644, "canal-b"));
  assert.equal(
    __test.runtimeProfilePath({}, "canal-a", {
      getWorkspacePath: (relativePath) => `workspace/${relativePath}`,
    }),
    "workspace/canal-a",
  );
});
test("expande placeholders", () =>
  assert.equal(
    __test.expand("{{TEMA}} | {{NICHO}} | {{PROJECT_TITLE}}", req()),
    "Tema principal | Histórias | Projeto A",
  ));
test("gera texto simples", () => {
  const p = __test.buildParts(req());
  assert.equal(p.length, 1);
  assert.match(p[0], /Tema principal/);
  assert.match(p[0], /FORMATO OBRIGATÓRIO/);
});
test("inclui a instrução resolvida quando o template personalizado não possui o token", () => {
  const [prompt] = __test.buildParts(
    req({
      resolvedInstruction: "Evite repetir temas.",
      configuration: { promptTemplate: "Gere opções." },
    }),
  );
  assert.match(prompt, /^INSTRUÇÕES DO BLOCO:\nEvite repetir temas\./);
});
test("sempre inclui as entradas resolvidas quando o prompt do plugin está vazio", () => {
  const [prompt] = __test.buildParts(
    req({
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
test("ignora roteiro legado e faz somente um envio", () => {
  const p = __test.buildParts(req({ configuration: { generationMode: "legacy_script_3_parts" } }));
  assert.equal(p.length, 1);
  assert.doesNotMatch(p[0], /TÓPICOS 1, 2 e 3/);
});
test("outline variável permanece em um envio", () => {
  const outline = Array.from({ length: 12 }, (_, i) => ({ titulo_bloco: `Ponto ${i + 1}` }));
  const p = __test.buildParts(
    req({
      configuration: {
        generationMode: "outline_sequence",
        outlineFirstPromptTemplate: "I {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
        outlineNextPromptTemplate: "M {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
        outlineLastPromptTemplate: "F {{BLOCK_NUMBER}}/{{BLOCK_TOTAL}} {{BLOCK}}",
      },
      inputs: { outline },
    }),
  );
  assert.equal(p.length, 1);
  assert.doesNotMatch(p[0], /I 1\/12/);
});
test("ignora partes personalizadas", () =>
  assert.equal(
    __test.buildParts(
      req({ configuration: { generationMode: "custom_parts", customParts: "A\n---PARTE---\nB" } }),
    ).length,
    1,
  ));
test("preserva partes individuais", () =>
  assert.deepEqual(
    __test.generationValues("A B", [{ text: "A" }, { text: "B" }], {
      outputContract: [{ key: "parts" }],
    }),
    { result: "A B", parts: ["A", "B"] },
  ));
test("monta busca com instrução e entradas", () =>
  assert.match(
    __test.buildSearch(
      req({
        configuration: { searchPromptTemplate: "BUSCA {{QUERY}} {{SEARCH_CONTEXT}}" },
        inputs: { query: "tema", context: "hoje" },
      }),
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*tema[\s\S]*hoje/,
  ));
test("busca do Gemini é guiada pelo prompt, sem ativar opção visual", () => {
  assert.doesNotMatch(
    handlerSource,
    /enable-web-search|ensureWebSearch|mode:search|pesquisar na web.*click/i,
  );
});
test("respeita contrato de busca", () =>
  assert.deepEqual(
    __test.searchValues("- A\n- B", ["https://example.com"], {
      outputContract: [
        { key: "items", type: "list" },
        { key: "sources", type: "list" },
      ],
    }),
    { items: ["A", "B"], sources: ["https://example.com"] },
  ));
test("Escolher exige ID real", () => {
  const r = req({ context: { selectedCollection: { items: [{ id: "a" }, { id: "b" }] } } });
  assert.equal(__test.parseChoice('{"selectedItemId":"b"}', r), "b");
  assert.throws(() => __test.parseChoice('{"selectedItemId":"x"}', r), /ID permitido/);
});
test("Validar interpreta três modos", () => {
  assert.deepEqual(
    __test.parseValidation(
      '{"decision":"approved","feedback":"OK"}',
      req({ validation: { mode: "approval" } }),
    ),
    { decision: "approved", feedback: "OK" },
  );
  assert.deepEqual(
    __test.parseValidation(
      '{"selectedIndex":2}',
      req({ validation: { mode: "select_one" }, inputs: { content: ["A", "B"] } }),
    ),
    { selected_value: "B" },
  );
  assert.deepEqual(
    __test.parseValidation(
      '{"selectedIndices":[1,3]}',
      req({ validation: { mode: "select_many" }, inputs: { content: ["A", "B", "C"] } }),
    ),
    { selected_values: ["A", "C"] },
  );
});
test("monta visão, imagem e música", () => {
  assert.match(
    __test.buildAnalysis(
      req({
        configuration: { analysisPromptTemplate: "ANALISE {{ANALYSIS_CONTEXT}}" },
        inputs: { context: "thumb" },
      }),
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*thumb/,
  );
  assert.match(
    __test.buildMedia(
      req({
        configuration: { imagePromptTemplate: "IMG {{IMAGE_PROMPT}}" },
        inputs: { prompt: "azul" },
      }),
      "image",
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*azul/,
  );
  assert.match(
    __test.buildMedia(
      req({
        configuration: { musicPromptTemplate: "MUS {{MUSIC_PROMPT}}" },
        inputs: { prompt: "calma" },
      }),
      "music",
    ),
    /CONTEXTO DAS ENTRADAS:[\s\S]*calma/,
  );
});
test("encontra StoredFiles aninhados", () => {
  const f = { id: "f", name: "a.pdf", url: "staging://f" };
  assert.deepEqual(__test.collect({ x: [f] }), [f]);
});
test("mock textual não abre navegador", async () => {
  assert.deepEqual((await execute(req(), { signal: AbortSignal.timeout(5000) })).values, {
    result: "TESTE OK",
  });
  assert.deepEqual(
    (
      await execute(
        req({
          capabilityId: "search-web-in-browser",
          settings: { diagnosticMockResponse: "Pesquisa" },
        }),
        { signal: AbortSignal.timeout(5000) },
      )
    ).values,
    { result: "Pesquisa", sources: [] },
  );
});
