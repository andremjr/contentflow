import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "./handler.mjs";

if (!process.env.ELEVENLABS_API_KEY)
  throw new Error("Defina ELEVENLABS_API_KEY para executar o smoke test real.");
const root = await mkdtemp(join(tmpdir(), "elevenlabs-real-"));
const sourceFiles = new Map();
const services = {
  signal: new AbortController().signal,
  getSecret: async () => process.env.ELEVENLABS_API_KEY,
  getWorkspacePath: (name) => join(root, "workspace", name),
  getOutputPath: (name) => join(root, "output", name),
  resolveInputFile: async (file) => sourceFiles.get(file.id),
};
let sequence = 0;
function request(capabilityId, inputs = {}, configuration = {}) {
  sequence += 1;
  return {
    executionId: `real-${sequence}`,
    traceId: `trace-${sequence}`,
    blockId: `block-${sequence}`,
    capabilityId,
    attempt: 1,
    invocation: { mode: "start", attempt: 1 },
    inputs,
    configuration,
    settings: {
      requestTimeoutMs: 600000,
      maxInputBytes: 100 * 1024 * 1024,
      maxOutputBytes: 100 * 1024 * 1024,
    },
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "real", name: "Real", language: "pt-BR", niche: "" },
      project: { id: "real", title: "Smoke" },
      processType: "narration",
      block: {
        type: capabilityId === "list-voices" ? "BUSCAR" : "CRIAR",
        name: "Smoke",
        instructions: "",
      },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}
function success(result, label) {
  if (result.status !== "success") throw new Error(`${label}: ${result.code} — ${result.message}`);
  return result;
}

try {
  const voices = success(
    await execute(
      request("list-voices", {}, { page_size: 5, voice_type: "all", category: "all" }),
      services,
    ),
    "Vozes",
  );
  if (!voices.values.voices.length) throw new Error("Nenhuma voz disponível.");
  const voiceId = voices.values.voices[0].voice_id;
  console.log(`voices: ok (${voices.values.voices.length})`);

  const speech = success(
    await execute(
      request(
        "text-to-speech",
        { text: "Olá. Este é um teste curto do ContentFlow OS." },
        {
          voice_id: voiceId,
          model_id: "eleven_multilingual_v2",
          output_format: "mp3_44100_128",
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          language_code: "",
        },
      ),
      services,
    ),
    "Narração",
  );
  const speechPath = join(root, "output", speech.values.audio.name);
  console.log(`speech: ok (${(await stat(speechPath)).size} bytes)`);

  const stored = {
    id: "generated-speech",
    name: speech.values.audio.name,
    mimeType: speech.values.audio.mimeType,
    size: speech.values.audio.size,
    url: "artifact://generated-speech",
  };
  sourceFiles.set(stored.id, speechPath);
  const transcript = success(
    await execute(
      request(
        "transcribe-media",
        { media: stored },
        {
          model_id: "scribe_v2",
          language_code: "pt",
          tag_audio_events: true,
          diarize: true,
          num_speakers: 1,
          timestamps_granularity: "word",
        },
      ),
      services,
    ),
    "Transcrição",
  );
  console.log(`transcription: ok (${transcript.values.transcript.length} chars)`);

  const effect = success(
    await execute(
      request(
        "generate-sound-effect",
        { description: "Um clique digital curto e suave" },
        {
          model_id: "eleven_text_to_sound_v2",
          duration_seconds: 0.5,
          prompt_influence: 0.3,
          loop: false,
          output_format: "mp3_44100_128",
        },
      ),
      services,
    ),
    "Efeito",
  );
  console.log(`sound effect: ok (${effect.values.audio.size} bytes)`);

  const music = await execute(
    request(
      "compose-music",
      { prompt: "Short neutral instrumental percussion sting, no vocals, original and minimal" },
      {
        model_id: "music_v2",
        music_length_seconds: 3,
        force_instrumental: true,
        output_format: "mp3_44100_128",
        sign_with_c2pa: false,
      },
    ),
    services,
  );
  if (music.status === "success") console.log(`music: ok (${music.values.audio.size} bytes)`);
  else if (["PERMISSION_DENIED", "QUOTA_EXCEEDED"].includes(music.code))
    console.log(`music: unavailable on this account (${music.code})`);
  else throw new Error(`Música: ${music.code} — ${music.message}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
