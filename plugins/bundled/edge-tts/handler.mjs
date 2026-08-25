import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CAPABILITY_ID = "text-to-speech";
const ARTIFACT_ID = "edge-tts-audio";
const OUTPUT_NAME = "edge-narration.mp3";
const INPUT_NAME = "edge-tts-input.txt";
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_LOG_BYTES = 64_000;
const DEFAULTS = Object.freeze({
  voice: "en-US-GuyNeural",
  ratePercent: 0,
  volumePercent: 0,
  pitchHz: 0,
});

class PluginFailure extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

class ProcessFailure extends Error {
  constructor(kind) {
    super(`Edge TTS process failure: ${kind}`);
    this.name = "ProcessFailure";
    this.kind = kind;
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
  const voice = value.voice ?? DEFAULTS.voice;
  if (typeof voice !== "string" || !/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(voice)) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "A voz precisa ser um ShortName neural válido, como en-US-GuyNeural.",
    );
  }
  return {
    voice,
    ratePercent: requireInteger(value.ratePercent ?? DEFAULTS.ratePercent, "ratePercent", -50, 100),
    volumePercent: requireInteger(
      value.volumePercent ?? DEFAULTS.volumePercent,
      "volumePercent",
      -50,
      100,
    ),
    pitchHz: requireInteger(value.pitchHz ?? DEFAULTS.pitchHz, "pitchHz", -100, 100),
  };
}

function validateRequest(request) {
  if (!isPlainObject(request) || request.capabilityId !== CAPABILITY_ID) {
    throw new PluginFailure("INVALID_INPUT", "A capability solicitada não pertence a este plugin.");
  }
  if (request.invocation?.mode !== "start") {
    throw new PluginFailure(
      "INVALID_INPUT",
      "Esta capability é imediata e aceita somente invocation.mode=start.",
    );
  }
  if (
    request.settings !== undefined &&
    (!isPlainObject(request.settings) || Object.keys(request.settings).length)
  ) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Este plugin não possui configurações locais.",
    );
  }
  const text = request.inputs?.text;
  if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_CHARACTERS) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `A entrada text precisa conter entre 1 e ${MAX_TEXT_CHARACTERS} caracteres.`,
    );
  }
  return { text: text.trim(), configuration: validateConfiguration(request.configuration) };
}

function packagedPythonPath() {
  if (process.platform !== "win32" || process.arch !== "x64") return undefined;
  return path.join(PLUGIN_ROOT, "vendor", "python", "win32-x64", "python.exe");
}

async function resolvePythonExecutable() {
  const executable = packagedPythonPath();
  if (!executable) {
    throw new PluginFailure(
      "NOT_FOUND",
      "Esta versão do plugin Edge TTS inclui runtime somente para Windows x64.",
    );
  }
  try {
    await access(executable, constants.X_OK);
    return executable;
  } catch {
    throw new PluginFailure(
      "NOT_FOUND",
      "O runtime Python empacotado do Edge TTS não foi encontrado. Reinstale ou atualize o ContentFlow OS.",
    );
  }
}

function signed(value, suffix) {
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

function edgeTtsArgs(inputPath, outputPath, configuration) {
  return [
    "-m",
    "edge_tts",
    "--file",
    inputPath,
    "--voice",
    configuration.voice,
    `--rate=${signed(configuration.ratePercent, "%")}`,
    `--volume=${signed(configuration.volumePercent, "%")}`,
    `--pitch=${signed(configuration.pitchHz, "Hz")}`,
    "--write-media",
    outputPath,
  ];
}

function runProcess(executable, args, { signal, timeoutMs = 110_000 } = {}) {
  if (signal?.aborted) return Promise.reject(new ProcessFailure("cancelled"));
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationReason;
    let outputBytes = 0;
    let stderr = "";
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
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
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_LOG_BYTES) return stop("output_limit");
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      finish(() => reject(new ProcessFailure(error?.code === "ENOENT" ? "not_found" : "spawn")));
    });
    child.once("close", (code) => {
      finish(() => {
        if (terminationReason) reject(new ProcessFailure(terminationReason));
        else if (code !== 0)
          reject(new ProcessFailure(/403|401/.test(stderr) ? "denied" : "upstream"));
        else resolve();
      });
    });
  });
}

async function assertMp3(outputPath) {
  const info = await stat(outputPath);
  if (info.size <= 0 || info.size > MAX_OUTPUT_BYTES) {
    throw new PluginFailure(
      "OUTPUT_VALIDATION_FAILED",
      "O Edge TTS gerou um arquivo vazio ou maior que o limite de 100 MB.",
    );
  }
  const handle = await open(outputPath, "r");
  try {
    const bytes = Buffer.alloc(3);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const hasId3 = bytesRead === 3 && bytes.toString("ascii") === "ID3";
    const hasFrameSync = bytesRead >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!hasId3 && !hasFrameSync) {
      throw new PluginFailure(
        "OUTPUT_VALIDATION_FAILED",
        "O Edge TTS respondeu, mas o arquivo produzido não possui assinatura MP3 válida.",
      );
    }
  } finally {
    await handle.close();
  }
  return info;
}

function mapProcessFailure(error) {
  if (!(error instanceof ProcessFailure)) return undefined;
  if (error.kind === "cancelled")
    return errorResponse("CANCELLED", "A geração de voz foi cancelada.");
  if (error.kind === "timeout") {
    return errorResponse("TIMEOUT", "O serviço Edge TTS excedeu o tempo máximo de geração.", true);
  }
  if (error.kind === "not_found") {
    return errorResponse("NOT_FOUND", "O runtime do Edge TTS não pôde ser iniciado.");
  }
  if (error.kind === "denied") {
    return errorResponse(
      "PERMISSION_DENIED",
      "O serviço online do Microsoft Edge recusou a solicitação.",
    );
  }
  return errorResponse(
    "UPSTREAM_UNAVAILABLE",
    "Não foi possível gerar a narração no serviço online do Microsoft Edge.",
    true,
  );
}

export async function executeWithRunner(request, services, runner = runProcess) {
  const transient = [];
  try {
    if (services.signal?.aborted)
      throw new PluginFailure("CANCELLED", "A geração de voz foi cancelada.");
    const { text, configuration } = validateRequest(request);
    const python = await resolvePythonExecutable();
    const inputPath = services.getOutputPath(INPUT_NAME);
    const outputPath = services.getOutputPath(OUTPUT_NAME);
    transient.push(inputPath);
    await writeFile(inputPath, text, "utf8");
    await runner(python, edgeTtsArgs(inputPath, outputPath, configuration), {
      signal: services.signal,
      timeoutMs: 110_000,
    });
    const info = await assertMp3(outputPath);
    const artifact = {
      id: ARTIFACT_ID,
      name: OUTPUT_NAME,
      mimeType: "audio/mpeg",
      size: info.size,
    };
    return {
      status: "success",
      values: { audio: { ...artifact, url: `artifact://${ARTIFACT_ID}` } },
      artifacts: [{ ...artifact, source: { kind: "path", path: OUTPUT_NAME } }],
      logs: [`Narração gerada com a voz ${configuration.voice}.`],
    };
  } catch (error) {
    if (error instanceof PluginFailure)
      return errorResponse(error.code, error.message, error.retryable);
    const mapped = mapProcessFailure(error);
    if (mapped) return mapped;
    return errorResponse(
      "JOB_FAILED",
      "A geração de voz falhou antes de produzir um artifact válido.",
    );
  } finally {
    await Promise.all(transient.map((filePath) => rm(filePath, { force: true }).catch(() => {})));
  }
}

export async function execute(request, services) {
  return executeWithRunner(request, services);
}

export const internals = { DEFAULTS, edgeTtsArgs, signed, validateConfiguration, validateRequest };
