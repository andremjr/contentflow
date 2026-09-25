import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { execute } from "../handler.mjs";

const LIVE_FLAG = "CONTENTFLOW_FLOW_P14_LIVE";
const liveEnabled = process.env[LIVE_FLAG] === "1";

if (!liveEnabled) {
  console.error(`Defina ${LIVE_FLAG}=1 para confirmar a execução contra o Google Flow real.`);
  process.exitCode = 2;
} else {
  const profile = String(process.env.CONTENTFLOW_FLOW_P14_PROFILE || "flow-e2e").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(profile)) {
    throw new Error("Perfil inválido.");
  }

  const prompts = process.argv.slice(2).filter(Boolean);
  const variants = positiveInteger(process.env.CONTENTFLOW_FLOW_P14_VARIANTS, 1);
  const concurrency = positiveInteger(process.env.CONTENTFLOW_FLOW_P14_CONCURRENCY, 1);
  const capabilityId = String(
    process.env.CONTENTFLOW_FLOW_P14_CAPABILITY || "generate-images-in-browser",
  );
  const referencePath = process.env.CONTENTFLOW_FLOW_P14_REFERENCE
    ? resolve(process.env.CONTENTFLOW_FLOW_P14_REFERENCE)
    : undefined;
  const referenceFile = referencePath
    ? {
        id: "p14-reference",
        name: basename(referencePath),
        mimeType: referencePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        size: 1,
        url: "artifact://p14-reference",
      }
    : undefined;
  if (prompts.length === 0) {
    throw new Error("Informe pelo menos um prompt como argumento.");
  }

  const runRoot = process.env.CONTENTFLOW_FLOW_P14_RUN_ROOT
    ? resolve(process.env.CONTENTFLOW_FLOW_P14_RUN_ROOT)
    : await mkdtemp(join(tmpdir(), "contentflow-flow-p14-"));
  const outputRoot = join(runRoot, "output");
  const profileRoot = resolve(
    process.env.CONTENTFLOW_FLOW_P14_PROFILE_ROOT ||
      join(homedir(), ".contentflow", "google-flow-chrome-profile"),
  );
  await mkdir(outputRoot, { recursive: true });

  const executionId =
    String(process.env.CONTENTFLOW_FLOW_P14_EXECUTION_ID || "").trim() || `p14-live-${Date.now()}`;
  const abortController = new AbortController();
  const services = {
    signal: abortController.signal,
    getOutputPath(relativePath) {
      const target = resolve(outputRoot, relativePath);
      if (!target.startsWith(`${outputRoot}\\`) && target !== outputRoot) {
        throw new Error("Caminho de saída inválido.");
      }
      return target;
    },
    getWorkspacePath(relativePath) {
      const target = resolve(profileRoot, relativePath);
      if (!target.startsWith(`${profileRoot}\\`) && target !== profileRoot) {
        throw new Error("Caminho de workspace inválido.");
      }
      return target;
    },
    async resolveInputFile(file) {
      if (referencePath && file?.id === referenceFile.id) return referencePath;
      throw new Error(
        `Arquivo de entrada não resolvido: ${String(file?.id || file?.name || "?")}.`,
      );
    },
    async getSecret() {
      throw new Error("Este plugin não usa secrets neste cenário.");
    },
  };

  const request = {
    executionId,
    traceId: `${executionId}-trace`,
    blockId: "p14-live-generate-images",
    capabilityId,
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {
      accountProfile: profile,
      fallbackAccountProfiles: "",
      projectMode: "new",
      projectUrl: "",
      imageModel: "flow_auto",
      imageModelLabel: "",
      fallbackOnModelLimit: true,
      aspectRatio: "landscape",
      delayBetweenPromptsMs: 0,
      maxConcurrentGenerations: concurrency,
      retryAttempts: 0,
      rateLimitRetryAttempts: 0,
      maxReferenceImages: 10,
      maxImagesPerPrompt: variants,
      videoModel: process.env.CONTENTFLOW_FLOW_P14_VIDEO_MODEL || "veo_3_1_fast",
      videoModelLabel: "",
      videoReferenceMode: process.env.CONTENTFLOW_FLOW_P14_VIDEO_REFERENCE_MODE || "frames",
      videoDurationSeconds: positiveInteger(process.env.CONTENTFLOW_FLOW_P14_VIDEO_DURATION, 4),
      videoResolution: "flow_current",
      productionMode: process.env.CONTENTFLOW_FLOW_P14_PRODUCTION_MODE || "images_only",
      maxVideosToAnimate: positiveInteger(process.env.CONTENTFLOW_FLOW_P14_MAX_VIDEOS, 1),
      animationSelection: process.env.CONTENTFLOW_FLOW_P14_ANIMATION_SELECTION || "first",
      animationIndexes: process.env.CONTENTFLOW_FLOW_P14_ANIMATION_INDEXES || "",
      imageRetention: process.env.CONTENTFLOW_FLOW_P14_IMAGE_RETENTION || "keep_all",
      enableCharacterConsistency: false,
      maxCharacterReferences: 1,
      saveCharacterReferences: true,
      startMinimized: false,
    },
    settings: {
      profilePath: profileRoot,
      profilesRootPath: profileRoot,
      keepBrowserOpen: process.env.CONTENTFLOW_FLOW_P14_KEEP_OPEN === "1",
      startMinimized: false,
      minimizeWhenReady: false,
      diagnosticTrace: true,
      remoteDebuggingPort: 9333,
    },
    inputs: {
      prompts,
      ...(referenceFile
        ? capabilityId === "animate-image-in-browser"
          ? { images: referenceFile }
          : { reference_images: [referenceFile] }
        : {}),
    },
    inputContract: [{ key: "prompts", label: "Prompts", type: "list", required: true }],
    inputDeliveries: [],
    outputContract:
      capabilityId === "produce-visual-assets-in-browser"
        ? [
            { key: "images", label: "Imagens finais", type: "files", required: false },
            {
              key: "character_references",
              label: "Referências de personagem",
              type: "files",
              required: false,
            },
            { key: "videos", label: "Vídeos finais", type: "files", required: false },
            { key: "project_url", label: "URL do projeto", type: "url", required: false },
          ]
        : capabilityId === "generate-images-in-browser"
          ? [
              { key: "images", label: "Imagens geradas", type: "files", required: true },
              { key: "project_url", label: "URL do projeto", type: "url", required: false },
            ]
          : [
              { key: "video", label: "Vídeo gerado", type: "file", required: true },
              { key: "project_url", label: "URL do projeto", type: "url", required: false },
            ],
    resolvedInstruction: "Gere imagens originais para a validação E2E P14.",
    unresolvedInstructionVariables: [],
    context: { locale: "pt-BR" },
  };

  const result = await execute(request, services);
  const reportPath = join(runRoot, "result.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");
  console.log(
    JSON.stringify({
      executionId,
      profile,
      runRoot,
      reportPath,
      status: result.status,
      code: result.code,
      message: result.message,
      values: result.values,
      artifacts: result.artifacts,
      logs: result.logs,
    }),
  );
  if (result.status !== "success") process.exitCode = 1;
}

export const __test = { pathToFileURL };

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
