import { requestMonitorFlush } from "./client";
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
} from "../../src/lib/domain";

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
  "monitored real HTTP human lifecycle persists official output and delivery",
  { timeout: 25000 },
  async () => {
    const port = await availablePort();
    const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-monitor-vertical-"));
    const base = "http://127.0.0.1:" + port;
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, CONTENTFLOW_API_PORT: String(port), CONTENTFLOW_DATA_DIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let logs = "";
    child.stdout?.on("data", (c) => {
      logs = (logs + c).slice(-4000);
    });
    child.stderr?.on("data", (c) => {
      logs = (logs + c).slice(-4000);
    });
    const post = async (route: string, value: unknown) => {
      const result = await jsonRequest<ProcessExecution>(base + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      assert.ok(result.response.ok, result.body.error ?? logs);
      return result.body;
    };
    try {
      await waitForApi(base, child);
      const block = humanBlock();
      const channel = channelFixture("monitor-channel", block);
      const project = projectFixture("monitor-project", channel.id);
      await post("/api/channels", channel);
      await post("/api/projects", project);
      const execution = executionFixture(project.id, channel.id, block);
      await post("/api/executions", execution);
      await post("/api/commands", {
        id: "00000000-0000-4000-8000-000000000001",
        action: "completeHuman",
        executionId: execution.id,
        blockId: block.id,
        attempt: 1,
        values: { theme: "Deterministic local theme" },
      });
      const state = await jsonRequest<{ executions: ProcessExecution[] }>(base + "/api/state");
      const completed = state.body.executions.find((e) => e.id === execution.id);
      assert.ok(completed);
      assert.equal(completed.status, "completed");
      assert.equal(completed.outputStatus, "completed");
      assert.equal(completed.output?.values.theme, "Deterministic local theme");
      assert.ok(completed.deliveries?.length);
      const replay = await post("/api/commands", {
        id: "00000000-0000-4000-8000-000000000001",
        action: "completeHuman",
        executionId: execution.id,
        blockId: block.id,
        attempt: 1,
        values: { theme: "Ignored duplicate" },
      });
      assert.ok(replay);
    } finally {
      await requestMonitorFlush();
      child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit");
      await rm(directory, { recursive: true, force: true });
    }
  },
);
