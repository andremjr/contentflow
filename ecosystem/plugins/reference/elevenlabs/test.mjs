import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execute, __test } from "./handler.mjs";

function request(
  capabilityId,
  inputs = {},
  configuration = {},
  settings = { diagnosticFixture: true },
) {
  return {
    executionId: "test-execution",
    traceId: "test-trace",
    blockId: `block-${capabilityId}`,
    capabilityId,
    attempt: 1,
    invocation: { mode: "start", attempt: 1 },
    inputs,
    configuration,
    settings,
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "test", name: "Teste", language: "pt-BR", niche: "" },
      project: { id: "test", title: "Teste" },
      processType: "narration",
      block: {
        type: capabilityId === "list-voices" ? "BUSCAR" : "CRIAR",
        name: "Teste",
        instructions: "",
      },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function services(root, secret = "test-only", sourcePath) {
  return {
    signal: new AbortController().signal,
    getSecret: async () => secret,
    getWorkspacePath: (name) => join(root, "workspace", name),
    getOutputPath: (name) => join(root, "output", name),
    resolveInputFile: async () => sourcePath,
  };
}

test("fixtures cobrem as cinco capacidades", async () => {
  const root = await mkdtemp(join(tmpdir(), "elevenlabs-test-"));
  try {
    const voices = await execute(request("list-voices"), services(root));
    assert.equal(voices.status, "success");
    assert.equal(voices.values.voices[0].voice_id, "fixture-voice");
    for (const [capability, input] of [
      ["text-to-speech", { text: "Olá" }],
      ["generate-sound-effect", { description: "Som curto" }],
      ["compose-music", { prompt: "Música curta" }],
    ]) {
      const result = await execute(request(capability, input), services(root));
      assert.equal(result.status, "success");
      assert.equal(result.values.audio.mimeType, "audio/mpeg");
      assert.equal(
        (await readFile(join(root, "output", result.values.audio.name))).subarray(0, 3).toString(),
        "ID3",
      );
    }
    const transcript = await execute(request("transcribe-media"), services(root));
    assert.equal(transcript.status, "success");
    assert.match(transcript.values.transcript, /diagnóstico/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("narração exige texto", async () => {
  const result = await execute(request("text-to-speech", {}, {}, {}), services(tmpdir()));
  assert.equal(result.status, "error");
  assert.equal(result.code, "INVALID_INPUT");
});

test("chave ausente produz erro seguro", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("não deveria chamar");
  };
  try {
    const result = await execute(request("list-voices", {}, {}, {}), services(tmpdir(), ""));
    assert.equal(result.status, "error");
    assert.equal(result.code, "AUTHENTICATION_FAILED");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retry idempotente reutiliza áudio do workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "elevenlabs-test-"));
  const originalFetch = globalThis.fetch;
  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(256, 1)]);
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(mp3, {
      status: 200,
      headers: { "content-type": "audio/mpeg", "character-cost": "4" },
    });
  };
  try {
    const value = request("text-to-speech", { text: "Olá" }, {}, {});
    const first = await execute(value, services(root));
    const second = await execute(value, services(root));
    assert.equal(first.status, "success");
    assert.equal(second.status, "success");
    assert.equal(calls, 1);
    assert.equal(second.values.metadata[0].cached, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("rate limit do provedor é tipado", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{"detail":"limit"}', {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "2" },
    });
  try {
    const result = await execute(request("list-voices", {}, {}, {}), services(tmpdir()));
    assert.equal(result.status, "error");
    assert.equal(result.code, "RATE_LIMIT");
    assert.equal(result.retryable, true);
    assert.equal(result.retryAfterMs, 2000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transcrição valida MIME antes de ler arquivo", async () => {
  const value = request(
    "transcribe-media",
    { media: { id: "x", name: "x.txt", mimeType: "text/plain", size: 10, url: "artifact://x" } },
    {},
    {},
  );
  const result = await execute(value, services(tmpdir()));
  assert.equal(result.status, "error");
  assert.equal(result.code, "INVALID_INPUT");
});

test("transcrição real simulada é armazenada de forma idempotente", async () => {
  const root = await mkdtemp(join(tmpdir(), "elevenlabs-test-"));
  const source = join(root, "source.mp3");
  const bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(50, 0)]);
  await mkdir(root, { recursive: true });
  await writeFile(source, bytes);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      text: "Olá mundo",
      language_code: "pt",
      language_probability: 0.99,
      words: [{ text: "Olá", start: 0, end: 0.5, type: "word", speaker_id: "speaker_0" }],
    });
  };
  try {
    const value = request(
      "transcribe-media",
      {
        media: {
          id: "source",
          name: "source.mp3",
          mimeType: "audio/mpeg",
          size: bytes.length,
          url: "artifact://source",
        },
      },
      {},
      {},
    );
    const first = await execute(value, services(root, "test-only", source));
    const second = await execute(value, services(root, "test-only", source));
    assert.equal(first.values.transcript, "Olá mundo");
    assert.equal(second.values.metadata[0].cached, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("assinaturas de áudio são conferidas", () => {
  assert.equal(__test.validAudio(Buffer.from("ID3data"), "audio/mpeg"), true);
  assert.equal(__test.validAudio(Buffer.from("HTML"), "audio/mpeg"), false);
});
