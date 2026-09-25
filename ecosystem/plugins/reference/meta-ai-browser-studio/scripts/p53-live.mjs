import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { execute } from "../handler.mjs";

if (process.env.CONTENTFLOW_META_P53_LIVE !== "1") {
  throw new Error("Defina CONTENTFLOW_META_P53_LIVE=1 para executar contra o Meta real.");
}

const capabilityId = process.env.CONTENTFLOW_META_P53_CAPABILITY || "generate-text-in-browser";
const profile = process.env.CONTENTFLOW_META_P53_PROFILE || "meta-e2e";
const prompt = process.argv.slice(2).join(" ").trim() || "Responda somente: P53 META OK";
const aspectRatio = process.env.CONTENTFLOW_META_P53_ASPECT || "16:9";
const videoVariants = Number(process.env.CONTENTFLOW_META_P53_VIDEO_VARIANTS || 1);
const referencePath = process.env.CONTENTFLOW_META_P53_REFERENCE
  ? resolve(process.env.CONTENTFLOW_META_P53_REFERENCE)
  : undefined;
const workspaceRoot = resolve(
  process.env.CONTENTFLOW_META_P53_WORKSPACE ||
    "C:/Users/andre/AppData/Roaming/ContentFlow/data/plugin-workspaces/browser-studios/meta-ai",
);
const runRoot = await mkdtemp(join(tmpdir(), "contentflow-meta-p53-"));
const outputRoot = join(runRoot, "output");
await mkdir(outputRoot, { recursive: true });

const referenceFile = referencePath
  ? {
      id: "p53-reference",
      name: basename(referencePath),
      mimeType: referencePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      size: 1,
      url: "artifact://p53-reference",
    }
  : undefined;
const partials = [];
const abortController = new AbortController();
if (process.env.CONTENTFLOW_META_P53_CANCEL_MS) {
  setTimeout(() => abortController.abort(), Number(process.env.CONTENTFLOW_META_P53_CANCEL_MS));
}

const services = {
  signal: abortController.signal,
  getOutputPath(relativePath) {
    return resolve(outputRoot, relativePath);
  },
  getWorkspacePath(relativePath) {
    return resolve(workspaceRoot, relativePath);
  },
  async resolveInputFile(file) {
    if (referencePath && file?.id === referenceFile.id) return referencePath;
    throw new Error(`Arquivo não resolvido: ${String(file?.id || file?.name || "?")}`);
  },
  async publishPartial(update) {
    partials.push(update);
  },
  async getSecret() {
    throw new Error("Meta Browser Studio não usa secrets neste cenário.");
  },
};

const executionId = `p53-live-${Date.now()}`;
const inputs =
  capabilityId === "animate-image-in-browser"
    ? { image: referenceFile, prompt }
    : capabilityId === "generate-video-in-browser"
      ? { prompt, references: referenceFile ? [referenceFile] : [] }
      : capabilityId === "generate-image-in-browser"
        ? { prompt, references: referenceFile ? [referenceFile] : [] }
        : { content: prompt, attachments: [] };

const request = {
  executionId,
  traceId: `${executionId}-trace`,
  blockId: `p53-${capabilityId}`,
  capabilityId,
  attempt: 1,
  invocation: {
    mode: process.env.CONTENTFLOW_META_P53_ITEM_ACTION === "1" ? "item_action" : "start",
    action: process.env.CONTENTFLOW_META_P53_ITEM_ACTION === "1" ? "regenerate" : undefined,
  },
  itemAction: process.env.CONTENTFLOW_META_P53_ITEM_ACTION === "1" ? { input: prompt } : undefined,
  configuration: {
    accountProfile: profile,
    fallbackAccountProfiles: "",
    startMinimized: false,
    aspectRatio,
    videoVariants,
  },
  settings: {
    keepBrowserOpen: false,
    startMinimized: false,
    diagnosticTrace: true,
    queueDelayMs: 0,
    remoteDebuggingPort: 9844,
  },
  inputs,
  resolvedInstruction: prompt,
  unresolvedInstructionVariables: [],
  context: { locale: "pt-BR" },
};

const result = await execute(request, services);
const reportPath = join(runRoot, "result.json");
await writeFile(reportPath, JSON.stringify({ result, partials }, null, 2), "utf8");
console.log(
  JSON.stringify({
    runRoot,
    reportPath,
    status: result.status,
    code: result.code,
    message: result.message,
    values: result.values,
    artifacts: result.artifacts,
    partialCount: partials.length,
  }),
);
if (result.status !== "success") process.exitCode = 1;
