import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Archiver, ArchiverOptions } from "archiver";
import {
  downloadCatalogPlugin,
  extractPluginArchive,
  parsePluginCatalog,
  pluginAssetUrl,
  comparePluginVersions,
  isSafePluginVersion,
  pluginCatalogCompatibility,
  currentCoreVersion,
} from "./plugin-catalog";

const archiver = createRequire(import.meta.url)("archiver") as (
  format: "zip",
  options?: ArchiverOptions,
) => Archiver;

test("reads current core version from checkout and packaged resources/app", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-core-version-"));
  const previousRoot = process.env.CONTENTFLOW_APP_ROOT;
  context.after(async () => {
    if (previousRoot === undefined) delete process.env.CONTENTFLOW_APP_ROOT;
    else process.env.CONTENTFLOW_APP_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });
  process.env.CONTENTFLOW_APP_ROOT = root;
  await mkdir(path.join(root, "app", "desktop-dist"), { recursive: true });
  await writeFile(path.join(root, "app", "desktop-dist", "build-info.json"), '{"version":"1.3.1"}');
  assert.equal(currentCoreVersion(), "1.3.1");
  await writeFile(path.join(root, "app", "package.json"), '{"version":"1.3.2"}');
  assert.equal(currentCoreVersion(), "1.3.2");
  await writeFile(path.join(root, "package.json"), '{"version":"1.2.1"}');
  assert.equal(currentCoreVersion(), "1.2.1");
});

function catalogEntry(bytes: Buffer) {
  return {
    id: "example.catalog-plugin",
    name: "Catalog plugin",
    version: "1.2.3",
    apiVersion: "2",
    asset: "ContentFlow-Plugin-example.zip",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  };
}

async function createZip(destination: string, configure: (archive: Archiver) => void) {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    configure(archive);
    void archive.finalize();
  });
}

test("valida catálogo e restringe o pacote à mesma origem", () => {
  const entry = catalogEntry(Buffer.from("zip"));
  assert.deepEqual(
    parsePluginCatalog({
      schemaVersion: 1,
      generatedAt: "2026-08-30T12:00:00.000Z",
      plugins: [entry],
    }).plugins,
    [entry],
  );
  assert.equal(
    pluginAssetUrl("https://example.com/releases/latest/catalog.json", entry).href,
    "https://example.com/releases/latest/ContentFlow-Plugin-example.zip",
  );
  assert.throws(
    () => parsePluginCatalog({ schemaVersion: 1, generatedAt: "invalid", plugins: [] }),
    /incompatível/,
  );
});

test("catalog compatibility rejects API1, missing API metadata and future core versions", () => {
  assert.deepEqual(pluginCatalogCompatibility({ apiVersion: "1" }, "1.2.1"), {
    status: "incompatible",
    reason: "unsupported_api",
  });
  assert.equal(pluginCatalogCompatibility({}, "1.2.1").reason, "missing_metadata");
  assert.equal(
    pluginCatalogCompatibility({ apiVersion: "2", minCoreVersion: "1.3.1" }, "1.2.1").reason,
    "core_version",
  );
  assert.equal(
    pluginCatalogCompatibility({ apiVersion: "2", minCoreVersion: "1.3.1" }, "1.3.1").status,
    "compatible",
  );
  assert.equal(
    pluginCatalogCompatibility({ apiVersion: "2", minCoreVersion: "1.3.1" }, "1.3.1-rc.1").status,
    "incompatible",
  );
});

test("compares SemVer prerelease identifiers without locale or numeric coercion", () => {
  const order = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let index = 1; index < order.length; index++)
    assert.ok(comparePluginVersions(order[index], order[index - 1]) > 0);
  assert.equal(comparePluginVersions("1.0.0+build.2", "1.0.0+build.1"), 0);
  assert.equal(comparePluginVersions("1.0.0-2", "1.0.0-a"), -1);
  assert.equal(isSafePluginVersion("1.0.0-01"), false);
  assert.equal(isSafePluginVersion("01.0.0"), false);
});

test("baixa, confere o hash e extrai um pacote individual", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-catalog-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceArchive = path.join(root, "source.zip");
  await createZip(sourceArchive, (archive) => {
    archive.append('{"apiVersion":"1"}', {
      name: "example/contentflow.plugin.json",
    });
    archive.append("export async function execute() {}", { name: "example/handler.mjs" });
  });
  const bytes = await readFile(sourceArchive);
  const entry = catalogEntry(bytes);
  const server = createServer((request, response) => {
    if (request.url === `/${entry.asset}`) {
      response.setHeader("content-length", String(bytes.length));
      response.end(bytes);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const catalogUrl = `http://127.0.0.1:${address.port}/ContentFlow-Plugin-Catalog.json`;
  const downloaded = path.join(root, "downloaded.zip");
  await downloadCatalogPlugin(catalogUrl, entry, downloaded);
  const extracted = path.join(root, "extracted");
  await extractPluginArchive(downloaded, extracted);
  assert.equal(
    await readFile(path.join(extracted, "example", "contentflow.plugin.json"), "utf8"),
    '{"apiVersion":"1"}',
  );
});

test("rejeita link simbólico dentro do ZIP", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-symlink-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, "symlink.zip");
  await createZip(archivePath, (archive) => {
    archive.symlink("example/link", "../../outside");
  });
  await assert.rejects(
    extractPluginArchive(archivePath, path.join(root, "extracted")),
    /links simbólicos/,
  );
});
