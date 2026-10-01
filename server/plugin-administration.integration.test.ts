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
import Database from "better-sqlite3";
import type { Archiver } from "archiver";

const archiver = createRequire(import.meta.url)("archiver") as (format: "zip") => Archiver;

test(
  "administration upgrades API1 by folder/catalog without exposing execution and preserves data on errors",
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-administration-"));
    const dataRoot = path.join(root, "data");
    const installedRoot = path.join(dataRoot, "plugins", "installed");
    const fixture = path.resolve("ecosystem/plugins/examples/community-reference");
    const coreVersion = JSON.parse(await readFile("package.json", "utf8")).version as string;
    const ids = ["example.folder-upgrade", "example.catalog-upgrade", "example.invalid-v2"];
    const source = path.join(root, "candidate");
    await cp(fixture, source, { recursive: true });
    const valid = JSON.parse(await readFile(path.join(source, "contentflow.plugin.json"), "utf8"));
    valid.version = "2.0.0";
    valid.minCoreVersion = coreVersion;
    valid.id = ids[1];
    await writeFile(path.join(source, "contentflow.plugin.json"), JSON.stringify(valid));
    for (const id of ids) {
      const destination = path.join(installedRoot, id);
      await cp(fixture, destination, { recursive: true });
      // Deliberately retain legacy capability fields. None may enter the executable registry.
      const legacy = {
        ...valid,
        id,
        version: "1.0.0",
        apiVersion: id === ids[2] ? "2" : "1",
        capabilities: [{ id: "legacy", acceptedTypes: ["file"] }],
      };
      await writeFile(path.join(destination, "contentflow.plugin.json"), JSON.stringify(legacy));
      await writeFile(path.join(destination, "preserve.txt"), "old package intact");
    }
    const unsafe = path.join(installedRoot, "unsafe");
    await mkdir(unsafe);
    await writeFile(
      path.join(unsafe, "contentflow.plugin.json"),
      JSON.stringify({ id: "../unsafe", version: "1.0.0", apiVersion: "1" }),
    );

    const archivePath = path.join(root, "candidate.zip");
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(archivePath);
      const archive = archiver("zip");
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(source, "candidate");
      void archive.finalize();
    });
    const bytes = await readFile(archivePath);
    const entry = {
      id: ids[1],
      name: "Catalog candidate",
      version: "2.0.0",
      apiVersion: "2",
      minCoreVersion: coreVersion,
      asset: "ContentFlow-Plugin-candidate.zip",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    };
    let published = { ...entry };
    let downloads = 0;
    const catalogServer = createServer((request, response) => {
      if (request.url === "/catalog.json")
        response.end(
          JSON.stringify({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            plugins: [published],
          }),
        );
      else if (request.url === `/${entry.asset}`) {
        downloads++;
        response.end(bytes);
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => catalogServer.listen(0, "127.0.0.1", resolve));
    const address = catalogServer.address();
    assert.ok(address && typeof address === "object");
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const apiAddress = portProbe.address();
    assert.ok(apiAddress && typeof apiAddress === "object");
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    const base = `http://127.0.0.1:${apiAddress.port}`;
    const output: string[] = [];
    const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CONTENTFLOW_APP_ROOT: process.cwd(),
        CONTENTFLOW_DATA_DIR: dataRoot,
        CONTENTFLOW_LOCAL_PLUGINS_DIR: path.join(root, "no-local"),
        CONTENTFLOW_API_PORT: String(apiAddress.port),
        CONTENTFLOW_PLUGIN_CATALOG_URL: `http://127.0.0.1:${address.port}/catalog.json`,
      },
    });
    server.stdout.on("data", (chunk) => output.push(String(chunk)));
    server.stderr.on("data", (chunk) => output.push(String(chunk)));
    async function request(route: string, method = "GET", body?: unknown) {
      const response = await fetch(`${base}${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: response.status === 204 ? undefined : await response.json(),
      };
    }
    let database: Database.Database | undefined;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if ((await request("/api/health")).status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* starting */
        }
        if (server.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, output.join(""));
      database = new Database(path.join(dataRoot, "contentflow.sqlite"));
      for (const id of ids) {
        database
          .prepare("INSERT INTO plugin_consents VALUES (?, '1.0.0', '[]', '[]', 1, 'before')")
          .run(id);
        database
          .prepare("INSERT INTO plugin_workspaces VALUES (?, ?, 'before')")
          .run(id, path.join(root, "workspace"));
        database
          .prepare(
            "INSERT INTO plugin_connections (id, plugin_id, name, created_at, updated_at) VALUES (?, ?, 'Saved connection', 'before', 'before')",
          )
          .run(`connection-${id}`, id);
      }
      const saved = () =>
        ["plugin_consents", "plugin_workspaces", "plugin_connections"].map((table) =>
          database!.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
        );
      const before = saved();
      const listed = await request("/api/plugins");
      assert.equal(listed.status, 200);
      assert.equal(listed.data.plugins.length, 3);
      for (const plugin of listed.data.plugins) {
        assert.equal(plugin.enabled, false);
        assert.equal(plugin.executable, false);
        assert.equal(plugin.compatibility.status, "incompatible");
        assert.deepEqual(plugin.manifest.capabilities, []);
        assert.equal(plugin.manifest.entrypoint, undefined);
      }
      assert.equal(
        listed.data.plugins.find((plugin: { id: string }) => plugin.id === ids[2]).compatibility
          .reason,
        "invalid_manifest",
      );
      assert.equal(
        (await request(`/api/plugins/${ids[0]}/consent`, "PUT", { enabled: true })).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/api/plugins/${ids[0]}/capabilities/legacy/configuration-options/model`,
            "POST",
            {},
          )
        ).status,
        404,
      );
      assert.equal((await request(`/api/plugins/${ids[0]}/dependencies`)).status, 200);

      for (const metadata of [
        { apiVersion: "1" },
        { minCoreVersion: "999.0.0" },
        { apiVersion: undefined },
      ]) {
        published = { ...entry, ...metadata } as typeof entry;
        const updates = await request("/api/plugins/updates?refresh=true");
        const update = updates.data.updates.find((item: { id: string }) => item.id === ids[1]);
        assert.equal(update.updateAvailable, false);
        assert.equal(update.compatibility.status, "incompatible");
        const failed = await request(`/api/plugins/${ids[1]}/update-from-catalog`, "PUT");
        assert.equal(failed.status, 422);
        assert.equal(downloads, 0);
        assert.deepEqual(saved(), before);
        assert.equal(
          await readFile(path.join(installedRoot, ids[1], "preserve.txt"), "utf8"),
          "old package intact",
        );
      }
      published = { ...entry, version: "2.1.0" }; // Valid hash, incorrect manifest version must still fail.
      assert.equal(
        (await request(`/api/plugins/${ids[1]}/update-from-catalog`, "PUT")).status,
        422,
      );
      assert.deepEqual(saved(), before);
      published = { ...entry, sha256: "0".repeat(64) };
      assert.equal(
        (await request(`/api/plugins/${ids[1]}/update-from-catalog`, "PUT")).status,
        422,
      );
      assert.deepEqual(saved(), before);

      // Folder candidates are validated before touching the old installation.
      valid.id = ids[0];
      valid.apiVersion = "1";
      await writeFile(path.join(source, "contentflow.plugin.json"), JSON.stringify(valid));
      assert.equal(
        (await request(`/api/plugins/${ids[0]}/update-from-folder`, "PUT", { path: source }))
          .status,
        422,
      );
      valid.apiVersion = "2";
      valid.minCoreVersion = "999.0.0";
      await writeFile(path.join(source, "contentflow.plugin.json"), JSON.stringify(valid));
      assert.equal(
        (await request(`/api/plugins/${ids[0]}/update-from-folder`, "PUT", { path: source }))
          .status,
        422,
      );
      assert.deepEqual(saved(), before);
      assert.equal(
        await readFile(path.join(installedRoot, ids[0], "preserve.txt"), "utf8"),
        "old package intact",
      );
      valid.minCoreVersion = coreVersion;
      await writeFile(path.join(source, "contentflow.plugin.json"), JSON.stringify(valid));
      const folderResult = await request(`/api/plugins/${ids[0]}/update-from-folder`, "PUT", {
        path: source,
      });
      assert.equal(folderResult.status, 200, JSON.stringify(folderResult));
      assert.equal(folderResult.data.previousVersion, "1.0.0");
      published = { ...entry };
      const updates = await request("/api/plugins/updates?refresh=true");
      assert.equal(
        updates.data.updates.find((item: { id: string }) => item.id === ids[1]).updateAvailable,
        true,
      );
      const catalogResult = await request(`/api/plugins/${ids[1]}/update-from-catalog`, "PUT");
      assert.equal(catalogResult.status, 200, JSON.stringify(catalogResult));
      assert.equal(catalogResult.data.version, "2.0.0");
      assert.deepEqual(saved(), before);
      const after = await request("/api/plugins");
      for (const id of ids.slice(0, 2)) {
        const plugin = after.data.plugins.find((item: { id: string }) => item.id === id);
        assert.equal(plugin.manifest.apiVersion, "2");
        assert.equal(plugin.compatibility.status, "compatible");
        assert.equal(plugin.enabled, false); // Old consent is preserved, never applied to a new version.
        assert.equal(plugin.executable, false);
        assert.ok(plugin.manifest.capabilities.length > 0);
        assert.equal(
          (await request(`/api/plugins/${id}/consent`, "PUT", { enabled: true })).status,
          200,
        );
      }
      assert.equal(
        (await request(`/api/plugins/${ids[0]}/update-from-folder`, "PUT", { path: source }))
          .status,
        422,
      );
      assert.equal((await request(`/api/plugins/${ids[2]}`, "DELETE")).status, 204);
    } finally {
      database?.close();
      if (server.exitCode === null) {
        const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
        server.kill();
        await exited;
      }
      await new Promise<void>((resolve) => catalogServer.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
