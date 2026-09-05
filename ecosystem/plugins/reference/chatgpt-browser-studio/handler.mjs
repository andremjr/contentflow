import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join } from "node:path";
import { attachContentFlowBridge } from "./browser-bridge-client.mjs";

const PLUGIN_ID = "local.contentflow.chatgpt-browser-studio";
const CHATGPT_HOST = "chatgpt.com";
const CHATGPT_NEW_URL = "https://chatgpt.com/";
const DEFAULT_PORT = 9544;
const MAX_PARTS = 32;
const MAX_PROMPT_CHARACTERS = 500_000;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;
const PROFILE_SETUP_WAIT_MS = Number.POSITIVE_INFINITY;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const DOCUMENT_EXTENSIONS = new Set([
  ".md",
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
const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);

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

function promptContextInputs(request) {
  return request?.instructionContextInputs ?? request?.inputs;
}

function replaceAllLiteral(text, token, value) {
  return String(text)
    .split(token)
    .join(String(value ?? ""));
}

function expandTemplate(template, request) {
  const context = request?.context ?? {};
  const replacements = {
    "{{CONTENT}}": serializeInputs(promptContextInputs(request)),
    "{{CHANNEL_NAME}}": context?.channel?.name ?? "",
    "{{NICHE}}": context?.channel?.niche ?? "",
    "{{PROJECT_TITLE}}": context?.project?.title ?? "",
    "{{PROCESS}}": context?.processType ?? "",
    "{{BLOCK_INSTRUCTIONS}}":
      request?.resolvedInstruction || context?.block?.instructions || context?.block?.name || "",
    "{{TEMA}}": serializeInputs(promptContextInputs(request)),
    "{{NICHO}}": context?.channel?.niche ?? "",
  };
  let output = String(template ?? "");
  for (const [token, value] of Object.entries(replacements))
    output = replaceAllLiteral(output, token, value);
  for (const [key, value] of Object.entries(promptContextInputs(request) ?? {}))
    output = replaceAllLiteral(output, `{{INPUT:${key}}}`, serialize(value));
  return output.trim();
}

function ensureBlockInstruction(prompt, template, request) {
  const instruction = String(
    request?.resolvedInstruction ||
      request?.context?.block?.instructions ||
      request?.context?.block?.name ||
      "",
  ).trim();
  const expanded = String(prompt ?? "").trim();
  if (!instruction || String(template ?? "").includes("{{BLOCK_INSTRUCTIONS}}")) return expanded;
  if (expanded.includes(instruction)) return expanded;
  return `INSTRUÇÕES DO BLOCO:\n${instruction}\n\n${expanded}`.trim();
}

function ensureInputContext(prompt, template, request) {
  const sourceTemplate = String(template ?? "");
  if (sourceTemplate.includes("{{CONTENT}}") || sourceTemplate.includes("{{TEMA}}")) {
    return String(prompt ?? "").trim();
  }
  const remainingInputs = Object.fromEntries(
    Object.entries(promptContextInputs(request) ?? {}).filter(
      ([key]) => !sourceTemplate.includes(`{{INPUT:${key}}}`),
    ),
  );
  const context = serializeInputs(remainingInputs).trim();
  const expanded = String(prompt ?? "").trim();
  if (!context || expanded.includes(context)) return expanded;
  return `${expanded}\n\nCONTEXTO DAS ENTRADAS:\n${context}`.trim();
}

function expandPrimaryTemplate(template, request) {
  return ensureInputContext(
    ensureBlockInstruction(expandTemplate(template, request), template, request),
    template,
    request,
  );
}

function buildInstructionPrompt(request, additions = []) {
  const instruction = String(request?.resolvedInstruction ?? "").trim();
  if (!instruction)
    throw codedError("INVALID_INPUT", "A instrução resolvida do bloco é obrigatória.");
  const prompt = [expandPrimaryTemplate("", request), ...additions.map(String).filter(Boolean)]
    .join("\n\n")
    .trim();
  if (prompt.length > MAX_PROMPT_CHARACTERS)
    throw codedError("INVALID_INPUT", `O prompt ultrapassou ${MAX_PROMPT_CHARACTERS} caracteres.`);
  return prompt;
}

function expandCapabilityTemplate(template, replacements, request) {
  let output = String(template ?? "");
  for (const [token, value] of Object.entries(replacements))
    output = replaceAllLiteral(output, token, typeof value === "string" ? value : serialize(value));
  return ensureBlockInstruction(expandTemplate(output, request), template, request);
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
  return [
    buildInstructionPrompt(request, [
      "FORMATO OBRIGATÓRIO: entregue o conteúdo diretamente como texto, sem criar arquivos ou canvas.",
    ]),
  ];
}

function buildSearchPrompt(request, _deep = false) {
  const prompt = buildInstructionPrompt(request);
  if (!prompt) throw codedError("INVALID_INPUT", "A consulta ficou vazia.");
  return prompt;
}

function buildChoosePrompt(request) {
  const collection = request?.context?.selectedCollection;
  if (!collection || !Array.isArray(collection.items) || !collection.items.length)
    throw codedError("INVALID_INPUT", "O bloco Escolher precisa de uma coleção com itens.");
  return buildInstructionPrompt(request, [
    `ITENS DISPONÍVEIS:\n${serialize(collection.items)}`,
    'Responda somente JSON válido: {"selectedItemId":"ID_EXATO_DO_ITEM"}.',
  ]);
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
  return buildInstructionPrompt(request, [validationOutputInstruction(mode)]);
}

function buildAnalysisPrompt(request, _image) {
  return buildInstructionPrompt(request);
}

function buildImagePrompt(request) {
  const prompt = buildInstructionPrompt(request);
  if (!prompt) throw codedError("INVALID_INPUT", "O prompt da imagem ficou vazio.");
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
  if (items.some((item) => item.id === candidate)) return candidate;
  const mentionedIds = items.map((item) => item.id).filter((id) => String(text).includes(id));
  if (mentionedIds.length === 1) return mentionedIds[0];
  throw codedError(
    "OUTPUT_VALIDATION_FAILED",
    "O ChatGPT não devolveu um único ID exato permitido.",
    true,
  );
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
  for (const field of request?.outputContract ?? []) {
    if (field?.key === "parts") values.parts = responses.map((response) => response.text);
    else if (["list", "multiselect"].includes(field?.type)) values[field.key] = textAsList(result);
    else values[field.key] = result;
  }
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
  if (request?.capabilityId === "generate-image-in-browser") return request?.inputs?.references;
  return undefined;
}

async function resolveAttachments(request, services) {
  const kind =
    request?.capabilityId === "analyze-images-in-browser"
      ? "image"
      : request?.capabilityId === "analyze-documents-in-browser"
        ? "document"
        : "supported";
  const resolved = await resolveStoredFileAttachments(attachmentInput(request), services, kind);
  if (
    ["analyze-images-in-browser", "analyze-documents-in-browser"].includes(request?.capabilityId) &&
    !resolved.length
  )
    throw codedError("INVALID_INPUT", "Nenhum arquivo autorizado foi recebido.");
  return resolved;
}

async function resolveFallbackAttachments(request, services) {
  return resolveStoredFileAttachments(
    request?.conversation?.fallbackAttachments,
    services,
    "image",
  );
}

async function resolveStoredFileAttachments(value, services, kind) {
  const unique = [...new Map(collectStoredFiles(value).map((file) => [file.id, file])).values()];
  if (unique.length > MAX_ATTACHMENTS)
    throw codedError("INVALID_INPUT", `Máximo de ${MAX_ATTACHMENTS} anexos por conversa.`);
  const resolved = [];
  for (const file of unique) {
    let path = await services.resolveInputFile(file);
    let name = file.name || basename(path);
    let extension = extname(name || path).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension))
      throw codedError("INVALID_INPUT", `Formato não suportado: ${extension || "sem extensão"}.`);
    if (kind === "image" && !IMAGE_EXTENSIONS.has(extension))
      throw codedError("INVALID_INPUT", `A visão não aceita ${file.name}.`);
    if (kind === "document" && !DOCUMENT_EXTENSIONS.has(extension))
      throw codedError("INVALID_INPUT", `Documento não suportado: ${file.name}.`);
    if (extension === ".md") {
      const base = basename(name, extension)
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .slice(0, 100);
      name = `${base || "contexto"}.txt`;
      const normalizedPath = services.getOutputPath(name);
      await writeFile(normalizedPath, await readFile(path));
      path = normalizedPath;
      extension = ".txt";
    }
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_ATTACHMENT_BYTES)
      throw codedError("INVALID_INPUT", `Arquivo inválido ou acima de 512 MB: ${file.name}.`);
    resolved.push({ path, name, size: info.size });
  }
  return resolved;
}

export function attachmentsForConversation(primary, fallback, reused, continuationMessage) {
  if (reused && String(continuationMessage ?? "").trim()) return [];
  const candidates = reused ? primary : [...primary, ...fallback];
  const unique = [...new Map(candidates.map((item) => [item.path, item])).values()];
  if (unique.length > MAX_ATTACHMENTS)
    throw codedError("INVALID_INPUT", `Máximo de ${MAX_ATTACHMENTS} anexos por conversa.`);
  return unique;
}

function defaultProfilesBasePath() {
  return join(homedir(), ".contentflow", "chatgpt-browser-profiles");
}
function normalizeAccountProfile(value) {
  const name = String(value ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(name))
    throw codedError(
      "INVALID_CONFIGURATION",
      "Perfil ChatGPT inválido; use letras, números, _ ou -.",
    );
  return name;
}
function profilePathFor(settings, name) {
  return join(settings?.profilesBasePath?.trim?.() || defaultProfilesBasePath(), name);
}
function runtimeProfilePath(settings, name, services) {
  if (settings?.profilesBasePath?.trim?.()) return profilePathFor(settings, name);
  return services.getWorkspacePath(name);
}
function profileMarkerPath(path) {
  return join(path, ".contentflow-profile-ready.json");
}
async function profileIsPrepared(path, name) {
  try {
    const marker = JSON.parse(await readFile(profileMarkerPath(path), "utf8"));
    return (
      marker?.provider === CHATGPT_HOST && marker?.profile === name && marker?.bridgeProtocol === 2
    );
  } catch {
    return false;
  }
}
async function markProfilePrepared(path, name) {
  await writeFile(
    profileMarkerPath(path),
    JSON.stringify({
      provider: CHATGPT_HOST,
      profile: name,
      bridgeProtocol: 2,
      preparedAt: new Date().toISOString(),
    }),
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
function assertDedicatedProfilePath(path, allowExistingChromeProfile = false) {
  if (allowExistingChromeProfile) return;
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
    const standardCandidates = [
      process.env.PROGRAMFILES &&
        join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ].filter(Boolean);
    const existing = standardCandidates.filter((p) => existsSync(p));
    if (existing.length) return [...new Set(existing)];

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
  if (existing) return { version: existing, child: null, reused: true };
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
      if (version) return { version, child, reused: false };
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

function responsePhase({ hasNewResponse, generating, stablePolls }) {
  if (!hasNewResponse) return "awaiting_response";
  if (generating) return "streaming";
  if (stablePolls < 2) return "stabilizing";
  return "completed";
}

async function waitForDomMutation(client, sessionId, waitMs, signal) {
  if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
  const timeoutMs = clampInteger(waitMs, 1_000, 100, 5_000);
  try {
    await evaluate(
      client,
      sessionId,
      `(() => new Promise(resolve => { const root=document.documentElement; if(!root){resolve('no-root');return} let settled=false; const finish=reason=>{if(settled)return;settled=true;observer.disconnect();clearTimeout(timer);resolve(reason)}; const observer=new MutationObserver(()=>finish('mutation')); observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy','aria-disabled','data-testid']}); const timer=setTimeout(()=>finish('watchdog'),${timeoutMs}); }))()`,
    );
  } catch {
    // SPA navigation can destroy the evaluated context. Polling remains the watchdog.
    await sleep(Math.min(timeoutMs, 250), signal);
  }
}

function normalizeEditorText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

async function attachChatGptPage(client, signal, activate = false, forceNew = false) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  let target = forceNew
    ? undefined
    : targetInfos.find((item) => item.type === "page" && String(item.url).includes(CHATGPT_HOST));
  let created = false;
  if (!target) {
    const result = await client.send("Target.createTarget", {
      url: CHATGPT_NEW_URL,
      background: !activate,
    });
    target = { targetId: result.targetId };
    created = true;
  }
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  if (activate) await client.send("Target.activateTarget", { targetId: target.targetId });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  if (activate) await client.send("Page.bringToFront", {}, sessionId).catch(() => undefined);
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
  return { sessionId, targetId: target.targetId, created };
}

function taskPageMarker(request) {
  return `contentflow-${createHash("sha256")
    .update(
      [
        request?.executionId || "execution",
        request?.blockId || "block",
        Number(request?.attempt) || 1,
        request?.traceId || "trace",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 24)}`;
}

async function markTaskPage(client, sessionId, request, signal) {
  const marker = taskPageMarker(request);
  await evaluate(
    client,
    sessionId,
    `(() => { const marker=${JSON.stringify(marker)}; const url=new URL(location.href); url.hash=marker; history.replaceState(history.state, '', url); return location.href; })()`,
  );
  // chrome.tabs.query observes history.replaceState asynchronously. A short
  // wait lets the Browser Bridge match the exact task tab instead of another
  // provider tab with the same pathname.
  await sleep(200, signal);
  return marker;
}

const GENERATION_STOP_PATTERN = /\b(stop|parar|detener|interromper)\b/i;

export function generationControlIsStop(text, testId) {
  return String(testId ?? "") === "stop-button" || GENERATION_STOP_PATTERN.test(String(text ?? ""));
}

// Runs in the provider page. Uploaded references can use the same content URL
// and alt text as generated images after submission, so URL/alt alone cannot
// establish provenance. Require an assistant message or assistant turn.
export function collectGeneratedImages(doc) {
  const unique = new Map();
  for (const img of doc.querySelectorAll("img")) {
    if (img.closest('form, [data-message-author-role="user"], [data-turn="user"]')) continue;
    const owner = img.closest("[data-message-author-role], [data-turn]");
    const role =
      owner?.getAttribute("data-message-author-role") || owner?.getAttribute("data-turn");
    const turn = img.closest('article[data-testid^="conversation-turn-"]');
    const assistantOwned =
      role === "assistant" ||
      (!role &&
        turn &&
        !turn.querySelector('[data-message-author-role="user"]') &&
        turn.querySelector('[data-message-author-role="assistant"]'));
    if (!assistantOwned) continue;
    const src = img.currentSrc || img.src || "",
      alt = img.alt || "";
    if (
      !img.complete ||
      img.naturalWidth < 256 ||
      img.naturalHeight < 256 ||
      (!/generated image|imagem gerada/i.test(alt) && !src.includes("backend-api/estuary/content"))
    )
      continue;
    if (!unique.has(src))
      unique.set(src, {
        src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: alt || "Imagem gerada",
      });
  }
  return [...unique.values()];
}

const PAGE_HELPERS = String.raw`
function cfVisible(el){if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>8&&r.height>8&&r.bottom>0&&r.right>0}
function cfText(el){return [el?.innerText,el?.textContent,el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-testid')].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()}
function cfGenerating(){const stopPattern=new RegExp(${JSON.stringify(GENERATION_STOP_PATTERN.source)},'i');return [...document.querySelectorAll('button')].some(el=>cfVisible(el)&&(stopPattern.test(cfText(el))||el.getAttribute('data-testid')==='stop-button'))}
function cfPrompt(){const selectors=['#prompt-textarea','[contenteditable="true"][role="textbox"]','[role="textbox"][aria-label*="Chat" i]'];for(const s of selectors){const el=[...document.querySelectorAll(s)].find(cfVisible);if(el)return el}return null}
function cfAssistantNodes(){const selectors=['[data-message-author-role="assistant"] .markdown','[data-message-author-role="assistant"]','article[data-testid^="conversation-turn-"] .markdown'];for(const s of selectors){const n=[...document.querySelectorAll(s)].filter(cfVisible);if(n.length)return n}return []}
function cfGeneratedImages(){return (${collectGeneratedImages.toString()})(document)}
function cfResolveComparison(){const body=document.body?.innerText||'';if(!/giving feedback on a new version|qual resposta voc[êe] prefere|dando feedback sobre uma nova vers[ãa]o/i.test(body))return false;const button=[...document.querySelectorAll('button')].find(el=>cfVisible(el)&&/prefer this response|prefiro esta resposta|choose this response|escolher esta resposta/i.test(cfText(el)));if(!button)return false;button.click();return true}
function cfResponseState(){const comparisonResolved=cfResolveComparison(),nodes=cfAssistantNodes(),entries=nodes.map(el=>({text:(el.innerText||el.textContent||'').trim(),links:[...el.querySelectorAll('a[href]')].map(a=>({href:a.href,label:(a.innerText||a.textContent||'').trim()})).filter(x=>/^https:\/\//i.test(x.href))})).filter(x=>x.text);return{texts:entries.map(x=>x.text),entries,stop:cfGenerating(),comparisonResolved,bodyHint:(document.body?.innerText||'').slice(0,6000)}}
`;

async function openNewConversation(client, sessionId, signal) {
  await client.send("Page.navigate", { url: CHATGPT_NEW_URL }, sessionId);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      // Page.navigate returns before the previous conversation disappears. Waiting
      // only for the composer can therefore capture the old response count and
      // make the next generation wait forever for a non-existent extra answer.
      if (
        await evaluate(
          client,
          sessionId,
          `(() => {${PAGE_HELPERS};return location.hostname==='${CHATGPT_HOST}'&&location.pathname==='/'&&document.readyState!=='loading'&&!!cfPrompt()})()`,
        )
      )
        return;
    } catch {}
    await sleep(350, signal);
  }
  throw codedError("UPSTREAM_UNAVAILABLE", "O ChatGPT não abriu uma conversa nova no prazo.", true);
}

async function openConversation(client, sessionId, conversation, signal) {
  if (conversation?.mode !== "reuse") {
    await openNewConversation(client, sessionId, signal);
    return false;
  }
  const conversationUrl = validateConversationUrl(conversation.id);
  await client.send("Page.navigate", { url: conversationUrl }, sessionId);
  return true;
}

export function validateConversationUrl(id) {
  let url;
  try {
    url = new URL(id);
  } catch {
    throw codedError("INVALID_INPUT", "A referência da conversa do ChatGPT é inválida.");
  }
  if (url.protocol !== "https:" || url.hostname !== CHATGPT_HOST || !url.pathname.startsWith("/c/"))
    throw codedError("INVALID_INPUT", "A referência não pertence a uma conversa do ChatGPT.");
  return url.href;
}

async function prepareConversation(client, sessionId, conversation, waitMs, signal) {
  let reused = await openConversation(client, sessionId, conversation, signal);
  try {
    await waitForPrompt(client, sessionId, waitMs, signal);
    if (reused) validateConversationUrl(await evaluate(client, sessionId, "location.href"));
  } catch (error) {
    if (!reused || !conversation?.fallbackContext) throw error;
    await openNewConversation(client, sessionId, signal);
    await waitForPrompt(client, sessionId, waitMs, signal);
    reused = false;
  }
  return reused;
}

export function partsForConversation(parts, conversation, reused) {
  const continuation = String(conversation?.continuationMessage ?? "").trim();
  const fallbackContext = String(conversation?.fallbackContext ?? "").trim();
  if (reused && continuation) return [continuation];
  if (!reused && fallbackContext) {
    const requestText = continuation || parts.join("\n\n");
    return [`${fallbackContext}\n\nNOVA SOLICITAÇÃO:\n${requestText}`];
  }
  return parts;
}

async function currentConversationUrl(client, sessionId) {
  return validateConversationUrl(await evaluate(client, sessionId, "location.href"));
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
    "Faça login no ChatGPT na janela Chrome dedicada e tente novamente.",
    true,
  );
}

// Runs in the provider page. Restrict observations to the composer so images
// and filenames in previous messages cannot satisfy the current upload.
export function composerUploadState(doc) {
  const prompt = doc.querySelector('#prompt-textarea, [contenteditable="true"][role="textbox"]');
  const sendSelector = 'button[data-testid="send-button"], button#composer-submit-button';
  let composer = prompt?.closest("form");
  if (!composer) {
    composer = prompt?.parentElement;
    while (composer && composer !== doc.body && !composer.querySelector(sendSelector))
      composer = composer.parentElement;
  }
  if (!composer || composer === doc.body) return null;
  const visible = (el) => {
    const style = doc.defaultView.getComputedStyle(el);
    return (
      style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0
    );
  };
  const text = [
    composer.innerText,
    ...[...composer.querySelectorAll("[aria-label], [title]")]
      .filter(visible)
      .map((el) => `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`),
  ]
    .join(" ")
    .toLowerCase();
  const send = composer.querySelector(sendSelector);
  const sendLabel = `${send?.getAttribute("aria-label") || ""} ${send?.getAttribute("data-testid") || ""}`;
  // A blob preview can be decoded before the server has received the file.
  // ChatGPT also uses CSS-animated SVGs and blurred previews during upload.
  const outsidePrompt = (el) => !prompt?.contains(el);
  const images = [...composer.querySelectorAll("img")].filter(visible);
  const uploadingPreview = images.some((img) => {
    if (!img.complete || !img.naturalWidth) return true;
    for (let el = img; el && el !== composer; el = el.parentElement) {
      if (/blur\((?!0(?:px)?\))/.test(doc.defaultView.getComputedStyle(el).filter || ""))
        return true;
    }
    return false;
  });
  const animatedUpload = [...composer.querySelectorAll('svg, svg *, [class*="animate-"]')]
    .filter((el) => visible(el) && outsidePrompt(el))
    .some((el) => {
      const style = doc.defaultView.getComputedStyle(el);
      return (
        style.animationName &&
        style.animationName !== "none" &&
        style.animationPlayState !== "paused"
      );
    });
  const alerts = [...composer.querySelectorAll('[role="alert"], [data-state="error"]')]
    .filter((el) => visible(el) && outsidePrompt(el))
    .map((el) => el.innerText || el.textContent || "")
    .join(" ");
  return {
    text,
    hasPrompt: Boolean((prompt?.innerText || prompt?.textContent || "").trim()),
    previews: [
      ...new Set(
        [...composer.querySelectorAll("img")]
          .filter(
            (img) =>
              visible(img) && img.complete && img.naturalWidth >= 32 && img.naturalHeight >= 32,
          )
          .map((img) => img.currentSrc || img.src)
          .filter(Boolean),
      ),
    ],
    busy:
      uploadingPreview ||
      animatedUpload ||
      [
        ...composer.querySelectorAll('[role="progressbar"], [aria-busy="true"], .animate-spin'),
      ].some(visible),
    sendEnabled: Boolean(
      send &&
      visible(send) &&
      !send.disabled &&
      !send.matches?.(":disabled") &&
      send.getAttribute("aria-disabled") !== "true" &&
      doc.defaultView.getComputedStyle(send).pointerEvents !== "none" &&
      /send-button|\b(?:send|enviar|envoyer|senden)\b/i.test(sendLabel) &&
      !/stop|parar|detener|interromper/i.test(sendLabel),
    ),
    error:
      /upload failed|couldn't upload|falha.*(?:upload|carregar|enviar)|erro.*(?:upload|carregar)|arquivo.*grande/i.test(
        alerts,
      ),
  };
}

export function attachmentsAreReady(state, attachments, baselinePreviews = []) {
  if (!state || state.error || state.busy || !state.sendEnabled) return false;
  const named = (file) => state.text.includes(file.name.toLowerCase());
  if (attachments.every(named)) return true;
  const images = attachments.filter((file) =>
    IMAGE_EXTENSIONS.has(extname(file.name).toLowerCase()),
  );
  const documents = attachments.filter((file) => !images.includes(file));
  const baseline = new Set(baselinePreviews);
  const newPreviews = new Set(state.previews.filter((src) => !baseline.has(src)));
  return images.length > 0 && documents.every(named) && newPreviews.size >= images.length;
}

async function attachFiles(client, sessionId, attachments, signal) {
  if (!attachments.length) return;
  const readState = () =>
    evaluate(client, sessionId, `(${composerUploadState.toString()})(document)`);
  const baseline = await readState();
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
      "Seletor de arquivos do ChatGPT não encontrado.",
      true,
    );
  await client.send(
    "DOM.setFileInputFiles",
    { files: attachments.map((item) => item.path), nodeId: nodeIds[0] },
    sessionId,
  );
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await readState();
    if (state?.error) throw codedError("INVALID_INPUT", "O ChatGPT recusou um anexo.");
    if (attachmentsAreReady(state, attachments, baseline?.previews)) return;
    await sleep(500, signal);
  }
  throw codedError("TIMEOUT", "Anexos não ficaram prontos em 120 segundos.", true);
}

async function clickMode(bridge, mode) {
  // Search web is prompt-driven. Requiring a UI toggle makes the capability
  // fail when ChatGPT moves or omits the shortcut even though the same request
  // works when it is stated explicitly in the prompt.
  if (!mode || mode === "standard" || mode === "search") return;
  const terms =
    mode === "deep"
      ? ["deep research", "pesquisa aprofundada"]
      : mode === "image"
        ? ["create an image", "criar uma imagem"]
        : ["think", "pensar"];
  // A geração de imagens também funciona no chat padrão quando a conta não
  // exibe o atalho "Criar uma imagem". Nesse caso o próprio prompt explícito
  // aciona a ferramenta, portanto não devemos abortar antes de enviá-lo.
  const clickRequestedMode = (operationKey) =>
    bridge.dispatch(
      "click",
      { selectors: ["button", '[role="menuitem"]'], textIncludes: terms },
      operationKey,
    );
  try {
    await clickRequestedMode(`mode:${mode}:direct`);
    return true;
  } catch {
    try {
      await bridge.dispatch(
        "click",
        {
          selectors: ["button", '[role="button"]'],
          textIncludes: ["tools", "use tools", "ferramentas", "usar ferramentas"],
        },
        `mode:${mode}:open-tools`,
      );
      await clickRequestedMode(`mode:${mode}:from-tools`);
      return true;
    } catch (error) {
      if (mode === "image" && error?.code === "OUTPUT_VALIDATION_FAILED") return false;
      throw codedError("PERMISSION_DENIED", `A conta atual não oferece o modo ${mode}.`, false);
    }
  }
}

async function setPrompt(bridge, prompt, operationKey) {
  await bridge.dispatch(
    "setText",
    {
      selectors: [
        "#prompt-textarea",
        '[contenteditable="true"][role="textbox"]',
        '[role="textbox"][aria-label*="Chat" i]',
      ],
      text: prompt,
    },
    operationKey,
  );
}

export async function waitAndClickSend(readState, click, signal, timing = {}) {
  const now = timing.now || Date.now;
  const pause = timing.pause || sleep;
  const deadline = now() + (timing.timeoutMs ?? 120000);
  let readyPolls = 0;
  let attempt = 0;
  while (now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await readState();
    if (state?.error) throw codedError("INVALID_INPUT", "O ChatGPT recusou um anexo.");
    readyPolls = state?.hasPrompt && state.sendEnabled && !state.busy ? readyPolls + 1 : 0;
    if (readyPolls < 2) {
      await pause(500, signal);
      continue;
    }
    try {
      await click(attempt++);
      return;
    } catch (error) {
      // A button can become disabled between observation and dispatch. Wait
      // for readiness again, without treating a slow upload as a failed job.
      if (error?.code !== "OUTPUT_VALIDATION_FAILED") throw error;
      readyPolls = 0;
      await pause(500, signal);
    }
  }
  throw codedError(
    "TIMEOUT",
    "O ChatGPT não liberou o envio após aguardar os anexos por 120 segundos.",
    true,
  );
}

async function clickSend(client, sessionId, bridge, signal, operationKey) {
  await waitAndClickSend(
    () => evaluate(client, sessionId, `(${composerUploadState.toString()})(document)`),
    (attempt) =>
      bridge.dispatch(
        "click",
        {
          selectors: [
            'button[data-testid="send-button"]:not(:disabled):not([aria-disabled="true"])',
          ],
        },
        `${operationKey}:${attempt}`,
      ),
    signal,
  );
  const sent = async (deadline) => {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const submitted = await evaluate(
        client,
        sessionId,
        `(() => {${PAGE_HELPERS};const prompt=cfPrompt();const text=(prompt?.innerText||prompt?.textContent||'').trim();return !text||cfGenerating()})()`,
      );
      if (submitted) return true;
      await sleep(150, signal);
    }
    return false;
  };
  if (await sent(Date.now() + 15_000)) return;
  throw codedError("OUTPUT_VALIDATION_FAILED", "O ChatGPT não confirmou o envio do prompt.", true);
}

async function responseState(client, sessionId) {
  return await evaluate(client, sessionId, `(() => {${PAGE_HELPERS};return cfResponseState()})()`);
}
async function waitForResponse(client, sessionId, baselineCount, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let previous = "",
    stable = 0,
    stableSince = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await responseState(client, sessionId),
      texts = state?.texts ?? [],
      newest = texts.length > baselineCount ? texts.at(-1) : "";
    if (newest && newest === previous) {
      stable += 1;
    } else {
      stable = 0;
      stableSince = newest ? Date.now() : 0;
    }
    previous = newest;
    const phase = responsePhase({
      hasNewResponse: Boolean(newest),
      generating: Boolean(state?.stop),
      stablePolls: stable,
    });
    // A interface pode ocultar momentaneamente o botão "Parar" durante uma
    // pausa longa do streaming. Exigir uma janela contínua sem alterações evita
    // capturar apenas o primeiro fragmento de uma resposta ainda em produção.
    if (phase === "completed" && Date.now() - stableSince >= 12_000) {
      await sleep(5_000, signal);
      const confirmedState = await responseState(client, sessionId);
      const confirmedTexts = confirmedState?.texts ?? [];
      const confirmedNewest = confirmedTexts.length > baselineCount ? confirmedTexts.at(-1) : "";
      if (confirmedNewest === newest && !confirmedState?.stop) {
        return {
          text: confirmedNewest.trim(),
          links: confirmedState.entries?.at(-1)?.links ?? [],
        };
      }
      previous = confirmedNewest;
      stable = 0;
      stableSince = confirmedNewest ? Date.now() : 0;
      continue;
    }
    const hint = String(state?.bodyHint ?? "");
    if (/usage limit|rate limit|reached.*limit|limite de uso/i.test(hint))
      throw codedError("RATE_LIMIT", "O ChatGPT informou limite temporário de uso.", true);
    if (/captcha|verify you are human/i.test(hint))
      throw codedError("AUTHENTICATION_FAILED", "O ChatGPT exige verificação manual.", true);
    await waitForDomMutation(client, sessionId, 1_000, signal);
  }
  throw codedError("TIMEOUT", "O ChatGPT não concluiu a resposta no prazo.", true);
}

async function generatePart(client, sessionId, bridge, prompt, settings, signal, operationKey) {
  const before = await responseState(client, sessionId),
    baseline = before?.texts?.length ?? 0;
  await setPrompt(bridge, prompt, `prompt:${operationKey}`);
  await clickSend(client, sessionId, bridge, signal, `send:${operationKey}`);
  return await waitForResponse(
    client,
    sessionId,
    baseline,
    clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000,
    signal,
  );
}

async function generateImagePart(
  client,
  sessionId,
  bridge,
  prompt,
  settings,
  signal,
  operationKey,
) {
  const baselineImages = await evaluate(
    client,
    sessionId,
    `(() => {${PAGE_HELPERS};return cfGeneratedImages()})()`,
  );
  const baselineSources = (baselineImages ?? []).map((image) => image.src).filter(Boolean);
  await setPrompt(bridge, prompt, `image-prompt:${operationKey}`);
  await clickSend(client, sessionId, bridge, signal, `image-send:${operationKey}`);
  const deadline =
    Date.now() + clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await evaluate(
      client,
      sessionId,
      `(() => {${PAGE_HELPERS};const images=cfGeneratedImages();return{images,stop:cfGenerating(),href:location.href}})()`,
    );
    const newImages = generatedImagesAfterBaseline(state.images, baselineSources);
    if (newImages.length && !state.stop)
      return {
        text: newImages.at(-1)?.alt || "Imagem gerada",
        links: [],
        imageBaselineSources: baselineSources,
        conversationId: validateConversationUrl(state.href),
      };
    const body = await evaluate(client, sessionId, "(document.body?.innerText||'').slice(-4000)");
    if (/usage limit|rate limit|reached.*limit|limite de uso/i.test(body))
      throw codedError("RATE_LIMIT", "O ChatGPT informou limite de geração de imagens.", true);
    await sleep(1200, signal);
  }
  throw codedError("TIMEOUT", "O ChatGPT não concluiu a imagem no prazo.", true);
}

async function captureGeneratedImages(
  client,
  sessionId,
  services,
  request,
  timeoutMs,
  baselineSources,
) {
  const deadline = Date.now() + timeoutMs;
  const capturedBySource = new Map();
  let quietSince;
  while (Date.now() < deadline) {
    if (services.signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    let candidates;
    try {
      candidates = generatedImagesAfterBaseline(
        await evaluate(client, sessionId, `(() => {${PAGE_HELPERS};return cfGeneratedImages()})()`),
        baselineSources,
      ).filter((image) => !capturedBySource.has(image.src));
    } catch (error) {
      if (capturedBySource.size && isCdpConnectionLoss(error)) break;
      throw error;
    }
    if (candidates.length) {
      let payloads;
      try {
        payloads = await evaluate(
          client,
          sessionId,
          `(async()=>Promise.all(${JSON.stringify(candidates)}.map(async image=>{try{const r=await fetch(image.src,{credentials:'include'});if(!r.ok)throw new Error('HTTP '+r.status);const b=new Uint8Array(await r.arrayBuffer());let s='';const n=32768;for(let i=0;i<b.length;i+=n)s+=String.fromCharCode(...b.subarray(i,i+n));return{...image,base64:btoa(s),mimeType:(r.headers.get('content-type')||'image/png').split(';')[0]}}catch(error){return{...image,error:String(error?.message||error)}}})))()`,
        );
      } catch (error) {
        if (capturedBySource.size && isCdpConnectionLoss(error)) break;
        throw error;
      }
      let added = false;
      for (const image of payloads ?? []) {
        if (image.error || capturedBySource.has(image.src)) continue;
        const bytes = Buffer.from(image.base64, "base64");
        if (!bytes.length || bytes.length > 50 * 1024 * 1024) continue;
        const extension =
          image.mimeType === "image/webp"
            ? "webp"
            : image.mimeType === "image/jpeg"
              ? "jpg"
              : "png";
        const artifactId = `chatgpt-image-${createHash("sha256")
          .update(
            `${request?.executionId || "execution"}:${request?.blockId || "block"}:${request?.attempt || 1}:${createHash("sha256").update(bytes).digest("hex")}`,
          )
          .digest("hex")
          .slice(0, 16)}`;
        const name = `${artifactId}.${extension}`;
        await writeFile(services.getOutputPath(name), bytes);
        capturedBySource.set(image.src, {
          image,
          file: {
            id: artifactId,
            name,
            mimeType: image.mimeType,
            size: bytes.length,
            url: `artifact://${artifactId}`,
          },
          artifact: {
            id: artifactId,
            name,
            mimeType: image.mimeType,
            size: bytes.length,
            source: { kind: "path", path: name },
          },
        });
        added = true;
      }
      if (added) quietSince = Date.now();
    }
    if (capturedBySource.size && quietSince && Date.now() - quietSince >= 3_000) break;
    await sleep(capturedBySource.size ? 500 : 1000, services.signal);
  }
  if (!capturedBySource.size)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "A resposta terminou sem uma imagem gerada capturável.",
      true,
    );
  const captured = [...capturedBySource.values()];
  return {
    files: captured.map((entry) => entry.file),
    artifacts: captured.map((entry) => entry.artifact),
    dimensions: captured.map((entry) => entry.image),
  };
}

export function isCdpConnectionLoss(error) {
  return /CDP n[aã]o conectado|WebSocket.*(?:closed|close)|socket.*(?:closed|hang up)/i.test(
    String(error?.message ?? error ?? ""),
  );
}

export function imageResponseValues(captured, description) {
  return {
    image: captured.files[0],
    images: captured.files,
    description: description.trim(),
  };
}

export function generatedImagesAfterBaseline(images = [], baselineSources = []) {
  const baseline = new Set(baselineSources);
  const unique = new Map();
  for (const image of images ?? []) {
    const src = String(image?.src ?? "").trim();
    if (!src || baseline.has(src) || unique.has(src)) continue;
    unique.set(src, { ...image, src });
  }
  return [...unique.values()];
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
    assertDedicatedProfilePath(profilePath, settings.allowExistingChromeProfile === true);
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

  let client,
    child,
    bridge,
    taskTargetId,
    closeTaskTarget = false;
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
    const initialPage = await attachChatGptPage(client, services.signal, true);
    bridge = await prepareProfileSession({
      attachBridge: () =>
        attachContentFlowBridge({
          client,
          pageSessionId: initialPage.sessionId,
          pluginId: PLUGIN_ID,
          profileId: profileName,
          request,
          signal: services.signal,
          allowedOrigins: ["https://chatgpt.com"],
          waitMs: PROFILE_SETUP_WAIT_MS,
        }),
      attachPage: () => attachChatGptPage(client, services.signal, true),
      waitPrompt: (sessionId) =>
        waitForPrompt(client, sessionId, PROFILE_SETUP_WAIT_MS, services.signal),
    });
    await markProfilePrepared(profilePath, profileName);
    return {
      status: "success",
      values: { ready: true, message: `Perfil ${profileName} validado no ChatGPT.` },
    };
  } catch (error) {
    return resultError(
      error?.code || "AUTHENTICATION_FAILED",
      error?.message || "Não foi possível validar o login do ChatGPT.",
      Boolean(error?.retryable),
    );
  } finally {
    bridge?.dispose();
    try {
      await client?.send("Browser.close");
    } catch {}
    client?.close();
    try {
      child?.kill();
    } catch {}
  }
}

async function prepareProfileSession({ attachBridge, attachPage, waitPrompt }) {
  // The user may navigate the initial ChatGPT tab to chrome://extensions while
  // installing Browser Bridge. Wait for the extension first, then reattach (or
  // create) a ChatGPT tab and wait without a setup deadline for login.
  const bridge = await attachBridge();
  try {
    const { sessionId } = await attachPage();
    await waitPrompt(sessionId);
    return bridge;
  } catch (error) {
    bridge?.dispose();
    throw error;
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
        return resultError(
          "INVALID_CONFIGURATION",
          "A geração de imagem não usa diagnosticMockResponse porque precisa produzir um artifact real.",
        );
      }
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
      mode = "standard";
    } else if (capabilityId === "search-web-in-browser") {
      parts = [buildSearchPrompt(request, false)];
    } else if (capabilityId === "deep-research-in-browser") {
      parts = [buildSearchPrompt(request, true)];
      mode = "deep";
    } else if (capabilityId === "choose-library-item-in-browser")
      parts = [buildChoosePrompt(request)];
    else if (capabilityId === "validate-content-in-browser")
      parts = [buildValidationPrompt(request)];
    else if (["analyze-images-in-browser", "analyze-documents-in-browser"].includes(capabilityId)) {
      parts = [buildAnalysisPrompt(request, capabilityId.includes("images"))];
      mode = "standard";
    } else if (capabilityId === "generate-image-in-browser") {
      parts = [buildImagePrompt(request)];
      mode = "image";
    } else throw codedError("INVALID_CONFIGURATION", `Capability desconhecida: ${capabilityId}.`);
  } catch (error) {
    return resultError(
      error?.code || "INVALID_CONFIGURATION",
      error?.message || "Configuração inválida.",
    );
  }

  const configuration = request?.configuration ?? {};
  let client,
    child,
    bridge,
    taskTargetId,
    closeTaskTarget = false;
  try {
    const profileName = normalizeAccountProfile(configuration.accountProfile),
      profilePath = runtimeProfilePath(settings, profileName, services),
      port = profilePort(
        clampInteger(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000),
        profileName,
      );
    const primaryAttachments = await resolveAttachments(request, services);
    assertDedicatedProfilePath(profilePath, settings.allowExistingChromeProfile === true);
    if (!(await profileIsPrepared(profilePath, profileName))) {
      throw codedError(
        "AUTHENTICATION_FAILED",
        `O perfil ${profileName} ainda não foi salvo. Abra a configuração do Método e use Salvar perfil antes de executar.`,
      );
    }
    const trace =
      settings.diagnosticTrace === true
        ? (message) => process.stderr.write(`[ChatGPT Browser] ${message}\n`)
        : () => {};
    const step = (message) => process.stderr.write(`[ChatGPT Browser] ${message}\n`);
    step(`Preparando perfil ${profileName} para ${parts.length} etapa(s).`);
    const keepBrowserOpen = settings.keepBrowserOpen !== false;
    const launched = await launchOrReuseChrome({
      executables: await resolveChromeExecutables(settings),
      profilePath,
      port,
      startMinimized:
        request?.context?.runMode !== "method_test" && settings.startMinimized !== false,
      keepBrowserOpen,
      signal: services.signal,
    });
    child = launched.child;
    client = await new CdpClient(launched.version.webSocketDebuggerUrl, trace).connect(
      services.signal,
    );
    const taskPage = await attachChatGptPage(client, services.signal, false, launched.reused);
    const { sessionId } = taskPage;
    taskTargetId = taskPage.targetId;
    closeTaskTarget = taskPage.created || !launched.reused;
    const reusedConversation = await prepareConversation(
      client,
      sessionId,
      request.conversation,
      clampInteger(settings.interactiveWaitSeconds, 600, 30, 900) * 1000,
      services.signal,
    );
    if (taskPage.created) await markTaskPage(client, sessionId, request, services.signal);
    parts = partsForConversation(parts, request.conversation, reusedConversation);
    const fallbackAttachments = reusedConversation
      ? []
      : await resolveFallbackAttachments(request, services);
    const attachments = attachmentsForConversation(
      primaryAttachments,
      fallbackAttachments,
      reusedConversation,
      request.conversation?.continuationMessage,
    );
    bridge = await attachContentFlowBridge({
      client,
      pageSessionId: sessionId,
      pluginId: PLUGIN_ID,
      profileId: profileName,
      request,
      signal: services.signal,
      allowedOrigins: ["https://chatgpt.com"],
    });
    if (attachments.length) {
      step(`Enviando ${attachments.length} anexo(s) autorizado(s).`);
      await attachFiles(client, sessionId, attachments, services.signal);
    }
    await clickMode(bridge, mode);
    const responses = [],
      retryAttempts = 0,
      delayBetweenPartsMs = 0;
    for (let index = 0; index < parts.length; index += 1) {
      let lastError;
      for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
        try {
          step(
            `Etapa ${index + 1}/${parts.length}, tentativa ${attempt + 1}/${retryAttempts + 1}.`,
          );
          responses.push(
            capabilityId === "generate-image-in-browser"
              ? await generateImagePart(
                  client,
                  sessionId,
                  bridge,
                  parts[index],
                  settings,
                  services.signal,
                  `${index}:${attempt}`,
                )
              : await generatePart(
                  client,
                  sessionId,
                  bridge,
                  parts[index],
                  settings,
                  services.signal,
                  `${index}:${attempt}`,
                ),
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
      ].slice(0, 10);
    let values;
    if (capabilityId === "generate-image-in-browser") {
      const captured = await captureGeneratedImages(
        client,
        sessionId,
        services,
        request,
        clampInteger(settings?.responseTimeoutSeconds, 600, 30, 3600) * 1000,
        responses[0]?.imageBaselineSources,
      );
      let conversationId = responses.at(-1)?.conversationId;
      if (!conversationId)
        try {
          conversationId = await currentConversationUrl(client, sessionId);
        } catch (error) {
          if (!isCdpConnectionLoss(error)) throw error;
        }
      return {
        status: "success",
        values: imageResponseValues(captured, combined),
        artifacts: captured.artifacts,
        ...(conversationId ? { conversation: { id: conversationId } } : {}),
        usage: {
          provider: "OpenAI / ChatGPT Images",
          outputUnits: captured.files.reduce((total, file) => total + file.size, 0),
          unit: "bytes",
        },
      };
    }
    const conversationId = await currentConversationUrl(client, sessionId);
    if (["search-web-in-browser", "deep-research-in-browser"].includes(capabilityId))
      values = searchResponseValues(combined.trim(), sources, request);
    else if (capabilityId === "choose-library-item-in-browser")
      values = { result: parseSelectedItemId(combined, request) };
    else if (capabilityId === "validate-content-in-browser")
      values = parseValidationValues(combined, request);
    else {
      const result = cleanGeneratedText(combined);
      const minimum = 1;
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
      conversation: { id: conversationId },
      usage: { provider: "OpenAI / ChatGPT web", outputUnits: combined.length, unit: "characters" },
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
    bridge?.dispose();
    if (closeTaskTarget && taskTargetId)
      try {
        await client?.send("Target.closeTarget", { targetId: taskTargetId });
      } catch {}
    const keepBrowserOpen = settings.keepBrowserOpen !== false;
    if (!keepBrowserOpen && child)
      try {
        await client?.send("Browser.close");
      } catch {}
    client?.close();
    if (!keepBrowserOpen && child) {
      try {
        child.kill();
      } catch {}
    }
  }
}

export const __test = {
  attachmentsForConversation,
  buildParts,
  buildSearchPrompt,
  buildChoosePrompt,
  buildValidationPrompt,
  buildAnalysisPrompt,
  buildImagePrompt,
  clickMode,
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
  runtimeProfilePath,
  profilePort,
  taskPageMarker,
  prepareProfileSession,
  searchResponseValues,
  generationResponseValues,
  imageResponseValues,
  generatedImagesAfterBaseline,
  isCdpConnectionLoss,
  generationControlIsStop,
  summarizeBlock,
  responsePhase,
};
