import {
  PROCESS_META,
  type ActionBlock,
  type BlockFieldDefinition,
  type BlockType,
  type HumanFieldType,
  type ProcessId,
  type RuntimeValue,
} from "@/lib/domain";

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
  assets: "file",
  editing: "video",
  publishing: "url",
};

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
    return [field(prefix, "Escolha", "selected_option", "select", "Selecione uma opção")];
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
      `final_${processType}`,
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
    inputs: block.inputs ?? [],
    outputs:
      block.outputs?.length || legacyOutputs.length
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
