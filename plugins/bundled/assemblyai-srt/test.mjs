import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { __test, compileSrt, execute, formatSrtTime, isSentenceEnd } from "./handler.mjs";

const words = [
  { text: "Olá", start: 0, end: 400 },
  { text: "mundo.", start: 500, end: 1000 },
  { text: "Tudo", start: 1200, end: 1600 },
  { text: "bem?", start: 1700, end: 2200 },
];

test("mantém arredondamento e formatação do script Python", () => {
  assert.equal(formatSrtTime(-1), "00:00:00,000");
  assert.equal(formatSrtTime(0.5), "00:00:00,000");
  assert.equal(formatSrtTime(1.5), "00:00:00,002");
  assert.equal(formatSrtTime(3_661_001), "01:01:01,001");
});

test("reconhece a mesma pontuação final do script", () => {
  assert.equal(isSentenceEnd('fim!\"]'), true);
  assert.equal(isSentenceEnd("continua,"), false);
});

test("modo sentence reproduz a segmentação original", () => {
  const result = compileSrt(words, { ...__test.CONFIG_DEFAULTS, segmentationMode: "sentence" });
  assert.match(result, /1\n00:00:00,000 --> 00:00:01,000\nOlá mundo\./);
  assert.match(result, /2\n00:00:01,200 --> 00:00:02,200\nTudo bem\?/);
  assert.equal(result.endsWith("\n"), true);
});

test("limita palavras e duração", () => {
  const byWords = compileSrt(words, {
    ...__test.CONFIG_DEFAULTS,
    segmentationMode: "max_words",
    maxWordsPerCue: 1,
  });
  assert.equal((byWords.match(/-->/g) ?? []).length, 4);
  const byDuration = compileSrt(words, {
    ...__test.CONFIG_DEFAULTS,
    segmentationMode: "max_duration",
    maxSecondsPerCue: 0.75,
  });
  assert.equal((byDuration.match(/-->/g) ?? []).length, 4);
});

test("gera a quantidade exata possível de entradas equilibradas", () => {
  const result = compileSrt(words, {
    ...__test.CONFIG_DEFAULTS,
    segmentationMode: "target_cues",
    targetCueCount: 3,
  });
  assert.equal((result.match(/-->/g) ?? []).length, 3);
  const capped = compileSrt(words, {
    ...__test.CONFIG_DEFAULTS,
    segmentationMode: "target_cues",
    targetCueCount: 200,
  });
  assert.equal((capped.match(/-->/g) ?? []).length, 4);
});

test("aceita uma lista arbitrária de chaves sem expô-las", () => {
  assert.deepEqual(__test.parseApiKeys("key-a, key-b\nkey-c"), ["key-a", "key-b", "key-c"]);
});

test("rejeita mídia fora dos formatos do script", () => {
  assert.throws(
    () =>
      __test.normalizeMediaInput({
        url: "stored://1",
        name: "arquivo.txt",
        mimeType: "text/plain",
        size: 10,
      }),
    /MP4/,
  );
});

test("start sem credencial falha de modo seguro", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assemblyai-srt-test-"));
  try {
    await mkdir(path.join(root, "jobs"), { recursive: true });
    const response = await execute(
      {
        executionId: "execution",
        blockId: "block",
        capabilityId: "transcribe-to-srt",
        attempt: 1,
        invocation: { mode: "start" },
        configuration: { ...__test.CONFIG_DEFAULTS },
        settings: {},
        inputs: {
          media_files: { url: "stored://1", name: "audio.mp3", mimeType: "audio/mpeg", size: 10 },
        },
      },
      {
        signal: new AbortController().signal,
        getSecret: async () => "",
        getWorkspacePath: (value) => path.join(root, value),
      },
    );
    assert.equal(response.status, "error");
    assert.equal(response.code, "AUTHENTICATION_FAILED");
    assert.equal(JSON.stringify(response).includes("key-a"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("job assíncrono preserva a rotação circular entre duas mídias", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assemblyai-srt-rotation-"));
  const workspace = path.join(root, "workspace");
  const output = path.join(root, "output");
  const source1 = path.join(root, "one.mp3");
  const source2 = path.join(root, "two.wav");
  await Promise.all([
    mkdir(path.join(workspace, "jobs"), { recursive: true }),
    mkdir(path.join(workspace, "results"), { recursive: true }),
    mkdir(output, { recursive: true }),
    writeFile(source1, "0123456789"),
    writeFile(source2, "abcdefghij"),
  ]);
  const media = [
    { url: "stored://one", name: "one.mp3", mimeType: "audio/mpeg", size: 10 },
    { url: "stored://two", name: "two.wav", mimeType: "audio/wav", size: 10 },
  ];
  const authorizations = [];
  const responses = [
    { upload_url: "https://cdn.assemblyai.com/upload/one" },
    { id: "transcript-one", status: "queued" },
    { id: "transcript-one", status: "completed", language_code: "pt", words },
    { upload_url: "https://cdn.assemblyai.com/upload/two" },
    { id: "transcript-two", status: "queued" },
    { id: "transcript-two", status: "completed", language_code: "pt", words },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    authorizations.push(options.headers?.Authorization);
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const baseRequest = {
    executionId: "rotation-execution",
    blockId: "rotation-block",
    capabilityId: "transcribe-to-srt",
    attempt: 1,
    configuration: { ...__test.CONFIG_DEFAULTS },
    settings: {},
    inputs: { media_files: media },
  };
  const services = {
    signal: new AbortController().signal,
    getSecret: async () => "key-a,key-b",
    resolveInputFile: async (file) => (file.name === "one.mp3" ? source1 : source2),
    getWorkspacePath: (value) => {
      const target = path.join(workspace, value);
      return target;
    },
    getOutputPath: (value) => path.join(output, value),
  };
  try {
    const start = await execute({ ...baseRequest, invocation: { mode: "start" } }, services);
    assert.equal(start.status, "pending");
    const firstResume = await execute(
      { ...baseRequest, invocation: { mode: "resume", jobId: start.jobId } },
      services,
    );
    assert.equal(firstResume.status, "pending");
    const secondResume = await execute(
      { ...baseRequest, invocation: { mode: "resume", jobId: start.jobId } },
      services,
    );
    assert.equal(secondResume.status, "success");
    assert.deepEqual(
      secondResume.values.subtitles.map((item) => item.name),
      ["one.srt", "two.srt"],
    );
    assert.deepEqual(authorizations, ["key-a", "key-a", "key-a", "key-b", "key-b", "key-b"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
