import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
} from "./plugin-catalog";

const archiver = createRequire(import.meta.url)("archiver") as (
  format: "zip",
  options?: ArchiverOptions,
) => Archiver;

function catalogEntry(bytes: Buffer) {
  return {
    id: "example.catalog-plugin",
    name: "Catalog plugin",
    version: "1.2.3",
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
