import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { execute } from "../handler.mjs";

const LIVE_FLAG = "CONTENTFLOW_VIBES_P46_LIVE";
const PROFILE = String(process.env.CONTENTFLOW_VIBES_P46_PROFILE || "default").trim();
const SCENARIO = String(process.argv[2] || "status").trim();
const PROJECT_URL = String(process.env.CONTENTFLOW_VIBES_P46_PROJECT_URL || "").trim();
const START_MINIMIZED = process.env.CONTENTFLOW_VIBES_P46_VISIBLE !== "1";
const KEEP_BROWSER_OPEN = process.env.CONTENTFLOW_VIBES_P46_KEEP_OPEN === "1";
const START_ONLY = process.env.CONTENTFLOW_VIBES_P46_START_ONLY === "1";
const WORKSPACE_ROOT = resolve(
  process.env.CONTENTFLOW_VIBES_P46_WORKSPACE ||
    join(
      process.env.APPDATA || "",
      "ContentFlow",
      "data",
      "plugin-workspaces",
      "profiles",
      "local.contentflow.vibes-browser-studio",
    ),
);
const RUN_ROOT = resolve(
  process.env.CONTENTFLOW_VIBES_P46_RUN_ROOT || join(WORKSPACE_ROOT, "p46-evidence"),
);
const REFERENCE_ROOT = resolve(
  process.env.CONTENTFLOW_VIBES_P46_REFERENCE_ROOT ||
    join(process.cwd(), "ecosystem", "plugins", "reference"),
);

const SCENARIOS = new Set([
  "status",
  "prepare",
  "image-basic",
  "image-regenerate",
  "image-references",
  "frames-initial-480p",
  "frames-both-720p",
  "elements-720p",
]);

if (process.env[LIVE_FLAG] !== "1") {
  console.error(`Defina ${LIVE_FLAG}=1 para confirmar a execução contra o Vibes real.`);
  process.exitCode = 2;
} else if (!SCENARIOS.has(SCENARIO)) {
  throw new Error(`Cenário P46 desconhecido: ${SCENARIO}`);
} else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(PROFILE)) {
  throw new Error("Alias de perfil inválido.");
} else {
  await run();
}

async function run() {
  await mkdir(RUN_ROOT, { recursive: true });
  const executionId =
    String(process.env.CONTENTFLOW_VIBES_P46_EXECUTION_ID || "").trim() ||
    `p46-${SCENARIO}-${Date.now()}`;
  const partials = [];
  const controller = new AbortController();
  const references = await referenceInventory();
  const services = {
    signal: controller.signal,
    getWorkspacePath(relativePath) {
      return controlledPath(WORKSPACE_ROOT, relativePath);
    },
    getOutputPath(relativePath) {
      return controlledPath(join(RUN_ROOT, "output"), relativePath);
    },
    async resolveInputFile(file) {
      const found = references.find((entry) => entry.file.id === file?.id);
      if (!found) throw new Error(`Referência P46 não resolvida: ${String(file?.id || "?")}`);
      return found.path;
    },
    async getSecret() {
      throw new Error("O plugin Vibes não usa secrets neste cenário.");
    },
    async publishPartial(partial) {
      partials.push(redactResult(partial));
    },
  };

  let request = buildRequest(executionId, references);
  let result = await execute(request, services);
  const startedAt = Date.now();
  while (!START_ONLY && result.status === "pending" && Date.now() - startedAt < 12 * 60_000) {
    await delay(Math.max(1000, Math.min(Number(result.pollAfterMs) || 2500, 5000)));
    request = {
      ...request,
      invocation: { mode: "resume", jobId: result.jobId },
    };
    result = await execute(request, services);
  }

  const report = {
    scenario: SCENARIO,
    executionId,
    profile: PROFILE,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    projectMode: request.configuration.projectMode,
    result: redactResult(result),
    partials,
  };
  const reportPath = join(RUN_ROOT, `${executionId}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
  if (result.status !== "success") process.exitCode = 1;
}

function buildRequest(executionId, references) {
  if (["status", "prepare"].includes(SCENARIO)) {
    return {
      ...baseRequest(executionId, "generate-images-in-browser"),
      invocation: { mode: "configure", action: SCENARIO },
      settings: {
        keepBrowserOpen: false,
        startMinimized: false,
        remoteDebuggingPort: 9430,
        interactiveWaitSeconds: 600,
      },
      inputs: {},
      batch: undefined,
    };
  }

  const projectMode = PROJECT_URL ? "existing" : "new";
  if (SCENARIO === "image-basic") {
    return {
      ...baseRequest(executionId, "generate-images-in-browser", projectMode),
      inputs: {
        prompts:
          "P46 validation asset: a simple paper boat on calm blue water, clean studio lighting, vertical 9:16, no text",
        ...(PROJECT_URL ? { project_url: PROJECT_URL } : {}),
      },
      batch: { itemId: "p46-image-basic", index: 0, total: 1 },
    };
  }
  if (SCENARIO === "image-regenerate") {
    return {
      ...baseRequest(executionId, "generate-images-in-browser", projectMode),
      invocation: {
        mode: "item_action",
        action: "regenerate",
        itemId: "p46-existing-variant-2",
        outputPort: "images",
      },
      itemAction: {
        key: "variant:2",
        variantKey: "image:2",
        input:
          "P46 regeneration asset: one folded paper crane on a pale blue background, vertical 9:16, no text",
        output: {
          id: "p46-existing-variant-2",
          name: "p46-existing-variant-2.jpg",
          mimeType: "image/jpeg",
          size: 1,
          url: "artifact://p46-existing-variant-2",
        },
        attempt: 2,
      },
      inputs: {
        prompts:
          "P46 regeneration asset: one folded paper crane on a pale blue background, vertical 9:16, no text",
        ...(PROJECT_URL ? { project_url: PROJECT_URL } : {}),
      },
      batch: { itemId: "p46-image-regenerate", index: 0, total: 1 },
    };
  }
  if (SCENARIO === "image-references") {
    return {
      ...baseRequest(executionId, "generate-images-in-browser", projectMode),
      inputs: {
        prompts:
          "P46 validation asset: reinterpret the supplied references as a clean abstract poster, vertical 9:16, no text",
        character_reference: references[0].file,
        scene_reference: references[1].file,
        style_references: [references[2].file, references[3].file],
        ...(PROJECT_URL ? { project_url: PROJECT_URL } : {}),
      },
      batch: { itemId: "p46-image-references", index: 0, total: 1 },
    };
  }
  if (SCENARIO.startsWith("frames-")) {
    const both = SCENARIO === "frames-both-720p";
    return {
      ...baseRequest(executionId, "animate-frame-in-browser", projectMode, both ? "720p" : "480p"),
      inputs: {
        initial_frames: references[0].file,
        ...(both ? { final_frames: references[1].file } : {}),
        prompts: both
          ? "Smooth transition from the first abstract composition to the second, gentle camera motion"
          : "Gentle push-in with subtle parallax and stable composition",
        ...(PROJECT_URL ? { project_url: PROJECT_URL } : {}),
      },
      inputDeliveries: [],
      batch: { itemId: `p46-${SCENARIO}`, index: 0, total: 1 },
    };
  }
  return {
    ...baseRequest(executionId, "generate-video-with-elements-in-browser", projectMode, "720p"),
    inputs: {
      prompts:
        "A slow cinematic orbit preserving the supplied character, scene and visual style components",
      character_reference: references[0].file,
      scene_reference: references[1].file,
      style_references: [references[2].file, references[3].file],
      ...(PROJECT_URL ? { project_url: PROJECT_URL } : {}),
    },
    batch: { itemId: "p46-elements-720p", index: 0, total: 1 },
  };
}

function baseRequest(executionId, capabilityId, projectMode = "new", resolution = "720p") {
  return {
    executionId,
    traceId: `${executionId}-trace`,
    blockId: `p46-${capabilityId}`,
    capabilityId,
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {
      accountProfile: PROFILE,
      fallbackAccountProfiles: [],
      projectMode,
      projectUrl: PROJECT_URL,
      resolution,
      startMinimized: START_MINIMIZED,
    },
    settings: {
      keepBrowserOpen: KEEP_BROWSER_OPEN,
      startMinimized: START_MINIMIZED,
      remoteDebuggingPort: 9430,
    },
    inputs: {},
    inputDeliveries: [],
    resolvedInstruction:
      "Create only a harmless synthetic media asset for ContentFlow P46 validation.",
    unresolvedInstructionVariables: [],
    context: { locale: "pt-BR", timeZone: "America/Sao_Paulo" },
  };
}

async function referenceInventory() {
  const paths = [
    join(REFERENCE_ROOT, "vibes-browser-studio", "assets", "icon.png"),
    join(REFERENCE_ROOT, "google-flow-browser-images", "assets", "icon.png"),
    join(REFERENCE_ROOT, "meta-ai-browser-studio", "assets", "icon.png"),
    join(REFERENCE_ROOT, "chatgpt-browser-studio", "assets", "icon.png"),
  ];
  return Promise.all(
    paths.map(async (path, index) => {
      const bytes = await readFile(path);
      const metadata = await stat(path);
      return {
        path,
        file: {
          id: `p46-reference-${index + 1}`,
          name: basename(path),
          mimeType: "image/png",
          size: metadata.size,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          url: `stored://p46-reference-${index + 1}`,
        },
      };
    }),
  );
}

function controlledPath(root, relativePath) {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}\\`)) {
    throw new Error("Caminho P46 fora da raiz controlada.");
  }
  return target;
}

function redactResult(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(
    JSON.stringify(value, (key, entry) => {
      if (key === "source" && entry?.kind === "url") {
        return { kind: "url", host: safeHost(entry.url) };
      }
      return entry;
    }),
  );
}

function safeHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid";
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
