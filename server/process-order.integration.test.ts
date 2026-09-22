import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type ProcessExecution,
  type Project,
  type UniversalProcess,
} from "../src/lib/domain";
import { createProcessOutputFields } from "../src/lib/human-workflow";
import type { ExecutionOrchestrator } from "../src/lib/execution-orchestrator";

const alternate: UniversalProcess[] = [
  "theme",
  "script",
  "title",
  "thumbnail",
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
  assert.ok(address && typeof address === "object");
  server.close();
  await once(server, "close");
  return address.port;
}

async function api<T>(base: string, route: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as T & { error?: string };
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${payload.error ?? ""}`);
  return payload;
}

function fixtureChannel(order: UniversalProcess[]): Channel {
  const methods = createEmptyMethods();
  for (const processType of PROCESS_ORDER) {
    methods[processType] = {
      name: `Congelado ${processType}`,
      processType,
      blocks: [
        {
          id: `block-${processType}`,
          type: "CRIAR",
          operator: "Humano",
          order: 0,
          name: `Executar ${processType}`,
          inputs: [],
          outputs: [],
          parameters: [],
        },
      ],
    };
  }
  return {
    id: randomUUID(),
    name: "Canal sintético",
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 0,
    frequency: "Semanal",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    processOrder: order,
    createdAt: new Date().toISOString(),
  };
}

function outputValue(processType: UniversalProcess) {
  const field = createProcessOutputFields(processType)[0];
  const file = {
    id: randomUUID(),
    name: `${processType}.bin`,
    size: 12,
    mimeType:
      processType === "narration"
        ? "audio/mpeg"
        : processType === "thumbnail"
          ? "image/png"
          : "video/mp4",
    url: "/api/files/synthetic",
  };
  const value = ["image", "audio", "video"].includes(field.type)
    ? file
    : field.type === "files"
      ? [file]
      : processType === "publishing"
        ? "https://example.com/video"
        : `final ${processType}`;
  return { [field.key]: value };
}

test(
  "two end-to-end orders finish eight stages and keep the first method revision",
  { timeout: 90_000 },
  async () => {
    const port = await availablePort();
    const directory = mkdtempSync(path.join(os.tmpdir(), "contentflow-process-order-"));
    const base = `http://127.0.0.1:${port}`;
    let child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CONTENTFLOW_API_PORT: String(port), CONTENTFLOW_DATA_DIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let logs = "";
    const attachLogs = () => {
      child.stdout?.on("data", (chunk) => (logs += chunk.toString()));
      child.stderr?.on("data", (chunk) => (logs += chunk.toString()));
    };
    attachLogs();
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
        try {
          await api(base, "/api/channels");
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      for (const order of [[...PROCESS_ORDER], alternate]) {
        const channel = fixtureChannel(order);
        await api(base, "/api/channels", "POST", channel);
        const created = await api<{ orchestrator: ExecutionOrchestrator; projects: Project[] }>(
          base,
          "/api/orchestrators",
          "POST",
          { channelId: channel.id, mode: "end_to_end", quantity: 1 },
        );
        assert.equal(created.orchestrator.strategyVersion, 5);
        const id = created.orchestrator.id;
        for (const [index, processType] of order.entries()) {
          let state:
            | {
                orchestrator: ExecutionOrchestrator;
                projects: Project[];
                executions: ProcessExecution[];
              }
            | undefined;
          for (let poll = 0; poll < 100; poll += 1) {
            const current = await api<{
              orchestrator: ExecutionOrchestrator;
              projects: Project[];
              executions: ProcessExecution[];
            }>(base, `/api/orchestrators/${id}/state`);
            state = current;
            if (
              current.orchestrator.currentStep === index &&
              current.orchestrator.currentProcessType === processType &&
              current.executions.some((item) => item.processType === processType)
            )
              break;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.equal(
            state?.orchestrator.currentProcessType,
            processType,
            JSON.stringify(state?.orchestrator),
          );
          const execution = state!.executions.find((item) => item.processType === processType)!;
          assert.equal(execution.methodSnapshot.name, `Congelado ${processType}`);
          const human = await api<{
            result: { ok: boolean; completedProcess?: boolean; missing?: string[] };
          }>(base, "/api/commands", "POST", {
            id: randomUUID(),
            action: "completeHuman",
            executionId: execution.id,
            blockId: execution.blocks[0].blockId,
            attempt: 1,
            values: outputValue(processType),
          });
          assert.equal(human.result.ok, true, JSON.stringify(human.result));
          if (!human.result.completedProcess) {
            const output = await api<{ result: { ok: boolean; missing?: string[] } }>(
              base,
              "/api/commands",
              "POST",
              {
                id: randomUUID(),
                action: "completeOutput",
                executionId: execution.id,
                values: outputValue(processType),
              },
            );
            assert.equal(output.result.ok, true, JSON.stringify(output.result));
          }
          if (index === 0) {
            await api(base, `/api/channels/${channel.id}/methods/${order[1]}`, "PUT", {
              ...channel.methods[order[1]],
              name: "Alterado após iniciar",
            });
            const channels = await api<Channel[]>(base, "/api/channels");
            const revision =
              channels.find((item) => item.id === channel.id)!.definitionRevision ?? 0;
            await api(base, `/api/channels/${channel.id}/process-order`, "PUT", {
              processOrder: [...order].reverse(),
              definitionRevision: revision,
            });

            child.kill();
            if (child.exitCode === null) await once(child, "exit");
            child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
              cwd: process.cwd(),
              env: {
                ...process.env,
                CONTENTFLOW_API_PORT: String(port),
                CONTENTFLOW_DATA_DIR: directory,
              },
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
            attachLogs();
            for (let attempt = 0; attempt < 100; attempt += 1) {
              if (child.exitCode !== null) throw new Error(`Server exited after restart: ${logs}`);
              try {
                await api(base, "/api/channels");
                break;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            }
          }
        }
        let finished:
          | {
              orchestrator: ExecutionOrchestrator;
              projects: Project[];
              executions: ProcessExecution[];
            }
          | undefined;
        for (let poll = 0; poll < 100; poll += 1) {
          const current = await api<{
            orchestrator: ExecutionOrchestrator;
            projects: Project[];
            executions: ProcessExecution[];
          }>(base, `/api/orchestrators/${id}/state`);
          finished = current;
          if (current.orchestrator.status === "completed") break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(finished?.orchestrator.status, "completed");
        assert.deepEqual(finished?.projects[0].strategySnapshot?.processOrder, order);
        assert.equal(finished?.projects[0].progress, 100);
        assert.equal(finished?.executions.length, 8);
      }
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`);
    } finally {
      child.kill();
      if (child.exitCode === null)
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      assert.equal(path.dirname(directory), os.tmpdir());
      assert.ok(path.basename(directory).startsWith("contentflow-process-order-"));
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);

test(
  "batch V4 keeps custom order, frozen methods and persisted plan across restart",
  { timeout: 90_000 },
  async () => {
    const port = await availablePort();
    const directory = mkdtempSync(path.join(os.tmpdir(), "contentflow-batch-order-"));
    const base = `http://127.0.0.1:${port}`;
    let child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CONTENTFLOW_API_PORT: String(port), CONTENTFLOW_DATA_DIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let logs = "";
    const attachLogs = () => {
      child.stdout?.on("data", (chunk) => (logs += chunk.toString()));
      child.stderr?.on("data", (chunk) => (logs += chunk.toString()));
    };
    const waitForServer = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
        try {
          await api(base, "/api/channels");
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      throw new Error(`Server did not start: ${logs}`);
    };
    attachLogs();
    try {
      await waitForServer();
      const channel = fixtureChannel(alternate);
      await api(base, "/api/channels", "POST", channel);
      const created = await api<{
        orchestrator: ExecutionOrchestrator;
        projects: Project[];
        executions: ProcessExecution[];
      }>(base, "/api/orchestrators", "POST", {
        channelId: channel.id,
        mode: "batch",
        quantity: 2,
        projectPrefix: "Lote ordenado",
      });
      assert.equal(created.orchestrator.strategyVersion, 5);
      assert.deepEqual(created.orchestrator.processOrder, alternate);
      assert.equal(created.orchestrator.plannedSteps?.length, 13);
      const projectIds = created.projects.map((project) => project.id);
      assert.equal(projectIds.length, 2);

      const expected: Array<{ projectId: string; processType: UniversalProcess }> = [
        { projectId: projectIds[0], processType: "theme" },
        { projectId: projectIds[1], processType: "theme" },
        { projectId: projectIds[0], processType: "script" },
        { projectId: projectIds[1], processType: "script" },
        { projectId: projectIds[0], processType: "title" },
        { projectId: projectIds[1], processType: "title" },
        { projectId: projectIds[0], processType: "thumbnail" },
        { projectId: projectIds[1], processType: "thumbnail" },
        { projectId: projectIds[0], processType: "narration" },
        { projectId: projectIds[1], processType: "narration" },
        { projectId: projectIds[0], processType: "assets" },
        { projectId: projectIds[1], processType: "assets" },
        { projectId: projectIds[0], processType: "editing" },
        { projectId: projectIds[1], processType: "editing" },
        { projectId: projectIds[0], processType: "publishing" },
        { projectId: projectIds[1], processType: "publishing" },
      ];

      for (const [eventIndex, event] of expected.entries()) {
        let state:
          | {
              orchestrator: ExecutionOrchestrator;
              projects: Project[];
              executions: ProcessExecution[];
            }
          | undefined;
        for (let poll = 0; poll < 150; poll += 1) {
          const current = await api<{
            orchestrator: ExecutionOrchestrator;
            projects: Project[];
            executions: ProcessExecution[];
          }>(base, `/api/orchestrators/${created.orchestrator.id}/state`);
          state = current;
          const execution = current.executions.find(
            (item) => item.projectId === event.projectId && item.processType === event.processType,
          );
          if (
            current.orchestrator.currentProjectId === event.projectId &&
            current.orchestrator.currentProcessType === event.processType &&
            execution
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.ok(state);
        assert.equal(state.orchestrator.currentProjectId, event.projectId);
        assert.equal(state.orchestrator.currentProcessType, event.processType);
        const execution = state.executions.find(
          (item) => item.projectId === event.projectId && item.processType === event.processType,
        )!;
        assert.equal(execution.methodSnapshot.name, `Congelado ${event.processType}`);

        const human = await api<{
          result: { ok: boolean; completedProcess?: boolean; missing?: string[] };
        }>(base, "/api/commands", "POST", {
          id: randomUUID(),
          action: "completeHuman",
          executionId: execution.id,
          blockId: execution.blocks[0].blockId,
          attempt: 1,
          values: outputValue(event.processType),
        });
        assert.equal(human.result.ok, true, JSON.stringify(human.result));
        if (!human.result.completedProcess) {
          const output = await api<{ result: { ok: boolean; missing?: string[] } }>(
            base,
            "/api/commands",
            "POST",
            {
              id: randomUUID(),
              action: "completeOutput",
              executionId: execution.id,
              values: outputValue(event.processType),
            },
          );
          assert.equal(output.result.ok, true, JSON.stringify(output.result));
        }

        if (eventIndex === 0) {
          const channels = await api<Channel[]>(base, "/api/channels");
          const stored = channels.find((item) => item.id === channel.id)!;
          await api(base, `/api/channels/${channel.id}/methods/script`, "PUT", {
            ...stored.methods.script,
            name: "Método alterado depois do lote",
            definitionRevision: stored.definitionRevision ?? 0,
          });
          const refreshed = await api<Channel[]>(base, "/api/channels");
          const revision =
            refreshed.find((item) => item.id === channel.id)!.definitionRevision ?? 0;
          await api(base, `/api/channels/${channel.id}/process-order`, "PUT", {
            processOrder: [...PROCESS_ORDER],
            definitionRevision: revision,
          });
        }

        if (eventIndex === 2) {
          child.kill();
          if (child.exitCode === null) await once(child, "exit");
          child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              CONTENTFLOW_API_PORT: String(port),
              CONTENTFLOW_DATA_DIR: directory,
            },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          });
          attachLogs();
          await waitForServer();
          const restarted = await api<{
            orchestrator: ExecutionOrchestrator;
            projects: Project[];
            executions: ProcessExecution[];
          }>(base, `/api/orchestrators/${created.orchestrator.id}/state`);
          assert.equal(restarted.orchestrator.strategyVersion, 5);
          assert.deepEqual(restarted.orchestrator.processOrder, alternate);
          assert.equal(restarted.orchestrator.plannedSteps?.length, 13);
        }
      }

      let finished:
        | {
            orchestrator: ExecutionOrchestrator;
            projects: Project[];
            executions: ProcessExecution[];
          }
        | undefined;
      for (let poll = 0; poll < 150; poll += 1) {
        const current = await api<{
          orchestrator: ExecutionOrchestrator;
          projects: Project[];
          executions: ProcessExecution[];
        }>(base, `/api/orchestrators/${created.orchestrator.id}/state`);
        finished = current;
        if (current.orchestrator.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(finished);
      assert.equal(finished.orchestrator.status, "completed", JSON.stringify(finished));
      assert.equal(finished.executions.length, 16);
      for (const project of finished.projects) {
        assert.deepEqual(project.strategySnapshot?.processOrder, alternate);
        assert.equal(project.progress, 100);
      }
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
  },
);
