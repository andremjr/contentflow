import {
  PROCESS_META,
  type ActionBlock,
  type BlockFieldDefinition,
  type BlockType,
  type HumanFieldType,
  type ProcessId,
  type ProcessMethod,
  type RuntimeValue,
  type ValidationMode,
} from "@/lib/domain";
import { normalizeFieldPresentation } from "@/lib/presentation";

export function getMethodConfigurationIssue(method?: ProcessMethod) {
  if (!method?.blocks.length) return "O processo ainda não possui um método.";
  for (const [blockIndex, block] of method.blocks.entries()) {
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
    for (const structuredField of [...(block.inputs ?? []), ...(block.outputs ?? [])].filter(
      (field) => field.type === "records",
    )) {
      const recordKeys = (structuredField.recordFields ?? [])
        .map((field) => field.key.trim())
        .filter(Boolean);
      if (!recordKeys.length || recordKeys.length !== structuredField.recordFields?.length) {
        return `Defina a chave de todos os campos da lista de registros “${structuredField.label}”.`;
      }
      if (new Set(recordKeys).size !== recordKeys.length) {
        return `As chaves da lista de registros “${structuredField.label}” precisam ser únicas.`;
      }
    }
    if (block.type === "VALIDAR") {
      const targetIndex = block.validation?.targetBlockId
        ? method.blocks.findIndex((candidate) => candidate.id === block.validation?.targetBlockId)
        : (method.blocks
            .slice(0, blockIndex)
            .map((candidate, index) => ({ candidate, index }))
            .reverse()
            .find(({ candidate }) => candidate.type !== "VALIDAR")?.index ?? -1);
      if (targetIndex < 0 || targetIndex >= blockIndex) {
        return `Selecione um bloco anterior para a validação “${block.name ?? "Validar"}”.`;
      }
      if (method.blocks[targetIndex].type === "VALIDAR") {
        return `A validação “${block.name ?? "Validar"}” deve apontar para um bloco Buscar, Escolher ou Criar.`;
      }
      if (
        block.validation?.mode !== "approval" &&
        !method.blocks[targetIndex].outputs?.some(
          (output) => output.key === block.validation?.targetOutputKey,
        )
      ) {
        return `Selecione qual saída será apresentada pela validação “${block.name ?? "Validar"}”.`;
      }
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
    return createValidationFields("approval");
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

export function createValidationFields(
  mode: ValidationMode,
  targetBlockId?: string,
  targetOutputKey?: string,
  targetOutputType?: HumanFieldType,
): BlockFieldDefinition[] {
  const prefix = `validation-${mode}`;
  const feedback = {
    ...field(prefix, "Observações", "feedback", "textarea", "Explique sua decisão"),
    required: false,
  };
  if (mode === "approval") {
    return [field(prefix, "Decisão", "decision", "approval"), feedback];
  }
  const selectedType: HumanFieldType =
    mode === "select_many"
      ? targetOutputType === "files"
        ? "files"
        : "list"
      : targetOutputType === "files"
        ? "file"
        : targetOutputType === "list" || targetOutputType === "multiselect"
          ? "text"
          : (targetOutputType ?? "text");
  return [
    {
      ...field(
        prefix,
        mode === "select_many" ? "Opções escolhidas" : "Opção escolhida",
        mode === "select_many" ? "selected_values" : "selected_value",
        selectedType,
      ),
      optionsSourceBlockId: targetBlockId,
      optionsSourceKey: targetOutputKey,
    },
    feedback,
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
            .map((input) => {
              const type = input.type ?? "text";
              return {
                ...input,
                type,
                presentation: normalizeFieldPresentation(type, input.presentation),
              };
            }),
    outputs:
      block.type === "ESCOLHER"
        ? []
        : block.outputs?.length || legacyOutputs.length
          ? (block.outputs ?? legacyOutputs).map((output) => ({
              ...output,
              presentation: normalizeFieldPresentation(output.type, output.presentation),
            }))
          : createSuggestedHumanFields(processType, block.type).map((output) => ({
              ...output,
              presentation: normalizeFieldPresentation(output.type, output.presentation),
            })),
    validation:
      block.type === "VALIDAR"
        ? {
            mode: block.validation?.mode ?? "approval",
            onReject: block.validation?.onReject ?? "retry_target",
            maxAttempts: Math.max(1, block.validation?.maxAttempts ?? 3),
            targetBlockId: block.validation?.targetBlockId,
            targetOutputKey: block.validation?.targetOutputKey,
          }
        : undefined,
    parameters: block.parameters ?? [],
  };
}

export function normalizeMethodBlocks(blocks: ActionBlock[], processType: ProcessId) {
  const normalized: ActionBlock[] = [];
  for (const [order, sourceBlock] of blocks.entries()) {
    const block = { ...normalizeActionBlock(sourceBlock, processType), order };
    if (block.type === "VALIDAR") {
      const target =
        normalized.find((candidate) => candidate.id === block.validation?.targetBlockId) ??
        [...normalized].reverse().find((candidate) => candidate.type !== "VALIDAR");
      const mode = block.validation?.mode ?? "approval";
      const targetOutput =
        target?.outputs?.find((output) => output.key === block.validation?.targetOutputKey) ??
        target?.outputs?.find((output) => ["list", "files", "multiselect"].includes(output.type)) ??
        target?.outputs?.[0];
      block.validation = {
        mode,
        targetBlockId: target?.id,
        targetOutputKey: mode === "approval" ? undefined : targetOutput?.key,
        onReject: block.validation?.onReject ?? "retry_target",
        maxAttempts: Math.max(1, block.validation?.maxAttempts ?? 3),
      };
      const hasExpectedOutput = (block.outputs ?? []).some((output) =>
        mode === "approval"
          ? output.key === "decision"
          : ["selected_value", "selected_values"].includes(output.key),
      );
      if (!hasExpectedOutput) {
        block.outputs = createValidationFields(
          mode,
          target?.id,
          block.validation.targetOutputKey,
          targetOutput?.type,
        );
      }
    }
    normalized.push(block);
  }
  return normalized;
}

export function isEmptyRuntimeValue(value: RuntimeValue | undefined) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (!Array.isArray(value)) return false;
  return (
    value.length === 0 ||
    value.every((item) => item == null || (typeof item === "string" && item.trim().length === 0))
  );
}
