import { spawn } from "node:child_process";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_ID = "silence-removed-media";
const EXECUTION_BUDGET_MS = 110_000;
const MAX_PROCESS_LOG_BYTES = 2_000_000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_MEDIA_DURATION_SECONDS = 6 * 60 * 60;
const MAX_ABSOLUTE_START_SECONDS = 30 * 24 * 60 * 60;
const MAX_KEPT_SEGMENTS = 400;
const EPSILON_SECONDS = 0.001;
const AUDIO_START_MARKER = "contentflow.audio_start";

const CONFIG_DEFAULTS = Object.freeze({
  minimumSilenceDurationMs: 500,
  silenceThresholdDb: -40,
  paddingMs: 100,
});

const CAPABILITIES = Object.freeze({
  "remove-silence-audio": "audio",
  "remove-silence-video": "video",
});

const INPUT_FORMATS = Object.freeze({
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp3": "mp3",
  "audio/mp4": "mov",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/webm": "matroska",
  "audio/x-flac": "flac",
  "audio/x-m4a": "mov",
  "audio/x-wav": "wav",
  "video/avi": "avi",
  "video/mp4": "mov",
  "video/quicktime": "mov",
  "video/webm": "matroska",
  "video/x-matroska": "matroska",
  "video/x-msvideo": "avi",
});

const MIME_EXTENSIONS = Object.freeze({
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "video/avi": "avi",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
});

class PluginFailure extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

class FfmpegFailure extends Error {
  constructor(kind, stage) {
    super(`FFmpeg failure: ${kind}`);
    this.name = "FfmpegFailure";
    this.kind = kind;
    this.stage = stage;
  }
}

function errorResponse(code, message, retryable = false) {
  return { status: "error", code, message, retryable };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function validateConfiguration(configuration) {
  const value = configuration ?? {};
  if (!isPlainObject(value)) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "A configuração do removedor de silêncios precisa ser um objeto.",
    );
  }

  const knownKeys = new Set(Object.keys(CONFIG_DEFAULTS));
  const unknownKey = Object.keys(value).find((key) => !knownKeys.has(key));
  if (unknownKey) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      `O parâmetro ${unknownKey} não é reconhecido por esta versão do plugin.`,
    );
  }

  return {
    minimumSilenceDurationMs: requireNumber(
      value.minimumSilenceDurationMs ?? CONFIG_DEFAULTS.minimumSilenceDurationMs,
      "minimumSilenceDurationMs",
      { integer: true, minimum: 100, maximum: 60_000 },
    ),
    silenceThresholdDb: requireNumber(
      value.silenceThresholdDb ?? CONFIG_DEFAULTS.silenceThresholdDb,
      "silenceThresholdDb",
      { minimum: -96, maximum: -1 },
    ),
    paddingMs: requireNumber(value.paddingMs ?? CONFIG_DEFAULTS.paddingMs, "paddingMs", {
      integer: true,
      minimum: 0,
      maximum: 2_000,
    }),
  };
}

function validateSettings(settings) {
  const value = settings ?? {};
  if (!isPlainObject(value) || Object.keys(value).length) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "O Removedor de Silêncios oficial não possui configurações locais.",
    );
  }
}

function validateSource(value, mediaType) {
  if (
    !isPlainObject(value) ||
    typeof value.url !== "string" ||
    typeof value.name !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.size !== "number" ||
    !Number.isFinite(value.size) ||
    value.size <= 0 ||
    value.size > MAX_MEDIA_BYTES
  ) {
    throw new PluginFailure(
      "INVALID_INPUT",
      "A entrada source precisa ser uma referência válida de mídia de até 4 GB.",
    );
  }
  if (!value.mimeType.toLowerCase().startsWith(`${mediaType}/`)) {
    throw new PluginFailure(
      "INVALID_INPUT",
      mediaType === "audio"
        ? "A capacidade de áudio aceita somente arquivos com MIME de áudio."
        : "A capacidade de vídeo aceita somente arquivos com MIME de vídeo.",
    );
  }
  const mimeType = value.mimeType.toLowerCase();
  const inputFormat = INPUT_FORMATS[mimeType];
  if (!inputFormat) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `O MIME ${mimeType} não pertence à lista de formatos locais suportados pelo plugin.`,
    );
  }
  return { source: { ...value, mimeType }, inputFormat };
}

function packagedFfmpegPath() {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(
    PLUGIN_ROOT,
    "vendor",
    "ffmpeg",
    `${process.platform}-${process.arch}`,
    executable,
  );
}

async function resolveFfmpegExecutable() {
  const packaged = packagedFfmpegPath();
  try {
    await access(packaged, constants.X_OK);
    return packaged;
  } catch {
    throw new PluginFailure(
      "NOT_FOUND",
      "O runtime FFmpeg oficial não foi encontrado. Reinstale ou atualize o ContentFlow.",
    );
  }
}

function runFfmpeg(executable, args, { signal, timeoutMs, stage }) {
  if (signal?.aborted) return Promise.reject(new FfmpegFailure("cancelled", stage));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new FfmpegFailure("timeout", stage));
  }

  return new Promise((resolve, reject) => {
    const output = { stdout: "", stderr: "", progress: "" };
    let outputBytes = 0;
    let settled = false;
    let terminationReason;
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    });

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const stop = (reason) => {
      if (terminationReason) return;
      terminationReason = reason;
      if (!child.killed) child.kill("SIGKILL");
    };
    const onAbort = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), Math.max(1, timeoutMs));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    const capture = (key, chunk) => {
      if (terminationReason) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROCESS_LOG_BYTES) return stop("output_limit");
      output[key] += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => capture("stdout", chunk));
    child.stderr.on("data", (chunk) => capture("stderr", chunk));
    child.stdio[3].on("data", (chunk) => capture("progress", chunk));

    child.once("error", (error) => {
      const kind = error && error.code === "ENOENT" ? "not_found" : "spawn";
      finish(() => reject(new FfmpegFailure(kind, stage)));
    });

    child.once("close", (code) => {
      finish(() => {
        if (terminationReason) {
          reject(new FfmpegFailure(terminationReason, stage));
        } else if (code !== 0) {
          reject(new FfmpegFailure("exit", stage));
        } else {
          resolve(output);
        }
      });
    });
  });
}

function timestampToSeconds(hours, minutes, seconds) {
  const result = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(result) ? result : undefined;
}

function parseDuration(progressLog) {
  let maximum;
  for (const match of progressLog.matchAll(/^out_time_us=(\d+)\s*$/gm)) {
    const value = Number(match[1]) / 1_000_000;
    if (Number.isFinite(value) && (maximum === undefined || value > maximum)) maximum = value;
  }
  if (maximum !== undefined) return maximum;

  const progressPattern = /^out_time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\s*$/gm;
  for (const match of progressLog.matchAll(progressPattern)) {
    const value = timestampToSeconds(match[1], match[2], match[3]);
    if (value !== undefined && (maximum === undefined || value > maximum)) maximum = value;
  }
  return maximum;
}

function parseFirstFramePts(metadataLog) {
  const lines = metadataLog.split(/\r?\n/);
  const framePattern =
    /^frame:\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*$/i;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() !== `${AUDIO_START_MARKER}=1`) continue;
    const match = lines[index - 1].match(framePattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && Math.abs(value) <= MAX_ABSOLUTE_START_SECONDS) return value;
  }
  return undefined;
}

function parseSilences(metadataLog, durationSeconds, minimumSilenceSeconds) {
  const intervals = [];
  const eventPattern = /^lavfi\.silence_(start|end)=(-?\d+(?:\.\d+)?)\s*$/gm;
  let openStart;

  for (const match of metadataLog.matchAll(eventPattern)) {
    const time = Math.min(durationSeconds, Math.max(0, Number(match[2])));
    if (!Number.isFinite(time)) continue;
    if (match[1] === "start") {
      openStart = time;
    } else if (openStart !== undefined && time > openStart) {
      intervals.push({ start: openStart, end: time });
      openStart = undefined;
    }
  }

  if (openStart !== undefined && durationSeconds > openStart) {
    intervals.push({ start: openStart, end: durationSeconds });
  }

  return intervals
    .filter(({ start, end }) => end - start + 0.01 >= minimumSilenceSeconds)
    .sort((left, right) => left.start - right.start);
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + EPSILON_SECONDS) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function createCutPlan(silences, durationSeconds, paddingSeconds) {
  const cuts = silences
    .map(({ start, end }) => ({
      start: start <= EPSILON_SECONDS ? 0 : Math.min(end, start + paddingSeconds),
      end:
        end >= durationSeconds - EPSILON_SECONDS
          ? durationSeconds
          : Math.max(start, end - paddingSeconds),
    }))
    .filter(({ start, end }) => end - start > EPSILON_SECONDS);

  const mergedCuts = mergeIntervals(cuts);
  const kept = [];
  let cursor = 0;
  for (const cut of mergedCuts) {
    if (cut.start - cursor > EPSILON_SECONDS) kept.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (durationSeconds - cursor > EPSILON_SECONDS) {
    kept.push({ start: cursor, end: durationSeconds });
  }

  return { cuts: mergedCuts, kept };
}

function formatSeconds(value) {
  return (
    Math.max(0, value)
      .toFixed(6)
      .replace(/\.?0+$/, "") || "0"
  );
}

function formatSignedSeconds(value) {
  const normalized = Math.abs(value) < 0.0000005 ? 0 : value;
  return normalized.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function ffmpegInputArgs(inputFormat, sourcePath) {
  const args = ["-protocol_whitelist", "file,pipe", "-f", inputFormat];
  if (inputFormat === "mov") {
    args.push("-enable_drefs", "0", "-use_absolute_path", "0");
  }
  args.push("-i", sourcePath);
  return args;
}

function buildFilterScript(segments, mediaType, durationSeconds, audioStartSeconds) {
  const lines = [];
  const concatInputs = [];
  const videoPadding = formatSeconds(durationSeconds);
  const timelineOrigin = formatSignedSeconds(audioStartSeconds);

  segments.forEach(({ start, end }, index) => {
    const from = formatSeconds(start);
    const to = formatSeconds(end);
    if (mediaType === "video") {
      lines.push(
        `[0:v:0]setpts=PTS-${timelineOrigin}/TB,tpad=stop_mode=clone:stop_duration=${videoPadding},trim=start=${from}:end=${to},setpts=PTS-${from}/TB[v${index}]`,
      );
      concatInputs.push(`[v${index}]`);
    }
    lines.push(
      `[0:a:0]asetpts=PTS-${timelineOrigin}/TB,atrim=start=${from}:end=${to},asetpts=PTS-${from}/TB[a${index}]`,
    );
    concatInputs.push(`[a${index}]`);
  });

  if (mediaType === "video") {
    if (segments.length === 1) {
      lines.push("[v0]scale=trunc(iw/2)*2:trunc(ih/2)*2[outv]");
      lines.push("[a0]anull[outa]");
    } else {
      lines.push(`${concatInputs.join("")}concat=n=${segments.length}:v=1:a=1[joinedv][outa]`);
      lines.push("[joinedv]scale=trunc(iw/2)*2:trunc(ih/2)*2[outv]");
    }
  } else if (segments.length === 1) {
    lines.push("[a0]anull[outa]");
  } else {
    lines.push(`${concatInputs.join("")}concat=n=${segments.length}:v=0:a=1[outa]`);
  }

  return `${lines.join(";\n")}\n`;
}

function safeSourceName(value) {
  const leaf =
    String(value || "media")
      .split(/[\\/]/)
      .at(-1) || "media";
  return leaf.replace(/[\u0000-\u001f\u007f]/g, "");
}

function safeStem(value) {
  const leaf = safeSourceName(value);
  const extensionIndex = leaf.lastIndexOf(".");
  const stem = extensionIndex > 0 ? leaf.slice(0, extensionIndex) : leaf;
  const normalized = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "media";
}

function sourceExtension(source) {
  const mapped = MIME_EXTENSIONS[source.mimeType.toLowerCase()];
  if (mapped) return mapped;
  const leaf = safeSourceName(source.name);
  const extension = path.extname(leaf).slice(1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : "media";
}

function remainingBudget(deadline) {
  const remaining = deadline - Date.now();
  if (remaining < 1_000) throw new FfmpegFailure("timeout", "budget");
  return remaining;
}

async function copyWithinBudget(sourcePath, outputPath, signal, deadline) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, remainingBudget(deadline));

  try {
    await pipeline(createReadStream(sourcePath), createWriteStream(outputPath), {
      signal: controller.signal,
    });
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    if (signal?.aborted) {
      throw new PluginFailure("CANCELLED", "A remoção de silêncios foi cancelada.");
    }
    if (timedOut) throw new FfmpegFailure("timeout", "copy");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function artifactResponse({ name, mimeType, size, path: artifactPath, log }) {
  const artifact = { id: ARTIFACT_ID, name, mimeType, size };
  return {
    status: "success",
    values: { result: { ...artifact, url: `artifact://${ARTIFACT_ID}` } },
    artifacts: [{ ...artifact, source: { kind: "path", path: artifactPath } }],
    logs: [log],
  };
}

function mapFfmpegFailure(error) {
  if (!(error instanceof FfmpegFailure)) return undefined;
  if (error.kind === "cancelled") {
    return errorResponse("CANCELLED", "A remoção de silêncios foi cancelada.");
  }
  if (error.kind === "timeout") {
    return errorResponse(
      "TIMEOUT",
      "O FFmpeg não concluiu dentro do limite de 110 segundos desta invocação.",
      false,
    );
  }
  if (error.kind === "not_found") {
    return errorResponse(
      "NOT_FOUND",
      "O runtime FFmpeg oficial não foi encontrado. Reinstale ou atualize o ContentFlow.",
    );
  }
  if (error.kind === "spawn") {
    return errorResponse(
      "PERMISSION_DENIED",
      "O FFmpeg não pôde ser iniciado. Revise a permissão de subprocesso e o executável empacotado.",
    );
  }
  if (error.stage === "detect") {
    return errorResponse(
      "INVALID_INPUT",
      "O arquivo não pôde ser lido pelo FFmpeg ou não contém uma faixa de áudio utilizável.",
    );
  }
  return errorResponse(
    "JOB_FAILED",
    "O FFmpeg não conseguiu gerar a mídia sem silêncios com os streams encontrados.",
  );
}

export async function execute(request, services) {
  try {
    if (request?.invocation?.mode !== "start") {
      throw new PluginFailure(
        "INVALID_INPUT",
        "Esta capacidade é imediata e aceita somente invocation.mode=start.",
      );
    }

    const mediaType = CAPABILITIES[request.capabilityId];
    if (!mediaType) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A capability solicitada não pertence ao Removedor de Silêncios.",
      );
    }
    if (services.signal?.aborted) {
      throw new PluginFailure("CANCELLED", "A remoção de silêncios foi cancelada.");
    }

    const configuration = validateConfiguration(request.configuration);
    validateSettings(request.settings);
    const { source, inputFormat } = validateSource(request.inputs?.source, mediaType);
    const sourcePath = await services.resolveInputFile(source);
    const ffmpeg = await resolveFfmpegExecutable();
    const deadline = Date.now() + EXECUTION_BUDGET_MS;
    const minimumSilenceSeconds = configuration.minimumSilenceDurationMs / 1_000;
    const detectionFilter = [
      `ametadata=mode=delete:key=${AUDIO_START_MARKER}`,
      `ametadata=mode=add:key=${AUDIO_START_MARKER}:value=1:enable='eq(n\\,0)'`,
      `ametadata=mode=print:key=${AUDIO_START_MARKER}:file='pipe\\:1':direct=1`,
      `ametadata=mode=delete:key=${AUDIO_START_MARKER}`,
      "asetpts=PTS-STARTPTS",
      "ametadata=mode=delete:key=lavfi.silence_start",
      "ametadata=mode=delete:key=lavfi.silence_end",
      "ametadata=mode=delete:key=lavfi.silence_duration",
      `silencedetect=noise=${configuration.silenceThresholdDb}dB:d=${minimumSilenceSeconds}`,
      "ametadata=mode=print:file='pipe\\:1':direct=1",
    ].join(",");

    const detection = await runFfmpeg(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        ...ffmpegInputArgs(inputFormat, sourcePath),
        "-map",
        "0:a:0",
        "-af",
        detectionFilter,
        "-progress",
        "pipe:3",
        "-nostats",
        "-f",
        "null",
        "-",
      ],
      {
        signal: services.signal,
        timeoutMs: remainingBudget(deadline),
        stage: "detect",
      },
    );

    const durationSeconds = parseDuration(detection.progress);
    const audioStartSeconds = parseFirstFramePts(detection.stdout);
    if (
      durationSeconds === undefined ||
      audioStartSeconds === undefined ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_MEDIA_DURATION_SECONDS
    ) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A duração da mídia precisa ser detectável e não pode exceder 6 horas.",
      );
    }
    const silences = parseSilences(detection.stdout, durationSeconds, minimumSilenceSeconds);
    const plan = createCutPlan(silences, durationSeconds, configuration.paddingMs / 1_000);
    const stem = safeStem(source.name);

    if (!plan.cuts.length) {
      const extension = sourceExtension(source);
      const name = `${stem}-sem-silencios.${extension}`;
      const outputPath = services.getOutputPath(name);
      await copyWithinBudget(sourcePath, outputPath, services.signal, deadline);
      const outputInfo = await stat(outputPath);
      return artifactResponse({
        name,
        mimeType: source.mimeType,
        size: outputInfo.size,
        path: name,
        log: "Nenhum intervalo silencioso elegível foi encontrado; o arquivo foi preservado sem recodificação.",
      });
    }

    if (!plan.kept.length) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "Toda a mídia foi classificada como silêncio. Ajuste o limiar ou a duração mínima.",
      );
    }
    if (plan.kept.length > MAX_KEPT_SEGMENTS) {
      throw new PluginFailure(
        "INVALID_INPUT",
        `Foram encontrados mais de ${MAX_KEPT_SEGMENTS} segmentos. Aumente a duração mínima do silêncio.`,
      );
    }

    const extension = mediaType === "video" ? "mp4" : "m4a";
    const mimeType = mediaType === "video" ? "video/mp4" : "audio/mp4";
    const name = `${stem}-sem-silencios.${extension}`;
    const outputPath = services.getOutputPath(name);
    const filterName = `silence-filter-${mediaType}.txt`;
    const filterPath = services.getOutputPath(filterName);
    await writeFile(
      filterPath,
      buildFilterScript(plan.kept, mediaType, durationSeconds, audioStartSeconds),
      "utf8",
    );

    const outputArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      ...ffmpegInputArgs(inputFormat, sourcePath),
      "-filter_complex_script",
      filterPath,
    ];
    if (mediaType === "video") {
      outputArgs.push(
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
      );
    } else {
      outputArgs.push("-map", "[outa]", "-c:a", "aac", "-b:a", "192k");
    }
    outputArgs.push(
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:3",
      "-nostats",
      outputPath,
    );

    await runFfmpeg(ffmpeg, outputArgs, {
      signal: services.signal,
      timeoutMs: remainingBudget(deadline),
      stage: "render",
    });

    const outputInfo = await stat(outputPath);
    if (outputInfo.size <= 0 || outputInfo.size > MAX_MEDIA_BYTES) {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        "O FFmpeg gerou um arquivo vazio ou maior que o limite de 4 GB.",
      );
    }

    const removedSeconds = plan.cuts.reduce((total, cut) => total + cut.end - cut.start, 0);
    return artifactResponse({
      name,
      mimeType,
      size: outputInfo.size,
      path: name,
      log: `${plan.cuts.length} corte(s) aplicado(s); aproximadamente ${removedSeconds.toFixed(2)} s removidos.`,
    });
  } catch (error) {
    if (error instanceof PluginFailure) {
      return errorResponse(error.code, error.message, error.retryable);
    }
    const ffmpegResponse = mapFfmpegFailure(error);
    if (ffmpegResponse) return ffmpegResponse;
    return errorResponse(
      "JOB_FAILED",
      "A remoção de silêncios falhou antes de produzir um artifact válido.",
    );
  }
}
