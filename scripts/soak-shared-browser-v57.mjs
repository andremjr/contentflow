import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const PROFILE_COUNTS = [1, 3, 5];
const SHORT_JOB_COMMANDS = Number(process.env.CONTENTFLOW_V57_SHORT_COMMANDS || 12);
const LONG_JOB_COMMANDS = Number(process.env.CONTENTFLOW_V57_LONG_COMMANDS || 60);
const SAMPLE_INTERVAL_MS = Number(process.env.CONTENTFLOW_V57_SAMPLE_INTERVAL_MS || 500);
const SETTLE_MS = Number(process.env.CONTENTFLOW_V57_SETTLE_MS || 2500);
const MAX_COMMAND_CACHE = 500;
const MAX_ACTIVE_SESSIONS = 128;
const MAX_LIFECYCLE_EVENTS = 128;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeTemporaryDirectory(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
      await delay(250);
    }
  }
}

async function findChrome() {
  if (!process.env.CONTENTFLOW_CHROME_PATH) {
    try {
      const { chromium } = await import("@playwright/test");
      const executable = chromium.executablePath();
      const { access } = await import("node:fs/promises");
      await access(executable);
      return executable;
    } catch {}
  }
  const candidates = [
    process.env.CONTENTFLOW_CHROME_PATH,
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const { access } = await import("node:fs/promises");
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Chrome não encontrado para o soak 5.7.");
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

async function availablePort() {
  const server = createServer();
  const address = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function processForestMetrics(pids) {
  if (process.platform !== "win32") return undefined;
  const script = `
$rootPids=$env:CONTENTFLOW_V57_PIDS.Split(',') | ForEach-Object { [int]$_ }
$all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
$ids=New-Object System.Collections.Generic.HashSet[int]
foreach($rootPid in $rootPids){ [void]$ids.Add($rootPid) }
$changed=$true
while($changed){
  $changed=$false
  foreach($p in $all){
    if($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)){
      [void]$ids.Add([int]$p.ProcessId); $changed=$true
    }
  }
}
$procs=Get-Process -Id @($ids) -ErrorAction SilentlyContinue
@{rss=($procs | Measure-Object WorkingSet64 -Sum).Sum; cpu=($procs | Measure-Object CPU -Sum).Sum; processes=@($procs).Count} | ConvertTo-Json -Compress
`;
  const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
    env: { ...process.env, CONTENTFLOW_V57_PIDS: pids.join(",") },
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  await once(child, "exit");
  return stdout.trim() ? JSON.parse(stdout.trim()) : undefined;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
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
    } catch {}
    await delay(100);
  }
  if (!version?.webSocketDebuggerUrl) throw new Error("Chrome não abriu CDP.");
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
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
  throw new Error("Target da Browser Bridge não apareceu.");
}

async function attach(client, targetId) {
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description || "Runtime.evaluate falhou.");
  return result.result?.value;
}

async function prepareExtension(target, fixtureOrigin) {
  await cp(path.join(ROOT, "ecosystem", "browser-bridge"), target, { recursive: true });
  const manifestPath = path.join(target, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const fixture = new URL(fixtureOrigin);
  const pattern = `${fixture.protocol}//${fixture.hostname}/*`;
  manifest.host_permissions = [...manifest.host_permissions, pattern];
  manifest.content_scripts.push({
    matches: [pattern],
    js: ["content-script.js"],
    run_at: "document_idle",
    all_frames: false,
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const workerPath = path.join(target, "service-worker.js");
  const source = await readFile(workerPath, "utf8");
  const adapted = source.replace(
    '["https://chatgpt.com"],\r\n    ["https://chatgpt.com/*"]',
    `[${JSON.stringify(fixtureOrigin)}],\r\n    [${JSON.stringify(pattern)}]`,
  );
  if (adapted === source) throw new Error("Policy da fixture 5.7 não foi adaptada.");
  await writeFile(workerPath, adapted);
}

function bridgeCommand({ token, profileId, fixtureUrl, ordinal, action = "setText" }) {
  const now = Date.now();
  return {
    pluginId: "local.contentflow.chatgpt-browser-studio",
    protocolVersion: 2,
    profileId,
    sessionToken: token,
    executionKey: `v57-${profileId}`,
    commandId: createHash("sha256").update(`${profileId}:${ordinal}:${action}`).digest("hex"),
    issuedAt: now,
    expiresAt: now + 20_000,
    expectedUrl: fixtureUrl,
    action,
    payload: action === "setText" ? { selectors: ["#prompt"], text: `v57-${ordinal}` } : {},
  };
}

async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "exit");
  } else child.kill("SIGTERM");
}

async function launchProfiles({ profileCount, fixtureUrl, fixtureOrigin, temp, chrome }) {
  const instances = [];
  try {
    for (let index = 0; index < profileCount; index += 1) {
      const extensionPath = path.join(temp, `extension-${index + 1}`);
      await prepareExtension(extensionPath, fixtureOrigin);
      const port = await availablePort();
      const child = spawn(
        chrome,
        [
          `--remote-debugging-port=${port}`,
          "--remote-debugging-address=127.0.0.1",
          `--user-data-dir=${path.join(temp, `profile-${index + 1}`)}`,
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          "--headless=new",
          "--start-minimized",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
          "--no-first-run",
          "--no-default-browser-check",
          fixtureUrl,
        ],
        { stdio: "ignore", windowsHide: true },
      );
      let connected;
      try {
        connected = await connectBrowser(port);
        instances.push({ child, client: connected.client });
      } catch (error) {
        connected?.client?.close();
        await killTree(child);
        throw error;
      }
    }
  } catch (error) {
    await Promise.all(
      instances.map(async (instance) => {
        instance.client.close();
        await killTree(instance.child);
      }),
    );
    throw error;
  }
  return instances;
}

async function aggregateMetrics(instances) {
  const value = await processForestMetrics(instances.map((instance) => instance.child.pid));
  return {
    rssMiB: Number((Number(value?.rss || 0) / 1024 ** 2).toFixed(2)),
    cpuSeconds: Number(Number(value?.cpu || 0).toFixed(3)),
    processes: Number(value?.processes || 0),
  };
}

async function runChromeScenario(profileCount, commandCount, fixture) {
  const chrome = await findChrome();
  const temp = await mkdtemp(path.join(os.tmpdir(), `contentflow-v57-${profileCount}-`));
  let instances = [];
  try {
    instances = await launchProfiles({
      profileCount,
      fixtureUrl: fixture.url,
      fixtureOrigin: fixture.origin,
      temp,
      chrome,
    });
    await delay(SETTLE_MS);
    const workers = [];
    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      await waitForTarget(
        instance.client,
        (target) => target.type === "page" && target.url === fixture.url,
      );
      const worker = await waitForTarget(
        instance.client,
        (target) =>
          target.type === "service_worker" &&
          /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(target.url || "")),
      );
      const sessionId = await attach(instance.client, worker.targetId);
      const readyDeadline = Date.now() + 10_000;
      while (
        !(await evaluate(
          instance.client,
          sessionId,
          "Boolean(globalThis.contentFlowBridge?.identity)",
        ))
      ) {
        if (Date.now() >= readyDeadline)
          throw new Error(`Worker da Bridge não inicializou: ${worker.url}`);
        await delay(100);
      }
      const token = randomUUID();
      const profileId = `v57-profile-${index + 1}`;
      const handshake = await evaluate(
        instance.client,
        sessionId,
        `globalThis.contentFlowBridge.connect(${JSON.stringify({ pluginId: "local.contentflow.chatgpt-browser-studio", protocolVersion: 2, profileId, sessionToken: token })})`,
      );
      if (!handshake?.ok) throw new Error(`Handshake real recusado: ${handshake?.code}`);
      await evaluate(
        instance.client,
        sessionId,
        `chrome.tabs.create({url: ${JSON.stringify(fixture.url)}, active: false}).then(tab => tab.id)`,
      );
      const pageDeadline = Date.now() + 10_000;
      while (
        !(await evaluate(
          instance.client,
          sessionId,
          `chrome.tabs.query({}).then(tabs => tabs.some(tab => tab.url === ${JSON.stringify(fixture.url)}))`,
        ))
      ) {
        if (Date.now() >= pageDeadline) {
          const urls = await evaluate(
            instance.client,
            sessionId,
            "chrome.tabs.query({}).then(tabs => tabs.map(tab => tab.url))",
          );
          throw new Error(
            `Fixture local indisponível ao worker do perfil ${index + 1}: ${JSON.stringify(urls)}`,
          );
        }
        await delay(100);
      }
      workers.push({ instance, sessionId, token, profileId });
    }
    const samples = [await aggregateMetrics(instances)];
    const started = Date.now();
    for (let ordinal = 0; ordinal < commandCount; ordinal += 1) {
      await Promise.all(
        workers.map(async ({ instance, sessionId, token, profileId }) => {
          const result = await evaluate(
            instance.client,
            sessionId,
            `globalThis.contentFlowBridge.dispatch(${JSON.stringify(bridgeCommand({ token, profileId, fixtureUrl: fixture.url, ordinal }))})`,
          );
          if (!result?.ok) throw new Error(`Comando real recusado: ${result?.code}`);
        }),
      );
      if ((ordinal + 1) % Math.max(1, Math.floor(commandCount / 10)) === 0) {
        console.error(
          `5.7: ${profileCount} perfil(is), ${ordinal + 1}/${commandCount} comandos por perfil`,
        );
        await delay(SAMPLE_INTERVAL_MS);
        samples.push(await aggregateMetrics(instances));
      }
    }
    for (const { instance, sessionId, token, profileId } of workers) {
      const result = await evaluate(
        instance.client,
        sessionId,
        `globalThis.contentFlowBridge.disconnect(${JSON.stringify({ pluginId: "local.contentflow.chatgpt-browser-studio", protocolVersion: 2, profileId, sessionToken: token })})`,
      );
      if (!result?.ok) throw new Error(`Disconnect real recusado: ${result?.code}`);
      await instance.client.send("Target.detachFromTarget", { sessionId });
    }
    for (let sample = 0; sample < 3; sample += 1) {
      await delay(SETTLE_MS);
      samples.push(await aggregateMetrics(instances));
    }
    const first = samples[0];
    const last = samples.at(-1);
    const cpuDelta = Math.max(0, last.cpuSeconds - first.cpuSeconds);
    const elapsedSeconds = Math.max(0.001, (Date.now() - started) / 1000);
    const rssGrowthMiB = last.rssMiB - first.rssMiB;
    const rssGrowthRatio = first.rssMiB > 0 ? rssGrowthMiB / first.rssMiB : 0;
    return {
      profileCount,
      equivalentJobCommands: commandCount,
      realCommandsCompleted: commandCount * profileCount,
      samples: samples.length,
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      rssMiBStart: first.rssMiB,
      rssMiBEnd: last.rssMiB,
      rssMiBPeak: Math.max(...samples.map((sample) => sample.rssMiB)),
      rssGrowthMiB: Number(rssGrowthMiB.toFixed(2)),
      rssGrowthRatio: Number(rssGrowthRatio.toFixed(4)),
      cpuSeconds: Number(cpuDelta.toFixed(3)),
      processCountPeak: Math.max(...samples.map((sample) => sample.processes)),
    };
  } finally {
    await Promise.all(
      instances.map(async (instance) => {
        instance.client.close();
        await killTree(instance.child);
      }),
    );
    await removeTemporaryDirectory(temp);
  }
}

function createInstrumentedBridge(source, profileIndex) {
  const storage = {};
  const counters = {
    timersCreated: 0,
    timersActive: 0,
    timersPeak: 0,
    debuggerAttach: 0,
    debuggerDetach: 0,
    debuggerActive: 0,
    alarmsCreated: 0,
    storageWrites: 0,
  };
  const activeTimers = new Set();
  const wrappedSetTimeout = (callback, ms, ...args) => {
    counters.timersCreated += 1;
    counters.timersActive += 1;
    counters.timersPeak = Math.max(counters.timersPeak, counters.timersActive);
    const timer = setTimeout(
      () => {
        activeTimers.delete(timer);
        counters.timersActive -= 1;
        callback(...args);
      },
      Math.min(Number(ms) || 0, 25),
    );
    activeTimers.add(timer);
    return timer;
  };
  const wrappedClearTimeout = (timer) => {
    if (activeTimers.delete(timer)) counters.timersActive -= 1;
    clearTimeout(timer);
  };
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "v57" }),
      onMessage: { addListener() {} },
      onConnect: { addListener() {} },
    },
    storage: {
      session: {
        async get(key) {
          return typeof key === "string"
            ? { [key]: structuredClone(storage[key]) }
            : structuredClone(storage);
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
          counters.storageWrites += 1;
        },
      },
    },
    alarms: {
      create() {
        counters.alarmsCreated += 1;
      },
      onAlarm: { addListener() {} },
    },
    power: { requestKeepAwake() {}, releaseKeepAwake() {} },
    tabs: {
      async query() {
        return [
          {
            id: profileIndex + 1,
            windowId: 100 + profileIndex,
            url: `https://vibes.ai/projects/v57-${profileIndex + 1}`,
          },
        ];
      },
      async get(id) {
        return {
          id,
          windowId: 100 + profileIndex,
          url: `https://vibes.ai/projects/v57-${profileIndex + 1}`,
        };
      },
      async update(id, updateInfo) {
        return { id, ...updateInfo };
      },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    windows: {
      async update(id, info) {
        return { id, ...info };
      },
    },
    debugger: {
      onDetach: { addListener() {} },
      async attach() {
        counters.debuggerAttach += 1;
        counters.debuggerActive += 1;
      },
      async detach() {
        counters.debuggerDetach += 1;
        counters.debuggerActive = Math.max(0, counters.debuggerActive - 1);
      },
      async sendCommand(_target, method) {
        if (method === "Runtime.evaluate")
          return {
            result: {
              value: {
                url: `https://vibes.ai/projects/v57-${profileIndex + 1}`,
                origin: "https://vibes.ai",
                title: "V57",
              },
            },
          };
        return {};
      },
    },
  };
  const context = {
    chrome,
    URL,
    Promise,
    Date,
    Set,
    Map,
    Object,
    String,
    Number,
    JSON,
    structuredClone,
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "service-worker.js" });
  return { bridge: context.contentFlowBridge, storage, counters };
}

async function runBridgeInternals(profileCount, commandCount) {
  const source = await readFile(
    path.join(ROOT, "ecosystem", "browser-bridge", "service-worker.js"),
    "utf8",
  );
  const profiles = Array.from({ length: profileCount }, (_, index) =>
    createInstrumentedBridge(source, index),
  );
  for (let index = 0; index < profiles.length; index += 1) {
    const item = profiles[index];
    const token = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const profileId = `profile-${index + 1}`;
    const base = {
      pluginId: "local.contentflow.vibes-browser-studio",
      protocolVersion: 2,
      profileId,
      sessionToken: token,
    };
    const connected = await item.bridge.connect(base);
    if (!connected.ok) throw new Error("Handshake interno 5.7 falhou.");
    for (let ordinal = 0; ordinal < commandCount; ordinal += 1) {
      const now = Date.now();
      const action =
        ordinal % 10 === 0 ? "leaseAcquire" : ordinal % 10 === 9 ? "leaseRelease" : "ping";
      const response = await item.bridge.dispatch({
        ...base,
        executionKey: `v57-execution-profile-${index + 1}`,
        commandId: createHash("sha256").update(`internal:${index}:${ordinal}`).digest("hex"),
        issuedAt: now,
        expiresAt: now + 10_000,
        expectedUrl: `https://vibes.ai/projects/v57-${index + 1}`,
        action,
        payload: action === "leaseAcquire" ? { ttlMs: 60_000 } : {},
      });
      if (!response.ok) throw new Error(`Bridge interna recusou ${action}: ${response.code}`);
    }
    await item.bridge.disconnect(base);
  }
  await delay(50);
  const cacheEntries = profiles.reduce(
    (sum, item) => sum + Object.keys(item.storage.contentflowCommandCacheV2 || {}).length,
    0,
  );
  const lifecycleSessions = profiles.reduce(
    (sum, item) => sum + Object.keys(item.storage.contentflowLifecycleV1 || {}).length,
    0,
  );
  const lifecycleEventsPeak = Math.max(
    0,
    ...profiles.flatMap((item) =>
      Object.values(item.storage.contentflowLifecycleV1 || {}).map(
        (state) => state.events?.length || 0,
      ),
    ),
  );
  const leaseEntries = profiles.reduce(
    (sum, item) => sum + Object.keys(item.storage.contentflowLeasesV1 || {}).length,
    0,
  );
  return {
    profileCount,
    commandsPerProfile: commandCount,
    commandCacheEntriesTotal: cacheEntries,
    commandCacheEntriesPeakPerProfile: Math.max(
      0,
      ...profiles.map((item) => Object.keys(item.storage.contentflowCommandCacheV2 || {}).length),
    ),
    lifecycleSessions,
    lifecycleEventsPeak,
    leaseEntriesAfterDisconnect: leaseEntries,
    timersCreated: profiles.reduce((sum, item) => sum + item.counters.timersCreated, 0),
    timersActiveAfterSettle: profiles.reduce((sum, item) => sum + item.counters.timersActive, 0),
    timersPeakPerProfile: Math.max(0, ...profiles.map((item) => item.counters.timersPeak)),
    debuggerAttach: profiles.reduce((sum, item) => sum + item.counters.debuggerAttach, 0),
    debuggerDetach: profiles.reduce((sum, item) => sum + item.counters.debuggerDetach, 0),
    debuggerActiveAfterDisconnect: profiles.reduce(
      (sum, item) => sum + item.counters.debuggerActive,
      0,
    ),
    alarmsCreated: profiles.reduce((sum, item) => sum + item.counters.alarmsCreated, 0),
    storageWrites: profiles.reduce((sum, item) => sum + item.counters.storageWrites, 0),
  };
}

async function idleStructureProof() {
  const worker = await readFile(
    path.join(ROOT, "ecosystem", "browser-bridge", "service-worker.js"),
    "utf8",
  );
  const content = await readFile(
    path.join(ROOT, "ecosystem", "browser-bridge", "content-script.js"),
    "utf8",
  );
  return {
    setIntervalCount:
      (worker.match(/\bsetInterval\s*\(/g) || []).length +
      (content.match(/\bsetInterval\s*\(/g) || []).length,
    heartbeatBoundToJob:
      content.includes('message?.action !== "job-active"') &&
      content.includes('message?.action !== "job-idle"') &&
      worker.includes("announceJobActivity();"),
    mutationObserverCount:
      (worker.match(/\bnew\s+MutationObserver\s*\(/g) || []).length +
      (content.match(/\bnew\s+MutationObserver\s*\(/g) || []).length,
    observerBoundToCommand:
      worker.includes('command.action === "observeCondition"') &&
      worker.includes("observePageCondition"),
    leaseCleanupAlarmMinutes: 0.5,
  };
}

async function main() {
  const fixtureHtml = Buffer.from(
    '<!doctype html><html><body><textarea id="prompt"></textarea><div id="condition-target">ok</div></body></html>',
  );
  const server = createServer((request, response) => {
    if (request.url === "/fixture") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fixtureHtml);
    } else {
      response.writeHead(404);
      response.end("not found");
    }
  });
  const address = await listen(server);
  const fixture = {
    origin: `http://127.0.0.1:${address.port}`,
    url: `http://127.0.0.1:${address.port}/fixture`,
  };
  try {
    const chromeScenarios = [];
    const bridgeInternals = [];
    for (const profileCount of PROFILE_COUNTS) {
      console.error(`5.7: ${profileCount} perfil(is), job curto em Chrome real`);
      chromeScenarios.push({
        kind: "short-job",
        ...(await runChromeScenario(profileCount, SHORT_JOB_COMMANDS, fixture)),
      });
      console.error(`5.7: ${profileCount} perfil(is), job longo em Chrome real`);
      chromeScenarios.push({
        kind: "long-job",
        ...(await runChromeScenario(profileCount, LONG_JOB_COMMANDS, fixture)),
      });
      console.error(`5.7: ${profileCount} perfil(is), instrumentação interna`);
      bridgeInternals.push({
        kind: "short-job",
        ...(await runBridgeInternals(profileCount, SHORT_JOB_COMMANDS)),
      });
      bridgeInternals.push({
        kind: "long-job",
        ...(await runBridgeInternals(profileCount, LONG_JOB_COMMANDS)),
      });
    }
    const idleProof = await idleStructureProof();
    const gates = {
      chromeRssGrowthWithin15Percent: chromeScenarios
        .filter((item) => item.kind === "long-job")
        .every((item) => item.rssGrowthRatio <= 0.15),
      commandCacheBounded: bridgeInternals.every(
        (item) => item.commandCacheEntriesPeakPerProfile <= MAX_COMMAND_CACHE,
      ),
      lifecycleBounded: bridgeInternals.every(
        (item) =>
          item.lifecycleSessions <= MAX_ACTIVE_SESSIONS * item.profileCount &&
          item.lifecycleEventsPeak <= MAX_LIFECYCLE_EVENTS,
      ),
      timersQuiescent: bridgeInternals.every((item) => item.timersActiveAfterSettle === 0),
      leasesReleased: bridgeInternals.every((item) => item.leaseEntriesAfterDisconnect === 0),
      debuggerReleased: bridgeInternals.every(
        (item) =>
          item.debuggerActiveAfterDisconnect === 0 && item.debuggerAttach === item.debuggerDetach,
      ),
      noIdlePolling:
        idleProof.setIntervalCount <= 1 &&
        idleProof.heartbeatBoundToJob &&
        idleProof.observerBoundToCommand,
    };
    const result = {
      schemaVersion: 1,
      benchmark: "shared-browser-soak-v57",
      recordedAt: new Date().toISOString(),
      environment: { platform: os.platform(), nodeMajor: process.versions.node.split(".")[0] },
      configuration: {
        profileCounts: PROFILE_COUNTS,
        shortJobCommands: SHORT_JOB_COMMANDS,
        longJobCommands: LONG_JOB_COMMANDS,
        settleMs: SETTLE_MS,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
      },
      acceptedLimits: {
        chromeLongRunRssGrowthRatioMax: 0.15,
        commandCacheEntriesPerProfileMax: MAX_COMMAND_CACHE,
        activeSessionsPerWorkerMax: MAX_ACTIVE_SESSIONS,
        lifecycleEventsPerSessionMax: MAX_LIFECYCLE_EVENTS,
        activeTimersAfterSettleMax: 0,
        leasesAfterDisconnectMax: 0,
        debuggerAttachmentsAfterDisconnectMax: 0,
        idleSetIntervalCountMax: 1,
      },
      chromeScenarios,
      bridgeInternals,
      idleProof,
      gates,
      ok: Object.values(gates).every(Boolean),
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await main();
