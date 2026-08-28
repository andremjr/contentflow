import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CAPABILITY_ID = "compose-image-sequence-with-audio";
const ARTIFACT_ID = "final-video";
const OUTPUT_NAME = "video-final.mp4";
const MAX_INPUT_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_IMAGES = 60;
const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_SECONDS = 6 * 60 * 60;
const PROCESS_LOG_LIMIT = 2_000_000;
const EXECUTION_BUDGET_MS = 590_000;

const DEFAULTS = Object.freeze({
  width: 1920,
  height: 1080,
  fps: 30,
  imageFit: "cover",
  backgroundColor: "#000000",
  videoQuality: 20,
  timingMode: "equal",
});

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_MIMES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);
const SUBTITLE_MIMES = new Set([
  "application/x-subrip",
  "application/octet-stream",
  "text/plain",
  "text/srt",
  "text/x-srt",
]);

class PluginFailure extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

class ProcessFailure extends Error {
  constructor(kind, stage) {
    super(`FFmpeg failure: ${kind}`);
    this.name = "ProcessFailure";
    this.kind = kind;
    this.stage = stage;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorResponse(code, message, retryable = false) {
  return { status: "error", code, message, retryable };
}

function requireInteger(value, key, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      `O parâmetro ${key} precisa ser um inteiro entre ${minimum} e ${maximum}.`,
    );
  }
  return value;
}

function validateConfiguration(configuration) {
  const value = configuration ?? {};
  if (!isPlainObject(value)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "A configuração precisa ser um objeto.");
  }
  const unknown = Object.keys(value).find((key) => !Object.hasOwn(DEFAULTS, key));
  if (unknown) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      `O parâmetro ${unknown} não é reconhecido por esta versão do plugin.`,
    );
  }
  const width = requireInteger(value.width ?? DEFAULTS.width, "width", 320, 3840);
  const height = requireInteger(value.height ?? DEFAULTS.height, "height", 180, 2160);
  const fps = value.fps ?? DEFAULTS.fps;
  if (![24, 25, 30, 50, 60].includes(fps)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O parâmetro fps não é suportado.");
  }
  const imageFit = value.imageFit ?? DEFAULTS.imageFit;
  if (!new Set(["cover", "contain"]).has(imageFit)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O parâmetro imageFit não é suportado.");
  }
  const backgroundColor = value.backgroundColor ?? DEFAULTS.backgroundColor;
  if (typeof backgroundColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(backgroundColor)) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "O parâmetro backgroundColor precisa usar o formato #RRGGBB.",
    );
  }
  const videoQuality = requireInteger(
    value.videoQuality ?? DEFAULTS.videoQuality,
    "videoQuality",
    16,
    30,
  );
  if (width % 2 || height % 2) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Largura e altura precisam ser números pares para gerar H.264 yuv420p.",
    );
  }
  const timingMode = value.timingMode ?? DEFAULTS.timingMode;
  if (!new Set(["equal", "srt"]).has(timingMode)) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O parâmetro timingMode não é suportado.");
  }
  return { width, height, fps, imageFit, backgroundColor, videoQuality, timingMode };
}

function validateSettings(settings) {
  if (settings === undefined) return;
  if (!isPlainObject(settings) || Object.keys(settings).length) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Este plugin não possui configurações locais.",
    );
  }
}

function validateStoredFile(value, kind, index) {
  const label = kind === "image" ? `A imagem ${index + 1}` : kind === "audio" ? "O áudio" : "O SRT";
  const sizeLimit = kind === "subtitle" ? MAX_SUBTITLE_BYTES : MAX_INPUT_BYTES;
  const sizeLabel = kind === "subtitle" ? "2 MB" : "4 GB";
  if (
    !isPlainObject(value) ||
    typeof value.url !== "string" ||
    typeof value.name !== "string" ||
    typeof value.mimeType !== "string" ||
    !Number.isFinite(value.size) ||
    value.size <= 0 ||
    value.size > sizeLimit
  ) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `${label} precisa ser uma referência de arquivo válida de até ${sizeLabel}.`,
    );
  }
  const mimeType = value.mimeType.toLowerCase();
  const accepted = kind === "image" ? IMAGE_MIMES : kind === "audio" ? AUDIO_MIMES : SUBTITLE_MIMES;
  if (!accepted.has(mimeType)) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `${label} usa um formato não suportado (${mimeType}).`,
    );
  }
  return { ...value, mimeType };
}

function validateInputs(inputs) {
  const rawImages = Array.isArray(inputs?.images)
    ? inputs.images
    : [inputs?.images].filter(Boolean);
  if (!rawImages.length || rawImages.length > MAX_IMAGES) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `A entrada images precisa conter entre 1 e ${MAX_IMAGES} imagens ordenadas.`,
    );
  }
  const rawSubtitles = Array.isArray(inputs?.subtitles)
    ? inputs.subtitles
    : [inputs?.subtitles].filter(Boolean);
  if (rawSubtitles.length > 1) {
    throw new PluginFailure("INVALID_INPUT", "A entrada subtitles aceita somente um arquivo SRT.");
  }
  return {
    images: rawImages.map((image, index) => validateStoredFile(image, "image", index)),
    audio: validateStoredFile(inputs?.audio, "audio", 0),
    subtitles: rawSubtitles.length ? validateStoredFile(rawSubtitles[0], "subtitle", 0) : undefined,
  };
}

function parseSrtTimestamp(value) {
  const match = value.match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return undefined;
  const [, hours, minutes, seconds, milliseconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return undefined;
  return (
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000
  );
}

function parseSrt(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PluginFailure("INVALID_INPUT", "O arquivo SRT está vazio.");
  }
  const cues = [];
  const blocks = value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (
      timingIndex < 0 ||
      !lines
        .slice(timingIndex + 1)
        .join(" ")
        .trim()
    ) {
      throw new PluginFailure("INVALID_INPUT", "O arquivo não possui blocos SRT válidos.");
    }
    const timing = lines[timingIndex].match(
      /^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/,
    );
    const start = timing ? parseSrtTimestamp(timing[1]) : undefined;
    const end = timing ? parseSrtTimestamp(timing[2]) : undefined;
    if (start === undefined || end === undefined || end <= start) {
      throw new PluginFailure("INVALID_INPUT", "O arquivo contém um intervalo SRT inválido.");
    }
    const previous = cues.at(-1);
    if (previous && (start < previous.start || end <= previous.end)) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "Os intervalos do SRT precisam estar em ordem cronológica.",
      );
    }
    cues.push({ start, end });
  }
  return cues;
}

function imageDurationsFromCues(cues, imageCount, audioDuration) {
  if (!Array.isArray(cues) || cues.length < imageCount) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `O SRT precisa ter pelo menos ${imageCount} cue(s), um para cada imagem.`,
    );
  }
  if (cues.at(-1).end > audioDuration + 1) {
    throw new PluginFailure(
      "INVALID_INPUT",
      "O último cue do SRT ultrapassa a duração do áudio em mais de um segundo.",
    );
  }
  const boundaries = [0];
  for (let index = 1; index < imageCount; index += 1) {
    const cueIndex = Math.ceil((index * cues.length) / imageCount) - 1;
    boundaries.push(Math.min(cues[cueIndex].end, audioDuration));
  }
  boundaries.push(audioDuration);
  const durations = boundaries.slice(1).map((boundary, index) => boundary - boundaries[index]);
  if (durations.some((duration) => !Number.isFinite(duration) || duration < 0.05)) {
    throw new PluginFailure(
      "INVALID_INPUT",
      "O SRT não produz intervalos positivos suficientes para distribuir as imagens.",
    );
  }
  return durations;
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
  const executable = packagedFfmpegPath();
  try {
    await access(executable, constants.X_OK);
    return executable;
  } catch {
    throw new PluginFailure(
      "NOT_FOUND",
      "O runtime FFmpeg oficial não foi encontrado. Reinstale ou atualize o ContentFlow.",
    );
  }
}

function runFfmpeg(executable, args, { signal, timeoutMs, stage }) {
  if (signal?.aborted) return Promise.reject(new ProcessFailure("cancelled", stage));
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationReason;
    let outputBytes = 0;
    const output = { stdout: "", stderr: "", progress: "" };
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
      outputBytes += chunk.length;
      if (outputBytes > PROCESS_LOG_LIMIT) return stop("output_limit");
      output[key] += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => capture("stdout", chunk));
    child.stderr.on("data", (chunk) => capture("stderr", chunk));
    child.stdio[3].on("data", (chunk) => capture("progress", chunk));
    child.once("error", (error) => {
      finish(() =>
        reject(new ProcessFailure(error?.code === "ENOENT" ? "not_found" : "spawn", stage)),
      );
    });
    child.once("close", (code) => {
      finish(() => {
        if (terminationReason) reject(new ProcessFailure(terminationReason, stage));
        else if (code !== 0) reject(new ProcessFailure("exit", stage));
        else resolve(output);
      });
    });
  });
}

function parseProgressDuration(progress) {
  let maximum;
  for (const match of progress.matchAll(/^out_time_us=(\d+)\s*$/gm)) {
    const seconds = Number(match[1]) / 1_000_000;
    if (Number.isFinite(seconds) && (maximum === undefined || seconds > maximum)) maximum = seconds;
  }
  return maximum;
}

function remainingBudget(deadline) {
  return Math.max(1, deadline - Date.now());
}

function fitFilter(configuration) {
  const { width, height, imageFit, backgroundColor } = configuration;
  if (imageFit === "contain") {
    const color = `0x${backgroundColor.slice(1)}`;
    return `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${color}`;
  }
  return `scale=w=${width}:h=${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

function buildFilter(imagesCount, segmentDurations, configuration) {
  const durations = Array.isArray(segmentDurations)
    ? segmentDurations
    : Array.from({ length: imagesCount }, () => segmentDurations);
  if (durations.length !== imagesCount) throw new Error("Durações incompatíveis com as imagens.");
  const imageFilters = Array.from({ length: imagesCount }, (_, index) => {
    const duration = durations[index].toFixed(6);
    return `[${index}:v:0]${fitFilter(configuration)},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${duration},fps=${configuration.fps},trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`;
  });
  const inputs = Array.from({ length: imagesCount }, (_, index) => `[v${index}]`).join("");
  return [...imageFilters, `${inputs}concat=n=${imagesCount}:v=1:a=0[outv]`].join(";");
}

function mapProcessFailure(error) {
  if (!(error instanceof ProcessFailure)) return undefined;
  if (error.kind === "cancelled") {
    return errorResponse("CANCELLED", "A montagem do vídeo foi cancelada.");
  }
  if (error.kind === "timeout") {
    return errorResponse("TIMEOUT", "O FFmpeg excedeu o tempo máximo de montagem.", true);
  }
  if (error.kind === "not_found") {
    return errorResponse("NOT_FOUND", "O executável FFmpeg não pôde ser iniciado.");
  }
  if (error.kind === "output_limit") {
    return errorResponse("JOB_FAILED", "O FFmpeg excedeu o limite seguro de diagnóstico.");
  }
  return errorResponse(
    error.stage === "probe" ? "INVALID_INPUT" : "JOB_FAILED",
    error.stage === "probe"
      ? "Não foi possível ler uma faixa de áudio válida."
      : "O FFmpeg não conseguiu montar o vídeo com as mídias fornecidas.",
  );
}

export async function execute(request, services) {
  const transientPaths = [];
  try {
    if (request?.invocation?.mode !== "start") {
      throw new PluginFailure(
        "INVALID_INPUT",
        "Esta capability é imediata e aceita somente invocation.mode=start.",
      );
    }
    if (request.capabilityId !== CAPABILITY_ID) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A capability solicitada não pertence a este plugin.",
      );
    }
    if (services.signal?.aborted) {
      throw new PluginFailure("CANCELLED", "A montagem do vídeo foi cancelada.");
    }
    validateSettings(request.settings);
    const configuration = validateConfiguration(request.configuration);
    const { images, audio, subtitles } = validateInputs(request.inputs);
    if (configuration.timingMode === "srt" && !subtitles) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A entrada subtitles é obrigatória quando timingMode=srt.",
      );
    }
    const resolvedImages = [];
    for (const image of images) resolvedImages.push(await services.resolveInputFile(image));
    const audioPath = await services.resolveInputFile(audio);
    const subtitlePath = subtitles ? await services.resolveInputFile(subtitles) : undefined;
    for (let index = 0; index < resolvedImages.length; index += 1) {
      if (path.resolve(resolvedImages[index]) !== path.resolve(audioPath)) continue;
      const stagedPath = services.getOutputPath(`image-input-${index}.bin`);
      await copyFile(resolvedImages[index], stagedPath);
      resolvedImages[index] = stagedPath;
      transientPaths.push(stagedPath);
    }
    const ffmpeg = await resolveFfmpegExecutable();
    const deadline = Date.now() + EXECUTION_BUDGET_MS;

    const probe = await runFfmpeg(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe,crypto",
        "-i",
        audioPath,
        "-map",
        "0:a:0",
        "-progress",
        "pipe:3",
        "-nostats",
        "-f",
        "null",
        "-",
      ],
      { signal: services.signal, timeoutMs: remainingBudget(deadline), stage: "probe" },
    );
    const durationSeconds = parseProgressDuration(probe.progress);
    if (
      durationSeconds === undefined ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_DURATION_SECONDS
    ) {
      throw new PluginFailure(
        "INVALID_INPUT",
        "A duração do áudio precisa ser detectável, maior que zero e de até 6 horas.",
      );
    }

    let cues;
    let segmentDurations;
    if (configuration.timingMode === "srt") {
      cues = parseSrt(await readFile(subtitlePath, "utf8"));
      segmentDurations = imageDurationsFromCues(cues, resolvedImages.length, durationSeconds);
    } else {
      segmentDurations = Array.from(
        { length: resolvedImages.length },
        () => durationSeconds / resolvedImages.length,
      );
    }
    const outputPath = services.getOutputPath(OUTPUT_NAME);
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
    for (const imagePath of resolvedImages) {
      args.push("-protocol_whitelist", "file,pipe,crypto", "-i", imagePath);
    }
    args.push(
      "-protocol_whitelist",
      "file,pipe,crypto",
      "-i",
      audioPath,
      "-filter_complex",
      buildFilter(resolvedImages.length, segmentDurations, configuration),
      "-map",
      "[outv]",
      "-map",
      `${resolvedImages.length}:a:0`,
      "-t",
      durationSeconds.toFixed(6),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "stillimage",
      "-crf",
      String(configuration.videoQuality),
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(configuration.fps),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-movflags",
      "+faststart",
      "-shortest",
      "-progress",
      "pipe:3",
      "-nostats",
      outputPath,
    );
    await runFfmpeg(ffmpeg, args, {
      signal: services.signal,
      timeoutMs: remainingBudget(deadline),
      stage: "render",
    });
    const output = await stat(outputPath);
    if (output.size <= 0 || output.size > MAX_OUTPUT_BYTES) {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        "O FFmpeg gerou um arquivo vazio ou maior que o limite de 8 GB.",
      );
    }
    const artifact = {
      id: ARTIFACT_ID,
      name: OUTPUT_NAME,
      mimeType: "video/mp4",
      size: output.size,
    };
    return {
      status: "success",
      values: { video: { ...artifact, url: `artifact://${ARTIFACT_ID}` } },
      artifacts: [{ ...artifact, source: { kind: "path", path: OUTPUT_NAME } }],
      logs: [
        configuration.timingMode === "srt"
          ? `${images.length} imagem(ns) sincronizada(s) em ${durationSeconds.toFixed(2)} s usando ${cues.length} cue(s) do SRT.`
          : `${images.length} imagem(ns) distribuída(s) em ${durationSeconds.toFixed(2)} s (${segmentDurations[0].toFixed(2)} s por imagem).`,
      ],
    };
  } catch (error) {
    if (error instanceof PluginFailure) {
      return errorResponse(error.code, error.message, error.retryable);
    }
    const processResponse = mapProcessFailure(error);
    if (processResponse) return processResponse;
    return errorResponse(
      "JOB_FAILED",
      "A montagem do vídeo falhou antes de gerar um artifact válido.",
    );
  } finally {
    await Promise.all(
      transientPaths.map((filePath) => rm(filePath, { force: true }).catch(() => {})),
    );
  }
}

export const internals = {
  buildFilter,
  imageDurationsFromCues,
  parseProgressDuration,
  parseSrt,
  parseSrtTimestamp,
  validateConfiguration,
};
