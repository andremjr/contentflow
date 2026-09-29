import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  PROCESS_ORDER,
  createEmptyMethods,
  type ActionBlock,
  type Channel,
  type ProcessExecution,
  type Project,
} from "../src/lib/domain";
import type { ExecutionOrchestrator } from "../src/lib/execution-orchestrator";

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
  return {
    response,
    body: (text ? JSON.parse(text) : undefined) as T & { error?: string },
  };
}

function humanBlock(id: string): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "Humano",
    name: "Bloco histórico",
    inputs: [],
    outputs: [
      {
        id: `${id}-output`,
        label: "Tema",
        key: "theme",
        type: "textarea",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
}

function channelFixture(id: string, block: ActionBlock): Channel {
  const methods = createEmptyMethods();
  methods.theme = { name: "Método vivo", processType: "theme", blocks: [block] };
  return {
    id,
    name: "Canal legado",
    handle: "@legacy",
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
    createdAt: "2026-09-29T12:00:00.000Z",
  };
}

function projectFixture(id: string, channelId: string): Project {
  return {
    id,
    title: "Projeto legado",
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
    createdAt: "2026-09-29T12:00:00.000Z",
  };
}

function legacyExecution(
  id: string,
  projectId: string,
  channelId: string,
  block: ActionBlock,
): ProcessExecution {
  return {
    revision: 7,
    id,
    projectId,
    channelId,
    processType: "theme",
    methodSnapshot: {
      name: "Método histórico",
      processType: "theme",
      blocks: [structuredClone(block)],
    },
    blocks: [
      {
        blockId: block.id,
        status: "awaiting_human",
        values: { theme: "valor materializado" },
        attempt: 3,
        retryFeedback: { theme: "preservar" },
        startedAt: "2026-09-29T10:00:00.000Z",
      },
    ],
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: "2026-09-29T09:00:00.000Z",
    updatedAt: "2026-09-29T11:00:00.000Z",
  };
}

test(
  "characterizes POST /api/executions as a legacy materialized-execution boundary",
  { timeout: 30_000 },
  async () => {
    const port = await availablePort();
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-legacy-boundary-"));
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
      const block = humanBlock("legacy-human");
      const channel = channelFixture("legacy-channel", block);
      const project = projectFixture("legacy-project", channel.id);

      const channelResult = await jsonRequest<Channel>(`${baseUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      assert.equal(channelResult.response.status, 201, channelResult.body.error ?? logs.join(""));
      const projectResult = await jsonRequest<Project>(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      assert.equal(projectResult.response.status, 201, projectResult.body.error ?? logs.join(""));

      const execution = legacyExecution("legacy-execution", project.id, channel.id, block);
      const created = await jsonRequest<ProcessExecution>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execution),
      });
      assert.equal(created.response.status, 201, created.body.error ?? logs.join(""));
      assert.deepEqual(created.body, execution, "o POST reinterpretou o estado histórico recebido");

      const stored = await jsonRequest<ProcessExecution[]>(
        `${baseUrl}/api/executions?projectId=${project.id}`,
      );
      assert.equal(stored.response.status, 200);
      assert.deepEqual(stored.body, [execution]);

      const projects = await jsonRequest<Project[]>(
        `${baseUrl}/api/projects?channelId=${channel.id}`,
      );
      const storedProject = projects.body.find((item) => item.id === project.id);
      assert.ok(storedProject?.strategySnapshot, "o POST deve capturar o strategySnapshot vigente");
      assert.equal(storedProject.strategySnapshot.methods.theme.name, "Método vivo");

      const duplicate = legacyExecution("duplicate-id", project.id, channel.id, block);
      duplicate.blocks[0].values = { theme: "não deve substituir" };
      const conflict = await jsonRequest<{ execution: ProcessExecution }>(
        `${baseUrl}/api/executions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(duplicate),
        },
      );
      assert.equal(conflict.response.status, 409);
      assert.deepEqual(conflict.body.execution, execution);
      const afterConflict = await jsonRequest<ProcessExecution[]>(
        `${baseUrl}/api/executions?projectId=${project.id}`,
      );
      assert.equal(afterConflict.body.length, 1);

      const invalid = await jsonRequest<{ error: string }>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "invalid", processType: "theme", updatedAt: "now" }),
      });
      assert.equal(invalid.response.status, 400);

      const rejectedExecution = {
        ...legacyExecution("rejected-execution", project.id, channel.id, block),
        processType: "invalid-process",
        status: "blocked_executor",
      };
      rejectedExecution.methodSnapshot.blocks[0].plugin = {
        pluginId: "should.not.schedule",
        capabilityId: "generate",
        configuration: {},
      };
      rejectedExecution.blocks[0].status = "blocked_executor";
      const rejected = await jsonRequest<{ error: string }>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rejectedExecution),
      });
      assert.equal(rejected.response.status, 400);
      const verificationDatabase = new Database(path.join(dataDirectory, "contentflow.sqlite"), {
        readonly: true,
      });
      try {
        const rejectedExecutionCount = verificationDatabase
          .prepare("SELECT COUNT(*) AS count FROM process_executions WHERE id = ?")
          .get("rejected-execution") as { count: number };
        const rejectedJobCount = verificationDatabase
          .prepare("SELECT COUNT(*) AS count FROM plugin_jobs WHERE execution_id = ?")
          .get("rejected-execution") as { count: number };
        assert.equal(rejectedExecutionCount.count, 0);
        assert.equal(rejectedJobCount.count, 0);
      } finally {
        verificationDatabase.close();
      }

      const orphan = legacyExecution(
        "orphan-execution",
        "missing-project",
        "missing-channel",
        block,
      );
      const orphanCreated = await jsonRequest<ProcessExecution>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orphan),
      });
      assert.equal(orphanCreated.response.status, 201);
      const orphanStored = await jsonRequest<ProcessExecution[]>(
        `${baseUrl}/api/executions?projectId=missing-project`,
      );
      assert.deepEqual(orphanStored.body, [orphan]);

      const orchestratedProject = projectFixture("legacy-orchestrated-project", channel.id);
      const orchestratedProjectResult = await jsonRequest<Project>(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orchestratedProject),
      });
      assert.equal(orchestratedProjectResult.response.status, 201);

      const now = new Date().toISOString();
      const orchestrator: ExecutionOrchestrator = {
        id: "legacy-boundary-orchestrator",
        channelId: channel.id,
        mode: "end_to_end",
        strategyVersion: 5,
        processOrder: [...PROCESS_ORDER],
        plannedSteps: [{ projectId: orchestratedProject.id, processType: "theme" }],
        quantity: 1,
        projectPrefix: "Legacy",
        projectIds: [orchestratedProject.id],
        currentStep: 0,
        totalSteps: 1,
        status: "running",
        createdAt: now,
        updatedAt: now,
      };
      const database = new Database(path.join(dataDirectory, "contentflow.sqlite"));
      try {
        database
          .prepare(
            `INSERT INTO execution_orchestrators
             (id, channel_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(orchestrator.id, channel.id, JSON.stringify(orchestrator), now, now);
      } finally {
        database.close();
      }

      const reconciledExecution = legacyExecution(
        "legacy-orchestrated-execution",
        orchestratedProject.id,
        channel.id,
        block,
      );
      const reconciledCreate = await jsonRequest<ProcessExecution>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reconciledExecution),
      });
      assert.equal(reconciledCreate.response.status, 201);

      let reconciledStatus = "running";
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const state = await jsonRequest<{ orchestrator: ExecutionOrchestrator }>(
          `${baseUrl}/api/orchestrators/${orchestrator.id}/state`,
        );
        assert.equal(state.response.status, 200);
        reconciledStatus = state.body.orchestrator.status;
        if (reconciledStatus !== "running") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(
        reconciledStatus,
        "awaiting_human",
        "o POST deve enfileirar reconciliação do Orchestrator associado",
      );
    } finally {
      child.kill();
      if (child.exitCode === null) {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
      await rm(dataDirectory, { recursive: true, force: true });
    }
  },
);
