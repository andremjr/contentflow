import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const PROCESS_ORDER = [
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
];

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta de benchmark inválida.");
  server.close();
  await once(server, "close");
  return address.port;
}

async function waitForApi(baseUrl, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/channels`);
      if (response.ok) return;
    } catch {
      // Inicialização ainda em andamento.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API de benchmark não iniciou.");
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? "requisição falhou"}`);
  return body;
}

function benchmarkChannel(id) {
  const now = new Date().toISOString();
  return {
    id,
    name: "Benchmark V4",
    handle: "",
    color: "#2563eb",
    subscribers: "0",
    niche: "Benchmark",
    language: "PT-BR",
    activeProjects: 0,
    frequency: "Semanal",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    createdAt: now,
    methods: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [
        processType,
        {
          name: `Benchmark ${processType}`,
          processType,
          blocks: [
            {
              id: `benchmark-${processType}`,
              type: "CRIAR",
              operator: "Humano",
              name: `Executar ${processType}`,
              inputs: [],
              outputs: [],
              parameters: [],
              order: 0,
            },
          ],
        },
      ]),
    ),
  };
}

function readSqlCount(file) {
  try {
    return Number(readFileSync(file, "utf8")) || 0;
  } catch {
    return 0;
  }
}

async function processMetrics(pid) {
  if (process.platform !== "win32") return undefined;
  const command = `$p = Get-Process -Id ${pid}; @{cpu=$p.CPU;rss=$p.WorkingSet64} | ConvertTo-Json -Compress`;
  const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  await once(child, "exit");
  return JSON.parse(stdout.trim());
}

async function run(quantity) {
  const port = await availablePort();
  const directory = mkdtempSync(path.join(os.tmpdir(), `contentflow-v4-benchmark-${quantity}-`));
  const sqlMetricsFile = path.join(directory, "sql-count.txt");
  writeFileSync(sqlMetricsFile, "0");
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_DATA_DIR: directory,
      CONTENTFLOW_SQL_METRICS_FILE: sqlMetricsFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk.toString()));
  child.stderr.on("data", (chunk) => (logs += chunk.toString()));
  try {
    await waitForApi(baseUrl, child);
    const channel = benchmarkChannel(`benchmark-channel-${quantity}`);
    await requestJson(`${baseUrl}/api/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channel),
    });

    const sqlBefore = readSqlCount(sqlMetricsFile);
    const before = await processMetrics(child.pid);
    let peakRss = before?.rss ?? 0;
    let sampling = false;
    const sampler = setInterval(async () => {
      if (sampling) return;
      sampling = true;
      try {
        const sample = await processMetrics(child.pid);
        if (sample) peakRss = Math.max(peakRss, sample.rss);
      } finally {
        sampling = false;
      }
    }, 25);
    const startedAt = performance.now();
    const state = await requestJson(`${baseUrl}/api/orchestrators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel.id,
        mode: "batch",
        quantity,
        projectPrefix: "Benchmark",
      }),
    });
    const elapsedMs = performance.now() - startedAt;
    clearInterval(sampler);
    const after = await processMetrics(child.pid);
    if (after) peakRss = Math.max(peakRss, after.rss);
    const sqlAfter = readSqlCount(sqlMetricsFile);

    await requestJson(`${baseUrl}/api/orchestrators/${state.orchestrator.id}/stop`, {
      method: "POST",
    });
    return {
      quantity,
      elapsedMs: Number(elapsedMs.toFixed(1)),
      sqlStatements: sqlAfter - sqlBefore,
      cpuSeconds: before && after ? Number((after.cpu - before.cpu).toFixed(4)) : undefined,
      rssBeforeMiB: before ? Number((before.rss / 1024 / 1024).toFixed(2)) : undefined,
      rssAfterMiB: after ? Number((after.rss / 1024 / 1024).toFixed(2)) : undefined,
      rssPeakMiB: peakRss ? Number((peakRss / 1024 / 1024).toFixed(2)) : undefined,
      strategyVersion: state.orchestrator.strategyVersion,
      plannedSteps: state.orchestrator.plannedSteps?.length,
      projects: state.projects.length,
      executionsStarted: state.executions.length,
    };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`);
  } finally {
    child.kill();
    if (child.exitCode === null)
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const results = [];
for (const quantity of [10, 50]) results.push(await run(quantity));
console.log(JSON.stringify(results, null, 2));
