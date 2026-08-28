import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname } from "node:path";

const API_ORIGIN = "https://api.elevenlabs.io";
const SECRET_NAME = "ELEVENLABS_API_KEY";
const MAX_JSON_BYTES = 10 * 1024 * 1024;

class PluginFailure extends Error {
  constructor(code, message, retryable = false, retryAfterMs) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function cleanText(value, maximum = 500) {
  return String(value ?? "")
    .replace(/[\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function collectText(value, output = []) {
  if (typeof value === "string" || typeof value === "number") output.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => collectText(item, output));
  else if (value && typeof value === "object" && Object.hasOwn(value, "value"))
    collectText(value.value, output);
  return output;
}

function inputText(value, label, maximum) {
  const result = collectText(value)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maximum);
  if (!result) throw new PluginFailure("INVALID_INPUT", `Informe ${label}.`);
  return result;
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function timeoutMs(request) {
  return Math.trunc(clamp(request.settings?.requestTimeoutMs, 5000, 600000, 180000));
}

function combinedSignal(signal, duration) {
  const timeout = AbortSignal.timeout(duration);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function apiKey(services) {
  const value = cleanText(await services.getSecret(SECRET_NAME), 1000);
  if (!value)
    throw new PluginFailure(
      "AUTHENTICATION_FAILED",
      "Conecte uma chave da ElevenLabs na Central de Plugins.",
    );
  return value;
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(1000, seconds * 1000) : undefined;
}

async function responseFailure(response) {
  let detail = "";
  try {
    const content = (await response.text()).slice(0, 50_000);
    const parsed = JSON.parse(content);
    detail = cleanText(parsed.detail?.message || parsed.detail || parsed.message, 300);
  } catch {}
  if (response.status === 401)
    return new PluginFailure("AUTHENTICATION_FAILED", "A ElevenLabs recusou a chave configurada.");
  if (response.status === 402)
    return new PluginFailure(
      "QUOTA_EXCEEDED",
      detail || "A conta ElevenLabs não possui créditos ou plano suficiente para esta geração.",
    );
  if (response.status === 403)
    return new PluginFailure(
      "PERMISSION_DENIED",
      detail || "A conta ElevenLabs não possui acesso a esta capacidade.",
    );
  if (response.status === 404)
    return new PluginFailure(
      "NOT_FOUND",
      detail || "O recurso solicitado não foi encontrado na ElevenLabs.",
    );
  if (response.status === 422)
    return new PluginFailure(
      "INVALID_INPUT",
      detail || "A ElevenLabs recusou os parâmetros enviados.",
    );
  if (response.status === 429)
    return new PluginFailure(
      "RATE_LIMIT",
      "A ElevenLabs aplicou um limite temporário.",
      true,
      retryAfterMs(response),
    );
  if (response.status >= 500)
    return new PluginFailure(
      "UPSTREAM_UNAVAILABLE",
      "A ElevenLabs está temporariamente indisponível.",
      true,
    );
  return new PluginFailure(
    "UPSTREAM_ERROR",
    detail || `A ElevenLabs recusou a solicitação (HTTP ${response.status}).`,
  );
}

async function apiFetch(path, init, request, services) {
  const key = await apiKey(services);
  let response;
  try {
    response = await fetch(new URL(path, API_ORIGIN), {
      ...init,
      redirect: "error",
      headers: { "xi-api-key": key, ...(init.headers ?? {}) },
      signal: combinedSignal(services.signal, timeoutMs(request)),
    });
  } catch (error) {
    if (services.signal?.aborted) throw new PluginFailure("CANCELLED", "A execução foi cancelada.");
    if (error instanceof PluginFailure) throw error;
    throw new PluginFailure(
      "TIMEOUT",
      "A ElevenLabs não respondeu dentro do tempo configurado.",
      true,
    );
  }
  if (!response.ok) throw await responseFailure(response);
  return response;
}

async function jsonResponse(path, init, request, services) {
  const response = await apiFetch(path, init, request, services);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES)
    throw new PluginFailure("OUTPUT_VALIDATION_FAILED", "A resposta JSON excedeu o limite seguro.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES)
    throw new PluginFailure("OUTPUT_VALIDATION_FAILED", "A resposta JSON excedeu o limite seguro.");
  try {
    return JSON.parse(text);
  } catch {
    throw new PluginFailure("OUTPUT_VALIDATION_FAILED", "A ElevenLabs retornou JSON inválido.");
  }
}

function fingerprint(request, payload) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        executionId: request.executionId,
        blockId: request.blockId,
        capabilityId: request.capabilityId,
        attempt: request.attempt ?? request.invocation?.attempt ?? 1,
        payload,
      }),
    )
    .digest("hex");
}

function mimeFromFormat(format) {
  if (String(format).startsWith("mp3_")) return "audio/mpeg";
  if (String(format).startsWith("wav_")) return "audio/wav";
  if (String(format).startsWith("opus_")) return "audio/ogg";
  return "audio/mpeg";
}

function extensionFromMime(mimeType) {
  return mimeType === "audio/wav" ? ".wav" : mimeType === "audio/ogg" ? ".ogg" : ".mp3";
}

function validAudio(bytes, mimeType) {
  if (mimeType === "audio/mpeg") {
    return (
      bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }
  if (mimeType === "audio/wav")
    return (
      bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
    );
  if (mimeType === "audio/ogg") return bytes.subarray(0, 4).toString() === "OggS";
  return false;
}

async function binaryResponse(path, init, request, services, expectedMime) {
  const response = await apiFetch(path, init, request, services);
  const maximum = Math.trunc(
    clamp(request.settings?.maxOutputBytes, 1048576, 209715200, 104857600),
  );
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximum)
    throw new PluginFailure("OUTPUT_TOO_LARGE", "O áudio gerado excede o limite configurado.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maximum)
    throw new PluginFailure(
      "OUTPUT_TOO_LARGE",
      "O áudio gerado está vazio ou excede o limite configurado.",
    );
  const responseMime = cleanText(
    response.headers.get("content-type")?.split(";")[0],
    100,
  ).toLowerCase();
  const mimeType = responseMime.startsWith("audio/") ? responseMime : expectedMime;
  if (!validAudio(bytes, mimeType))
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "O arquivo retornado não corresponde ao formato de áudio declarado.",
    );
  return {
    bytes,
    mimeType,
    characterCost: Number(response.headers.get("character-cost") || 0) || undefined,
    requestId: cleanText(response.headers.get("request-id"), 200),
    songId: cleanText(response.headers.get("song-id"), 200),
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, value);
  await rename(temporary, path);
}

function artifactIdentity(request, payload, label) {
  const hash = fingerprint(request, payload).slice(0, 20);
  return { id: `elevenlabs-${label}-${hash}`, hash };
}

async function materializeAudio(request, services, payload, label, producer) {
  const identity = artifactIdentity(request, payload, label);
  const cacheBase = `cache/${request.capabilityId}/${identity.hash}`;
  const metadataPath = services.getWorkspacePath(`${cacheBase}.json`);
  const bytesPath = services.getWorkspacePath(`${cacheBase}.bin`);
  let generated;
  if ((await pathExists(metadataPath)) && (await pathExists(bytesPath))) {
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      const info = await stat(bytesPath);
      generated = {
        bytes: undefined,
        mimeType: metadata.mimeType,
        size: info.size,
        metadata: metadata.metadata,
        usage: metadata.usage,
      };
    } catch {}
  }
  if (!generated) {
    const result = await producer();
    const metadata = {
      provider: "ElevenLabs",
      capability: request.capabilityId,
      model_id: cleanText(payload.model_id, 100),
      character_cost: result.characterCost ?? 0,
      request_id: result.requestId || "",
      external_id: result.songId || "",
      cached: false,
    };
    const usage = result.characterCost
      ? { provider: "ElevenLabs", inputUnits: result.characterCost, unit: "credits" }
      : { provider: "ElevenLabs", outputUnits: result.bytes.length, unit: "bytes" };
    await atomicWrite(bytesPath, result.bytes);
    await atomicWrite(metadataPath, JSON.stringify({ mimeType: result.mimeType, metadata, usage }));
    generated = {
      bytes: result.bytes,
      mimeType: result.mimeType,
      size: result.bytes.length,
      metadata,
      usage,
    };
  } else {
    generated.metadata = { ...generated.metadata, cached: true };
  }
  const name = `${identity.id}${extensionFromMime(generated.mimeType)}`;
  const outputPath = services.getOutputPath(name);
  await mkdir(dirname(outputPath), { recursive: true });
  if (generated.bytes) await writeFile(outputPath, generated.bytes);
  else await copyFile(bytesPath, outputPath);
  const audio = {
    id: identity.id,
    name,
    mimeType: generated.mimeType,
    size: generated.size,
    url: `artifact://${identity.id}`,
  };
  return {
    status: "success",
    values: { audio, metadata: [generated.metadata] },
    artifacts: [
      {
        id: identity.id,
        name,
        mimeType: generated.mimeType,
        size: generated.size,
        source: { kind: "path", path: name },
      },
    ],
    usage: generated.usage,
  };
}

function diagnosticAudio(request, services, label) {
  const bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(125, 0)]);
  const payload = { diagnostic: true, label };
  return materializeAudio(request, services, payload, label, async () => ({
    bytes,
    mimeType: "audio/mpeg",
  }));
}

async function listVoices(request, services) {
  if (request.settings?.diagnosticFixture) {
    return {
      status: "success",
      values: {
        voices: [
          {
            voice_id: "fixture-voice",
            name: "Voz de diagnóstico",
            category: "premade",
            gender: "",
            age: "",
            accent: "",
            language: "pt",
            use_case: "narration",
            description: "Somente teste",
            preview_url: "",
          },
        ],
      },
      usage: { provider: "diagnostic", outputUnits: 1, unit: "items" },
    };
  }
  const configuration = request.configuration ?? {};
  const requestedType = cleanText(configuration.voice_type || "all", 30);
  const useAccessibleVoices = requestedType === "all" || requestedType === "default";
  const url = new URL(useAccessibleVoices ? "/v1/voices" : "/v2/voices", API_ORIGIN);
  if (!useAccessibleVoices) {
    url.searchParams.set(
      "page_size",
      String(Math.trunc(clamp(configuration.page_size, 1, 100, 25))),
    );
    url.searchParams.set("include_total_count", "false");
  }
  const search = cleanText(configuration.search, 100);
  if (!useAccessibleVoices && search) url.searchParams.set("search", search);
  if (!useAccessibleVoices) url.searchParams.set("voice_type", requestedType);
  if (!useAccessibleVoices && configuration.category && configuration.category !== "all")
    url.searchParams.set("category", configuration.category);
  const data = await jsonResponse(`${url.pathname}${url.search}`, {}, request, services);
  const maximum = Math.trunc(clamp(configuration.page_size, 1, 100, 25));
  const category = cleanText(configuration.category || "all", 30);
  const voices = (Array.isArray(data.voices) ? data.voices : [])
    .filter(
      (voice) =>
        !search ||
        `${voice.name ?? ""} ${voice.description ?? ""} ${Object.values(voice.labels ?? {}).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .filter((voice) => category === "all" || voice.category === category)
    .slice(0, maximum)
    .map((voice) => ({
      voice_id: cleanText(voice.voice_id, 100),
      name: cleanText(voice.name, 200),
      category: cleanText(voice.category, 100),
      gender: cleanText(voice.labels?.gender, 100),
      age: cleanText(voice.labels?.age, 100),
      accent: cleanText(voice.labels?.accent, 100),
      language: cleanText(voice.labels?.language, 100),
      use_case: cleanText(voice.labels?.use_case, 200),
      description: cleanText(voice.description, 500),
      preview_url: cleanText(voice.preview_url, 2000),
    }))
    .filter((voice) => voice.voice_id);
  return {
    status: "success",
    values: { voices },
    usage: { provider: "ElevenLabs", outputUnits: voices.length, unit: "items" },
  };
}

async function textToSpeech(request, services) {
  if (request.settings?.diagnosticFixture) return diagnosticAudio(request, services, "speech");
  const text = inputText(request.inputs?.text, "o texto para narrar", 40000);
  const configuration = request.configuration ?? {};
  const voiceId = cleanText(configuration.voice_id || "JBFqnCBsd6RMkjVDRZzb", 100);
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(voiceId))
    throw new PluginFailure("INVALID_CONFIGURATION", "O ID da voz é inválido.");
  const outputFormat = cleanText(configuration.output_format || "mp3_44100_128", 50);
  const payload = {
    text,
    model_id: cleanText(configuration.model_id || "eleven_multilingual_v2", 100),
    voice_settings: {
      stability: clamp(configuration.stability, 0, 1, 0.5),
      similarity_boost: clamp(configuration.similarity_boost, 0, 1, 0.75),
      style: clamp(configuration.style, 0, 1, 0),
      use_speaker_boost: configuration.use_speaker_boost !== false,
    },
    ...(cleanText(configuration.language_code, 10)
      ? { language_code: cleanText(configuration.language_code, 10) }
      : {}),
  };
  return materializeAudio(
    request,
    services,
    { ...payload, voice_id: voiceId, output_format: outputFormat },
    "speech",
    async () =>
      binaryResponse(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        request,
        services,
        mimeFromFormat(outputFormat),
      ),
  );
}

async function soundEffect(request, services) {
  if (request.settings?.diagnosticFixture)
    return diagnosticAudio(request, services, "sound-effect");
  const description = inputText(request.inputs?.description, "a descrição do efeito sonoro", 450);
  const configuration = request.configuration ?? {};
  const outputFormat = cleanText(configuration.output_format || "mp3_44100_128", 50);
  const duration = clamp(configuration.duration_seconds, 0, 30, 0);
  const payload = {
    text: description,
    model_id: "eleven_text_to_sound_v2",
    loop: configuration.loop === true,
    prompt_influence: clamp(configuration.prompt_influence, 0, 1, 0.3),
    ...(duration >= 0.5 ? { duration_seconds: duration } : {}),
  };
  return materializeAudio(
    request,
    services,
    { ...payload, output_format: outputFormat },
    "sound-effect",
    async () =>
      binaryResponse(
        `/v1/sound-generation?output_format=${encodeURIComponent(outputFormat)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        request,
        services,
        mimeFromFormat(outputFormat),
      ),
  );
}

async function composeMusic(request, services) {
  if (request.settings?.diagnosticFixture) return diagnosticAudio(request, services, "music");
  const prompt = inputText(request.inputs?.prompt, "a descrição da música", 4100);
  const configuration = request.configuration ?? {};
  const outputFormat = cleanText(configuration.output_format || "mp3_44100_128", 50);
  const payload = {
    prompt,
    music_length_ms: Math.trunc(clamp(configuration.music_length_seconds, 3, 600, 30) * 1000),
    model_id: cleanText(configuration.model_id || "music_v2", 50),
    force_instrumental: configuration.force_instrumental !== false,
    sign_with_c2pa: configuration.sign_with_c2pa === true,
  };
  return materializeAudio(
    request,
    services,
    { ...payload, output_format: outputFormat },
    "music",
    async () =>
      binaryResponse(
        `/v1/music?output_format=${encodeURIComponent(outputFormat)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        request,
        services,
        mimeFromFormat(outputFormat),
      ),
  );
}

function storedFile(value) {
  const file = Array.isArray(value) ? value[0] : value;
  if (!file || typeof file !== "object")
    throw new PluginFailure("INVALID_INPUT", "Informe um arquivo de áudio ou vídeo.");
  const size = Number(file.size) || 0;
  const mimeType = cleanText(file.mimeType, 100).toLowerCase();
  if (size <= 0) throw new PluginFailure("INVALID_INPUT", "O arquivo de mídia está vazio.");
  if (
    !mimeType.startsWith("audio/") &&
    !mimeType.startsWith("video/") &&
    mimeType !== "application/octet-stream"
  ) {
    throw new PluginFailure("INVALID_INPUT", "O arquivo precisa ser áudio ou vídeo.");
  }
  return file;
}

async function transcribe(request, services) {
  if (request.settings?.diagnosticFixture) {
    return {
      status: "success",
      values: {
        transcript: "Transcrição de diagnóstico.",
        segments: [
          { text: "Transcrição", start: 0, end: 0.5, type: "word", speaker_id: "speaker_0" },
        ],
        metadata: [{ language_code: "pt", language_probability: 1, cached: false }],
      },
      usage: { provider: "diagnostic", outputUnits: 1, unit: "items" },
    };
  }
  const file = storedFile(request.inputs?.media);
  const maximum = Math.trunc(clamp(request.settings?.maxInputBytes, 1048576, 524288000, 104857600));
  if (Number(file.size) > maximum)
    throw new PluginFailure(
      "INVALID_INPUT",
      "O arquivo excede o limite configurado para transcrição.",
    );
  const configuration = request.configuration ?? {};
  const payloadKey = {
    file_id: cleanText(file.id, 200),
    file_name: cleanText(file.name, 300),
    file_size: Number(file.size),
    model_id: cleanText(configuration.model_id || "scribe_v2", 50),
    language_code: cleanText(configuration.language_code, 10),
    tag_audio_events: configuration.tag_audio_events !== false,
    diarize: configuration.diarize !== false,
    num_speakers: Math.trunc(clamp(configuration.num_speakers, 0, 32, 0)),
    timestamps_granularity:
      configuration.timestamps_granularity === "character" ? "character" : "word",
  };
  const hash = fingerprint(request, payloadKey).slice(0, 24);
  const cachePath = services.getWorkspacePath(`cache/transcriptions/${hash}.json`);
  if (await pathExists(cachePath)) {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8"));
      cached.values.metadata = cached.values.metadata.map((item) => ({ ...item, cached: true }));
      return cached;
    } catch {}
  }
  const sourcePath = await services.resolveInputFile(file);
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.size !== Number(file.size) || sourceInfo.size > maximum)
    throw new PluginFailure(
      "INVALID_INPUT",
      "O arquivo resolvido não corresponde à entrada autorizada.",
    );
  const bytes = await readFile(sourcePath);
  const form = new FormData();
  form.set(
    "file",
    new Blob([bytes], { type: cleanText(file.mimeType, 100) || "application/octet-stream" }),
    basename(cleanText(file.name, 255) || "media.bin"),
  );
  form.set("model_id", payloadKey.model_id);
  if (payloadKey.language_code) form.set("language_code", payloadKey.language_code);
  form.set("tag_audio_events", String(payloadKey.tag_audio_events));
  form.set("diarize", String(payloadKey.diarize));
  if (payloadKey.num_speakers > 0) form.set("num_speakers", String(payloadKey.num_speakers));
  form.set("timestamps_granularity", payloadKey.timestamps_granularity);
  const data = await jsonResponse(
    "/v1/speech-to-text",
    { method: "POST", body: form },
    request,
    services,
  );
  const transcript = cleanText(data.text, 2_000_000);
  if (!transcript)
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "A ElevenLabs não retornou texto para a transcrição.",
    );
  const segments = (Array.isArray(data.words) ? data.words : []).slice(0, 100_000).map((word) => ({
    text: cleanText(word.text, 500),
    start: Number(word.start) || 0,
    end: Number(word.end) || 0,
    type: cleanText(word.type, 50),
    speaker_id: cleanText(word.speaker_id, 100),
  }));
  const result = {
    status: "success",
    values: {
      transcript,
      segments,
      metadata: [
        {
          language_code: cleanText(data.language_code, 20),
          language_probability: Number(data.language_probability) || 0,
          cached: false,
        },
      ],
    },
    usage: { provider: "ElevenLabs", inputUnits: sourceInfo.size, unit: "bytes" },
  };
  await atomicWrite(cachePath, JSON.stringify(result));
  return result;
}

function errorResponse(error) {
  if (error instanceof PluginFailure)
    return {
      status: "error",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  return {
    status: "error",
    code: "INTERNAL_ERROR",
    message: "O plugin oficial ElevenLabs encontrou uma falha interna.",
    retryable: false,
  };
}

export async function execute(request, services) {
  try {
    if (services.signal?.aborted) throw new PluginFailure("CANCELLED", "A execução foi cancelada.");
    if (request.capabilityId === "list-voices") return await listVoices(request, services);
    if (request.capabilityId === "text-to-speech") return await textToSpeech(request, services);
    if (request.capabilityId === "generate-sound-effect")
      return await soundEffect(request, services);
    if (request.capabilityId === "transcribe-media") return await transcribe(request, services);
    if (request.capabilityId === "compose-music") return await composeMusic(request, services);
    throw new PluginFailure(
      "NOT_SUPPORTED",
      "Capacidade não suportada pelo plugin oficial ElevenLabs.",
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export const __test = Object.freeze({
  cleanText,
  collectText,
  inputText,
  validAudio,
  storedFile,
  fingerprint,
  mimeFromFormat,
});
