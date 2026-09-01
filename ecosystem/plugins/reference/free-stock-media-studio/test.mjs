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

test("download em lote materializa somente o vencedor e mantém o vínculo com o trecho", async () => {
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
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-selected-stock-assets",
        settings: { maxImageBytes: 1024 * 1024 },
        batch: { itemId: "brief-item-3", index: 2, total: 20 },
        inputs: {
          selected_assets: {
            brief_id: "scene-03",
            start_seconds: 8,
            end_seconds: 12,
            asset_id: "pexels:321",
            external_id: "321",
            provider: "pexels",
            provider_label: "Pexels",
            media_type: "image",
            download_url: "https://images.pexels.com/photos/321/file.jpeg",
            source_url: "https://www.pexels.com/photo/321/",
            attribution: "Photo by Creator on Pexels",
            license_name: "Pexels License",
            license_url: "https://www.pexels.com/license/",
          },
        },
      },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.equal(result.values.assets.length, 1);
    assert.equal(result.values.assets[0].brief_id, "scene-03");
    assert.equal(result.values.assets[0].start_seconds, 8);
    assert.equal(result.values.assets[0].provider, "pexels");
    assert.deepEqual(await readFile(join(root, "output", result.values.assets[0].name)), png);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("assinaturas de arquivo são validadas", () => {
  assert.equal(__test.validMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(__test.validMagic(Buffer.from("not an image"), "image/jpeg"), false);
});

test("limites máximos respeitam o teto individual de cada API", () => {
  const maximum = { resultLimitMode: "provider_max", resultsPerProvider: 1 };
  assert.equal(__test.providerPageLimit("pexels", "image", maximum), 80);
  assert.equal(__test.providerPageLimit("pixabay", "video", maximum), 200);
  assert.equal(__test.providerPageLimit("unsplash", "image", maximum), 30);
  assert.equal(__test.providerPageLimit("openverse", "image", maximum), 20);
  assert.equal(__test.providerPageLimit("wikimedia", "video", maximum), 500);
  assert.equal(__test.providerPageLimit("nasa", "image", maximum), 100);
  assert.equal(__test.providerPageLimit("coverr", "video", maximum), 100);
  assert.equal(
    __test.providerPageLimit("pexels", "image", {
      resultLimitMode: "custom",
      resultsPerProvider: 500,
    }),
    80,
  );
});

test("orquestração balanceada alterna o primeiro provedor por trecho", () => {
  assert.deepEqual(
    __test.providersForBrief("image", {
      provider: "all",
      strategy: "balanced_fallback",
      batchIndex: 2,
    }),
    ["unsplash", "openverse", "wikimedia", "nasa", "pexels", "pixabay"],
  );
});

test("busca por briefing preserva vínculo temporal e limita a shortlist", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "search-stock-by-briefs",
        inputs: {
          asset_briefs: {
            brief_id: "scene-07",
            start_seconds: 12.5,
            end_seconds: 18,
            transcript_excerpt: "A equipe atravessa a cidade ao amanhecer.",
            primary_query: "team city sunrise",
            media_preference: "image",
            orientation: "landscape",
          },
        },
        configuration: {
          mediaPolicy: "follow_brief",
          providerStrategy: "priority_fallback",
          minimumCandidatesPerBrief: 2,
          maximumCandidatesPerBrief: 2,
          minimumImageWidth: 0,
        },
      },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.equal(result.values.selected_assets.length, 1);
    assert.equal(result.values.selected_assets[0].provider, "pexels");
    assert.equal(result.values.selected_assets[0].brief_id, "scene-07");
    assert.equal(result.values.selected_assets[0].start_seconds, 12.5);
    assert.equal(result.values.selected_assets[0].candidate_rank, 1);
    assert.equal(result.values.selected_assets[0].candidate_pool_size, 2);
    assert.equal(result.values.selected_assets[0].selection_mode, "automatic_best");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("trecho falha explicitamente quando nenhum asset alcança o piso de qualidade", async () => {
  const result = await execute(
    {
      ...baseRequest,
      capabilityId: "search-stock-by-briefs",
      inputs: {
        asset_briefs: {
          brief_id: "scene-low-quality",
          primary_query: "abstract concept",
          media_preference: "image",
          orientation: "landscape",
        },
      },
      configuration: {
        provider: "pexels",
        mediaPolicy: "images_only",
        minimumQualityScore: 100,
        minimumImageWidth: 0,
        maximumFallbackQueries: 0,
      },
    },
    services(tmpdir()),
  );
  assert.equal(result.status, "error");
  assert.equal(result.code, "NOT_FOUND");
});

test("fallback só é consultado quando a busca primária não cobre o briefing", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requested.push(url);
    const query = url.searchParams.get("query");
    const photos =
      query === "fallback city"
        ? [
            {
              id: 91,
              width: 1920,
              height: 1080,
              photographer: "Creator",
              url: "https://www.pexels.com/photo/91/",
              src: {
                medium: "https://images.pexels.com/photos/91/medium.jpeg",
                original: "https://images.pexels.com/photos/91/original.jpeg",
              },
            },
          ]
        : [];
    return new Response(JSON.stringify({ photos }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "search-stock-by-briefs",
        settings: {},
        inputs: {
          asset_briefs: {
            brief_id: "scene-fallback",
            primary_query: "primary city",
            fallback_query_1: "fallback city",
            media_preference: "image",
          },
        },
        configuration: {
          provider: "pexels",
          mediaPolicy: "images_only",
          minimumCandidatesPerBrief: 1,
          maximumCandidatesPerBrief: 4,
          maximumFallbackQueries: 1,
          minimumImageWidth: 0,
        },
      },
      services(root, { PEXELS_API_KEY: "test-key" }),
    );
    assert.equal(result.status, "success");
    assert.equal(result.values.selected_assets.length, 1);
    assert.equal(result.values.selected_assets[0].query_kind, "fallback_1");
    assert.deepEqual(
      requested.map((url) => url.searchParams.get("query")),
      ["primary city", "fallback city"],
    );
    assert.ok(requested.every((url) => url.searchParams.get("per_page") === "80"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("shortlist deduplica ativos e alterna provedores", () => {
  const candidates = [
    { provider: "pexels", external_id: "1", media_type: "image", candidate_score: 100 },
    { provider: "pexels", external_id: "2", media_type: "image", candidate_score: 90 },
    { provider: "pixabay", external_id: "1", media_type: "image", candidate_score: 80 },
    { provider: "pexels", external_id: "1", media_type: "image", candidate_score: 70 },
  ];
  assert.deepEqual(
    __test
      .selectDiverseCandidates(candidates, 3)
      .map((item) => `${item.provider}:${item.external_id}`),
    ["pexels:1", "pixabay:1", "pexels:2"],
  );
});
