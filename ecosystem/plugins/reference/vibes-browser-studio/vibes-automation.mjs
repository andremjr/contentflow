import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import {
  attachVibesBridge,
  BRIDGE_ID,
  PROTOCOL_VERSION,
  VIBES_ORIGIN,
} from "./browser-bridge-client.mjs";

const HOME_URL = `${VIBES_ORIGIN}/`;
const PROJECT_URL = /^https:\/\/vibes\.ai\/projects\/[A-Za-z0-9_-]+\/?$/;
const MEDIA_HOST = /(^|\.)fbcdn\.net$/i;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);
const VARIANT_COUNT = 4;
const IMAGE_TIMEOUT_MS = 300_000;
const VIDEO_TIMEOUT_MS = 600_000;
const MAX_MEDIA_BYTES = 60 * 1024 * 1024;
const DEFAULT_PORT = 9860;

const TEXT = {
  "pt-BR": {
    profileReady: "Perfil do Vibes validado com login e Browser Bridge.",
    profileMissing:
      "Prepare este perfil, conclua o login no Vibes e instale a Browser Bridge 0.4.0 ou superior.",
    submitted: "Pedido enviado ao Vibes; aguardando quatro variantes.",
    collecting: "Coletando variantes do mesmo lote no Vibes.",
    videoSubmitted: "Pedido de vídeo enviado ao Vibes; aguardando quatro variantes.",
    videoCollecting: "Coletando as quatro variantes de vídeo do mesmo lote no Vibes.",
    cancelled:
      "Execução cancelada. O processamento já enviado ao Vibes pode continuar externamente.",
  },
  en: {
    profileReady: "Vibes profile validated with sign-in and Browser Bridge.",
    profileMissing:
      "Prepare this profile, sign in to Vibes, and install Browser Bridge 0.4.0 or newer.",
    submitted: "Request sent to Vibes; waiting for four variants.",
    collecting: "Collecting variants from the same Vibes batch.",
    videoSubmitted: "Video request sent to Vibes; waiting for four variants.",
    videoCollecting: "Collecting four video variants from the same Vibes batch.",
    cancelled:
      "Execution cancelled. Processing already submitted to Vibes may continue externally.",
  },
  es: {
    profileReady: "Perfil de Vibes validado con sesión y Browser Bridge.",
    profileMissing:
      "Prepara este perfil, inicia sesión en Vibes e instala Browser Bridge 0.4.0 o posterior.",
    submitted: "Solicitud enviada a Vibes; esperando cuatro variantes.",
    collecting: "Recopilando variantes del mismo lote de Vibes.",
    videoSubmitted: "Solicitud de video enviada a Vibes; esperando cuatro variantes.",
    videoCollecting: "Recopilando cuatro variantes de video del mismo lote de Vibes.",
    cancelled:
      "Ejecución cancelada. El procesamiento ya enviado a Vibes puede continuar externamente.",
  },
};

function localeFor(request) {
  const locale = String(request?.context?.locale ?? "pt-BR").toLowerCase();
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("es")) return "es";
  return "pt-BR";
}

function message(request, key) {
  return TEXT[localeFor(request)][key];
}

function codedError(code, text, retryable = false, retryAfterMs) {
  const error = new Error(text);
  error.code = code;
  error.retryable = retryable;
  if (retryAfterMs) error.retryAfterMs = retryAfterMs;
  return error;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(codedError("CANCELLED", "Execução cancelada."));
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(codedError("CANCELLED", "Execução cancelada."));
    };
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeFileSegment(value) {
  return (
    String(value ?? "item")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .slice(0, 80) || "item"
  );
}

function elementRoleTerms(role) {
  if (role === "character") return ["character", "personagem", "personaje"];
  if (role === "scene") return ["scene", "cena", "escena"];
  if (role === "style") return ["style", "estilo"];
  throw codedError("INVALID_INPUT", "Papel de referência do Vibes inválido.");
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.partial`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function portFor(base, alias) {
  const offset = Number.parseInt(sha256(alias).slice(0, 4), 16) % 700;
  return Math.min(64000, Math.max(1024, Number(base) || DEFAULT_PORT) + offset);
}

async function fetchBrowserVersion(port, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const value = await response.json();
    return typeof value?.webSocketDebuggerUrl === "string" ? value : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function chromeCandidates(settings) {
  const configured = String(settings?.chromeExecutable ?? "").trim();
  if (configured) return [configured];
  if (platform() === "win32") {
    return [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    ].filter((path) => path && existsSync(path));
  }
  if (platform() === "darwin")
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(
    existsSync,
  );
}

async function launchChrome({ settings, profilePath, port, startMinimized, signal, url }) {
  const existing = await fetchBrowserVersion(port);
  if (existing) return { version: existing, child: undefined, startedByPlugin: false };
  const candidates = chromeCandidates(settings);
  if (!candidates.length)
    throw codedError("INVALID_CONFIGURATION", "Google Chrome não localizado.");
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    url,
  ];
  if (startMinimized) args.unshift("--start-minimized");
  const failures = [];
  for (const executable of candidates) {
    let child;
    try {
      child = spawn(executable, args, {
        detached: false,
        stdio: "ignore",
        windowsHide: false,
        shell: false,
      });
    } catch (error) {
      failures.push(String(error?.message ?? error));
      continue;
    }
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const version = await fetchBrowserVersion(port);
      if (version) return { version, child, startedByPlugin: true };
      await sleep(300, signal);
    }
    child.kill?.();
    failures.push(`${basename(executable)}: CDP não respondeu`);
  }
  throw codedError(
    "PERMISSION_DENIED",
    `Não foi possível iniciar o Chrome dedicado. ${failures.join(" | ")}`,
  );
}

async function waitForChildExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    child.once("exit", onExit);
  });
}

async function closeBrowserGracefully(client, child, port) {
  try {
    await client?.send("Browser.close");
  } catch {}
  const exited = await waitForChildExit(child);
  client?.close();
  if (!exited && child?.exitCode === null) {
    try {
      child.kill();
    } catch {}
  }
  if (Number.isInteger(port)) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await fetchBrowserVersion(port))) {
      await sleep(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

function isTransientBrowserAttachmentError(error) {
  return /Session with given id not found|No session with given id|Target session .*not found|Chrome desconectado/i.test(
    String(error?.message || error || ""),
  );
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect(signal) {
    this.ws = new WebSocket(this.url);
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
        () => reject(codedError("UPSTREAM_UNAVAILABLE", "Falha ao conectar ao Chrome.", true)),
        { once: true },
      );
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () =>
      this.rejectAll(codedError("UPSTREAM_UNAVAILABLE", "Chrome desconectado.", true)),
    );
    return this;
  }
  onMessage(event) {
    let value;
    try {
      value = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const pending = this.pending.get(value.id);
    if (!pending) return;
    this.pending.delete(value.id);
    if (value.error) pending.reject(codedError("UPSTREAM_UNAVAILABLE", value.error.message, true));
    else pending.resolve(value.result ?? {});
  }
  rejectAll(error) {
    for (const value of this.pending.values()) value.reject(error);
    this.pending.clear();
  }
  send(method, params = {}, sessionId) {
    if (this.ws?.readyState !== WebSocket.OPEN)
      return Promise.reject(codedError("UPSTREAM_UNAVAILABLE", "CDP não conectado.", true));
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function attachPage(client, targetUrl, signal) {
  let { targetInfos = [] } = await client.send("Target.getTargets");
  let target = targetInfos.find(
    (item) => item.type === "page" && String(item.url).startsWith(VIBES_ORIGIN),
  );
  if (!target) {
    const created = await client.send("Target.createTarget", { url: targetUrl });
    target = { targetId: created.targetId, url: targetUrl };
  }
  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  await client.send("Runtime.enable", {}, attached.sessionId);
  await client.send("Page.enable", {}, attached.sessionId);
  if (targetUrl && String(target.url) !== targetUrl) {
    await client.send("Page.navigate", { url: targetUrl }, attached.sessionId);
  }
  await waitFor(
    client,
    attached.sessionId,
    (state) => state.url.startsWith(VIBES_ORIGIN),
    30_000,
    signal,
  );
  return { targetId: target.targetId, sessionId: attached.sessionId };
}

function pageState() {
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden"
    );
  };
  const text = (element) =>
    [
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const controls = [
    ...document.querySelectorAll(
      "button,[role=button],[role=menuitem],[role=menuitemradio],[role=option]",
    ),
  ].filter(visible);
  const hasText = (patterns) =>
    controls.some((element) =>
      patterns.some((pattern) => text(element).toLowerCase().includes(pattern)),
    );
  const editor = [...document.querySelectorAll('[contenteditable="true"][role="textbox"]')].find(
    visible,
  );
  const composerMode = text(
    controls.find((element) => /^(image|imagem|video|vídeo|lip sync)$/i.test(text(element))),
  );
  const generate = [
    ...document.querySelectorAll('button[aria-label="Gerar"],button[aria-label="Generate"]'),
  ].find(visible);
  const legacyCardIdentities = [
    ...document.querySelectorAll(
      '[data-analytics-id="creation_gallery.thumbnail_click"][data-analytics-media-id]',
    ),
  ];
  const cardIdentities = legacyCardIdentities.length
    ? legacyCardIdentities
    : [
        ...document.querySelectorAll(
          'button[data-analytics-id="creation_gallery.media_favorite"][data-analytics-media-id]',
        ),
      ];
  const cards = cardIdentities.map((identityNode) => {
    let card = identityNode;
    for (let depth = 0; depth < 6 && card && !card.querySelector("img,video"); depth += 1) {
      card = card.parentElement;
    }
    const image = card?.querySelector("img");
    const video = card?.querySelector("video");
    const source = video?.querySelector("source");
    let url =
      video?.currentSrc || video?.src || source?.src || image?.currentSrc || image?.src || "";
    try {
      const parsed = new URL(url, location.href);
      if (parsed.pathname === "/_next/image") url = parsed.searchParams.get("url") || url;
      url = new URL(url, location.href).href;
    } catch {}
    const mediaId = identityNode.getAttribute("data-analytics-media-id") || "";
    const matched = /^(batch-.+)-content-(\d+)$/.exec(mediaId);
    return {
      mediaId,
      batchId: matched?.[1] || "",
      ordinal: matched ? Number(matched[2]) : -1,
      url,
      width: image?.naturalWidth || 0,
      height: image?.naturalHeight || 0,
      videoWidth: video?.videoWidth || 0,
      videoHeight: video?.videoHeight || 0,
      mediaKind: video ? "video" : "image",
      ready: video ? Boolean(video.readyState >= 1 && url) : Boolean(mediaId && url),
    };
  });
  const alerts = [...document.querySelectorAll('[role="alert"]')]
    .filter(visible)
    .map(text)
    .filter(Boolean)
    .slice(0, 8);
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  return {
    url: location.href,
    origin: location.origin,
    projectId: (/^\/projects\/([^/?#]+)/.exec(location.pathname) || [])[1] || "",
    homeReady: hasText(["criar novo", "create new"]),
    editorReady: Boolean(editor),
    editorLabel: editor?.getAttribute("aria-label") || "",
    composerMode,
    generateReady: Boolean(
      generate && !generate.disabled && generate.getAttribute("aria-disabled") !== "true",
    ),
    dialogReady: dialogs.length > 0,
    dialogTitles: dialogs
      .map((dialog) => text(dialog.querySelector("h1,h2,h3,[role=heading]")))
      .filter(Boolean)
      .slice(0, 4),
    fileInputReady: Boolean(document.querySelector('input[type="file"]')),
    cards,
    alerts,
    intervention:
      /captcha|verify|verifique|verificación|log in|sign in|entrar|iniciar sesión/i.test(
        document.body?.innerText || "",
      ),
  };
}

async function evaluate(client, sessionId, fn, argument) {
  const expression = `(${fn.toString()})(${JSON.stringify(argument)})`;
  const result = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (result?.exceptionDetails)
    throw codedError(
      "DOM_INCOMPATIBLE",
      "A interface do Vibes não corresponde ao adapter validado.",
    );
  return result?.result?.value;
}

async function inspectPage(client, sessionId) {
  return evaluate(client, sessionId, pageState);
}

async function waitFor(client, sessionId, predicate, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    latest = await inspectPage(client, sessionId);
    if (predicate(latest)) return latest;
    await sleep(250, signal);
  }
  throw codedError("DOM_INCOMPATIBLE", "O Vibes não confirmou a mudança de estado esperada.");
}

function clickNamedControl(patterns) {
  const visible = (element) => {
    const rect = element?.getBoundingClientRect?.();
    return rect && rect.width > 8 && rect.height > 8;
  };
  const content = (element) =>
    [
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const wanted = patterns.map((value) => String(value).toLowerCase());
  const target = [
    ...document.querySelectorAll(
      "button,[role=button],[role=menuitem],[role=menuitemradio],[role=option]",
    ),
  ]
    .filter(
      (element) =>
        visible(element) &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true" &&
        wanted.some((value) => content(element).includes(value)),
    )
    .sort((left, right) => content(left).length - content(right).length)[0];
  if (!target) return null;
  target.scrollIntoView({ block: "center" });
  const rect = target.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function directClick(client, sessionId, patterns) {
  const point = await evaluate(client, sessionId, clickNamedControl, patterns);
  if (!point) throw codedError("DOM_INCOMPATIBLE", "Controle esperado do Vibes não encontrado.");
  for (const [type, buttons] of [
    ["mouseMoved", 0],
    ["mousePressed", 1],
    ["mouseReleased", 0],
  ]) {
    await client.send(
      "Input.dispatchMouseEvent",
      {
        type,
        x: point.x,
        y: point.y,
        button: "left",
        buttons,
        clickCount: type === "mouseMoved" ? 0 : 1,
      },
      sessionId,
    );
  }
}

async function bridgeInstalled(client, signal) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await client.send("Target.getTargets");
    for (const target of targetInfos.filter(
      (item) =>
        item.type === "service_worker" &&
        /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(item.url)),
    )) {
      const attached = await client.send("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      });
      try {
        const identity = await evaluate(
          client,
          attached.sessionId,
          () => globalThis.contentFlowBridge?.identity,
        );
        if (
          identity?.bridgeId === BRIDGE_ID &&
          identity?.protocolVersion === PROTOCOL_VERSION &&
          /^0\.(?:[4-9]|[1-9][0-9])\.|^[1-9][0-9]*\./.test(String(identity.extensionVersion || ""))
        )
          return true;
      } finally {
        await client
          .send("Target.detachFromTarget", { sessionId: attached.sessionId })
          .catch(() => undefined);
      }
    }
    await sleep(300, signal);
  }
  return false;
}

function classifyAlerts(alerts) {
  const text = (alerts || []).join(" ").toLowerCase();
  if (!text) return undefined;
  if (/rate limit|muitas solicita|demasiadas solicitudes|try again later/.test(text))
    return { pending: true, code: "RATE_LIMIT", retryAfterMs: 30_000 };
  if (/captcha|verify|verifique|verificación|login|log in|sign in/.test(text))
    return { pending: true, code: "AUTHENTICATION_FAILED", retryAfterMs: 15_000 };
  if (/quota|cota|limit reached|limite atingido|límite alcanzado/.test(text))
    return { pending: true, code: "QUOTA_EXCEEDED", retryAfterMs: 60_000 };
  if (/upgrade|assinar|subscribe|suscrib/.test(text))
    return { pending: true, code: "UPGRADE_REQUIRED", retryAfterMs: 60_000 };
  if (/blocked|bloquead/.test(text))
    return { pending: true, code: "ACCOUNT_BLOCKED", retryAfterMs: 60_000 };
  if (/refused|recus|rechaz|not allowed|não permitido|no permitido/.test(text))
    return { code: "CONTENT_REFUSED", retryable: false };
  return {
    pending: true,
    code: "UPSTREAM_UNAVAILABLE",
    retryable: true,
    retryAfterMs: 5_000,
  };
}

function validateMediaUrl(value, kind = "image") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `O Vibes devolveu uma URL de ${kind === "video" ? "vídeo" : "imagem"} inválida.`,
    );
  }
  if (url.protocol !== "https:" || url.username || url.password || !MEDIA_HOST.test(url.hostname)) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `A ${kind === "video" ? "mídia de vídeo" : "imagem"} do Vibes saiu de uma origem não autorizada.`,
    );
  }
  return url.href;
}

function batchTimestamp(batchId) {
  const matched = /^batch-([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-/i.exec(String(batchId || ""));
  if (!matched) return undefined;
  const value = Number.parseInt(`${matched[1]}${matched[2]}`, 16);
  return Number.isSafeInteger(value) ? value : undefined;
}

function reconcileCards(beforeIds, cards, submittedAt) {
  const before = new Set(beforeIds || []);
  const seenMedia = new Set();
  const fresh = [];
  const submittedAtMs = Date.parse(submittedAt || "");
  for (const card of cards || []) {
    if (!card?.mediaId || before.has(card.mediaId) || seenMedia.has(card.mediaId)) continue;
    const createdAt = batchTimestamp(card.batchId);
    if (
      Number.isFinite(submittedAtMs) &&
      Number.isFinite(createdAt) &&
      createdAt < submittedAtMs - 5_000
    )
      continue;
    seenMedia.add(card.mediaId);
    fresh.push(card);
  }
  const batches = [...new Set(fresh.map((card) => card.batchId).filter(Boolean))];
  if (batches.length > 1)
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Mais de um lote novo apareceu no projeto; a associação é ambígua.",
    );
  let batchId = batches[0] || "";
  let batchCards = fresh.filter((card) => card.batchId && (!batchId || card.batchId === batchId));
  if (!batchId) {
    const unbatched = fresh.filter((card) => !card.batchId && card.ready);
    if (unbatched.length === VARIANT_COUNT) {
      batchId = `unbatched-${sha256(unbatched.map((card) => card.mediaId).join(":"))}`;
      batchCards = unbatched.map((card, index) => ({
        ...card,
        batchId,
        ordinal: index + 1,
      }));
    }
  }
  const zeroBased = batchCards.some((card) => card.ordinal === 0);
  const ready = batchCards
    .filter((card) => card.ready)
    .map((card) => ({ ...card, ordinal: zeroBased ? card.ordinal + 1 : card.ordinal }))
    .sort((left, right) => left.ordinal - right.ordinal);
  const ordinals = new Set();
  for (const card of ready) {
    if (card.ordinal < 1 || card.ordinal > VARIANT_COUNT || ordinals.has(card.ordinal))
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O lote do Vibes contém variantes duplicadas ou sem identidade válida.",
      );
    ordinals.add(card.ordinal);
  }
  return { batchId, ready };
}

async function remoteMetadata(value, signal, kind = "image") {
  let url = validateMediaUrl(value, kind);
  let response;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      credentials: "omit",
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirect === 5)
      throw codedError("OUTPUT_VALIDATION_FAILED", "A imagem do Vibes excedeu cinco redirects.");
    const location = response.headers.get("location");
    if (!location) throw codedError("OUTPUT_VALIDATION_FAILED", "Redirect de mídia sem destino.");
    url = validateMediaUrl(new URL(location, url).href, kind);
  }
  if (!response)
    throw codedError("UPSTREAM_UNAVAILABLE", "Falha ao validar imagem do Vibes.", true);
  if (!response.ok)
    throw codedError(
      "UPSTREAM_UNAVAILABLE",
      `Falha ao validar imagem do Vibes (${response.status}).`,
      true,
    );
  const mimeType = String(response.headers.get("content-type") || "")
    .split(";")[0]
    .toLowerCase();
  const allowedMimes = kind === "video" ? VIDEO_MIMES : IMAGE_MIMES;
  if (!allowedMimes.has(mimeType))
    throw codedError("OUTPUT_VALIDATION_FAILED", "O Vibes devolveu mídia com MIME inesperado.");
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && (size <= 0 || size > MAX_MEDIA_BYTES))
    throw codedError("OUTPUT_VALIDATION_FAILED", "A imagem do Vibes excede o limite de 60 MiB.");
  return { url, mimeType, size: Number.isFinite(size) && size > 0 ? size : undefined };
}

function extensionFor(mimeType) {
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function jobKey(request, profileAlias) {
  return sha256(
    [
      request.executionId,
      request.blockId,
      request.capabilityId,
      request.attempt,
      request.batch?.itemId || "single",
      request.invocation?.mode || "start",
      profileAlias,
    ].join(":"),
  );
}

export function createVibesAutomation(request, services) {
  const settings = request?.settings ?? {};
  const signal = services?.signal;
  const workspace = (relative) => services.getWorkspacePath(relative);
  const receiptPath = (jobId) => workspace(`receipts/${jobId}.json`);
  const profilePath = (alias) => workspace(`profiles/${alias}`);
  const markerPath = (alias) => workspace(`profiles/${alias}/.vibes-profile-ready.json`);
  let activeReceipt;

  async function withBrowser(alias, startMinimized, initialUrl, operation) {
    const profile = profilePath(alias);
    await mkdir(profile, { recursive: true });
    let launched;
    let client;
    let page;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      launched = await launchChrome({
        settings,
        profilePath: profile,
        port: portFor(settings.remoteDebuggingPort, alias),
        startMinimized,
        signal,
        url: initialUrl,
      });
      try {
        client = await new CdpClient(launched.version.webSocketDebuggerUrl).connect(signal);
        page = await attachPage(client, initialUrl, signal);
        break;
      } catch (error) {
        if (launched.startedByPlugin)
          await closeBrowserGracefully(
            client,
            launched.child,
            portFor(settings.remoteDebuggingPort, alias),
          );
        else client?.close();
        client = undefined;
        page = undefined;
        if (attempt > 0 || !isTransientBrowserAttachmentError(error)) throw error;
        await sleep(1500, signal);
      }
    }
    if (!client || !page || !launched) {
      throw codedError("UPSTREAM_UNAVAILABLE", "Não foi possível anexar a aba do Vibes.", true);
    }
    let bridge;
    try {
      return await operation({
        client,
        page,
        attachBridge: async (projectUrl) => {
          bridge = await attachVibesBridge({
            client,
            pageSessionId: page.sessionId,
            pageTargetId: page.targetId,
            expectedUrl: projectUrl,
            profileId: alias,
            request,
            signal,
          });
          return bridge;
        },
      });
    } finally {
      await bridge?.dispose?.().catch(() => undefined);
      if (launched.startedByPlugin && settings.keepBrowserOpen !== true) {
        await closeBrowserGracefully(
          client,
          launched.child,
          portFor(settings.remoteDebuggingPort, alias),
        );
      } else client.close();
    }
  }

  async function ensureProject(client, page, mode, existingUrl) {
    if (existingUrl) {
      await client.send("Page.navigate", { url: existingUrl }, page.sessionId);
      const existing = await waitFor(
        client,
        page.sessionId,
        (state) => state.intervention || (PROJECT_URL.test(state.url) && state.editorReady),
        45_000,
        signal,
      );
      if (existing.intervention && !existing.editorReady)
        throw codedError(
          "AUTHENTICATION_FAILED",
          "Conclua o login ou a verificação no perfil dedicado do Vibes.",
        );
      return existing.url.replace(/\/$/, "");
    }
    if (mode === "existing")
      throw codedError("INVALID_CONFIGURATION", "O modo Projeto existente exige uma URL válida.");
    await client.send("Page.navigate", { url: HOME_URL }, page.sessionId);
    const home = await waitFor(
      client,
      page.sessionId,
      (state) => state.homeReady || state.intervention,
      Number(settings.interactiveWaitSeconds || 600) * 1000,
      signal,
    );
    if (home.intervention && !home.homeReady)
      throw codedError(
        "AUTHENTICATION_FAILED",
        "Conclua o login ou a verificação no perfil dedicado do Vibes.",
      );
    await directClick(client, page.sessionId, ["criar novo", "create new"]);
    const created = await waitFor(
      client,
      page.sessionId,
      (state) => state.intervention || (PROJECT_URL.test(state.url) && state.editorReady),
      45_000,
      signal,
    );
    if (created.intervention && !created.editorReady)
      throw codedError(
        "AUTHENTICATION_FAILED",
        "Conclua o login ou a verificação no perfil dedicado do Vibes.",
      );
    return created.url.replace(/\/$/, "");
  }

  async function click(bridge, selectors, terms, key) {
    try {
      const result = await bridge.dispatch("click", { selectors, textIncludes: terms }, key);
      if (activeReceipt) {
        activeReceipt.lastControlAction = {
          occurredAt: new Date().toISOString(),
          key,
          text: String(result?.text || "").slice(0, 120),
          mechanism: String(result?.mechanism || "").slice(0, 32),
        };
        await atomicJson(receiptPath(activeReceipt.logicalKey), activeReceipt);
      }
      return result;
    } catch (error) {
      if (activeReceipt) {
        activeReceipt.lastControlError = {
          occurredAt: new Date().toISOString(),
          key,
          code: error?.code || "UPSTREAM_UNAVAILABLE",
          message: String(error?.message || "Controle do Vibes indisponível.").slice(0, 240),
        };
        await atomicJson(receiptPath(activeReceipt.logicalKey), activeReceipt);
      }
      throw error;
    }
  }

  async function clickWhenAvailable(bridge, selectors, terms, key, timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    for (let attempt = 0; Date.now() < deadline; attempt += 1) {
      try {
        return await click(bridge, selectors, terms, `${key}:${attempt}`);
      } catch (error) {
        lastError = error;
        await sleep(250, signal);
      }
    }
    throw lastError || codedError("DOM_INCOMPATIBLE", "Controle esperado do Vibes indisponível.");
  }

  async function waitForUploadedImage(client, sessionId, name, timeoutMs = 20_000) {
    const suffix = stagedNameSuffix(name);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await evaluate(
        client,
        sessionId,
        ({ expectedName, expectedSuffix }) => {
          const visible = (element) => {
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              rect.width > 8 &&
              rect.height > 8 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          };
          const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
          const uploadDialogOpen = dialogs.some((dialog) =>
            [...dialog.querySelectorAll("h1,h2,h3,[role=heading]")].some(
              (heading) =>
                visible(heading) &&
                /upload images|carregar imagens|subir im[aá]genes/i.test(heading.textContent || ""),
            ),
          );
          return (
            !uploadDialogOpen &&
            [...document.querySelectorAll("img[alt]")].some((image) => {
              const alt = image.getAttribute("alt") || "";
              return (
                visible(image) &&
                (alt === expectedName || (expectedSuffix && alt.endsWith(expectedSuffix)))
              );
            })
          );
        },
        { expectedName: name, expectedSuffix: suffix },
      );
      if (found) return;
      await sleep(250, signal);
    }
    throw codedError(
      "DOM_INCOMPATIBLE",
      "O Vibes não confirmou a miniatura da referência enviada.",
    );
  }

  async function waitForUploadCompletion(client, sessionId, name) {
    await waitForUploadedImage(client, sessionId, name);
  }

  function stagedNameSuffix(name) {
    return (
      (/-(character|scene|style|initial|final)-\d+\.(?:png|webp|jpe?g)$/i.exec(name) || [])[0] || ""
    );
  }

  function uploadedImageSelectors(name) {
    const suffix = stagedNameSuffix(name);
    return [
      `[role="dialog"] img[alt="${name}"]`,
      `img[alt="${name}"]`,
      ...(suffix ? [`[role="dialog"] img[alt$="${suffix}"]`, `img[alt$="${suffix}"]`] : []),
    ];
  }

  async function prepareImageComposer(client, page, bridge, prompt, references, jobId) {
    let state = await inspectPage(client, page.sessionId);
    if (!/imagem|image/i.test(state.composerMode || state.editorLabel)) {
      await click(
        bridge,
        ["button", "[role=button]"],
        ["image", "imagem", "video", "vídeo"],
        `${jobId}:mode-menu`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "[role=menuitemradio]", "[role=option]"],
        ["image", "imagem"],
        `${jobId}:mode-image`,
      );
      state = await waitFor(
        client,
        page.sessionId,
        (value) => /imagem|image/i.test(value.composerMode || value.editorLabel),
        12_000,
        signal,
      );
    }
    for (let index = 0; index < 6; index += 1) {
      const removed = await bridge
        .dispatch(
          "click",
          {
            selectors: ["button[aria-label]", "[role=button][aria-label]"],
            textIncludes: [
              "remove character",
              "remover personagem",
              "remove scene",
              "remover cena",
              "remove style",
              "remover estilo",
              "remove ingredient",
              "remover componente",
            ],
          },
          `${jobId}:clear:${index}`,
        )
        .then(() => true)
        .catch(() => false);
      if (!removed) break;
    }
    await bridge.dispatch(
      "setText",
      { selectors: ['[contenteditable="true"][role="textbox"]'], text: prompt },
      `${jobId}:prompt`,
    );
    const staged = [];
    try {
      for (let index = 0; index < references.length; index += 1) {
        const reference = references[index];
        const ext =
          reference.file.mimeType === "image/png"
            ? "png"
            : reference.file.mimeType === "image/webp"
              ? "webp"
              : "jpg";
        const name = `vibes-${jobId.slice(0, 10)}-${reference.role}-${index}.${ext}`;
        const target = workspace(`reference-staging/${name}`);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(reference.path, target);
        if ((await stat(target)).size !== reference.file.size)
          throw codedError("INVALID_INPUT", "A referência mudou durante a preparação.");
        staged.push({ ...reference, path: target, name });
      }
      const groups = new Map();
      for (const entry of staged) {
        if (!groups.has(entry.role)) groups.set(entry.role, []);
        groups.get(entry.role).push(entry);
      }
      for (const [role, entries] of groups) {
        await clickWhenAvailable(
          bridge,
          ["button", "[role=button]"],
          ["ingredients", "ingredientes", "componentes"],
          `${jobId}:${role}:ingredients`,
        );
        const roleTerms =
          role === "character"
            ? ["character", "personagem"]
            : role === "scene"
              ? ["scene", "cena"]
              : ["style", "estilo"];
        await click(
          bridge,
          ["[role=menuitem]", "button", "[role=button]"],
          roleTerms,
          `${jobId}:${role}:role`,
        );
        await waitFor(client, page.sessionId, (value) => value.dialogReady, 10_000, signal);
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          await click(
            bridge,
            ["[role=dialog] button"],
            ["upload", "carregar"],
            `${jobId}:${role}:upload-open:${index}`,
          );
          await waitFor(client, page.sessionId, (value) => value.fileInputReady, 8_000, signal);
          await bridge.setFiles(
            [entry.path],
            ['input[type="file"]'],
            `${jobId}:${role}:file:${index}`,
          );
          await clickWhenAvailable(
            bridge,
            [
              '[role="dialog"]:has(input[type="file"]):not(:has([role="dialog"] input[type="file"])) button',
            ],
            ["upload", "carregar", "subir"],
            `${jobId}:${role}:upload-confirm:${index}`,
          );
          await waitForUploadCompletion(client, page.sessionId, entry.name);
          await bridge.dispatch(
            "click",
            { selectors: uploadedImageSelectors(entry.name) },
            `${jobId}:${role}:thumb:${index}`,
          );
        }
        await clickWhenAvailable(
          bridge,
          ["[role=dialog] button"],
          [
            "add to prompt",
            "adicionar ao comando",
            "agregar al comando",
            "adicionar à imagem",
            "add to image",
            "styles to prompt",
            "styles to image",
            "estilos ao comando",
            "estilos à imagem",
            "estilos al comando",
          ],
          `${jobId}:${role}:attach`,
        );
        await waitFor(client, page.sessionId, (value) => !value.dialogReady, 12_000, signal);
      }
    } finally {
      await Promise.all(
        staged.map((entry) => rm(entry.path, { force: true }).catch(() => undefined)),
      );
    }
    state = await waitFor(client, page.sessionId, (value) => value.generateReady, 15_000, signal);
    return state;
  }

  async function stageReference(reference, jobId, index) {
    const ext =
      reference.file.mimeType === "image/png"
        ? "png"
        : reference.file.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const name = `vibes-${jobId.slice(0, 10)}-${reference.role}-${index}.${ext}`;
    const target = workspace(`reference-staging/${name}`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(reference.path, target);
    if ((await stat(target)).size !== reference.file.size)
      throw codedError("INVALID_INPUT", "A referência mudou durante a preparação.");
    return { ...reference, path: target, name };
  }

  async function uploadFrame(client, page, bridge, entry, jobId) {
    const terms =
      entry.role === "initial"
        ? [
            "add start frame",
            "adicionar quadro inicial",
            "agregar fotograma inicial",
            "start frame",
            "quadro inicial",
            "fotograma inicial",
          ]
        : [
            "add end frame",
            "adicionar quadro final",
            "agregar fotograma final",
            "end frame",
            "quadro final",
            "fotograma final",
          ];
    await click(
      bridge,
      ["button", "[role=button]", "[role=menuitem]"],
      terms,
      `${jobId}:${entry.role}:open`,
    );
    await clickWhenAvailable(
      bridge,
      ["button", "[role=button]"],
      [
        "add from project",
        "adicionar do projeto",
        "adicionar a partir do projeto",
        "agregar desde el proyecto",
      ],
      `${jobId}:${entry.role}:project-picker`,
      10_000,
    );
    await waitFor(
      client,
      page.sessionId,
      (value) => value.dialogReady || value.fileInputReady,
      10_000,
      signal,
    );
    if (!(await inspectPage(client, page.sessionId)).fileInputReady) {
      await click(
        bridge,
        ["[role=dialog] button"],
        ["upload", "carregar", "subir"],
        `${jobId}:${entry.role}:upload-open`,
      );
      await waitFor(client, page.sessionId, (value) => value.fileInputReady, 8_000, signal);
    }
    await bridge.setFiles(
      [entry.path],
      ['[role="dialog"] input[type="file"]', 'input[type="file"]'],
      `${jobId}:${entry.role}:file`,
    );
    await clickWhenAvailable(
      bridge,
      [
        '[role="dialog"]:has(input[type="file"]):not(:has([role="dialog"] input[type="file"])) button',
      ],
      ["upload", "carregar", "subir"],
      `${jobId}:${entry.role}:confirm`,
    );
    await waitForUploadCompletion(client, page.sessionId, entry.name);
    await bridge
      .dispatch(
        "click",
        { selectors: uploadedImageSelectors(entry.name) },
        `${jobId}:${entry.role}:thumb`,
      )
      .catch(() => undefined);
    await clickWhenAvailable(
      bridge,
      ["[role=dialog] button"],
      [
        "add to prompt",
        "add frame",
        "add to video",
        "adicionar ao comando",
        "adicionar ao vídeo",
        "adicionar quadro",
        "agregar al comando",
        "agregar al vídeo",
        "usar quadro",
      ],
      `${jobId}:${entry.role}:attach`,
    );
    await waitFor(client, page.sessionId, (value) => !value.dialogReady, 12_000, signal).catch(
      () => undefined,
    );
  }

  async function attachVideoStyles(client, page, bridge, styles, jobId) {
    if (!styles.length) return;
    await clickWhenAvailable(
      bridge,
      ["button", "[role=button]"],
      ["ingredients", "ingredientes", "componentes"],
      `${jobId}:style:ingredients`,
    );
    await click(
      bridge,
      ["[role=menuitem]", "button", "[role=button]"],
      ["style", "estilo"],
      `${jobId}:style:role`,
    );
    await waitFor(client, page.sessionId, (value) => value.dialogReady, 10_000, signal);
    for (let index = 0; index < styles.length; index += 1) {
      const entry = styles[index];
      await clickWhenAvailable(
        bridge,
        ["[role=dialog] button"],
        ["upload", "carregar", "subir"],
        `${jobId}:style:upload-open:${index}`,
      );
      await waitFor(client, page.sessionId, (value) => value.fileInputReady, 8_000, signal);
      await bridge.setFiles(
        [entry.path],
        ['[role="dialog"] input[type="file"]', 'input[type="file"]'],
        `${jobId}:style:file:${index}`,
      );
      await clickWhenAvailable(
        bridge,
        [
          '[role="dialog"]:has(input[type="file"]):not(:has([role="dialog"] input[type="file"])) button',
        ],
        ["upload", "carregar", "subir"],
        `${jobId}:style:upload-confirm:${index}`,
      );
      await waitForUploadCompletion(client, page.sessionId, entry.name);
      await bridge.dispatch(
        "click",
        { selectors: uploadedImageSelectors(entry.name) },
        `${jobId}:style:thumb:${index}`,
      );
    }
    await clickWhenAvailable(
      bridge,
      ["[role=dialog] button"],
      [
        "add to prompt",
        "adicionar ao comando",
        "agregar al comando",
        "styles to prompt",
        "styles to video",
        "estilos ao comando",
        "estilos ao vídeo",
        "estilos al comando",
        "use styles",
      ],
      `${jobId}:style:attach`,
    );
    await waitFor(client, page.sessionId, (value) => !value.dialogReady, 12_000, signal);
  }

  async function attachVideoElements(client, page, bridge, references, jobId) {
    if (!references.length) return;
    for (let index = 0; index < 6; index += 1) {
      const removed = await bridge
        .dispatch(
          "click",
          {
            selectors: ["button[aria-label]", "[role=button][aria-label]"],
            textIncludes: [
              "remove character",
              "remover personagem",
              "remove scene",
              "remover cena",
              "remove style",
              "remover estilo",
              "remove ingredient",
              "remover componente",
            ],
          },
          `${jobId}:elements:clear:${index}`,
        )
        .then(() => true)
        .catch(() => false);
      if (!removed) break;
    }
    const groups = new Map();
    for (const entry of references) {
      if (!groups.has(entry.role)) groups.set(entry.role, []);
      groups.get(entry.role).push(entry);
    }
    for (const [role, entries] of groups) {
      await click(
        bridge,
        ["button", "[role=button]"],
        ["ingredients", "ingredientes", "components", "componentes"],
        `${jobId}:${role}:ingredients`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "button", "[role=button]"],
        elementRoleTerms(role),
        `${jobId}:${role}:role`,
      );
      await waitFor(client, page.sessionId, (value) => value.dialogReady, 10_000, signal);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        await click(
          bridge,
          ["[role=dialog] button"],
          ["upload", "carregar", "subir"],
          `${jobId}:${role}:upload-open:${index}`,
        );
        await waitFor(client, page.sessionId, (value) => value.fileInputReady, 8_000, signal);
        await bridge.setFiles(
          [entry.path],
          ['[role="dialog"] input[type="file"]', 'input[type="file"]'],
          `${jobId}:${role}:file:${index}`,
        );
        await clickWhenAvailable(
          bridge,
          [
            '[role="dialog"]:has(input[type="file"]):not(:has([role="dialog"] input[type="file"])) button',
          ],
          ["upload", "carregar", "subir"],
          `${jobId}:${role}:upload-confirm:${index}`,
        );
        await waitForUploadCompletion(client, page.sessionId, entry.name);
        await bridge.dispatch(
          "click",
          { selectors: uploadedImageSelectors(entry.name) },
          `${jobId}:${role}:thumb:${index}`,
        );
      }
      await clickWhenAvailable(
        bridge,
        ["[role=dialog] button"],
        [
          "add to prompt",
          "adicionar ao comando",
          "agregar al comando",
          "styles to prompt",
          "styles to video",
          "estilos ao comando",
          "estilos ao vídeo",
          "estilos al comando",
          "use elements",
        ],
        `${jobId}:${role}:attach`,
      );
      await waitFor(client, page.sessionId, (value) => !value.dialogReady, 12_000, signal);
    }
  }

  async function prepareElementsVideoComposer(
    client,
    page,
    bridge,
    prompt,
    references,
    resolution,
    jobId,
  ) {
    let state = await inspectPage(client, page.sessionId);
    if (!/video|vídeo/i.test(state.composerMode || state.editorLabel)) {
      await click(
        bridge,
        ["button", "[role=button]"],
        ["image", "imagem", "video", "vídeo"],
        `${jobId}:mode-menu`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "[role=menuitemradio]", "[role=option]"],
        ["video", "vídeo"],
        `${jobId}:mode-video`,
      );
      state = await waitFor(
        client,
        page.sessionId,
        (value) => /video|vídeo/i.test(value.composerMode || value.editorLabel),
        12_000,
        signal,
      );
    }
    await bridge.dispatch(
      "setText",
      { selectors: ['[contenteditable="true"][role="textbox"]'], text: prompt },
      `${jobId}:prompt`,
    );
    await click(
      bridge,
      ["button", "[role=button]"],
      ["ingredients", "ingredientes", "components", "componentes", "elements", "elementos"],
      `${jobId}:elements-mode`,
    );
    const staged = [];
    try {
      for (let index = 0; index < references.length; index += 1) {
        staged.push(await stageReference(references[index], jobId, index));
      }
      await attachVideoElements(client, page, bridge, staged, jobId);
      await click(
        bridge,
        ["button", "[role=button]"],
        [
          "advanced",
          "advanced settings",
          "avançado",
          "avançada",
          "configurações avançadas",
          "avanzado",
          "avanzada",
        ],
        `${jobId}:advanced`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "[role=menuitemradio]", "[role=option]", "button", "[role=button]"],
        [resolution],
        `${jobId}:resolution:${resolution}`,
      );
    } finally {
      await Promise.all(
        staged.map((entry) => rm(entry.path, { force: true }).catch(() => undefined)),
      );
    }
    return waitFor(client, page.sessionId, (value) => value.generateReady, 15_000, signal);
  }

  async function prepareFrameVideoComposer(
    client,
    page,
    bridge,
    prompt,
    frames,
    references,
    resolution,
    jobId,
  ) {
    let state = await inspectPage(client, page.sessionId);
    if (!/video|vídeo/i.test(state.composerMode || state.editorLabel)) {
      await click(
        bridge,
        ["button", "[role=button]"],
        ["image", "imagem", "video", "vídeo"],
        `${jobId}:mode-menu`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "[role=menuitemradio]", "[role=option]"],
        ["video", "vídeo"],
        `${jobId}:mode-video`,
      );
      state = await waitFor(
        client,
        page.sessionId,
        (value) => /video|vídeo/i.test(value.composerMode || value.editorLabel),
        12_000,
        signal,
      );
    }
    await bridge.dispatch(
      "setText",
      { selectors: ['[contenteditable="true"][role="textbox"]'], text: prompt },
      `${jobId}:prompt`,
    );
    await click(
      bridge,
      ["button", "[role=button]"],
      ["start, end frame", "start and end frame", "quadro inicial", "fotograma inicial", "frames"],
      `${jobId}:frames-mode`,
    );
    const staged = [];
    try {
      for (let index = 0; index < [...frames, ...references].length; index += 1) {
        staged.push(await stageReference([...frames, ...references][index], jobId, index));
      }
      for (const frame of staged.filter((entry) => ["initial", "final"].includes(entry.role))) {
        await uploadFrame(client, page, bridge, frame, jobId);
      }
      await attachVideoStyles(
        client,
        page,
        bridge,
        staged.filter((entry) => entry.role === "style"),
        jobId,
      );
      await click(
        bridge,
        ["button", "[role=button]"],
        [
          "advanced",
          "advanced settings",
          "avançado",
          "avançada",
          "configurações avançadas",
          "avanzado",
          "avanzada",
        ],
        `${jobId}:advanced`,
      );
      await click(
        bridge,
        ["[role=menuitem]", "[role=menuitemradio]", "[role=option]", "button", "[role=button]"],
        [resolution],
        `${jobId}:resolution:${resolution}`,
      );
    } finally {
      await Promise.all(
        staged.map((entry) => rm(entry.path, { force: true }).catch(() => undefined)),
      );
    }
    return waitFor(client, page.sessionId, (value) => value.generateReady, 15_000, signal);
  }

  async function buildMedia(jobId, cards, projectUrl, kind = "image", inputPort = "prompts") {
    const files = [],
      artifacts = [],
      updates = [];
    for (const card of cards.sort((a, b) => a.ordinal - b.ordinal).slice(0, VARIANT_COUNT)) {
      if (
        (kind === "image" && !card.ready) ||
        !card.mediaId ||
        !card.batchId ||
        card.ordinal < 1 ||
        card.ordinal > VARIANT_COUNT
      )
        continue;
      if (
        card.width > 0 &&
        card.height > 0 &&
        (card.width / card.height < 0.5 || card.width / card.height > 0.62)
      ) {
        throw codedError(
          "OUTPUT_VALIDATION_FAILED",
          "Uma variante do Vibes não possui a proporção 9:16 esperada.",
        );
      }
      const metadata = await remoteMetadata(card.url, signal, kind);
      const id = `vibes-${jobId.slice(0, 16)}-${safeFileSegment(card.mediaId)}`;
      const name = `vibes-${kind}-${jobId.slice(0, 10)}-${card.ordinal}.${extensionFor(metadata.mimeType)}`;
      const file = {
        id,
        name,
        mimeType: metadata.mimeType,
        ...(metadata.size ? { size: metadata.size } : {}),
        url: `artifact://${id}`,
      };
      const artifact = {
        id,
        name,
        mimeType: metadata.mimeType,
        ...(metadata.size ? { size: metadata.size } : {}),
        source: { kind: "url", url: metadata.url },
      };
      files.push(file);
      artifacts.push(artifact);
      updates.push({
        key: `variant:${card.ordinal}`,
        variantKey: `${kind}:${card.ordinal}`,
        outputPort: kind === "video" ? "videos" : "images",
        state: "completed",
        input: request?.inputs?.[inputPort] ?? request?.itemAction?.input ?? null,
        value: file,
      });
    }
    return {
      files,
      artifacts,
      updates,
      values: { [kind === "video" ? "videos" : "images"]: files, project_url: projectUrl },
    };
  }

  async function profileStatus(alias) {
    const marker = await readJson(markerPath(alias));
    return {
      status: "success",
      values: {
        ready: Boolean(marker?.ready),
        profileAlias: alias,
        message: marker?.ready
          ? message(request, "profileReady")
          : message(request, "profileMissing"),
      },
    };
  }

  async function prepareProfile(alias) {
    return withBrowser(alias, false, HOME_URL, async ({ client, page }) => {
      const deadline = Date.now() + Number(settings.interactiveWaitSeconds || 600) * 1000;
      while (Date.now() < deadline) {
        const state = await inspectPage(client, page.sessionId);
        if ((state.homeReady || state.editorReady) && (await bridgeInstalled(client, signal))) {
          await atomicJson(markerPath(alias), {
            ready: true,
            profileAlias: alias,
            validatedAt: new Date().toISOString(),
            origin: VIBES_ORIGIN,
            bridgeProtocol: PROTOCOL_VERSION,
          });
          return {
            status: "success",
            values: { ready: true, profileAlias: alias, message: message(request, "profileReady") },
          };
        }
        await sleep(1000, signal);
      }
      throw codedError("AUTHENTICATION_FAILED", message(request, "profileMissing"));
    });
  }

  async function start(input) {
    const marker = await readJson(markerPath(input.profileAlias));
    if (!marker?.ready)
      throw codedError("AUTHENTICATION_FAILED", message(request, "profileMissing"));
    const jobId = jobKey(request, input.profileAlias);
    const existing = await readJson(receiptPath(jobId));
    if (existing && ["submitted", "accepted", "running", "unknown"].includes(existing.state)) {
      return {
        status: "pending",
        jobId,
        pollAfterMs: 2500,
        progress: Math.min(0.9, (existing.completed || 0) / VARIANT_COUNT),
        message: message(
          request,
          existing.mediaKind === "video" ? "videoCollecting" : "collecting",
        ),
      };
    }
    if (existing?.state === "succeeded") return resume(jobId);
    return withBrowser(
      input.profileAlias,
      input.startMinimized,
      input.projectUrl || HOME_URL,
      async ({ client, page, attachBridge }) => {
        const projectUrl = await ensureProject(client, page, input.projectMode, input.projectUrl);
        const bridge = await attachBridge(projectUrl);
        let beforeState = await inspectPage(client, page.sessionId);
        if (input.projectMode === "existing" && !beforeState.cards.length) {
          beforeState = await waitFor(
            client,
            page.sessionId,
            (value) => value.cards.length > 0 || value.alerts.length > 0,
            20_000,
            signal,
          ).catch(() => beforeState);
        }
        const before = beforeState.cards.map((card) => card.mediaId).filter(Boolean);
        const receipt = {
          version: 1,
          logicalKey: jobId,
          provider: "vibes.ai",
          operation:
            input.kind === "video-frames"
              ? "animate-frame-in-browser"
              : input.kind === "video-elements"
                ? "generate-video-with-elements-in-browser"
                : "generate-images-in-browser",
          mediaKind: input.kind === "image" ? "image" : "video",
          inputPort: input.kind === "video-frames" ? "initial_frames" : "prompts",
          scope: {
            projectId: projectUrl.split("/").pop(),
            projectUrl,
            profileAlias: input.profileAlias,
          },
          batchItemId: request?.batch?.itemId || null,
          submittedAt: null,
          state: "prepared",
          externalIds: {},
          before,
          promptHash: sha256(input.prompt),
          referenceIds: input.references.map(
            (entry) => entry.file.sha256 || sha256(`${entry.file.id}:${entry.file.size}`),
          ),
          references: input.references.map((entry) => ({
            role: entry.role,
            id: entry.file.sha256 || sha256(`${entry.file.id}:${entry.file.size}`),
          })),
          frameIds: (input.frames || []).map(
            (entry) => entry.file.sha256 || sha256(`${entry.file.id}:${entry.file.size}`),
          ),
          resolution: input.kind === "image" ? undefined : input.resolution,
          completed: 0,
        };
        await atomicJson(receiptPath(jobId), receipt);
        activeReceipt = receipt;
        if (input.kind === "video-frames") {
          await prepareFrameVideoComposer(
            client,
            page,
            bridge,
            input.prompt,
            input.frames,
            input.references,
            input.resolution,
            jobId,
          );
        } else if (input.kind === "video-elements") {
          await prepareElementsVideoComposer(
            client,
            page,
            bridge,
            input.prompt,
            input.references,
            input.resolution,
            jobId,
          );
        } else {
          await prepareImageComposer(client, page, bridge, input.prompt, input.references, jobId);
        }
        activeReceipt = undefined;
        await bridge.acquireLease(`${jobId}:generation`, 60_000);
        receipt.submittedAt = new Date().toISOString();
        receipt.state = "unknown";
        await atomicJson(receiptPath(jobId), receipt);
        try {
          const submitted = await bridge.dispatch(
            "click",
            {
              selectors: [
                'button[data-analytics-id="send_message"][data-analytics-prompt-type]',
                'button[aria-label="Generate"]',
                'button[aria-label="Gerar"]',
              ],
              textIncludes: ["generate", "gerar"],
              preferDomActivation: true,
            },
            `${jobId}:submit-dom`,
          );
          receipt.lastControlAction = {
            occurredAt: new Date().toISOString(),
            key: `${jobId}:submit-dom`,
            text: String(submitted?.text || "").slice(0, 120),
            mechanism: String(submitted?.mechanism || "").slice(0, 32),
          };
          await waitFor(
            client,
            page.sessionId,
            (value) =>
              !value.generateReady ||
              value.cards.some((card) => !receipt.before.includes(card.mediaId)),
            10_000,
            signal,
          );
          receipt.state = "submitted";
        } catch (error) {
          receipt.lastErrorCode = error?.code || "UPSTREAM_UNAVAILABLE";
        }
        await atomicJson(receiptPath(jobId), receipt);
        return {
          status: "pending",
          jobId,
          pollAfterMs: 2500,
          progress: 0,
          message: message(request, input.kind === "image" ? "submitted" : "videoSubmitted"),
        };
      },
    );
  }

  async function resume(jobId) {
    if (!/^[a-f0-9]{64}$/.test(String(jobId || "")))
      throw codedError("INVALID_INPUT", "jobId do Vibes inválido.");
    const receipt = await readJson(receiptPath(jobId));
    if (!receipt) throw codedError("NOT_FOUND", "Recibo da geração do Vibes não encontrado.");
    if (receipt.state === "cancelled") throw codedError("CANCELLED", message(request, "cancelled"));
    return withBrowser(
      receipt.scope.profileAlias || request?.configuration?.accountProfile || "default",
      request?.configuration?.startMinimized !== false,
      receipt.scope.projectUrl,
      async ({ client, page, attachBridge }) => {
        const state = await waitFor(
          client,
          page.sessionId,
          (value) => PROJECT_URL.test(value.url) && (value.editorReady || value.intervention),
          45_000,
          signal,
        );
        if (state.intervention && !state.editorReady) {
          return {
            status: "pending",
            jobId,
            pollAfterMs: 15_000,
            progress: receipt.completed / VARIANT_COUNT,
            message: message(request, "profileMissing"),
          };
        }
        const bridge = await attachBridge(receipt.scope.projectUrl);
        const mediaKind = receipt.mediaKind === "video" ? "video" : "image";
        let observedState = state;
        if (!observedState.cards.some((card) => !card.mediaKind || card.mediaKind === mediaKind)) {
          observedState = await waitFor(
            client,
            page.sessionId,
            (value) =>
              value.cards.some((card) => !card.mediaKind || card.mediaKind === mediaKind) ||
              value.intervention,
            20_000,
            signal,
          ).catch(() => state);
        }
        receipt.pollCount = Number(receipt.pollCount || 0) + 1;
        await atomicJson(receiptPath(jobId), receipt);
        await bridge.acquireLease(`${jobId}:generation:${receipt.pollCount}`, 60_000);
        const expectedCards = observedState.cards.filter(
          (card) => !card.mediaKind || card.mediaKind === mediaKind,
        );
        receipt.lastObservation = {
          observedAt: new Date().toISOString(),
          cardCount: expectedCards.length,
          cards: expectedCards.map((card) => ({
            mediaId: card.mediaId,
            batchId: card.batchId,
            ordinal: card.ordinal,
            mediaKind: card.mediaKind,
            ready: card.ready,
            width: card.width,
            height: card.height,
            videoWidth: card.videoWidth,
            videoHeight: card.videoHeight,
          })),
        };
        await atomicJson(receiptPath(jobId), receipt);
        const { batchId, ready } = reconcileCards(
          receipt.before,
          expectedCards,
          receipt.submittedAt,
        );
        const media = await buildMedia(
          jobId,
          ready,
          receipt.scope.projectUrl,
          mediaKind,
          receipt.inputPort || (mediaKind === "video" ? "initial_frames" : "prompts"),
        );
        if (media.files.length) {
          await services.publishPartial?.({
            values: media.values,
            artifacts: media.artifacts,
            itemUpdates: media.updates,
            progress: media.files.length / VARIANT_COUNT,
            message: message(request, mediaKind === "video" ? "videoCollecting" : "collecting"),
          });
        }
        receipt.completed = media.files.length;
        receipt.state = media.files.length >= VARIANT_COUNT ? "succeeded" : "running";
        if (batchId) receipt.externalIds.batchId = batchId;
        receipt.externalIds.mediaIds = ready.map((card) => card.mediaId);
        await atomicJson(receiptPath(jobId), receipt);
        if (media.files.length >= VARIANT_COUNT) {
          return {
            status: "success",
            values: media.values,
            artifacts: media.artifacts,
            usage: {
              provider: "Vibes web",
              outputUnits: VARIANT_COUNT,
              unit: mediaKind === "video" ? "videos" : "images",
            },
            logs: [
              `variants=${VARIANT_COUNT}; project=${safeFileSegment(receipt.scope.projectId)}`,
            ],
          };
        }
        const alert = classifyAlerts(observedState.alerts);
        if (alert && !alert.pending)
          throw codedError(
            alert.code,
            `O Vibes encerrou a geração sem quatro ${mediaKind === "video" ? "vídeos" : "imagens"}.`,
            alert.retryable,
          );
        const elapsed = Date.now() - Date.parse(receipt.submittedAt || new Date().toISOString());
        const timeoutMs = mediaKind === "video" ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS;
        if (elapsed >= timeoutMs)
          throw codedError(
            "TIMEOUT",
            `O Vibes não entregou as quatro variantes de ${mediaKind === "video" ? "vídeo" : "imagem"} no prazo; o recibo foi preservado para reconciliação.`,
            true,
          );
        return {
          status: "pending",
          jobId,
          pollAfterMs: alert?.retryAfterMs || 2500,
          progress: media.files.length / VARIANT_COUNT,
          message: alert
            ? message(request, "profileMissing")
            : message(request, mediaKind === "video" ? "videoCollecting" : "collecting"),
          ...(media.files.length
            ? { partialValues: media.values, partialArtifacts: media.artifacts }
            : {}),
        };
      },
    );
  }

  async function cancel(jobId) {
    const receipt = await readJson(receiptPath(jobId));
    if (receipt) {
      receipt.state = "cancelled";
      receipt.cancelledAt = new Date().toISOString();
      await atomicJson(receiptPath(jobId), receipt);
    }
    return {
      status: "success",
      values: {},
      logs: ["cancelled=true; external-processing-may-continue=true"],
    };
  }

  async function regenerate(input) {
    const started = await start(input);
    if (started.status !== "pending") return started;
    const deadline = Date.now() + (input.kind === "image" ? IMAGE_TIMEOUT_MS : VIDEO_TIMEOUT_MS);
    while (Date.now() < deadline) {
      await sleep(Math.min(started.pollAfterMs || 2500, 5000), signal);
      const response = await resume(started.jobId);
      if (response.status === "pending") {
        if (response.partialValues)
          await services.publishPartial?.({
            values: response.partialValues,
            artifacts: response.partialArtifacts,
            progress: response.progress,
            message: response.message,
          });
        continue;
      }
      if (response.status === "error") return response;
      const outputPort = input.kind === "image" ? "images" : "videos";
      const first = response.values[outputPort][0];
      const artifact = response.artifacts.find((entry) => entry.id === first.id);
      return {
        status: "success",
        values: { [outputPort]: [first] },
        artifacts: artifact ? [artifact] : [],
        usage: {
          provider: "Vibes web",
          outputUnits: 1,
          unit: input.kind === "image" ? "selected-image" : "selected-video",
        },
      };
    }
    throw codedError(
      "TIMEOUT",
      "A regeneração não terminou no prazo; o recibo foi preservado.",
      true,
    );
  }

  return { profileStatus, prepareProfile, start, resume, cancel, regenerate };
}

export const __test = {
  VARIANT_COUNT,
  IMAGE_TIMEOUT_MS,
  VIDEO_TIMEOUT_MS,
  MAX_MEDIA_BYTES,
  classifyAlerts,
  closeBrowserGracefully,
  isTransientBrowserAttachmentError,
  elementRoleTerms,
  jobKey,
  pageState,
  reconcileCards,
  validateMediaUrl,
};
