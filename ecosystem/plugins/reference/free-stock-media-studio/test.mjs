import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execute, __test } from "./handler.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
);
const p20Contract = JSON.parse(
  await readFile(new URL("./fixtures/p20-contract.json", import.meta.url), "utf8"),
);
const p21ProviderOptions = JSON.parse(
  await readFile(new URL("./fixtures/p21-provider-options.json", import.meta.url), "utf8"),
);
const p22IncrementalBriefs = JSON.parse(
  await readFile(new URL("./fixtures/p22-incremental-briefs.json", import.meta.url), "utf8"),
);
const p23SecureDownloads = JSON.parse(
  await readFile(new URL("./fixtures/p23-secure-downloads.json", import.meta.url), "utf8"),
);
const p24RealMethod = JSON.parse(
  await readFile(
    new URL("./fixtures/p24-real-method.contentflow-method.json", import.meta.url),
    "utf8",
  ),
);

const baseRequest = Object.freeze({
  executionId: "execution-test",
  blockId: "block-test",
  invocation: { mode: "start", attempt: 1 },
  settings: { diagnosticFixture: true },
  configuration: {},
  inputs: { query: "fitness workout" },
});

function services(root, secrets = {}, options = {}) {
  return {
    signal: options.signal ?? new AbortController().signal,
    getSecret: async (name) => secrets[name] || "",
    getWorkspacePath: (name) => join(root, "workspace", name),
    getOutputPath: (name) => join(root, "output", name),
    resolveHostname:
      options.resolveHostname ?? (async () => [{ address: "93.184.216.34", family: 4 }]),
    ...(options.publishPartial ? { publishPartial: options.publishPartial } : {}),
  };
}

function stockImageAsset(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function optionsRequest(capabilityId) {
  return {
    ...baseRequest,
    capabilityId,
    invocation: {
      mode: "configure",
      action: "options",
      providerId: "available-stock-providers",
      property: "provider",
    },
    inputs: {},
  };
}

test("P24 fornece Método BUSCAR → VALIDAR → CRIAR executável nos três idiomas", () => {
  assert.equal(p24RealMethod.format, "contentflow-method");
  assert.equal(p24RealMethod.method.processType, "assets");
  assert.deepEqual(
    p24RealMethod.method.blocks.map((block) => block.type),
    ["BUSCAR", "VALIDAR", "CRIAR"],
  );
  assert.deepEqual(p24RealMethod.p24.locales, ["pt-BR", "en", "es"]);
  const [search, validation, download] = p24RealMethod.method.blocks;
  assert.equal(search.plugin.capabilityId, "search-stock-images");
  assert.equal(validation.validation.targetBlockId, search.id);
  assert.equal(validation.validation.targetOutputKey, "candidates");
  assert.equal(validation.validation.mode, "select_one");
  assert.equal(download.plugin.capabilityId, "download-selected-stock-assets");
  assert.equal(download.inputs[0].blockId, validation.id);
  assert.equal(download.inputs[0].sourceKey, "selected_value");
  assert.equal(download.inputs[0].portKey, "selected_assets");
  assert.deepEqual(manifest.permissions, ["network", "filesystem:read", "filesystem:write"]);
});

test("contrato P20 preserva portas e exige BUSCAR → VALIDAR → CRIAR", () => {
  const capabilities = new Map(
    manifest.capabilities.map((capability) => [capability.id, capability]),
  );
  const discovery = p20Contract.workflow.find((stage) => stage.stage === "discovery");
  const validation = p20Contract.workflow.find((stage) => stage.stage === "runtime_selection");
  const materialization = p20Contract.workflow.find((stage) => stage.stage === "materialization");

  assert.equal(validation.blockType, "VALIDAR");
  assert.equal(validation.owner, "contentflow-core");
  for (const capabilityId of discovery.capabilityIds)
    assert.deepEqual(capabilities.get(capabilityId)?.blockTypes, ["BUSCAR"]);
  for (const capabilityId of materialization.capabilityIds)
    assert.deepEqual(capabilities.get(capabilityId)?.blockTypes, ["CRIAR"]);
  assert.ok(
    manifest.capabilities.every(
      (capability) => !capability.blockTypes.includes(p20Contract.forbiddenSelectionBlockType),
    ),
    "candidatos encontrados durante a execução não podem usar ESCOLHER",
  );

  for (const [capabilityId, ports] of Object.entries(p20Contract.legacyPorts)) {
    const capability = capabilities.get(capabilityId);
    assert.ok(capability, `capability ausente: ${capabilityId}`);
    assert.ok(capability.inputPorts.some((port) => port.key === ports.input));
    assert.ok(capability.outputPorts.some((port) => port.key === ports.output));
  }
  assert.equal(
    p20Contract.legacyPorts["search-stock-by-briefs"].semantics,
    "ranked_discovery_suggestion_pending_validation",
  );
});

test("schemas canônicos P20 mantêm proveniência no candidato e no artifact", () => {
  const { candidateRecord, artifactRecord } = p20Contract;
  for (const field of candidateRecord.required)
    assert.ok(Object.hasOwn(candidateRecord.sample, field), `candidato sem ${field}`);
  assert.ok(
    candidateRecord.conditional.download.some((field) => candidateRecord.sample[field]),
    "candidato sem URL de materialização",
  );
  for (const field of candidateRecord.conditional.briefSuggestion)
    assert.ok(Object.hasOwn(candidateRecord.sample, field), `sugestão sem ${field}`);
  for (const field of [...artifactRecord.required, ...artifactRecord.batchProvenance])
    assert.ok(Object.hasOwn(artifactRecord.sample, field), `artifact sem ${field}`);
});

test("P21 mantém somente os campos úteis e cards nas buscas diretas", () => {
  for (const capabilityId of ["search-stock-images", "search-stock-videos"]) {
    const capability = manifest.capabilities.find((item) => item.id === capabilityId);
    assert.ok(capability);
    const properties = capability.blockConfigSchema.properties;
    assert.deepEqual(
      Object.entries(properties)
        .filter(([, schema]) => !schema.visibleWhen)
        .map(([key]) => key),
      ["provider", "resultsPerProvider", "orientation", "safeSearch"],
    );
    for (const legacyProperty of ["resultLimitMode", "page"])
      assert.deepEqual(properties[legacyProperty].visibleWhen, {
        property: "provider",
        values: ["__legacy_pagination__"],
      });
    assert.deepEqual(capability.configurationOptions, [
      {
        property: "provider",
        providerId: "available-stock-providers",
        cacheTtlMs: 0,
      },
    ]);
    assert.equal(
      capability.outputPorts.find((port) => port.key === "results")?.presentation?.renderer,
      "cards",
    );
  }
});

test("opções de fonte sem chave mantêm somente provedores anônimos", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const images = await execute(optionsRequest("search-stock-images"), services(root));
    const videos = await execute(optionsRequest("search-stock-videos"), services(root));
    assert.equal(images.status, "success");
    assert.equal(videos.status, "success");
    assert.deepEqual(
      images.values.options.map((option) => option.value),
      p21ProviderOptions.image.withoutKeys,
    );
    assert.deepEqual(
      videos.values.options.map((option) => option.value),
      p21ProviderOptions.video.withoutKeys,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uma chave habilita somente sua fonte e nunca aparece na resposta", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const canary = "p21-secret-canary";
  try {
    const result = await execute(
      optionsRequest("search-stock-images"),
      services(root, { PEXELS_API_KEY: canary }),
    );
    assert.equal(result.status, "success");
    assert.deepEqual(
      result.values.options.map((option) => option.value),
      p21ProviderOptions.image.withPexelsKey,
    );
    assert.equal(JSON.stringify(result).includes(canary), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("falha ao consultar uma credencial não oculta fontes independentes", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const result = await execute(optionsRequest("search-stock-videos"), {
      ...services(root),
      getSecret: async (name) => {
        if (name === "PEXELS_API_KEY") throw new Error("vault unavailable");
        return name === "COVERR_API_KEY" ? "configured" : "";
      },
    });
    assert.equal(result.status, "success");
    assert.deepEqual(
      result.values.options.map((option) => option.value),
      p21ProviderOptions.video.withCoverrKey,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fonte salva que perdeu a chave fica indisponível e falha fechada na execução", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  try {
    const options = await execute(optionsRequest("search-stock-images"), services(root));
    assert.equal(options.status, "success");
    assert.equal(
      options.values.options.some((option) => option.value === "pexels"),
      false,
    );
    const execution = await execute(
      {
        ...baseRequest,
        capabilityId: "search-stock-images",
        settings: {},
        configuration: { provider: "pexels", resultsPerProvider: 5 },
      },
      services(root),
    );
    assert.equal(execution.status, "error");
    assert.equal(execution.code, "AUTHENTICATION_FAILED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("campos alterados em P21 possuem moldura PT-BR, inglês e espanhol", () => {
  for (const capabilityId of ["search-stock-images", "search-stock-videos"]) {
    const capability = manifest.capabilities.find((item) => item.id === capabilityId);
    assert.ok(capability?.name);
    assert.ok(capability?.description);
    for (const locale of ["en", "es"]) {
      const localized = manifest.localizations?.[locale]?.capabilities?.[capabilityId];
      assert.ok(localized?.name);
      assert.ok(localized?.description);
      for (const property of ["provider", "resultsPerProvider", "orientation", "safeSearch"])
        assert.ok(localized.blockConfigSchema?.properties?.[property]?.title);
      const baseOptions = capability.blockConfigSchema.properties.orientation.oneOf;
      assert.deepEqual(
        localized.blockConfigSchema.properties.orientation.options.map((option) => option.value),
        baseOptions.map((option) => option.const),
      );
    }
  }
});

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

test("sete adapters preservam identidade, licença, atribuição e URL materializável", () => {
  const records = [
    __test.pexelsImage({
      id: 1,
      width: 1920,
      height: 1080,
      photographer: "Pexels Author",
      photographer_url: "https://www.pexels.com/@author/",
      url: "https://www.pexels.com/photo/1/",
      src: {
        medium: "https://images.pexels.com/photos/1/medium.jpeg",
        original: "https://images.pexels.com/photos/1/original.jpeg",
      },
    }),
    __test.pixabayImage({
      id: 2,
      user: "Pixabay Author",
      user_id: 20,
      pageURL: "https://pixabay.com/photos/id-2/",
      webformatURL: "https://cdn.pixabay.com/photo/2-preview.jpg",
      largeImageURL: "https://cdn.pixabay.com/photo/2.jpg",
      imageWidth: 1920,
      imageHeight: 1080,
    }),
    __test.unsplashImage({
      id: "3",
      width: 1920,
      height: 1080,
      urls: {
        small: "https://images.unsplash.com/photo-3-preview",
        full: "https://images.unsplash.com/photo-3",
      },
      links: {
        html: "https://unsplash.com/photos/3",
        download_location: "https://api.unsplash.com/photos/3/download",
      },
      user: { name: "Unsplash Author", links: { html: "https://unsplash.com/@author" } },
    }),
    __test.openverseImage({
      id: "4",
      title: "Open image",
      creator: "Openverse Author",
      thumbnail: "https://api.openverse.org/v1/images/4/thumb/",
      foreign_landing_url: "https://example.invalid/item/4",
      attribution: "Open image by Openverse Author",
      license: "cc0",
      license_version: "1.0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      width: 1920,
      height: 1080,
      filetype: "jpg",
    }),
    __test.wikimediaRecord("image", {
      pageid: 5,
      title: "File:Commons.jpg",
      imageinfo: [
        {
          url: "https://upload.wikimedia.org/wikipedia/commons/5/Commons.jpg",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Commons.jpg",
          width: 1920,
          height: 1080,
          mime: "image/jpeg",
          extmetadata: {
            Artist: { value: "Commons Author" },
            Credit: { value: "Commons Author / CC BY" },
            LicenseShortName: { value: "CC BY 4.0" },
            LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
          },
        },
      ],
    }),
    __test.nasaRecord("image", {
      data: [{ nasa_id: "NASA-6", title: "NASA image", center: "NASA" }],
      links: [{ href: "https://images-assets.nasa.gov/image/NASA-6/NASA-6~thumb.jpg" }],
      href: "https://images-api.nasa.gov/asset/NASA-6",
    }),
    __test.coverrVideo({
      id: "7",
      slug: "coverr-video",
      title: "Coverr video",
      thumbnail: "https://cdn.coverr.co/7.jpg",
      max_width: 1920,
      max_height: 1080,
      duration: 10,
    }),
  ];

  assert.deepEqual(
    records.map((record) => record.provider),
    ["pexels", "pixabay", "unsplash", "openverse", "wikimedia", "nasa", "coverr"],
  );
  for (const record of records) {
    assert.equal(record.asset_id, `${record.provider}:${record.external_id}`);
    assert.ok(record.source_url, `${record.provider} sem source_url`);
    assert.ok(record.attribution, `${record.provider} sem atribuição`);
    assert.ok(record.license_name, `${record.provider} sem licença`);
    assert.ok(record.license_url, `${record.provider} sem URL de licença`);
    assert.ok(
      record.download_url || record.download_location,
      `${record.provider} sem URL materializável`,
    );
  }
});

test("falha parcial preserva resultados e identifica provedores indisponíveis", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.openverse.org") {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "open-1",
              title: "Open result",
              creator: "Creator",
              thumbnail: "https://api.openverse.org/v1/images/open-1/thumb/",
              foreign_landing_url: "https://example.invalid/open-1",
              attribution: "Open result by Creator",
              license: "cc0",
              license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
              width: 1920,
              height: 1080,
              filetype: "jpg",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("upstream unavailable", { status: 503 });
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "search-stock-images",
        settings: {},
        configuration: { provider: "all", resultLimitMode: "custom", resultsPerProvider: 3 },
      },
      services(root, {
        PEXELS_API_KEY: "test",
        PIXABAY_API_KEY: "test",
        UNSPLASH_ACCESS_KEY: "test",
      }),
    );
    assert.equal(result.status, "success");
    assert.deepEqual(
      result.values.results.map((record) => record.provider),
      ["openverse"],
    );
    assert.equal(result.values.warnings.length, 5);
    assert.ok(result.values.warnings.some((warning) => warning.startsWith("Pexels:")));
    assert.ok(result.values.warnings.some((warning) => warning.startsWith("NASA:")));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download rejeita hosts não pertencentes ao provedor", async () => {
  const request = {
    ...baseRequest,
    capabilityId: "download-stock-image",
    settings: {},
    inputs: {
      asset: stockImageAsset({
        download_url: "https://example.com/file.jpg",
      }),
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

test("P23 fixa limites comuns e bloqueia endereços privados ou reservados", () => {
  assert.equal(manifest.settingsSchema.properties.maxImageBytes.maximum, 104857600);
  assert.equal(
    manifest.settingsSchema.properties.maxVideoBytes.maximum,
    p23SecureDownloads.maximums.videoBytes,
  );
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "::1",
    "fd00::1",
  ])
    assert.equal(__test.isPublicAddress(address), false, address);
  assert.equal(__test.isPublicAddress("93.184.216.34"), true);
  assert.equal(__test.isPublicAddress("2606:4700:4700::1111"), true);
});

test("moldura de materialização P23 possui PT-BR, inglês e espanhol", () => {
  assert.equal(
    __test.p23Message("pt-BR", "artifactMaterialized"),
    "Download validado e materializado.",
  );
  assert.equal(__test.p23Message("en-US", "artifactReused"), "Validated artifact reused.");
  assert.equal(
    __test.p23Message("es", "privateNetwork"),
    "El host del proveedor se resolvió a una red no permitida.",
  );
  for (const locale of ["pt-BR", "en", "es"])
    for (const key of [
      "dnsUnavailable",
      "privateNetwork",
      "incompleteProvenance",
      "lengthMismatch",
      "cancelled",
      "artifactReused",
      "artifactMaterialized",
    ])
      assert.ok(__test.p23Message(locale, key), `${locale}.${key}`);
});

test("download recusa host oficial quando o DNS resolve para rede privada", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("não deveria conectar");
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        inputs: { asset: stockImageAsset() },
      },
      services(tmpdir(), {}, { resolveHostname: async () => [{ address: "127.0.0.1" }] }),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "PERMISSION_DENIED");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("download falha fechado antes da rede quando licença ou proveniência está ausente", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("não deveria conectar");
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        inputs: { asset: stockImageAsset({ license_name: "", license_url: "" }) },
      },
      services(tmpdir()),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "INVALID_INPUT");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    assert.equal(result.values.image.sha256, p23SecureDownloads.expectedPngSha256);
    assert.equal(result.values.provenance[0].provider, "pexels");
    assert.deepEqual(await readFile(join(root, "output", result.values.image.name)), png);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("tracking do Unsplash ocorre uma única vez para a mesma tentativa lógica", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  let trackingCalls = 0;
  let downloadCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.unsplash.com") {
      trackingCalls += 1;
      return new Response(JSON.stringify({ url: "https://images.unsplash.com/photo-42" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    downloadCalls += 1;
    return new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    });
  };
  try {
    const request = {
      ...baseRequest,
      capabilityId: "download-stock-image",
      settings: { maxImageBytes: 1024 * 1024 },
      inputs: {
        asset: stockImageAsset({
          asset_id: "unsplash:42",
          external_id: "42",
          provider: "unsplash",
          provider_label: "Unsplash",
          download_url: "https://images.unsplash.com/photo-42",
          download_location: "https://api.unsplash.com/photos/42/download",
          source_url: "https://unsplash.com/photos/42",
          attribution: "Photo by Creator on Unsplash",
          license_name: "Unsplash License",
          license_url: "https://unsplash.com/license",
        }),
      },
    };
    assert.equal(
      (await execute(request, services(root, { UNSPLASH_ACCESS_KEY: "test" }))).status,
      "success",
    );
    assert.equal(
      (await execute(request, services(root, { UNSPLASH_ACCESS_KEY: "test" }))).status,
      "success",
    );
    assert.equal(trackingCalls, 1);
    assert.equal(downloadCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("falha no tracking obrigatório do Unsplash impede a materialização", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  let mediaCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.unsplash.com") return new Response("unavailable", { status: 503 });
    mediaCalls += 1;
    throw new Error("a mídia não deve ser baixada sem tracking");
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        inputs: {
          asset: stockImageAsset({
            asset_id: "unsplash:tracking-failure",
            external_id: "tracking-failure",
            provider: "unsplash",
            provider_label: "Unsplash",
            download_url: "https://images.unsplash.com/photo-tracking-failure",
            download_location: "https://api.unsplash.com/photos/tracking-failure/download",
            source_url: "https://unsplash.com/photos/tracking-failure",
            attribution: "Photo by Creator on Unsplash",
            license_name: "Unsplash License",
            license_url: "https://unsplash.com/license",
          }),
        },
      },
      services(root, { UNSPLASH_ACCESS_KEY: "test" }),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "UPSTREAM_UNAVAILABLE");
    assert.equal(mediaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download aceita redirect oficial do mesmo provedor", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1)
      return new Response(null, {
        status: 302,
        headers: { location: "https://images.pexels.com/photos/123/redirected.png" },
      });
    return new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    });
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        settings: { maxImageBytes: 1024 * 1024 },
        inputs: { asset: stockImageAsset() },
      },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download recusa redirect para host fora do provedor", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(null, { status: 302, headers: { location: "https://example.com/file.png" } });
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        settings: { maxImageBytes: 1024 * 1024 },
        inputs: { asset: stockImageAsset() },
      },
      services(root),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "PERMISSION_DENIED");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download recusa cadeia acima de cinco redirects", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: `https://images.pexels.com/photos/123/redirect-${calls}.png` },
    });
  };
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        inputs: { asset: stockImageAsset() },
      },
      services(root),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "UPSTREAM_ERROR");
    assert.equal(calls, p23SecureDownloads.maximums.redirects + 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download recusa MIME declarado com assinatura falsa", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(Buffer.from("not-a-png"), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        settings: { maxImageBytes: 1024 * 1024 },
        inputs: { asset: stockImageAsset() },
      },
      services(root),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "UPSTREAM_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download recusa Content-Length divergente e arquivo acima do limite", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  try {
    globalThis.fetch = async () =>
      new Response(png, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(png.length + 1) },
      });
    const mismatch = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        inputs: { asset: stockImageAsset() },
      },
      services(root),
    );
    assert.equal(mismatch.status, "error");
    assert.equal(mismatch.code, "UPSTREAM_ERROR");

    globalThis.fetch = async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(2 * 1024 * 1024) },
      });
    const oversized = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        settings: { maxImageBytes: 1024 * 1024 },
        inputs: { asset: stockImageAsset({ asset_id: "pexels:oversized" }) },
      },
      services(root),
    );
    assert.equal(oversized.status, "error");
    assert.equal(oversized.code, "OUTPUT_TOO_LARGE");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("retomada reutiliza artifact validado e não repete o download", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    });
  };
  try {
    const request = {
      ...baseRequest,
      capabilityId: "download-stock-image",
      inputs: { asset: stockImageAsset({ asset_id: "pexels:resume" }) },
    };
    const first = await execute(request, services(root));
    const resumed = await execute(request, services(root));
    assert.equal(first.status, "success");
    assert.equal(resumed.status, "success");
    assert.equal(calls, 1);
    assert.equal(resumed.values.image.sha256, first.values.image.sha256);
    assert.deepEqual(await readFile(join(root, "output", resumed.values.image.name)), png);
    assert.equal((await readdir(join(root, "workspace", "download-receipts"))).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("download de vídeo materializa MP4 com hash e proveniência", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const mp4 = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
  ]);
  globalThis.fetch = async () =>
    new Response(mp4, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": String(mp4.length) },
    });
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-video",
        inputs: {
          asset: stockImageAsset({
            asset_id: "pexels:video-1",
            external_id: "video-1",
            media_type: "video",
            download_url: "https://videos.pexels.com/video-files/1/video.mp4",
          }),
        },
      },
      services(root),
    );
    assert.equal(result.status, "success");
    assert.equal(result.values.video.mimeType, "video/mp4");
    assert.match(result.values.video.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.values.provenance[0].media_type, "video");
    assert.deepEqual(await readFile(join(root, "output", result.values.video.name)), mp4);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelamento durante o stream remove o arquivo parcial", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(stream) {
          stream.enqueue(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          controller.abort();
          stream.close();
        },
      }),
      { status: 200, headers: { "content-type": "image/png" } },
    );
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-stock-image",
        context: { locale: "en" },
        inputs: { asset: stockImageAsset({ asset_id: "pexels:cancel" }) },
      },
      services(root, {}, { signal: controller.signal }),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "CANCELLED");
    assert.equal(result.message, "The download was cancelled.");
    assert.deepEqual(await readdir(join(root, "output")), []);
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
  const partials = [];
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
      services(root, {}, { publishPartial: async (update) => partials.push(update) }),
    );
    assert.equal(result.status, "success");
    assert.equal(result.values.assets.length, 1);
    assert.equal(result.values.assets[0].brief_id, "scene-03");
    assert.equal(result.values.assets[0].start_seconds, 8);
    assert.equal(result.values.assets[0].provider, "pexels");
    assert.equal(result.values.assets[0].asset_id, "pexels:321");
    assert.equal(result.values.assets[0].external_id, "321");
    assert.equal(result.values.assets[0].author, "");
    assert.equal(result.values.assets[0].sha256, p23SecureDownloads.expectedPngSha256);
    assert.deepEqual(
      partials.flatMap((update) => update.itemUpdates ?? []).map((update) => update.state),
      ["running", "completed"],
    );
    assert.ok(partials.every((update) => update.values && typeof update.values === "object"));
    assert.equal(partials.at(-1).artifacts[0].id, result.values.assets[0].id);
    assert.deepEqual(await readFile(join(root, "output", result.values.assets[0].name)), png);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("falha de um download em lote publica failed sem artifact remoto", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const partials = [];
  globalThis.fetch = async () =>
    new Response(Buffer.from("not-a-png"), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  try {
    const result = await execute(
      {
        ...baseRequest,
        capabilityId: "download-selected-stock-assets",
        batch: { itemId: "brief-item-failed", index: 1, total: 3 },
        inputs: {
          selected_assets: {
            ...stockImageAsset({ asset_id: "pexels:failed-batch" }),
            brief_id: "scene-failed",
            start_seconds: 4,
            end_seconds: 8,
          },
        },
      },
      services(root, {}, { publishPartial: async (update) => partials.push(update) }),
    );
    assert.equal(result.status, "error");
    assert.equal(result.code, "UPSTREAM_ERROR");
    const updates = partials.flatMap((update) => update.itemUpdates ?? []);
    assert.deepEqual(
      updates.map((update) => update.state),
      ["running", "failed"],
    );
    assert.equal(updates[1].errorCode, "UPSTREAM_ERROR");
    assert.ok(partials.every((update) => update.values && typeof update.values === "object"));
    assert.ok(partials.every((update) => !update.artifacts?.length));
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

test("P22 mantém busca por briefings sob orquestração sequencial do núcleo", () => {
  const capability = manifest.capabilities.find(
    (item) => item.id === p22IncrementalBriefs.capabilityId,
  );
  assert.ok(capability);
  assert.deepEqual(capability.execution.itemOrchestration, p22IncrementalBriefs.itemOrchestration);
  assert.equal(capability.execution.maxConcurrency, 1);
});

test("moldura alterada no P22 possui PT-BR, inglês e espanhol", () => {
  const capability = manifest.capabilities.find(
    (item) => item.id === p22IncrementalBriefs.capabilityId,
  );
  const output = capability.outputPorts.find((port) => port.key === "selected_assets");
  assert.match(output.description, /resultado vazio válido/);
  assert.match(
    manifest.localizations.en.capabilities[p22IncrementalBriefs.capabilityId].outputPorts
      .selected_assets.description,
    /valid empty result/,
  );
  assert.match(
    manifest.localizations.es.capabilities[p22IncrementalBriefs.capabilityId].outputPorts
      .selected_assets.description,
    /resultado vacío válido/,
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

test("nenhum candidato aceitável conclui o briefing com resultado vazio válido", async () => {
  const partials = [];
  const result = await execute(
    {
      ...baseRequest,
      capabilityId: "search-stock-by-briefs",
      batch: { itemId: "batch-empty", index: 1, total: 3 },
      inputs: {
        asset_briefs: {
          brief_id: "scene-low-quality",
          primary_query: "abstract concept",
          fallback_query_1: "symbolic idea",
          transcript_excerpt: "private transcript that must not enter diagnostics",
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
    services(tmpdir(), {}, { publishPartial: async (update) => partials.push(update) }),
  );
  assert.equal(result.status, "success");
  assert.equal(result.values.selected_assets.length, 1);
  assert.deepEqual(
    {
      brief_id: result.values.selected_assets[0].brief_id,
      result_status: result.values.selected_assets[0].result_status,
      candidate_pool_size: result.values.selected_assets[0].candidate_pool_size,
      selection_mode: result.values.selected_assets[0].selection_mode,
    },
    {
      brief_id: "scene-low-quality",
      result_status: "no_acceptable_candidate",
      candidate_pool_size: 0,
      selection_mode: "none",
    },
  );
  assert.equal("download_url" in result.values.selected_assets[0], false);
  assert.match(result.values.selected_assets[0].search_diagnostic, /primary=abstract concept/);
  assert.equal(
    result.values.selected_assets[0].search_diagnostic.includes("private transcript"),
    false,
  );
  assert.deepEqual(
    partials.map((update) => [update.itemUpdates[0].state, update.progress]),
    [
      ["running", 1 / 3],
      ["completed", 2 / 3],
    ],
  );
});

test("P22 persiste sucesso e vazio antes da falha técnica e retoma sem duplicá-los", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-plugin-"));
  const originalFetch = globalThis.fetch;
  const persisted = [];
  const timeline = [];
  const runBrief = async (brief, index, overrides = {}) => {
    const partialService = services(root, overrides.secrets ?? {}, {
      publishPartial: async (update) => {
        const item = update.itemUpdates[0];
        timeline.push(`${item.input.brief_id}:${item.state}`);
      },
    });
    const response = await execute(
      {
        ...baseRequest,
        capabilityId: p22IncrementalBriefs.capabilityId,
        settings: overrides.settings ?? { diagnosticFixture: true },
        batch: { itemId: `batch-${index}`, index, total: p22IncrementalBriefs.briefs.length },
        inputs: { asset_briefs: brief },
        configuration: {
          provider: "pexels",
          mediaPolicy: "images_only",
          minimumImageWidth: 0,
          maximumFallbackQueries: 1,
          minimumQualityScore: overrides.minimumQualityScore ?? 0,
        },
      },
      partialService,
    );
    if (response.status === "success") persisted.push(response.values.selected_assets[0]);
    return response;
  };

  try {
    const [successBrief, emptyBrief, failureBrief] = p22IncrementalBriefs.briefs;
    const success = await runBrief(successBrief, 0);
    const empty = await runBrief(emptyBrief, 1, { minimumQualityScore: 100 });
    globalThis.fetch = async () => {
      throw new Error("provider unavailable");
    };
    const failure = await runBrief(failureBrief, 2, {
      settings: {},
      secrets: { PEXELS_API_KEY: "test-key" },
    });

    assert.equal(success.status, "success");
    assert.equal(success.values.selected_assets[0].result_status, "candidate");
    assert.equal(empty.status, "success");
    assert.equal(empty.values.selected_assets[0].result_status, "no_acceptable_candidate");
    assert.equal(failure.status, "error");
    assert.equal(failure.code, "UPSTREAM_UNAVAILABLE");
    assert.deepEqual(
      persisted.map((item) => item.brief_id),
      ["scene-success", "scene-empty"],
    );
    assert.deepEqual(timeline, p22IncrementalBriefs.timeline);

    globalThis.fetch = originalFetch;
    const retried = await runBrief(failureBrief, 2);
    assert.equal(retried.status, "success");
    assert.deepEqual(
      persisted.map((item) => item.brief_id),
      ["scene-success", "scene-empty", "scene-failure"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelamento após o primeiro briefing preserva o item concluído e não inicia o terceiro", async () => {
  const controller = new AbortController();
  const persisted = [];
  let invocations = 0;
  const run = async (brief, index) => {
    invocations += 1;
    const response = await execute(
      {
        ...baseRequest,
        capabilityId: p22IncrementalBriefs.capabilityId,
        batch: { itemId: `cancel-${index}`, index, total: 3 },
        inputs: { asset_briefs: brief },
        configuration: { minimumImageWidth: 0, minimumQualityScore: 0 },
      },
      services(tmpdir(), {}, { signal: controller.signal }),
    );
    if (response.status === "success") persisted.push(response.values.selected_assets[0]);
    return response;
  };

  const first = await run(p22IncrementalBriefs.briefs[0], 0);
  controller.abort();
  const second = await run(p22IncrementalBriefs.briefs[1], 1);
  if (second.status !== "error") await run(p22IncrementalBriefs.briefs[2], 2);

  assert.equal(first.status, "success");
  assert.equal(second.status, "error");
  assert.equal(second.code, "CANCELLED");
  assert.equal(invocations, 2);
  assert.deepEqual(
    persisted.map((item) => item.brief_id),
    ["scene-success"],
  );
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

test("perfil commercial_safe rejeita licenças NC/ND e preserva licença comercial", () => {
  const brief = { orientation: "any", negativeTerms: [] };
  const config = {
    minimumImageWidth: 0,
    minimumVideoWidth: 0,
    minimumVideoDuration: 0,
    maximumVideoDuration: 0,
    strictOrientation: false,
    commercialSafe: true,
  };
  const candidate = {
    media_type: "image",
    width: 1920,
    height: 1080,
    title: "",
    author: "",
    source_name: "",
    attribution: "",
  };
  assert.equal(
    __test.candidateAllowed({ ...candidate, license_name: "CC BY-NC 4.0" }, brief, config),
    false,
  );
  assert.equal(
    __test.candidateAllowed({ ...candidate, license_name: "CC BY-ND 4.0" }, brief, config),
    false,
  );
  assert.equal(
    __test.candidateAllowed({ ...candidate, license_name: "CC BY 4.0" }, brief, config),
    true,
  );
});
