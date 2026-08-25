import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { PROCESS_ORDER, type Channel, type ProcessExecution } from "../src/lib/domain";
import type { ExecutionOrchestrator } from "../src/lib/execution-orchestrator";

type OrchestratorState = {
  orchestrator: ExecutionOrchestrator;
  projects: Array<{ id: string }>;
  executions: ProcessExecution[];
};

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
    if (child.exitCode !== null) throw new Error(`A API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/channels`);
      if (response.ok) return;
    } catch {
      // A porta ainda não está pronta.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API de teste não iniciou dentro do prazo.");
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  return { response, body };
}

function testChannel(): Channel {
  const createdAt = new Date().toISOString();
  return {
    id: "channel-orchestrator-test",
    name: "Canal de teste",
    handle: "@orchestrator-test",
    color: "#2563eb",
    subscribers: "0 inscritos",
    niche: "Testes",
    language: "PT-BR",
    activeProjects: 0,
    frequency: "Semanal",
    nextPublish: "—",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    createdAt,
    methods: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [
        processType,
        {
          processType,
          blocks: [
            {
              id: `${processType}-human-test`,
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
    ) as unknown as Channel["methods"],
  };
}

test(
  "retoma a fila após corrigir uma falha; stop cancela e protege os projetos ativos",
  { timeout: 30_000 },
  async () => {
    const port = await availablePort();
    const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-orchestrator-"));
    const baseUrl = `http://127.0.0.1:${port}`;
    const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsxCli, "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_DATA_DIR: dataDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (chunk) => (logs += chunk.toString()));
    child.stderr?.on("data", (chunk) => (logs += chunk.toString()));

    try {
      await waitForApi(baseUrl, child);
      const channel = testChannel();
      const channelResponse = await jsonRequest<Channel>(`${baseUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      assert.equal(channelResponse.response.status, 201, channelResponse.body.error);

      const first = await jsonRequest<OrchestratorState>(`${baseUrl}/api/orchestrators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel.id,
          mode: "end_to_end",
          quantity: 1,
          projectPrefix: "Falha",
        }),
      });
      assert.equal(first.response.status, 201, first.body.error);
      assert.equal(first.body.orchestrator.status, "awaiting_human");
      assert.equal(first.body.executions.length, 1);

      const failedExecution = {
        ...first.body.executions[0],
        status: "failed",
        error: "Falha controlada pelo teste.",
        blocks: first.body.executions[0].blocks.map((block) => ({ ...block, status: "failed" })),
        updatedAt: new Date().toISOString(),
      };
      const failedResponse = await jsonRequest<ProcessExecution>(
        `${baseUrl}/api/executions/${failedExecution.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(failedExecution),
        },
      );
      assert.equal(failedResponse.response.status, 200, failedResponse.body.error);

      const failedState = await jsonRequest<OrchestratorState>(
        `${baseUrl}/api/orchestrators/${first.body.orchestrator.id}/state`,
      );
      assert.equal(failedState.body.orchestrator.status, "failed");

      const prematureResume = await jsonRequest<{ error: string }>(
        `${baseUrl}/api/orchestrators/${first.body.orchestrator.id}/resume`,
        { method: "POST" },
      );
      assert.equal(prematureResume.response.status, 409);
      assert.match(prematureResume.body.error, /Corrija ou tente novamente/);

      const repairedExecution = {
        ...failedExecution,
        status: "completed",
        outputStatus: "completed",
        error: undefined,
        blocks: failedExecution.blocks.map((block) => ({
          ...block,
          status: "completed",
          error: undefined,
        })),
        updatedAt: new Date().toISOString(),
      } as ProcessExecution;
      const repairedResponse = await jsonRequest<ProcessExecution>(
        `${baseUrl}/api/executions/${repairedExecution.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(repairedExecution),
        },
      );
      assert.equal(repairedResponse.response.status, 200, repairedResponse.body.error);

      const resumed = await jsonRequest<OrchestratorState>(
        `${baseUrl}/api/orchestrators/${first.body.orchestrator.id}/resume`,
        { method: "POST" },
      );
      assert.equal(resumed.response.status, 200, resumed.body.error);
      assert.equal(resumed.body.orchestrator.status, "awaiting_human");
      assert.equal(resumed.body.orchestrator.currentStep, 1);
      assert.equal(resumed.body.executions.length, 2, "a retomada repetiu uma etapa concluída");

      const stoppedResumed = await jsonRequest<OrchestratorState>(
        `${baseUrl}/api/orchestrators/${first.body.orchestrator.id}/stop`,
        { method: "POST" },
      );
      assert.equal(stoppedResumed.response.status, 200, stoppedResumed.body.error);
      assert.equal(stoppedResumed.body.orchestrator.status, "cancelled");

      const second = await jsonRequest<OrchestratorState>(`${baseUrl}/api/orchestrators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel.id,
          mode: "batch",
          quantity: 2,
          projectPrefix: "Stop",
        }),
      });
      assert.equal(second.response.status, 201, second.body.error);
      assert.equal(
        second.body.executions.length,
        1,
        "a fila abriu mais de uma execução em paralelo",
      );

      const protectedDelete = await jsonRequest<{ error: string }>(
        `${baseUrl}/api/projects/${second.body.orchestrator.currentProjectId}`,
        { method: "DELETE" },
      );
      assert.equal(protectedDelete.response.status, 409);
      assert.match(protectedDelete.body.error, /Pare a fila/);

      const stopped = await jsonRequest<OrchestratorState>(
        `${baseUrl}/api/orchestrators/${second.body.orchestrator.id}/stop`,
        { method: "POST" },
      );
      assert.equal(stopped.response.status, 200, stopped.body.error);
      assert.equal(stopped.body.orchestrator.status, "cancelled");
      assert.ok(stopped.body.orchestrator.stoppedAt);
      assert.equal(stopped.body.projects.length, 2, "o Stop removeu projetos criados");
      assert.equal(stopped.body.executions[0].status, "cancelled");

      const third = await jsonRequest<OrchestratorState>(`${baseUrl}/api/orchestrators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel.id,
          mode: "end_to_end",
          quantity: 1,
          projectPrefix: "Reinício",
        }),
      });
      assert.equal(third.response.status, 201, third.body.error);
      assert.equal(third.body.orchestrator.status, "awaiting_human");
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`);
    } finally {
      child.kill();
      if (child.exitCode === null)
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 3_000)),
        ]);
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  },
);
