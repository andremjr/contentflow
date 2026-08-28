import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8796;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

async function request(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  const result = (await response.json()) as Record<string, unknown>;
  return { response, result };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const { response } = await request("/api/plugins");
      if (response.ok) return;
    } catch {
      // A API ainda está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

test(
  "instala pacote em lote, pula existentes e não deixa instalação parcial",
  { timeout: 30_000 },
  async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), "contentflow-bulk-install-"));
    const dataDirectory = path.join(testRoot, "data");
    const bundle = path.join(testRoot, "bundle");
    await mkdir(bundle, { recursive: true });
    await cp(
      path.join(repositoryRoot, "ecosystem", "plugins", "examples", "community-reference"),
      path.join(bundle, "community-reference"),
      { recursive: true },
    );
    await cp(
      path.join(repositoryRoot, "ecosystem", "plugins", "examples", "kit-generated-text-transform"),
      path.join(bundle, "kit-generated-text-transform"),
      { recursive: true },
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
      const first = await request("/api/plugins/install-from-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: bundle }),
      });
      assert.equal(first.response.status, 201, JSON.stringify(first.result));
      assert.equal((first.result.installed as string[]).length, 2);

      const repeated = await request("/api/plugins/install-from-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: bundle }),
      });
      assert.equal(repeated.response.status, 200, JSON.stringify(repeated.result));
      assert.deepEqual(repeated.result.installed, []);
      assert.equal((repeated.result.skipped as string[]).length, 2);

      const invalidBundle = path.join(testRoot, "invalid-bundle");
      await cp(path.join(bundle, "community-reference"), path.join(invalidBundle, "valid"), {
        recursive: true,
      });
      await mkdir(path.join(invalidBundle, "invalid"), { recursive: true });
      await writeFile(path.join(invalidBundle, "invalid", "contentflow.plugin.json"), "{}");
      const invalid = await request("/api/plugins/install-from-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: invalidBundle }),
      });
      assert.equal(invalid.response.status, 422);

      const registry = await request("/api/plugins");
      assert.equal(registry.response.status, 200);
      assert.equal((registry.result.plugins as unknown[]).length, 2);
    } finally {
      server.kill();
      await new Promise<void>((resolve) => server.once("exit", () => resolve()));
      await rm(testRoot, { recursive: true, force: true });
    }
  },
);
