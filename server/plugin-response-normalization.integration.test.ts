import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8798;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();
const pluginId = "com.contentflow.response-contract-test";

type ExecutionStateResponse = {
  execution: {
    status: string;
    error?: string;
    blocks: Array<{ status: string; values: Record<string, unknown> }>;
    deliveries?: Array<{ outputKey: string; status: string; value?: unknown }>;
  };
  jobs: Array<{ status: string; partialValues: Record<string, unknown>; error?: string }>;
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

test("executor responses cross one technical-to-strategic boundary before Core completion", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-response-normalization-"));
  const pluginDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-response-plugin-"));
  await writeFile(
    path.join(pluginDirectory, "contentflow.plugin.json"),
    JSON.stringify({
      apiVersion: "1",
      id: pluginId,
      name: "Response contract test",
      version: "1.0.0",
      description: "Fixture focal de normalização de resposta.",
      author: "ContentFlow",
      license: "LicenseRef-ContentFlow-Test-1.0",
      runtime: { kind: "node", version: ">=26 <27", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      deliveryTypes: ["text"],
      capabilities: [
        {
          id: "respond",
          operator: "Código",
          blockTypes: ["CRIAR"],
          inputPorts: [],
          outputPorts: [
            {
              key: "generated_text",
              label: "Generated text",
              producedTypes: ["textarea"],
              required: true,
            },
          ],
          producedOutputTypes: ["textarea"],
          execution: { mode: "immediate", defaultTimeoutMs: 30_000 },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: { type: "object", additionalProperties: true },
          outputSchema: { type: "object", additionalProperties: true },
        },
        {
          id: "respond-async",
          operator: "Código",
          blockTypes: ["CRIAR"],
          inputPorts: [],
          outputPorts: [
            {
              key: "generated_text",
              label: "Generated text",
              producedTypes: ["textarea"],
              required: true,
            },
          ],
          producedOutputTypes: ["textarea"],
          execution: {
            mode: "async",
            defaultTimeoutMs: 30_000,
            supportsCancellation: false,
            maxConcurrency: 1,
          },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: { type: "object", additionalProperties: true },
          outputSchema: { type: "object", additionalProperties: true },
        },
      ],
    }),
  );
  await writeFile(
    path.join(pluginDirectory, "handler.mjs"),
    `export async function execute(request) {
      const mode = request.configuration.mode;
      if (mode === "pending-valid") return { status: "pending", jobId: "pending-valid", pollAfterMs: 30000, partialValues: { generated_text: "PARTIAL" } };
      if (mode === "pending-alias") return { status: "pending", jobId: "pending-alias", pollAfterMs: 30000, partialValues: { script: "INVALID" } };
      if (mode === "error-valid") return { status: "error", code: "FIXTURE_ERROR", message: "Falha terminal esperada.", retryable: false, partialValues: { generated_text: "PARTIAL" } };
      if (mode === "error-alias") return { status: "error", code: "FIXTURE_ERROR", message: "Falha terminal esperada.", retryable: false, partialValues: { script: "INVALID" } };
      if (mode === "strategic-alias") return { status: "success", values: { script: "INVALID" } };
      if (mode === "generic-result") return { status: "success", values: { result: "INVALID" } };
      if (mode === "unknown") return { status: "success", values: { generated_text: "VALID", garbage: "INVALID" } };
      if (mode === "wrong-type") return { status: "success", values: { generated_text: 42 } };
      if (mode === "missing") return { status: "success", values: {} };
      return { status: "success", values: { generated_text: "CANONICAL" } };
    }`,
  );

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
        id: "response-contract-channel",
        name: "Canal",
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

    async function run(
      caseId: string,
      mode: string,
      capabilityId = "respond",
      expectedJobStatus: "completed" | "failed" | "pending" = "completed",
    ) {
      const projectId = `response-project-${caseId}`;
      const executionId = `response-execution-${caseId}`;
      const block = {
        id: "create-script",
        type: "CRIAR",
        operator: "Código",
        name: "Criar roteiro",
        inputs: [],
        outputs: [
          {
            id: "script-output",
            label: "Roteiro",
            key: "script",
            portKey: "generated_text",
            type: "textarea",
            required: true,
          },
        ],
        plugin: { pluginId, capabilityId, configuration: { mode } },
        parameters: [],
        order: 0,
      };
      await successfulRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          title: caseId,
          channelId: "response-contract-channel",
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
          channelId: "response-contract-channel",
          processType: "theme",
          methodSnapshot: {
            contractVersion: 2,
            name: "Response",
            processType: "theme",
            blocks: [block],
          },
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
      let state: ExecutionStateResponse | undefined;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        state = await successfulRequest<ExecutionStateResponse>(
          `/api/executions/${executionId}/state`,
        );
        if (state.jobs[0]?.status === expectedJobStatus) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(state, serverOutput.join("\n"));
      return state;
    }

    const valid = await run("valid", "canonical");
    assert.equal(valid.execution.blocks[0]?.status, "completed", serverOutput.join("\n"));
    assert.deepEqual(valid.execution.blocks[0]?.values, { script: "CANONICAL" });
    assert.equal(Object.hasOwn(valid.execution.blocks[0]!.values, "generated_text"), false);
    assert.deepEqual(
      valid.execution.deliveries?.map((delivery) => delivery.outputKey),
      ["script"],
    );

    for (const mode of ["strategic-alias", "generic-result", "unknown", "wrong-type", "missing"]) {
      const invalid = await run(mode, mode, "respond", "failed");
      assert.equal(invalid.execution.status, "failed", mode);
      assert.equal(invalid.execution.blocks[0]?.status, "failed", mode);
      assert.deepEqual(invalid.execution.blocks[0]?.values, {}, mode);
      assert.equal(
        invalid.execution.deliveries?.some((delivery) => delivery.status === "completed") ?? false,
        false,
        mode,
      );
      assert.equal(invalid.jobs[0]?.status, "failed", mode);
      assert.deepEqual(invalid.jobs[0]?.partialValues, {}, mode);
      assert.match(invalid.jobs[0]?.error ?? "", /contrato de outputs/i, mode);
    }

    const pending = await run("pending-valid", "pending-valid", "respond-async", "pending");
    assert.equal(pending.execution.blocks[0]?.status, "in_progress");
    assert.deepEqual(pending.execution.blocks[0]?.values, { script: "PARTIAL" });
    assert.deepEqual(pending.jobs[0]?.partialValues, { script: "PARTIAL" });
    assert.equal(pending.execution.deliveries?.at(-1)?.status, "partial");

    const terminalError = await run("error-valid", "error-valid", "respond-async", "failed");
    assert.equal(terminalError.execution.blocks[0]?.status, "failed");
    assert.deepEqual(terminalError.execution.blocks[0]?.values, { script: "PARTIAL" });
    assert.deepEqual(terminalError.jobs[0]?.partialValues, { script: "PARTIAL" });
    assert.equal(terminalError.execution.deliveries?.at(-1)?.status, "partial");

    for (const mode of ["pending-alias", "error-alias"]) {
      const invalidPartial = await run(mode, mode, "respond-async", "failed");
      assert.deepEqual(invalidPartial.execution.blocks[0]?.values, {}, mode);
      assert.deepEqual(invalidPartial.jobs[0]?.partialValues, {}, mode);
      assert.match(invalidPartial.jobs[0]?.error ?? "", /contrato de outputs/i, mode);
    }
  } finally {
    if (server.exitCode === null) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill();
      });
    }
    await rm(dataDirectory, { recursive: true, force: true });
    await rm(pluginDirectory, { recursive: true, force: true });
  }
});
