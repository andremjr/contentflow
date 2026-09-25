const LIVE_FLAG = "CONTENTFLOW_FLOW_P14_LIVE";
const liveEnabled = process.env[LIVE_FLAG] === "1";

if (!liveEnabled) {
  console.error(`Defina ${LIVE_FLAG}=1 para confirmar a execução real pelo ContentFlow.`);
  process.exitCode = 2;
} else {
  const apiRoot = String(process.env.CONTENTFLOW_FLOW_P14_API || "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );
  const channelId = String(process.env.CONTENTFLOW_FLOW_P14_CHANNEL || "p14-flow-channel-81b06376");
  const profile = String(process.env.CONTENTFLOW_FLOW_P14_PROFILE || "flow-e2e").trim();
  const fallbackProfiles = String(process.env.CONTENTFLOW_FLOW_P14_FALLBACK_PROFILES || "").trim();
  const prompts = process.argv.slice(2).filter(Boolean);
  const capabilityId = String(
    process.env.CONTENTFLOW_FLOW_P14_CAPABILITY || "generate-images-in-browser",
  );
  const referenceFile = process.env.CONTENTFLOW_FLOW_P14_REFERENCE_JSON
    ? JSON.parse(process.env.CONTENTFLOW_FLOW_P14_REFERENCE_JSON)
    : undefined;
  const variants = positiveInteger(process.env.CONTENTFLOW_FLOW_P14_VARIANTS, 1);
  const concurrency = positiveInteger(process.env.CONTENTFLOW_FLOW_P14_CONCURRENCY, 1);

  if (prompts.length === 0) throw new Error("Informe pelo menos um prompt como argumento.");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(profile)) throw new Error("Perfil inválido.");

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const projectId = `p14-flow-project-${suffix}`;
  const executionId = `p14-flow-exec-${suffix}`;
  const blockId = `p14-flow-generate-${suffix}`;
  const inputId = `p14-flow-prompts-${suffix}`;
  const referenceInputId = `p14-flow-reference-${suffix}`;
  const now = new Date().toISOString();

  await request("/api/projects", {
    method: "POST",
    body: {
      id: projectId,
      title: `P14 Flow — ${prompts.length} prompt(s), ${variants} variante(s)`,
      channelId,
      currentStage: "assets",
      state: "processing",
      progress: 0,
      deadline: "",
      duration: "",
      updatedAt: "Agora",
      createdAt: now,
      stages: Object.fromEntries(
        [
          "theme",
          "title",
          "thumbnail",
          "script",
          "narration",
          "assets",
          "editing",
          "publishing",
        ].map((processType) => [
          processType,
          processType === "assets" ? "processing" : "not_started",
        ]),
      ),
      assignee: { name: "P14", initials: "P14" },
      thumbHue: 210,
    },
  });

  const block = {
    operator: "IA",
    id: blockId,
    outputs: [
      capabilityId === "generate-images-in-browser"
        ? {
            presentation: {
              renderer: "image-gallery",
              itemType: "image",
              acceptedMimeTypes: ["image/*"],
            },
            portKey: "images",
            id: `p14-flow-images-${suffix}`,
            label: "Imagens geradas",
            type: "files",
            required: true,
            key: "images",
          }
        : {
            presentation: {
              renderer: "video-player",
              itemType: "video",
              acceptedMimeTypes: ["video/mp4"],
            },
            portKey: "video",
            id: `p14-flow-video-${suffix}`,
            label: "Vídeo gerado",
            type: "file",
            required: true,
            key: "video",
          },
    ],
    instructions: "Gere imagens reais para a validação E2E P14.",
    parameters: [],
    name: "Gerar lote canônico no Flow",
    inputs: [
      {
        presentation: { renderer: "list" },
        id: inputId,
        label: "Prompts",
        type: "list",
        source: "runtime",
        portKey: "prompts",
      },
      ...(referenceFile
        ? [
            {
              presentation: {
                renderer: "image-gallery",
                itemType: "image",
                acceptedMimeTypes: ["image/*"],
              },
              id: referenceInputId,
              label: "Imagem de referência",
              type: "file",
              source: "runtime",
              portKey: capabilityId === "animate-image-in-browser" ? "images" : "reference_images",
            },
          ]
        : []),
    ],
    plugin: {
      pluginId: "local.contentflow.google-flow-batch-images",
      pluginVersion: "1.3.7",
      connectionRequired: false,
      configuration: {
        maxConcurrentGenerations: concurrency,
        fallbackAccountProfiles: fallbackProfiles,
        fallbackOnModelLimit: true,
        maxReferenceImages: 10,
        startMinimized: true,
        rateLimitRetryAttempts: 0,
        imageModel: "flow_auto",
        projectMode: "new",
        imageModelLabel: "",
        delayBetweenPromptsMs: 0,
        retryAttempts: 0,
        projectUrl: "",
        accountProfile: profile,
        maxImagesPerPrompt: variants,
        aspectRatio: "landscape",
        videoModel: process.env.CONTENTFLOW_FLOW_P14_VIDEO_MODEL || "veo_3_1_fast",
        videoModelLabel: "",
        videoReferenceMode: process.env.CONTENTFLOW_FLOW_P14_VIDEO_REFERENCE_MODE || "frames",
        videoDurationSeconds: positiveInteger(process.env.CONTENTFLOW_FLOW_P14_VIDEO_DURATION, 4),
        videoResolution: "flow_current",
      },
      capabilityId,
    },
    order: 0,
    type: "CRIAR",
  };

  await request("/api/executions", {
    method: "POST",
    body: {
      id: executionId,
      projectId,
      channelId,
      processType: "assets",
      methodSnapshot: {
        name: "P14 — Flow E2E",
        processType: "assets",
        blocks: [block],
      },
      blocks: [
        {
          blockId,
          status: "blocked_executor",
          values: {},
          runtimeInputs: {
            [inputId]: prompts,
            ...(referenceFile ? { [referenceInputId]: referenceFile } : {}),
          },
          attempt: 1,
          startedAt: now,
        },
      ],
      status: "blocked_executor",
      outputStatus: "pending",
      createdAt: now,
      updatedAt: now,
    },
  });

  const deadline =
    Date.now() + positiveInteger(process.env.CONTENTFLOW_FLOW_P14_TIMEOUT_MS, 900_000);
  let execution;
  while (Date.now() < deadline) {
    ({ execution } = await request(`/api/executions/${executionId}/state`));
    const blockState = execution?.blocks?.find((item) => item.blockId === blockId);
    if (["completed", "failed", "cancelled"].includes(blockState?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  const blockState = execution?.blocks?.find((item) => item.blockId === blockId);
  console.log(
    JSON.stringify({
      projectId,
      executionId,
      blockId,
      status: execution?.status,
      blockStatus: blockState?.status,
      itemProgress: blockState?.itemProgress,
      items: blockState?.items,
      values: blockState?.values,
      deliveries: execution?.deliveries,
      logs: blockState?.logs,
    }),
  );
  if (blockState?.status !== "completed") process.exitCode = 1;

  async function request(path, options = {}) {
    const response = await fetch(`${apiRoot}${path}`, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
    return payload;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
