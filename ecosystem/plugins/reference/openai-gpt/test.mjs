import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "./handler.ts";

const request = {
  configuration: { model: "test-model", temperature: 0 },
  inputs: { context: "Tema de teste" },
  outputContract: [
    { key: "title", portKey: "result", label: "Título", type: "text", required: true },
  ],
  resolvedInstruction: "Crie um título curto.",
  context: {
    channel: { name: "Canal teste", language: "pt-BR", niche: "Educação" },
    project: { title: "Projeto teste" },
    processType: "title",
    block: { type: "CRIAR", name: "Criar título", instructions: "" },
    previousProcessOutputs: [],
    previousBlockOutputs: [],
  },
};

const services = (secret) => ({
  signal: new AbortController().signal,
  getSecret: async () => secret,
});

test("exige a chave sem tentar a rede", async () => {
  const result = await execute(request, services(undefined));
  assert.equal(result.status, "error");
  assert.equal(result.code, "OPENAI_API_KEY_REQUIRED");
});

test("transforma uma resposta simulada no contrato do bloco", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => (globalThis.fetch = originalFetch));
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.store, false);
    assert.match(payload.input, /Crie um título curto/);
    return new Response(
      JSON.stringify({
        output_text: "Como aprender melhor",
        model: "test-model",
        usage: { total_tokens: 8 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await execute(request, services("test-secret"));
  assert.equal(result.status, "success");
  assert.deepEqual(result.values, { title: "Como aprender melhor" });
});
