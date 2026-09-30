import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const port = 8791;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

async function request(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  if (!response.ok) throw new Error(`${response.status} ${route}: ${await response.text()}`);
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

test("preserva itens concluídos e continua na próxima conta após falha técnica", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-profile-fallback-"));
  const pluginDirectory = path.join(dataDirectory, "test-browser-plugin");
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    path.join(pluginDirectory, "contentflow.plugin.json"),
    JSON.stringify({
      apiVersion: "2",
      id: "test.contentflow.browser-fallback",
      name: "Browser fallback test",
      version: "1.0.0",
      description: "Fixture isolada para fallback técnico.",
      author: "ContentFlow tests",
      license: "MIT",
      runtime: { kind: "node", version: ">=26 <27", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      profileSetup: {
        configurationKey: "accountProfile",
        fallbackConfigurationKey: "fallbackAccountProfiles",
        label: "Salvar perfil",
      },
      capabilities: [
        {
          id: "sequential-items",
          operator: "Código",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: [
            {
              key: "prompts",
              label: "Prompts",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "many",
                representation: "inline",
              },
              required: true,
            },
          ],
          outputPorts: [
            {
              key: "results",
              label: "Resultados",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "many",
                representation: "inline",
              },
              required: true,
            },
          ],
          execution: {
            mode: "immediate",
            maxConcurrency: 1,
            itemOrchestration: {
              inputPort: "prompts",
              outputPort: "results",
              mode: "sequential",
            },
          },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              accountProfile: { type: "string", default: "primary" },
              fallbackAccountProfiles: { type: "string", default: "" },
            },
          },
          outputSchema: {
            type: "object",
            additionalProperties: false,
            properties: { results: { type: "array" } },
            required: ["results"],
          },
        },
      ],
    }),
  );
  await writeFile(
    path.join(pluginDirectory, "handler.mjs"),
    `export async function execute(request) {
      if (request.invocation.mode === "configure") return { status: "success", values: { ready: true } };
      const profile = request.configuration.accountProfile;
      const prompt = request.inputs.prompts;
      if (prompt === "hang" || (Array.isArray(prompt) && prompt.includes("hang"))) {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }
      if (profile === "primary" && prompt === "two") {
        return { status: "error", code: "UPSTREAM_UNAVAILABLE", message: "temporary", retryable: true };
      }
      return { status: "success", values: { results: profile + ":" + prompt } };
    }`,
  );

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
      body: JSON.stringify({ path: pluginDirectory }),
    });
    await request("/api/plugins/test.contentflow.browser-fallback/consent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    for (const name of ["Primary", "Backup"]) {
      await request("/api/plugins/test.contentflow.browser-fallback/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }

    const now = new Date().toISOString();
    await request("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fallback-channel",
        name: "Fallback",
        language: "pt-BR",
        niche: "Teste",
        createdAt: now,
      }),
    });
    await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fallback-project",
        title: "Fallback",
        channelId: "fallback-channel",
        currentStage: "theme",
        state: "processing",
        progress: 0,
        deadline: "Sem prazo",
        duration: "—",
        updatedAt: "Agora",
        createdAt: now,
        stages: Object.fromEntries(
          [
            "theme",
            "title",
            "thumbnail",
            "script",
            "narration",
            "assets",
            "editing",
            "publishing",
          ].map((processType) => [
            processType,
            processType === "theme" ? "processing" : "not_started",
          ]),
        ),
        assignee: { name: "Teste", initials: "T" },
        thumbHue: 0,
      }),
    });
    const block = {
      id: "fallback-block",
      type: "CRIAR",
      operator: "Código",
      name: "Itens",
      inputs: [
        {
          id: "prompts",
          label: "Prompts",
          shape: {
            kind: "content",
            family: "text",
            cardinality: "many",
            representation: "inline",
          },
          binding: { kind: "runtime" },
          portKey: "prompts",
        },
      ],
      outputs: [
        {
          id: "results",
          label: "Resultados",
          key: "results",
          shape: {
            kind: "content",
            family: "text",
            cardinality: "many",
            representation: "inline",
          },
          required: true,
          portKey: "results",
        },
      ],
      plugin: {
        pluginId: "test.contentflow.browser-fallback",
        capabilityId: "sequential-items",
        configuration: {
          accountProfile: "primary",
          fallbackAccountProfiles: "backup",
        },
      },
      parameters: [],
      order: 0,
    };
    await request("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fallback-execution",
        projectId: "fallback-project",
        channelId: "fallback-channel",
        processType: "theme",
        methodSnapshot: {
          contractVersion: 3,
          name: "Fallback",
          processType: "theme",
          blocks: [block],
        },
        blocks: [
          {
            blockId: "fallback-block",
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
    const initialFallbackState = (await request("/api/executions/fallback-execution/state")) as {
      execution: { revision?: number };
    };
    await request("/api/executions/fallback-execution/blocks/fallback-block/runtime-inputs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: initialFallbackState.execution.revision ?? 0,
        values: { prompts: ["one", "two", "three"] },
      }),
    });

    let execution:
      | {
          status: string;
          error?: string;
          blocks: Array<{ status: string; values: Record<string, unknown> }>;
        }
      | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      execution = (
        (await request("/api/executions/fallback-execution/state")) as {
          execution: typeof execution;
        }
      ).execution;
      if (execution?.blocks[0]?.status === "completed" || execution?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.equal(execution?.blocks[0]?.status, "completed", execution?.error ?? output.join("\n"));
    assert.deepEqual(execution?.blocks[0]?.values.results, [
      "primary:one",
      "backup:two",
      "backup:three",
    ]);

    await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fallback-cancel-project",
        title: "Cancelamento ativo",
        channelId: "fallback-channel",
        currentStage: "theme",
        state: "processing",
        progress: 0,
        deadline: "Sem prazo",
        duration: "—",
        updatedAt: "Agora",
        createdAt: now,
        stages: Object.fromEntries(
          [
            "theme",
            "title",
            "thumbnail",
            "script",
            "narration",
            "assets",
            "editing",
            "publishing",
          ].map((processType) => [
            processType,
            processType === "theme" ? "processing" : "not_started",
          ]),
        ),
        assignee: { name: "Teste", initials: "T" },
        thumbHue: 0,
      }),
    });
    const hangingBlock = structuredClone(block);
    hangingBlock.id = "fallback-cancel-block";
    await request("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fallback-cancel-execution",
        projectId: "fallback-cancel-project",
        channelId: "fallback-channel",
        processType: "theme",
        methodSnapshot: {
          contractVersion: 3,
          name: "Fallback cancel",
          processType: "theme",
          blocks: [hangingBlock],
        },
        blocks: [
          {
            blockId: hangingBlock.id,
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
    const initialCancelState = (await request(
      "/api/executions/fallback-cancel-execution/state",
    )) as { execution: { revision?: number } };
    await request(
      "/api/executions/fallback-cancel-execution/blocks/fallback-cancel-block/runtime-inputs",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: initialCancelState.execution.revision ?? 0,
          values: { prompts: ["hang"] },
        }),
      },
    );

    const database = new Database(path.join(dataDirectory, "contentflow.sqlite"), {
      readonly: true,
    });
    try {
      let leaseObserved = false;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        leaseObserved = Boolean(
          database
            .prepare(
              `SELECT 1
               FROM browser_profile_leases AS lease
               JOIN plugin_jobs AS job ON job.id = lease.owner_id
               WHERE job.execution_id = ?`,
            )
            .get("fallback-cancel-execution"),
        );
        if (leaseObserved) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        leaseObserved,
        true,
        JSON.stringify({
          output,
          jobs: database
            .prepare(
              "SELECT id, execution_id, status, next_poll_at, lease_token, lease_until FROM plugin_jobs WHERE execution_id = ?",
            )
            .all("fallback-cancel-execution"),
          leases: database.prepare("SELECT * FROM browser_profile_leases").all(),
        }),
      );

      const cancelStartedAt = Date.now();
      await request("/api/executions/fallback-cancel-execution/cancel", { method: "POST" });
      let cancelled = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const row = database
          .prepare(
            "SELECT status FROM plugin_jobs WHERE execution_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get("fallback-cancel-execution") as { status?: string } | undefined;
        const lease = database
          .prepare(
            `SELECT 1
             FROM browser_profile_leases AS lease
             JOIN plugin_jobs AS job ON job.id = lease.owner_id
             WHERE job.execution_id = ?`,
          )
          .get("fallback-cancel-execution");
        cancelled = row?.status === "cancelled" && !lease;
        if (cancelled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        cancelled,
        true,
        JSON.stringify({
          output,
          jobs: database
            .prepare(
              "SELECT id, execution_id, status, next_poll_at, lease_token, lease_until, payload FROM plugin_jobs WHERE execution_id = ?",
            )
            .all("fallback-cancel-execution"),
          leases: database.prepare("SELECT * FROM browser_profile_leases").all(),
        }),
      );
      assert.ok(
        Date.now() - cancelStartedAt < 5_000,
        "o cancelamento ativo não interrompeu o worker a tempo",
      );
    } finally {
      database.close();
    }
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("perfil ocupado avança imediatamente para o próximo perfil preparado", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-profile-busy-fallback-"));
  const pluginDirectory = path.join(dataDirectory, "test-browser-plugin");
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    path.join(pluginDirectory, "contentflow.plugin.json"),
    JSON.stringify({
      apiVersion: "2",
      id: "test.contentflow.browser-busy-fallback",
      name: "Browser busy fallback test",
      version: "1.0.0",
      description: "Fixture isolada para fallback de perfil ocupado.",
      author: "ContentFlow tests",
      license: "MIT",
      runtime: { kind: "node", version: ">=26 <27", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      profileSetup: {
        configurationKey: "accountProfile",
        fallbackConfigurationKey: "fallbackAccountProfiles",
        label: "Salvar perfil",
      },
      capabilities: [
        {
          id: "generate",
          operator: "Código",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: [],
          outputPorts: [
            {
              key: "result",
              label: "Resultado",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
              required: true,
            },
          ],
          execution: { mode: "immediate", maxConcurrency: 1, defaultTimeoutMs: 30_000 },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              accountProfile: { type: "string", default: "primary" },
              fallbackAccountProfiles: { type: "string", default: "" },
            },
          },
          outputSchema: {
            type: "object",
            additionalProperties: false,
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      ],
    }),
  );
  await writeFile(
    path.join(pluginDirectory, "handler.mjs"),
    `export async function execute(request) {
      if (request.invocation.mode === "configure") return { status: "success", values: { ready: true } };
      return { status: "success", values: { result: request.configuration.accountProfile } };
    }`,
  );

  const busyPort = 8891;
  const busyApiBase = `http://127.0.0.1:${busyPort}`;
  const output: string[] = [];
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(busyPort),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));

  const busyRequest = async (route: string, init?: RequestInit) => {
    const response = await fetch(`${busyApiBase}${route}`, init);
    if (!response.ok) throw new Error(`${response.status} ${route}: ${await response.text()}`);
    return response.status === 204 ? undefined : response.json();
  };
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        await busyRequest("/api/plugins");
        break;
      } catch {
        if (attempt === 79) throw new Error(`A API isolada não iniciou.\n${output.join("\n")}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    await busyRequest("/api/plugins/link-development-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pluginDirectory }),
    });
    await busyRequest("/api/plugins/test.contentflow.browser-busy-fallback/consent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    const primary = (await busyRequest(
      "/api/plugins/test.contentflow.browser-busy-fallback/profiles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Primary" }),
      },
    )) as { id: string; alias: string };
    await busyRequest("/api/plugins/test.contentflow.browser-busy-fallback/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Backup" }),
    });

    const database = new Database(path.join(dataDirectory, "contentflow.sqlite"));
    try {
      const now = new Date();
      database
        .prepare(
          `INSERT INTO browser_profile_leases
            (profile_id, lease_token, owner_type, owner_id, plugin_id, acquired_at, heartbeat_at, expires_at)
           VALUES (?, ?, 'invocation', 'other-job', 'other.plugin', ?, ?, ?)`,
        )
        .run(
          `legacy:${primary.id}`,
          "busy-profile-test-token",
          now.toISOString(),
          now.toISOString(),
          new Date(now.getTime() + 60_000).toISOString(),
        );
    } finally {
      database.close();
    }

    const now = new Date().toISOString();
    await busyRequest("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "busy-channel",
        name: "Busy",
        language: "pt-BR",
        niche: "Teste",
        createdAt: now,
      }),
    });
    await busyRequest("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "busy-project",
        title: "Busy",
        channelId: "busy-channel",
        currentStage: "theme",
        state: "processing",
        progress: 0,
        deadline: "Sem prazo",
        duration: "—",
        updatedAt: "Agora",
        createdAt: now,
        stages: Object.fromEntries(
          [
            "theme",
            "title",
            "thumbnail",
            "script",
            "narration",
            "assets",
            "editing",
            "publishing",
          ].map((processType) => [
            processType,
            processType === "theme" ? "processing" : "not_started",
          ]),
        ),
        assignee: { name: "Teste", initials: "T" },
        thumbHue: 0,
      }),
    });
    const block = {
      id: "busy-block",
      type: "CRIAR",
      operator: "Código",
      name: "Gerar",
      inputs: [],
      outputs: [
        {
          id: "result",
          label: "Resultado",
          key: "result",
          shape: {
            kind: "content",
            family: "text",
            cardinality: "one",
            representation: "inline",
          },
          required: true,
          portKey: "result",
        },
      ],
      plugin: {
        pluginId: "test.contentflow.browser-busy-fallback",
        capabilityId: "generate",
        configuration: { accountProfile: "primary", fallbackAccountProfiles: "backup" },
      },
      parameters: [],
      order: 0,
    };
    await busyRequest("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "busy-execution",
        projectId: "busy-project",
        channelId: "busy-channel",
        processType: "theme",
        methodSnapshot: {
          contractVersion: 3,
          name: "Busy fallback",
          processType: "theme",
          blocks: [block],
        },
        blocks: [
          {
            blockId: "busy-block",
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

    let execution:
      | { status: string; blocks: Array<{ status: string; values: Record<string, unknown> }> }
      | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      execution = (
        (await busyRequest("/api/executions/busy-execution/state")) as {
          execution: typeof execution;
        }
      ).execution;
      if (execution?.blocks[0]?.status === "completed" || execution?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(execution?.blocks[0]?.status, "completed", output.join("\n"));
    assert.equal(execution?.blocks[0]?.values.result, "backup");
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
