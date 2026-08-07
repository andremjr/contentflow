import {
  PROCESS_META,
  type ActionBlock,
  type BlockFieldDefinition,
  type BlockType,
  type HumanFieldType,
  type ProcessId,
  type ProcessMethod,
  type RuntimeValue,
} from "@/lib/domain";

export function getMethodConfigurationIssue(method?: ProcessMethod) {
  if (!method?.blocks.length) return "O processo ainda não possui um método.";
  for (const block of method.blocks) {
    if (block.type === "ESCOLHER" && !block.collectionId) {
      return `Vincule uma coleção da Biblioteca Estratégica ao bloco “${block.name ?? "Escolher"}”.`;
    }
    const keys = (block.outputs ?? []).map((output) => output.key.trim()).filter(Boolean);
    if (keys.length !== (block.outputs ?? []).length) {
      return `Defina uma chave para todas as entregas do bloco “${block.name ?? block.type}”.`;
    }
    if (new Set(keys).size !== keys.length) {
      return `As chaves das entregas do bloco “${block.name ?? block.type}” precisam ser únicas.`;
    }
  }
  return undefined;
}

export const PROCESS_ROUTE_SEGMENT: Record<ProcessId, string> = {
  theme: "theme",
  title: "title",
  thumbnail: "thumbnail",
  script: "script",
  narration: "narration",
  assets: "assets",
  editing: "edit",
  publishing: "publish",
};

const FINAL_FIELD_TYPE: Record<ProcessId, HumanFieldType> = {
  theme: "textarea",
  title: "text",
  thumbnail: "image",
  script: "textarea",
  narration: "audio",
  assets: "files",
  editing: "video",
  publishing: "url",
};

const FINAL_FIELD_KEY: Record<ProcessId, string> = {
  theme: "theme",
  title: "title",
  thumbnail: "thumbnail",
  script: "script",
  narration: "audio",
  assets: "assets",
  editing: "video",
  publishing: "url",
};

const FINAL_FIELD_LABEL: Record<ProcessId, string> = {
  theme: "Tema final",
  title: "Título final",
  thumbnail: "Thumbnail final",
  script: "Roteiro final",
  narration: "Narração final",
  assets: "Assets visuais finais",
  editing: "Vídeo final",
  publishing: "URL da publicação",
};

export function createProcessOutputFields(processType: ProcessId): BlockFieldDefinition[] {
  return [
    {
      id: `process-output-${processType}`,
      label: FINAL_FIELD_LABEL[processType],
      key: FINAL_FIELD_KEY[processType],
      type: FINAL_FIELD_TYPE[processType],
      required: true,
      placeholder:
        processType === "publishing"
          ? "https://youtube.com/watch?v=..."
          : `Informe o resultado final de ${PROCESS_META[processType].label}`,
    },
  ];
}

function field(
  prefix: string,
  label: string,
  key: string,
  type: HumanFieldType,
  placeholder?: string,
): BlockFieldDefinition {
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    label,
    key,
    type,
    required: true,
    placeholder,
  };
}

export function createSuggestedHumanFields(
  processType: ProcessId,
  blockType: BlockType,
): BlockFieldDefinition[] {
  const prefix = `${processType}-${blockType.toLowerCase()}`;
  if (blockType === "BUSCAR") {
    return [
      field(prefix, "Itens encontrados", "items_found", "list", "Adicione um item por linha"),
      {
        ...field(prefix, "Fontes consultadas", "sources", "list", "Cole URLs ou referências"),
        required: false,
      },
    ];
  }
  if (blockType === "ESCOLHER") {
    return [];
  }
  if (blockType === "VALIDAR") {
    return [
      field(prefix, "Decisão", "decision", "approval"),
      {
        ...field(prefix, "Observações", "feedback", "textarea", "Explique sua decisão"),
        required: false,
      },
    ];
  }
  return [
    field(
      prefix,
      `${PROCESS_META[processType].label} produzido`,
      FINAL_FIELD_KEY[processType],
      FINAL_FIELD_TYPE[processType],
      "Entregue o resultado deste bloco",
    ),
  ];
}

export function normalizeActionBlock(block: ActionBlock, processType: ProcessId): ActionBlock {
  const legacyOutputs = (block.parameters ?? []).map<BlockFieldDefinition>((parameter) => ({
    id: parameter.id,
    label: parameter.label,
    key: parameter.key,
    type: parameter.type,
    required: false,
    placeholder: parameter.placeholder,
    options: parameter.options,
  }));
  return {
    ...block,
    name: block.name || `${block.type.charAt(0)}${block.type.slice(1).toLowerCase()}`,
    instructions: block.instructions ?? "",
    inputs:
      block.type === "ESCOLHER"
        ? []
        : (block.inputs ?? [])
            .filter((input) => input.source !== "channel_library")
            .map((input) => ({ ...input, type: input.type ?? "text" })),
    outputs:
      block.type === "ESCOLHER"
        ? []
        : block.outputs?.length || legacyOutputs.length
          ? (block.outputs ?? legacyOutputs)
          : createSuggestedHumanFields(processType, block.type),
    parameters: block.parameters ?? [],
  };
}

export function isEmptyRuntimeValue(value: RuntimeValue | undefined) {
  if (value == null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

export function formatRuntimeValue(value: RuntimeValue | undefined) {
  if (value == null || value === "") return "Não informado";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : item.name))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") return value.name;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}
