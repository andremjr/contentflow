import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8798;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/api/health`);
      if (response.ok) return;
    } catch {
      // Starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

async function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("resolves dynamic options by managed profile with cache and explicit refresh", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-options-"));
  const pluginDirectory = path.join(dataDirectory, "plugins", "local", "dynamic-options");
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    path.join(pluginDirectory, "contentflow.plugin.json"),
    JSON.stringify(
      {
        apiVersion: "1",
        id: "com.contentflow.e2e-options",
        name: "Dynamic Options E2E",
        version: "1.0.0",
        description: "Fixture de opções dinâmicas.",
        author: "ContentFlow",
        license: "MIT",
        runtime: { kind: "node", version: ">=26 <27", module: "esm" },
        entrypoint: "handler.mjs",
        permissions: ["filesystem:read", "filesystem:write"],
        secretKeys: ["API_TOKEN"],
        profileSetup: { configurationKey: "profile", label: "Perfil" },
        capabilities: [
          {
            id: "generate",
            operator: "IA",
            blockTypes: ["CRIAR"],
            inputPorts: [],
            outputPorts: [
              { key: "result", label: "Resultado", producedTypes: ["text"], required: true },
            ],
            execution: { mode: "immediate" },
            sideEffects: [],
            cost: { model: "free", estimateSupported: false },
            dataPolicy: { sendsDataToThirdParties: false },
            blockConfigSchema: {
              type: "object",
              properties: {
                profile: { type: "string" },
                mode: { type: "string" },
                model: { type: "string" },
              },
            },
            configurationOptions: [
              {
                property: "model",
                providerId: "models",
                dependsOn: ["profile", "mode"],
                cacheTtlMs: 60000,
              },
            ],
            outputSchema: { type: "object" },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(pluginDirectory, "handler.mjs"),
    `import { readFile, writeFile } from "node:fs/promises";
export async function execute(request, services) {
  if (request.invocation.mode === "configure" && request.invocation.action === "options") {
    const connected = Boolean(await services.getSecret("API_TOKEN"));
    const counterPath = services.getWorkspacePath("options-counter.txt");
    let count = 0;
    try { count = Number(await readFile(counterPath, "utf8")) || 0; } catch {}
    count += 1;
    await writeFile(counterPath, String(count), "utf8");
    const profile = String(request.configuration.profile || "none");
    const mode = String(request.configuration.mode || "none");
    return { status: "success", values: { options: [{ value: profile + ":" + mode, label: "Call " + count + (connected ? " connected" : " disconnected") }] } };
  }
  return { status: "success", values: { result: "ok" } };
}`,
    "utf8",
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
    const pluginsResponse = await fetch(`${apiBase}/api/plugins`);
    assert.equal(pluginsResponse.ok, true, output.join("\n"));
    const consentResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-options/consent`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      },
    );
    assert.equal(consentResponse.ok, true, await consentResponse.text());

    const connectionResponse = await postJson(
      `${apiBase}/api/plugins/com.contentflow.e2e-options/connections`,
      { name: "Conta de teste", secrets: { API_TOKEN: "integration-secret" } },
    );
    const connection = (await connectionResponse.json()) as { id?: string; error?: string };
    assert.equal(connectionResponse.status, 201, JSON.stringify(connection));
    assert.ok(connection.id);

    for (const alias of ["perfil-a", "perfil-b"]) {
      const profileResponse = await postJson(
        `${apiBase}/api/plugins/com.contentflow.e2e-options/profiles`,
        { name: alias, alias },
      );
      assert.equal(profileResponse.ok, true, await profileResponse.text());
    }

    const url = `${apiBase}/api/plugins/com.contentflow.e2e-options/capabilities/generate/configuration-options/model`;
    const firstResponse = await postJson(url, {
      configuration: { profile: "perfil-a", mode: "image" },
      connectionId: connection.id,
    });
    const first = (await firstResponse.json()) as {
      options: Array<{ value: string; label: string }>;
      cached: boolean;
    };
    assert.equal(firstResponse.ok, true, JSON.stringify(first));
    assert.equal(first.cached, false);
    assert.equal(first.options[0]?.label, "Call 1 connected");

    const cachedResponse = await postJson(url, {
      configuration: { profile: "perfil-a", mode: "image" },
      connectionId: connection.id,
    });
    const cached = (await cachedResponse.json()) as typeof first;
    assert.equal(cached.cached, true);
    assert.equal(cached.options[0]?.label, "Call 1 connected");

    const refreshedResponse = await postJson(url, {
      configuration: { profile: "perfil-a", mode: "image" },
      connectionId: connection.id,
      refresh: true,
    });
    const refreshed = (await refreshedResponse.json()) as typeof first;
    assert.equal(refreshed.cached, false);
    assert.equal(refreshed.options[0]?.label, "Call 2 connected");

    const otherProfileResponse = await postJson(url, {
      configuration: { profile: "perfil-b", mode: "image" },
      connectionId: connection.id,
    });
    const otherProfile = (await otherProfileResponse.json()) as typeof first;
    assert.equal(otherProfile.cached, false);
    assert.equal(otherProfile.options[0]?.label, "Call 3 connected");

    const unknownProfileResponse = await postJson(url, {
      configuration: { profile: "perfil-inexistente", mode: "image" },
      connectionId: connection.id,
    });
    assert.equal(unknownProfileResponse.status, 422);
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
