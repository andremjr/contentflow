import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute, executeWithRunner } from "./handler.mjs";

async function harness(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-antigravity-skill-"));
  const output = path.join(root, "output");
  await mkdir(output);
  const request = {
    executionId: "test-execution",
    traceId: "test-trace",
    blockId: "test-block",
    capabilityId: "run-production-skill",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {
      skill_name: "roteiro-youtube",
      task_prompt: "Produza a entrega.",
      model: "",
      agent: "",
      effort: "medium",
      workspace_mode: "read-only",
      timeout_seconds: 60,
      diagnostic_mode: false,
    },
    settings: {},
    inputs: { context: "Tema de teste" },
    inputContract: [],
    outputContract: [
      { portKey: "result", key: "script", label: "Roteiro", type: "textarea", required: true },
    ],
    context: {
      locale: "pt-BR",
      channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "Educação" },
      project: { id: "project", title: "Projeto" },
      processType: "script",
      block: { type: "CRIAR", name: "Criar roteiro", instructions: "Escreva o roteiro." },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
    ...overrides,
  };
  const services = {
    signal: AbortSignal.timeout(5000),
    getSecret: async () => {
      throw new Error("o runner não deve solicitar secrets");
    },
    resolveInputFile: async () => "",
    getOutputPath: (name) => path.join(output, name),
    getWorkspacePath: (name) => path.join(root, name),
  };
  return { request, services };
}

test("monta uma execução não interativa e devolve a entrega tipada", async () => {
  const { request, services } = await harness();
  let observed;
  const response = await executeWithRunner(request, services, async (call) => {
    observed = call;
    return {
      stdout: JSON.stringify({
        conversation_id: "conversation_12345678",
        status: "SUCCESS",
        structured_output: { result: "Roteiro pronto" },
        usage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
      }),
      stderr: "",
    };
  });
  assert.equal(response.status, "success");
  assert.deepEqual(response.values, { result: "Roteiro pronto" });
  assert.equal(observed.args[0], "-p");
  assert.ok(observed.args.includes("--output-format"));
  assert.ok(observed.args.includes("--json-schema"));
  assert.ok(observed.args.includes("--sandbox"));
  assert.equal(observed.args.includes("--dangerously-skip-permissions"), false);
  assert.equal(Object.hasOwn(observed.env, "GOOGLE_API_KEY"), false);
  assert.match(observed.args[1], /roteiro-youtube/);
  assert.equal(response.conversation.id, "conversation_12345678");
});

test("retoma conversa específica e habilita edição sem ignorar permissões", async () => {
  const { request, services } = await harness({
    conversation: { mode: "reuse", id: "conversation_abcdefgh" },
  });
  request.configuration.workspace_mode = "workspace-write";
  let args;
  const response = await executeWithRunner(request, services, async (call) => {
    args = call.args;
    return {
      stdout: JSON.stringify({
        conversation_id: "conversation_abcdefgh",
        status: "SUCCESS",
        structured_output: { result: "Continuação" },
      }),
      stderr: "",
    };
  });
  assert.equal(response.status, "success");
  assert.deepEqual(args.slice(args.indexOf("--conversation"), args.indexOf("--conversation") + 2), [
    "--conversation",
    "conversation_abcdefgh",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2), [
    "--mode",
    "accept-edits",
  ]);
  assert.equal(args.includes("--dangerously-skip-permissions"), false);
});

test("rejeita nome de skill inseguro antes de criar subprocesso", async () => {
  const base = await harness();
  base.request.configuration.skill_name = "../../segredo";
  const response = await executeWithRunner(base.request, base.services, async () => {
    throw new Error("não deveria executar");
  });
  assert.equal(response.status, "error");
  assert.equal(response.code, "INVALID_CONFIGURATION");
});

test("não solicita chave de API quando o runner falha", async () => {
  const { request, services } = await harness();
  const response = await executeWithRunner(request, services, async () => {
    const error = new Error("authentication required");
    error.code = "AUTHENTICATION_FAILED";
    throw error;
  });
  assert.equal(response.status, "error");
  assert.equal(response.code, "ANTIGRAVITY_EXECUTION_FAILED");
});

test("a escolha aceita somente um ID real da coleção", async () => {
  const { request, services } = await harness({
    capabilityId: "choose-with-production-skill",
    outputContract: [
      {
        portKey: "selectedItemId",
        key: "selectedItemId",
        label: "Item escolhido",
        type: "select",
        required: true,
      },
    ],
  });
  request.context.block.type = "ESCOLHER";
  request.context.selectedCollection = {
    collectionId: "titles",
    items: [
      { id: "item-a", values: { title: "A" } },
      { id: "item-b", values: { title: "B" } },
    ],
  };
  const valid = await executeWithRunner(request, services, async (call) => {
    return {
      stdout: JSON.stringify({
        status: "SUCCESS",
        structured_output: { selectedItemId: "item-b" },
      }),
      stderr: "",
    };
  });
  assert.equal(valid.status, "success");
  assert.equal(valid.values.selectedItemId, "item-b");

  const invalid = await executeWithRunner(request, services, async (call) => {
    return {
      stdout: JSON.stringify({
        status: "SUCCESS",
        structured_output: { selectedItemId: "inventado" },
      }),
      stderr: "",
    };
  });
  assert.equal(invalid.status, "error");
  assert.equal(invalid.code, "OUTPUT_VALIDATION_FAILED");
});

test("rejeita itens incompatíveis em uma lista tipada", async () => {
  const { request, services } = await harness();
  request.outputContract[0].type = "list";
  const response = await executeWithRunner(request, services, async (call) => {
    return {
      stdout: JSON.stringify({ status: "SUCCESS", structured_output: { result: ["válido", 42] } }),
      stderr: "",
    };
  });
  assert.equal(response.status, "error");
  assert.equal(response.code, "OUTPUT_VALIDATION_FAILED");
});

test("o modo de diagnóstico passa pelo sandbox sem Antigravity instalado", async () => {
  const { request, services } = await harness();
  request.configuration.diagnostic_mode = true;
  const response = await execute(request, services);
  assert.equal(response.status, "success");
  assert.equal(response.values.result, "Diagnóstico concluído sem chamar o Antigravity.");
});
