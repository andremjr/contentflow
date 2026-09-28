import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionSource = join(root, "ecosystem", "browser-bridge");
const fixturePath = join(root, "tests", "fixtures", "browser-bridge-v51", "index.html");

function chromeCandidates() {
  const local = process.env.LOCALAPPDATA || "";
  const program = process.env.ProgramFiles || "C:\\Program Files";
  const programX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    process.env.CONTENTFLOW_CHROME_PATH,
    join(program, "Google", "Chrome", "Application", "chrome.exe"),
    join(programX86, "Google", "Chrome", "Application", "chrome.exe"),
    join(local, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
}

async function findChrome() {
  const { access } = await import("node:fs/promises");
  if (process.env.CONTENTFLOW_CHROME_PATH) {
    await access(process.env.CONTENTFLOW_CHROME_PATH);
    return process.env.CONTENTFLOW_CHROME_PATH;
  }
  try {
    const { chromium } = await import("@playwright/test");
    const playwrightChrome = chromium.executablePath();
    await access(playwrightChrome);
    return playwrightChrome;
  } catch {
    // Continua para instalações locais conhecidas.
  }
  for (const candidate of chromeCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Tenta o próximo caminho conhecido.
    }
  }
  throw new Error(
    "Google Chrome não encontrado. Defina CONTENTFLOW_CHROME_PATH para executar o harness real da Browser Bridge.",
  );
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address()));
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(timeoutMs),
  ]);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
    });
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolveSend, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }

  close() {
    this.socket.close();
  }
}

async function connectBrowser(port) {
  const deadline = Date.now() + 15_000;
  let version;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch {
      // Chrome ainda está iniciando.
    }
    await delay(150);
  }
  if (!version?.webSocketDebuggerUrl) throw new Error("Chrome não abriu a porta CDP do harness.");
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return { client: new CdpClient(socket), version };
}

async function waitForTarget(client, predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await client.send("Target.getTargets");
    const target = targetInfos.find(predicate);
    if (target) return target;
    await delay(100);
  }
  throw new Error("Target esperado não apareceu no Chrome real.");
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "Runtime.evaluate falhou.");
  }
  return result.result?.value;
}

async function attach(client, targetId) {
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

async function waitForBridgeWorker(client, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await client.send("Target.getTargets");
    const candidates = targetInfos.filter(
      (target) =>
        target.type === "service_worker" &&
        /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(target.url || "")),
    );
    for (const candidate of candidates) {
      const sessionId = await attach(client, candidate.targetId);
      try {
        const identity = await evaluate(
          client,
          sessionId,
          "globalThis.contentFlowBridge?.identity",
        );
        if (
          identity?.bridgeId === "com.contentflow.browser-bridge" &&
          identity?.protocolVersion === 2
        ) {
          return { worker: candidate, sessionId, identity };
        }
      } catch {
        // Outro service worker da sessão; continua procurando a ponte.
      }
      await client.send("Target.detachFromTarget", { sessionId }).catch(() => undefined);
    }
    await delay(100);
  }
  throw new Error("A extensão real não expôs a identidade esperada da Browser Bridge.");
}

async function prepareExtension(extensionPath, fixtureOrigin) {
  await cp(extensionSource, extensionPath, { recursive: true });
  const manifestPath = join(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const fixture = new URL(fixtureOrigin);
  const localPattern = `${fixture.protocol}//${fixture.hostname}/*`;
  manifest.host_permissions = [...manifest.host_permissions, localPattern];
  manifest.content_scripts = [
    ...manifest.content_scripts,
    {
      matches: [localPattern],
      js: ["content-script.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const workerPath = join(extensionPath, "service-worker.js");
  const worker = await readFile(workerPath, "utf8");
  const adapted = worker.replace(
    '["https://chatgpt.com"],\r\n    ["https://chatgpt.com/*"]',
    `[${JSON.stringify(fixtureOrigin)}],\r\n    [${JSON.stringify(localPattern)}]`,
  );
  if (adapted === worker) throw new Error("Não foi possível adaptar a policy da fixture 5.1.");
  await writeFile(workerPath, adapted);
}

function command({ sessionToken, fixtureUrl, text, ordinal }) {
  const now = Date.now();
  return {
    pluginId: "local.contentflow.chatgpt-browser-studio",
    protocolVersion: 2,
    profileId: "v51-real-chrome-profile",
    sessionToken,
    executionKey: "v51-real-chrome-execution",
    commandId: createHash("sha256").update(`v51-command:${ordinal}`).digest("hex"),
    issuedAt: now,
    expiresAt: now + 20_000,
    expectedUrl: fixtureUrl,
    action: "setText",
    payload: { selectors: ["#prompt"], text },
  };
}

function conditionCommand({ sessionToken, fixtureUrl, ordinal }) {
  const now = Date.now();
  return {
    pluginId: "local.contentflow.chatgpt-browser-studio",
    protocolVersion: 2,
    profileId: "v51-real-chrome-profile",
    sessionToken,
    executionKey: "v54-real-chrome-condition",
    commandId: createHash("sha256").update(`v54-condition:${ordinal}`).digest("hex"),
    issuedAt: now,
    expiresAt: now + 10_000,
    expectedUrl: fixtureUrl,
    action: "observeCondition",
    payload: {
      selectors: ["#condition-target"],
      state: "visible",
      timeoutMs: 5000,
      debounceMs: 100,
    },
  };
}

async function run() {
  const chrome = await findChrome();
  const fixtureHtml = await readFile(fixturePath);
  const server = createServer((request, response) => {
    if (request.url === "/fixture") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fixtureHtml);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  const address = await listen(server);
  const fixtureOrigin = `http://127.0.0.1:${address.port}`;
  const fixtureUrl = `${fixtureOrigin}/fixture`;

  const temp = await mkdtemp(join(tmpdir(), "contentflow-browser-bridge-v51-"));
  const profilePath = join(temp, "profile");
  const extensionPath = join(temp, "extension");
  await prepareExtension(extensionPath, fixtureOrigin);
  const debugPort = 21000 + Math.floor(Math.random() * 10000);
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${debugPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profilePath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--start-minimized",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      fixtureUrl,
    ],
    { shell: false, stdio: "ignore", windowsHide: true },
  );

  let client;
  try {
    const connected = await connectBrowser(debugPort);
    client = connected.client;
    const page = await waitForTarget(
      client,
      (target) => target.type === "page" && target.url === fixtureUrl,
    );
    const bridgeWorker = await waitForBridgeWorker(client);
    const worker = bridgeWorker.worker;
    const { windowId, bounds } = await client.send("Browser.getWindowForTarget", {
      targetId: page.targetId,
    });
    if (bounds?.windowState !== "minimized") {
      await client.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "minimized" },
      });
    }
    const minimizedBounds = await client.send("Browser.getWindowForTarget", {
      targetId: page.targetId,
    });
    const ranWhileMinimized = minimizedBounds.bounds?.windowState === "minimized";
    if (!ranWhileMinimized) {
      throw new Error("O Chrome não permaneceu minimizado antes do comando real.");
    }

    let workerSession = bridgeWorker.sessionId;
    const sessionToken = randomUUID();
    const handshake = await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.connect(${JSON.stringify({
        pluginId: "local.contentflow.chatgpt-browser-studio",
        protocolVersion: 2,
        profileId: "v51-real-chrome-profile",
        sessionToken,
      })})`,
    );
    if (!handshake?.ok) throw new Error(`Handshake recusado: ${JSON.stringify(handshake)}`);

    const observed = await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.dispatch(${JSON.stringify(
        conditionCommand({
          sessionToken,
          fixtureUrl,
          ordinal: 1,
        }),
      )})`,
    );
    if (!observed?.ok || observed.state !== "visible") {
      throw new Error(`Observação real de condição falhou: ${JSON.stringify(observed)}`);
    }

    const firstCommand = command({
      sessionToken,
      fixtureUrl,
      text: "chrome-real-minimizado",
      ordinal: 1,
    });
    const first = await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.dispatch(${JSON.stringify(firstCommand)})`,
    );
    if (!first?.ok) throw new Error(`Comando real recusado: ${JSON.stringify(first)}`);
    await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.disconnect(${JSON.stringify({
        pluginId: firstCommand.pluginId,
        protocolVersion: 2,
        profileId: firstCommand.profileId,
        sessionToken,
      })})`,
    );
    await client.send("Target.detachFromTarget", { sessionId: workerSession });

    const pageSession = await attach(client, page.targetId);
    const value = await evaluate(client, pageSession, "document.querySelector('#prompt')?.value");
    if (value !== "chrome-real-minimizado") {
      throw new Error(
        `O comando não alterou a fixture real; valor recebido: ${JSON.stringify(value)}`,
      );
    }
    await client.send("Target.detachFromTarget", { sessionId: pageSession });

    const stopped = await client.send("Target.closeTarget", { targetId: worker.targetId });
    if (stopped.success !== true) throw new Error("Chrome recusou a suspensão do service worker.");
    const stoppedDeadline = Date.now() + 5_000;
    while (Date.now() < stoppedDeadline) {
      const { targetInfos = [] } = await client.send("Target.getTargets");
      if (!targetInfos.some((target) => target.targetId === worker.targetId)) break;
      await delay(100);
    }

    const wakePageSession = await attach(client, page.targetId);
    await client.send("Page.reload", { ignoreCache: true }, wakePageSession);
    await delay(300);
    await client.send("Target.detachFromTarget", { sessionId: wakePageSession });
    const resumedWorker = await waitForTarget(
      client,
      (target) =>
        target.type === "service_worker" &&
        /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(target.url || "")),
    );
    workerSession = await attach(client, resumedWorker.targetId);
    const resumedToken = randomUUID();
    const resumedHandshake = await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.connect(${JSON.stringify({
        pluginId: "local.contentflow.chatgpt-browser-studio",
        protocolVersion: 2,
        profileId: "v51-real-chrome-profile",
        sessionToken: resumedToken,
      })})`,
    );
    if (!resumedHandshake?.ok) throw new Error("Handshake falhou após suspend/resume do worker.");
    const resumed = await evaluate(
      client,
      workerSession,
      `globalThis.contentFlowBridge.dispatch(${JSON.stringify(
        command({
          sessionToken: resumedToken,
          fixtureUrl,
          text: "worker-retomado",
          ordinal: 2,
        }),
      )})`,
    );
    if (!resumed?.ok) throw new Error(`Comando após resume falhou: ${JSON.stringify(resumed)}`);

    console.log(
      JSON.stringify({
        ok: true,
        browser: connected.version.Browser,
        extensionVersion: bridgeWorker.identity.extensionVersion,
        fixture: fixtureUrl,
        minimized: ranWhileMinimized,
        handshake: true,
        command: first.ok,
        conditionObserver: observed.ok,
        workerSuspendResume: resumed.ok,
        workerTargetRecreated: resumedWorker.targetId !== worker.targetId,
      }),
    );
    await client.send("Browser.close").catch(() => undefined);
  } finally {
    try {
      client?.close();
    } catch {
      // Chrome pode já ter fechado.
    }
    await waitForChildExit(child, 3_000);
    if (child.exitCode === null) {
      child.kill();
      await waitForChildExit(child, 2_000);
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

await run();
