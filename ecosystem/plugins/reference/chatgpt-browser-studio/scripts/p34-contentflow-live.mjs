const LIVE_FLAG = "CONTENTFLOW_CHATGPT_P34_LIVE";

if (process.env[LIVE_FLAG] !== "1") {
  console.error(`Defina ${LIVE_FLAG}=1 para confirmar a execucao no ChatGPT real.`);
  process.exitCode = 2;
} else {
  const apiRoot = String(
    process.env.CONTENTFLOW_CHATGPT_P34_API || "http://127.0.0.1:8787",
  ).replace(/\/$/, "");
  const profile = String(process.env.CONTENTFLOW_CHATGPT_P34_PROFILE || "default").trim();
  const prompts = process.argv.slice(2).filter(Boolean);
  const referenceFiles = process.env.CONTENTFLOW_CHATGPT_P34_REFERENCES_JSON
    ? JSON.parse(process.env.CONTENTFLOW_CHATGPT_P34_REFERENCES_JSON)
    : [];
  const scenario = String(process.env.CONTENTFLOW_CHATGPT_P34_SCENARIO || "image-smoke");
  const channelId = "p34-chatgpt-channel";

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(profile)) throw new Error("Perfil invalido.");
  if (prompts.length === 0) throw new Error("Informe pelo menos um prompt como argumento.");
  if (!Array.isArray(referenceFiles)) throw new Error("REFERENCES_JSON precisa ser uma lista.");

  await ensureChannel();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const projectId = `p34-chatgpt-project-${suffix}`;
  const executionId = `p34-chatgpt-exec-${suffix}`;
  const blockId = `p34-chatgpt-images-${suffix}`;
  const promptInputId = `p34-chatgpt-prompts-${suffix}`;
  const referencesInputId = `p34-chatgpt-references-${suffix}`;
  const now = new Date().toISOString();

  await request("/api/projects", {
    method: "POST",
    body: {
      id: projectId,
      title: `P34 ChatGPT Images — ${scenario}`,
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
      assignee: { name: "P34", initials: "P34" },
      thumbHue: 220,
    },
  });

  const block = {
    id: blockId,
    type: "CRIAR",
    operator: "IA",
    name: `Validar ChatGPT Images — ${scenario}`,
    instructions: "Gere a imagem solicitada para a validacao E2E P34.",
    inputs: [
      {
        id: promptInputId,
        label: "Prompts de teste",
        key: "prompt",
        portKey: "prompt",
        type: prompts.length === 1 ? "textarea" : "list",
        source: "runtime",
        presentation: { renderer: prompts.length === 1 ? "text-long" : "list" },
      },
      ...(referenceFiles.length
        ? [
            {
              id: referencesInputId,
              label: "Referencias de teste",
              key: "references",
              portKey: "references",
              type: "files",
              source: "runtime",
              presentation: {
                renderer: "image-gallery",
                itemType: "image",
                acceptedMimeTypes: ["image/*"],
              },
            },
          ]
        : []),
    ],
    outputs: [
      {
        id: `p34-image-${suffix}`,
        label: "Primeira imagem",
        key: "image",
        portKey: "image",
        type: "image",
        required: true,
        presentation: {
          renderer: "image-gallery",
          itemType: "image",
          acceptedMimeTypes: ["image/*"],
        },
      },
      {
        id: `p34-images-${suffix}`,
        label: "Imagens geradas",
        key: "images",
        portKey: "images",
        type: "files",
        required: false,
        presentation: {
          renderer: "image-gallery",
          itemType: "image",
          acceptedMimeTypes: ["image/*"],
        },
      },
      {
        id: `p34-description-${suffix}`,
        label: "Descricao",
        key: "description",
        portKey: "description",
        type: "textarea",
        required: false,
        presentation: { renderer: "text-long" },
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId: "local.contentflow.chatgpt-browser-studio",
      pluginVersion: "1.0.14",
      capabilityId: "generate-image-in-browser",
      connectionRequired: false,
      configuration: {
        accountProfile: profile,
        fallbackAccountProfiles: "",
        startMinimized: true,
      },
    },
  };

  await request("/api/executions", {
    method: "POST",
    body: {
      id: executionId,
      projectId,
      channelId,
      processType: "assets",
      methodSnapshot: { name: `P34 — ${scenario}`, processType: "assets", blocks: [block] },
      blocks: [
        {
          blockId,
          status: "blocked_executor",
          values: {},
          runtimeInputs: {
            [promptInputId]: prompts.length === 1 ? prompts[0] : prompts,
            ...(referenceFiles.length ? { [referencesInputId]: referenceFiles } : {}),
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
    Date.now() + positiveInteger(process.env.CONTENTFLOW_CHATGPT_P34_TIMEOUT_MS, 900_000);
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
      scenario,
      projectId,
      executionId,
      blockId,
      revision: execution?.revision,
      status: execution?.status,
      blockStatus: blockState?.status,
      itemProgress: blockState?.itemProgress,
      items: blockState?.items,
      values: blockState?.values,
      logs: blockState?.logs,
    }),
  );
  if (blockState?.status !== "completed") process.exitCode = 1;

  async function ensureChannel() {
    const channels = await request("/api/channels");
    if (channels.some((channel) => channel.id === channelId)) return;
    const createdAt = new Date().toISOString();
    await request("/api/channels", {
      method: "POST",
      body: {
        id: channelId,
        name: "Validacao P34 ChatGPT",
        handle: "@p34-chatgpt",
        niche: "Validacao E2E",
        language: "PT-BR",
        color: "#2563EB",
        subscribers: "",
        frequency: "",
        nextPublish: "",
        currentProjectProgress: 0,
        activeProjects: 0,
        status: "paused",
        trend: [],
        methods: {},
        createdAt,
      },
    });
  }

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
