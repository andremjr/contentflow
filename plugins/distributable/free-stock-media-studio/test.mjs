import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execute, __test } from "./handler.mjs";

const baseRequest = Object.freeze({
  executionId: "execution-test",
  blockId: "block-test",
  invocation: { mode: "start", attempt: 1 },
  settings: { diagnosticFixture: true },
  configuration: {},
  inputs: { query: "fitness workout" },
});

function services(root, secrets = {}) {
  return {
    signal: new AbortController().signal,
    getSecret: async (name) => secrets[name] || "",
    getWorkspacePath: (name) => join(root, "workspace", name),
    getOutputPath: (name) => join(root, "output", name),
  };
}

test("fixture de imagens retorna todos os provedores sem usar segredos", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const result = await execute(
      { ...baseRequest, capabilityId: "search-stock-images" },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.deepEqual(
      result.values.results.map((item) => item.provider),
      ["pexels", "pixabay", "unsplash", "openverse", "wikimedia", "nasa"],
    );
    assert.equal(result.values.warnings.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture de vídeos retorna somente provedores com vídeo", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const result = await execute(
      { ...baseRequest, capabilityId: "search-stock-videos" },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.deepEqual(
      result.values.results.map((item) => item.provider),
      ["pexels", "pixabay", "coverr", "wikimedia", "nasa"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("busca vazia falha de forma estável", async () => {
  const result = await execute(
    { ...baseRequest, capabilityId: "search-stock-images", inputs: { query: " " } },
    services(tmpdir()),
  );
  assert.equal(result.status, "error");
  assert.equal(result.code, "INVALID_INPUT");
});

test("normalizadores escolhem rendições úteis", () => {
  assert.equal(
    __test.choosePexelsVideo([
      { width: 3840, link: "4k" },
      { width: 1280, link: "hd" },
      { width: 1920, link: "full-hd" },
    ]).link,
    "full-hd",
  );
  assert.equal(
    __test.choosePixabayVideo({ medium: { url: "medium" }, small: { url: "small" } }).url,
    "medium",
  );
});

test("download rejeita hosts não pertencentes ao provedor", async () => {
  const request = {
    ...baseRequest,
    capabilityId: "download-stock-image",
    settings: {},
    inputs: {
      asset: {
        provider: "pexels",
        media_type: "image",
        download_url: "https://example.com/file.jpg",
      },
    },
  };
  const result = await execute(request, services(tmpdir()));
  assert.equal(result.status, "error");
  assert.equal(result.code, "PERMISSION_DENIED");
});

test("allowlist reconhece somente hosts oficiais das novas fontes", () => {
  assert.equal(
    __test.validateAssetUrl("https://api.openverse.org/v1/images/id/thumb/", "openverse").hostname,
    "api.openverse.org",
  );
  assert.equal(
    __test.validateAssetUrl("https://upload.wikimedia.org/wikipedia/commons/file.webm", "wikimedia")
      .hostname,
    "upload.wikimedia.org",
  );
  assert.throws(() => __test.validateAssetUrl("https://commons.example.com/file.jpg", "wikimedia"));
});

test("download grava artefato validado e proveniência", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  globalThis.fetch = async () =>
    new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    });
  try {
    const request = {
      ...baseRequest,
      capabilityId: "download-stock-image",
      settings: { maxImageBytes: 1024 * 1024 },
      inputs: {
        asset: {
          asset_id: "pexels:123",
          external_id: "123",
          provider: "pexels",
          provider_label: "Pexels",
          media_type: "image",
          download_url: "https://images.pexels.com/photos/123/file.jpeg",
          source_url: "https://www.pexels.com/photo/123/",
          author: "Creator",
          author_url: "",
          attribution: "Photo by Creator on Pexels",
          license_name: "Pexels License",
          license_url: "https://www.pexels.com/license/",
        },
      },
    };
    const result = await execute(request, services(root));
    assert.equal(result.status, "success");
    assert.equal(result.values.image.mimeType, "image/png");
    assert.equal(result.values.provenance[0].provider, "pexels");
    assert.deepEqual(await readFile(join(root, "output", result.values.image.name)), png);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("assinaturas de arquivo são validadas", () => {
  assert.equal(__test.validMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(__test.validMagic(Buffer.from("not an image"), "image/jpeg"), false);
});
