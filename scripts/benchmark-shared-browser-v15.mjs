import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import Database from "better-sqlite3";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const PROFILE_COUNTS = [1, 3, 5];
const COMMANDS_PER_PROFILE = 100;

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    samples: sorted.length,
    minMs: Number(sorted[0]?.toFixed(2) ?? 0),
    meanMs: Number(mean.toFixed(2)),
    p95Ms: Number(percentile(0.95)?.toFixed(2) ?? 0),
    maxMs: Number(sorted.at(-1)?.toFixed(2) ?? 0),
  };
}

async function removeTemporaryDirectory(directory) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return true;
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta local indisponível.");
  server.close();
  await once(server, "close");
  return address.port;
}

function chromeExecutable() {
  if (process.platform !== "win32") return undefined;
  const candidates = [
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function powershellJson(script, env = {}) {
  if (process.platform !== "win32") return undefined;
  const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  await once(child, "exit");
  return stdout.trim() ? JSON.parse(stdout.trim()) : undefined;
}

async function systemInfo() {
  const chrome = chromeExecutable();
  let chromeVersion;
  if (chrome) {
    chromeVersion = await powershellJson(
      "$v=(Get-Item $env:CONTENTFLOW_BENCH_CHROME).VersionInfo.ProductVersion; @{version=$v} | ConvertTo-Json -Compress",
      { CONTENTFLOW_BENCH_CHROME: chrome },
    );
  }
  return {
    platform: os.platform(),
    nodeMajor: process.versions.node.split(".")[0],
    chrome: chromeVersion?.version ?? "not-detected",
  };
}

function benchmarkSqlite() {
  const rows = 2000;
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE plugin_profiles (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      alias TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX plugin_profiles_plugin_id ON plugin_profiles(plugin_id);
    CREATE UNIQUE INDEX plugin_profiles_alias ON plugin_profiles(plugin_id, alias COLLATE NOCASE);
  `);
  const insert = database.prepare(
    "INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  const insertMany = database.transaction(() => {
    for (let index = 0; index < rows; index += 1) {
      insert.run(
        `profile-${index}`,
        `plugin-${index % 8}`,
        `Perfil ${index}`,
        `alias-${index}`,
        now,
        now,
      );
    }
  });
  const insertStarted = performance.now();
  insertMany();
  const insertMs = performance.now() - insertStarted;
  const read = database.prepare(
    "SELECT id, alias FROM plugin_profiles WHERE plugin_id = ? ORDER BY alias",
  );
  const reads = [];
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const started = performance.now();
    read.all(`plugin-${iteration % 8}`);
    reads.push(performance.now() - started);
  }
  database.close();
  return { rows, insertMs: Number(insertMs.toFixed(2)), indexedList: stats(reads) };
}

async function benchmarkSimpleJob() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "contentflow-v15-job-"));
  const localRoot = path.join(directory, "plugins", "local");
  const pluginDirectory = path.join(localRoot, "profile-plugin");
  mkdirSync(localRoot, { recursive: true });
  cpSync(path.join(ROOT, "tests", "fixtures", "profile-plugin"), pluginDirectory, {
    recursive: true,
  });
  process.env.CONTENTFLOW_DATA_DIR = directory;
  process.env.CONTENTFLOW_LOCAL_PLUGINS_DIR = localRoot;
  const runner = await import(`../server/plugin-runner.ts?benchmark=${Date.now()}`);
  runner.initializePluginRunner();
  const plugin = runner.getRegisteredPlugin("com.contentflow.e2e-profile");
  if (!plugin) throw new Error("Fixture de job simples não foi registrada.");
  const workspaceDirectory = path.join(directory, "workspace");
  mkdirSync(path.join(workspaceDirectory, "benchmark"), { recursive: true });
  writeFileSync(path.join(workspaceDirectory, "benchmark", "extension-installed.txt"), "installed");
  const request = {
    apiVersion: "1",
    executionId: "benchmark-execution",
    traceId: "benchmark-trace",
    capabilityId: "generate",
    attempt: 1,
    inputs: {},
    configuration: { accountProfile: "benchmark", fallbackAccountProfiles: "" },
    settings: {},
    context: {
      channel: { id: "benchmark-channel", name: "Benchmark" },
      project: { id: "benchmark-project", name: "Benchmark" },
      process: { type: "title" },
      block: { id: "benchmark-block", type: "CRIAR", name: "Benchmark" },
    },
    resolvedInstruction: "resultado benchmark",
  };
  const durations = [];
  try {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const started = performance.now();
      const response = await runner.executeRegisteredPlugin(
        plugin,
        request,
        10_000,
        {},
        { workspaceDirectory },
      );
      if (response.status !== "success")
        throw new Error(`Job simples retornou ${response.status}.`);
      durations.push(performance.now() - started);
    }
    return stats(durations);
  } finally {
    await removeTemporaryDirectory(directory);
  }
}

function createBridgeContext(source, profileIndex) {
  const storage = {};
  let runtimeListener;
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "baseline-v15" }),
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        },
      },
      onConnect: { addListener() {} },
    },
    storage: {
      session: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
    tabs: {
      async query() {
        return [{ id: profileIndex + 1, windowId: profileIndex + 10, url: "https://chatgpt.com/" }];
      },
      async get(tabId) {
        return { id: tabId, windowId: profileIndex + 10, url: "https://chatgpt.com/" };
      },
      async update(tabId, updateInfo) {
        return { id: tabId, ...updateInfo };
      },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    power: { requestKeepAwake() {}, releaseKeepAwake() {} },
    windows: {
      async update(windowId, updateInfo) {
        return { id: windowId, ...updateInfo };
      },
    },
    debugger: {
      async attach() {},
      async detach() {},
      async sendCommand(_target, method) {
        if (method === "Runtime.evaluate") {
          return {
            result: {
              value: {
                url: "https://chatgpt.com/",
                origin: "https://chatgpt.com",
                title: "Benchmark",
              },
            },
          };
        }
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
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "service-worker.js" });
  if (typeof runtimeListener !== "function")
    throw new Error("Browser Bridge não registrou listener runtime.");
  return context.contentFlowBridge;
}

async function benchmarkBridgeCommands() {
  const source = readFileSync(
    path.join(ROOT, "ecosystem", "browser-bridge", "service-worker.js"),
    "utf8",
  );
  const results = [];
  for (const profileCount of PROFILE_COUNTS) {
    const bridges = Array.from({ length: profileCount }, (_, index) =>
      createBridgeContext(source, index),
    );
    const started = performance.now();
    let commands = 0;
    for (let profileIndex = 0; profileIndex < profileCount; profileIndex += 1) {
      const bridge = bridges[profileIndex];
      const token = `00000000-0000-4000-8000-${String(profileIndex + 1).padStart(12, "0")}`;
      const handshake = {
        pluginId: "local.contentflow.chatgpt-browser-studio",
        protocolVersion: 2,
        sessionToken: token,
        profileId: `profile-${profileIndex + 1}`,
      };
      const connected = bridge.connect(handshake);
      if (!connected.ok) throw new Error(`Handshake falhou: ${connected.code}`);
      for (let ordinal = 0; ordinal < COMMANDS_PER_PROFILE; ordinal += 1) {
        const issuedAt = Date.now();
        const response = await bridge.dispatch({
          ...handshake,
          executionKey: `benchmark-execution-${profileIndex}`,
          commandId: createHash("sha256").update(`${profileIndex}:${ordinal}`).digest("hex"),
          expectedUrl: "https://chatgpt.com/",
          action: "ping",
          payload: {},
          issuedAt,
          expiresAt: issuedAt + 60_000,
        });
        if (!response.ok) throw new Error(`Comando da bridge falhou: ${response.code}`);
        commands += 1;
      }
      await bridge.disconnect(handshake);
    }
    const elapsedMs = performance.now() - started;
    results.push({
      profileCount,
      commands,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      commandsPerSecond: Number((commands / (elapsedMs / 1000)).toFixed(1)),
    });
  }
  return results;
}

async function processTreeMetrics(rootPid) {
  if (process.platform !== "win32") return undefined;
  return powershellJson(
    `$root=[int]$env:CONTENTFLOW_BENCH_PID; $all=Get-CimInstance Win32_Process; $ids=New-Object System.Collections.Generic.List[int]; $ids.Add($root); do { $before=$ids.Count; foreach($p in $all){ if($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)){ $ids.Add([int]$p.ProcessId) } } } while($ids.Count -gt $before); $rss=0; $cpu=0; foreach($id in $ids){ $p=Get-Process -Id $id -ErrorAction SilentlyContinue; if($p){ $rss += $p.WorkingSet64; $cpu += $p.CPU } }; @{processes=$ids.Count;rss=$rss;cpu=$cpu} | ConvertTo-Json -Compress`,
    { CONTENTFLOW_BENCH_PID: String(rootPid) },
  );
}

async function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "exit");
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
}

async function waitForChrome(port, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function benchmarkChromeIdle() {
  const chrome = chromeExecutable();
  if (!chrome) return { available: false, reason: "Chrome não detectado" };
  const extensionDirectory = path.join(ROOT, "ecosystem", "browser-bridge");
  const results = [];
  for (const profileCount of PROFILE_COUNTS) {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), `contentflow-v15-chrome-${profileCount}-`),
    );
    const children = [];
    try {
      for (let index = 0; index < profileCount; index += 1) {
        const port = await availablePort();
        const userData = path.join(directory, `profile-${index + 1}`);
        const child = spawn(
          chrome,
          [
            "--headless=new",
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${userData}`,
            `--disable-extensions-except=${extensionDirectory}`,
            `--load-extension=${extensionDirectory}`,
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-breakpad",
            "--disable-crash-reporter",
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
          ],
          { stdio: "ignore", windowsHide: true },
        );
        children.push({ child, port });
        if (!(await waitForChrome(port, child))) throw new Error("Chrome isolado não iniciou.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const before = await Promise.all(children.map(({ child }) => processTreeMetrics(child.pid)));
      const rssSamples = [];
      const processSamples = [];
      for (let sample = 0; sample < 5; sample += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const trees = await Promise.all(children.map(({ child }) => processTreeMetrics(child.pid)));
        rssSamples.push(trees.reduce((sum, item) => sum + Number(item?.rss ?? 0), 0) / 1024 / 1024);
        processSamples.push(trees.reduce((sum, item) => sum + Number(item?.processes ?? 0), 0));
      }
      const after = await Promise.all(children.map(({ child }) => processTreeMetrics(child.pid)));
      const beforeCpu = before.reduce((sum, item) => sum + Number(item?.cpu ?? 0), 0);
      const afterCpu = after.reduce((sum, item) => sum + Number(item?.cpu ?? 0), 0);
      results.push({
        profileCount,
        processCountMin: Math.min(...processSamples),
        processCountMax: Math.max(...processSamples),
        rssMiBMin: Number(Math.min(...rssSamples).toFixed(2)),
        rssMiBMean: Number(
          (rssSamples.reduce((sum, value) => sum + value, 0) / rssSamples.length).toFixed(2),
        ),
        rssMiBMax: Number(Math.max(...rssSamples).toFixed(2)),
        idleWindowMs: 2000,
        cpuSecondsDuringIdleWindow: Number(Math.max(0, afterCpu - beforeCpu).toFixed(3)),
      });
    } finally {
      await Promise.all(children.map(({ child }) => killProcessTree(child)));
      await removeTemporaryDirectory(directory);
    }
  }
  return {
    available: true,
    mode: "isolated headless Chrome with unpacked Browser Bridge, no job",
    results,
  };
}

async function waitForHttp(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Servidor não respondeu em ${url}.`);
}

async function benchmarkUi() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "contentflow-v15-ui-"));
  const localPluginsDirectory = path.join(directory, "plugins", "local");
  mkdirSync(localPluginsDirectory, { recursive: true });
  cpSync(
    path.join(ROOT, "tests", "fixtures", "profile-plugin"),
    path.join(localPluginsDirectory, "profile-plugin"),
    {
      recursive: true,
    },
  );
  const apiPort = await availablePort();
  const uiPort = await availablePort();
  const env = {
    ...process.env,
    CONTENTFLOW_DATA_DIR: directory,
    CONTENTFLOW_API_PORT: String(apiPort),
  };
  const api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: ROOT,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  const vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    { cwd: ROOT, env, stdio: "ignore", windowsHide: true },
  );
  let browser;
  try {
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, api);
    await waitForHttp(`http://127.0.0.1:${uiPort}/api/health`, vite);
    browser = await chromium.launch({
      channel: chromeExecutable() ? "chrome" : undefined,
      headless: true,
    });
    const page = await browser.newPage();
    const baseUrl = `http://127.0.0.1:${uiPort}/plugins`;
    for (let warmup = 0; warmup < 2; warmup += 1) {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByText("1 plugins", { exact: true }).waitFor();
    }
    const durations = [];
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const started = performance.now();
      await page.goto(`${baseUrl}?run=${iteration}`, { waitUntil: "domcontentloaded" });
      await page.getByText("1 plugins", { exact: true }).waitFor();
      durations.push(performance.now() - started);
    }
    return stats(durations);
  } finally {
    await browser?.close();
    api.kill();
    vite.kill();
    await Promise.all(
      [api, vite].map((child) =>
        child.exitCode === null
          ? Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2500))])
          : undefined,
      ),
    );
    await removeTemporaryDirectory(directory);
  }
}

const result = {
  schemaVersion: 1,
  benchmark: "shared-browser-resource-baseline-v15",
  recordedAt: new Date().toISOString(),
  environment: await systemInfo(),
  uiPluginsRoute: await benchmarkUi(),
  sqliteProfileInventory: benchmarkSqlite(),
  simplePluginJob: await benchmarkSimpleJob(),
  browserBridgeControlledCommands: await benchmarkBridgeCommands(),
  chromeIdleWithBridge: await benchmarkChromeIdle(),
  notes: [
    "Todos os dados e perfis usados pelo benchmark são temporários e isolados.",
    "O volume de comandos usa a Browser Bridge real em contextos VM controlados; Chrome real com handshake/comandos fica para o pacote 5.1.",
    "A medição ociosa abre Chrome isolado com a extensão unpacked e sem job; não reutiliza perfis nem sessões do usuário.",
  ],
};

console.log(JSON.stringify(result, null, 2));
