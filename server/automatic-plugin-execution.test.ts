import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8790;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

type AutomaticExecutionState = {
  status: string;
  error?: string;
  blocks: Array<{ status: string; values: Record<string, unknown> }>;
  output?: { values: Record<string, unknown> };
};

async function request(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${route}: ${await response.text()}`);
  }
  return response.status === 204 ? undefined : response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await request("/api/plugins");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

test("encadeia blocos de plugin automaticamente sem ação por etapa", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-auto-execution-"));
  const output: string[] = [];
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));

  try {
    await waitForServer();
    await request("/api/plugins/link-development-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: path.join(repositoryRoot, "plugins", "examples", "kit-generated-text-transform"),
      }),
    });
    await request("/api/plugins/com.contentflow.kit-text-demo/consent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    const now = new Date().toISOString();
    const stages = Object.fromEntries(
      ["theme", "title", "thumbnail", "script", "narration", "assets", "editing", "publishing"].map(
        (processType) => [processType, processType === "theme" ? "processing" : "not_started"],
      ),
    );
    const plugin = {
      pluginId: "com.contentflow.kit-text-demo",
      capabilityId: "demo",
      configuration: {},
    };
    const blocks = [
      {
        id: "block-one",
        type: "CRIAR",
        operator: "Código",
        name: "Primeiro",
        inputs: [
          {
            id: "input-one",
            label: "Texto",
            type: "textarea",
            source: "static",
            staticValue: "hello",
          },
        ],
        outputs: [
          {
            id: "output-one",
            label: "Intermediário",
            key: "intermediate",
            type: "textarea",
            required: true,
          },
        ],
        plugin,
        parameters: [],
        order: 0,
      },
      {
        id: "block-two",
        type: "CRIAR",
        operator: "Código",
        name: "Segundo",
        inputs: [
          {
            id: "input-two",
            label: "Texto",
            type: "textarea",
            source: "previous_block",
            blockId: "block-one",
            sourceKey: "intermediate",
          },
        ],
        outputs: [
          {
            id: "output-two",
            label: "Tema final",
            key: "theme",
            type: "textarea",
            required: true,
          },
        ],
        plugin,
        parameters: [],
        order: 1,
      },
    ];

    await request("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test-channel",
        name: "Canal de teste",
        language: "pt-BR",
        niche: "Teste",
        createdAt: now,
      }),
    });
    await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test-project",
        title: "Projeto de teste",
        channelId: "test-channel",
        currentStage: "theme",
        state: "processing",
        progress: 0,
        deadline: "Sem prazo",
        duration: "—",
        updatedAt: "Agora",
        createdAt: now,
        stages,
        assignee: { name: "Teste", initials: "T" },
        thumbHue: 0,
      }),
    });
    await request("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test-execution",
        projectId: "test-project",
        channelId: "test-channel",
        processType: "theme",
        methodSnapshot: { processType: "theme", blocks },
        blocks: [
          {
            blockId: "block-one",
            status: "blocked_executor",
            values: {},
            attempt: 1,
            startedAt: now,
          },
          { blockId: "block-two", status: "pending", values: {}, attempt: 1 },
        ],
        status: "blocked_executor",
        outputStatus: "pending",
        createdAt: now,
        updatedAt: now,
      }),
    });

    let execution: AutomaticExecutionState | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = (await request("/api/executions/test-execution/state")) as {
        execution: AutomaticExecutionState;
      };
      execution = state.execution;
      if (execution?.status === "completed" || execution?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.ok(execution, "a execução deve existir");
    assert.equal(execution.status, "completed", execution.error ?? output.join("\n"));
    assert.deepEqual(
      execution.blocks.map((block) => block.status),
      ["completed", "completed"],
    );
    assert.equal(execution.blocks[0].values.intermediate, "HELLO");
    assert.equal(execution.blocks[1].values.theme, "HELLO");
    assert.equal(execution.output?.values.theme, "HELLO");
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
