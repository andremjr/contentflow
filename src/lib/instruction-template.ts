import type { RuntimeValue } from "@/lib/domain";

export type InstructionTemplateInput = {
  id: string;
  label: string;
  sourceKey?: string;
  portKey?: string;
  value: RuntimeValue;
};

export type InstructionTemplateContext = {
  channel: { name: string; language: string; niche: string };
  project: { title: string; deadline?: string };
  block: { name: string; type: string };
  inputs: InstructionTemplateInput[];
  parameters: Record<string, unknown>;
};

const VARIABLE = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)\s*\}\}/g;

function serializeInstructionValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function normalizeVariableKey(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SEMANTIC_INPUT_KEYS: Record<string, string> = {
  theme: "tema_do_video",
  topic: "tema_do_video",
  video_topic: "tema_do_video",
  final_theme: "tema_do_video",
  selected_theme: "tema_do_video",
  selected_topic: "tema_do_video",
  tema: "tema_do_video",
  tema_final: "tema_do_video",
  tema_do_video: "tema_do_video",
  title: "titulo_do_video",
  video_title: "titulo_do_video",
  final_title: "titulo_do_video",
  selected_title: "titulo_do_video",
  titulo: "titulo_do_video",
  titulo_final: "titulo_do_video",
  titulo_do_video: "titulo_do_video",
  thumbnail: "thumbnail_do_video",
  final_thumbnail: "thumbnail_do_video",
  thumbnail_image: "thumbnail_do_video",
  thumbnail_final: "thumbnail_do_video",
  thumbnail_do_video: "thumbnail_do_video",
  script: "roteiro_do_video",
  video_script: "roteiro_do_video",
  final_script: "roteiro_do_video",
  roteiro: "roteiro_do_video",
  roteiro_final: "roteiro_do_video",
  roteiro_do_video: "roteiro_do_video",
  audio: "narracao_do_video",
  narration: "narracao_do_video",
  final_audio: "narracao_do_video",
  final_narration: "narracao_do_video",
  narracao: "narracao_do_video",
  narracao_final: "narracao_do_video",
  narracao_do_video: "narracao_do_video",
  assets: "assets_visuais_do_video",
  visual_assets: "assets_visuais_do_video",
  final_assets: "assets_visuais_do_video",
  assets_visuais: "assets_visuais_do_video",
  assets_visuais_finais: "assets_visuais_do_video",
  assets_visuais_do_video: "assets_visuais_do_video",
  video: "video_editado",
  edited_video: "video_editado",
  final_video: "video_editado",
  video_final: "video_editado",
  video_editado: "video_editado",
  url: "link_da_publicacao",
  publication_url: "link_da_publicacao",
  published_url: "link_da_publicacao",
  url_da_publicacao: "link_da_publicacao",
  link_da_publicacao: "link_da_publicacao",
};

const SEMANTIC_INPUT_LABELS: Record<string, string> = {
  tema_do_video: "Tema do vídeo",
  titulo_do_video: "Título do vídeo",
  thumbnail_do_video: "Thumbnail do vídeo",
  roteiro_do_video: "Roteiro do vídeo",
  narracao_do_video: "Narração do vídeo",
  assets_visuais_do_video: "Assets visuais do vídeo",
  video_editado: "Vídeo editado",
  link_da_publicacao: "Link da publicação",
};

type InstructionInputIdentity = Pick<InstructionTemplateInput, "id" | "label" | "sourceKey"> & {
  key?: string;
};

function semanticInputKey(input: Pick<InstructionInputIdentity, "label" | "sourceKey" | "key">) {
  const candidates = [
    normalizeVariableKey(input.sourceKey ?? input.key),
    normalizeVariableKey(input.label),
  ];
  for (const candidate of candidates) {
    if (candidate && SEMANTIC_INPUT_KEYS[candidate]) return SEMANTIC_INPUT_KEYS[candidate];
  }
  return undefined;
}

export function instructionInputKey(input: InstructionInputIdentity) {
  return (
    semanticInputKey(input) ||
    normalizeVariableKey(input.sourceKey ?? input.key) ||
    normalizeVariableKey(input.label) ||
    normalizeVariableKey(input.id) ||
    "entrada"
  );
}

export function instructionInputLabel(input: InstructionInputIdentity) {
  const semanticLabelKey = SEMANTIC_INPUT_KEYS[normalizeVariableKey(input.label)];
  return (semanticLabelKey && SEMANTIC_INPUT_LABELS[semanticLabelKey]) || input.label;
}

export function instructionVariables(template: string) {
  return [...String(template ?? "").matchAll(VARIABLE)].map((match) => match[1]);
}

export function resolveInstructionTemplate(template: string, context: InstructionTemplateContext) {
  const values = new Map<string, unknown>([
    ["project.title", context.project.title],
    ["project.deadline", context.project.deadline ?? ""],
    ["channel.name", context.channel.name],
    ["channel.language", context.channel.language],
    ["channel.niche", context.channel.niche],
    ["block.name", context.block.name],
    ["block.type", context.block.type],
  ]);

  for (const [key, value] of Object.entries(context.parameters)) {
    values.set(`parameters.${normalizeVariableKey(key)}`, value);
  }
  const inputOwners = new Map<string, string>();
  for (const input of context.inputs) {
    const aliases = new Set([
      instructionInputKey(input),
      normalizeVariableKey(input.sourceKey),
      normalizeVariableKey(input.label),
      normalizeVariableKey(input.portKey),
      normalizeVariableKey(input.id),
    ]);
    for (const alias of aliases) {
      if (alias) {
        const variable = `inputs.${alias}`;
        values.set(variable, input.value);
        inputOwners.set(variable, input.id);
      }
    }
  }

  const unresolved = new Set<string>();
  const referencedInputIds = new Set<string>();
  const instruction = String(template ?? "").replace(VARIABLE, (token, variable: string) => {
    const normalized = variable
      .split(".")
      .map((part) => normalizeVariableKey(part))
      .join(".");
    if (!values.has(normalized)) {
      unresolved.add(variable);
      return token;
    }
    const inputId = inputOwners.get(normalized);
    if (inputId) referencedInputIds.add(inputId);
    return serializeInstructionValue(values.get(normalized));
  });

  return {
    instruction: instruction.trim(),
    unresolved: [...unresolved],
    referencedInputIds: [...referencedInputIds],
  };
}
