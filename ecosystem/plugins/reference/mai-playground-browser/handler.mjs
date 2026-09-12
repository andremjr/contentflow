import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join } from "node:path";
import { attachContentFlowBridge } from "./browser-bridge-client.mjs";

const PLUGIN_ID = "local.contentflow.mai-playground-browser";
const HOST = "playground.microsoft.ai";
const BASE_URL = "https://playground.microsoft.ai/chat";
const DEFAULT_PORT = 9944;
const DEFAULT_MODEL_VOICE = "mai-voice-2";
const DEFAULT_MODEL_TEXT = "mai-thinking-1-latest";
const ALLOWED_ORIGINS = ["https://playground.microsoft.ai"];
const PROFILE_SETUP_WAIT_MS = Number.POSITIVE_INFINITY;

export function codedError(code, message, retryable = false) {
  const e = new Error(message);
  e.code = code;
  e.retryable = retryable;
  return e;
}

export function failure(code, message, retryable = false, retryAfterMs) {
  const v = { status: "error", code, message, retryable };
  if (retryAfterMs) v.retryAfterMs = retryAfterMs;
  return v;
}

export function clamp(v, fallback, min, max) {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(codedError("CANCELLED", "Execução cancelada."));
    const t = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(codedError("CANCELLED", "Execução cancelada."));
    };
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function serialize(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v ?? "");
  }
}

export function serializeInputs(inputs) {
  const entries = Object.entries(inputs ?? {}).filter(
    ([k]) => !["attachments", "references", "images", "documents"].includes(k),
  );
  if (entries.length === 1 && (entries[0][0] === "content" || entries[0][0] === "text")) {
    return serialize(entries[0][1]);
  }
  return entries.map(([k, v]) => `${k}:\n${serialize(v)}`).join("\n\n");
}

export function promptContextInputs(request) {
  return request?.instructionContextInputs ?? request?.inputs;
}

export function replaceAllLiteral(text, token, value) {
  return String(text)
    .split(token)
    .join(String(value ?? ""));
}

export function expandTemplate(template, request) {
  const context = request?.context ?? {};
  const replacements = {
    "{{CONTENT}}": serializeInputs(promptContextInputs(request)),
    "{{TEMA}}": serializeInputs(promptContextInputs(request)),
    "{{CHANNEL_NAME}}": context?.channel?.name ?? "",
    "{{NICHE}}": context?.channel?.niche ?? "",
    "{{NICHO}}": context?.channel?.niche ?? "",
    "{{PROJECT_TITLE}}": context?.project?.title ?? "",
    "{{PROCESS}}": context?.processType ?? "",
    "{{BLOCK_INSTRUCTIONS}}":
      request?.resolvedInstruction || context?.block?.instructions || context?.block?.name || "",
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

export function ensureBlockInstruction(prompt, template, request) {
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

export function ensureInputContext(prompt, template, request) {
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

export function buildVoicePrompt(request) {
  const inputs = request?.inputs ?? {};
  const rawText = inputs.text ?? inputs.content ?? "";
  const text = typeof rawText === "string" ? rawText.trim() : serialize(rawText).trim();
  if (!text) {
    throw codedError("INVALID_INPUT", "O texto para narração não pode estar vazio.");
  }
  return text;
}

export function splitVoiceText(text, maxLength = 800) {
  const source = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!source) {
    throw codedError("INVALID_INPUT", "O texto para narração não pode estar vazio.");
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw codedError("INVALID_CONFIGURATION", "O limite de caracteres da narração é inválido.");
  }

  const chunks = [];
  let remaining = source;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    let cut = -1;

    for (let index = window.length - 1; index >= 0; index -= 1) {
      if (window[index] !== ".") continue;
      const next = remaining[index + 1];
      if (next === undefined || /\s/.test(next)) {
        cut = index + 1;
        break;
      }
    }

    if (cut < 1) {
      for (let index = window.length - 1; index >= 0; index -= 1) {
        if (/\s/.test(window[index])) {
          cut = index;
          break;
        }
      }
    }

    if (cut < 1) {
      throw codedError(
        "INVALID_INPUT",
        `Há uma palavra com mais de ${maxLength} caracteres; o texto não pode ser dividido sem cortar essa palavra.`,
      );
    }

    const chunk = remaining.slice(0, cut).trim();
    if (!chunk || chunk.length > maxLength) {
      throw codedError("INVALID_INPUT", "Não foi possível dividir a narração com segurança.");
    }
    chunks.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function buildTextPrompt(request) {
  const template =
    request?.configuration?.promptTemplate ?? "{{BLOCK_INSTRUCTIONS}}\n\n{{CONTENT}}";
  const expanded = ensureInputContext(
    ensureBlockInstruction(expandTemplate(template, request), template, request),
    template,
    request,
  );
  if (!expanded) {
    throw codedError("INVALID_INPUT", "O prompt do bloco está vazio.");
  }
  return expanded;
}

export function normalizeProfile(v) {
  const n = String(v ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(n)) {
    throw codedError("INVALID_CONFIGURATION", "Perfil Microsoft AI Playground inválido.");
  }
  return n;
}

export function profilePath(settings, n) {
  return join(
    settings?.profilesBasePath?.trim?.() ||
      join(homedir(), ".contentflow", "mai-playground-profiles"),
    n,
  );
}

export function runtimeProfilePath(settings, name, services) {
  if (settings?.profilesBasePath?.trim?.()) return profilePath(settings, name);
  return services.getWorkspacePath(name);
}

export function profileMarkerPath(path) {
  return join(path, ".contentflow-profile-ready.json");
}

export async function profileIsPrepared(path, name) {
  try {
    const marker = JSON.parse(await readFile(profileMarkerPath(path), "utf8"));
    return marker?.provider === HOST && marker?.profile === name && marker?.bridgeProtocol === 2;
  } catch {
    return false;
  }
}

export async function markProfilePrepared(path, name) {
  await writeFile(
    profileMarkerPath(path),
    JSON.stringify({
      provider: HOST,
      profile: name,
      bridgeProtocol: 2,
      preparedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

export function profilePort(base, n) {
  if (n === "default") return base;
  let h = 2166136261;
  for (const c of n) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return base + (h % Math.min(1200, 65535 - base));
}

export function assertProfile(p, allowExistingChromeProfile = false) {
  if (allowExistingChromeProfile) return;
  const n = String(p).replaceAll("\\", "/").toLowerCase();
  if (n.endsWith("/google/chrome/user data") || n.includes("/google/chrome/user data/default")) {
    throw codedError("INVALID_CONFIGURATION", "Use perfil Chrome dedicado.");
  }
}

async function capture(exe, args, ms = 4000) {
  return await new Promise((resolve) => {
    let c;
    try {
      c = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false });
    } catch {
      return resolve({ ok: false, stdout: "" });
    }
    let stdout = "";
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve({ ok, stdout });
    };
    const t = setTimeout(() => {
      try {
        c.kill();
      } catch {}
      end(false);
    }, ms);
    c.stdout?.setEncoding("utf8");
    c.stdout?.on("data", (x) => (stdout += x));
    c.once("error", () => end(false));
    c.once("close", (code) => end(code === 0));
  });
}

function regValue(o) {
  for (const l of String(o ?? "").split(/\r?\n/)) {
    const m = l.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  }
  return "";
}

export async function chromeCandidates() {
  if (platform() === "win32") {
    const standardCandidates = [
      process.env.PROGRAMFILES &&
        join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    ].filter(Boolean);

    const f = standardCandidates.filter((p) => existsSync(p));
    if (f.length) return f;

    for (const key of [
      "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
    ]) {
      const r = await capture("reg", ["query", key, "/ve"]);
      if (r.ok) {
        const v = regValue(r.stdout);
        if (v && existsSync(v)) f.push(v);
      }
    }
    const w = await capture("where", ["chrome.exe"]);
    if (w.ok) f.push(...w.stdout.split(/\r?\n/).filter((x) => x.trim() && existsSync(x.trim())));
    return [...new Set(f.filter(Boolean).map((x) => x.trim()))];
  }
  if (platform() === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }
  const f = [];
  for (const n of ["google-chrome", "chromium"]) {
    const r = await capture("which", [n]);
    if (r.ok) f.push(...r.stdout.split(/\r?\n/));
  }
  return f.filter(Boolean);
}

export async function checkDebuggerVersion(port, ms = 1500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: c.signal });
    if (!r.ok) return null;
    const v = await r.json();
    return v?.webSocketDebuggerUrl ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function launchBrowser(settings, profileDir, port, signal, initialUrl = BASE_URL) {
  const existing = await checkDebuggerVersion(port);
  if (existing) return { version: existing, child: null, reused: true };

  const exes = settings?.chromeExecutable?.trim?.()
    ? [settings.chromeExecutable.trim()]
    : await chromeCandidates();
  if (!exes.length) {
    throw codedError("INVALID_CONFIGURATION", "Nenhum executável do Google Chrome foi localizado.");
  }

  const keepBrowserOpen = settings.keepBrowserOpen !== false;
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    initialUrl,
  ];
  if (settings.startMinimized !== false) args.unshift("--start-minimized");

  for (const exe of exes) {
    let child;
    try {
      child = spawn(exe, args, {
        detached: keepBrowserOpen,
        stdio: "ignore",
        windowsHide: false,
        shell: false,
      });
    } catch {
      continue;
    }
    if (keepBrowserOpen) child.unref();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      const v = await checkDebuggerVersion(port);
      if (v) return { version: v, child, reused: false };
      await sleep(350, signal);
    }
    try {
      child.kill();
    } catch {}
  }
  throw codedError("PERMISSION_DENIED", "Não foi possível iniciar o Chrome dedicado.");
}

export class CDPClient {
  constructor(url, trace) {
    this.url = url;
    this.trace = trace;
    this.id = 1;
    this.pending = new Map();
  }

  async connect(signal) {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener(
        "error",
        () => rej(codedError("UPSTREAM_UNAVAILABLE", "Falha de conexão com o WebSocket CDP.")),
        { once: true },
      );
      signal?.addEventListener("abort", () => rej(codedError("CANCELLED", "Execução cancelada.")), {
        once: true,
      });
    });
    this.ws.addEventListener("message", (e) => this.message(e));
    return this;
  }

  message(e) {
    let m;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (!m.id) return;
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    if (m.error) {
      p.reject(codedError("UPSTREAM_UNAVAILABLE", `CDP ${p.method}: ${m.error.message}`));
    } else {
      p.resolve(m.result ?? {});
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.id++;
    const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    if (this.trace) {
      this.trace(`CDP -> ${method} (id=${id})`);
    }
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

export async function evaluate(client, sessionId, expression) {
  const r = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId,
  );
  if (r.exceptionDetails) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      r.exceptionDetails?.exception?.description || "Erro na avaliação de script da página.",
    );
  }
  return r.result?.value;
}

export async function attachPage(client, signal, targetUrl, activate = false, forceNew = false) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  let t = forceNew
    ? undefined
    : targetInfos.find((x) => x.type === "page" && String(x.url).includes(HOST));
  let created = false;
  if (!t) {
    const n = await client.send("Target.createTarget", { url: targetUrl, background: !activate });
    t = { targetId: n.targetId };
    created = true;
  }
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: t.targetId,
    flatten: true,
  });
  if (activate) await client.send("Target.activateTarget", { targetId: t.targetId });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  return { sessionId, targetId: t.targetId, created };
}

export async function attachExistingPage(client, targetId) {
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

export async function closeDuplicateProviderPages(client, keepTargetId) {
  const { targetInfos = [] } = await client.send("Target.getTargets");
  let closedAny = false;
  for (const target of targetInfos) {
    if (
      target.type === "page" &&
      target.targetId !== keepTargetId &&
      String(target.url || "").includes(HOST)
    ) {
      await client.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
      closedAny = true;
    }
  }
  // A extensão consulta chrome.tabs. Espere a remoção ser observável antes de
  // delegar o próximo comando, para que ela não escolha uma aba duplicada.
  if (closedAny) await sleep(500);
}

export async function detachPage(client, sessionId) {
  if (!sessionId) return;
  await client.send("Target.detachFromTarget", { sessionId });
}

const DOM_HELPERS = String.raw`
function vis(e) {
  if (!e || !(e instanceof Element)) return false;
  const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 4 && r.height > 4;
}
function txt(e) {
  return [e?.innerText, e?.textContent, e?.getAttribute?.('aria-label'), e?.getAttribute?.('title')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function findComposer() {
  const sels = [
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[role="textbox"]',
    'input[type="text"]'
  ];
  for (const s of sels) {
    const el = [...document.querySelectorAll(s)].find(vis);
    if (el) return el;
  }
  return null;
}
function dismissDisclaimer() {
  const dismissBtn = document.querySelector('button[title="Dismiss notification"], button[aria-label="Dismiss notification"], [data-testid="playground-disclaimer-toast"] button');
  if (dismissBtn && vis(dismissBtn)) {
    dismissBtn.click();
    return true;
  }
  return false;
}
`;

export async function dismissBanners(client, sessionId) {
  try {
    await evaluate(
      client,
      sessionId,
      `(() => {
        ${DOM_HELPERS}
        return dismissDisclaimer();
      })()`,
    );
  } catch {}
}

export async function waitForComposer(client, sessionId, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let lastState = {};
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    lastState = await evaluate(
      client,
      sessionId,
      `(() => {
        ${DOM_HELPERS}
        dismissDisclaimer();
        const body = document.body?.innerText || '';
        const composer = findComposer();
        const loginControl = [...document.querySelectorAll('button, a')].find((element) => {
          if (!vis(element)) return false;
          const label = txt(element).toLowerCase();
          return /^(log in|sign in|entrar|fazer login)(\\s|$)/i.test(label);
        });
        const needsLogin = location.hostname !== ${JSON.stringify(HOST)} || Boolean(loginControl);
        return {
          host: location.hostname,
          url: location.href,
          hasComposer: Boolean(composer),
          needsLogin,
          bodySnippet: body.slice(0, 1000)
        };
      })()`,
    );

    if (lastState?.host === HOST && lastState?.hasComposer && !lastState?.needsLogin) {
      return true;
    }
    await sleep(600, signal);
  }

  if (lastState?.needsLogin) {
    throw codedError(
      "AUTHENTICATION_FAILED",
      "O login no Microsoft AI Playground não foi concluído dentro do prazo. Conclua o login na janela visível do Chrome dedicado e mantenha-a aberta até o campo de texto aparecer.",
      true,
    );
  }
  throw codedError(
    "UPSTREAM_UNAVAILABLE",
    "A interface do Microsoft AI Playground não carregou o campo de envio dentro do prazo.",
    true,
  );
}

export function generateSilenceWav(durationSec = 1, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

export async function selectVoiceAndStyle(bridge, voice, style) {
  if (!voice && !style) return;
  const choose = async (kind, triggerSelector, value) => {
    const optionSelectors = ['button[role="option"]', '[role="option"]', '[role="menuitem"]'];
    const selectOpenOption = async (attempt) =>
      await bridge.dispatch(
        "click",
        { selectors: optionSelectors, textIncludes: [value] },
        `select-${kind}-${value}-${attempt}`,
        5000,
      );

    // When a user has just interacted with the page, the picker can already
    // be open. Prefer that state instead of toggling the picker closed.
    try {
      await selectOpenOption("already-open");
      await sleep(250);
      return;
    } catch {}

    let lastError;
    // The Playground renders options asynchronously. If the first click
    // happened while an already-open picker was closing, the second pass
    // deliberately opens it again with a distinct idempotency key.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await bridge.dispatch(
          "click",
          { selectors: [triggerSelector] },
          `open-${kind}-picker-${attempt}`,
          5000,
        );
        await sleep(800);
        await selectOpenOption(attempt);
        await sleep(300);
        return;
      } catch (error) {
        lastError = error;
        await sleep(500);
      }
    }
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `Não foi possível selecionar ${kind === "voice" ? "a voz" : "o estilo"} “${value}” no Microsoft AI Playground: ${lastError?.message || "controle não encontrado"}.`,
      true,
    );
  };

  if (voice) await choose("voice", 'button[aria-label^="Voice:" i]', voice);
  if (style) await choose("style", 'button[aria-label^="Style:" i]', style);
}

export async function verifyVoiceAndStyle(client, sessionId, voice, style) {
  const selected = await evaluate(
    client,
    sessionId,
    `(() => {
      const buttons = [...document.querySelectorAll('button[aria-label]')];
      const voice = buttons.find((button) => /^voice:/i.test(button.getAttribute('aria-label') || ''))?.getAttribute('aria-label') || '';
      const style = buttons.find((button) => /^style:/i.test(button.getAttribute('aria-label') || ''))?.getAttribute('aria-label') || '';
      return { voice, style };
    })()`,
  );
  if (voice && !selected.voice.toLowerCase().includes(String(voice).toLowerCase())) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `A voz solicitada (${voice}) não ficou selecionada. A interface informa: ${selected.voice || "voz não identificada"}.`,
      true,
    );
  }
  if (style && !selected.style.toLowerCase().includes(String(style).toLowerCase())) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      `O estilo solicitado (${style}) não ficou selecionado. A interface informa: ${selected.style || "estilo não identificado"}.`,
      true,
    );
  }
  return selected;
}

export async function sendPrompt(client, sessionId, bridge, text, signal, operationKey = "single") {
  // Preenche via bridge com os seletores usuais de textarea/composer
  await bridge.dispatch(
    "setText",
    {
      selectors: [
        'textarea[placeholder="Type what you\'d like to hear"]',
        "textarea",
        '[contenteditable="true"][role="textbox"]',
        '[role="textbox"]',
      ],
      text,
    },
    `set-prompt-${operationKey}`,
    30000,
  );

  await sleep(300, signal);

  // Tenta clicar no botão de enviar
  let sent = false;
  try {
    await bridge.dispatch(
      "click",
      {
        selectors: [
          'button[aria-label*="send" i]',
          'button[aria-label*="enviar" i]',
          'button[title*="send" i]',
          'button[type="submit"]',
        ],
      },
      `click-send-${operationKey}`,
      5000,
    );
    sent = true;
  } catch {
    if (!sessionId) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O botão de envio do Microsoft AI Playground não foi encontrado ou permaneceu desabilitado.",
        true,
      );
    }
    // Fallback de submissão via Enter através de evento de teclado
    await client.send(
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
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
    sent = true;
  }
  return sent;
}

export function isAudioGenerationInProgress(buttonLabels, pageText) {
  return (
    (buttonLabels ?? []).some((label) =>
      /stop generation|parar geração|parar ger[ae]ção/i.test(label),
    ) ||
    /generating audio|creating audio|gerando [áa]udio|criando [áa]udio/i.test(
      String(pageText ?? ""),
    )
  );
}

export function latestArtifactAudioUrl(resourceUrls) {
  const urls = (resourceUrls ?? []).filter(
    (url) =>
      typeof url === "string" &&
      /\/api\/artifacts\/[^?#]+\.(?:wav|mp3|ogg|m4a)(?:[?#].*)?$/i.test(url),
  );
  return urls.at(-1) || "";
}

export async function waitForAudioGeneration(client, sessionId, timeoutMs, baseline, signal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");

    const state = await evaluate(
      client,
      sessionId,
      `(() => {
        ${DOM_HELPERS}
        const audios = [...document.querySelectorAll('audio')].filter(a => a.src || a.currentSrc || a.querySelector('source'));
        const artifactUrls = performance.getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(url => {
            const clean = String(url).split(/[?#]/)[0].toLowerCase();
            return clean.includes('/api/artifacts/') && ['.wav', '.mp3', '.ogg', '.m4a'].some(ext => clean.endsWith(ext));
          });
        const downloadBtns = [...document.querySelectorAll('button[aria-label*="download audio" i], button[title*="download audio" i]')];
        const isGenerating = [...document.querySelectorAll('button')].some(b => vis(b) && /stop generation|parar geração|parar ger[ae]ção/i.test(txt(b))) ||
                             /generating audio|creating audio|gerando [áa]udio|criando [áa]udio/i.test(document.body?.innerText || '');
        return {
          audioCount: audios.length,
          artifactCount: artifactUrls.length,
          downloadCount: downloadBtns.length,
          isGenerating,
          latestSrc: audios.at(-1)?.currentSrc || audios.at(-1)?.src || audios.at(-1)?.querySelector('source')?.src || artifactUrls.at(-1) || ''
        };
      })()`,
    );

    const baselineState =
      typeof baseline === "number"
        ? { audioCount: baseline, artifactCount: 0, downloadCount: 0, latestSrc: "" }
        : baseline || { audioCount: 0, artifactCount: 0, downloadCount: 0, latestSrc: "" };
    const hasNewAudio =
      state.audioCount > baselineState.audioCount ||
      state.artifactCount > (baselineState.artifactCount || 0) ||
      (state.latestSrc && state.latestSrc !== baselineState.latestSrc);
    if (hasNewAudio && state.latestSrc && !state.isGenerating) {
      return state.latestSrc;
    }
    if (state.downloadCount > baselineState.downloadCount && !state.isGenerating) {
      // Audio element might be hidden, download button confirms completion
      return state.latestSrc || "ready-by-download-button";
    }

    await sleep(1000, signal);
  }
  throw codedError(
    "TIMEOUT",
    "O Microsoft AI Playground não concluiu a geração do áudio no tempo limite.",
    true,
  );
}

export async function readAudioState(client, sessionId) {
  return await evaluate(
    client,
    sessionId,
    `(() => {
      const audios = [...document.querySelectorAll('audio')].filter(a => a.src || a.currentSrc || a.querySelector('source'));
      const artifactUrls = performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(url => {
          const clean = String(url).split(/[?#]/)[0].toLowerCase();
          return clean.includes('/api/artifacts/') && ['.wav', '.mp3', '.ogg', '.m4a'].some(ext => clean.endsWith(ext));
        });
      const downloadButtons = [...document.querySelectorAll('button[aria-label*="download audio" i], button[title*="download audio" i]')];
      return {
        audioCount: audios.length,
        artifactCount: artifactUrls.length,
        downloadCount: downloadButtons.length,
        latestSrc: audios.at(-1)?.currentSrc || audios.at(-1)?.src || audios.at(-1)?.querySelector('source')?.src || artifactUrls.at(-1) || ''
      };
    })()`,
  );
}

export async function captureAudioBytes(client, sessionId, audioSrc) {
  let base64 = "";
  let mimeType = "audio/wav";

  if (audioSrc && audioSrc.startsWith("http")) {
    const payload = await evaluate(
      client,
      sessionId,
      `(async () => {
        const r = await fetch(${JSON.stringify(audioSrc)}, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = new Uint8Array(await r.arrayBuffer());
        let s = '';
        for (let i = 0; i < b.length; i += 32768) {
          s += String.fromCharCode(...b.subarray(i, i + 32768));
        }
        return {
          base64: btoa(s),
          mime: r.headers.get('content-type') || 'audio/wav'
        };
      })()`,
    );
    base64 = payload.base64;
    mimeType = payload.mime.split(";")[0].trim() || "audio/wav";
  } else {
    // Se a URL não for diretamente fetchable, extrai o blob do último elemento de áudio
    const payload = await evaluate(
      client,
      sessionId,
      `(async () => {
        const audio = [...document.querySelectorAll('audio')].at(-1);
        const src = audio?.currentSrc || audio?.src || audio?.querySelector('source')?.src;
        if (!src) throw new Error('Nenhum elemento de áudio encontrado.');
        const r = await fetch(src, { credentials: 'include' });
        const b = new Uint8Array(await r.arrayBuffer());
        let s = '';
        for (let i = 0; i < b.length; i += 32768) {
          s += String.fromCharCode(...b.subarray(i, i + 32768));
        }
        return {
          base64: btoa(s),
          mime: r.headers.get('content-type') || 'audio/wav'
        };
      })()`,
    );
    base64 = payload.base64;
    mimeType = payload.mime.split(";")[0].trim() || "audio/wav";
  }

  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) {
    throw codedError("OUTPUT_VALIDATION_FAILED", "O áudio capturado está vazio.", true);
  }

  return { bytes, mimeType };
}

export function concatenateWavBuffers(buffers) {
  if (!Array.isArray(buffers) || buffers.length < 1) {
    throw codedError("OUTPUT_VALIDATION_FAILED", "Nenhum trecho de áudio foi recebido.");
  }
  const parsed = buffers.map((buffer) => {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length < 44 ||
      buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O Playground devolveu um trecho de áudio que não é WAV válido.",
      );
    }
    let offset = 12;
    let format;
    let data;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString("ascii", offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > buffer.length) break;
      if (id === "fmt ") format = buffer.subarray(start, end);
      if (id === "data") data = buffer.subarray(start, end);
      offset = end + (size % 2);
    }
    if (!format || !data) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "O trecho WAV não contém formato e dados de áudio.",
      );
    }
    return { format, data };
  });
  const expectedFormat = parsed[0].format;
  if (parsed.some((part) => !part.format.equals(expectedFormat))) {
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      "Os trechos WAV usam formatos incompatíveis e não podem ser concatenados com segurança.",
    );
  }
  const data = Buffer.concat(parsed.map((part) => part.data));
  const formatPadding = expectedFormat.length % 2;
  const dataPadding = data.length % 2;
  const output = Buffer.alloc(
    12 + 8 + expectedFormat.length + formatPadding + 8 + data.length + dataPadding,
  );
  output.write("RIFF", 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(expectedFormat.length, 16);
  expectedFormat.copy(output, 20);
  const dataHeader = 20 + expectedFormat.length + formatPadding;
  output.write("data", dataHeader);
  output.writeUInt32LE(data.length, dataHeader + 4);
  data.copy(output, dataHeader + 8);
  return output;
}

export async function writeAudioArtifact(services, request, bytes, mimeType) {
  const ext =
    mimeType.includes("mpeg") || mimeType.includes("mp3")
      ? "mp3"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "m4a"
          : "wav";

  const id = `mai-audio-${createHash("sha256")
    .update(`${request.executionId || "e"}:${request.blockId || "b"}:${request.attempt || 1}`)
    .digest("hex")
    .slice(0, 16)}`;
  const filename = `${id}.${ext}`;
  await writeFile(services.getOutputPath(filename), bytes);

  const file = {
    id,
    name: filename,
    mimeType,
    size: bytes.length,
    url: `artifact://${id}`,
  };
  const artifact = {
    id,
    name: filename,
    mimeType,
    size: bytes.length,
    source: { kind: "path", path: filename },
  };

  return { file, artifact };
}

export async function captureAudioArtifact(client, sessionId, services, request, audioSrc) {
  const { bytes, mimeType } = await captureAudioBytes(client, sessionId, audioSrc);
  return await writeAudioArtifact(services, request, bytes, mimeType);
}

export async function waitForTextGeneration(client, sessionId, timeoutMs, baselineCount, signal) {
  const deadline = Date.now() + timeoutMs;
  let stablePolls = 0;
  let lastText = "";

  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");

    const state = await evaluate(
      client,
      sessionId,
      `(() => {
        ${DOM_HELPERS}
        const bubbles = [...document.querySelectorAll('[data-message-author="assistant"], [data-role="assistant"], .message-content, [class*="assistant-message"]')].filter(vis);
        const latest = bubbles.at(-1);
        const text = latest ? (latest.innerText || latest.textContent || '').trim() : '';
        const isGenerating = [...document.querySelectorAll('button')].some(b => vis(b) && /stop generation|parar/i.test(txt(b))) ||
                             /thinking/i.test(document.body?.innerText || '');
        return {
          count: bubbles.length,
          text,
          isGenerating
        };
      })()`,
    );

    if (state.count > baselineCount && state.text) {
      if (state.text === lastText && !state.isGenerating) {
        stablePolls += 1;
        if (stablePolls >= 2) {
          return state.text;
        }
      } else {
        stablePolls = 0;
        lastText = state.text;
      }
    }

    await sleep(800, signal);
  }
  throw codedError(
    "TIMEOUT",
    "O Microsoft AI Playground não concluiu a resposta no tempo limite.",
    true,
  );
}

export async function configureProfile(request, services) {
  const settings = request?.settings ?? {};
  let name, path, port;
  try {
    name = normalizeProfile(request?.configuration?.accountProfile);
    path = runtimeProfilePath(settings, name, services);
    port = profilePort(clamp(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000), name);
    assertProfile(path, settings.allowExistingChromeProfile === true);
  } catch (error) {
    return failure(error?.code || "INVALID_CONFIGURATION", error?.message || "Perfil inválido.");
  }

  if (request?.invocation?.action === "status") {
    return { status: "success", values: { ready: await profileIsPrepared(path, name) } };
  }
  if (request?.invocation?.action !== "prepare") {
    return failure("INVALID_CONFIGURATION", "Ação de configuração de perfil inválida.");
  }

  let client, child, bridge;
  try {
    const launched = await launchBrowser(
      { ...settings, keepBrowserOpen: false, startMinimized: false },
      path,
      port,
      services.signal,
      BASE_URL,
    );
    child = launched.child;
    client = await new CDPClient(launched.version.webSocketDebuggerUrl).connect(services.signal);
    const { sessionId } = await attachPage(client, services.signal, BASE_URL, true);

    await waitForComposer(client, sessionId, PROFILE_SETUP_WAIT_MS, services.signal);
    bridge = await attachContentFlowBridge({
      client,
      pageSessionId: sessionId,
      pluginId: PLUGIN_ID,
      profileId: name,
      request,
      signal: services.signal,
      allowedOrigins: ALLOWED_ORIGINS,
      waitMs: PROFILE_SETUP_WAIT_MS,
    });
    await markProfilePrepared(path, name);
    return {
      status: "success",
      values: { ready: true, message: `Perfil ${name} validado no Microsoft AI Playground.` },
    };
  } catch (error) {
    return failure(
      error?.code || "AUTHENTICATION_FAILED",
      error?.message || "Não foi possível validar o login no Microsoft AI Playground.",
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
  if (request?.invocation?.mode === "configure") {
    return await configureProfile(request, services);
  }

  const settings = request?.settings ?? {};
  const capabilityId = String(request?.capabilityId ?? "generate-voice-in-browser");
  const mock = String(settings.diagnosticMockResponse ?? "").trim();

  // Execução mock para testes determinísticos sem navegador
  if (mock) {
    if (capabilityId === "generate-voice-in-browser") {
      const bytes = generateSilenceWav(1);
      const id = `mai-audio-mock-${createHash("sha256")
        .update(`${request?.executionId || "e"}:${request?.blockId || "b"}`)
        .digest("hex")
        .slice(0, 12)}`;
      const filename = `${id}.wav`;
      await writeFile(services.getOutputPath(filename), bytes);
      const file = {
        id,
        name: filename,
        mimeType: "audio/wav",
        size: bytes.length,
        url: `artifact://${id}`,
      };
      const artifact = {
        id,
        name: filename,
        mimeType: "audio/wav",
        size: bytes.length,
        source: { kind: "path", path: filename },
      };
      return {
        status: "success",
        values: {
          audio: file,
          transcript: mock,
        },
        artifacts: [artifact],
      };
    }
    return {
      status: "success",
      values: {
        result: mock,
        parts: [mock],
      },
    };
  }

  // Montagem do prompt / texto conforme a capacidade
  let promptText = "";
  try {
    if (capabilityId === "generate-voice-in-browser") {
      promptText = buildVoicePrompt(request);
    } else if (capabilityId === "generate-text-in-browser") {
      promptText = buildTextPrompt(request);
    } else {
      throw codedError("INVALID_CONFIGURATION", `Capability desconhecida: ${capabilityId}`);
    }
  } catch (error) {
    return failure(error.code || "INVALID_INPUT", error.message);
  }

  const cfg = request.configuration ?? {};
  const profile = normalizeProfile(cfg.accountProfile);
  const profileDir = runtimeProfilePath(settings, profile, services);
  const port = profilePort(clamp(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000), profile);

  assertProfile(profileDir, settings.allowExistingChromeProfile === true);
  if (!(await profileIsPrepared(profileDir, profile))) {
    return failure(
      "AUTHENTICATION_FAILED",
      `O perfil ${profile} ainda não foi salvo. Abra o Método e use 'Salvar perfil' para autenticar no Microsoft AI Playground antes da execução.`,
    );
  }

  const model =
    capabilityId === "generate-voice-in-browser"
      ? cfg.model || DEFAULT_MODEL_VOICE
      : cfg.model || DEFAULT_MODEL_TEXT;
  const targetUrl = `${BASE_URL}?model=${encodeURIComponent(model)}`;

  let client, child, bridge, taskTargetId;
  try {
    const launched = await launchBrowser(
      {
        ...settings,
        keepBrowserOpen: settings.keepBrowserOpen !== false,
        startMinimized:
          capabilityId === "generate-voice-in-browser" ? false : settings.startMinimized !== false,
      },
      profileDir,
      port,
      services.signal,
      targetUrl,
    );
    child = launched.child;

    client = await new CDPClient(
      launched.version.webSocketDebuggerUrl,
      settings.diagnosticTrace ? (m) => process.stderr.write(`[MAI Playground] ${m}\n`) : null,
    ).connect(services.signal);

    const taskPage = await attachPage(
      client,
      services.signal,
      targetUrl,
      capabilityId === "generate-voice-in-browser",
      false,
    );
    let { sessionId } = taskPage;
    taskTargetId = taskPage.targetId;
    await closeDuplicateProviderPages(client, taskTargetId);

    // Garante que está na URL do modelo desejado
    const currentUrl = await evaluate(client, sessionId, "location.href");
    if (!currentUrl.includes(`model=${model}`)) {
      await client.send("Page.navigate", { url: targetUrl }, sessionId);
      await sleep(1500, services.signal);
    }

    const waitTimeoutMs = clamp(settings.interactiveWaitSeconds, 600, 30, 900) * 1000;
    await waitForComposer(client, sessionId, waitTimeoutMs, services.signal);
    await dismissBanners(client, sessionId);

    if (capabilityId === "generate-voice-in-browser") {
      const voice = cfg.voice || "Caio";
      const style = cfg.style || "Neutral";
      const chunks = splitVoiceText(promptText, 800);
      const responseTimeoutMs = clamp(settings.responseTimeoutSeconds, 600, 30, 3600) * 1000;
      const audioParts = [];
      let mimeType = "";
      // The Playground preserves its selected voice and style between runs.
      // Reading that state before yielding the tab to Browser Bridge avoids
      // reopening an already-correct picker (which can be transient while a
      // previous generated item is being rendered).
      let voiceAndStyleAlreadySelected = false;
      try {
        await verifyVoiceAndStyle(client, sessionId, voice, style);
        voiceAndStyleAlreadySelected = true;
      } catch {
        // A different saved selection is a normal case: Browser Bridge will
        // change it below and the result is verified again afterwards.
      }
      for (let index = 0; index < chunks.length; index += 1) {
        // The provider needs a small idle interval between completed audio
        // turns and the next text submission. This also prevents a fresh
        // composer from being targeted while its previous turn still renders.
        if (index > 0) await sleep(2000, services.signal);
        const baseline = await readAudioState(client, sessionId);
        await detachPage(client, sessionId);
        sessionId = undefined;
        // Chrome releases a flattened CDP attachment asynchronously. Give the
        // Browser Bridge the same two-second handoff window used between text
        // submissions before it attaches chrome.debugger to this tab.
        await sleep(2000, services.signal);
        bridge = await attachContentFlowBridge({
          client,
          pageTargetId: taskTargetId,
          expectedUrl: targetUrl,
          pluginId: PLUGIN_ID,
          profileId: profile,
          request,
          signal: services.signal,
          allowedOrigins: ALLOWED_ORIGINS,
        });
        if (index === 0 && !voiceAndStyleAlreadySelected)
          await selectVoiceAndStyle(bridge, voice, style);
        await sendPrompt(
          client,
          undefined,
          bridge,
          chunks[index],
          services.signal,
          `voice-${index}`,
        );
        await bridge.dispose();
        bridge = undefined;
        sessionId = await attachExistingPage(client, taskTargetId);
        if (index === 0) await verifyVoiceAndStyle(client, sessionId, voice, style);
        const audioSrc = await waitForAudioGeneration(
          client,
          sessionId,
          responseTimeoutMs,
          baseline,
          services.signal,
        );
        const captured = await captureAudioBytes(client, sessionId, audioSrc);
        if (mimeType && captured.mimeType !== mimeType) {
          throw codedError(
            "OUTPUT_VALIDATION_FAILED",
            "O Playground devolveu formatos de áudio diferentes entre os trechos.",
            true,
          );
        }
        mimeType = captured.mimeType;
        audioParts.push(captured.bytes);
      }

      const finalBytes =
        audioParts.length === 1
          ? audioParts[0]
          : mimeType.includes("wav")
            ? concatenateWavBuffers(audioParts)
            : (() => {
                throw codedError(
                  "OUTPUT_VALIDATION_FAILED",
                  `A concatenação segura de ${audioParts.length} trechos exige WAV, mas o Playground devolveu ${mimeType}.`,
                  true,
                );
              })();
      const { file, artifact } = await writeAudioArtifact(
        services,
        request,
        finalBytes,
        mimeType || "audio/wav",
      );

      return {
        status: "success",
        values: {
          audio: file,
          transcript: promptText,
        },
        artifacts: [artifact],
      };
    } else {
      bridge = await attachContentFlowBridge({
        client,
        pageSessionId: sessionId,
        pluginId: PLUGIN_ID,
        profileId: profile,
        request,
        signal: services.signal,
        allowedOrigins: ALLOWED_ORIGINS,
      });
      // Geração de texto
      const baselineBubbleCount = await evaluate(
        client,
        sessionId,
        'document.querySelectorAll(\'[data-message-author="assistant"], [data-role="assistant"], .message-content, [class*="assistant-message"]\').length',
      );

      await sendPrompt(client, sessionId, bridge, promptText, services.signal);

      const responseTimeoutMs = clamp(settings.responseTimeoutSeconds, 600, 30, 3600) * 1000;
      const generatedText = await waitForTextGeneration(
        client,
        sessionId,
        responseTimeoutMs,
        baselineBubbleCount,
        services.signal,
      );

      return {
        status: "success",
        values: {
          result: generatedText,
          parts: [generatedText],
        },
      };
    }
  } catch (error) {
    return failure(
      error?.code || "OUTPUT_VALIDATION_FAILED",
      error?.message || "Falha na execução com o Microsoft AI Playground.",
      Boolean(error?.retryable),
    );
  } finally {
    await bridge?.dispose();
    if (taskTargetId && settings.keepBrowserOpen === false) {
      try {
        await client?.send("Target.closeTarget", { targetId: taskTargetId });
      } catch {}
    }
    client?.close();
    if (settings.keepBrowserOpen === false) {
      try {
        child?.kill();
      } catch {}
    }
  }
}
