import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join } from "node:path";

const CHATGPT_HOST = "grok.com";
const CHATGPT_NEW_URL = "https://grok.com/imagine";
const CHATGPT_CHAT_URL = "https://grok.com/";
const DEFAULT_PORT = 9744;
const MAX_PARTS = 32;
const MAX_PROMPT_CHARACTERS = 500_000;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".csv",
  ".txt",
  ".html",
  ".htm",
  ".odt",
  ".rtf",
  ".epub",
  ".json",
  ".xlsx",
  ".pptx",
]);
const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function codedError(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function resultError(code, message, retryable = false, retryAfterMs) {
  const result = { status: "error", code, message, retryable };
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) result.retryAfterMs = retryAfterMs;
  return result;
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(codedError("CANCELLED", "Execução cancelada."));
    const timer = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(codedError("CANCELLED", "Execução cancelada."));
    };
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function serialize(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function serializeInputs(inputs) {
  const entries = Object.entries(inputs ?? {}).filter(([key]) => key !== "attachments");
  if (!entries.length) return "";
  if (entries.length === 1 && entries[0][0] === "content") return serialize(entries[0][1]);
  return entries.map(([key, value]) => `${key}:\n${serialize(value)}`).join("\n\n");
}

function replaceAllLiteral(text, token, value) {
  return String(text)
    .split(token)
    .join(String(value ?? ""));
}

function expandTemplate(template, request) {
  const context = request?.context ?? {};
  const replacements = {
    "{{CONTENT}}": serializeInputs(request?.inputs),
    "{{CHANNEL_NAME}}": context?.channel?.name ?? "",
    "{{NICHE}}": context?.channel?.niche ?? "",
    "{{PROJECT_TITLE}}": context?.project?.title ?? "",
    "{{PROCESS}}": context?.processType ?? "",
    "{{BLOCK_INSTRUCTIONS}}": context?.block?.instructions || context?.block?.name || "",
    "{{TEMA}}": serializeInputs(request?.inputs),
    "{{NICHO}}": context?.channel?.niche ?? "",
  };
  let output = String(template ?? "");
  for (const [token, value] of Object.entries(replacements))
    output = replaceAllLiteral(output, token, value);
  for (const [key, value] of Object.entries(request?.inputs ?? {}))
    output = replaceAllLiteral(output, `{{INPUT:${key}}}`, serialize(value));
  return output.trim();
}

function expandCapabilityTemplate(template, replacements, request) {
  let output = String(template ?? "");
  for (const [token, value] of Object.entries(replacements))
    output = replaceAllLiteral(output, token, typeof value === "string" ? value : serialize(value));
  return expandTemplate(output, request).trim();
}

function flattenRecords(value, output = []) {
  if (Array.isArray(value)) for (const item of value) flattenRecords(item, output);
  else if (value && typeof value === "object") output.push(value);
  return output;
}

function summarizeBlock(index, block) {
  const title = block?.titulo_bloco || block?.titulo || block?.nome || `Bloco ${index}`;
  const objective = block?.objetivo || block?.objetivo_emocional || block?.descricao || "";
  const points = block?.pontos_chave || block?.pontos || block?.conteudos_obrigatorios || [];
  const pointText = Array.isArray(points)
    ? points.map(String).filter(Boolean).join("; ")
    : String(points || "");
  return [
    `Bloco ${index}: ${title}`,
    objective && `Objetivo: ${objective}`,
    pointText && `Pontos: ${pointText}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function outlineItems(request) {
  if (Array.isArray(request?.inputs?.outline) && request.inputs.outline.length)
    return request.inputs.outline.slice(0, MAX_PARTS);
  if (
    Array.isArray(request?.inputs?.content) &&
    request.inputs.content.some((item) => item && typeof item === "object")
  ) {
    return flattenRecords(request.inputs.content).slice(0, MAX_PARTS);
  }
  return [];
}

function expandOutlinePrompt(template, request, block, index, total, base) {
  let output = expandTemplate(template, request);
  for (const [token, value] of Object.entries({
    "{{PROMPT_BASE}}": base,
    "{{BLOCK_NUMBER}}": String(index + 1),
    "{{BLOCK_TOTAL}}": String(total),
    "{{BLOCK}}": summarizeBlock(index + 1, block),
    "{{BLOCK_JSON}}": serialize(block),
    "{{IS_FIRST}}": index === 0 ? "true" : "false",
    "{{IS_LAST}}": index === total - 1 ? "true" : "false",
  }))
    output = replaceAllLiteral(output, token, value);
  return output.trim();
}

function buildParts(request) {
  const configuration = request?.configuration ?? {};
  const base = expandTemplate(configuration.promptTemplate, request);
  const format =
    configuration.plainTextOnly === false
      ? ""
      : "FORMATO OBRIGATÓRIO: entregue o conteúdo diretamente como texto, sem criar arquivos ou canvas.";
  const suffix = format ? `\n\n${format}` : "";
  const mode = String(configuration.generationMode ?? "single");
  let parts;
  if (mode === "legacy_script_3_parts") {
    parts = [
      `${base}\n\nDesenvolva os TÓPICOS 1, 2 e 3. Faça abertura e introdução, sem concluir.`,
      "Continue exatamente de onde parou e desenvolva os TÓPICOS 4, 5 e 6. Não repita a parte anterior.",
      "Continue exatamente de onde parou, desenvolva os TÓPICOS 7 e 8 e finalize o roteiro.",
    ];
  } else if (mode === "outline_sequence") {
    const items = outlineItems(request);
    if (!items.length)
      throw codedError("INVALID_INPUT", "O modo outline_sequence exige uma outline não vazia.");
    parts = items.map((block, index) =>
      expandOutlinePrompt(
        index === 0
          ? configuration.outlineFirstPromptTemplate
          : index === items.length - 1
            ? configuration.outlineLastPromptTemplate
            : configuration.outlineNextPromptTemplate,
        request,
        block,
        index,
        items.length,
        base,
      ),
    );
  } else if (mode === "custom_parts") {
    parts = String(configuration.customParts ?? "")
      .split(/^\s*---PARTE---\s*$/gim)
      .map((part) => expandTemplate(part, request))
      .filter(Boolean);
    if (!parts.length) throw codedError("INVALID_INPUT", "Partes personalizadas vazias.");
  } else parts = [base];
  const normalized = parts.map((part) => `${part.trim()}${suffix}`.trim()).filter(Boolean);
  if (normalized.some((part) => part.length > MAX_PROMPT_CHARACTERS))
    throw codedError("INVALID_INPUT", `Uma parte ultrapassou ${MAX_PROMPT_CHARACTERS} caracteres.`);
  return normalized;
}

function buildSearchPrompt(request, deep = false) {
  const configuration = request?.configuration ?? {};
  const template = deep ? configuration.researchPromptTemplate : configuration.searchPromptTemplate;
  const prompt = expandCapabilityTemplate(
    template,
    {
      "{{QUERY}}": serialize(request?.inputs?.query),
      "{{SEARCH_CONTEXT}}": serialize(request?.inputs?.context ?? ""),
    },
    request,
  );
  if (!prompt) throw codedError("INVALID_INPUT", "A consulta ficou vazia.");
  return prompt;
}

function buildChoosePrompt(request) {
  const collection = request?.context?.selectedCollection;
  if (!collection || !Array.isArray(collection.items) || !collection.items.length)
    throw codedError("INVALID_INPUT", "O bloco Escolher precisa de uma coleção com itens.");
  return expandCapabilityTemplate(
    request?.configuration?.selectionPromptTemplate,
    { "{{COLLECTION_ITEMS}}": collection.items, "{{CONTENT}}": serializeInputs(request?.inputs) },
    request,
  );
}

function validationMode(request) {
  return ["approval", "select_one", "select_many"].includes(request?.validation?.mode)
    ? request.validation.mode
    : "approval";
}

function validationOutputInstruction(mode) {
  if (mode === "select_one")
    return 'Responda somente JSON válido: {"selectedIndex": NUMERO_1_BASED, "feedback":"justificativa curta"}.';
  if (mode === "select_many")
    return 'Responda somente JSON válido: {"selectedIndices":[NUMEROS_1_BASED], "feedback":"justificativa curta"}.';
  return 'Responda somente JSON válido: {"decision":"approved" ou "rejected", "feedback":"justificativa objetiva"}.';
}

function buildValidationPrompt(request) {
  const mode = validationMode(request);
  return expandCapabilityTemplate(
    request?.configuration?.validationPromptTemplate,
    {
      "{{VALIDATION_MODE}}": mode,
      "{{CRITERIA}}": serialize(request?.inputs?.criteria ?? ""),
      "{{CONTENT}}": serialize(request?.inputs?.content),
      "{{VALIDATION_OUTPUT_INSTRUCTION}}": validationOutputInstruction(mode),
    },
    request,
  );
}

function buildAnalysisPrompt(request, image) {
  return expandCapabilityTemplate(
    request?.configuration?.analysisPromptTemplate,
    { "{{ANALYSIS_CONTEXT}}": serialize(request?.inputs?.context ?? "") },
    request,
  );
}

function buildImagePrompt(request) {
  const prompt = expandCapabilityTemplate(
    request?.configuration?.imagePromptTemplate,
    { "{{IMAGE_PROMPT}}": serialize(request?.inputs?.prompt) },
    request,
  );
  if (!prompt) throw codedError("INVALID_INPUT", "O prompt da imagem ficou vazio.");
  return prompt;
}

function buildVideoPrompt(request) {
  const prompt = expandCapabilityTemplate(
    request?.configuration?.videoPromptTemplate,
    { "{{VIDEO_PROMPT}}": serialize(request?.inputs?.prompt) },
    request,
  );
  if (!prompt) throw codedError("INVALID_INPUT", "O prompt do vídeo ficou vazio.");
  return prompt;
}

function stripCodeFence(text) {
  return String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
function parseJsonObject(text) {
  const stripped = stripCodeFence(text);
  try {
    const parsed = JSON.parse(stripped);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function parseSelectedItemId(text, request) {
  const items = request?.context?.selectedCollection?.items ?? [];
  const parsed = parseJsonObject(text);
  const candidate = String(parsed?.selectedItemId ?? stripCodeFence(text))
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!items.some((item) => item.id === candidate))
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "O ChatGPT não devolveu o ID exato de um item permitido.",
      true,
    );
  return candidate;
}

function parseValidationValues(text, request) {
  const mode = validationMode(request);
  const parsed = parseJsonObject(text) ?? {};
  const feedback = String(parsed.feedback ?? "").trim();
  if (mode === "approval") {
    const raw = String(parsed.decision ?? text).toLowerCase();
    const decision = /reprov|reject/.test(raw)
      ? "rejected"
      : /aprov|approve/.test(raw)
        ? "approved"
        : undefined;
    if (!decision)
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O ChatGPT não devolveu approved ou rejected.",
        true,
      );
    return { decision, ...(feedback ? { feedback } : {}) };
  }
  const candidates = Array.isArray(request?.inputs?.content)
    ? request.inputs.content
    : [request?.inputs?.content].filter((value) => value != null);
  if (!candidates.length) throw codedError("INVALID_INPUT", "Não há opções para validar.");
  if (mode === "select_one") {
    const index = Number(parsed.selectedIndex) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length)
      throw codedError("OUTPUT_VALIDATION_FAILED", "Índice de seleção inválido.", true);
    return { selected_value: candidates[index], ...(feedback ? { feedback } : {}) };
  }
  const indices = Array.isArray(parsed.selectedIndices)
    ? parsed.selectedIndices.map((value) => Number(value) - 1)
    : [];
  if (
    !indices.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index >= candidates.length)
  )
    throw codedError("OUTPUT_VALIDATION_FAILED", "Índices de seleção inválidos.", true);
  return {
    selected_values: [...new Set(indices)].map((index) => candidates[index]),
    ...(feedback ? { feedback } : {}),
  };
}

function textAsList(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [String(text ?? "").trim()].filter(Boolean);
}

function searchResponseValues(text, sources, request) {
  const fields = Array.isArray(request?.outputContract) ? request.outputContract : [];
  if (!fields.length) return { result: text, sources };
  const values = {};
  for (const field of fields) {
    const isSource = /source|fonte|url|link/i.test(`${field.key} ${field.label}`);
    if (isSource)
      values[field.key] = field.type === "url" ? (sources[0] ?? "https://chatgpt.com") : sources;
    else if (["list", "multiselect"].includes(field.type)) values[field.key] = textAsList(text);
    else values[field.key] = text;
  }
  return values;
}

function generationResponseValues(result, responses, request) {
  const values = { result };
  if ((request?.outputContract ?? []).some((field) => field?.key === "parts"))
    values.parts = responses.map((response) => response.text);
  return values;
}

function cleanGeneratedText(input) {
  return String(input ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStoredFile(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.id === "string" &&
    typeof value.url === "string",
  );
}
function collectStoredFiles(value, output = []) {
  if (isStoredFile(value)) output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStoredFiles(item, output);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) collectStoredFiles(item, output);
  return output;
}

function attachmentInput(request) {
  if (request?.capabilityId === "analyze-images-in-browser") return request?.inputs?.images;
  if (request?.capabilityId === "analyze-documents-in-browser") return request?.inputs?.documents;
  if (request?.capabilityId === "validate-content-in-browser") return request?.inputs?.content;
  if (request?.capabilityId === "generate-text-in-browser") return request?.inputs?.attachments;
  if (request?.capabilityId === "deep-research-in-browser") return request?.inputs?.context;
  if (["generate-image-in-browser", "generate-video-in-browser"].includes(request?.capabilityId))
    return request?.inputs?.references;
  return undefined;
}

async function resolveAttachments(request, services) {
  const unique = [
    ...new Map(
      collectStoredFiles(attachmentInput(request)).map((file) => [file.id, file]),
    ).values(),
  ];
  if (unique.length > MAX_ATTACHMENTS)
    throw codedError("INVALID_INPUT", `Máximo de ${MAX_ATTACHMENTS} anexos por conversa.`);
  if (
    ["analyze-images-in-browser", "analyze-documents-in-browser"].includes(request?.capabilityId) &&
    !unique.length
  )
    throw codedError("INVALID_INPUT", "Nenhum arquivo autorizado foi recebido.");
  const resolved = [];
  for (const file of unique) {
    const path = await services.resolveInputFile(file);
    const extension = extname(file.name || path).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension))
      throw codedError("INVALID_INPUT", `Formato não suportado: ${extension || "sem extensão"}.`);
    if (request?.capabilityId === "analyze-images-in-browser" && !IMAGE_EXTENSIONS.has(extension))
      throw codedError("INVALID_INPUT", `A visão não aceita ${file.name}.`);
    if (
      request?.capabilityId === "analyze-documents-in-browser" &&
      !DOCUMENT_EXTENSIONS.has(extension)
    )
      throw codedError("INVALID_INPUT", `Documento não suportado: ${file.name}.`);
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_ATTACHMENT_BYTES)
      throw codedError("INVALID_INPUT", `Arquivo inválido ou acima de 512 MB: ${file.name}.`);
    resolved.push({ path, name: file.name || basename(path), size: info.size });
  }
  return resolved;
}

function defaultProfilesBasePath() {
  return join(homedir(), ".contentflow-os", "grok-browser-profiles");
}
function normalizeAccountProfile(value) {
  const name = String(value ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(name))
    throw codedError("INVALID_CONFIGURATION", "Perfil Grok inválido; use letras, números, _ ou -.");
  return name;
}
function profilePathFor(settings, name) {
  return join(settings?.profilesBasePath?.trim?.() || defaultProfilesBasePath(), name);
}
function runtimeProfilePath(settings, name, services) {
  if (settings?.profilesBasePath?.trim?.()) return profilePathFor(settings, name);
  return services.getWorkspacePath(join("browser-profiles", name));
}
function profileMarkerPath(path) {
  return join(path, ".contentflow-profile-ready.json");
}
async function profileIsPrepared(path, name) {
  try {
    const marker = JSON.parse(await readFile(profileMarkerPath(path), "utf8"));
    return marker?.provider === CHATGPT_HOST && marker?.profile === name;
  } catch {
    return false;
  }
}
async function markProfilePrepared(path, name) {
  await writeFile(
    profileMarkerPath(path),
    JSON.stringify({ provider: CHATGPT_HOST, profile: name, preparedAt: new Date().toISOString() }),
    "utf8",
  );
}
function profilePort(basePort, name) {
  if (name === "default") return basePort;
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return basePort + (hash % Math.min(1200, 65535 - basePort));
}
function assertDedicatedProfilePath(path) {
  const normalized = String(path).replaceAll("\\", "/").toLowerCase().replace(/\/+$/, "");
  if (
    normalized.endsWith("/google/chrome/user data") ||
    normalized.includes("/google/chrome/user data/default")
  )
    throw codedError("INVALID_CONFIGURATION", "Use um perfil Chrome dedicado ao plugin.");
}

async function captureProcess(executable, args, timeoutMs = 4000) {
  return await new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      });
    } catch {
      resolve({ ok: false, stdout: "" });
      return;
    }
    let stdout = "",
      settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, stdout });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish(false);
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
  });
}

function parseRegistryDefaultValue(output) {
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = line.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (match?.[1]) return match[1].trim().replace(/^"|"$/g, "");
  }
  return "";
}

async function chromeCandidates() {
  if (platform() === "win32") {
    const found = [];
    for (const key of [
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
    ]) {
      const result = await captureProcess("reg.exe", ["query", key, "/ve"]);
      if (result.ok) found.push(parseRegistryDefaultValue(result.stdout));
    }
    const where = await captureProcess("where.exe", ["chrome.exe"]);
    if (where.ok) found.push(...where.stdout.split(/\r?\n/));
    found.push(
      process.env.PROGRAMFILES &&
        join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    );
    return [
      ...new Set(
        found
          .filter(Boolean)
          .map(String)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
  }
  if (platform() === "darwin")
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const found = [];
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const result = await captureProcess("which", [name]);
    if (result.ok) found.push(...result.stdout.split(/\r?\n/));
  }
  return [...new Set(found.filter(Boolean))];
}

async function resolveChromeExecutables(settings) {
  if (settings?.chromeExecutable?.trim?.()) return [settings.chromeExecutable.trim()];
  const candidates = await chromeCandidates();
  if (!candidates.length)
    throw codedError(
      "INVALID_CONFIGURATION",
      "Google Chrome não localizado. Configure chromeExecutable.",
    );
  return candidates;
}

async function fetchBrowserVersion(port, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const value = await response.json();
    return typeof value?.webSocketDebuggerUrl === "string" ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function launchOrReuseChrome({
  executables,
  profilePath,
  port,
  startMinimized,
  keepBrowserOpen,
  signal,
}) {
  const existing = await fetchBrowserVersion(port);
  if (existing) return { version: existing, child: null };
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    CHATGPT_NEW_URL,
  ];
  if (startMinimized) args.unshift("--start-minimized");
  const failures = [];
  for (const executable of executables) {
    let child;
    try {
      child = spawn(executable, args, {
        detached: Boolean(keepBrowserOpen),
        stdio: "ignore",
        windowsHide: false,
        shell: false,
      });
    } catch (error) {
      failures.push(`${executable}: ${error?.message ?? error}`);
      continue;
    }
    if (keepBrowserOpen) child.unref();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const version = await fetchBrowserVersion(port);
      if (version) return { version, child };
      await sleep(350, signal);
    }
    failures.push(`${executable}: CDP não respondeu.`);
    try {
      child.kill();
    } catch {}
  }
  throw codedError(
    "PERMISSION_DENIED",
    `Não foi possível iniciar o Chrome dedicado. ${failures.slice(0, 3).join(" | ")}`,
  );
}

class CdpClient {
  constructor(wsUrl, trace) {
    this.wsUrl = wsUrl;
    this.trace = trace;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect(signal) {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const abort = () => reject(codedError("CANCELLED", "Execução cancelada."));
      signal?.addEventListener("abort", abort, { once: true });
      this.ws.addEventListener(
        "open",
        () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        },
        { once: true },
      );
      this.ws.addEventListener(
        "error",
        () => reject(codedError("UPSTREAM_UNAVAILABLE", "Falha ao conectar ao Chrome.")),
        { once: true },
      );
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () =>
      this.rejectAll(codedError("UPSTREAM_UNAVAILABLE", "Chrome desconectado.")),
    );
    return this;
  }
  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error)
      pending.reject(
        codedError("UPSTREAM_UNAVAILABLE", `CDP ${pending.method}: ${message.error.message}`),
      );
    else pending.resolve(message.result ?? {});
  }
  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  send(method, params = {}, sessionId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return Promise.reject(codedError("UPSTREAM_UNAVAILABLE", "CDP não conectado."));
    const id = this.nextId++,
      payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    if (method === "Input.insertText")
      this.trace?.(
        `Input.insertText length=${String(params.text ?? "").length}; sha256=${createHash("sha256")
          .update(String(params.text ?? ""))
          .digest("hex")
          .slice(0, 12)}`,
      );
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function evaluate(client, sessionId, expression) {
  const response = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId,
  );
  if (response.exceptionDetails)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      response.exceptionDetails?.exception?.description || "Erro na página do ChatGPT.",
    );
  return response.result?.value;
}

async function attachChatGptPage(client, signal) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  let target = targetInfos.find(
    (item) => item.type === "page" && String(item.url).includes(CHATGPT_HOST),
  );
  if (!target) {
    const created = await client.send("Target.createTarget", { url: CHATGPT_NEW_URL });
    target = { targetId: created.targetId };
  }
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  await client.send("Target.activateTarget", { targetId: target.targetId });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  try {
    await client.send("Page.bringToFront", {}, sessionId);
  } catch {
    // Target.activateTarget is still sufficient on Chrome builds without this command.
  }
  await sleep(300, signal);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      const ready = await evaluate(client, sessionId, "document.readyState");
      if (["interactive", "complete"].includes(ready)) break;
    } catch {}
    await sleep(300, signal);
  }
  return { sessionId };
}

const PAGE_HELPERS = String.raw`
function cfVisible(el){if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>8&&r.height>8&&r.bottom>0&&r.right>0}
function cfText(el){return [el?.innerText,el?.textContent,el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-testid')].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()}
function cfPrompt(){const selectors=['textarea[placeholder]','[contenteditable="true"][role="textbox"]','[contenteditable="true"]','[role="textbox"]'];for(const s of selectors){const all=[...document.querySelectorAll(s)].filter(cfVisible);const preferred=all.find(el=>/prompt|imagine|describe|ask|create|what/i.test([el.getAttribute('placeholder'),el.getAttribute('aria-label')].filter(Boolean).join(' ')));if(preferred)return preferred;if(all.length)return all.at(-1)}return null}
function cfAssistantNodes(){const selectors=['[data-testid="assistant-message"] .response-content-markdown','[data-testid="assistant-message"]','[data-message-author-role="assistant"] .markdown','[data-message-author-role="assistant"]','article[data-testid^="conversation-turn-"] .markdown'];for(const s of selectors){const n=[...document.querySelectorAll(s)].filter(cfVisible);if(n.length)return n}return []}
function cfResolveComparison(){const body=document.body?.innerText||'';if(!/giving feedback on a new version|qual resposta voc[êe] prefere|dando feedback sobre uma nova vers[ãa]o/i.test(body))return false;const button=[...document.querySelectorAll('button')].find(el=>cfVisible(el)&&/prefer this response|prefiro esta resposta|choose this response|escolher esta resposta/i.test(cfText(el)));if(!button)return false;button.click();return true}
function cfResponseState(){const comparisonResolved=cfResolveComparison(),nodes=cfAssistantNodes(),entries=nodes.map(el=>({text:(el.innerText||el.textContent||'').trim(),links:[...el.querySelectorAll('a[href]')].map(a=>({href:a.href,label:(a.innerText||a.textContent||'').trim()})).filter(x=>/^https:\/\//i.test(x.href))})).filter(x=>x.text);const stop=[...document.querySelectorAll('button')].some(el=>cfVisible(el)&&(/stop/i.test(cfText(el))||el.getAttribute('data-testid')==='stop-button'));return{texts:entries.map(x=>x.text),entries,stop,comparisonResolved,bodyHint:(document.body?.innerText||'').slice(0,6000)}}
`;

async function openNewConversation(client, sessionId, signal, url = CHATGPT_NEW_URL) {
  await client.send("Page.navigate", { url }, sessionId);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      if (await evaluate(client, sessionId, `(() => {${PAGE_HELPERS};return !!cfPrompt()})()`))
        return;
    } catch {}
    await sleep(350, signal);
  }
}

async function waitForPrompt(client, sessionId, waitMs, signal) {
  const deadline = Date.now() + waitMs;
  let state;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    state = await evaluate(
      client,
      sessionId,
      `(() => {${PAGE_HELPERS};const body=document.body?.innerText||'';return{host:location.hostname,prompt:!!cfPrompt(),login:/log in|sign up|entrar|criar conta/i.test(body),captcha:/captcha|verify you are human/i.test(body),bodyHint:body.slice(0,4000)}})()`,
    );
    if (state?.host === CHATGPT_HOST && state?.prompt && !state?.login) return;
    await sleep(700, signal);
  }
  if (state?.captcha)
    throw codedError("AUTHENTICATION_FAILED", "O ChatGPT exige verificação manual/CAPTCHA.", true);
  throw codedError(
    "AUTHENTICATION_FAILED",
    "Faça login no Grok na janela Chrome dedicada e tente novamente.",
    true,
  );
}

async function attachFiles(client, sessionId, attachments, signal) {
  if (!attachments.length) return;
  await client.send("DOM.enable", {}, sessionId);
  const { root } = await client.send("DOM.getDocument", { depth: 1, pierce: true }, sessionId);
  const { nodeIds = [] } = await client.send(
    "DOM.querySelectorAll",
    { nodeId: root.nodeId, selector: 'input[type="file"]' },
    sessionId,
  );
  if (!nodeIds.length)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Seletor de arquivos do Grok Imagine não encontrado.",
      true,
    );
  await client.send(
    "DOM.setFileInputFiles",
    { files: attachments.map((item) => item.path), nodeId: nodeIds[0] },
    sessionId,
  );
  const expected = attachments.map((item) => item.name.toLowerCase()),
    deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const body = await evaluate(client, sessionId, "(document.body?.innerText||'').toLowerCase()");
    if (expected.every((name) => body.includes(name))) return;
    if (/upload failed|couldn't upload|arquivo.*grande/i.test(body))
      throw codedError("INVALID_INPUT", "O Grok recusou um anexo.");
    await sleep(500, signal);
  }
  throw codedError("TIMEOUT", "Anexos não ficaram prontos em 120 segundos.", true);
}

async function clickMode(client, sessionId, mode, signal) {
  if (!mode || mode === "standard" || mode === "image") return;
  const pattern =
    mode === "search"
      ? "search the web|pesquisar na web"
      : mode === "deep"
        ? "deep research|pesquisa aprofundada"
        : mode === "video"
          ? "video|animate|motion|vídeo|animar"
          : "think|pensar";
  const point = await evaluate(
    client,
    sessionId,
    `(() => {${PAGE_HELPERS};const p=/${pattern}/i;const el=[...document.querySelectorAll('button,[role="menuitem"]')].find(x=>cfVisible(x)&&p.test(cfText(x)));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  // A geração de imagens também funciona no chat padrão quando a conta não
  // exibe o atalho "Criar uma imagem". Nesse caso o próprio prompt explícito
  // aciona a ferramenta, portanto não devemos abortar antes de enviá-lo.
  if (!point && ["image", "video", "search"].includes(mode)) return false;
  if (!point)
    throw codedError("PERMISSION_DENIED", `A conta atual não oferece o modo ${mode}.`, false);
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 },
    sessionId,
  );
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 },
    sessionId,
  );
  await sleep(300, signal);
  return true;
}

async function setPrompt(client, sessionId, prompt, settings, signal) {
  const target = await evaluate(
    client,
    sessionId,
    `(() => {${PAGE_HELPERS};const el=cfPrompt();if(!el)return null;el.focus();const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  if (!target)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Caixa de prompt não encontrada.", true);
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 },
    sessionId,
  );
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Backspace", code: "Backspace" },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Backspace", code: "Backspace" },
    sessionId,
  );
  const size = clampInteger(settings?.typingChunkSize, 10, 1, 50),
    delay = clampInteger(settings?.typingDelayMs, 10, 0, 200),
    chars = Array.from(prompt);
  for (let index = 0; index < chars.length; index += size) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    await client.send(
      "Input.insertText",
      { text: chars.slice(index, index + size).join("") },
      sessionId,
    );
    if (delay) await sleep(delay, signal);
  }
  // The ChatGPT ProseMirror editor can expose an enabled submit button before
  // the final inserted chunks reach its internal state. Give it one render
  // cycle before dispatching the trusted CDP click.
  await sleep(1_000, signal);
}

async function clickSend(client, sessionId, signal) {
  const deadline = Date.now() + 10_000;
  let point;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    point = await evaluate(
      client,
      sessionId,
      `(() => {${PAGE_HELPERS};const el=[...document.querySelectorAll('button')].find(x=>cfVisible(x)&&!x.disabled&&x.getAttribute('aria-disabled')!=='true'&&(x.getAttribute('data-testid')==='send-button'||/send|generate|create|submit|enviar|gerar|criar/i.test(cfText(x))));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    if (point) break;
    await sleep(200, signal);
  }
  if (!point)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Botão Enviar não ficou disponível.", true);
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 },
    sessionId,
  );
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 },
    sessionId,
  );
  const sent = async (deadline) => {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const submitted = await evaluate(
        client,
        sessionId,
        `(() => {${PAGE_HELPERS};const prompt=cfPrompt();const text=(prompt?.innerText||prompt?.textContent||'').trim();const stop=[...document.querySelectorAll('button')].some(el=>cfVisible(el)&&(/stop/i.test(cfText(el))||el.getAttribute('data-testid')==='stop-button'));return !text||stop})()`,
      );
      if (submitted) return true;
      await sleep(150, signal);
    }
    return false;
  };
  if (await sent(Date.now() + 2_500)) return;
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    },
    sessionId,
  );
  if (await sent(Date.now() + 2_500)) return;
  throw codedError("OUTPUT_VALIDATION_FAILED", "O ChatGPT não confirmou o envio do prompt.", true);
}

async function responseState(client, sessionId) {
  return await evaluate(client, sessionId, `(() => {${PAGE_HELPERS};return cfResponseState()})()`);
}
async function waitForResponse(client, sessionId, baselineCount, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let previous = "",
    stable = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await responseState(client, sessionId),
      texts = state?.texts ?? [],
      newest = texts.length > baselineCount ? texts.at(-1) : "";
    stable = newest && newest === previous ? stable + 1 : 0;
    previous = newest;
    if (newest && !state?.stop && stable >= 2)
      return { text: newest.trim(), links: state.entries?.at(-1)?.links ?? [] };
    const hint = String(state?.bodyHint ?? "");
    if (/usage limit|rate limit|reached.*limit|limite de uso/i.test(hint))
      throw codedError("RATE_LIMIT", "O ChatGPT informou limite temporário de uso.", true);
    if (/captcha|verify you are human/i.test(hint))
      throw codedError("AUTHENTICATION_FAILED", "O ChatGPT exige verificação manual.", true);
    await sleep(1000, signal);
  }
  throw codedError("TIMEOUT", "O ChatGPT não concluiu a resposta no prazo.", true);
}

async function generatePart(client, sessionId, prompt, settings, signal) {
  const before = await responseState(client, sessionId),
    baseline = before?.texts?.length ?? 0;
  await setPrompt(client, sessionId, prompt, settings, signal);
  await clickSend(client, sessionId, signal);
  return await waitForResponse(
    client,
    sessionId,
    baseline,
    clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000,
    signal,
  );
}

async function generateImagePart(client, sessionId, prompt, settings, signal) {
  const baseline = await evaluate(
    client,
    sessionId,
    `(() => [...document.querySelectorAll('main img, img')].filter(img=>img.complete&&img.naturalWidth>=512&&img.naturalHeight>=512&&!/avatar|logo|profile|photo edit|bg removal|character sprite|ugc photos|room staging|reimagine|e-commerce|icon maker|emoji creator|professional headshot|smart resize|photo collage|hero product reveal|product color change|mascot maker|editorial product poster|props & ui kit/i.test(img.alt||'')).map(img=>img.currentSrc||img.src).filter(Boolean))()`,
  );
  await setPrompt(client, sessionId, prompt, settings, signal);
  await clickSend(client, sessionId);
  const deadline =
    Date.now() + clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await evaluate(
      client,
      sessionId,
      `(() => {${PAGE_HELPERS};const before=new Set(${JSON.stringify(baseline)});const images=[...document.querySelectorAll('main img, img')].filter(img=>img.complete&&img.naturalWidth>=512&&img.naturalHeight>=512&&!/avatar|logo|profile|photo edit|bg removal|character sprite|ugc photos|room staging|reimagine|e-commerce|icon maker|emoji creator|professional headshot|smart resize|photo collage|hero product reveal|product color change|mascot maker|editorial product poster|props & ui kit/i.test(img.alt||''));const img=images.findLast(item=>!before.has(item.currentSrc||item.src));const stop=[...document.querySelectorAll('button')].some(el=>cfVisible(el)&&/stop|cancel generation|parar/i.test(cfText(el)));return{isNew:!!img,stop,alt:img?.alt||'Imagem gerada pelo Grok',src:img?.currentSrc||img?.src||''}})()`,
    );
    if (state.isNew && state.src && !state.stop)
      return { text: state.alt, links: [], mediaSrc: state.src };
    const body = await evaluate(client, sessionId, "(document.body?.innerText||'').slice(-4000)");
    if (/usage limit|rate limit|reached.*limit|limite de uso/i.test(body))
      throw codedError("RATE_LIMIT", "O Grok informou limite de geração de imagens.", true);
    await sleep(1200, signal);
  }
  throw codedError("TIMEOUT", "O Grok não concluiu a imagem no prazo.", true);
}

async function downloadMedia(client, sessionId, url, fallbackMimeType) {
  const directDownload = async () => {
    let cookie = "";
    try {
      const { cookies = [] } = await client.send("Network.getCookies", { urls: [url] }, sessionId);
      cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
    } catch {}
    const response = await fetch(url, {
      redirect: "follow",
      headers: cookie ? { cookie, referer: CHATGPT_NEW_URL } : { referer: CHATGPT_NEW_URL },
    });
    if (!response.ok)
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        `O CDN do Grok recusou o download do artefato (HTTP ${response.status}).`,
        true,
      );
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: (response.headers.get("content-type") || fallbackMimeType).split(";")[0],
    };
  };
  // MP4s não devem ser convertidos para base64 dentro da página: além do custo,
  // uma resposta do CDN pode manter Runtime.evaluate pendente indefinidamente.
  if (fallbackMimeType.startsWith("video/")) return await directDownload();
  try {
    let timer;
    const pageDownload = evaluate(
      client,
      sessionId,
      `(async()=>{const r=await fetch(${JSON.stringify(url)},{credentials:'include'});if(!r.ok)throw new Error('HTTP '+r.status);const b=new Uint8Array(await r.arrayBuffer());let s='';const n=32768;for(let i=0;i<b.length;i+=n)s+=String.fromCharCode(...b.subarray(i,i+n));return{base64:btoa(s),mimeType:(r.headers.get('content-type')||${JSON.stringify(fallbackMimeType)}).split(';')[0]}})()`,
    );
    const payload = await Promise.race([
      pageDownload,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("page download timeout")), 30000);
      }),
    ]).finally(() => clearTimeout(timer));
    return { bytes: Buffer.from(payload.base64, "base64"), mimeType: payload.mimeType };
  } catch {
    // Os artefatos do Imagine podem bloquear fetch dentro da página por CORS.
    return await directDownload();
  }
}

async function captureGeneratedImage(
  client,
  sessionId,
  services,
  request,
  timeoutMs,
  preferredSrc,
) {
  const deadline = Date.now() + timeoutMs;
  let imageData, payload;
  while (Date.now() < deadline) {
    if (services.signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    imageData = await evaluate(
      client,
      sessionId,
      `(() => {const images=[...document.querySelectorAll('main img, img')].filter(img=>img.complete&&img.naturalWidth>=512&&img.naturalHeight>=512&&!/avatar|logo|profile|photo edit|bg removal|character sprite|ugc photos|room staging|reimagine|e-commerce|icon maker|emoji creator|professional headshot|smart resize|photo collage|hero product reveal|product color change|mascot maker|editorial product poster|props & ui kit/i.test(img.alt||''));const img=images.at(-1);return img?{src:img.currentSrc||img.src,width:img.naturalWidth,height:img.naturalHeight,alt:img.alt||'Imagem gerada pelo Grok'}:null})()`,
    );
    if (!imageData?.src && preferredSrc) imageData = { ...(imageData || {}), src: preferredSrc };
    if (imageData?.src) {
      try {
        const candidate = await downloadMedia(client, sessionId, imageData.src, "image/png");
        // O Imagine publica primeiro um JPEG borrado de poucos KB. Aguarde o
        // src/arquivo final em vez de entregar esse placeholder como imagem.
        if (candidate.bytes.length >= 64 * 1024) {
          payload = candidate;
          break;
        }
      } catch (error) {
        if (!error?.retryable) throw error;
      }
    }
    await sleep(1000, services.signal);
  }
  if (!imageData?.src || !payload)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "A resposta terminou sem uma imagem final capturável; apenas o preview borrado foi encontrado.",
      true,
    );
  const bytes = payload.bytes;
  if (!bytes.length || bytes.length > 50 * 1024 * 1024)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Imagem gerada vazia ou acima de 50 MB.", true);
  const extension =
    payload.mimeType === "image/webp" ? "webp" : payload.mimeType === "image/jpeg" ? "jpg" : "png";
  const artifactId = `grok-image-${createHash("sha256")
    .update(
      `${request?.executionId || "execution"}:${request?.blockId || "block"}:${request?.attempt || 1}`,
    )
    .digest("hex")
    .slice(0, 16)}`;
  const name = `${artifactId}.${extension}`;
  await writeFile(services.getOutputPath(name), bytes);
  const file = {
    id: artifactId,
    name,
    mimeType: payload.mimeType,
    size: bytes.length,
    url: `artifact://${artifactId}`,
  };
  return {
    file,
    artifact: {
      id: artifactId,
      name,
      mimeType: payload.mimeType,
      size: bytes.length,
      source: { kind: "path", path: name },
    },
    dimensions: imageData,
  };
}

async function generateVideoPart(client, sessionId, prompt, settings, signal) {
  const baseline = await evaluate(
    client,
    sessionId,
    `(() => [...document.querySelectorAll('main video, video')].map(v=>v.currentSrc||v.src||v.querySelector('source')?.src||'').filter(Boolean))()`,
  );
  await setPrompt(client, sessionId, prompt, settings, signal);
  await clickSend(client, sessionId, signal);
  const deadline =
    Date.now() + clampInteger(settings?.responseTimeoutSeconds, 900, 30, 3600) * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await evaluate(
      client,
      sessionId,
      `(() => {${PAGE_HELPERS};const before=new Set(${JSON.stringify(baseline)});const videos=[...document.querySelectorAll('main video, video')];const v=videos.findLast(item=>!before.has(item.currentSrc||item.src||item.querySelector('source')?.src||''));const stop=[...document.querySelectorAll('button')].some(el=>cfVisible(el)&&/stop|cancel generation|parar/i.test(cfText(el)));return{isNew:!!v,ready:!!v&&v.readyState>=2,stop,src:v?.currentSrc||v?.src||v?.querySelector('source')?.src||''}})()`,
    );
    if (state.isNew && state.ready && state.src && !state.stop)
      return { text: "Vídeo gerado pelo Grok Imagine", links: [], mediaSrc: state.src };
    const body = await evaluate(client, sessionId, "(document.body?.innerText||'').slice(-4000)");
    if (/usage limit|rate limit|reached.*limit|limite de uso|credits? exhausted/i.test(body))
      throw codedError("RATE_LIMIT", "O Grok informou limite de geração de vídeo.", true);
    await sleep(1500, signal);
  }
  throw codedError("TIMEOUT", "O Grok não concluiu o vídeo no prazo.", true);
}

async function captureGeneratedVideo(
  client,
  sessionId,
  services,
  request,
  timeoutMs,
  preferredSrc,
) {
  const deadline = Date.now() + timeoutMs;
  let videoData;
  while (Date.now() < deadline) {
    if (services.signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    videoData = await evaluate(
      client,
      sessionId,
      `(() => {const videos=[...document.querySelectorAll('main video, video')].filter(v=>v.videoWidth>=256&&v.videoHeight>=144);const v=videos.at(-1);return v?{src:v.currentSrc||v.src||v.querySelector('source')?.src||'',width:v.videoWidth,height:v.videoHeight,duration:Number.isFinite(v.duration)?v.duration:0}:null})()`,
    );
    if (preferredSrc) videoData = { ...(videoData || {}), src: preferredSrc };
    if (videoData?.src) break;
    await sleep(1000, services.signal);
  }
  if (!videoData?.src)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "A resposta terminou sem um vídeo capturável.",
      true,
    );
  const payload = await downloadMedia(client, sessionId, videoData.src, "video/mp4");
  const bytes = payload.bytes;
  if (!bytes.length || bytes.length > 200 * 1024 * 1024)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Vídeo gerado vazio ou acima de 200 MB.", true);
  const extension = payload.mimeType === "video/webm" ? "webm" : "mp4";
  const artifactId = `grok-video-${createHash("sha256")
    .update(
      `${request?.executionId || "execution"}:${request?.blockId || "block"}:${request?.attempt || 1}`,
    )
    .digest("hex")
    .slice(0, 16)}`;
  const name = `${artifactId}.${extension}`;
  await writeFile(services.getOutputPath(name), bytes);
  const file = {
    id: artifactId,
    name,
    mimeType: payload.mimeType,
    size: bytes.length,
    url: `artifact://${artifactId}`,
  };
  return {
    file,
    artifact: {
      id: artifactId,
      name,
      mimeType: payload.mimeType,
      size: bytes.length,
      source: { kind: "path", path: name },
    },
    metadata: videoData,
  };
}

async function configureProfile(request, services) {
  const settings = request?.settings ?? {};
  let profileName, profilePath, port;
  try {
    profileName = normalizeAccountProfile(request?.configuration?.accountProfile);
    profilePath = runtimeProfilePath(settings, profileName, services);
    port = profilePort(
      clampInteger(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000),
      profileName,
    );
    assertDedicatedProfilePath(profilePath);
  } catch (error) {
    return resultError(
      error?.code || "INVALID_CONFIGURATION",
      error?.message || "Perfil inválido.",
    );
  }
  if (request?.invocation?.action === "status") {
    return {
      status: "success",
      values: { ready: await profileIsPrepared(profilePath, profileName) },
    };
  }
  if (request?.invocation?.action !== "prepare") {
    return resultError("INVALID_CONFIGURATION", "Ação de configuração de perfil inválida.");
  }

  let client, child;
  try {
    const launched = await launchOrReuseChrome({
      executables: await resolveChromeExecutables(settings),
      profilePath,
      port,
      startMinimized: false,
      keepBrowserOpen: false,
      signal: services.signal,
    });
    child = launched.child;
    client = await new CdpClient(launched.version.webSocketDebuggerUrl).connect(services.signal);
    const { sessionId } = await attachChatGptPage(client, services.signal);
    await openNewConversation(client, sessionId, services.signal);
    await waitForPrompt(
      client,
      sessionId,
      clampInteger(settings.interactiveWaitSeconds, 600, 30, 900) * 1000,
      services.signal,
    );
    await markProfilePrepared(profilePath, profileName);
    return {
      status: "success",
      values: { ready: true, message: `Perfil ${profileName} validado no Grok Imagine.` },
    };
  } catch (error) {
    return resultError(
      error?.code || "AUTHENTICATION_FAILED",
      error?.message || "Não foi possível validar o login do Grok.",
      Boolean(error?.retryable),
    );
  } finally {
    try {
      await client?.send("Browser.close");
    } catch {}
    client?.close();
    try {
      child?.kill();
    } catch {}
  }
}

export async function execute(request, services) {
  if (request?.invocation?.mode === "configure") return await configureProfile(request, services);
  const settings = request?.settings ?? {},
    capabilityId = String(request?.capabilityId ?? "generate-text-in-browser"),
    mock = String(settings.diagnosticMockResponse ?? "").trim();
  if (mock) {
    try {
      if (capabilityId === "choose-library-item-in-browser")
        return { status: "success", values: { result: parseSelectedItemId(mock, request) } };
      if (capabilityId === "validate-content-in-browser")
        return { status: "success", values: parseValidationValues(mock, request) };
      if (["search-web-in-browser", "deep-research-in-browser"].includes(capabilityId))
        return { status: "success", values: searchResponseValues(mock, [], request) };
      if (capabilityId === "generate-image-in-browser") {
        const bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        );
        const id = "grok-image-diagnostic";
        const name = `${id}.png`;
        await writeFile(services.getOutputPath(name), bytes);
        const image = {
          id,
          name,
          mimeType: "image/png",
          size: bytes.length,
          url: `artifact://${id}`,
        };
        return {
          status: "success",
          values: { image, description: mock },
          artifacts: [{ ...image, source: { kind: "path", path: name } }],
        };
      }
      if (capabilityId === "generate-video-in-browser")
        return resultError("INVALID_CONFIGURATION", "O diagnóstico de vídeo exige execução real.");
      return {
        status: "success",
        values: generationResponseValues(mock, [{ text: mock }], request),
      };
    } catch (error) {
      return resultError(
        error?.code || "OUTPUT_VALIDATION_FAILED",
        error?.message || "Resposta simulada inválida.",
      );
    }
  }

  let parts,
    mode = "standard";
  try {
    if (capabilityId === "generate-text-in-browser") {
      parts = buildParts(request);
      mode = request?.configuration?.reasoningMode ?? "standard";
    } else if (capabilityId === "search-web-in-browser") {
      parts = [buildSearchPrompt(request, false)];
      mode = "search";
    } else if (capabilityId === "deep-research-in-browser") {
      parts = [buildSearchPrompt(request, true)];
      mode = "deep";
    } else if (capabilityId === "choose-library-item-in-browser")
      parts = [buildChoosePrompt(request)];
    else if (capabilityId === "validate-content-in-browser")
      parts = [buildValidationPrompt(request)];
    else if (["analyze-images-in-browser", "analyze-documents-in-browser"].includes(capabilityId)) {
      parts = [buildAnalysisPrompt(request, capabilityId.includes("images"))];
      mode = request?.configuration?.reasoningMode ?? "standard";
    } else if (capabilityId === "generate-image-in-browser") {
      parts = [buildImagePrompt(request)];
      mode = "image";
    } else if (capabilityId === "generate-video-in-browser") {
      parts = [buildVideoPrompt(request)];
      mode = "video";
    } else throw codedError("INVALID_CONFIGURATION", `Capability desconhecida: ${capabilityId}.`);
  } catch (error) {
    return resultError(
      error?.code || "INVALID_CONFIGURATION",
      error?.message || "Configuração inválida.",
    );
  }

  const configuration = request?.configuration ?? {};
  let client, child;
  try {
    const profileName = normalizeAccountProfile(configuration.accountProfile),
      profilePath = runtimeProfilePath(settings, profileName, services),
      port = profilePort(
        clampInteger(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000),
        profileName,
      );
    const attachments = await resolveAttachments(request, services);
    assertDedicatedProfilePath(profilePath);
    if (!(await profileIsPrepared(profilePath, profileName))) {
      throw codedError(
        "AUTHENTICATION_FAILED",
        `O perfil Grok ${profileName} ainda não foi salvo. Use Salvar perfil antes de executar.`,
      );
    }
    const trace =
      settings.diagnosticTrace === true
        ? (message) => process.stderr.write(`[Grok Browser] ${message}\n`)
        : () => {};
    const step = (message) => process.stderr.write(`[Grok Browser] ${message}\n`);
    step(`Preparando perfil ${profileName} para ${parts.length} etapa(s).`);
    const launched = await launchOrReuseChrome({
      executables: await resolveChromeExecutables(settings),
      profilePath,
      port,
      startMinimized: settings.startMinimized === true,
      keepBrowserOpen: settings.keepBrowserOpen === true,
      signal: services.signal,
    });
    child = launched.child;
    client = await new CdpClient(launched.version.webSocketDebuggerUrl, trace).connect(
      services.signal,
    );
    const { sessionId } = await attachChatGptPage(client, services.signal);
    await openNewConversation(
      client,
      sessionId,
      services.signal,
      ["generate-image-in-browser", "generate-video-in-browser"].includes(capabilityId)
        ? CHATGPT_NEW_URL
        : CHATGPT_CHAT_URL,
    );
    await waitForPrompt(
      client,
      sessionId,
      clampInteger(settings.interactiveWaitSeconds, 600, 30, 900) * 1000,
      services.signal,
    );
    if (attachments.length) {
      step(`Enviando ${attachments.length} anexo(s) autorizado(s).`);
      await attachFiles(client, sessionId, attachments, services.signal);
    }
    await clickMode(client, sessionId, mode, services.signal);
    const responses = [],
      retryAttempts = clampInteger(configuration.retryAttempts, 1, 0, 3),
      delayBetweenPartsMs = clampInteger(configuration.delayBetweenPartsMs, 2000, 0, 30000);
    for (let index = 0; index < parts.length; index += 1) {
      let lastError;
      for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
        try {
          step(
            `Etapa ${index + 1}/${parts.length}, tentativa ${attempt + 1}/${retryAttempts + 1}.`,
          );
          responses.push(
            capabilityId === "generate-image-in-browser"
              ? await generateImagePart(client, sessionId, parts[index], settings, services.signal)
              : capabilityId === "generate-video-in-browser"
                ? await generateVideoPart(
                    client,
                    sessionId,
                    parts[index],
                    settings,
                    services.signal,
                  )
                : await generatePart(client, sessionId, parts[index], settings, services.signal),
          );
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (
            !error?.retryable ||
            attempt >= retryAttempts ||
            ["AUTHENTICATION_FAILED", "RATE_LIMIT"].includes(error?.code)
          )
            break;
          await sleep(2000 * (attempt + 1), services.signal);
        }
      }
      if (lastError) throw lastError;
      if (index < parts.length - 1) await sleep(delayBetweenPartsMs, services.signal);
    }
    const combined = responses.map((response) => response.text).join("\n\n"),
      sources = [
        ...new Set(responses.flatMap((response) => response.links).map((link) => link.href)),
      ].slice(0, clampInteger(configuration.maxSources, 10, 1, 50));
    let values;
    if (capabilityId === "generate-image-in-browser") {
      const captured = await captureGeneratedImage(
        client,
        sessionId,
        services,
        request,
        clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000,
        responses.at(-1)?.mediaSrc,
      );
      return {
        status: "success",
        values: { image: captured.file, description: combined.trim() },
        artifacts: [captured.artifact],
        usage: {
          provider: "xAI / Grok Imagine",
          outputUnits: captured.file.size,
          unit: "bytes",
        },
      };
    }
    if (capabilityId === "generate-video-in-browser") {
      const captured = await captureGeneratedVideo(
        client,
        sessionId,
        services,
        request,
        clampInteger(settings?.responseTimeoutSeconds, 900, 30, 3600) * 1000,
        responses.at(-1)?.mediaSrc,
      );
      return {
        status: "success",
        values: { video: captured.file, description: combined.trim() },
        artifacts: [captured.artifact],
        usage: { provider: "xAI / Grok Imagine", outputUnits: captured.file.size, unit: "bytes" },
      };
    }
    if (["search-web-in-browser", "deep-research-in-browser"].includes(capabilityId))
      values = searchResponseValues(combined.trim(), sources, request);
    else if (capabilityId === "choose-library-item-in-browser")
      values = { result: parseSelectedItemId(combined, request) };
    else if (capabilityId === "validate-content-in-browser")
      values = parseValidationValues(combined, request);
    else {
      const result =
        configuration.cleanOutput === false ? combined.trim() : cleanGeneratedText(combined);
      const minimum = clampInteger(configuration.minCharacters, 1, 1, 1000000);
      if (result.length < minimum)
        throw codedError(
          "OUTPUT_VALIDATION_FAILED",
          `Resultado com ${result.length} caracteres; mínimo ${minimum}.`,
          true,
        );
      values = generationResponseValues(result, responses, request);
    }
    return {
      status: "success",
      values,
      usage: { provider: "xAI / Grok web", outputUnits: combined.length, unit: "characters" },
    };
  } catch (error) {
    if (services.signal?.aborted || error?.code === "CANCELLED")
      return resultError("CANCELLED", "Execução cancelada.");
    return resultError(
      error?.code || "UPSTREAM_UNAVAILABLE",
      error?.message || "Falha na automação do ChatGPT.",
      Boolean(error?.retryable),
    );
  } finally {
    if (settings.keepBrowserOpen !== true)
      try {
        await client?.send("Browser.close");
      } catch {}
    client?.close();
    if (settings.keepBrowserOpen !== true && child) {
      try {
        child.kill();
      } catch {}
    }
  }
}

export const __test = {
  buildParts,
  buildSearchPrompt,
  buildChoosePrompt,
  buildValidationPrompt,
  buildAnalysisPrompt,
  buildImagePrompt,
  buildVideoPrompt,
  cleanGeneratedText,
  collectStoredFiles,
  expandTemplate,
  normalizeAccountProfile,
  outlineItems,
  parseSelectedItemId,
  parseValidationValues,
  profileIsPrepared,
  markProfilePrepared,
  profilePathFor,
  profilePort,
  searchResponseValues,
  generationResponseValues,
  summarizeBlock,
};
