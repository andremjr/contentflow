import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  execute,
  normalizeProfile,
  profilePort,
  assertProfile,
  buildVoicePrompt,
  buildTextPrompt,
  generateSilenceWav,
  splitVoiceText,
  concatenateWavBuffers,
  selectVoiceAndStyle,
  isAudioGenerationInProgress,
  latestArtifactAudioUrl,
  expandTemplate,
} from "./handler.mjs";

test("manifesto possui estrutura e capabilities válidas conforme API v1", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.apiVersion, "1");
  assert.equal(manifest.id, "local.contentflow.mai-playground-browser");
  assert.equal(manifest.entrypoint, "handler.mjs");
  assert.equal(manifest.runtime.kind, "node");
  assert.equal(manifest.runtime.module, "esm");
  assert.deepEqual(manifest.deliveryTypes, ["audio", "text", "processing"]);
  assert.deepEqual(manifest.permissions, [
    "network",
    "filesystem:read",
    "filesystem:write",
    "process",
  ]);
  assert.ok(manifest.networkHosts.includes("playground.microsoft.ai"));

  const caps = manifest.capabilities;
  assert.equal(caps.length, 2);

  const voiceCap = caps.find((c) => c.id === "generate-voice-in-browser");
  assert.ok(voiceCap);
  assert.equal(voiceCap.operator, "IA");
  assert.deepEqual(voiceCap.blockTypes, ["CRIAR"]);
  assert.deepEqual(voiceCap.processTypes, ["narration"]);
  assert.ok(voiceCap.inputPorts.some((p) => p.key === "text"));
  assert.ok(voiceCap.outputPorts.some((p) => p.key === "audio"));
  assert.equal(voiceCap.blockConfigSchema.properties.voice.default, "Caio");
  assert.ok(voiceCap.blockConfigSchema.properties.voice.enum.includes("Luana"));
  assert.deepEqual(voiceCap.blockConfigSchema.properties.style.enum, [
    "Neutral",
    "Angry",
    "Confused",
    "Determined",
    "Embarrassed",
    "Excited",
    "Happy",
    "Hopeful",
    "Joyful",
    "Regretful",
    "Relieved",
    "Sad",
    "Shouting",
    "Softvoice",
    "Whispering",
  ]);

  const textCap = caps.find((c) => c.id === "generate-text-in-browser");
  assert.ok(textCap);
  assert.equal(textCap.operator, "IA");
  assert.deepEqual(textCap.blockTypes, ["CRIAR"]);
  assert.ok(textCap.outputPorts.some((p) => p.key === "result"));
});

test("separa contas por perfil dedicado e valida porta sem colisão", () => {
  assert.equal(normalizeProfile("default"), "default");
  assert.equal(normalizeProfile("conta_01"), "conta_01");
  assert.throws(() => normalizeProfile("../malicious"), /Perfil Microsoft AI Playground inválido/);
  assert.throws(() => normalizeProfile("user/name"), /Perfil Microsoft AI Playground inválido/);

  const portDefault = profilePort(9944, "default");
  const portConta1 = profilePort(9944, "conta_01");
  assert.equal(portDefault, 9944);
  assert.ok(portConta1 >= 9944 && portConta1 <= 64000);

  assert.throws(
    () => assertProfile("C:/Users/User/AppData/Local/Google/Chrome/User Data"),
    /Use perfil Chrome dedicado/,
  );
  assert.doesNotThrow(() => assertProfile("C:/Safe/Profiles/mai-01"));
});

test("constrói prompt de voz e valida entrada obrigatória", () => {
  assert.equal(
    buildVoicePrompt({ inputs: { text: "Olá, este é um teste de narração." } }),
    "Olá, este é um teste de narração.",
  );
  assert.equal(
    buildVoicePrompt({ inputs: { content: "Texto vindo da porta content." } }),
    "Texto vindo da porta content.",
  );
  assert.throws(
    () => buildVoicePrompt({ inputs: { text: "   " } }),
    /O texto para narração não pode estar vazio/,
  );
});

test("divide narração no ponto final mais próximo de 800 sem cortar palavras", () => {
  const firstSentence = `${"palavra ".repeat(90).trim()}.`;
  const secondSentence = `${"continuação ".repeat(20).trim()}.`;
  const chunks = splitVoiceText(`${firstSentence} ${secondSentence}`, 800);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], firstSentence);
  assert.equal(chunks.join(" "), `${firstSentence} ${secondSentence}`);
  assert.ok(chunks.every((chunk) => chunk.length <= 800));
  assert.ok(
    chunks.every((chunk) => !/^\S/.test(chunk.slice(-1)) || /[.\wÀ-ÿ)]/.test(chunk.at(-1))),
  );
});

test("usa espaço como fallback quando não existe ponto final antes do limite", () => {
  const text = "palavra ".repeat(130).trim();
  const chunks = splitVoiceText(text, 800);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 800));
  assert.equal(chunks.join(" "), text);
});

test("rejeita palavra maior que o limite em vez de cortá-la", () => {
  assert.throws(() => splitVoiceText("x".repeat(801), 800), /sem cortar essa palavra/);
});

test("seleciona voz e estilo mesmo quando os menus ainda precisam ser abertos", async () => {
  const calls = [];
  const bridge = {
    async dispatch(_action, payload, operationKey) {
      calls.push({ payload, operationKey });
      if (operationKey.includes("already-open")) throw new Error("menu fechado");
      return { ok: true };
    },
  };
  await selectVoiceAndStyle(bridge, "Caio", "Neutral");
  assert.deepEqual(
    calls.map((call) => call.operationKey),
    [
      "select-voice-Caio-already-open",
      "open-voice-picker-1",
      "select-voice-Caio-1",
      "select-style-Neutral-already-open",
      "open-style-picker-1",
      "select-style-Neutral-1",
    ],
  );
});

test("expande placeholders e instruções do bloco para texto", () => {
  const request = {
    resolvedInstruction: "Crie um roteiro sobre produtividade",
    inputs: { content: "Técnica Pomodoro" },
    context: {
      channel: { name: "Canal Foco", niche: "Estudos" },
      project: { title: "Episódio 1" },
    },
  };
  const prompt = buildTextPrompt(request);
  assert.ok(prompt.includes("Crie um roteiro sobre produtividade"));
  assert.ok(prompt.includes("Técnica Pomodoro"));
});

test("gera áudio silence WAV estruturado e válido", () => {
  const wav = generateSilenceWav(1, 16000);
  assert.ok(Buffer.isBuffer(wav));
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.subarray(12, 16).toString(), "fmt ");
  assert.equal(wav.readUInt32LE(24), 16000); // Sample rate
  assert.equal(wav.subarray(36, 40).toString(), "data");
  assert.ok(wav.length > 44);
});

test("concatena trechos WAV preservando formato e ordem", () => {
  const first = generateSilenceWav(1, 16000);
  const second = generateSilenceWav(2, 16000);
  const joined = concatenateWavBuffers([first, second]);
  assert.equal(joined.subarray(0, 4).toString(), "RIFF");
  assert.equal(joined.subarray(8, 12).toString(), "WAVE");
  assert.equal(joined.readUInt32LE(40), first.readUInt32LE(40) + second.readUInt32LE(40));
  assert.equal(joined.length, 44 + first.readUInt32LE(40) + second.readUInt32LE(40));
});

test("não confunde o modelo MAI-Thinking-1 do menu com geração de áudio", () => {
  assert.equal(
    isAudioGenerationInProgress([], "MAI-Thinking-1\nText-to-speech made natural"),
    false,
  );
  assert.equal(isAudioGenerationInProgress(["Stop generation"], ""), true);
  assert.equal(isAudioGenerationInProgress([], "Generating audio"), true);
});

test("identifica o WAV entregue pelo Playground mesmo sem elemento audio", () => {
  const url = "https://playground.microsoft.ai/api/artifacts/user/conversation/response/audio.wav";
  assert.equal(
    latestArtifactAudioUrl(["https://playground.microsoft.ai/api/chat/stream", url]),
    url,
  );
  assert.equal(
    latestArtifactAudioUrl(["https://playground.microsoft.ai/model-assets/voice.json"]),
    "",
  );
});

test("mock de TTS gera arquivo de áudio e artifact válido sem abrir navegador", async () => {
  const workDir = join(tmpdir(), `mai-test-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const services = {
    signal: new AbortController().signal,
    getOutputPath(name) {
      return join(workDir, name);
    },
    getWorkspacePath(...parts) {
      return join(workDir, ...parts);
    },
  };

  const request = {
    executionId: "exec-test-01",
    blockId: "block-tts-01",
    capabilityId: "generate-voice-in-browser",
    settings: {
      diagnosticMockResponse: "Narração de teste automatizado.",
    },
    inputs: {
      text: "Texto para sintetizar em áudio.",
    },
    configuration: {
      model: "mai-voice-2",
      voice: "Caio",
      style: "Neutral",
    },
  };

  const response = await execute(request, services);
  assert.equal(response.status, "success");
  assert.ok(response.values?.audio);
  assert.equal(response.values.audio.mimeType, "audio/wav");
  assert.equal(response.values.transcript, "Narração de teste automatizado.");
  assert.ok(response.artifacts?.length === 1);
  assert.equal(response.artifacts[0].mimeType, "audio/wav");

  const written = await readFile(join(workDir, response.values.audio.name));
  assert.equal(written.subarray(0, 4).toString(), "RIFF");

  await rm(workDir, { recursive: true, force: true });
});

test("mock de texto responde deterministicamente", async () => {
  const services = {
    signal: new AbortController().signal,
    getOutputPath(name) {
      return name;
    },
    getWorkspacePath(...parts) {
      return parts.join("/");
    },
  };

  const request = {
    executionId: "exec-test-02",
    blockId: "block-text-01",
    capabilityId: "generate-text-in-browser",
    settings: {
      diagnosticMockResponse: "Resposta textual de teste.",
    },
    inputs: {
      content: "Pergunta de teste",
    },
  };

  const response = await execute(request, services);
  assert.equal(response.status, "success");
  assert.equal(response.values?.result, "Resposta textual de teste.");
  assert.deepEqual(response.values?.parts, ["Resposta textual de teste."]);
});

test("rejeita execução real se o perfil não estiver preparado", async () => {
  const workDir = join(tmpdir(), `mai-unprepared-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const services = {
    signal: new AbortController().signal,
    getOutputPath(name) {
      return join(workDir, name);
    },
    getWorkspacePath(...parts) {
      return join(workDir, ...parts);
    },
  };

  const request = {
    executionId: "exec-test-03",
    blockId: "block-tts-02",
    capabilityId: "generate-voice-in-browser",
    settings: {
      diagnosticMockResponse: "",
    },
    inputs: {
      text: "Texto real.",
    },
    configuration: {
      accountProfile: "unprepared_account",
    },
  };

  const response = await execute(request, services);
  assert.equal(response.status, "error");
  assert.equal(response.code, "AUTHENTICATION_FAILED");
  assert.ok(response.message.includes("use 'Salvar perfil'"));

  await rm(workDir, { recursive: true, force: true });
});

test("informa status não preparado em invocation.mode = configure", async () => {
  const workDir = join(tmpdir(), `mai-status-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const services = {
    signal: new AbortController().signal,
    getOutputPath(name) {
      return join(workDir, name);
    },
    getWorkspacePath(...parts) {
      return join(workDir, ...parts);
    },
  };

  const request = {
    invocation: { mode: "configure", action: "status" },
    configuration: {
      accountProfile: "nova_conta",
    },
  };

  const response = await execute(request, services);
  assert.equal(response.status, "success");
  assert.equal(response.values?.ready, false);

  await rm(workDir, { recursive: true, force: true });
});
