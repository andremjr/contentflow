import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Archiver, ArchiverOptions } from "archiver";

const archiver = createRequire(import.meta.url)("archiver") as (
  format: "zip",
  options?: ArchiverOptions,
) => Archiver;

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

async function createPluginArchive(sourceDirectory: string, destination: string) {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDirectory, path.basename(sourceDirectory));
    void archive.finalize();
  });
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

    const updateSource = path.join(testRoot, "community-reference-update");
    await cp(path.join(bundle, "community-reference"), updateSource, { recursive: true });
    const updateManifestPath = path.join(updateSource, "contentflow.plugin.json");
    const updateManifest = JSON.parse(await readFile(updateManifestPath, "utf8")) as {
      version: string;
    };
    updateManifest.version = "1.1.0";
    await writeFile(updateManifestPath, `${JSON.stringify(updateManifest, null, 2)}\n`);
    const updateAsset = "ContentFlow-Plugin-community-reference.zip";
    const updateArchive = path.join(testRoot, updateAsset);
    await createPluginArchive(updateSource, updateArchive);
    const updateBytes = await readFile(updateArchive);
    const catalog = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-08-30T12:00:00.000Z",
        plugins: [
          {
            id: "com.contentflow.reference-community",
            name: "Plugin comunitário de referência",
            version: "1.1.0",
            asset: updateAsset,
            sha256: createHash("sha256").update(updateBytes).digest("hex"),
            size: updateBytes.length,
          },
        ],
      }),
    );
    const catalogServer = createServer((request, response) => {
      if (request.url === "/ContentFlow-Plugin-Catalog.json") {
        response.setHeader("content-length", String(catalog.length));
        response.end(catalog);
      } else if (request.url === `/${updateAsset}`) {
        response.setHeader("content-length", String(updateBytes.length));
        response.end(updateBytes);
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => catalogServer.listen(0, "127.0.0.1", resolve));
    const catalogAddress = catalogServer.address();
    assert.ok(catalogAddress && typeof catalogAddress === "object");

    const output: string[] = [];
    const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_APP_ROOT: repositoryRoot,
        CONTENTFLOW_DATA_DIR: dataDirectory,
        CONTENTFLOW_PLUGIN_CATALOG_URL: `http://127.0.0.1:${catalogAddress.port}/ContentFlow-Plugin-Catalog.json`,
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

      const updates = await request("/api/plugins/updates?refresh=true");
      assert.equal(updates.response.status, 200, JSON.stringify(updates.result));
      const available = updates.result.updates as Array<Record<string, unknown>>;
      assert.equal(
        available.find((entry) => entry.id === "com.contentflow.reference-community")
          ?.updateAvailable,
        true,
      );
      const updated = await request(
        "/api/plugins/com.contentflow.reference-community/update-from-catalog",
        { method: "PUT" },
      );
      assert.equal(updated.response.status, 200, JSON.stringify(updated.result));
      assert.equal(updated.result.version, "1.1.0");

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
      await new Promise<void>((resolve) => catalogServer.close(() => resolve()));
      await rm(testRoot, { recursive: true, force: true });
    }
  },
);
