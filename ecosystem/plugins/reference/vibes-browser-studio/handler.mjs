import { createVibesAutomation } from "./vibes-automation.mjs";

export const CAPABILITY_ID = "generate-images-in-browser";
export const FRAME_VIDEO_CAPABILITY_ID = "animate-frame-in-browser";
export const ELEMENT_VIDEO_CAPABILITY_ID = "generate-video-with-elements-in-browser";
const PROFILE_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROJECT_URL = /^https:\/\/vibes\.ai\/projects\/[A-Za-z0-9_-]+\/?$/;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_STYLE_REFERENCES = 6;
const MAX_PROMPT_CHARACTERS = 12_000;

const COPY = {
  "pt-BR": {
    invalidCapability: "A capability solicitada não é oferecida por este plugin.",
    invalidAction: "A ação de item solicitada não é suportada.",
    invalidProfile: "Informe um alias de perfil válido com até 64 caracteres.",
    invalidPrompt: "Informe um prompt de imagem com até 12.000 caracteres.",
    invalidFramePrompt: "Informe um prompt de movimento com até 12.000 caracteres.",
    invalidElementPrompt: "Informe um prompt de vídeo com até 12.000 caracteres.",
    invalidProject: "Informe uma URL https://vibes.ai/projects/<id> válida.",
    projectRequired: "O modo Projeto existente exige uma URL de projeto válida.",
    invalidReference: "As referências devem ser imagens PNG, JPG ou WebP de até 10 MiB.",
    initialFrameRequired: "Informe exatamente um quadro inicial válido para este item.",
    invalidFrameAlignment:
      "Quadro final e prompt precisam estar alinhados ao quadro inicial pela identidade da entrega.",
    invalidResolution: "Escolha a resolução 480p ou 720p.",
    tooManyStyles: "Use no máximo 6 referências de estilo por geração.",
    tooManyCharacters: "Use no máximo 1 referência de Personagem por geração.",
    tooManyScenes: "Use no máximo 1 referência de Cena por geração.",
    cancelled: "Execução cancelada.",
    failed: "Não foi possível concluir a geração de imagens no Vibes.",
    videoFailed: "Não foi possível concluir a geração de vídeos por Frames no Vibes.",
    elementVideoFailed: "Não foi possível concluir a geração de vídeos por Elementos no Vibes.",
  },
  en: {
    invalidCapability: "The requested capability is not provided by this plugin.",
    invalidAction: "The requested item action is not supported.",
    invalidProfile: "Enter a valid profile alias up to 64 characters.",
    invalidPrompt: "Enter an image prompt up to 12,000 characters.",
    invalidFramePrompt: "Enter a motion prompt up to 12,000 characters.",
    invalidElementPrompt: "Enter a video prompt up to 12,000 characters.",
    invalidProject: "Enter a valid https://vibes.ai/projects/<id> URL.",
    projectRequired: "Existing project mode requires a valid project URL.",
    invalidReference: "References must be PNG, JPG, or WebP images up to 10 MiB.",
    initialFrameRequired: "Provide exactly one valid initial frame for this item.",
    invalidFrameAlignment:
      "The final frame and prompt must align with the initial frame by delivery identity.",
    invalidResolution: "Choose 480p or 720p resolution.",
    tooManyStyles: "Use at most 6 style references per generation.",
    tooManyCharacters: "Use at most 1 Character reference per generation.",
    tooManyScenes: "Use at most 1 Scene reference per generation.",
    cancelled: "Execution cancelled.",
    failed: "Vibes image generation could not be completed.",
    videoFailed: "Vibes Frames video generation could not be completed.",
    elementVideoFailed: "Vibes Elements video generation could not be completed.",
  },
  es: {
    invalidCapability: "La capability solicitada no está disponible en este plugin.",
    invalidAction: "La acción de elemento solicitada no es compatible.",
    invalidProfile: "Ingresa un alias de perfil válido de hasta 64 caracteres.",
    invalidPrompt: "Ingresa un prompt de imagen de hasta 12.000 caracteres.",
    invalidFramePrompt: "Ingresa un prompt de movimiento de hasta 12.000 caracteres.",
    invalidElementPrompt: "Ingresa un prompt de video de hasta 12.000 caracteres.",
    invalidProject: "Ingresa una URL válida https://vibes.ai/projects/<id>.",
    projectRequired: "El modo Proyecto existente requiere una URL de proyecto válida.",
    invalidReference: "Las referencias deben ser imágenes PNG, JPG o WebP de hasta 10 MiB.",
    initialFrameRequired: "Proporciona exactamente un fotograma inicial válido para este elemento.",
    invalidFrameAlignment:
      "El fotograma final y el prompt deben alinearse con el inicial por identidad de entrega.",
    invalidResolution: "Elige la resolución 480p o 720p.",
    tooManyStyles: "Usa como máximo 6 referencias de estilo por generación.",
    tooManyCharacters: "Usa como máximo 1 referencia de Personaje por generación.",
    tooManyScenes: "Usa como máximo 1 referencia de Escena por generación.",
    cancelled: "Ejecución cancelada.",
    failed: "No se pudo completar la generación de imágenes en Vibes.",
    videoFailed: "No se pudo completar la generación de videos por Frames en Vibes.",
    elementVideoFailed: "No se pudo completar la generación de videos por Elementos en Vibes.",
  },
};

export function localeFor(request) {
  const locale = String(request?.context?.locale ?? "pt-BR").toLowerCase();
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("es")) return "es";
  return "pt-BR";
}

function copy(request, key) {
  return COPY[localeFor(request)][key];
}

function resultError(request, code, key, retryable = false, retryAfterMs) {
  const result = { status: "error", code, message: copy(request, key), retryable };
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) result.retryAfterMs = retryAfterMs;
  return result;
}

export function normalizeProfileAlias(value, request) {
  const alias = String(value ?? "default").trim();
  if (!PROFILE_ALIAS.test(alias)) {
    const error = new Error(copy(request, "invalidProfile"));
    error.code = "INVALID_CONFIGURATION";
    throw error;
  }
  return alias;
}

export function normalizeProjectUrl(value, request, required = false) {
  const url = String(value ?? "").trim();
  if (!url && !required) return "";
  if (!PROJECT_URL.test(url)) {
    const error = new Error(copy(request, required ? "projectRequired" : "invalidProject"));
    error.code = "INVALID_CONFIGURATION";
    throw error;
  }
  return url.replace(/\/$/, "");
}

function scalarPrompt(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1) return undefined;
    return value[0];
  }
  return value;
}

export function composePrompt(request, portKey = "prompts", errorKey = "invalidPrompt") {
  const raw =
    request?.invocation?.mode === "item_action" &&
    [CAPABILITY_ID, ELEMENT_VIDEO_CAPABILITY_ID].includes(request?.capabilityId)
      ? request?.itemAction?.input
      : request?.inputs?.[portKey];
  const prompt = String(scalarPrompt(raw) ?? "").trim();
  if (!prompt || prompt.length > MAX_PROMPT_CHARACTERS) {
    const error = new Error(copy(request, errorKey));
    error.code = "INVALID_INPUT";
    throw error;
  }
  const instruction = String(request?.resolvedInstruction ?? "").trim();
  if (!instruction || prompt === instruction || prompt.includes(instruction)) return prompt;
  const combined = `${instruction}\n\n${prompt}`;
  if (combined.length > MAX_PROMPT_CHARACTERS) {
    const error = new Error(copy(request, errorKey));
    error.code = "INVALID_INPUT";
    throw error;
  }
  return combined;
}

function flattenFiles(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((item) =>
    Array.isArray(item) ? item : [item],
  );
}

function validateStoredImage(value, request) {
  if (!value || typeof value !== "object") {
    const error = new Error(copy(request, "invalidReference"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  const mimeType = String(value.mimeType ?? "").toLowerCase();
  if (
    !IMAGE_MIMES.has(mimeType) ||
    !Number.isFinite(value.size) ||
    value.size <= 0 ||
    value.size > MAX_REFERENCE_BYTES
  ) {
    const error = new Error(copy(request, "invalidReference"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  return value;
}

export async function resolveReferences(request, services) {
  const character = flattenFiles(request?.inputs?.character_reference);
  const scene = flattenFiles(request?.inputs?.scene_reference);
  const styles = flattenFiles(request?.inputs?.style_references);
  if (character.length > 1) {
    const error = new Error(copy(request, "tooManyCharacters"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (scene.length > 1) {
    const error = new Error(copy(request, "tooManyScenes"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (styles.length > MAX_STYLE_REFERENCES) {
    const error = new Error(copy(request, "tooManyStyles"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  const groups = [
    ...character.map((file) => ({ role: "character", file: validateStoredImage(file, request) })),
    ...scene.map((file) => ({ role: "scene", file: validateStoredImage(file, request) })),
    ...styles.map((file) => ({ role: "style", file: validateStoredImage(file, request) })),
  ];
  const output = [];
  for (const entry of groups) {
    output.push({
      role: entry.role,
      file: entry.file,
      path: await services.resolveInputFile(entry.file),
    });
  }
  return output;
}

function deliveryFor(request, portKey) {
  return request?.inputDeliveries?.find((delivery) => delivery.portKey === portKey);
}

export function alignedInput(request, portKey, { required = false } = {}) {
  const value = request?.inputs?.[portKey];
  if (!Array.isArray(value)) {
    if (required && value == null) {
      const error = new Error(copy(request, "initialFrameRequired"));
      error.code = "INVALID_INPUT";
      throw error;
    }
    return value;
  }
  if (value.length === 0) {
    if (!required) return undefined;
    const error = new Error(copy(request, "initialFrameRequired"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (value.length === 1) return value[0];
  const index = request?.batch?.index;
  const initialDelivery = deliveryFor(request, "initial_frames");
  const targetDelivery = deliveryFor(request, portKey);
  const initialIdentity = Number.isInteger(index) ? initialDelivery?.itemIds?.[index] : undefined;
  const targetIndex = initialIdentity ? targetDelivery?.itemIds?.indexOf(initialIdentity) : -1;
  if (!initialIdentity || targetIndex < 0 || targetIndex >= value.length) {
    const error = new Error(copy(request, "invalidFrameAlignment"));
    error.code = "INVALID_INPUT";
    throw error;
  }
  return value[targetIndex];
}

async function resolvedFrame(request, services, portKey, required = false) {
  const value = alignedInput(request, portKey, { required });
  if (value == null) return undefined;
  const file = validateStoredImage(value, request);
  return {
    role: portKey === "initial_frames" ? "initial" : "final",
    file,
    path: await services.resolveInputFile(file),
  };
}

export async function resolveFrameVideoInputs(request, services) {
  const initialFrame = await resolvedFrame(request, services, "initial_frames", true);
  const finalFrame = await resolvedFrame(request, services, "final_frames", false);
  const promptValue = alignedInput(request, "prompts", { required: true });
  const prompt = composePrompt(
    { ...request, inputs: { ...request.inputs, prompts: promptValue } },
    "prompts",
    "invalidFramePrompt",
  );
  const styleRequest = {
    ...request,
    inputs: {
      style_references: request?.inputs?.style_references,
      character_reference: undefined,
      scene_reference: undefined,
    },
  };
  const styles = await resolveReferences(styleRequest, services);
  return { prompt, frames: [initialFrame, finalFrame].filter(Boolean), references: styles };
}

export async function resolveElementVideoInputs(request, services) {
  return {
    prompt: composePrompt(request, "prompts", "invalidElementPrompt"),
    references: await resolveReferences(request, services),
  };
}

export function normalizeExecution(request) {
  const configuration = request?.configuration ?? {};
  const profileAlias = normalizeProfileAlias(configuration.accountProfile, request);
  const projectMode = ["auto", "new", "existing"].includes(configuration.projectMode)
    ? configuration.projectMode
    : "auto";
  const inputProjectUrl = normalizeProjectUrl(request?.inputs?.project_url, request);
  const configuredProjectUrl = normalizeProjectUrl(
    configuration.projectUrl,
    request,
    projectMode === "existing" && !inputProjectUrl,
  );
  return {
    profileAlias,
    projectMode,
    projectUrl: inputProjectUrl || configuredProjectUrl,
    startMinimized:
      typeof configuration.startMinimized === "boolean"
        ? configuration.startMinimized
        : request?.settings?.startMinimized !== false,
    resolution: ["480p", "720p"].includes(configuration.resolution)
      ? configuration.resolution
      : "720p",
  };
}

async function run(request, services, automation) {
  if (request?.invocation?.mode === "configure") {
    const profileAlias = normalizeProfileAlias(request?.configuration?.accountProfile, request);
    if (request.invocation.action === "status") return automation.profileStatus(profileAlias);
    if (request.invocation.action === "prepare") return automation.prepareProfile(profileAlias);
    return resultError(request, "INVALID_CONFIGURATION", "invalidAction");
  }
  if (
    ![CAPABILITY_ID, FRAME_VIDEO_CAPABILITY_ID, ELEMENT_VIDEO_CAPABILITY_ID].includes(
      request?.capabilityId,
    )
  ) {
    return resultError(request, "NOT_FOUND", "invalidCapability");
  }
  const mode = request?.invocation?.mode;
  if (mode === "cancel") return automation.cancel(request.invocation.jobId);
  if (mode === "resume") return automation.resume(request.invocation.jobId);
  if (mode === "item_action" && request?.invocation?.action !== "regenerate") {
    return resultError(request, "INVALID_CONFIGURATION", "invalidAction");
  }
  if (mode !== "start" && mode !== "item_action") {
    return resultError(request, "INVALID_CONFIGURATION", "invalidAction");
  }
  const execution = normalizeExecution(request);
  const frameVideo = request.capabilityId === FRAME_VIDEO_CAPABILITY_ID;
  const elementVideo = request.capabilityId === ELEMENT_VIDEO_CAPABILITY_ID;
  const input = frameVideo
    ? { ...(await resolveFrameVideoInputs(request, services)), kind: "video-frames" }
    : elementVideo
      ? { ...(await resolveElementVideoInputs(request, services)), kind: "video-elements" }
      : {
          prompt: composePrompt(request),
          references: await resolveReferences(request, services),
          kind: "image",
        };
  return mode === "item_action"
    ? automation.regenerate({ ...input, ...execution })
    : automation.start({ ...input, ...execution });
}

export async function execute(request, services) {
  try {
    const automation = createVibesAutomation(request, services);
    return await run(request, services, automation);
  } catch (error) {
    return {
      status: "error",
      code: error?.code || (services?.signal?.aborted ? "CANCELLED" : "UPSTREAM_UNAVAILABLE"),
      message:
        error?.message ||
        copy(
          request,
          services?.signal?.aborted
            ? "cancelled"
            : request?.capabilityId === FRAME_VIDEO_CAPABILITY_ID
              ? "videoFailed"
              : request?.capabilityId === ELEMENT_VIDEO_CAPABILITY_ID
                ? "elementVideoFailed"
                : "failed",
        ),
      retryable: Boolean(error?.retryable),
      ...(Number.isFinite(error?.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  }
}

export async function executeWithAutomation(request, services, automation) {
  try {
    return await run(request, services, automation);
  } catch (error) {
    return {
      status: "error",
      code: error?.code || "UPSTREAM_UNAVAILABLE",
      message: error?.message || copy(request, "failed"),
      retryable: Boolean(error?.retryable),
    };
  }
}

export const __test = {
  PROJECT_URL,
  MAX_REFERENCE_BYTES,
  MAX_STYLE_REFERENCES,
  alignedInput,
  composePrompt,
  normalizeExecution,
  normalizeProfileAlias,
  normalizeProjectUrl,
};
