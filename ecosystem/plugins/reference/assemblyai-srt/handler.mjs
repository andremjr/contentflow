import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, readFile, rename, stat, writeFile } from "node:fs/promises";

const CAPABILITY_ID = "transcribe-to-srt";
const SECRET_NAME = "ASSEMBLYAI_API_KEYS";
const MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mp3", ".wav"]);
const SENTENCE_END_REGEX = /[.!?]+(?:["')\]]+)?$/;
const MAX_MEDIA_FILES = 100;
const MAX_MEDIA_BYTES = 2_200_000_000;
const MAX_PROVIDER_RESPONSE_BYTES = 100 * 1024 * 1024;
const API_TIMEOUT_MS = 110_000;
const POLL_AFTER_MS = 3_000;
const CONFIG_DEFAULTS = Object.freeze({
  region: "us",
  segmentationMode: "sentence",
  maxWordsPerCue: 12,
  maxSecondsPerCue: 6,
  targetCueCount: 200,
});

class PluginFailure extends Error {
  constructor(code, message, retryable = false, retryAfterMs) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

class ProviderFailure extends Error {
  constructor(status, message, retryAfterMs) {
    super(message);
    this.name = "ProviderFailure";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeMessage(value, fallback = "Falha sem detalhes retornados pelo provedor.") {
  const result = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (result || fallback).slice(0, 500);
}

function errorResponse(error) {
  if (error instanceof PluginFailure) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  }
  if (error instanceof ProviderFailure) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "error",
        code: "AUTHENTICATION_FAILED",
        message: "A AssemblyAI recusou a credencial usada para consultar a transcrição.",
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        status: "error",
        code: "RATE_LIMIT",
        message: "A AssemblyAI aplicou um limite temporário à consulta da transcrição.",
        retryable: true,
        ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    }
    return {
      status: "error",
      code: error.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "JOB_FAILED",
      message: "A AssemblyAI recusou a consulta da transcrição em andamento.",
      retryable: error.status >= 500,
    };
  }
  return {
    status: "error",
    code: "JOB_FAILED",
    message: "A transcrição falhou antes de produzir arquivos SRT válidos.",
    retryable: false,
  };
}

function requireNumber(value, key, { integer = false, minimum, maximum }) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      `O parâmetro ${key} precisa estar entre ${minimum} e ${maximum}.`,
    );
  }
  return value;
}

function validateConfiguration(value) {
  const configuration = value ?? {};
  if (!isPlainObject(configuration)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "A configuração precisa ser um objeto.");
  }
  const known = new Set(Object.keys(CONFIG_DEFAULTS));
  const unknown = Object.keys(configuration).find((key) => !known.has(key));
  if (unknown) {
    throw new PluginFailure("INVALID_CONFIGURATION", `O parâmetro ${unknown} não é reconhecido.`);
  }
  const region = configuration.region ?? CONFIG_DEFAULTS.region;
  if (!new Set(["us", "eu"]).has(region)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "A região precisa ser us ou eu.");
  }
  const segmentationMode = configuration.segmentationMode ?? CONFIG_DEFAULTS.segmentationMode;
  if (
    !new Set(["sentence", "max_words", "max_duration", "combined_limits", "target_cues"]).has(
      segmentationMode,
    )
  ) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O modo de divisão do SRT é inválido.");
  }
  return {
    region,
    segmentationMode,
    maxWordsPerCue: requireNumber(
      configuration.maxWordsPerCue ?? CONFIG_DEFAULTS.maxWordsPerCue,
      "maxWordsPerCue",
      { integer: true, minimum: 1, maximum: 100 },
    ),
    maxSecondsPerCue: requireNumber(
      configuration.maxSecondsPerCue ?? CONFIG_DEFAULTS.maxSecondsPerCue,
      "maxSecondsPerCue",
      { minimum: 0.25, maximum: 60 },
    ),
    targetCueCount: requireNumber(
      configuration.targetCueCount ?? CONFIG_DEFAULTS.targetCueCount,
      "targetCueCount",
      { integer: true, minimum: 1, maximum: 10_000 },
    ),
  };
}

function validateSettings(settings) {
  if (!isPlainObject(settings ?? {}) || Object.keys(settings ?? {}).length) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Este plugin não possui configurações locais adicionais.",
    );
  }
}

function safeLeaf(value) {
  return (
    String(value || "media")
      .split(/[\\/]/)
      .at(-1) || "media"
  ).replace(/[\u0000-\u001f\u007f]/g, "");
}

function extensionOf(name) {
  const leaf = safeLeaf(name).toLowerCase();
  const dot = leaf.lastIndexOf(".");
  return dot >= 0 ? leaf.slice(dot) : "";
}

function safeStem(value) {
  const leaf = safeLeaf(value);
  const dot = leaf.lastIndexOf(".");
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  return (
    stem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "media"
  );
}

function normalizeMediaInput(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  if (!items.length || items.length > MAX_MEDIA_FILES) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `A entrada media_files precisa conter de 1 a ${MAX_MEDIA_FILES} arquivos.`,
    );
  }
  return items.map((item, index) => {
    if (
      !isPlainObject(item) ||
      typeof item.url !== "string" ||
      typeof item.name !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.size !== "number" ||
      !Number.isFinite(item.size) ||
      item.size <= 0 ||
      item.size > MAX_MEDIA_BYTES ||
      !MEDIA_EXTENSIONS.has(extensionOf(item.name))
    ) {
      throw new PluginFailure(
        "INVALID_INPUT",
        `O item ${index + 1} precisa ser MP4, MOV, MKV, AVI, WEBM, M4V, MP3 ou WAV e ter até 2,2 GB.`,
      );
    }
    return item;
  });
}

function parseApiKeys(value) {
  const keys = String(value ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!keys.length) {
    throw new PluginFailure(
      "AUTHENTICATION_FAILED",
      `Configure ${SECRET_NAME} na página de Plugins. Separe várias chaves por vírgula ou espaço.`,
    );
  }
  return keys;
}

function pythonRound(value) {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const lower = Math.floor(absolute);
  const fraction = absolute - lower;
  if (fraction < 0.5) return sign * lower;
  if (fraction > 0.5) return sign * (lower + 1);
  return sign * (lower % 2 === 0 ? lower : lower + 1);
}

export function formatSrtTime(milliseconds) {
  const total = Math.max(0, pythonRound(Number(milliseconds)));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const remainder = total % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export function isSentenceEnd(text) {
  return SENTENCE_END_REGEX.test(String(text ?? "").trim());
}

function validateWords(value) {
  if (!Array.isArray(value) || !value.length) return [];
  const words = [];
  for (const item of value) {
    if (
      !isPlainObject(item) ||
      typeof item.text !== "string" ||
      !Number.isFinite(item.start) ||
      !Number.isFinite(item.end) ||
      item.end < item.start
    ) {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        "A AssemblyAI concluiu, mas devolveu timestamps de palavras inválidos.",
      );
    }
    words.push({ text: item.text, start: item.start, end: item.end });
  }
  return words;
}

function sentenceSegments(words) {
  const segments = [];
  let current = [];
  words.forEach((word, index) => {
    current.push(word);
    if (isSentenceEnd(word.text) || index === words.length - 1) {
      segments.push(current);
      current = [];
    }
  });
  return segments;
}

function maximumSegments(words, configuration) {
  const segments = [];
  let current = [];
  const usesWords = new Set(["max_words", "combined_limits"]).has(configuration.segmentationMode);
  const usesDuration = new Set(["max_duration", "combined_limits"]).has(
    configuration.segmentationMode,
  );
  for (const word of words) {
    const wouldExceedWords = usesWords && current.length >= configuration.maxWordsPerCue;
    const wouldExceedDuration =
      usesDuration &&
      current.length > 0 &&
      word.end - current[0].start > configuration.maxSecondsPerCue * 1_000;
    if (wouldExceedWords || wouldExceedDuration) {
      segments.push(current);
      current = [];
    }
    current.push(word);
    if (configuration.segmentationMode === "combined_limits" && isSentenceEnd(word.text)) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function targetSegments(words, requestedCount) {
  const count = Math.min(requestedCount, words.length);
  if (count <= 1) return [words];
  const segments = [];
  const timelineStart = words[0].start;
  const timelineSpan = Math.max(1, words.at(-1).end - timelineStart);
  let startIndex = 0;
  for (let cue = 1; cue < count; cue += 1) {
    const idealEnd = timelineStart + (timelineSpan * cue) / count;
    const maximumEndIndex = words.length - (count - cue) - 1;
    let bestIndex = startIndex;
    let bestDistance = Infinity;
    for (let index = startIndex; index <= maximumEndIndex; index += 1) {
      const distance = Math.abs(words[index].end - idealEnd);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
      if (words[index].end > idealEnd && distance > bestDistance) break;
    }
    segments.push(words.slice(startIndex, bestIndex + 1));
    startIndex = bestIndex + 1;
  }
  segments.push(words.slice(startIndex));
  return segments;
}

export function compileSrt(rawWords, configuration = CONFIG_DEFAULTS) {
  const words = validateWords(rawWords);
  if (!words.length) return "";
  const config = validateConfiguration(configuration);
  let segments;
  if (config.segmentationMode === "sentence") segments = sentenceSegments(words);
  else if (config.segmentationMode === "target_cues")
    segments = targetSegments(words, config.targetCueCount);
  else segments = maximumSegments(words, config);

  const lines = [];
  segments.forEach((segment, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatSrtTime(segment[0].start)} --> ${formatSrtTime(segment.at(-1).end)}`);
    lines.push(segment.map((word) => word.text).join(" "));
    lines.push("");
  });
  return `${lines.join("\n").trim()}\n`;
}

function apiBase(region) {
  return region === "eu" ? "https://api.eu.assemblyai.com" : "https://api.assemblyai.com";
}

function retryAfter(response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1_000) : undefined;
}

async function fetchWithTimeout(url, options, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw new PluginFailure("CANCELLED", "A transcrição foi cancelada.");
    throw new PluginFailure(
      timedOut ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      timedOut
        ? "A AssemblyAI não respondeu dentro do limite."
        : "Não foi possível conectar à AssemblyAI.",
      !timedOut,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function responseJson(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new PluginFailure("OUTPUT_VALIDATION_FAILED", "A resposta da AssemblyAI excedeu 100 MB.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new PluginFailure("OUTPUT_VALIDATION_FAILED", "A resposta da AssemblyAI excedeu 100 MB.");
  }
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "A AssemblyAI devolveu uma resposta JSON inválida.",
    );
  }
  if (!response.ok) {
    throw new ProviderFailure(
      response.status,
      safeMessage(data.error ?? data.message),
      retryAfter(response),
    );
  }
  return data;
}

async function uploadMedia(base, apiKey, sourcePath, signal) {
  const response = await fetchWithTimeout(
    `${base}/v2/upload`,
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/octet-stream" },
      body: createReadStream(sourcePath),
      duplex: "half",
    },
    signal,
  );
  const data = await responseJson(response);
  if (typeof data.upload_url !== "string" || !data.upload_url.startsWith("https://")) {
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "A AssemblyAI não devolveu um upload_url válido.",
    );
  }
  return data.upload_url;
}

async function submitTranscript(base, apiKey, uploadUrl, signal) {
  const response = await fetchWithTimeout(
    `${base}/v2/transcript`,
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: uploadUrl, language_detection: true }),
    },
    signal,
  );
  const data = await responseJson(response);
  if (typeof data.id !== "string" || !data.id) {
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "A AssemblyAI aceitou a requisição, mas não devolveu o ID da transcrição.",
    );
  }
  return data.id;
}

async function getTranscript(base, apiKey, transcriptId, signal) {
  const response = await fetchWithTimeout(
    `${base}/v2/transcript/${encodeURIComponent(transcriptId)}`,
    { headers: { Authorization: apiKey } },
    signal,
  );
  return responseJson(response);
}

function jobIdFor(request) {
  return createHash("sha256")
    .update(
      `${request.executionId}\u0000${request.blockId}\u0000${request.capabilityId}\u0000${request.attempt}`,
    )
    .digest("hex")
    .slice(0, 40);
}

function fingerprintFor(media, configuration) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        media: media.map(({ name, size, mimeType }) => ({ name, size, mimeType })),
        configuration,
      }),
    )
    .digest("hex");
}

async function readState(services, jobId) {
  try {
    const path = services.getWorkspacePath(`jobs/${jobId}.json`);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function saveState(services, state) {
  const finalPath = services.getWorkspacePath(`jobs/${state.jobId}.json`);
  const temporaryPath = services.getWorkspacePath(`jobs/${state.jobId}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(state), "utf8");
  await rename(temporaryPath, finalPath);
}

function pendingResponse(state, message) {
  return {
    status: "pending",
    jobId: state.jobId,
    pollAfterMs: POLL_AFTER_MS,
    progress: Math.min(0.99, state.mediaIndex / state.media.length),
    message,
  };
}

function outputName(media, mediaIndex, allMedia) {
  const stem = safeStem(media.name);
  const duplicate = allMedia.slice(0, mediaIndex).some((item) => safeStem(item.name) === stem);
  return `${stem}${duplicate ? `-${mediaIndex + 1}` : ""}.srt`;
}

function providerAttemptError(error, keyIndex) {
  const detail =
    error instanceof ProviderFailure
      ? error.message
      : error instanceof PluginFailure
        ? error.message
        : "Falha desconhecida.";
  return `chave #${keyIndex + 1}: ${safeMessage(detail)}`;
}

function exhaustedError(state) {
  const details = state.errors.length
    ? state.errors.map((item) => ` - ${item}`).join("\n")
    : " - nenhuma tentativa retornou detalhes.";
  const statuses = state.errorStatuses.filter(Number.isFinite);
  const authenticationOnly =
    statuses.length > 0 && statuses.every((status) => status === 401 || status === 403);
  return new PluginFailure(
    authenticationOnly ? "AUTHENTICATION_FAILED" : "JOB_FAILED",
    `Não foi possível transcrever ${safeLeaf(state.media[state.mediaIndex].name)} com nenhuma chave AssemblyAI.\nTentativas:\n${details}\nRevise credenciais, saldo e limites da conta.`,
    false,
  );
}

async function finalize(state, services) {
  const values = [];
  const artifacts = [];
  for (const result of state.results) {
    const workspacePath = services.getWorkspacePath(result.workspacePath);
    const outputPath = services.getOutputPath(result.name);
    await copyFile(workspacePath, outputPath);
    const info = await stat(outputPath);
    const artifact = {
      id: result.id,
      name: result.name,
      mimeType: "application/x-subrip",
      size: info.size,
    };
    values.push({ ...artifact, url: `artifact://${result.id}` });
    artifacts.push({ ...artifact, source: { kind: "path", path: result.name } });
  }
  return {
    status: "success",
    values: { subtitles: values },
    artifacts,
    logs: [`${values.length} arquivo(s) SRT gerado(s) com rotação circular de chaves.`],
  };
}

async function drive(state, media, keys, configuration, services) {
  const base = apiBase(configuration.region);
  while (true) {
    if (state.mediaIndex >= media.length) return finalize(state, services);
    if (state.keyAttemptOffset >= keys.length) throw exhaustedError(state);

    const keyIndex = (state.nextKeyIndex + state.keyAttemptOffset) % keys.length;
    const apiKey = keys[keyIndex];
    const currentMedia = media[state.mediaIndex];

    if (!state.current) {
      try {
        const sourcePath = await services.resolveInputFile(currentMedia);
        const info = await stat(sourcePath);
        if (info.size !== currentMedia.size || info.size > MAX_MEDIA_BYTES) {
          throw new PluginFailure(
            "INVALID_INPUT",
            "O tamanho da mídia resolvida não corresponde à referência recebida.",
          );
        }
        const uploadUrl = await uploadMedia(base, apiKey, sourcePath, services.signal);
        state.current = { phase: "uploaded", keyIndex, uploadUrl };
        await saveState(services, state);
      } catch (error) {
        if (error instanceof ProviderFailure) {
          state.errors.push(providerAttemptError(error, keyIndex));
          state.errorStatuses.push(error.status);
          state.keyAttemptOffset += 1;
          await saveState(services, state);
          continue;
        }
        throw error;
      }
    }

    if (state.current.phase === "submitting") {
      throw new PluginFailure(
        "TIMEOUT",
        "A confirmação da criação da transcrição foi interrompida e não pode ser repetida com segurança. Reexecute o bloco para iniciar uma nova tentativa.",
        false,
      );
    }

    if (state.current.phase === "uploaded") {
      state.current.phase = "submitting";
      await saveState(services, state);
      try {
        const transcriptId = await submitTranscript(
          base,
          apiKey,
          state.current.uploadUrl,
          services.signal,
        );
        state.current = { phase: "polling", keyIndex, transcriptId };
        await saveState(services, state);
        return pendingResponse(
          state,
          `Transcrevendo ${safeLeaf(currentMedia.name)} com a chave #${keyIndex + 1}.`,
        );
      } catch (error) {
        if (error instanceof ProviderFailure) {
          state.errors.push(providerAttemptError(error, keyIndex));
          state.errorStatuses.push(error.status);
          state.keyAttemptOffset += 1;
          state.current = null;
          await saveState(services, state);
          continue;
        }
        throw error;
      }
    }

    const transcript = await getTranscript(
      base,
      apiKey,
      state.current.transcriptId,
      services.signal,
    );
    if (transcript.status === "queued" || transcript.status === "processing") {
      return pendingResponse(
        state,
        `Transcrevendo ${safeLeaf(currentMedia.name)} com a chave #${keyIndex + 1}.`,
      );
    }
    if (transcript.status === "error") {
      state.errors.push(`chave #${keyIndex + 1}: ${safeMessage(transcript.error)}`);
      state.errorStatuses.push(200);
      state.keyAttemptOffset += 1;
      state.current = null;
      await saveState(services, state);
      continue;
    }
    if (transcript.status !== "completed") {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        "A AssemblyAI devolveu um status de transcrição desconhecido.",
      );
    }

    const srt = compileSrt(transcript.words, configuration);
    if (!srt.trim()) {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        `A AssemblyAI concluiu, mas não retornou palavras para ${safeLeaf(currentMedia.name)}.`,
      );
    }
    const name = outputName(currentMedia, state.mediaIndex, media);
    const workspacePath = `results/${state.jobId}-${state.mediaIndex + 1}.srt`;
    await writeFile(services.getWorkspacePath(workspacePath), srt, "utf8");
    state.results.push({
      id: `subtitle-${state.mediaIndex + 1}`,
      name,
      workspacePath,
      languageCode:
        typeof transcript.language_code === "string" ? transcript.language_code : undefined,
    });
    state.nextKeyIndex = (keyIndex + 1) % keys.length;
    state.mediaIndex += 1;
    state.keyAttemptOffset = 0;
    state.current = null;
    state.errors = [];
    state.errorStatuses = [];
    await saveState(services, state);
  }
}

export async function execute(request, services) {
  try {
    if (!isPlainObject(request) || request.capabilityId !== CAPABILITY_ID) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A capability solicitada não pertence a este plugin.",
      );
    }
    if (!new Set(["start", "resume"]).has(request.invocation?.mode)) {
      throw new PluginFailure("INVALID_INPUT", "Esta capacidade aceita somente start e resume.");
    }
    if (services.signal?.aborted)
      throw new PluginFailure("CANCELLED", "A transcrição foi cancelada.");
    validateSettings(request.settings);
    const configuration = validateConfiguration(request.configuration);
    const media = normalizeMediaInput(request.inputs?.media_files);
    const keys = parseApiKeys(await services.getSecret(SECRET_NAME));
    const expectedJobId = jobIdFor(request);
    if (request.invocation.mode === "resume" && request.invocation.jobId !== expectedJobId) {
      throw new PluginFailure("INVALID_INPUT", "O jobId não corresponde a esta execução.");
    }
    const fingerprint = fingerprintFor(media, configuration);
    let state = await readState(services, expectedJobId);
    if (!state) {
      if (request.invocation.mode !== "start") {
        throw new PluginFailure(
          "NOT_FOUND",
          "O estado persistente desta transcrição não foi encontrado.",
        );
      }
      state = {
        version: 1,
        jobId: expectedJobId,
        fingerprint,
        media: media.map(({ name, size, mimeType }) => ({ name, size, mimeType })),
        mediaIndex: 0,
        nextKeyIndex: 0,
        keyAttemptOffset: 0,
        current: null,
        results: [],
        errors: [],
        errorStatuses: [],
      };
      await saveState(services, state);
    } else if (state.fingerprint !== fingerprint) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "As entradas ou configurações mudaram durante o job.",
      );
    }
    return await drive(state, media, keys, configuration, services);
  } catch (error) {
    return errorResponse(error);
  }
}

export const __test = Object.freeze({
  CONFIG_DEFAULTS,
  normalizeMediaInput,
  parseApiKeys,
  pythonRound,
  sentenceSegments,
  maximumSegments,
  targetSegments,
  validateConfiguration,
});
