import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const FLOW_HOST = "labs.google";
const FLOW_LANDING_URL = "https://labs.google/fx/pt/tools/flow";
const GENERATION_SUFFIX = "/flowMedia:batchGenerateImages";
const MEDIA_HOST = "flow-content.google";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_PORT = 9333;
const IMAGE_MODELS = Object.freeze({
  flow_auto: null,
  nano_banana: "GEM_PIX",
  nano_banana_pro: "GEM_PIX_2",
});
const MODEL_LABELS = Object.freeze({
  flow_auto: "Automático do Flow",
  nano_banana: "Nano Banana",
  nano_banana_pro: "Nano Banana Pro",
});
const ASPECT_RATIOS = Object.freeze({
  flow_current: null,
  landscape: "IMAGE_ASPECT_RATIO_LANDSCAPE",
  portrait: "IMAGE_ASPECT_RATIO_PORTRAIT",
  square: "IMAGE_ASPECT_RATIO_SQUARE",
});

function resultError(code, message, retryable = false, retryAfterMs) {
  const out = { status: "error", code, message, retryable };
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) out.retryAfterMs = retryAfterMs;
  return out;
}

function codedError(code, message, retryable = false) {
  const err = new Error(message);
  err.code = code;
  err.retryable = retryable;
  return err;
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

function normalizePrompts(value) {
  const out = [];
  const visit = (item) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) out.push(text);
      return;
    }
    if (Array.isArray(item)) for (const nested of item) visit(nested);
  };
  visit(value);
  return out;
}

function chunkTextForTyping(text, chunkSize) {
  const characters = Array.from(String(text ?? ""));
  const size = Math.max(1, Number.isInteger(chunkSize) ? chunkSize : 4);
  const chunks = [];
  for (let index = 0; index < characters.length; index += size) {
    chunks.push(characters.slice(index, index + size).join(""));
  }
  return chunks;
}

function safeFilename(text, fallback) {
  const stem = String(text ?? "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return stem || fallback;
}

function validateFlowUrl(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== FLOW_HOST ||
    !url.pathname.includes("/tools/flow/project/")
  ) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "flowUrl precisa apontar para um projeto em https://labs.google/.../tools/flow/project/...",
    );
  }
  return url.toString();
}

function resolveNavigationTarget(request) {
  const configured = request?.settings?.flowUrl?.trim?.();
  if (!configured) return { url: FLOW_LANDING_URL, pinned: false };
  return { url: validateFlowUrl(configured), pinned: true };
}

function defaultProfilePath() {
  return join(homedir(), ".contentflow-os", "google-flow-chrome-profile");
}

function defaultProfilesRootPath() {
  return join(homedir(), ".contentflow-os", "google-flow-chrome-profiles");
}

function normalizeAccountProfile(value) {
  const profile = String(value || "default").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(profile)) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "accountProfile deve usar 1 a 48 caracteres: letras, números, _ ou -.",
    );
  }
  return profile;
}

function stableProfileOffset(profile) {
  const digest = createHash("sha256").update(profile).digest();
  return 1 + (digest.readUInt16BE(0) % 400);
}

function resolveProfileRuntime(request) {
  const settings = request?.settings ?? {};
  const accountProfile = normalizeAccountProfile(request?.configuration?.accountProfile);
  const basePort = Number.isInteger(settings.remoteDebuggingPort)
    ? settings.remoteDebuggingPort
    : DEFAULT_PORT;
  if (basePort < 1024 || basePort > 65134) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "remoteDebuggingPort deve ficar entre 1024 e 65134 para permitir perfis adicionais.",
    );
  }
  if (accountProfile === "default") {
    return {
      accountProfile,
      profilePath: settings.profilePath?.trim?.() || defaultProfilePath(),
      port: basePort,
    };
  }
  const root = settings.profilesRootPath?.trim?.() || defaultProfilesRootPath();
  return {
    accountProfile,
    profilePath: join(root, accountProfile),
    port: basePort + stableProfileOffset(accountProfile),
  };
}

function resolveGenerationPreferences(configuration = {}) {
  const modelKey = configuration.imageModel || "flow_auto";
  const aspectRatioKey = configuration.aspectRatio || "flow_current";
  if (!Object.hasOwn(IMAGE_MODELS, modelKey)) {
    throw codedError("INVALID_CONFIGURATION", "imageModel não é reconhecido.");
  }
  if (!Object.hasOwn(ASPECT_RATIOS, aspectRatioKey)) {
    throw codedError("INVALID_CONFIGURATION", "aspectRatio não é reconhecido.");
  }
  return {
    modelKey,
    imageModelName: IMAGE_MODELS[modelKey],
    aspectRatioKey,
    imageAspectRatio: ASPECT_RATIOS[aspectRatioKey],
    fallbackOnModelLimit: configuration.fallbackOnModelLimit !== false,
  };
}

function normalizeReferenceImages(value) {
  const out = [];
  const visit = (item) => {
    if (!item) return;
    if (Array.isArray(item)) {
      for (const nested of item) visit(nested);
      return;
    }
    if (typeof item === "object") out.push(item);
  };
  visit(value);
  return out;
}

function assertDedicatedProfilePath(path) {
  const normalized = String(path).replaceAll("\\", "/").toLowerCase().replace(/\/+$/, "");
  const looksLikeDefaultChrome =
    normalized.endsWith("/google/chrome/user data") ||
    normalized.endsWith("/google/chrome/default") ||
    normalized.includes("/google/chrome/user data/default");
  if (looksLikeDefaultChrome) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "Não use o perfil pessoal padrão do Chrome. Configure profilePath para uma pasta dedicada ao ContentFlow.",
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
      resolve({ ok: false, stdout: "", stderr: "" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish(false);
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
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

async function windowsChromeCandidates() {
  const found = [];
  const registryKeys = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
  ];

  for (const key of registryKeys) {
    const result = await captureProcess("reg.exe", ["query", key, "/ve"]);
    if (result.ok) {
      const value = parseRegistryDefaultValue(result.stdout);
      if (value) found.push(value);
    }
  }

  const whereResult = await captureProcess("where.exe", ["chrome.exe"]);
  if (whereResult.ok) {
    found.push(
      ...whereResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }

  found.push(
    process.env.PROGRAMFILES &&
      join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  );

  return dedupeStrings(found);
}

async function chromeCandidates() {
  const p = platform();
  if (p === "win32") return await windowsChromeCandidates();
  if (p === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

  const found = [];
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const result = await captureProcess("which", [name]);
    if (result.ok) found.push(...result.stdout.split(/\r?\n/));
  }
  found.push(
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  );
  return dedupeStrings(found);
}

async function resolveChromeExecutables(settings) {
  const explicit = settings?.chromeExecutable?.trim?.();
  if (explicit) return [explicit];

  const candidates = await chromeCandidates();
  if (candidates.length) return candidates;

  throw codedError(
    "INVALID_CONFIGURATION",
    "Google Chrome não foi localizado. Configure settings.chromeExecutable com o caminho do executável.",
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
    const json = await response.json();
    return typeof json?.webSocketDebuggerUrl === "string" ? json : null;
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
  startUrl,
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
    startUrl,
  ];
  if (startMinimized) args.unshift("--start-minimized");

  const launchErrors = [];
  for (const executable of executables) {
    let child;
    let spawnFailure = null;
    try {
      child = spawn(executable, args, {
        detached: Boolean(keepBrowserOpen),
        stdio: "ignore",
        windowsHide: false,
        shell: false,
      });
    } catch (cause) {
      launchErrors.push(`${executable}: ${cause?.message ?? cause}`);
      continue;
    }

    child.once("error", (cause) => {
      spawnFailure = cause;
    });
    if (keepBrowserOpen) child.unref();

    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      if (spawnFailure) break;
      const version = await fetchBrowserVersion(port);
      if (version) return { version, child, startedByPlugin: true, executable };
      await sleep(350, signal);
    }

    if (spawnFailure) {
      launchErrors.push(`${executable}: ${spawnFailure.message}`);
      continue;
    }

    launchErrors.push(`${executable}: processo iniciou, mas a porta CDP não respondeu.`);
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }

  const detail = launchErrors.slice(0, 4).join(" | ");
  throw codedError(
    "PERMISSION_DENIED",
    `Não consegui iniciar o Google Chrome automaticamente.${detail ? ` Tentativas: ${detail}` : ""} Configure settings.chromeExecutable somente se o Chrome estiver em um local não padrão.`,
  );
}

function describeCdpParams(method, params) {
  if (method === "Input.insertText") {
    const text = String(params?.text ?? "");
    return `textLength=${text.length}; sha256=${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
  }
  if (method === "Fetch.continueRequest") return "request body redacted";
  if (method === "Page.navigate" || method === "Target.createTarget") {
    try {
      const url = new URL(String(params?.url ?? ""));
      return `url=${url.origin}${url.pathname}`;
    } catch {
      return "url=invalid";
    }
  }
  return "";
}

class CdpClient {
  constructor(wsUrl, trace) {
    this.wsUrl = wsUrl;
    this.trace = trace;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
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
        () => {
          signal?.removeEventListener("abort", onAbort);
          reject(
            codedError(
              "UPSTREAM_UNAVAILABLE",
              "Não foi possível conectar ao Chrome DevTools Protocol.",
            ),
          );
        },
        { once: true },
      );
    });

    this.ws.addEventListener("message", (event) => this.#onMessage(event));
    this.ws.addEventListener("close", () =>
      this.#rejectAll(codedError("UPSTREAM_UNAVAILABLE", "Conexão CDP encerrada.")),
    );
    return this;
  }

  #onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        this.trace?.(`CDP ← ${pending.method}: ERRO ${message.error.message}`);
        pending.reject(
          codedError("UPSTREAM_UNAVAILABLE", `CDP ${pending.method}: ${message.error.message}`),
        );
      } else {
        this.trace?.(`CDP ← ${pending.method}: OK`);
        pending.resolve(message.result ?? {});
      }
      return;
    }

    if (message.method) {
      if (/^(Fetch\.|Page\.frameNavigated|Runtime\.executionContext)/.test(message.method)) {
        this.trace?.(`CDP ← evento ${message.method}`);
      }
      const handlers = this.listeners.get(message.method);
      if (!handlers) return;
      for (const handler of [...handlers]) {
        try {
          handler(message.params ?? {}, message.sessionId);
        } catch {
          /* listener isolado */
        }
      }
    }
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  send(method, params = {}, sessionId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return Promise.reject(codedError("UPSTREAM_UNAVAILABLE", "CDP não conectado."));
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    const detail = describeCdpParams(method, params);
    this.trace?.(`CDP → ${method}${detail ? `: ${detail}` : ""}`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(message));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }
}

async function attachFlowPage(client, startUrl, pinned, signal) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  const projectTarget = targetInfos.find(
    (item) =>
      item.type === "page" && /labs\.google\/fx\/.*tools\/flow\/project\//i.test(String(item.url)),
  );
  let target =
    projectTarget ||
    targetInfos.find((item) => item.type === "page" && String(item.url).includes("labs.google"));
  if (!target) target = targetInfos.find((item) => item.type === "page");

  let targetId = target?.targetId;
  if (!targetId) {
    const created = await client.send("Target.createTarget", { url: startUrl });
    targetId = created.targetId;
  }

  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  // Input.dispatchMouseEvent/Input.insertText atuam sobre a página ativa.
  // Ativamos explicitamente o target para não mandar eventos para uma aba Flow em background.
  try {
    await client.send("Target.activateTarget", { targetId });
  } catch {
    /* best effort */
  }
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Network.enable",
    { maxTotalBufferSize: 50 * 1024 * 1024, maxResourceBufferSize: 25 * 1024 * 1024 },
    sessionId,
  );
  try {
    await client.send("Page.bringToFront", {}, sessionId);
  } catch {
    /* best effort */
  }

  const targetUrl = String(target?.url || "");
  const canReuseProject = !pinned && /labs\.google\/fx\/.*tools\/flow\/project\//i.test(targetUrl);
  if (!canReuseProject || pinned) {
    await client.send("Page.navigate", { url: startUrl }, sessionId);
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      const state = await evaluate(
        client,
        sessionId,
        "({readyState: document.readyState, url: location.href})",
      );
      if (["interactive", "complete"].includes(state?.readyState)) break;
    } catch {
      // Contexto pode estar sendo recriado durante redirect/login.
    }
    await sleep(400, signal);
  }
  return { sessionId, targetId };
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails?.exception?.description ||
      result.exceptionDetails?.text ||
      "Erro JavaScript na página.";
    throw codedError("OUTPUT_VALIDATION_FAILED", description);
  }
  return result.result?.value;
}

const DEEP_HELPERS = String.raw`
function cfVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 12 && r.height > 12 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}
function cfAll(selector, root = document) {
  const out = [];
  const walk = (node) => {
    if (!node?.querySelectorAll) return;
    for (const el of node.querySelectorAll(selector)) out.push(el);
    for (const el of node.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(root);
  return [...new Set(out)];
}
function cfText(el) {
  return [el?.innerText, el?.textContent, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title'), el?.getAttribute?.('placeholder'), el?.getAttribute?.('name'), el?.id]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
function cfEditableSelector() {
  return '[data-slate-editor="true"], [contenteditable="true"], [contenteditable="plaintext-only"], textarea, input[type="text"], input:not([type]), [role="textbox"]';
}
function cfMatchesEditable(el) {
  if (!el || !(el instanceof Element) || !cfVisible(el) || el.disabled || el.readOnly) return false;
  const slate = (el.getAttribute?.('data-slate-editor') || '').toLowerCase();
  const ce = (el.getAttribute?.('contenteditable') || '').toLowerCase();
  if (slate === 'true' || ce === 'true' || ce === 'plaintext-only') return true;
  return el.matches?.('textarea, input[type="text"], input:not([type]), [role="textbox"]') || false;
}
function cfFindPromptByPlaceholder() {
  const placeholders = cfAll('[data-slate-placeholder="true"]').filter(el => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return /^(o que você quer criar\?|what do you want to create\?)$/i.test(t);
  });
  for (const ph of placeholders) {
    const closest = ph.closest?.('[data-slate-editor="true"], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
    if (cfMatchesEditable(closest)) return closest;
    let cur = ph.parentElement;
    for (let depth = 0; depth < 20 && cur; depth += 1, cur = cur.parentElement) {
      if (cfMatchesEditable(cur)) return cur;
      const slate = cur.querySelector?.('[data-slate-editor="true"]');
      if (cfMatchesEditable(slate)) return slate;
      const editable = cur.querySelector?.('[contenteditable="true"], [contenteditable="plaintext-only"]');
      if (cfMatchesEditable(editable)) return editable;
    }
  }
  return null;
}
function cfPromptCandidate(customSelector = '') {
  if (customSelector) {
    try {
      const direct = cfAll(customSelector).find(el => cfMatchesEditable(el) || cfVisible(el));
      if (cfMatchesEditable(direct)) return direct;
      const nested = direct?.querySelector?.(cfEditableSelector());
      if (cfMatchesEditable(nested)) return nested;
    } catch { return null; }
  }
  const exact = cfFindPromptByPlaceholder();
  if (exact) return exact;
  const candidates = cfAll(cfEditableSelector()).filter(cfMatchesEditable);
  let best = null;
  let bestScore = -Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const t = cfText(el);
    const container = el.closest('form, section, article, div') || el.parentElement;
    const around = container ? cfText(container).slice(0, 800) : '';
    let score = 0;
    if ((el.getAttribute('data-slate-editor') || '').toLowerCase() === 'true') score += 180;
    if (el.isContentEditable) score += 60;
    if ((el.getAttribute('contenteditable') || '').toLowerCase() === 'plaintext-only') score += 55;
    if (el.tagName === 'TEXTAREA') score += 35;
    if (el.getAttribute('role') === 'textbox') score += 20;
    if (/(o que você quer criar|what do you want to create)/i.test(around)) score += 220;
    if (/(search|buscar|pesquisar)/i.test(t)) score -= 200;
    score += Math.min(40, (r.width * r.height) / 10000);
    if (score > bestScore) { bestScore = score; best = el; }
  }
  return best;
}
function cfGenerateCandidate(prompt, customSelector = '', includeDisabled = false) {
  let candidates = [];
  if (customSelector) {
    try { candidates = cfAll(customSelector); } catch { return null; }
  } else {
    const exact = cfAll('button').filter(btn => [...btn.querySelectorAll('span')]
      .some(span => /^(criar|create|gerar|generate)$/i.test((span.textContent || '').trim())));
    candidates = exact.length ? exact : cfAll('button, [role="button"], input[type="submit"]');
  }
  candidates = candidates.filter(cfVisible);
  let best = null;
  let bestScore = -Infinity;
  const pr = prompt?.getBoundingClientRect?.();
  for (const el of candidates) {
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
    if (disabled && !includeDisabled) continue;
    const t = cfText(el);
    const r = el.getBoundingClientRect();
    const exactLabel = [...(el.querySelectorAll?.('span') || [])]
      .some(span => /^(criar|create|gerar|generate)$/i.test((span.textContent || '').trim()));
    let score = 0;
    if (exactLabel) score += 320;
    if (/^(gerar|generate|criar|create)$/i.test(t)) score += 180;
    else if (/(gerar|generate|criar|create)/i.test(t)) score += 120;
    if (/arrow_forward/i.test(el.innerHTML || '')) score += 60;
    if (/(novo projeto|new project|renomear|rename|excluir|delete|cancelar execução)/i.test(t)) score -= 300;
    if (pr) {
      const dx = Math.abs((r.left + r.width / 2) - (pr.left + pr.width / 2));
      const dy = Math.abs((r.top + r.height / 2) - (pr.top + pr.height / 2));
      score += Math.max(0, 80 - (dx + dy) / 14);
      if (r.top >= pr.top - 260 && r.top <= pr.bottom + 260) score += 45;
    }
    if (disabled) score -= 20;
    if (score > bestScore) { bestScore = score; best = el; }
  }
  return best;
}
`;

function pageStateExpression(promptSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const prompt = cfPromptCandidate(${JSON.stringify(promptSelector || "")});
    const iframes = cfAll('iframe').filter(cfVisible);
    const challenge = iframes.some(f => /recaptcha|challenge/i.test((f.src || '') + ' ' + (f.title || '')));
    const host = location.hostname;
    const href = location.href;
    const projectLike = /\/tools\/flow\/project\//i.test(location.pathname);
    const loginLike = host === 'accounts.google.com' || /signin|login|challenge/i.test(href);
    const links = cfAll('a[href]').filter(cfVisible).map(a => ({ href: a.href, text: cfText(a) }));
    const projectLinks = links.filter(x => /\/tools\/flow\/project\//i.test(x.href)).slice(0, 10);
    const clickables = cfAll('button, [role="button"], a[href]').filter(cfVisible).map(el => ({
      text: cfText(el),
      tag: el.tagName,
      href: el.href || ''
    }));
    const hasNewProject = clickables.some(x => /(^|\s)(novo projeto|new project)(\s|$)/i.test(x.text));
    const hasFlowCta = clickables.some(x => /(create with google flow|criar com o google flow|try in google flow|experimentar no google flow|começar|start creating)/i.test(x.text));
    return { url: href, host, promptFound: !!prompt, challenge, loginLike, projectLike, projectLinks, hasNewProject, hasFlowCta };
  })()`;
}

async function getPageState(client, sessionId, promptSelector) {
  return evaluate(client, sessionId, pageStateExpression(promptSelector));
}

function bootstrapActionPointExpression(action) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const candidates = cfAll('button, [role="button"], a[href]').filter(cfVisible);
    let match = null;
    if (${JSON.stringify(action)} === 'new-project') {
      // A interface atual pode renderizar o ícone como span/SVG, não como <i>.
      // Por isso, localizamos o botão pelo texto acessível completo.
      match = candidates.find(el => {
        const text = cfText(el);
        return /(^|\s)(novo projeto|new project)(\s|$)/i.test(text);
      });
    } else if (${JSON.stringify(action)} === 'flow-cta') {
      match = candidates.find(el => /(create with google flow|criar com o google flow|try in google flow|experimentar no google flow|começar|start creating)/i.test(cfText(el)));
    }
    if (!match) return { ok: false };
    match.scrollIntoView({ block: 'center', inline: 'center' });
    match.focus({ preventScroll: true });
    const r = match.getBoundingClientRect();
    // O card de projeto atual do Flow pode ignorar eventos de mouse CDP sintéticos.
    // O clique DOM ocorre no mesmo documento/elemento já validado acima.
    match.click();
    return {
      ok: true,
      text: (match.innerText || match.textContent || '').replace(/\s+/g, ' ').trim(),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2
    };
  })()`;
}

async function clickBootstrapAction(client, sessionId, action) {
  try {
    await client.send("Page.bringToFront", {}, sessionId);
  } catch {
    /* best effort */
  }
  const point = await evaluate(client, sessionId, bootstrapActionPointExpression(action));
  if (!point?.ok || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { ok: false };
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", x: point.x, y: point.y },
    sessionId,
  );
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
  return point;
}

async function ensureFlowProjectReady(
  client,
  sessionId,
  settings,
  signal,
  shortWait = false,
  trace,
) {
  const seconds = shortWait
    ? Math.min(
        90,
        Number.isInteger(settings?.interactiveWaitSeconds) ? settings.interactiveWaitSeconds : 600,
      )
    : Number.isInteger(settings?.interactiveWaitSeconds)
      ? settings.interactiveWaitSeconds
      : 600;
  const deadline = Date.now() + seconds * 1000;
  let last = null;
  let lastActionAt = 0;
  let actionCount = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    try {
      last = await getPageState(client, sessionId, settings?.promptSelector || "");
      trace?.(
        `Flow state: projectLike=${Boolean(last?.projectLike)}; promptFound=${Boolean(last?.promptFound)}; newProject=${Boolean(last?.hasNewProject)}; projectLinks=${last?.projectLinks?.length ?? 0}`,
      );
      if (last?.projectLike && last?.promptFound) return last;

      // Durante login/CAPTCHA não fazemos nada: a janela fica disponível para intervenção humana.
      if (!last?.loginLike && !last?.challenge && Date.now() - lastActionAt > 2500) {
        if (Array.isArray(last?.projectLinks) && last.projectLinks.length > 0) {
          const candidate = last.projectLinks[0]?.href;
          if (typeof candidate === "string" && candidate.startsWith("https://labs.google/")) {
            await client.send("Page.navigate", { url: candidate }, sessionId);
            lastActionAt = Date.now();
            actionCount += 1;
          }
        } else if (settings?.autoCreateProject !== false) {
          const clicked = await clickBootstrapAction(client, sessionId, "new-project");
          trace?.(
            `Flow action new-project: matched=${Boolean(clicked?.ok)}; text=${String(clicked?.text ?? "").slice(0, 80)}`,
          );
          if (clicked?.ok) {
            lastActionAt = Date.now();
            actionCount += 1;
          }
        } else if (last?.hasFlowCta) {
          const clicked = await clickBootstrapAction(client, sessionId, "flow-cta");
          trace?.(
            `Flow action flow-cta: matched=${Boolean(clicked?.ok)}; text=${String(clicked?.text ?? "").slice(0, 80)}`,
          );
          if (clicked?.ok) {
            lastActionAt = Date.now();
            actionCount += 1;
          }
        }
      }
    } catch (cause) {
      trace?.(`Flow probe error: ${String(cause?.message ?? cause).slice(0, 240)}`);
      // Redirects de autenticação podem recriar o execution context.
    }
    await sleep(1000, signal);
  }

  if (last?.loginLike || last?.challenge) {
    throw codedError(
      "AUTHENTICATION_FAILED",
      "O Google Flow ainda está aguardando login, reautenticação ou CAPTCHA. Conclua a etapa na janela do Chrome e execute novamente.",
    );
  }
  if (!last?.projectLike) {
    throw codedError(
      "AUTHENTICATION_FAILED",
      "Não foi possível entrar em um projeto do Google Flow. Na janela aberta, faça login e escolha/crie um projeto; depois execute novamente.",
    );
  }
  throw codedError(
    "OUTPUT_VALIDATION_FAILED",
    `Entrei no projeto, mas não encontrei a caixa de comando do Google Flow${actionCount ? ` após ${actionCount} ação(ões) de onboarding` : ""}. Se a interface mudou, configure promptSelector.`,
  );
}

async function setBrowserWindowState(client, targetId, windowState) {
  try {
    const { windowId } = await client.send("Browser.getWindowForTarget", { targetId });
    if (Number.isInteger(windowId)) {
      await client.send("Browser.setWindowBounds", { windowId, bounds: { windowState } });
    }
  } catch {
    // Estado da janela é conveniência; falha não interrompe geração.
  }
}

function ensureImageModeExpression(promptSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const prompt = cfPromptCandidate(${JSON.stringify(promptSelector || "")});
    if (!prompt) return { ok: false, reason: 'prompt-not-found' };
    const pr = prompt.getBoundingClientRect();
    const candidates = cfAll('button, [role="button"], [role="menuitem"], [role="option"]').filter(el => cfVisible(el) && !el.disabled);
    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      const t = cfText(el);
      if (!/(^|\\s)(imagem|image)(\\s|$)/i.test(t)) continue;
      if (/(todas as imagens|all images|biblioteca|library|filtro|filter)/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      const dx = Math.abs((r.left + r.width / 2) - (pr.left + pr.width / 2));
      const dy = Math.abs((r.top + r.height / 2) - (pr.top + pr.height / 2));
      let score = 100 - (dx + dy) / 18;
      const role = el.getAttribute('role') || '';
      if (role === 'menuitem' || role === 'option') score += 120;
      if (r.top >= pr.top - 250 && r.top <= pr.bottom + 250) score += 40;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (!best || bestScore < 40) return { ok: true, changed: false };
    best.click();
    return { ok: true, changed: true };
  })()`;
}

async function ensureImageMode(client, sessionId, settings, signal) {
  const first = await evaluate(
    client,
    sessionId,
    ensureImageModeExpression(settings?.promptSelector || ""),
  );
  if (!first?.ok || !first.changed) return;
  await sleep(300, signal);
  // Se o primeiro clique abriu um menu, um segundo clique em "Imagem/Image" próximo à caixa escolhe a opção.
  try {
    await evaluate(client, sessionId, ensureImageModeExpression(settings?.promptSelector || ""));
  } catch {
    /* best effort */
  }
  await sleep(250, signal);
}

function referenceUploadActionExpression(promptSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const prompt = cfPromptCandidate(${JSON.stringify(promptSelector || "")});
    if (!prompt) return { ok: false, reason: 'prompt-not-found' };
    const pr = prompt.getBoundingClientRect();
    const candidates = cfAll('button, [role="button"], label').filter(cfVisible);
    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      const t = cfText(el);
      if (!/(adicionar|add|upload|carregar|refer.ncia|reference|ingrediente|ingredient)/i.test(t)) continue;
      if (/(excluir|delete|remove|remover|projeto|project)/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      const dx = Math.abs((r.left + r.width / 2) - (pr.left + pr.width / 2));
      const dy = Math.abs((r.top + r.height / 2) - (pr.top + pr.height / 2));
      let score = 180 - (dx + dy) / 14;
      if (r.top >= pr.top - 260 && r.top <= pr.bottom + 260) score += 80;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (!best || bestScore < 40) return { ok: false, reason: 'upload-action-not-found' };
    best.scrollIntoView({ block: 'center', inline: 'center' });
    best.click();
    return { ok: true, text: cfText(best).slice(0, 120) };
  })()`;
}

function cdpNodeAttributes(node) {
  const attributes = {};
  const raw = Array.isArray(node?.attributes) ? node.attributes : [];
  for (let index = 0; index + 1 < raw.length; index += 2)
    attributes[String(raw[index]).toLowerCase()] = String(raw[index + 1]);
  return attributes;
}

function findImageFileInputNode(node) {
  if (!node || typeof node !== "object") return null;
  if (String(node.nodeName || "").toLowerCase() === "input") {
    const attributes = cdpNodeAttributes(node);
    if (String(attributes.type || "").toLowerCase() === "file") {
      const accept = String(attributes.accept || "").toLowerCase();
      if (!accept || accept.includes("image") || /png|jpe?g|webp/.test(accept)) return node;
    }
  }
  for (const child of [
    ...(node.children || []),
    ...(node.shadowRoots || []),
    ...(node.contentDocument ? [node.contentDocument] : []),
  ]) {
    const found = findImageFileInputNode(child);
    if (found) return found;
  }
  return null;
}

async function locateImageFileInput(client, sessionId) {
  const documentResult = await client.send(
    "DOM.getDocument",
    { depth: -1, pierce: true },
    sessionId,
  );
  return findImageFileInputNode(documentResult?.root);
}

async function prepareReferenceImagePaths(referenceImages, services, maximum) {
  if (referenceImages.length > maximum) {
    throw codedError(
      "INVALID_INPUT",
      `Recebi ${referenceImages.length} imagens de referência; o limite configurado é ${maximum}.`,
    );
  }
  const paths = [];
  for (const image of referenceImages) {
    const mimeType = String(image?.mimeType || "").toLowerCase();
    if (mimeType && !mimeType.startsWith("image/")) {
      throw codedError(
        "INVALID_INPUT",
        `A referência ${String(image?.name || "sem nome")} não é uma imagem.`,
      );
    }
    const resolved = await services.resolveInputFile(image);
    const info = await stat(resolved);
    if (!info.isFile() || info.size < 1 || info.size > MAX_IMAGE_BYTES) {
      throw codedError(
        "INVALID_INPUT",
        `A referência ${String(image?.name || "sem nome")} está vazia ou excede 25 MB.`,
      );
    }
    paths.push(resolved);
  }
  return paths;
}

async function uploadReferenceImages(client, sessionId, filePaths, settings, signal, step) {
  if (filePaths.length === 0) return;
  await ensureImageMode(client, sessionId, settings, signal);
  let input = await locateImageFileInput(client, sessionId);
  if (!input) {
    const action = await evaluate(
      client,
      sessionId,
      referenceUploadActionExpression(settings?.promptSelector || ""),
    );
    if (!action?.ok) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "Não encontrei o controle para adicionar imagens de referência no Google Flow.",
      );
    }
    step?.(`Controle de referência aberto (${action.text || "Adicionar"}).`);
    const deadline = Date.now() + 10_000;
    while (!input && Date.now() < deadline) {
      await sleep(250, signal);
      input = await locateImageFileInput(client, sessionId);
    }
  }
  if (!input?.nodeId) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "O Google Flow abriu o seletor de referências, mas nenhum input de imagem ficou disponível.",
    );
  }
  await client.send("DOM.setFileInputFiles", { files: filePaths, nodeId: input.nodeId }, sessionId);
  step?.(`${filePaths.length} imagem(ns) de referência enviada(s) ao projeto.`);
  await sleep(Math.min(15_000, 2_000 + filePaths.length * 1_000), signal);
}

function focusPromptExpression(customSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const el = cfPromptCandidate(${JSON.stringify(customSelector || "")});
    if (!el) return { ok: false, reason: 'prompt-not-found' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    return {
      ok: true,
      tag: el.tagName,
      role: el.getAttribute('role') || '',
      contenteditable: el.getAttribute('contenteditable') || '',
      slate: el.getAttribute('data-slate-editor') || '',
      x: r.left + r.width / 2,
      y: r.top + r.height / 2
    };
  })()`;
}

function promptValueExpression(customSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const el = cfPromptCandidate(${JSON.stringify(customSelector || "")});
    if (!el) return { found: false, text: '' };
    const text = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
      ? (el.value || '')
      : (el.innerText || el.textContent || '');
    return { found: true, text: String(text).replace(/\\uFEFF/g, '').trim() };
  })()`;
}

async function setPrompt(client, sessionId, prompt, customSelector, signal, typing = {}) {
  try {
    await client.send("Page.bringToFront", {}, sessionId);
  } catch {
    /* best effort */
  }
  const target = await evaluate(client, sessionId, focusPromptExpression(customSelector));
  if (!target?.ok)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Não encontrei o editor Slate do prompt do Google Flow.",
    );

  if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    await client.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: target.x, y: target.y },
      sessionId,
    );
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
  }

  // Seleciona tudo dentro do editor atualmente focado e substitui pelo prompt via CDP.
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: 2,
      commands: ["SelectAll"],
    },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: 2,
    },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
    },
    sessionId,
  );
  await client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
    },
    sessionId,
  );
  const chunkSize = Number.isInteger(typing.chunkSize) ? typing.chunkSize : 4;
  const delayMs = Number.isInteger(typing.delayMs) ? typing.delayMs : 35;
  for (const chunk of chunkTextForTyping(prompt, chunkSize)) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    await client.send("Input.insertText", { text: chunk }, sessionId);
    if (delayMs > 0) await sleep(delayMs, signal);
  }
  await sleep(300, signal);

  const readback = await evaluate(client, sessionId, promptValueExpression(customSelector));
  const expected = String(prompt).replace(/\s+/g, " ").trim();
  const actual = String(readback?.text || "")
    .replace(/\s+/g, " ")
    .trim();
  const sample = expected.slice(0, Math.min(60, expected.length));
  if (!readback?.found || !actual || (sample && !actual.includes(sample))) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `O editor Slate recebeu foco, mas o texto não apareceu. Editor ${target.tag || "?"} slate=${target.slate || "false"} contenteditable=${target.contenteditable || "n/a"}.`,
    );
  }
  return { ...target, readbackLength: actual.length };
}
function generateButtonPointExpression(promptSelector, generateSelector) {
  return String.raw`(() => { ${DEEP_HELPERS}
    const prompt = cfPromptCandidate(${JSON.stringify(promptSelector || "")});
    const btn = cfGenerateCandidate(prompt, ${JSON.stringify(generateSelector || "")}, false);
    if (!btn) return { ok: false, reason: 'generate-not-found' };
    btn.scrollIntoView({ block: 'center', inline: 'center' });
    btn.focus({ preventScroll: true });
    const r = btn.getBoundingClientRect();
    return {
      ok: true,
      text: cfText(btn),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      ariaDisabled: btn.getAttribute('aria-disabled') || ''
    };
  })()`;
}

async function waitGenerateEnabled(client, sessionId, settings, signal, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(
      client,
      sessionId,
      `(() => { ${DEEP_HELPERS}
      const prompt = cfPromptCandidate(${JSON.stringify(settings?.promptSelector || "")});
      const btn = cfGenerateCandidate(prompt, ${JSON.stringify(settings?.generateSelector || "")}, true);
      return {
        found: !!btn,
        disabled: btn ? (btn.disabled || btn.getAttribute('aria-disabled') === 'true') : null,
        text: btn ? cfText(btn) : '',
        ariaDisabled: btn ? (btn.getAttribute('aria-disabled') || '') : ''
      };
    })()`,
    );
    if (last?.found && !last?.disabled) return last;
    await sleep(250, signal);
  }
  if (!last?.found)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Não encontrei o botão Criar/Gerar do Google Flow.",
    );
  throw codedError(
    "OUTPUT_VALIDATION_FAILED",
    "O botão Criar foi encontrado, mas continuou com aria-disabled=true após preencher o prompt.",
  );
}

async function clickGenerate(client, sessionId, settings) {
  try {
    await client.send("Page.bringToFront", {}, sessionId);
  } catch {
    /* best effort */
  }
  const target = await evaluate(
    client,
    sessionId,
    generateButtonPointExpression(settings?.promptSelector || "", settings?.generateSelector || ""),
  );
  if (!target?.ok || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Não encontrei o botão Criar/Gerar habilitado do Google Flow.",
    );
  }
  await client.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", x: target.x, y: target.y },
    sessionId,
  );
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
  return target;
}

function applyGenerationPreferences(rawPostData, imageModelName, imageAspectRatio) {
  const body = JSON.parse(String(rawPostData || ""));
  if (!Array.isArray(body?.requests) || body.requests.length === 0) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "batchGenerateImages sem requests[] no corpo interceptado.",
    );
  }

  let changed = 0;
  for (const item of body.requests) {
    if (!item || typeof item !== "object") continue;
    if (imageModelName && item.imageModelName !== imageModelName) {
      item.imageModelName = imageModelName;
      changed += 1;
    }
    if (imageAspectRatio && item.imageAspectRatio !== imageAspectRatio) {
      item.imageAspectRatio = imageAspectRatio;
      changed += 1;
    }
  }
  return { body, postData: JSON.stringify(body), changed };
}

function installGenerationPreferencesInterceptor(client, sessionId, getPreferences, step) {
  let stopped = false;

  const offPaused = client.on("Fetch.requestPaused", (params, eventSessionId) => {
    if (stopped || eventSessionId !== sessionId) return;

    const request = params?.request ?? {};
    const url = String(request.url || "");
    if (String(request.method || "").toUpperCase() !== "POST" || !url.includes(GENERATION_SUFFIX)) {
      // O pattern do Fetch.enable já restringe a URL, mas mantemos guarda defensiva.
      void client
        .send("Fetch.continueRequest", { requestId: params.requestId }, sessionId)
        .catch(() => {});
      return;
    }

    void (async () => {
      let continued = false;
      try {
        const raw = typeof request.postData === "string" ? request.postData : "";
        if (!raw) {
          step?.(
            "batchGenerateImages interceptado, mas sem postData; requisição mantida sem alteração.",
          );
          await client.send("Fetch.continueRequest", { requestId: params.requestId }, sessionId);
          continued = true;
          return;
        }

        const { imageModelName, imageAspectRatio } = getPreferences();
        if (!imageModelName && !imageAspectRatio) {
          await client.send("Fetch.continueRequest", { requestId: params.requestId }, sessionId);
          continued = true;
          step?.("batchGenerateImages preservado: modelo e proporção controlados pelo Flow.");
          return;
        }
        const patched = applyGenerationPreferences(raw, imageModelName, imageAspectRatio);
        const postData = Buffer.from(patched.postData, "utf8").toString("base64");
        await client.send(
          "Fetch.continueRequest",
          {
            requestId: params.requestId,
            postData,
          },
          sessionId,
        );
        continued = true;
        step?.(
          patched.changed > 0
            ? `batchGenerateImages ajustado conforme a configuração explícita (modelo=${imageModelName || "Flow"}; proporção=${imageAspectRatio || "Flow"}).`
            : `batchGenerateImages já corresponde à configuração explícita (modelo=${imageModelName || "Flow"}; proporção=${imageAspectRatio || "Flow"}).`,
        );
      } catch (cause) {
        step?.(
          `Falha ao aplicar defaults na requisição: ${cause?.message ?? cause}. Enviando requisição original.`,
        );
        if (!continued) {
          try {
            await client.send("Fetch.continueRequest", { requestId: params.requestId }, sessionId);
          } catch {
            /* noop */
          }
        }
      }
    })();
  });

  return {
    async enable() {
      await client.send(
        "Fetch.enable",
        {
          patterns: [
            {
              urlPattern: `*${GENERATION_SUFFIX}*`,
              requestStage: "Request",
            },
          ],
        },
        sessionId,
      );
    },
    async disable() {
      stopped = true;
      offPaused();
      try {
        await client.send("Fetch.disable", {}, sessionId);
      } catch {
        /* noop */
      }
    },
  };
}

function createBatchResponseTracker(client, sessionId, signal) {
  const waiting = [];
  const byRequestId = new Map();
  let stopped = false;

  const removeWaiting = (reservation) => {
    const index = waiting.indexOf(reservation);
    if (index >= 0) waiting.splice(index, 1);
  };
  const settle = (reservation, ok, value) => {
    if (!reservation || reservation.settled) return;
    reservation.settled = true;
    clearTimeout(reservation.timer);
    removeWaiting(reservation);
    if (reservation.requestId) byRequestId.delete(reservation.requestId);
    if (ok) reservation.resolve(value);
    else reservation.reject(value);
  };

  const offRequest = client.on("Network.requestWillBeSent", (params, eventSessionId) => {
    if (stopped || eventSessionId !== sessionId) return;
    if (
      params?.request?.method !== "POST" ||
      !String(params?.request?.url || "").includes(GENERATION_SUFFIX)
    )
      return;
    const reservation = waiting.find((item) => !item.requestId && !item.settled);
    if (!reservation) return;
    reservation.requestId = params.requestId;
    byRequestId.set(params.requestId, reservation);
  });

  const offResponse = client.on("Network.responseReceived", (params, eventSessionId) => {
    if (stopped || eventSessionId !== sessionId) return;
    const reservation = byRequestId.get(params.requestId);
    if (reservation) reservation.responseStatus = params?.response?.status;
  });

  const offFinished = client.on("Network.loadingFinished", (params, eventSessionId) => {
    if (stopped || eventSessionId !== sessionId) return;
    const reservation = byRequestId.get(params.requestId);
    if (!reservation || reservation.readingBody) return;
    reservation.readingBody = true;
    void (async () => {
      try {
        const bodyResult = await client.send(
          "Network.getResponseBody",
          { requestId: params.requestId },
          sessionId,
        );
        const bodyText = bodyResult.base64Encoded
          ? Buffer.from(bodyResult.body || "", "base64").toString("utf8")
          : String(bodyResult.body || "");
        settle(reservation, true, { status: reservation.responseStatus, bodyText });
      } catch (cause) {
        settle(
          reservation,
          false,
          codedError(
            "OUTPUT_VALIDATION_FAILED",
            `Não consegui ler a resposta da geração no Chrome: ${cause.message}`,
          ),
        );
      }
    })();
  });

  const offFailed = client.on("Network.loadingFailed", (params, eventSessionId) => {
    if (stopped || eventSessionId !== sessionId) return;
    const reservation = byRequestId.get(params.requestId);
    if (reservation) {
      settle(
        reservation,
        false,
        codedError(
          "UPSTREAM_UNAVAILABLE",
          `A requisição de geração falhou no Chrome: ${params.errorText || "erro de rede"}`,
          true,
        ),
      );
    }
  });

  const abortError = () => codedError("CANCELLED", "Execução cancelada.");
  const onAbort = () => {
    for (const reservation of [...waiting, ...byRequestId.values()])
      settle(reservation, false, abortError());
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  return {
    reserve(timeoutMs) {
      if (stopped)
        throw codedError("UPSTREAM_UNAVAILABLE", "Rastreador de gerações já foi encerrado.");
      let resolve;
      let reject;
      const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const reservation = {
        resolve,
        reject,
        promise,
        requestId: null,
        responseStatus: null,
        settled: false,
        readingBody: false,
        timer: null,
      };
      reservation.timer = setTimeout(() => {
        settle(
          reservation,
          false,
          codedError(
            "TIMEOUT",
            "Nenhuma resposta de geração chegou a tempo. Verifique a janela do Chrome para login, CAPTCHA/reautenticação ou erro da interface.",
            true,
          ),
        );
      }, timeoutMs);
      waiting.push(reservation);
      return {
        promise,
        cancel(error) {
          settle(reservation, false, error);
        },
      };
    },
    close() {
      if (stopped) return;
      stopped = true;
      offRequest();
      offResponse();
      offFinished();
      offFailed();
      signal?.removeEventListener("abort", onAbort);
      const error = codedError(
        "UPSTREAM_UNAVAILABLE",
        "Rastreador de gerações encerrado antes da conclusão.",
        true,
      );
      for (const reservation of [...waiting, ...byRequestId.values()])
        settle(reservation, false, error);
    },
  };
}

function createAdaptiveConcurrencyController(configuredLimit, successThreshold) {
  let limit = configuredLimit;
  let protectionMode = false;
  let consecutiveSuccesses = 0;
  return {
    getLimit() {
      return limit;
    },
    success() {
      if (!protectionMode) return { protectionMode, restored: false, consecutiveSuccesses };
      consecutiveSuccesses += 1;
      if (consecutiveSuccesses >= successThreshold) {
        protectionMode = false;
        consecutiveSuccesses = 0;
        limit = configuredLimit;
        return { protectionMode, restored: true, consecutiveSuccesses };
      }
      return { protectionMode, restored: false, consecutiveSuccesses };
    },
    failure(error) {
      const previousSuccesses = consecutiveSuccesses;
      if (protectionMode) consecutiveSuccesses = 0;
      if (error?.httpStatus !== 403) {
        return {
          protectionMode,
          activated: false,
          reset: protectionMode && previousSuccesses > 0,
          consecutiveSuccesses,
        };
      }
      const activated = !protectionMode;
      protectionMode = true;
      consecutiveSuccesses = 0;
      limit = 1;
      return { protectionMode, activated, reset: !activated, consecutiveSuccesses };
    },
  };
}

async function runSubmissionRound(tasks, maxInFlight, submit, onState, options = {}) {
  const pending = [...tasks];
  const active = new Map();
  const succeeded = [];
  const failed = [];
  const minDelayMs = Math.max(0, Number(options.minDelayMs) || 0);
  const wait = options.wait ?? ((ms) => sleep(ms, options.signal));
  let nextSubmissionAt = 0;

  const currentLimit = () => {
    const value = typeof maxInFlight === "function" ? maxInFlight() : maxInFlight;
    return Math.max(1, Number(value) || 1);
  };
  const recordOutcome = (outcome) => {
    active.delete(outcome.task.index);
    if (outcome.ok) succeeded.push({ task: outcome.task, value: outcome.value });
    else failed.push({ task: outcome.task, error: outcome.error });
    onState?.({
      type: outcome.ok ? "succeeded" : "failed",
      task: outcome.task,
      error: outcome.error,
      active: active.size,
      pending: pending.length,
    });
    if (!outcome.ok && options.failFast === true) pending.length = 0;
  };

  while (pending.length > 0 || active.size > 0) {
    const canSubmit = pending.length > 0 && active.size < currentLimit();
    if (canSubmit && Date.now() >= nextSubmissionAt) {
      const task = pending.shift();
      try {
        const submission = await submit(task);
        const settled = Promise.resolve(submission.completion).then(
          (value) => ({ ok: true, task, value }),
          (error) => ({ ok: false, task, error }),
        );
        active.set(task.index, settled);
        nextSubmissionAt = Date.now() + minDelayMs;
        onState?.({ type: "submitted", task, active: active.size, pending: pending.length });
      } catch (error) {
        failed.push({ task, error });
        onState?.({ type: "failed", task, error, active: active.size, pending: pending.length });
        if (options.failFast === true) pending.length = 0;
      }
      continue;
    }

    if (active.size > 0) {
      const delayRemaining = canSubmit ? Math.max(0, nextSubmissionAt - Date.now()) : Infinity;
      if (Number.isFinite(delayRemaining) && delayRemaining > 0) {
        const event = await Promise.race([
          Promise.race(active.values()).then((outcome) => ({ type: "settled", outcome })),
          wait(delayRemaining).then(() => ({ type: "ready" })),
        ]);
        if (event.type === "settled") recordOutcome(event.outcome);
      } else {
        recordOutcome(await Promise.race(active.values()));
      }
      continue;
    }

    const delayRemaining = Math.max(0, nextSubmissionAt - Date.now());
    if (delayRemaining > 0) await wait(delayRemaining);
  }

  return { succeeded, failed };
}

async function runGenerationPlan({
  prompts,
  maxInFlight,
  retryAttempts,
  submit,
  onState,
  minDelayMs = 0,
  signal,
  failFast = false,
}) {
  const results = new Array(prompts.length).fill(undefined);
  const errors = new Array(prompts.length).fill(undefined);
  if (failFast) {
    for (let index = 0; index < prompts.length; index += 1) {
      let completed = false;
      for (let attempt = 1; attempt <= retryAttempts + 1; attempt += 1) {
        if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
        const task = { index, prompt: prompts[index], attempt };
        if (index > 0 || attempt > 1) await sleep(minDelayMs, signal);
        onState?.({ type: "submitted", task, active: 1, pending: prompts.length - index - 1 });
        try {
          const submission = await submit(task);
          results[index] = await submission.completion;
          errors[index] = undefined;
          onState?.({ type: "succeeded", task, active: 0, pending: prompts.length - index - 1 });
          completed = true;
          break;
        } catch (error) {
          errors[index] = error;
          onState?.({
            type: "failed",
            task,
            error,
            active: 0,
            pending: prompts.length - index - 1,
          });
          if (!shouldRetryGenerationError(error) || attempt > retryAttempts) throw error;
          onState?.({
            type: "retry-round",
            attempt: attempt + 1,
            tasks: [{ ...task, attempt: attempt + 1 }],
          });
        }
      }
      if (!completed)
        throw errors[index] ?? codedError("JOB_FAILED", "A geração não foi concluída.");
    }
    return { results, failures: [] };
  }
  let tasks = prompts.map((prompt, index) => ({ index, prompt, attempt: 1 }));

  for (let round = 0; round <= retryAttempts && tasks.length > 0; round += 1) {
    const outcome = await runSubmissionRound(tasks, maxInFlight, submit, onState, {
      minDelayMs,
      signal,
      failFast,
    });
    if (failFast && outcome.failed.length > 0) throw outcome.failed[0].error;
    for (const success of outcome.succeeded) {
      results[success.task.index] = success.value;
      errors[success.task.index] = undefined;
    }
    for (const failure of outcome.failed) errors[failure.task.index] = failure.error;
    tasks = outcome.failed
      .sort((left, right) => left.task.index - right.task.index)
      .map(({ task }) => ({ ...task, attempt: task.attempt + 1 }));
    if (tasks.length > 0 && round < retryAttempts) {
      onState?.({ type: "retry-round", attempt: round + 2, tasks: [...tasks] });
    }
  }

  return {
    results,
    failures: tasks.map((task) => ({
      task: { ...task, attempt: task.attempt - 1 },
      error: errors[task.index],
    })),
  };
}

function shouldRetryGenerationError(error) {
  return (
    error?.retryable !== false &&
    ["UPSTREAM_UNAVAILABLE", "TIMEOUT", "JOB_FAILED"].includes(error?.code)
  );
}

function classifyGenerationHttpError(status, bodyText) {
  let providerStatus = "";
  let providerMessage = "";
  try {
    const body = JSON.parse(String(bodyText || ""));
    providerStatus = typeof body?.error?.status === "string" ? body.error.status.slice(0, 80) : "";
    providerMessage =
      typeof body?.error?.message === "string" ? body.error.message.slice(0, 500) : "";
  } catch {
    /* corpo não JSON ou sem erro estruturado */
  }

  const hint = `${providerStatus} ${providerMessage}`.toLowerCase();
  let error;
  const modelSpecificLimit =
    /(daily|di.rio|quota|limit).{0,120}(model|nano banana|gem.pix)|(?:model|nano banana|gem.pix).{0,120}(daily|di.rio|quota|limit)/i.test(
      hint,
    );
  if (status === 401 || /unauthenticated|login|credential|session expired/.test(hint)) {
    error = codedError(
      "AUTHENTICATION_FAILED",
      "O Google Flow exige login ou reautenticação na janela do Chrome.",
      true,
    );
  } else if (/recaptcha|captcha|challenge/.test(hint)) {
    error = codedError(
      "AUTHENTICATION_FAILED",
      "O Google Flow recusou o CAPTCHA/reCAPTCHA desta geração. Conclua a verificação na janela do Chrome e execute novamente.",
      false,
    );
  } else if (modelSpecificLimit) {
    error = codedError(
      "MODEL_LIMIT",
      "O limite diário do modelo de imagem selecionado foi atingido.",
      false,
    );
  } else if (status === 429 || /quota|credit|resource_exhausted|rate.?limit|too many/.test(hint)) {
    error = codedError(
      "RATE_LIMIT",
      "O Google Flow recusou a geração por limite, cota ou créditos disponíveis.",
      true,
    );
    error.retryAfterMs = 60_000;
  } else if (status === 403) {
    error = codedError(
      "PERMISSION_DENIED",
      `O Google Flow recusou a geração (HTTP 403${providerStatus ? `, ${providerStatus}` : ""}). Verifique a janela do Chrome.`,
      false,
    );
  } else if (Number.isFinite(status) && status >= 500) {
    error = codedError("UPSTREAM_UNAVAILABLE", `Google Flow indisponível (HTTP ${status}).`, true);
  } else {
    error = codedError("JOB_FAILED", `Google Flow recusou a geração (HTTP ${status}).`);
  }
  error.httpStatus = status;
  error.providerStatus = providerStatus;
  return error;
}

function parseGenerationResponse(captured) {
  const status = Number(captured?.status);
  if (Number.isFinite(status) && status >= 400) {
    throw classifyGenerationHttpError(status, captured?.bodyText);
  }

  let body;
  try {
    body = JSON.parse(captured?.bodyText || "");
  } catch {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "A resposta de geração capturada não é JSON válido.",
    );
  }

  if (!Array.isArray(body?.media) || body.media.length === 0) {
    throw codedError("OUTPUT_VALIDATION_FAILED", "A resposta do Google Flow não contém media[].");
  }
  return body;
}

function extensionForMime(mimeType) {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  return ".img";
}

async function downloadGeneratedImage(item, prompt, promptOrdinal, variantOrdinal, services) {
  const generated = item?.image?.generatedImage;
  const mediaUrl = generated?.fifeUrl;
  const mediaId = generated?.mediaId || item?.name || `image-${promptOrdinal}-${variantOrdinal}`;
  if (typeof mediaUrl !== "string" || !mediaUrl)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Imagem gerada sem fifeUrl.");

  const parsed = new URL(mediaUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== MEDIA_HOST) {
    throw codedError("OUTPUT_VALIDATION_FAILED", `Host de mídia inesperado: ${parsed.hostname}`);
  }

  let response;
  try {
    response = await fetch(mediaUrl, { signal: services.signal, redirect: "error" });
  } catch (cause) {
    if (services.signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    throw codedError(
      "UPSTREAM_UNAVAILABLE",
      `Falha ao baixar imagem gerada: ${cause?.message ?? cause}`,
      true,
    );
  }
  if (!response.ok)
    throw codedError(
      "UPSTREAM_UNAVAILABLE",
      `Falha ao baixar imagem gerada (HTTP ${response.status}).`,
      response.status >= 500,
    );

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Imagem excede 25 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES)
    throw codedError("OUTPUT_VALIDATION_FAILED", "Imagem vazia ou maior que 25 MB.");

  const mimeType = (response.headers.get("content-type") || "image/jpeg")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!mimeType.startsWith("image/"))
    throw codedError("OUTPUT_VALIDATION_FAILED", `MIME inesperado: ${mimeType}`);

  const ext = extensionForMime(mimeType);
  const promptPart = String(promptOrdinal).padStart(3, "0");
  const variantPart = String(variantOrdinal).padStart(2, "0");
  const filename = `${promptPart}_v${variantPart}_${safeFilename(prompt, String(mediaId))}${ext}`;
  const artifactId = `google-flow-image-${promptPart}-v${variantPart}`;
  const outputPath = services.getOutputPath(filename);
  await writeFile(outputPath, bytes);

  return {
    file: {
      id: artifactId,
      name: filename,
      mimeType,
      size: bytes.byteLength,
      url: `artifact://${artifactId}`,
    },
    artifact: {
      id: artifactId,
      name: filename,
      mimeType,
      size: bytes.byteLength,
      source: { kind: "path", path: filename },
    },
  };
}

async function maybeCloseBrowser(client, browserInfo, keepBrowserOpen) {
  if (!keepBrowserOpen && browserInfo?.startedByPlugin) {
    try {
      await client.send("Browser.close");
    } catch {
      /* Chrome pode fechar antes da resposta */
    }
  }
  client.close();
}

export async function execute(request, services) {
  if (request?.invocation?.mode !== "start") {
    return resultError(
      "INVALID_CONFIGURATION",
      "Esta capability suporta somente invocation.mode=start.",
    );
  }

  const prompts = normalizePrompts(request?.inputs?.prompts);
  if (prompts.length === 0) return resultError("INVALID_INPUT", "Informe pelo menos um prompt.");
  const referenceImages = normalizeReferenceImages(request?.inputs?.reference_images);

  const maxPrompts = Number.isInteger(request?.configuration?.maxPrompts)
    ? request.configuration.maxPrompts
    : 8;
  if (maxPrompts < 1 || maxPrompts > 16)
    return resultError("INVALID_CONFIGURATION", "maxPrompts deve ficar entre 1 e 16.");
  if (prompts.length > maxPrompts)
    return resultError(
      "INVALID_INPUT",
      `Recebi ${prompts.length} prompts; o limite configurado é ${maxPrompts}.`,
    );

  const settings = request?.settings ?? {};
  const keepBrowserOpen = settings.keepBrowserOpen !== false;
  const startMinimized = settings.startMinimized === true;
  const requestTimeoutSeconds = Number.isInteger(settings.requestTimeoutSeconds)
    ? settings.requestTimeoutSeconds
    : 240;
  const delayBetweenPromptsMs = Number.isInteger(request?.configuration?.delayBetweenPromptsMs)
    ? request.configuration.delayBetweenPromptsMs
    : 5000;
  const requestedConcurrentGenerations = Number.isInteger(
    request?.configuration?.maxConcurrentGenerations,
  )
    ? request.configuration.maxConcurrentGenerations
    : 1;
  const retryAttempts = Number.isInteger(request?.configuration?.retryAttempts)
    ? request.configuration.retryAttempts
    : 1;
  const maxReferenceImages = Number.isInteger(request?.configuration?.maxReferenceImages)
    ? request.configuration.maxReferenceImages
    : 10;
  const maxImagesPerPrompt = Number.isInteger(request?.configuration?.maxImagesPerPrompt)
    ? request.configuration.maxImagesPerPrompt
    : 1;
  if (requestedConcurrentGenerations < 1 || requestedConcurrentGenerations > 3) {
    return resultError("INVALID_CONFIGURATION", "maxConcurrentGenerations deve ficar entre 1 e 3.");
  }
  if (retryAttempts < 0 || retryAttempts > 2) {
    return resultError("INVALID_CONFIGURATION", "retryAttempts deve ficar entre 0 e 2.");
  }
  if (maxReferenceImages < 0 || maxReferenceImages > 10) {
    return resultError("INVALID_CONFIGURATION", "maxReferenceImages deve ficar entre 0 e 10.");
  }
  if (maxImagesPerPrompt < 1 || maxImagesPerPrompt > 4) {
    return resultError("INVALID_CONFIGURATION", "maxImagesPerPrompt deve ficar entre 1 e 4.");
  }
  const typingChunkSize = Number.isInteger(settings.typingChunkSize) ? settings.typingChunkSize : 4;
  const typingDelayMs = Number.isInteger(settings.typingDelayMs) ? settings.typingDelayMs : 35;
  if (typingChunkSize < 1 || typingChunkSize > 20) {
    return resultError("INVALID_CONFIGURATION", "typingChunkSize deve ficar entre 1 e 20.");
  }
  if (typingDelayMs < 0 || typingDelayMs > 200) {
    return resultError("INVALID_CONFIGURATION", "typingDelayMs deve ficar entre 0 e 200.");
  }

  const stepLogs = [];
  const diagnosticLogs = [];
  const step = (message) => {
    stepLogs.push(message);
    if (stepLogs.length > 240) stepLogs.shift();
    try {
      console.error(`[Google Flow] ${message}`);
    } catch {
      /* noop */
    }
  };
  const trace = (message) => {
    if (settings.diagnosticTrace !== true) return;
    diagnosticLogs.push(message);
    if (diagnosticLogs.length > 500) diagnosticLogs.shift();
  };

  let navigation;
  let chromeExecutables;
  let profileRuntime;
  let generationPreferences;
  let referencePaths;
  try {
    profileRuntime = resolveProfileRuntime(request);
    generationPreferences = resolveGenerationPreferences(request?.configuration ?? {});
    assertDedicatedProfilePath(profileRuntime.profilePath);
    navigation = resolveNavigationTarget(request);
    chromeExecutables = await resolveChromeExecutables(settings);
    referencePaths = await prepareReferenceImagePaths(
      referenceImages,
      services,
      maxReferenceImages,
    );
    step(`Chrome detectado: ${chromeExecutables[0] || "candidato automático"}.`);
    step(`Perfil de conta selecionado: ${profileRuntime.accountProfile}.`);
  } catch (cause) {
    return resultError(
      cause?.code ?? "INVALID_CONFIGURATION",
      cause?.message ?? String(cause),
      Boolean(cause?.retryable),
    );
  }

  let browserInfo;
  let client;
  let generationDefaults;
  let responseTracker;
  const files = [];
  const artifacts = [];
  try {
    browserInfo = await launchOrReuseChrome({
      executables: chromeExecutables,
      profilePath: profileRuntime.profilePath,
      port: profileRuntime.port,
      startMinimized,
      keepBrowserOpen,
      startUrl: navigation.url,
      signal: services.signal,
    });
    step(
      browserInfo.startedByPlugin
        ? "Chrome iniciado pelo plugin."
        : "Chrome existente reutilizado.",
    );

    client = await new CdpClient(browserInfo.version.webSocketDebuggerUrl, trace).connect(
      services.signal,
    );
    step(`CDP conectado em 127.0.0.1:${profileRuntime.port}.`);
    const page = await attachFlowPage(client, navigation.url, navigation.pinned, services.signal);
    const sessionId = page.sessionId;
    step("Página do Google Flow anexada ao CDP.");

    let activePreferences = { ...generationPreferences };
    generationDefaults = installGenerationPreferencesInterceptor(
      client,
      sessionId,
      () => activePreferences,
      step,
    );
    await generationDefaults.enable();
    step(
      activePreferences.imageModelName || activePreferences.imageAspectRatio
        ? `Preferências explícitas ativas: modelo=${activePreferences.imageModelName || "Flow"}; proporção=${activePreferences.imageAspectRatio || "Flow"}.`
        : "Modo Automático do Flow ativo: modelo e proporção não serão alterados pelo plugin.",
    );
    responseTracker = createBatchResponseTracker(client, sessionId, services.signal);

    if (!startMinimized) await setBrowserWindowState(client, page.targetId, "normal");
    const initialProjectState = await ensureFlowProjectReady(
      client,
      sessionId,
      settings,
      services.signal,
      false,
      trace,
    );
    step(`Projeto do Google Flow pronto: ${initialProjectState?.url || "URL não detectada"}.`);
    step("Editor Slate detectado.");
    await uploadReferenceImages(client, sessionId, referencePaths, settings, services.signal, step);

    const maxConcurrentGenerations = activePreferences.fallbackOnModelLimit
      ? 1
      : requestedConcurrentGenerations;
    const submit = async (task) => {
      if (services.signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const label = `Prompt ${task.index + 1}/${prompts.length} (tentativa ${task.attempt}/${retryAttempts + 1})`;
      return {
        completion: (async () => {
          let modelFallbackUsed = false;
          while (true) {
            step(`${label}: preparando interface.`);
            await ensureFlowProjectReady(client, sessionId, settings, services.signal, true, trace);
            const promptResult = await setPrompt(
              client,
              sessionId,
              task.prompt,
              settings.promptSelector || "",
              services.signal,
              { chunkSize: typingChunkSize, delayMs: typingDelayMs },
            );
            step(`${label}: Slate preenchido (${promptResult?.readbackLength || 0} caracteres).`);
            const generateState = await waitGenerateEnabled(
              client,
              sessionId,
              settings,
              services.signal,
              15000,
            );
            step(`${label}: botão habilitado (${generateState?.text || "Criar"}).`);

            const reservation = responseTracker.reserve(requestTimeoutSeconds * 1000);
            try {
              const clickResult = await clickGenerate(client, sessionId, settings);
              step(`${label}: envio confirmado (${clickResult?.text || "Criar"}).`);
            } catch (cause) {
              reservation.cancel(cause);
              await reservation.promise.catch(() => undefined);
              throw cause;
            }

            const captured = await reservation.promise;
            step(`${label}: resposta HTTP ${captured?.status ?? "?"} capturada.`);
            let generation;
            try {
              generation = parseGenerationResponse(captured);
            } catch (cause) {
              const canFallbackModel =
                cause?.code === "MODEL_LIMIT" &&
                activePreferences.fallbackOnModelLimit &&
                activePreferences.imageModelName === IMAGE_MODELS.nano_banana_pro &&
                !modelFallbackUsed;
              if (!canFallbackModel) throw cause;
              activePreferences = {
                ...activePreferences,
                modelKey: "nano_banana",
                imageModelName: IMAGE_MODELS.nano_banana,
              };
              modelFallbackUsed = true;
              step(
                `${label}: limite do Nano Banana Pro atingido; repetindo uma vez com Nano Banana na mesma conta.`,
              );
              await sleep(2_000, services.signal);
              continue;
            }

            const selectedMedia = generation.media.slice(0, maxImagesPerPrompt);
            if (generation.media.length > selectedMedia.length) {
              step(
                `${label}: ${generation.media.length} mídias recebidas; ${selectedMedia.length} preservada(s) conforme maxImagesPerPrompt.`,
              );
            }
            const results = [];
            for (let variantIndex = 0; variantIndex < selectedMedia.length; variantIndex += 1) {
              const result = await downloadGeneratedImage(
                selectedMedia[variantIndex],
                task.prompt,
                task.index + 1,
                variantIndex + 1,
                services,
              );
              results.push(result);
              step(`${label}: artifact salvo (${result.file.name}).`);
            }
            return results;
          }
        })(),
      };
    };

    step(
      `Gerenciador iniciado: ${prompts.length} prompt(s), até ${maxConcurrentGenerations} geração(ões) simultânea(s), ${retryAttempts} nova(s) tentativa(s) após a fila inicial.`,
    );
    const plan = await runGenerationPlan({
      prompts,
      maxInFlight: maxConcurrentGenerations,
      retryAttempts,
      submit,
      minDelayMs: delayBetweenPromptsMs,
      signal: services.signal,
      failFast: true,
      onState(event) {
        if (event.type === "submitted") {
          step(
            `Fila: prompt ${event.task.index + 1} enviado; ${event.active}/${maxConcurrentGenerations} em andamento; ${event.pending} aguardando nesta rodada.`,
          );
        } else if (event.type === "succeeded") {
          step(
            `Fila: prompt ${event.task.index + 1} concluído; ${event.active}/${maxConcurrentGenerations} em andamento.`,
          );
        } else if (event.type === "failed") {
          step(
            `Fila interrompida no prompt ${event.task.index + 1} (${event.error?.code || "JOB_FAILED"}: ${event.error?.message || "erro não detalhado"}).`,
          );
        } else if (event.type === "retry-round") {
          step(
            `Nova rodada de tentativas ${event.attempt}/${retryAttempts + 1}: ${event.tasks.length} prompt(s) com erro.`,
          );
        }
      },
    });

    for (const resultGroup of plan.results) {
      if (!Array.isArray(resultGroup) || resultGroup.length === 0)
        throw codedError(
          "OUTPUT_VALIDATION_FAILED",
          "A fila terminou sem resultado para um dos prompts.",
        );
      for (const result of resultGroup) {
        if (!result?.file || !result?.artifact)
          throw codedError("OUTPUT_VALIDATION_FAILED", "A fila terminou com um artifact inválido.");
        files.push(result.file);
        artifacts.push(result.artifact);
      }
    }

    if (settings.minimizeWhenReady !== false)
      await setBrowserWindowState(client, page.targetId, "minimized");
    responseTracker.close();
    responseTracker = null;
    await generationDefaults.disable();
    await maybeCloseBrowser(client, browserInfo, keepBrowserOpen);
    client = null;

    return {
      status: "success",
      values: { images: files },
      artifacts,
      usage: { provider: "Google Labs / Flow", outputUnits: files.length, unit: "image" },
      logs: [
        ...stepLogs,
        ...diagnosticLogs,
        `${files.length} imagem(ns) real(is) do Google Flow finalizada(s).`,
      ],
    };
  } catch (cause) {
    if (responseTracker) {
      try {
        responseTracker.close();
      } catch {
        /* noop */
      }
    }
    if (generationDefaults) {
      try {
        await generationDefaults.disable();
      } catch {
        /* noop */
      }
    }
    if (client) {
      try {
        await maybeCloseBrowser(client, browserInfo, keepBrowserOpen);
      } catch {
        /* noop */
      }
    }
    const recent = stepLogs.slice(-8).join(" | ");
    const suffix = recent ? ` Etapas: ${recent}` : "";

    if (cause?.code === "CANCELLED") {
      return resultError("CANCELLED", "Execução cancelada.", false);
    }

    return resultError(
      cause?.code ?? "UPSTREAM_UNAVAILABLE",
      `${cause?.message ?? "Falha na automação do Chrome."}${suffix}`,
      Boolean(cause?.retryable),
      cause?.retryAfterMs,
    );
  }
}
export const __test = {
  normalizePrompts,
  chunkTextForTyping,
  safeFilename,
  validateFlowUrl,
  resolveNavigationTarget,
  defaultProfilePath,
  defaultProfilesRootPath,
  normalizeAccountProfile,
  resolveProfileRuntime,
  resolveGenerationPreferences,
  normalizeReferenceImages,
  assertDedicatedProfilePath,
  extensionForMime,
  IMAGE_MODELS,
  ASPECT_RATIOS,
  applyGenerationPreferences,
  classifyGenerationHttpError,
  createAdaptiveConcurrencyController,
  runSubmissionRound,
  runGenerationPlan,
  shouldRetryGenerationError,
  pageStateExpression,
};
