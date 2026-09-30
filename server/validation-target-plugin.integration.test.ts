import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8795;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();
const pluginId = "dev.contentflow.validation-target-test";

type ExecutionState = {
  execution: {
    status: string;
    error?: string;
    blocks: Array<{ status: string; values: Record<string, unknown> }>;
  };
  jobs: unknown[];
};

async function request<T = unknown>(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  const text = response.status === 204 ? "" : await response.text();
  return { response, body: (text ? JSON.parse(text) : undefined) as T };
}

async function successfulRequest<T = unknown>(route: string, init?: RequestInit) {
  const result = await request<T>(route, init);
  assert.equal(result.response.ok, true, `${result.response.status} ${route}`);
  return result.body;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await request("/api/plugins")).response.ok) return;
    } catch {
      // The isolated API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

async function createValidationPlugin(directory: string) {
  await mkdir(directory, { recursive: true });
  const capability = (id: string, inputPorts: Array<{ key: string; label: string }>) => ({
    id,
    operator: "Código",
    blockTypes: ["VALIDAR"],
    processTypes: ["theme"],
    inputPorts: inputPorts.map((input) => ({
      ...input,
      shape: {
        kind: "content",
        family: "text",
        cardinality: "one",
        representation: "inline",
      },
      required: inputPorts.length === 1,
    })),
    outputPorts: [
      {
        key: "decision",
        label: "Decisão",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        required: true,
      },
    ],
    execution: { mode: "immediate" },
    sideEffects: [],
    cost: { model: "free", estimateSupported: false },
    dataPolicy: { sendsDataToThirdParties: false },
    blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { decision: { type: "string" } },
      required: ["decision"],
      additionalProperties: false,
    },
  });
  await writeFile(
    path.join(directory, "contentflow.plugin.json"),
    JSON.stringify(
      {
        apiVersion: "2",
        id: pluginId,
        name: "Validation target fixture",
        version: "1.0.0",
        description: "Fixture determinística para target de VALIDAR.",
        author: "ContentFlow",
        license: "proprietary",
        runtime: { kind: "node", version: ">=26 <27", module: "esm" },
        entrypoint: "handler.mjs",
        permissions: [],
        capabilities: [
          capability("validate-multiple", [
            { key: "first", label: "Primeira" },
            { key: "chosen", label: "Escolhida" },
          ]),
          capability("validate-single", [{ key: "only", label: "Única" }]),
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(directory, "handler.mjs"),
    `export async function execute(request) {
      const value = request.inputs.chosen ?? request.inputs.only;
      if (value !== "A") {
        return { status: "error", code: "WRONG_TARGET", message: "Target incorreto", retryable: false };
      }
      if (request.capabilityId === "validate-multiple" && request.inputs.first !== undefined) {
        return { status: "error", code: "WRONG_PORT", message: "Porta incorreta", retryable: false };
      }
      return { status: "success", values: { decision: "approved" } };
    }`,
  );
}

test("plugin VALIDAR uses only the explicit target output and target port", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "contentflow-validation-target-"));
  const dataDirectory = path.join(root, "data");
  const pluginDirectory = path.join(root, "plugin");
  await createValidationPlugin(pluginDirectory);
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
      body: JSON.stringify({ path: pluginDirectory }),
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
        id: "validation-target-channel",
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

    async function createExecution(caseId: string, capabilityId: string, targetPortKey?: string) {
      const projectId = `project-${caseId}`;
      const executionId = `execution-${caseId}`;
      const createBlock = (id: string, order: number) => ({
        id,
        type: "CRIAR",
        operator: "Humano",
        name: id,
        inputs: [],
        outputs: [
          {
            id: `${id}-output`,
            label: "Valor",
            key: "value",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
        parameters: [],
        order,
      });
      const blocks = [
        createBlock("target-a", 0),
        createBlock("immediately-before", 1),
        {
          id: "review",
          type: "VALIDAR",
          operator: "Código",
          name: "Revisar",
          inputs: [],
          outputs: [
            {
              id: "decision-output",
              label: "Decisão",
              key: "decision",
              shape: { kind: "control", control: "approval", cardinality: "one" },
              required: true,
              portKey: "decision",
            },
          ],
          validation: {
            targetBlockId: "target-a",
            targetOutputKey: "value",
            targetPortKey,
            mode: "approval",
            onReject: "pause",
            maxAttempts: 3,
          },
          plugin: { pluginId, capabilityId, configuration: {} },
          parameters: [],
          order: 2,
        },
      ];
      await successfulRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          title: caseId,
          channelId: "validation-target-channel",
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
          channelId: "validation-target-channel",
          processType: "theme",
          methodSnapshot: {
            contractVersion: 3,
            name: "Validation target",
            processType: "theme",
            blocks,
          },
          blocks: [
            { blockId: "target-a", status: "completed", values: { value: "A" }, attempt: 1 },
            {
              blockId: "immediately-before",
              status: "completed",
              values: { value: "B" },
              attempt: 1,
            },
            {
              blockId: "review",
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
      return executionId;
    }

    const validId = await createExecution("explicit", "validate-multiple", "chosen");
    let valid: ExecutionState | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      valid = await successfulRequest<ExecutionState>(`/api/executions/${validId}/state`);
      if (valid.execution.blocks[2].status === "completed" || valid.execution.status === "failed")
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(valid);
    assert.equal(valid.execution.blocks[2].status, "completed", serverOutput.join("\n"));
    assert.equal(valid.execution.blocks[2].values.decision, "approved");
    assert.equal(valid.jobs.length, 1);

    const missingId = await createExecution("missing-port", "validate-single");
    let missing: ExecutionState | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      missing = await successfulRequest<ExecutionState>(`/api/executions/${missingId}/state`);
      if (missing.execution.status === "failed" || missing.jobs.length) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(missing);
    assert.equal(missing.execution.status, "failed");
    assert.match(missing.execution.error ?? "", /Vincule explicitamente uma porta compatível/);
    assert.deepEqual(missing.jobs, [], "missing targetPortKey must fail before job creation");
  } finally {
    if (server.exitCode === null) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill();
      });
    }
    await rm(root, { recursive: true, force: true });
  }
});
