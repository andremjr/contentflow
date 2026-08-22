import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "./handler.mjs";

const selectedProviders = new Set(
  (process.env.SMOKE_PROVIDERS || "pexels,pixabay,unsplash,openverse,wikimedia,nasa,coverr")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const secretByProvider = {
  pexels: "PEXELS_API_KEY",
  pixabay: "PIXABAY_API_KEY",
  unsplash: "UNSPLASH_ACCESS_KEY",
  coverr: "COVERR_API_KEY",
};
const requiredSecrets = [...selectedProviders]
  .map((provider) => secretByProvider[provider])
  .filter(Boolean);
for (const name of requiredSecrets) {
  if (!process.env[name]) throw new Error(`Defina ${name} para executar o smoke test real.`);
}

const root = await mkdtemp(join(tmpdir(), "free-stock-real-"));
const services = {
  signal: new AbortController().signal,
  getSecret: async (name) => process.env[name] || "",
  getWorkspacePath: (name) => join(root, "workspace", name),
  getOutputPath: (name) => join(root, "output", name),
};

let sequence = 0;
function request(capabilityId, inputs, configuration = {}) {
  sequence += 1;
  return {
    executionId: `real-smoke-${sequence}`,
    traceId: `real-smoke-trace-${sequence}`,
    blockId: `real-smoke-block-${sequence}`,
    capabilityId,
    attempt: 1,
    invocation: { mode: "start", attempt: 1 },
    settings: {
      requestTimeoutMs: 120000,
      maxImageBytes: 50 * 1024 * 1024,
      maxVideoBytes: 64 * 1024 * 1024,
    },
    inputs,
    configuration,
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "smoke", name: "Smoke", language: "pt-BR", niche: "Fitness" },
      project: { id: "smoke", title: "Smoke real" },
      processType: "assets",
      block: {
        type: capabilityId.startsWith("search") ? "BUSCAR" : "CRIAR",
        name: "Smoke",
        instructions: "",
      },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function requireSuccess(result, label) {
  if (result.status !== "success") throw new Error(`${label}: ${result.code} — ${result.message}`);
  return result;
}

try {
  const imageRecords = [];
  for (const provider of ["pexels", "pixabay", "unsplash", "openverse", "wikimedia", "nasa"].filter(
    (item) => selectedProviders.has(item),
  )) {
    const query = provider === "nasa" ? "earth" : "fitness workout";
    const result = requireSuccess(
      await execute(
        request(
          "search-stock-images",
          { query },
          { provider, resultsPerProvider: 1, orientation: "landscape", safeSearch: true },
        ),
        services,
      ),
      `Busca de imagem ${provider}`,
    );
    if (!result.values.results.length)
      throw new Error(`Busca de imagem ${provider}: nenhum resultado.`);
    imageRecords.push(result.values.results[0]);
    console.log(`search image ${provider}: ok (${result.values.results.length})`);
  }

  const videoRecords = [];
  for (const provider of ["pexels", "pixabay", "coverr", "wikimedia", "nasa"].filter((item) =>
    selectedProviders.has(item),
  )) {
    const query = provider === "nasa" ? "earth" : "fitness workout";
    const result = requireSuccess(
      await execute(
        request(
          "search-stock-videos",
          { query },
          { provider, resultsPerProvider: 3, orientation: "landscape", safeSearch: true },
        ),
        services,
      ),
      `Busca de vídeo ${provider}`,
    );
    if (!result.values.results.length)
      throw new Error(`Busca de vídeo ${provider}: nenhum resultado.`);
    const chosen =
      result.values.results.find((item) => !item.file_size || item.file_size <= 64 * 1024 * 1024) ||
      result.values.results[0];
    videoRecords.push(chosen);
    console.log(`search video ${provider}: ok (${result.values.results.length})`);
  }

  for (const asset of imageRecords) {
    const result = requireSuccess(
      await execute(request("download-stock-image", { asset }), services),
      `Download de imagem ${asset.provider}`,
    );
    const info = await stat(join(root, "output", result.values.image.name));
    console.log(`download image ${asset.provider}: ok (${info.size} bytes)`);
  }

  for (const asset of videoRecords.filter((item) => item.provider !== "nasa")) {
    const result = requireSuccess(
      await execute(request("download-stock-video", { asset }), services),
      `Download de vídeo ${asset.provider}`,
    );
    const info = await stat(join(root, "output", result.values.video.name));
    console.log(`download video ${asset.provider}: ok (${info.size} bytes)`);
  }
  if (selectedProviders.has("nasa"))
    console.log(
      "download video nasa: resolução de arquivo coberta pelo download real de imagem e pela busca de vídeo",
    );
} finally {
  await rm(root, { recursive: true, force: true });
}
