import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, join } from "node:path";

const URL_NEW = "https://gemini.google.com/app",
  HOST = "gemini.google.com",
  DEFAULT_PORT = 9644,
  MAX_PARTS = 32,
  MAX_PROMPT = 500000,
  MAX_FILES = 20,
  MAX_BYTES = 512 * 1024 * 1024;
const IMAGES = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]),
  DOCS = new Set([
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
  ]),
  SUPPORTED = new Set([...IMAGES, ...DOCS]);

function err(code, message, retryable = false) {
  const e = new Error(message);
  e.code = code;
  e.retryable = retryable;
  return e;
}
function failure(code, message, retryable = false, retryAfterMs) {
  const v = { status: "error", code, message, retryable };
  if (retryAfterMs) v.retryAfterMs = retryAfterMs;
  return v;
}
function clamp(v, d, min, max) {
  v = Number(v);
  return Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : d;
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(err("CANCELLED", "Execução cancelada."));
    const t = setTimeout(done, ms),
      a = () => {
        clearTimeout(t);
        reject(err("CANCELLED", "Execução cancelada."));
      };
    function done() {
      signal?.removeEventListener("abort", a);
      resolve();
    }
    signal?.addEventListener("abort", a, { once: true });
  });
}
function serialize(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v ?? "");
  }
}
function serializeInputs(inputs) {
  const e = Object.entries(inputs ?? {}).filter(
    ([k]) => !["attachments", "references", "images", "documents"].includes(k),
  );
  if (e.length === 1 && e[0][0] === "content") return serialize(e[0][1]);
  return e.map(([k, v]) => `${k}:\n${serialize(v)}`).join("\n\n");
}
function replace(t, k, v) {
  return String(t ?? "")
    .split(k)
    .join(String(v ?? ""));
}
function expand(template, request) {
  const c = request?.context ?? {};
  let out = String(template ?? "");
  for (const [k, v] of Object.entries({
    "{{CONTENT}}": serializeInputs(request?.inputs),
    "{{TEMA}}": serializeInputs(request?.inputs),
    "{{CHANNEL_NAME}}": c.channel?.name ?? "",
    "{{NICHE}}": c.channel?.niche ?? "",
    "{{NICHO}}": c.channel?.niche ?? "",
    "{{PROJECT_TITLE}}": c.project?.title ?? "",
    "{{PROCESS}}": c.processType ?? "",
    "{{BLOCK_INSTRUCTIONS}}":
      request?.resolvedInstruction || c.block?.instructions || c.block?.name || "",
  }))
    out = replace(out, k, v);
  for (const [k, v] of Object.entries(request?.inputs ?? {}))
    out = replace(out, `{{INPUT:${k}}}`, serialize(v));
  return out.trim();
}
function expandCap(template, repls, request) {
  let out = String(template ?? "");
  for (const [k, v] of Object.entries(repls))
    out = replace(out, k, typeof v === "string" ? v : serialize(v));
  return expand(out, request);
}
function flatten(v, o = []) {
  if (Array.isArray(v)) for (const x of v) flatten(x, o);
  else if (v && typeof v === "object") o.push(v);
  return o;
}
function summarize(i, b) {
  const t = b?.titulo_bloco || b?.titulo || b?.nome || `Bloco ${i}`,
    o = b?.objetivo || b?.objetivo_emocional || b?.descricao || "",
    p = b?.pontos_chave || b?.pontos || [];
  return [
    `Bloco ${i}: ${t}`,
    o && `Objetivo: ${o}`,
    p?.length && `Pontos: ${Array.isArray(p) ? p.join("; ") : p}`,
  ]
    .filter(Boolean)
    .join(" | ");
}
function outline(request) {
  const x = request?.inputs?.outline;
  if (Array.isArray(x) && x.length) return x.slice(0, MAX_PARTS);
  const c = request?.inputs?.content;
  return Array.isArray(c) ? flatten(c).slice(0, MAX_PARTS) : [];
}
function outlinePrompt(t, r, b, i, n, base) {
  let o = expand(t, r);
  for (const [k, v] of Object.entries({
    "{{PROMPT_BASE}}": base,
    "{{BLOCK_NUMBER}}": i + 1,
    "{{BLOCK_TOTAL}}": n,
    "{{BLOCK}}": summarize(i + 1, b),
    "{{BLOCK_JSON}}": serialize(b),
    "{{IS_FIRST}}": i === 0,
    "{{IS_LAST}}": i === n - 1,
  }))
    o = replace(o, k, v);
  return o.trim();
}
function buildParts(r) {
  const c = r?.configuration ?? {},
    base = expand(c.promptTemplate, r),
    mode = c.generationMode ?? "single",
    suffix =
      c.plainTextOnly === false
        ? ""
        : "\n\nFORMATO OBRIGATÓRIO: entregue diretamente como texto; não crie Canvas nem arquivos.";
  let parts;
  if (mode === "legacy_script_3_parts")
    parts = [
      `${base}\n\nDesenvolva os TÓPICOS 1, 2 e 3. Faça abertura e introdução, sem concluir.`,
      `Continue exatamente de onde parou e desenvolva os TÓPICOS 4, 5 e 6. Não repita.`,
      `Continue exatamente de onde parou, desenvolva os TÓPICOS 7 e 8 e finalize.`,
    ];
  else if (mode === "outline_sequence") {
    const items = outline(r);
    if (!items.length) throw err("INVALID_INPUT", "O modo outline_sequence exige uma outline.");
    parts = items.map((b, i) =>
      outlinePrompt(
        i === 0
          ? c.outlineFirstPromptTemplate
          : i === items.length - 1
            ? c.outlineLastPromptTemplate
            : c.outlineNextPromptTemplate,
        r,
        b,
        i,
        items.length,
        base,
      ),
    );
  } else if (mode === "custom_parts") {
    parts = String(c.customParts ?? "")
      .split(/^\s*---PARTE---\s*$/gim)
      .map((x) => expand(x, r))
      .filter(Boolean);
    if (!parts.length) throw err("INVALID_INPUT", "Partes personalizadas vazias.");
  } else parts = [base];
  parts = parts.map((x) => (x.trim() + suffix).trim()).filter(Boolean);
  if (parts.some((x) => x.length > MAX_PROMPT))
    throw err("INVALID_INPUT", "Uma parte ultrapassou o limite de prompt.");
  return parts;
}
function buildSearch(r) {
  const p = expandCap(
    r?.configuration?.searchPromptTemplate,
    {
      "{{QUERY}}": serialize(r?.inputs?.query),
      "{{SEARCH_CONTEXT}}": serialize(r?.inputs?.context ?? ""),
    },
    r,
  );
  if (!p) throw err("INVALID_INPUT", "Consulta vazia.");
  return p;
}
function buildChoose(r) {
  const c = r?.context?.selectedCollection;
  if (!c?.items?.length) throw err("INVALID_INPUT", "O bloco Escolher precisa de coleção.");
  return expandCap(
    r?.configuration?.selectionPromptTemplate,
    { "{{COLLECTION_ITEMS}}": c.items, "{{CONTENT}}": serializeInputs(r?.inputs) },
    r,
  );
}
function validationMode(r) {
  return ["approval", "select_one", "select_many"].includes(r?.validation?.mode)
    ? r.validation.mode
    : "approval";
}
function validationInstruction(m) {
  return m === "select_one"
    ? 'Responda somente JSON: {"selectedIndex":NUMERO_1_BASED,"feedback":"justificativa"}.'
    : m === "select_many"
      ? 'Responda somente JSON: {"selectedIndices":[NUMEROS_1_BASED],"feedback":"justificativa"}.'
      : 'Responda somente JSON: {"decision":"approved" ou "rejected","feedback":"justificativa"}.';
}
function buildValidation(r) {
  const m = validationMode(r);
  return expandCap(
    r?.configuration?.validationPromptTemplate,
    {
      "{{VALIDATION_MODE}}": m,
      "{{CRITERIA}}": serialize(r?.inputs?.criteria ?? ""),
      "{{CONTENT}}": serialize(r?.inputs?.content),
      "{{VALIDATION_OUTPUT_INSTRUCTION}}": validationInstruction(m),
    },
    r,
  );
}
function buildAnalysis(r) {
  return expandCap(
    r?.configuration?.analysisPromptTemplate,
    { "{{ANALYSIS_CONTEXT}}": serialize(r?.inputs?.context ?? "") },
    r,
  );
}
function buildMedia(r, type) {
  const token = type === "image" ? "{{IMAGE_PROMPT}}" : "{{MUSIC_PROMPT}}",
    template =
      type === "image"
        ? r?.configuration?.imagePromptTemplate
        : r?.configuration?.musicPromptTemplate,
    p = expandCap(template, { [token]: serialize(r?.inputs?.prompt) }, r);
  if (!p) throw err("INVALID_INPUT", "Briefing de mídia vazio.");
  return p;
}
function parseJson(t) {
  t = String(t ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try {
      return JSON.parse(m[0]);
    } catch {
      return {};
    }
  }
}
function parseChoice(t, r) {
  const p = parseJson(t),
    id = String(p.selectedItemId ?? t)
      .replace(/^["']|["']$/g, "")
      .trim(),
    items = r?.context?.selectedCollection?.items ?? [];
  if (!items.some((x) => x.id === id))
    throw err("OUTPUT_VALIDATION_FAILED", "O Gemini não devolveu ID permitido.", true);
  return id;
}
function parseValidation(t, r) {
  const m = validationMode(r),
    p = parseJson(t),
    feedback = String(p.feedback ?? "").trim();
  if (m === "approval") {
    const raw = String(p.decision ?? t).toLowerCase(),
      decision = /reprov|reject/.test(raw)
        ? "rejected"
        : /aprov|approve/.test(raw)
          ? "approved"
          : null;
    if (!decision) throw err("OUTPUT_VALIDATION_FAILED", "Decisão inválida.", true);
    return { decision, ...(feedback ? { feedback } : {}) };
  }
  const candidates = Array.isArray(r?.inputs?.content)
    ? r.inputs.content
    : [r?.inputs?.content].filter((x) => x != null);
  if (m === "select_one") {
    const i = Number(p.selectedIndex) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length)
      throw err("OUTPUT_VALIDATION_FAILED", "Índice inválido.", true);
    return { selected_value: candidates[i], ...(feedback ? { feedback } : {}) };
  }
  const ids = Array.isArray(p.selectedIndices) ? p.selectedIndices.map((x) => Number(x) - 1) : [];
  if (!ids.length || ids.some((i) => !Number.isInteger(i) || i < 0 || i >= candidates.length))
    throw err("OUTPUT_VALIDATION_FAILED", "Índices inválidos.", true);
  return {
    selected_values: [...new Set(ids)].map((i) => candidates[i]),
    ...(feedback ? { feedback } : {}),
  };
}
function textList(t) {
  const l = String(t ?? "")
    .split("\n")
    .map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return l.length > 1 ? l : [String(t ?? "").trim()].filter(Boolean);
}
function searchValues(text, sources, r) {
  const f = r?.outputContract ?? [];
  if (!f.length) return { result: text, sources };
  const v = {};
  for (const x of f) {
    const src = /source|fonte|url|link/i.test(`${x.key} ${x.label}`);
    v[x.key] = src
      ? x.type === "url"
        ? (sources[0] ?? URL_NEW)
        : sources
      : ["list", "multiselect"].includes(x.type)
        ? textList(text)
        : text;
  }
  return v;
}
function generationValues(result, responses, r) {
  const v = { result };
  if ((r?.outputContract ?? []).some((x) => x.key === "parts"))
    v.parts = responses.map((x) => x.text);
  return v;
}
function clean(t) {
  return String(t ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function stored(v) {
  return !!(
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof v.id === "string" &&
    typeof v.url === "string"
  );
}
function collect(v, o = []) {
  if (stored(v)) o.push(v);
  else if (Array.isArray(v)) for (const x of v) collect(x, o);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collect(x, o);
  return o;
}
function attachmentInput(r) {
  switch (r?.capabilityId) {
    case "analyze-images-in-browser":
      return r.inputs?.images;
    case "analyze-documents-in-browser":
      return r.inputs?.documents;
    case "validate-content-in-browser":
      return r.inputs?.content;
    case "generate-text-in-browser":
      return r.inputs?.attachments;
    case "generate-image-in-browser":
      return r.inputs?.references;
  }
}
async function resolveFiles(r, s) {
  const files = [...new Map(collect(attachmentInput(r)).map((x) => [x.id, x])).values()];
  if (files.length > MAX_FILES) throw err("INVALID_INPUT", `Máximo ${MAX_FILES} arquivos.`);
  if (
    ["analyze-images-in-browser", "analyze-documents-in-browser"].includes(r?.capabilityId) &&
    !files.length
  )
    throw err("INVALID_INPUT", "Nenhum arquivo autorizado.");
  const out = [];
  for (const f of files) {
    const path = await s.resolveInputFile(f),
      ext = extname(f.name || path).toLowerCase();
    if (!SUPPORTED.has(ext)) throw err("INVALID_INPUT", `Formato não suportado: ${ext}.`);
    if (r.capabilityId === "analyze-images-in-browser" && !IMAGES.has(ext))
      throw err("INVALID_INPUT", `Imagem inválida: ${f.name}.`);
    if (r.capabilityId === "analyze-documents-in-browser" && !DOCS.has(ext))
      throw err("INVALID_INPUT", `Documento inválido: ${f.name}.`);
    const st = await stat(path);
    if (!st.isFile() || st.size > MAX_BYTES)
      throw err("INVALID_INPUT", `Arquivo inválido ou grande: ${f.name}.`);
    out.push({ path, name: f.name || basename(path), size: st.size });
  }
  return out;
}

function normalizeProfile(v) {
  const n = String(v ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(n))
    throw err("INVALID_CONFIGURATION", "Perfil Gemini inválido.");
  return n;
}
function profilePath(settings, n) {
  return join(
    settings?.profilesBasePath?.trim?.() ||
      join(homedir(), ".contentflow-os", "gemini-browser-profiles"),
    n,
  );
}
function runtimeProfilePath(settings, name, services) {
  if (settings?.profilesBasePath?.trim?.()) return profilePath(settings, name);
  return services.getWorkspacePath(name);
}
function profileMarkerPath(path) {
  return join(path, ".contentflow-profile-ready.json");
}
async function profileIsPrepared(path, name) {
  try {
    const marker = JSON.parse(await readFile(profileMarkerPath(path), "utf8"));
    return marker?.provider === HOST && marker?.profile === name;
  } catch {
    return false;
  }
}
async function markProfilePrepared(path, name) {
  await writeFile(
    profileMarkerPath(path),
    JSON.stringify({ provider: HOST, profile: name, preparedAt: new Date().toISOString() }),
    "utf8",
  );
}
function profilePort(base, n) {
  if (n === "default") return base;
  let h = 2166136261;
  for (const c of n) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return base + (h % Math.min(1200, 65535 - base));
}
function assertProfile(p, allowExistingChromeProfile = false) {
  if (allowExistingChromeProfile) return;
  const n = String(p).replaceAll("\\", "/").toLowerCase();
  if (n.endsWith("/google/chrome/user data") || n.includes("/google/chrome/user data/default"))
    throw err("INVALID_CONFIGURATION", "Use perfil Chrome dedicado.");
}
async function capture(exe, args, ms = 4000) {
  return await new Promise((resolve) => {
    let c;
    try {
      c = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false });
    } catch {
      return resolve({ ok: false, stdout: "" });
    }
    let stdout = "",
      done = false;
    const end = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve({ ok, stdout });
      },
      t = setTimeout(() => {
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
async function chromeCandidates() {
  if (platform() === "win32") {
    const f = [];
    for (const k of [
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
      "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
    ]) {
      const r = await capture("reg.exe", ["query", k, "/ve"]);
      if (r.ok) f.push(regValue(r.stdout));
    }
    const w = await capture("where.exe", ["chrome.exe"]);
    if (w.ok) f.push(...w.stdout.split(/\r?\n/));
    f.push(
      process.env.PROGRAMFILES &&
        join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    );
    return [...new Set(f.filter(Boolean).map((x) => x.trim()))];
  }
  if (platform() === "darwin")
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const f = [];
  for (const n of ["google-chrome", "chromium"]) {
    const r = await capture("which", [n]);
    if (r.ok) f.push(...r.stdout.split(/\r?\n/));
  }
  return f.filter(Boolean);
}
async function version(port, ms = 1500) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), ms);
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
async function launch(settings, p, port, signal) {
  const old = await version(port);
  if (old) return { version: old, child: null };
  const exes = settings?.chromeExecutable?.trim?.()
    ? [settings.chromeExecutable.trim()]
    : await chromeCandidates();
  if (!exes.length) throw err("INVALID_CONFIGURATION", "Chrome não localizado.");
  for (const exe of exes) {
    let child;
    try {
      child = spawn(
        exe,
        [
          `--remote-debugging-port=${port}`,
          "--remote-debugging-address=127.0.0.1",
          `--user-data-dir=${p}`,
          "--no-first-run",
          "--no-default-browser-check",
          URL_NEW,
        ],
        {
          detached: settings.keepBrowserOpen === true,
          stdio: "ignore",
          windowsHide: false,
          shell: false,
        },
      );
    } catch {
      continue;
    }
    if (settings.keepBrowserOpen === true) child.unref();
    const d = Date.now() + 15000;
    while (Date.now() < d) {
      if (signal?.aborted) throw err("CANCELLED", "Cancelado.");
      const v = await version(port);
      if (v) return { version: v, child };
      await sleep(350, signal);
    }
    try {
      child.kill();
    } catch {}
  }
  throw err("PERMISSION_DENIED", "Não foi possível iniciar Chrome dedicado.");
}
class CDP {
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
      this.ws.addEventListener("error", () => rej(err("UPSTREAM_UNAVAILABLE", "Falha CDP.")), {
        once: true,
      });
      signal?.addEventListener("abort", () => rej(err("CANCELLED", "Cancelado.")), { once: true });
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
    m.error
      ? p.reject(err("UPSTREAM_UNAVAILABLE", `CDP ${p.method}: ${m.error.message}`))
      : p.resolve(m.result ?? {});
  }
  send(method, params = {}, sessionId) {
    const id = this.id++,
      payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    if (method === "Input.insertText")
      this.trace?.(
        `insert length=${String(params.text ?? "").length} sha=${createHash("sha256")
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
async function evaluate(c, s, expression) {
  const r = await c.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    s,
  );
  if (r.exceptionDetails)
    throw err(
      "OUTPUT_VALIDATION_FAILED",
      r.exceptionDetails?.exception?.description || "Erro Gemini.",
    );
  return r.result?.value;
}
function responsePhase({ hasNewResponse, generating, stablePolls }) {
  if (!hasNewResponse) return "awaiting_response";
  if (generating) return "streaming";
  if (stablePolls < 2) return "stabilizing";
  return "completed";
}
async function waitForDomMutation(c, s, waitMs, signal) {
  if (signal?.aborted) throw err("CANCELLED", "Execução cancelada.");
  const timeoutMs = clamp(waitMs, 1_000, 100, 5_000);
  try {
    await evaluate(
      c,
      s,
      `(() => new Promise(resolve => { const root=document.documentElement; if(!root){resolve('no-root');return} let settled=false; const finish=reason=>{if(settled)return;settled=true;observer.disconnect();clearTimeout(timer);resolve(reason)}; const observer=new MutationObserver(()=>finish('mutation')); observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy','aria-disabled','data-test-id']}); const timer=setTimeout(()=>finish('watchdog'),${timeoutMs}); }))()`,
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
async function replacePromptWithKeyEvents(c, s, promptText, signal) {
  for (const event of [
    { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 },
    { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 },
    { type: "keyDown", key: "Backspace", code: "Backspace" },
    { type: "keyUp", key: "Backspace", code: "Backspace" },
  ])
    await c.send("Input.dispatchKeyEvent", event, s);
  for (const character of Array.from(promptText)) {
    if (signal?.aborted) throw err("CANCELLED", "Execução cancelada.");
    await c.send(
      "Input.dispatchKeyEvent",
      { type: "char", text: character, unmodifiedText: character },
      s,
    );
  }
}
async function attach(c, signal) {
  const { targetInfos = [] } = await c.send("Target.getTargets");
  let t = targetInfos.find((x) => x.type === "page" && String(x.url).includes(HOST));
  if (!t) {
    const n = await c.send("Target.createTarget", { url: URL_NEW });
    t = { targetId: n.targetId };
  }
  const { sessionId } = await c.send("Target.attachToTarget", {
    targetId: t.targetId,
    flatten: true,
  });
  await c.send("Target.activateTarget", { targetId: t.targetId });
  await c.send("Page.enable", {}, sessionId);
  await c.send("Runtime.enable", {}, sessionId);
  return { sessionId };
}
const HELP = String.raw`function vis(e){if(!e||!(e instanceof Element))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>8&&r.height>8}function txt(e){return[e?.innerText,e?.textContent,e?.getAttribute?.('aria-label'),e?.getAttribute?.('data-test-id')].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()}function prompt(){return [...document.querySelectorAll('[contenteditable="true"][role="textbox"],[role="textbox"][aria-label*="Gemini" i],[role="textbox"][aria-label*="comando" i]')].find(vis)||null}function responses(){const sels=['.model-response-text','structured-content-container','.response-container-content','[data-test-id="model-response"]','message-content'];for(const s of sels){const n=[...document.querySelectorAll(s)].filter(vis);if(n.length)return n}return[]}function state(){const n=responses(),entries=n.map(e=>({text:(e.innerText||e.textContent||'').trim(),links:[...e.querySelectorAll('a[href]')].map(a=>({href:a.href,label:(a.innerText||a.textContent||'').trim()})).filter(x=>/^https:\/\//i.test(x.href))})).filter(x=>x.text),stop=[...document.querySelectorAll('button')].some(e=>vis(e)&&/parar|stop/i.test(txt(e)));return{texts:entries.map(x=>x.text),entries,stop,body:(document.body?.innerText||'').slice(0,6000)}}`;
async function newChat(c, s, signal) {
  await c.send("Page.navigate", { url: URL_NEW }, s);
  const d = Date.now() + 20000;
  while (Date.now() < d) {
    if (await evaluate(c, s, `(()=>{${HELP};return !!prompt()})()`)) return;
    await sleep(350, signal);
  }
}
async function waitPrompt(c, s, ms, signal) {
  const d = Date.now() + ms;
  let state = {};
  while (Date.now() < d) {
    state = await evaluate(
      c,
      s,
      `(()=>{${HELP};const body=document.body?.innerText||'';return{host:location.hostname,body,prompt:!!prompt(),login:/sign in|entrar|fazer login|use another account|usar outra conta/i.test(body)}})()`,
    );
    if (state?.host === HOST && state?.prompt && !state?.login) return;
    await sleep(700, signal);
  }
  if (/captcha|verifique/i.test(state?.body ?? ""))
    throw err("AUTHENTICATION_FAILED", "Gemini exige verificação manual.", true);
  throw err("AUTHENTICATION_FAILED", "Faça login no Gemini no Chrome dedicado.", true);
}
async function clickText(c, s, selector, regex, signal) {
  const p = await evaluate(
    c,
    s,
    `(()=>{${HELP};const matches=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(x=>vis(x)&&/${regex}/i.test(txt(x))).sort((a,b)=>txt(a).length-txt(b).length);const e=matches[0];if(!e)return null;const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  if (!p) return false;
  for (const type of ["mousePressed", "mouseReleased"])
    await c.send(
      "Input.dispatchMouseEvent",
      { type, x: p.x, y: p.y, button: "left", clickCount: 1 },
      s,
    );
  await sleep(300, signal);
  return true;
}
async function selectModel(c, s, name, signal) {
  if (!name || name === "current") return;
  const map = {
    flash_lite: "3.5 Flash Lite",
    flash: "3.6 Flash",
    pro: "3.1 Pro",
    complex: "Raciocínio complexo",
  };
  // A interface do Gemini muda com frequência e algumas contas exibem o
  // modelo ativo sem um seletor acessível. Nesse caso, mantenha o modelo
  // atual da conta em vez de abortar uma geração que não depende da troca.
  if (!(await clickText(c, s, "button", "Abrir seletor de modo|Open mode selector", signal)))
    return;
  if (!(await clickText(c, s, "[role=menuitem],[role=option]", map[name] || map.pro, signal)))
    throw err("PERMISSION_DENIED", `Modelo ${name} indisponível nesta conta.`);
}
async function selectTool(c, s, type, signal) {
  if (!type) return;
  if (
    !(await clickText(c, s, "button", "Envio (?:e|&) ferramentas|Upload (?:and|&) tools", signal))
  )
    throw err("OUTPUT_VALIDATION_FAILED", "Menu de ferramentas não encontrado.", true);
  const label = type === "image" ? "Criar imagem|Create image" : "Criar música|Create music";
  if (!(await clickText(c, s, "[role=menu] *", label, signal)))
    throw err("PERMISSION_DENIED", `Ferramenta ${type} indisponível.`);
}
async function pasteImageFromClipboard(c, s, file, signal) {
  if (platform() !== "win32") return false;
  const attachmentState = `(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'};const images=[...document.querySelectorAll('img')].filter(visible).filter(e=>/blob:|data:image/i.test(e.currentSrc||e.src||''));const controls=[...document.querySelectorAll('[data-test-id*="attachment" i],[class*="attachment" i],[aria-label*="remove" i]')].filter(visible);return images.length+controls.length})()`;
  const baseline = await evaluate(c, s, attachmentState);
  const escapedPath = file.path.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;$image=[System.Drawing.Image]::FromFile('${escapedPath}');try{[System.Windows.Forms.Clipboard]::SetImage($image)}finally{$image.Dispose()}`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, shell: false },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr || `PowerShell encerrou com código ${code}.`)),
    );
    signal?.addEventListener("abort", () => child.kill(), { once: true });
  });
  const point = await evaluate(
    c,
    s,
    `(()=>{${HELP};const e=prompt();if(!e)return null;e.focus();const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  if (!point) return false;
  for (const type of ["mousePressed", "mouseReleased"])
    await c.send(
      "Input.dispatchMouseEvent",
      { type, x: point.x, y: point.y, button: "left", clickCount: 1 },
      s,
    );
  await c.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
      commands: ["Paste"],
    },
    s,
  );
  await c.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
    },
    s,
  );
  const pasteDeadline = Date.now() + 10000;
  while (Date.now() < pasteDeadline) {
    if ((await evaluate(c, s, attachmentState)) > baseline) return true;
    await sleep(250, signal);
  }
  return false;
}
async function attachFiles(c, s, files, signal) {
  if (!files.length) return;
  if (
    !(await clickText(c, s, "button", "Envio (?:e|&) ferramentas|Upload (?:and|&) tools", signal))
  )
    throw err("OUTPUT_VALIDATION_FAILED", "Menu de upload não encontrado.", true);
  // Abrir o menu já materializa os inputs ocultos de arquivo. Clicar em
  // "Upload files" abre o seletor nativo e pode desmontar esses inputs antes
  // que o CDP os preencha, então selecionamos diretamente o input adequado.
  const onlyImages = files.every((file) => IMAGES.has(extname(file.name).toLowerCase()));
  const inputSelector = onlyImages ? 'input[type="file"][accept*="image"]' : 'input[type="file"]';
  const inputDeadline = Date.now() + 5000;
  while (Date.now() < inputDeadline) {
    if (await evaluate(c, s, `document.querySelectorAll(${JSON.stringify(inputSelector)}).length`))
      break;
    await sleep(200, signal);
  }
  await c.send("DOM.enable", {}, s);
  // O input fica dentro da árvore dinâmica do Angular. Runtime.evaluate o
  // encontra de forma confiável mesmo quando DOM.querySelectorAll do CDP não
  // enxerga o nó a partir do documento raso.
  const target = await c.send(
    "Runtime.evaluate",
    {
      expression: `document.querySelector(${JSON.stringify(inputSelector)})`,
      returnByValue: false,
    },
    s,
  );
  const objectId = target?.result?.objectId;
  if (
    !objectId &&
    onlyImages &&
    files.length === 1 &&
    (await pasteImageFromClipboard(c, s, files[0], signal))
  )
    return;
  if (!objectId) throw err("OUTPUT_VALIDATION_FAILED", "Input de upload não encontrado.", true);
  const { nodeId } = await c.send("DOM.requestNode", { objectId }, s);
  if (
    !nodeId &&
    onlyImages &&
    files.length === 1 &&
    (await pasteImageFromClipboard(c, s, files[0], signal))
  )
    return;
  if (!nodeId)
    throw err("OUTPUT_VALIDATION_FAILED", "Input de upload não pôde ser resolvido.", true);
  await c.send("DOM.setFileInputFiles", { files: files.map((x) => x.path), nodeId }, s);
  const names = files.map((x) => x.name.toLowerCase()),
    d = Date.now() + 120000;
  while (Date.now() < d) {
    const body = await evaluate(c, s, "(document.body?.innerText||'').toLowerCase()");
    if (names.every((n) => body.includes(n))) return;
    await sleep(500, signal);
  }
  throw err("TIMEOUT", "Upload não concluiu.", true);
}
async function setPrompt(c, s, text, settings, signal) {
  const p = await evaluate(
    c,
    s,
    `(()=>{${HELP};const e=prompt();if(!e)return null;e.focus();const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  if (!p) throw err("OUTPUT_VALIDATION_FAILED", "Prompt não encontrado.", true);
  for (const type of ["mousePressed", "mouseReleased"])
    await c.send(
      "Input.dispatchMouseEvent",
      { type, x: p.x, y: p.y, button: "left", clickCount: 1 },
      s,
    );
  await c.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 },
    s,
  );
  await c.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 },
    s,
  );
  await c.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Backspace", code: "Backspace" },
    s,
  );
  const size = clamp(settings.typingChunkSize, 10, 1, 50),
    delay = clamp(settings.typingDelayMs, 10, 0, 200),
    chars = Array.from(text);
  for (let i = 0; i < chars.length; i += size) {
    await c.send("Input.insertText", { text: chars.slice(i, i + size).join("") }, s);
    if (delay) await sleep(delay, signal);
  }
  await sleep(250, signal);
  let readback = await evaluate(
    c,
    s,
    `(()=>{${HELP};const e=prompt();return e?.value||e?.innerText||e?.textContent||''})()`,
  );
  if (normalizeEditorText(readback) !== normalizeEditorText(text)) {
    await replacePromptWithKeyEvents(c, s, text, signal);
    await sleep(250, signal);
    readback = await evaluate(
      c,
      s,
      `(()=>{${HELP};const e=prompt();return e?.value||e?.innerText||e?.textContent||''})()`,
    );
  }
  if (normalizeEditorText(readback) !== normalizeEditorText(text))
    throw err(
      "OUTPUT_VALIDATION_FAILED",
      "O Gemini não confirmou o prompt completo após as estratégias de entrada.",
      true,
    );
}
async function send(c, s, signal) {
  const clicked = await evaluate(
    c,
    s,
    `(()=>{${HELP};const e=[...document.querySelectorAll('button')].filter(x=>vis(x)&&!x.disabled&&x.getAttribute('aria-disabled')!=='true'&&/Enviar mensagem|Send message|Enviar|Send/i.test(txt(x))).sort((a,b)=>txt(a).length-txt(b).length)[0];if(!e)return false;e.click();return true})()`,
  );
  if (
    !clicked &&
    !(await clickText(c, s, "button", "Enviar mensagem|Send message|Enviar|Send", signal))
  )
    throw err("OUTPUT_VALIDATION_FAILED", "Botão Enviar não disponível.", true);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw err("CANCELLED", "Execução cancelada.");
    if (
      await evaluate(
        c,
        s,
        `(()=>{${HELP};const e=prompt();return !(e?.innerText||e?.textContent||'').trim()})()`,
      )
    )
      return;
    await sleep(150, signal);
  }
  throw err("OUTPUT_VALIDATION_FAILED", "O Gemini não confirmou o envio do prompt.", true);
}
async function responseState(c, s) {
  return await evaluate(c, s, `(()=>{${HELP};return state()})()`);
}
async function textTurn(c, s, promptText, settings, signal) {
  const before = await responseState(c, s),
    base = before.texts?.length ?? 0;
  await setPrompt(c, s, promptText, settings, signal);
  await send(c, s, signal);
  const d = Date.now() + clamp(settings.responseTimeoutSeconds, 600, 30, 3600) * 1000;
  let last = "",
    stable = 0;
  while (Date.now() < d) {
    const st = await responseState(c, s),
      text = st.texts?.length > base ? st.texts.at(-1) : "";
    stable = text && text === last ? stable + 1 : 0;
    last = text;
    const phase = responsePhase({
      hasNewResponse: Boolean(text),
      generating: Boolean(st.stop),
      stablePolls: stable,
    });
    if (phase === "completed") return { text, links: st.entries?.at(-1)?.links ?? [] };
    if (/limite|rate limit|upgrade/i.test(st.body))
      throw err("RATE_LIMIT", "Gemini informou limite de uso.", true);
    await waitForDomMutation(c, s, 1_000, signal);
  }
  throw err("TIMEOUT", "Gemini não concluiu resposta.", true);
}
async function mediaTurn(c, s, promptText, settings, signal, type) {
  const selector = type === "image" ? "img" : "audio,video",
    base = await evaluate(c, s, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
  await setPrompt(c, s, promptText, settings, signal);
  await send(c, s, signal);
  const d = Date.now() + clamp(settings.responseTimeoutSeconds, 600, 30, 3600) * 1000;
  while (Date.now() < d) {
    const st = await evaluate(
      c,
      s,
      `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>${type === "image" ? "e.complete&&e.naturalWidth>=256&&e.naturalHeight>=256&&!/profile|avatar|logo/i.test(e.alt||'')" : "(e.currentSrc||e.src||e.querySelector?.('source')?.src)"});const e=els.at(-1);return{count:els.length,src:e?.currentSrc||e?.src||e?.querySelector?.('source')?.src||'',label:e?.alt||'Mídia gerada'}})()`,
    );
    if (st.count > base && st.src) return { text: st.label, links: [] };
    await sleep(1200, signal);
  }
  throw err("TIMEOUT", `Gemini não concluiu ${type}.`, true);
}
async function captureMedia(c, s, services, request, type) {
  const selector = type === "image" ? "img" : "audio,video";
  const data = await evaluate(
    c,
    s,
    `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>${type === "image" ? "e.complete&&e.naturalWidth>=256&&e.naturalHeight>=256&&!/profile|avatar|logo/i.test(e.alt||'')" : "(e.currentSrc||e.src||e.querySelector?.('source')?.src)"});const e=els.at(-1);return e?{src:e.currentSrc||e.src||e.querySelector?.('source')?.src||'',label:e.alt||'Mídia gerada'}:null})()`,
  );
  if (!data?.src) throw err("OUTPUT_VALIDATION_FAILED", "Mídia não encontrada.", true);
  const payload = await evaluate(
    c,
    s,
    `(async()=>{const r=await fetch(${JSON.stringify(data.src)},{credentials:'include'});if(!r.ok)throw new Error('HTTP '+r.status);const b=new Uint8Array(await r.arrayBuffer());let x='';for(let i=0;i<b.length;i+=32768)x+=String.fromCharCode(...b.subarray(i,i+32768));return{base64:btoa(x),mime:(r.headers.get('content-type')||${JSON.stringify(type === "image" ? "image/png" : "audio/mp4")}).split(';')[0]}})()`,
  );
  const bytes = Buffer.from(payload.base64, "base64");
  if (!bytes.length || bytes.length > 100 * 1024 * 1024)
    throw err("OUTPUT_VALIDATION_FAILED", "Mídia vazia ou grande.", true);
  const normalizedMime =
    type === "audio" && payload.mime === "video/mp4" ? "audio/mp4" : payload.mime;
  const ext =
      type === "audio" && /mp4/.test(normalizedMime)
        ? "m4a"
        : normalizedMime.includes("webp")
          ? "webp"
          : normalizedMime.includes("jpeg")
            ? "jpg"
            : normalizedMime.includes("wav")
              ? "wav"
              : normalizedMime.includes("ogg")
                ? "ogg"
                : normalizedMime.includes("audio")
                  ? "mp3"
                  : "png",
    id = `gemini-${type}-${createHash("sha256")
      .update(`${request.executionId || "e"}:${request.blockId || "b"}:${request.attempt || 1}`)
      .digest("hex")
      .slice(0, 16)}`,
    name = `${id}.${ext}`;
  await writeFile(services.getOutputPath(name), bytes);
  const file = { id, name, mimeType: normalizedMime, size: bytes.length, url: `artifact://${id}` },
    artifact = {
      id,
      name,
      mimeType: normalizedMime,
      size: bytes.length,
      source: { kind: "path", path: name },
    };
  return { file, artifact };
}

async function configureProfile(request, services) {
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

  let client, child;
  try {
    const launched = await launch(
      { ...settings, keepBrowserOpen: false },
      path,
      port,
      services.signal,
    );
    child = launched.child;
    client = await new CDP(launched.version.webSocketDebuggerUrl).connect(services.signal);
    const { sessionId } = await attach(client, services.signal);
    await newChat(client, sessionId, services.signal);
    await waitPrompt(
      client,
      sessionId,
      clamp(settings.interactiveWaitSeconds, 600, 30, 900) * 1000,
      services.signal,
    );
    await markProfilePrepared(path, name);
    return {
      status: "success",
      values: { ready: true, message: `Perfil ${name} validado no Gemini.` },
    };
  } catch (error) {
    return failure(
      error?.code || "AUTHENTICATION_FAILED",
      error?.message || "Não foi possível validar o login do Gemini.",
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
    id = String(request?.capabilityId ?? "generate-text-in-browser"),
    mock = String(settings.diagnosticMockResponse ?? "").trim();
  if (mock) {
    try {
      if (id === "choose-library-item-in-browser")
        return { status: "success", values: { result: parseChoice(mock, request) } };
      if (id === "validate-content-in-browser")
        return { status: "success", values: parseValidation(mock, request) };
      if (id === "search-web-in-browser")
        return { status: "success", values: searchValues(mock, [], request) };
      if (id.startsWith("generate-") && id !== "generate-text-in-browser")
        return failure("INVALID_CONFIGURATION", "Mídia exige teste real.");
      return { status: "success", values: generationValues(mock, [{ text: mock }], request) };
    } catch (e) {
      return failure(e.code || "OUTPUT_VALIDATION_FAILED", e.message);
    }
  }
  let parts,
    media = null;
  try {
    if (id === "generate-text-in-browser") parts = buildParts(request);
    else if (id === "search-web-in-browser") parts = [buildSearch(request)];
    else if (id === "choose-library-item-in-browser") parts = [buildChoose(request)];
    else if (id === "validate-content-in-browser") parts = [buildValidation(request)];
    else if (["analyze-images-in-browser", "analyze-documents-in-browser"].includes(id))
      parts = [buildAnalysis(request)];
    else if (id === "generate-image-in-browser") {
      parts = [buildMedia(request, "image")];
      media = "image";
    } else if (id === "generate-music-in-browser") {
      parts = [buildMedia(request, "music")];
      media = "audio";
    } else throw err("INVALID_CONFIGURATION", `Capability desconhecida: ${id}`);
  } catch (e) {
    return failure(e.code || "INVALID_CONFIGURATION", e.message);
  }
  let client, child;
  try {
    const cfg = request.configuration ?? {},
      profile = normalizeProfile(cfg.accountProfile),
      path = runtimeProfilePath(settings, profile, services),
      port = profilePort(clamp(settings.remoteDebuggingPort, DEFAULT_PORT, 1024, 64000), profile),
      files = await resolveFiles(request, services);
    assertProfile(path, settings.allowExistingChromeProfile === true);
    if (!(await profileIsPrepared(path, profile))) {
      throw err(
        "AUTHENTICATION_FAILED",
        `O perfil ${profile} ainda não foi salvo. Abra a configuração do Método e use Salvar perfil antes de executar.`,
      );
    }
    const launched = await launch(settings, path, port, services.signal);
    child = launched.child;
    client = await new CDP(
      launched.version.webSocketDebuggerUrl,
      settings.diagnosticTrace ? (m) => process.stderr.write(`[Gemini Browser] ${m}\n`) : null,
    ).connect(services.signal);
    const { sessionId } = await attach(client, services.signal);
    await newChat(client, sessionId, services.signal);
    await waitPrompt(
      client,
      sessionId,
      clamp(settings.interactiveWaitSeconds, 600, 30, 900) * 1000,
      services.signal,
    );
    await selectModel(client, sessionId, cfg.modelPreference, services.signal);
    if (files.length) await attachFiles(client, sessionId, files, services.signal);
    if (media)
      await selectTool(client, sessionId, media === "image" ? "image" : "music", services.signal);
    const responses = [],
      retries = clamp(cfg.retryAttempts, 1, 0, 3);
    for (let i = 0; i < parts.length; i++) {
      let last;
      for (let a = 0; a <= retries; a++) {
        try {
          responses.push(
            media
              ? await mediaTurn(client, sessionId, parts[i], settings, services.signal, media)
              : await textTurn(client, sessionId, parts[i], settings, services.signal),
          );
          last = null;
          break;
        } catch (e) {
          last = e;
          if (!e.retryable || a === retries) break;
          await sleep(2000 * (a + 1), services.signal);
        }
      }
      if (last) throw last;
      if (i < parts.length - 1)
        await sleep(clamp(cfg.delayBetweenPartsMs, 2000, 0, 30000), services.signal);
    }
    const combined = responses.map((x) => x.text).join("\n\n");
    if (media) {
      const captured = await captureMedia(client, sessionId, services, request, media);
      return {
        status: "success",
        values: { [media === "image" ? "image" : "audio"]: captured.file, description: combined },
        artifacts: [captured.artifact],
        usage: {
          provider: media === "image" ? "Google / Gemini Images" : "Google / Gemini Music",
          outputUnits: captured.file.size,
          unit: "bytes",
        },
      };
    }
    const sources = [...new Set(responses.flatMap((x) => x.links ?? []).map((x) => x.href))].slice(
      0,
      clamp(cfg.maxSources, 10, 1, 30),
    );
    let values;
    if (id === "search-web-in-browser") values = searchValues(combined, sources, request);
    else if (id === "choose-library-item-in-browser")
      values = { result: parseChoice(combined, request) };
    else if (id === "validate-content-in-browser") values = parseValidation(combined, request);
    else {
      const result = cfg.cleanOutput === false ? combined.trim() : clean(combined),
        min = clamp(cfg.minCharacters, 1, 1, 1000000);
      if (result.length < min)
        throw err("OUTPUT_VALIDATION_FAILED", `Resultado abaixo de ${min} caracteres.`, true);
      values = generationValues(result, responses, request);
    }
    return {
      status: "success",
      values,
      usage: { provider: "Google / Gemini web", outputUnits: combined.length, unit: "characters" },
    };
  } catch (e) {
    if (services.signal?.aborted || e.code === "CANCELLED")
      return failure("CANCELLED", "Execução cancelada.");
    return failure(e.code || "UPSTREAM_UNAVAILABLE", e.message || "Falha Gemini.", !!e.retryable);
  } finally {
    if (settings.keepBrowserOpen !== true)
      try {
        await client?.send("Browser.close");
      } catch {}
    client?.close();
    if (settings.keepBrowserOpen !== true && child)
      try {
        child.kill();
      } catch {}
  }
}

export const __test = {
  buildParts,
  buildSearch,
  buildChoose,
  buildValidation,
  buildAnalysis,
  buildMedia,
  clean,
  collect,
  expand,
  generationValues,
  normalizeProfile,
  outline,
  parseChoice,
  parseValidation,
  profileIsPrepared,
  markProfilePrepared,
  profilePath,
  runtimeProfilePath,
  profilePort,
  searchValues,
  summarize,
  responsePhase,
};
