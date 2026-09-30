import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { BlockFieldDefinition } from "../src/lib/domain";

const port = 8794;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();
const pluginId = "com.contentflow.kit-text-demo";

type ExecutionStateResponse = {
  execution: {
    status: string;
    error?: string;
    blocks: Array<{ status: string; values: Record<string, unknown> }>;
    deliveries?: Array<{ outputKey: string }>;
  };
  jobs: unknown[];
};

async function request<T = unknown>(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  const responseText = response.status === 204 ? "" : await response.text();
  const body = (responseText ? JSON.parse(responseText) : undefined) as T;
  return { response, body };
}

async function successfulRequest<T = unknown>(route: string, init?: RequestInit) {
  const result = await request<T>(route, init);
  assert.equal(result.response.ok, true, `${result.response.status} ${route}`);
  return result.body;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const { response } = await request("/api/plugins");
      if (response.ok) return;
    } catch {
      // The isolated API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

test("runtime requires explicit output bindings before creating a plugin job", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-output-contract-"));
  const serverOutput: string[] = [];
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
  server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

  try {
    await waitForServer();
    await successfulRequest("/api/plugins/link-development-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: path.join(
          repositoryRoot,
          "ecosystem",
          "plugins",
          "examples",
          "kit-generated-text-transform",
        ),
      }),
    });
    await successfulRequest(`/api/plugins/${pluginId}/consent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    const now = new Date().toISOString();
    await successfulRequest("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "output-contract-channel",
        name: "Canal de teste",
        language: "pt-BR",
        niche: "Teste",
        createdAt: now,
      }),
    });

    const stages = Object.fromEntries(
      ["theme", "title", "thumbnail", "script", "narration", "assets", "editing", "publishing"].map(
        (processType) => [processType, processType === "theme" ? "processing" : "not_started"],
      ),
    );

    async function createExecution(caseId: string, output: BlockFieldDefinition) {
      const projectId = `project-${caseId}`;
      const executionId = `execution-${caseId}`;
      const block = {
        id: "create-script",
        type: "CRIAR",
        operator: "Código",
        name: "Criar roteiro",
        inputs: [
          {
            id: "source",
            label: "Texto",
            type: "textarea",
            source: "static",
            staticValue: "explicit output",
            binding: { kind: "static", value: "explicit output" },
            portKey: "content",
          },
        ],
        outputs: [output],
        plugin: { pluginId, capabilityId: "demo", configuration: {} },
        parameters: [],
        order: 0,
      };

      await successfulRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          title: caseId,
          channelId: "output-contract-channel",
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
      await successfulRequest("/api/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: executionId,
          projectId,
          channelId: "output-contract-channel",
          processType: "theme",
          methodSnapshot: { processType: "theme", blocks: [block] },
          blocks: [
            {
              blockId: block.id,
              status: "blocked_executor",
              values: {},
              attempt: 1,
              startedAt: now,
            },
          ],
          status: "blocked_executor",
          outputStatus: "pending",
          createdAt: now,
          updatedAt: now,
        }),
      });
      return { projectId, executionId, blockId: block.id };
    }

    const valid = await createExecution("valid", {
      id: "script-output",
      label: "Roteiro",
      key: "script",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      required: true,
      portKey: "result",
    });
    let validState: ExecutionStateResponse | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      validState = await successfulRequest<ExecutionStateResponse>(
        `/api/executions/${valid.executionId}/state`,
      );
      if (
        validState.execution.blocks[0].status === "completed" ||
        validState.execution.status === "failed"
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(validState);
    assert.equal(validState.execution.blocks[0].status, "completed", serverOutput.join("\n"));
    assert.equal(validState.execution.status, "awaiting_output");
    assert.equal(validState.execution.blocks[0].values.script, "EXPLICIT OUTPUT");
    assert.equal(validState.execution.deliveries?.[0].outputKey, "script");

    const invalidOutputs: Array<[string, BlockFieldDefinition]> = [
      [
        "missing-port-key",
        {
          id: "script-output",
          label: "Roteiro",
          key: "script",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          required: true,
        },
      ],
      [
        "unknown-port-key",
        {
          id: "script-output",
          label: "Roteiro",
          key: "script",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          required: true,
          portKey: "missing",
        },
      ],
      [
        "incompatible-port-type",
        {
          id: "script-output",
          label: "Roteiro",
          key: "script",
          shape: { kind: "control", control: "number", cardinality: "one" },
          required: true,
          portKey: "result",
        },
      ],
    ];

    for (const [caseId, output] of invalidOutputs) {
      const target = await createExecution(caseId, output);
      let state: ExecutionStateResponse | undefined;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        state = await successfulRequest<ExecutionStateResponse>(
          `/api/executions/${target.executionId}/state`,
        );
        if (state.execution.status === "failed" || state.jobs.length) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(state);
      assert.equal(state.execution.status, "failed", caseId);
      assert.match(state.execution.error ?? "", /não consegue entregar/i);
      assert.deepEqual(state.jobs, [], `${caseId} must fail before job creation`);
    }
  } finally {
    if (server.exitCode === null) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill();
      });
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
