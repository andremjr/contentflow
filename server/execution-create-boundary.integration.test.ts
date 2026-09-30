import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROCESS_ORDER,
  createEmptyMethods,
  type ActionBlock,
  type Channel,
  type ProcessExecution,
  type Project,
} from "../src/lib/domain";

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForApi(baseUrl: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/channels`);
      if (response.ok) return;
    } catch {
      // Porta ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API de teste não iniciou dentro do prazo.");
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, body: (text ? JSON.parse(text) : undefined) as T & { error?: string } };
}

function humanBlock(): ActionBlock {
  return {
    id: "create-theme",
    type: "CRIAR",
    operator: "Humano",
    name: "Criar tema",
    inputs: [],
    outputs: [
      {
        id: "theme-output",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
}

function channelFixture(id: string, block: ActionBlock): Channel {
  const methods = createEmptyMethods();
  methods.theme = {
    contractVersion: 3,
    name: "Método canônico",
    processType: "theme",
    blocks: [block],
  };
  return {
    id,
    name: "Canal",
    handle: "@canonical",
    color: "#2563eb",
    subscribers: "0",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 1,
    frequency: "Semanal",
    nextPublish: "—",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: "2026-09-30T12:00:00.000Z",
  };
}

function projectFixture(id: string, channelId: string): Project {
  return {
    id,
    title: "Projeto",
    channelId,
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [
        processType,
        processType === "theme" ? "awaiting_human" : "not_started",
      ]),
    ) as Project["stages"],
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: "2026-09-30T12:00:00.000Z",
  };
}

function executionFixture(
  projectId: string,
  channelId: string,
  block: ActionBlock,
): ProcessExecution {
  return {
    revision: 1,
    id: "canonical-execution",
    projectId,
    channelId,
    processType: "theme",
    methodSnapshot: {
      contractVersion: 3,
      name: "Método canônico",
      processType: "theme",
      blocks: [structuredClone(block)],
    },
    blocks: [
      { blockId: block.id, status: "awaiting_human", values: { theme: "Tema válido" }, attempt: 1 },
    ],
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
  };
}

test(
  "POST /api/executions accepts only canonical execution state",
  { timeout: 30_000 },
  async () => {
    const port = await availablePort();
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-execution-boundary-"));
    const baseUrl = `http://127.0.0.1:${port}`;
    const logs: string[] = [];
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_DATA_DIR: dataDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout?.on("data", (chunk) => logs.push(String(chunk)));
    child.stderr?.on("data", (chunk) => logs.push(String(chunk)));

    try {
      await waitForApi(baseUrl, child);
      const block = humanBlock();
      const channel = channelFixture("canonical-channel", block);
      const project = projectFixture("canonical-project", channel.id);

      const channelResult = await jsonRequest(`${baseUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      assert.equal(channelResult.response.status, 201, logs.join(""));
      const projectResult = await jsonRequest(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      assert.equal(projectResult.response.status, 201, logs.join(""));

      const execution = executionFixture(project.id, channel.id, block);
      const created = await jsonRequest<ProcessExecution>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execution),
      });
      assert.equal(created.response.status, 201, created.body.error ?? logs.join(""));
      assert.equal(created.body.methodSnapshot.contractVersion, 3);

      const { contractVersion: _contractVersion, ...historicalSnapshot } = execution.methodSnapshot;
      const historical = {
        ...structuredClone(execution),
        id: "historical-execution",
        methodSnapshot: historicalSnapshot,
      };
      const rejectedHistorical = await jsonRequest(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(historical),
      });
      assert.equal(rejectedHistorical.response.status, 400);

      const orphan = executionFixture("missing-project", "missing-channel", block);
      orphan.id = "orphan-execution";
      const rejectedOrphan = await jsonRequest(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orphan),
      });
      assert.equal(rejectedOrphan.response.status, 400);
    } finally {
      child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit").catch(() => undefined);
      await rm(dataDirectory, { recursive: true, force: true });
    }
  },
);
