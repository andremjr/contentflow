import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join } from "node:path";
import { attachContentFlowBridge } from "./browser-bridge-client.mjs";

const PLUGIN_ID = "local.contentflow.claude-browser-text";
const CLAUDE_HOST = "claude.ai";
const CLAUDE_NEW_URL = "https://claude.ai/new";
const DEFAULT_PORT = 9444;
const MAX_PROMPT_CHARACTERS = 500_000;
const MAX_PARTS = 32;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;
const PROFILE_SETUP_WAIT_MS = Number.POSITIVE_INFINITY;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
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
]);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);

function resultError(code, message, retryable = false, retryAfterMs) {
  const value = { status: "error", code, message, retryable };
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) value.retryAfterMs = retryAfterMs;
  return value;
}

function codedError(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
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
  const entries = Object.entries(inputs ?? {});
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
  for (const [token, value] of Object.entries(replacements)) {
    output = replaceAllLiteral(output, token, value);
  }
  for (const [key, value] of Object.entries(promptContextInputs(request) ?? {})) {
    output = replaceAllLiteral(output, `{{INPUT:${key}}}`, serialize(value));
  }
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

function flattenRecords(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenRecords(item, output);
  } else if (value && typeof value === "object") {
    output.push(value);
  }
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
  const explicit = request?.inputs?.outline;
  if (Array.isArray(explicit) && explicit.length) return explicit.slice(0, MAX_PARTS);
  const content = request?.inputs?.content;
  if (Array.isArray(content) && content.some((item) => item && typeof item === "object")) {
    return flattenRecords(content).slice(0, MAX_PARTS);
  }
  return [];
}

function expandOutlinePrompt(template, request, block, index, total, base) {
  let output = expandTemplate(template, request);
  const values = {
    "{{PROMPT_BASE}}": base,
    "{{BLOCK_NUMBER}}": String(index + 1),
    "{{BLOCK_TOTAL}}": String(total),
    "{{BLOCK}}": summarizeBlock(index + 1, block),
    "{{BLOCK_JSON}}": serialize(block),
    "{{IS_FIRST}}": index === 0 ? "true" : "false",
    "{{IS_LAST}}": index === total - 1 ? "true" : "false",
  };
  for (const [token, value] of Object.entries(values))
    output = replaceAllLiteral(output, token, value);
  return output.trim();
}

function plainTextInstruction(enabled) {
  return enabled
    ? "INSTRUÇÃO OBRIGATÓRIA DE FORMATO: escreva apenas como texto puro. Não crie arquivos, artefatos ou código. Entregue diretamente o texto solicitado."
    : "";
}

function buildParts(request) {
  return [buildInstructionPrompt(request, [plainTextInstruction(true)])];
}

function expandCapabilityTemplate(template, replacements, request) {
  let output = String(template ?? "");
  for (const [token, value] of Object.entries(replacements)) {
    output = replaceAllLiteral(output, token, typeof value === "string" ? value : serialize(value));
  }
  return ensureBlockInstruction(expandTemplate(output, request), template, request);
}

function buildSearchPrompt(request) {
  const prompt = buildInstructionPrompt(request);
  if (!prompt) throw codedError("INVALID_INPUT", "A consulta de pesquisa ficou vazia.");
  return prompt;
}

function buildChoosePrompt(request) {
  const collection = request?.context?.selectedCollection;
  if (!collection || !Array.isArray(collection.items) || !collection.items.length) {
    throw codedError(
      "INVALID_INPUT",
      "O bloco Escolher precisa receber uma coleção estratégica com itens.",
    );
  }
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
  if (mode === "select_one") {
    return 'Responda somente com JSON válido: {"selectedIndex": NUMERO_1_BASED, "feedback": "justificativa curta"}.';
  }
  if (mode === "select_many") {
    return 'Responda somente com JSON válido: {"selectedIndices": [NUMEROS_1_BASED], "feedback": "justificativa curta"}.';
  }
  return 'Responda somente com JSON válido: {"decision": "approved" ou "rejected", "feedback": "justificativa objetiva"}.';
}

function buildValidationPrompt(request) {
  const mode = validationMode(request);
  return buildInstructionPrompt(request, [validationOutputInstruction(mode)]);
}

function buildImageAnalysisPrompt(request) {
  return buildInstructionPrompt(request);
}

function buildDocumentAnalysisPrompt(request) {
  return buildInstructionPrompt(request);
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

function attachmentInputs(request) {
  const capabilityId = String(request?.capabilityId ?? "");
  if (capabilityId === "analyze-images-in-browser") return request?.inputs?.images;
  if (capabilityId === "analyze-documents-in-browser") return request?.inputs?.documents;
  if (capabilityId === "validate-content-in-browser") return request?.inputs?.content;
  if (capabilityId === "generate-text-in-browser") return request?.inputs?.attachments;
  return undefined;
}

async function resolveAttachments(request, services) {
  const files = collectStoredFiles(attachmentInputs(request));
  const unique = [...new Map(files.map((file) => [file.id, file])).values()];
  if (unique.length > MAX_ATTACHMENTS)
    throw codedError(
      "INVALID_INPUT",
      `O Claude aceita no máximo ${MAX_ATTACHMENTS} anexos por conversa.`,
    );
  const capabilityId = String(request?.capabilityId ?? "");
  if (
    ["analyze-images-in-browser", "analyze-documents-in-browser"].includes(capabilityId) &&
    !unique.length
  ) {
    throw codedError("INVALID_INPUT", "Nenhum arquivo autorizado foi recebido para análise.");
  }
  const resolved = [];
  for (const file of unique) {
    const path = await services.resolveInputFile(file);
    const extension = extname(file.name || path).toLowerCase();
    if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
      throw codedError(
        "INVALID_INPUT",
        `Formato não suportado pelo Claude: ${extension || "sem extensão"}.`,
      );
    }
    if (capabilityId === "analyze-images-in-browser" && !IMAGE_EXTENSIONS.has(extension)) {
      throw codedError(
        "INVALID_INPUT",
        `O recurso de visão aceita apenas imagens JPEG, PNG, GIF ou WebP: ${file.name}.`,
      );
    }
    if (capabilityId === "analyze-documents-in-browser" && !DOCUMENT_EXTENSIONS.has(extension)) {
      throw codedError(
        "INVALID_INPUT",
        `O recurso de documentos não aceita o formato de ${file.name}.`,
      );
    }
    const info = await stat(path);
    if (!info.isFile())
      throw codedError("INVALID_INPUT", `O anexo autorizado não é um arquivo: ${file.name}.`);
    if (info.size > MAX_ATTACHMENT_BYTES)
      throw codedError("INVALID_INPUT", `O anexo ${file.name} ultrapassa 500 MB.`);
    resolved.push({ path, name: file.name || basename(path), size: info.size });
  }
  return resolved;
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
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function parseSelectedItemId(text, request) {
  const items = request?.context?.selectedCollection?.items ?? [];
  const parsed = parseJsonObject(text);
  const candidate = String(parsed?.selectedItemId ?? stripCodeFence(text))
    .replace(/^['"]|['"]$/g, "")
    .trim();
  if (!items.some((item) => item.id === candidate)) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "O Claude não devolveu o ID exato de um item permitido.",
      true,
    );
  }
  return candidate;
}

function selectionCandidates(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
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
        "O Claude não devolveu approved ou rejected.",
        true,
      );
    return { decision, ...(feedback ? { feedback } : {}) };
  }

  const candidates = selectionCandidates(request?.inputs?.content);
  if (!candidates.length)
    throw codedError("INVALID_INPUT", "Não há opções para validar/selecionar.");
  if (mode === "select_one") {
    const index = Number(parsed.selectedIndex) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O Claude devolveu um índice de seleção inválido.",
        true,
      );
    }
    return { selected_value: candidates[index], ...(feedback ? { feedback } : {}) };
  }
  const indices = Array.isArray(parsed.selectedIndices)
    ? parsed.selectedIndices.map((item) => Number(item) - 1)
    : [];
  if (
    !indices.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index >= candidates.length)
  ) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "O Claude devolveu índices de seleção inválidos.",
      true,
    );
  }
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

function recordFromSearch(field, text, sources) {
  return Object.fromEntries(
    (field?.recordFields ?? []).map((recordField) => {
      const isSource = /source|fonte|url|link/i.test(`${recordField.key} ${recordField.label}`);
      let value;
      if (recordField.type === "list" || recordField.type === "multiselect")
        value = isSource ? sources : textAsList(text);
      else if (recordField.type === "url") value = sources[0] ?? "https://claude.ai";
      else if (recordField.type === "boolean") value = true;
      else if (recordField.type === "number") value = 1;
      else value = isSource ? sources.join("\n") : text;
      return [recordField.key, value];
    }),
  );
}

function searchResponseValues(text, sources, request) {
  const fields = Array.isArray(request?.outputContract) ? request.outputContract : [];
  if (!fields.length) return { result: text, sources };
  const values = {};
  for (const field of fields) {
    const isSource = /source|fonte|url|link/i.test(`${field.key} ${field.label}`);
    if (isSource) {
      values[field.key] = field.type === "url" ? (sources[0] ?? "https://claude.ai") : sources;
    } else if (field.type === "list" || field.type === "multiselect") {
      values[field.key] = textAsList(text);
    } else if (field.type === "records") {
      values[field.key] = [recordFromSearch(field, text, sources)];
    } else {
      values[field.key] = text;
    }
  }
  return values;
}

function generationResponseValues(result, responses, request) {
  const values = { result };
  if ((request?.outputContract ?? []).some((field) => field?.key === "parts")) {
    values.parts = responses.map((response) => response.text);
  }
  return values;
}

function cleanGeneratedText(input) {
  let text = String(input ?? "");
  if (text.includes("`") && /const |new Paragraph|sections_text/.test(text)) {
    const sections = [...text.matchAll(/`([^`]{200,})`/gs)].map((match) => match[1]);
    if (sections.length)
      text = sections
        .join("\n\n")
        .replaceAll("\\n", "\n")
        .replaceAll("\\t", "")
        .replaceAll("\\'", "'")
        .replaceAll('\\"', '"');
  }
  return text
    .replace(/<antArtifact[^>]*>.*?<\/antArtifact>/gis, "")
    .replace(/<\/?antArtifact[^>]*>/gi, "")
    .replace(/^\{["'](?:description|command|filepaths|path|file_text).*?\}$/gim, "")
    .replace(/^\[\{["']type["'].*?\}\]$/gim, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+.*$/gm, "")
    .replace(/^(const |let |var |import |require\(|npm |pip |python |node |cd ).*$/gm, "")
    .replace(/^.*\b(function|async|await|return|console\.log)\b.*$/gm, "")
    .replace(/^\s*["'][a-zA-Z_]+["']\s*:\s*.*$/gm, "")
    .replace(/^\s*"(?:uuid|type)":\s*".*".*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function defaultProfilesBasePath() {
  return join(homedir(), ".contentflow", "claude-browser-profiles");
}

function normalizeAccountProfile(value) {
  const name = String(value ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(name)) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "Perfil da conta Claude deve ter 1 a 48 caracteres e usar apenas letras, números, _ ou -.",
    );
  }
  return name;
}

function profilePathFor(settings, profileName) {
  const legacy = settings?.profilePath?.trim?.();
  if (legacy && profileName === "default") return legacy;
  const base = settings?.profilesBasePath?.trim?.() || defaultProfilesBasePath();
  return join(base, profileName);
}
function runtimeProfilePath(settings, profileName, services) {
  if (settings?.profilePath?.trim?.() || settings?.profilesBasePath?.trim?.()) {
    return profilePathFor(settings, profileName);
  }
  return services.getWorkspacePath(profileName);
}
function profileMarkerPath(path) {
  return join(path, ".contentflow-profile-ready.json");
}
async function profileIsPrepared(path, name) {
  try {
    const marker = JSON.parse(await readFile(profileMarkerPath(path), "utf8"));
    return (
      marker?.provider === CLAUDE_HOST && marker?.profile === name && marker?.bridgeProtocol === 2
    );
  } catch {
    return false;
  }
}
async function markProfilePrepared(path, name) {
  await writeFile(
    profileMarkerPath(path),
    JSON.stringify({
      provider: CLAUDE_HOST,
      profile: name,
      bridgeProtocol: 2,
      preparedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

function profilePort(basePort, profileName) {
  if (profileName === "default") return basePort;
  let hash = 2166136261;
  for (const char of profileName) {
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
    normalized.endsWith("/google/chrome/default") ||
    normalized.includes("/google/chrome/user data/default")
  ) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "Use um perfil Chrome dedicado ao plugin, não o perfil pessoal padrão.",
    );
  }
}

function dedupeStrings(values) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
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
    let stdout = "";
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, stdout });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* best effort */
      }
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
    if (existing.length) return dedupeStrings(existing);

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
    return dedupeStrings(found);
  }
  if (platform() === "darwin")
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const found = [];
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const result = await captureProcess("which", [name]);
    if (result.ok) found.push(...result.stdout.split(/\r?\n/));
  }
  return dedupeStrings(found);
}

async function resolveChromeExecutables(settings) {
  const explicit = settings?.chromeExecutable?.trim?.();
  if (explicit) return [explicit];
  const candidates = await chromeCandidates();
  if (candidates.length) return candidates;
  throw codedError(
    "INVALID_CONFIGURATION",
    "Google Chrome não foi localizado. Configure chromeExecutable.",
  );
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
  if (existing) return { version: existing, child: null, startedByPlugin: false };
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    CLAUDE_NEW_URL,
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
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const version = await fetchBrowserVersion(port);
      if (version) return { version, child, startedByPlugin: true };
      await sleep(350, signal);
    }
    failures.push(`${executable}: a porta CDP não respondeu.`);
    try {
      child.kill();
    } catch {
      /* best effort */
    }
  }
  throw codedError(
    "PERMISSION_DENIED",
    `Não consegui iniciar o Chrome dedicado. ${failures.slice(0, 3).join(" | ")}`,
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
    if (typeof WebSocket !== "function")
      throw codedError("UPSTREAM_UNAVAILABLE", "Runtime Node sem WebSocket global para CDP.");
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onAbort = () => reject(codedError("CANCELLED", "Execução cancelada."));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.ws.addEventListener(
        "open",
        () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
        { once: true },
      );
      this.ws.addEventListener(
        "error",
        () => reject(codedError("UPSTREAM_UNAVAILABLE", "Não foi possível conectar ao Chrome.")),
        { once: true },
      );
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () =>
      this.rejectAll(codedError("UPSTREAM_UNAVAILABLE", "Conexão com o Chrome encerrada.")),
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
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    if (method === "Input.insertText") {
      const digest = createHash("sha256")
        .update(String(params.text ?? ""))
        .digest("hex")
        .slice(0, 12);
      this.trace?.(
        `CDP Input.insertText: length=${String(params.text ?? "").length}; sha256=${digest}`,
      );
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* best effort */
    }
  }
}

async function evaluate(client, sessionId, expression) {
  const response = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    const description =
      response.exceptionDetails?.exception?.description ||
      response.exceptionDetails?.text ||
      "Erro na página do Claude.";
    throw codedError("OUTPUT_VALIDATION_FAILED", description);
  }
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
    await sleep(Math.min(timeoutMs, 250), signal);
  }
}

function normalizeEditorText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

async function attachClaudePage(client, signal, activate = false) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  let target = targetInfos.find(
    (item) => item.type === "page" && String(item.url).includes(CLAUDE_HOST),
  );
  if (!target) {
    const created = await client.send("Target.createTarget", { url: CLAUDE_NEW_URL });
    target = { targetId: created.targetId, url: CLAUDE_NEW_URL };
  }
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  if (activate) await client.send("Target.activateTarget", { targetId: target.targetId });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  if (activate) await client.send("Page.bringToFront", {}, sessionId).catch(() => undefined);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      const state = await evaluate(
        client,
        sessionId,
        "({readyState:document.readyState,url:location.href})",
      );
      if (["interactive", "complete"].includes(state?.readyState)) break;
    } catch {
      /* navegação ainda trocando o contexto */
    }
    await sleep(350, signal);
  }
  return { sessionId, targetId: target.targetId };
}

async function openNewConversation(client, sessionId, signal) {
  if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
  await client.send("Page.navigate", { url: CLAUDE_NEW_URL }, sessionId);
}

const PAGE_HELPERS = String.raw`
function cfVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0;
}
function cfText(el) {
  return [el?.innerText, el?.textContent, el?.getAttribute?.('aria-label'), el?.getAttribute?.('placeholder'), el?.getAttribute?.('data-testid')]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function cfPrompt() {
  const selectors = [
    'textarea[placeholder*="prompt" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-label*="prompt" i]',
    '[contenteditable="true"]',
    '[role="textbox"]'
  ];
  for (const selector of selectors) {
    const candidates = [...document.querySelectorAll(selector)].filter(cfVisible);
    const preferred = candidates.find(el => /prompt|help you|como posso|write/i.test(cfText(el)));
    if (preferred) return preferred;
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}
function cfAssistantNodes() {
  const selectors = [
    '[data-message-author-role="assistant"]',
    '[data-testid*="assistant" i]',
    '.font-claude-response',
    '[data-is-streaming] .standard-markdown',
    '.standard-markdown'
  ];
  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)].filter(cfVisible);
    if (nodes.length) return nodes;
  }
  return [];
}
function cfResponseState() {
  const nodes = cfAssistantNodes();
  const entries = nodes.map(el => ({
    text: (el.innerText || el.textContent || '').trim(),
    links: [...el.querySelectorAll('a[href]')].map(link => ({
      href: link.href,
      label: (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim()
    })).filter(link => /^https:\/\//i.test(link.href))
  })).filter(entry => entry.text);
  const texts = entries.map(entry => entry.text);
  const stop = [...document.querySelectorAll('button')].some(el => cfVisible(el) && /stop|parar|interromper/i.test(cfText(el)));
  const body = document.body?.innerText || '';
  return { texts, entries, stop, url: location.href, bodyHint: body.slice(0, 5000) };
}
`;

async function pageState(client, sessionId) {
  return await evaluate(
    client,
    sessionId,
    `(() => { ${PAGE_HELPERS}; const prompt=cfPrompt(); const body=document.body?.innerText||''; return { prompt:!!prompt, url:location.href, login:/log in|sign up|continue with google|entrar|criar conta/i.test(body), captcha:/captcha|verify you are human|verifique se você é humano/i.test(body), bodyHint:body.slice(0,3000) }; })()`,
  );
}

async function waitForPrompt(client, sessionId, waitMs, signal) {
  const deadline = Date.now() + waitMs;
  let last;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    last = await pageState(client, sessionId);
    if (last?.url?.startsWith(`https://${CLAUDE_HOST}/`) && last?.prompt && !last?.login)
      return last;
    await sleep(750, signal);
  }
  if (last?.captcha)
    throw codedError(
      "AUTHENTICATION_FAILED",
      "O Claude aguarda verificação/CAPTCHA. Conclua manualmente no Chrome dedicado e execute novamente.",
      true,
    );
  if (last?.login)
    throw codedError(
      "AUTHENTICATION_FAILED",
      "Faça login no Claude na janela do Chrome dedicado e execute novamente.",
      true,
    );
  throw codedError(
    "OUTPUT_VALIDATION_FAILED",
    "Não encontrei a caixa de mensagem do Claude. Conclua login, onboarding ou reautenticação na janela aberta.",
    true,
  );
}

async function attachFiles(client, sessionId, attachments, signal) {
  if (!attachments.length) return;
  const baselinePreviewCount = await evaluate(
    client,
    sessionId,
    `(() => [...document.querySelectorAll('img')].filter(el => { const r=el.getBoundingClientRect(); return r.width>40 && r.height>40; }).length)()`,
  );
  await client.send("DOM.enable", {}, sessionId);
  const { root } = await client.send("DOM.getDocument", { depth: 1, pierce: true }, sessionId);
  const { nodeIds = [] } = await client.send(
    "DOM.querySelectorAll",
    { nodeId: root.nodeId, selector: 'input[type="file"]' },
    sessionId,
  );
  if (!nodeIds.length) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "O seletor de arquivos do Claude não foi encontrado.",
      true,
    );
  }
  await client.send(
    "DOM.setFileInputFiles",
    { files: attachments.map((attachment) => attachment.path), nodeId: nodeIds.at(-1) },
    sessionId,
  );
  const expected = attachments.map((attachment) => attachment.name.toLowerCase());
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await evaluate(
      client,
      sessionId,
      `(() => { ${PAGE_HELPERS}; const body=(document.body?.innerText||'').toLowerCase(); const previewCount=[...document.querySelectorAll('img')].filter(el => { const r=el.getBoundingClientRect(); return r.width>40 && r.height>40; }).length; return {body, prompt:!!cfPrompt(), previewCount}; })()`,
    );
    if (
      state?.prompt &&
      (expected.every((name) => state.body.includes(name)) ||
        Number(state.previewCount) > Number(baselinePreviewCount))
    )
      return;
    if (
      /upload failed|falha.*upload|arquivo.*grande|file.*large/i.test(String(state?.body ?? ""))
    ) {
      throw codedError(
        "INVALID_INPUT",
        "O Claude recusou um dos anexos. Verifique formato, tamanho e limites da conta.",
      );
    }
    await sleep(500, signal);
  }
  throw codedError(
    "TIMEOUT",
    "Os anexos não ficaram prontos no Claude dentro de 120 segundos.",
    true,
  );
}

async function setPrompt(bridge, prompt, operationKey) {
  await bridge.dispatch(
    "setText",
    {
      selectors: [
        'textarea[placeholder*="prompt" i]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][aria-label*="prompt" i]',
        '[contenteditable="true"]',
        '[role="textbox"]',
      ],
      text: prompt,
    },
    operationKey,
  );
}

async function clickSend(bridge, operationKey) {
  await bridge.dispatch(
    "click",
    { selectors: ["button"], textIncludes: ["send message", "enviar mensagem", "send"] },
    operationKey,
  );
}

async function responseState(client, sessionId) {
  return await evaluate(
    client,
    sessionId,
    `(() => { ${PAGE_HELPERS}; return cfResponseState(); })()`,
  );
}

async function waitForResponse(client, sessionId, baselineCount, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let previous = "";
  let stablePolls = 0;
  let newest = "";
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const state = await responseState(client, sessionId);
    const texts = Array.isArray(state?.texts) ? state.texts : [];
    newest = texts.length > baselineCount ? texts.at(-1) : (texts.at(-1) ?? "");
    if (newest && newest === previous) stablePolls += 1;
    else stablePolls = 0;
    previous = newest;
    const phase = responsePhase({
      hasNewResponse: Boolean(newest),
      generating: Boolean(state?.stop),
      stablePolls,
    });
    if (phase === "completed") {
      const entry = Array.isArray(state?.entries) ? state.entries.at(-1) : undefined;
      return { text: newest.trim(), links: Array.isArray(entry?.links) ? entry.links : [] };
    }
    const hint = String(state?.bodyHint ?? "");
    if (/usage limit|rate limit|limite de uso|try again later/i.test(hint)) {
      throw codedError(
        "RATE_LIMIT",
        "O Claude informou limite temporário de uso. Aguarde antes de tentar novamente.",
        true,
      );
    }
    if (/captcha|verify you are human|verifique se você é humano/i.test(hint)) {
      throw codedError(
        "AUTHENTICATION_FAILED",
        "O Claude exige verificação manual na janela do Chrome.",
        true,
      );
    }
    await waitForDomMutation(client, sessionId, 1_000, signal);
  }
  throw codedError(
    "TIMEOUT",
    "O Claude não concluiu a resposta dentro do tempo configurado.",
    true,
  );
}

async function generatePart(client, sessionId, bridge, prompt, settings, signal, operationKey) {
  const before = await responseState(client, sessionId);
  const baselineCount = Array.isArray(before?.texts) ? before.texts.length : 0;
  await setPrompt(bridge, prompt, `prompt:${operationKey}`);
  await clickSend(bridge, `send:${operationKey}`);
  const timeoutSeconds = clampInteger(settings?.responseTimeoutSeconds, 600, 30, 900);
  return await waitForResponse(client, sessionId, baselineCount, timeoutSeconds * 1000, signal);
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

  let client, child, bridge;
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
    const { sessionId } = await attachClaudePage(client, services.signal, true);
    await openNewConversation(client, sessionId, services.signal);
    await waitForPrompt(client, sessionId, PROFILE_SETUP_WAIT_MS, services.signal);
    bridge = await attachContentFlowBridge({
      client,
      pageSessionId: sessionId,
      pluginId: PLUGIN_ID,
      profileId: profileName,
      request,
      signal: services.signal,
      allowedOrigins: ["https://claude.ai"],
      waitMs: PROFILE_SETUP_WAIT_MS,
    });
    await markProfilePrepared(profilePath, profileName);
    return {
      status: "success",
      values: { ready: true, message: `Perfil ${profileName} validado no Claude.` },
    };
  } catch (error) {
    return resultError(
      error?.code || "AUTHENTICATION_FAILED",
      error?.message || "Não foi possível validar o login do Claude.",
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

export async function execute(request, services) {
  if (request?.invocation?.mode === "configure") return await configureProfile(request, services);
  const settings = request?.settings ?? {};
  const capabilityId = String(request?.capabilityId ?? "generate-text-in-browser");
  const mockResponse = String(settings?.diagnosticMockResponse ?? "").trim();
  if (mockResponse) {
    try {
      if (capabilityId === "choose-library-item-in-browser") {
        return {
          status: "success",
          values: { result: parseSelectedItemId(mockResponse, request) },
        };
      }
      if (capabilityId === "validate-content-in-browser") {
        return { status: "success", values: parseValidationValues(mockResponse, request) };
      }
      return {
        status: "success",
        values:
          capabilityId === "search-web-in-browser"
            ? searchResponseValues(mockResponse, [], request)
            : capabilityId === "generate-text-in-browser"
              ? generationResponseValues(mockResponse, [{ text: mockResponse }], request)
              : { result: mockResponse },
      };
    } catch (error) {
      return resultError(
        error?.code || "OUTPUT_VALIDATION_FAILED",
        error?.message || "Resposta simulada inválida.",
        false,
      );
    }
  }

  let parts;
  try {
    if (capabilityId === "generate-text-in-browser") parts = buildParts(request);
    else if (capabilityId === "search-web-in-browser") parts = [buildSearchPrompt(request)];
    else if (capabilityId === "choose-library-item-in-browser")
      parts = [buildChoosePrompt(request)];
    else if (capabilityId === "validate-content-in-browser")
      parts = [buildValidationPrompt(request)];
    else if (capabilityId === "analyze-images-in-browser")
      parts = [buildImageAnalysisPrompt(request)];
    else if (capabilityId === "analyze-documents-in-browser")
      parts = [buildDocumentAnalysisPrompt(request)];
    else throw codedError("INVALID_CONFIGURATION", `Capability desconhecida: ${capabilityId}.`);
  } catch (error) {
    return resultError(
      error?.code || "INVALID_CONFIGURATION",
      error?.message || "Configuração inválida.",
      false,
    );
  }

  const configuration = request?.configuration ?? {};
  let profileName;
  let profilePath;
  let port;
  try {
    profileName = normalizeAccountProfile(configuration.accountProfile);
    profilePath = runtimeProfilePath(settings, profileName, services);
    const basePort = clampInteger(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000);
    port = profilePort(basePort, profileName);
  } catch (error) {
    return resultError(
      error?.code || "INVALID_CONFIGURATION",
      error?.message || "Perfil da conta inválido.",
      false,
    );
  }
  const traceEnabled = settings.diagnosticTrace === true;
  const trace = (message) => {
    if (traceEnabled) process.stderr.write(`[Claude Browser] ${message}\n`);
  };
  const step = (message) => process.stderr.write(`[Claude Browser] ${message}\n`);
  const retryAttempts = 0;
  const delayBetweenPartsMs = 0;
  const minCharacters = 1;
  let client;
  let child;
  let bridge;

  try {
    const attachments = await resolveAttachments(request, services);
    assertDedicatedProfilePath(profilePath, settings.allowExistingChromeProfile === true);
    if (!(await profileIsPrepared(profilePath, profileName))) {
      throw codedError(
        "AUTHENTICATION_FAILED",
        `O perfil ${profileName} ainda não foi salvo. Abra a configuração do Método e use Salvar perfil antes de executar.`,
      );
    }
    const executables = await resolveChromeExecutables(settings);
    step(`Preparando perfil ${profileName} para ${parts.length} etapa(s).`);
    const launched = await launchOrReuseChrome({
      executables,
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
    const { sessionId } = await attachClaudePage(client, services.signal);
    await openNewConversation(client, sessionId, services.signal);
    const interactiveWaitSeconds = clampInteger(settings.interactiveWaitSeconds, 600, 30, 900);
    await waitForPrompt(client, sessionId, interactiveWaitSeconds * 1000, services.signal);
    bridge = await attachContentFlowBridge({
      client,
      pageSessionId: sessionId,
      pluginId: PLUGIN_ID,
      profileId: profileName,
      request,
      signal: services.signal,
      allowedOrigins: ["https://claude.ai"],
    });
    if (attachments.length) {
      step(`Enviando ${attachments.length} anexo(s) autorizado(s) ao Claude.`);
      await attachFiles(client, sessionId, attachments, services.signal);
      step("Anexos prontos para análise.");
    }
    const responses = [];
    for (let index = 0; index < parts.length; index += 1) {
      let lastError;
      for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
        try {
          step(
            `Executando etapa ${index + 1}/${parts.length}, tentativa ${attempt + 1}/${retryAttempts + 1}.`,
          );
          const response = await generatePart(
            client,
            sessionId,
            bridge,
            parts[index],
            settings,
            services.signal,
            `${index}:${attempt}`,
          );
          responses.push(response);
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

    const combined = responses.map((response) => response.text).join("\n\n");
    let values;
    if (capabilityId === "search-web-in-browser") {
      const maxSources = 10;
      const sources = [
        ...new Set(responses.flatMap((response) => response.links ?? []).map((link) => link.href)),
      ].slice(0, maxSources);
      values = searchResponseValues(combined.trim(), sources, request);
    } else if (capabilityId === "choose-library-item-in-browser") {
      values = { result: parseSelectedItemId(combined, request) };
    } else if (capabilityId === "validate-content-in-browser") {
      values = parseValidationValues(combined, request);
    } else {
      const result = cleanGeneratedText(combined);
      if (!result)
        throw codedError(
          "OUTPUT_VALIDATION_FAILED",
          "A resposta do Claude ficou vazia após a limpeza.",
          true,
        );
      if (result.length < minCharacters) {
        throw codedError(
          "OUTPUT_VALIDATION_FAILED",
          `O texto gerado tem ${result.length} caracteres; o mínimo configurado é ${minCharacters}.`,
          true,
        );
      }
      values = generationResponseValues(result, responses, request);
    }
    const outputCharacters = combined.length;
    step(`Concluído: ${outputCharacters} caracteres em ${responses.length} resposta(s).`);
    return {
      status: "success",
      values,
      usage: {
        provider: "Anthropic / Claude web",
        outputUnits: outputCharacters,
        unit: "characters",
      },
    };
  } catch (error) {
    if (services.signal?.aborted || error?.code === "CANCELLED")
      return resultError("CANCELLED", "Execução cancelada.", false);
    return resultError(
      error?.code || "UPSTREAM_UNAVAILABLE",
      error?.message || "Falha na automação do Claude.",
      Boolean(error?.retryable),
    );
  } finally {
    bridge?.dispose();
    if (settings.keepBrowserOpen !== true)
      try {
        await client?.send("Browser.close");
      } catch {}
    client?.close();
    if (settings.keepBrowserOpen !== true && child) {
      try {
        child.kill();
      } catch {
        /* best effort */
      }
    }
  }
}

export const __test = {
  buildParts,
  buildChoosePrompt,
  buildSearchPrompt,
  buildValidationPrompt,
  buildImageAnalysisPrompt,
  buildDocumentAnalysisPrompt,
  collectStoredFiles,
  cleanGeneratedText,
  expandTemplate,
  expandOutlinePrompt,
  generationResponseValues,
  normalizeAccountProfile,
  outlineItems,
  parseSelectedItemId,
  parseValidationValues,
  profileIsPrepared,
  markProfilePrepared,
  profilePathFor,
  runtimeProfilePath,
  profilePort,
  searchResponseValues,
  serializeInputs,
  summarizeBlock,
  responsePhase,
};
