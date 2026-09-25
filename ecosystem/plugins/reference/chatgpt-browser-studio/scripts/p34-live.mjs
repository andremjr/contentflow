import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { execute } from "../handler.mjs";

const LIVE_FLAG = "CONTENTFLOW_CHATGPT_P34_LIVE";

if (process.env[LIVE_FLAG] !== "1") {
  console.error(`Defina ${LIVE_FLAG}=1 para confirmar a execucao no ChatGPT real.`);
  process.exitCode = 2;
} else {
  const profile = String(process.env.CONTENTFLOW_CHATGPT_P34_PROFILE || "default").trim();
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(profile)) throw new Error("Perfil invalido.");
  if (!prompt) throw new Error("Informe um prompt.");

  const runRoot = process.env.CONTENTFLOW_CHATGPT_P34_RUN_ROOT
    ? resolve(process.env.CONTENTFLOW_CHATGPT_P34_RUN_ROOT)
    : await mkdtemp(join(tmpdir(), "contentflow-chatgpt-p34-"));
  const outputRoot = join(runRoot, "output");
  const profilesRoot = resolve(
    process.env.CONTENTFLOW_CHATGPT_P34_PROFILES_ROOT ||
      join(
        process.env.APPDATA || "",
        "ContentFlow",
        "data",
        "plugin-workspaces",
        "profiles",
        "local.contentflow.chatgpt-browser-studio",
      ),
  );
  const referencePaths = String(process.env.CONTENTFLOW_CHATGPT_P34_REFERENCE_PATHS || "")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(resolve);
  await mkdir(outputRoot, { recursive: true });

  const references = await Promise.all(
    referencePaths.map(async (path, index) => {
      const info = await stat(path);
      return {
        id: `p34-reference-${index}`,
        name: basename(path),
        mimeType: path.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : path.toLowerCase().match(/\.jpe?g$/)
            ? "image/jpeg"
            : "image/png",
        size: info.size,
        url: `artifact://p34-reference-${index}`,
      };
    }),
  );
  const referenceById = new Map(references.map((file, index) => [file.id, referencePaths[index]]));
  const executionId = `p34-live-${Date.now()}`;
  const abortController = new AbortController();
  const services = {
    signal: abortController.signal,
    getOutputPath(relativePath) {
      const target = resolve(outputRoot, relativePath);
      if (!target.startsWith(`${outputRoot}\\`) && target !== outputRoot) {
        throw new Error("Caminho de saida invalido.");
      }
      return target;
    },
    getWorkspacePath(relativePath) {
      const target = resolve(profilesRoot, relativePath);
      if (!target.startsWith(`${profilesRoot}\\`) && target !== profilesRoot) {
        throw new Error("Caminho de workspace invalido.");
      }
      return target;
    },
    async resolveInputFile(file) {
      const path = referenceById.get(file?.id);
      if (!path) throw new Error(`Arquivo de entrada nao resolvido: ${String(file?.id || "?")}.`);
      return path;
    },
    async publishPartial(update) {
      const count = Array.isArray(update?.values?.images) ? update.values.images.length : 0;
      console.error(`[P34] parcial: ${count} imagem(ns), progresso ${update?.progress ?? "?"}.`);
    },
    async getSecret() {
      throw new Error("Este plugin nao usa secrets neste cenario.");
    },
  };
  const request = {
    executionId,
    traceId: `${executionId}-trace`,
    blockId: "p34-live-images",
    capabilityId: "generate-image-in-browser",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: { accountProfile: profile, fallbackAccountProfiles: "", startMinimized: true },
    settings: {
      keepBrowserOpen: true,
      startMinimized: true,
      diagnosticTrace: true,
      responseTimeoutSeconds: 900,
      remoteDebuggingPort: 9544,
    },
    inputs: { prompt, ...(references.length ? { references } : {}) },
    inputContract: [
      { key: "prompt", portKey: "prompt", label: "Prompt", type: "textarea", required: true },
      ...(references.length
        ? [
            {
              key: "references",
              portKey: "references",
              label: "Referencias",
              type: "files",
              required: false,
            },
          ]
        : []),
    ],
    inputDeliveries: [],
    outputContract: [
      { key: "image", portKey: "image", label: "Imagem", type: "image", required: true },
      { key: "images", portKey: "images", label: "Imagens", type: "files", required: false },
      {
        key: "description",
        portKey: "description",
        label: "Descricao",
        type: "textarea",
        required: false,
      },
    ],
    resolvedInstruction: "Gere a imagem solicitada para a validacao E2E P34.",
    unresolvedInstructionVariables: [],
    conversation: { mode: "new" },
    context: {
      locale: "pt-BR",
      project: { id: "p34-live-project", title: "P34 ChatGPT Images" },
      block: { id: "p34-live-images", type: "CRIAR", name: "P34" },
      processType: "assets",
    },
  };

  const result = await execute(request, services);
  console.log(
    JSON.stringify({
      executionId,
      profile,
      runRoot,
      status: result.status,
      code: result.code,
      message: result.message,
      imageCount: Array.isArray(result.values?.images) ? result.values.images.length : 0,
      values: result.values,
      artifacts: result.artifacts,
      conversation: result.conversation,
    }),
  );
  if (result.status !== "success") process.exitCode = 1;
}
