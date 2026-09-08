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
        const needsLogin = /sign in|entrar|fazer login|login|welcome to the playground.*18 years old/i.test(body) && !composer;
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
      "É necessário fazer login com conta Microsoft no Playground. Utilize o botão 'Salvar perfil' no Método para autenticar uma vez no Chrome dedicado.",
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
  try {
    // Tenta abrir o seletor de voz caso esteja presente na interface
    await bridge.dispatch(
      "click",
      {
        selectors: [
          'button[aria-label*="voice" i]',
          'button[aria-label*="style" i]',
          'button[title*="voice" i]',
          'button[data-telemetry-action="voice_picker"]',
        ],
      },
      "open-voice-picker",
      5000,
    );
    if (voice) {
      await bridge.dispatch(
        "click",
        {
          selectors: ['[role="option"]', '[role="button"]', "button"],
          textIncludes: [voice],
        },
        `select-voice-${voice}`,
        5000,
      );
    }
    if (style && style !== "neutral") {
      await bridge.dispatch(
        "click",
        {
          selectors: ['[role="option"]', '[role="button"]', "button"],
          textIncludes: [style],
        },
        `select-style-${style}`,
        5000,
      );
    }
  } catch {
    // Se a interface não exibir o seletor modal neste momento, o Playground usará a voz selecionada na URL ou default
  }
}

export async function sendPrompt(client, sessionId, bridge, text, signal) {
  // Preenche via bridge com os seletores usuais de textarea/composer
  await bridge.dispatch(
    "setText",
    {
      selectors: ["textarea", '[contenteditable="true"][role="textbox"]', '[role="textbox"]'],
      text,
    },
    "set-prompt",
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
      "click-send",
      5000,
    );
    sent = true;
  } catch {
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

export async function waitForAudioGeneration(
  client,
  sessionId,
  timeoutMs,
  baselineAudioCount,
  signal,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");

    const state = await evaluate(
      client,
      sessionId,
      `(() => {
        ${DOM_HELPERS}
        const audios = [...document.querySelectorAll('audio')].filter(a => a.src || a.currentSrc || a.querySelector('source'));
        const downloadBtns = [...document.querySelectorAll('button[aria-label*="download audio" i], button[title*="download audio" i]')];
        const isGenerating = [...document.querySelectorAll('button')].some(b => vis(b) && /stop generation|parar/i.test(txt(b))) ||
                             /generating audio|transcribing|thinking/i.test(document.body?.innerText || '');
        return {
          audioCount: audios.length,
          downloadCount: downloadBtns.length,
          isGenerating,
          latestSrc: audios.at(-1)?.currentSrc || audios.at(-1)?.src || audios.at(-1)?.querySelector('source')?.src || ''
        };
      })()`,
    );

    if (state.audioCount > baselineAudioCount && state.latestSrc && !state.isGenerating) {
      return state.latestSrc;
    }
    if (state.downloadCount > 0 && !state.isGenerating) {
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

export async function captureAudioArtifact(client, sessionId, services, request, audioSrc) {
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
        startMinimized: settings.startMinimized !== false,
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

    const taskPage = await attachPage(client, services.signal, targetUrl, false, launched.reused);
    const { sessionId } = taskPage;
    taskTargetId = taskPage.targetId;

    // Garante que está na URL do modelo desejado
    const currentUrl = await evaluate(client, sessionId, "location.href");
    if (!currentUrl.includes(`model=${model}`)) {
      await client.send("Page.navigate", { url: targetUrl }, sessionId);
      await sleep(1500, services.signal);
    }

    const waitTimeoutMs = clamp(settings.interactiveWaitSeconds, 600, 30, 900) * 1000;
    await waitForComposer(client, sessionId, waitTimeoutMs, services.signal);
    await dismissBanners(client, sessionId);

    bridge = await attachContentFlowBridge({
      client,
      pageSessionId: sessionId,
      pluginId: PLUGIN_ID,
      profileId: profile,
      request,
      signal: services.signal,
      allowedOrigins: ALLOWED_ORIGINS,
    });

    if (capabilityId === "generate-voice-in-browser") {
      if (cfg.voice || cfg.style) {
        await selectVoiceAndStyle(bridge, cfg.voice, cfg.style);
      }

      // Conta de baseline de áudios já presentes na página
      const baselineAudioCount = await evaluate(
        client,
        sessionId,
        "document.querySelectorAll('audio').length",
      );

      await sendPrompt(client, sessionId, bridge, promptText, services.signal);

      const responseTimeoutMs = clamp(settings.responseTimeoutSeconds, 600, 30, 3600) * 1000;
      const audioSrc = await waitForAudioGeneration(
        client,
        sessionId,
        responseTimeoutMs,
        baselineAudioCount,
        services.signal,
      );

      const { file, artifact } = await captureAudioArtifact(
        client,
        sessionId,
        services,
        request,
        audioSrc,
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
    bridge?.dispose();
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
