import {
  PROCESS_META,
  type ActionBlock,
  type BlockFieldDefinition,
  type BlockType,
  type ProcessId,
  type ProcessMethod,
  type RuntimeValue,
  type ValueShape,
  type ValidationMode,
} from "@/lib/domain";
import { normalizeFieldPresentation } from "@/lib/presentation";
import { contentShape, controlShape } from "@/lib/data-shape";

export function getMethodConfigurationIssue(method?: ProcessMethod) {
  if (!method?.blocks.length) return "O processo ainda não possui um método.";
  for (const [blockIndex, block] of method.blocks.entries()) {
    if (block.plugin?.connectionRequired && !block.plugin.connectionId) {
      return `Associe uma conta ou conexão local ao bloco “${block.name ?? block.type}”.`;
    }
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
    for (const input of block.inputs ?? []) {
      const source = input.binding;
      const sourceKind = source?.kind;
      if (!source) {
        return `Selecione a origem explícita da entrada “${input.label}”.`;
      }
      if (sourceKind === "runtime" && (!block.plugin || block.operator === "Humano")) {
        return `A entrada “${input.label}” fornecida na execução exige um plugin de IA ou Código.`;
      }
      if (sourceKind === "channel_history" && block.type !== "ESCOLHER" && block.type !== "CRIAR") {
        return `O Histórico do Canal só pode orientar um bloco “Escolher” ou “Criar”. Remova-o do bloco “${block.name ?? block.type}”.`;
      }
      if (sourceKind === "channel_history" && source?.kind !== "channel_history") {
        return `Selecione a origem do histórico do canal na entrada “${input.label}”.`;
      }
      if (sourceKind === "channel_history" && input.shape.kind !== "record") {
        return `A entrada de histórico “${input.label}” precisa usar Lista de registros.`;
      }
    }
    for (const structuredField of [...(block.inputs ?? []), ...(block.outputs ?? [])].filter(
      (field) => field.shape.kind === "record",
    )) {
      const recordFields = structuredField.shape.kind === "record" ? structuredField.shape.fields : [];
      const recordKeys = recordFields
        .map((field) => field.key.trim())
        .filter(Boolean);
      if (!recordKeys.length || recordKeys.length !== recordFields.length) {
        return `Defina a chave de todos os campos da lista de registros “${structuredField.label}”.`;
      }
      if (new Set(recordKeys).size !== recordKeys.length) {
        return `As chaves da lista de registros “${structuredField.label}” precisam ser únicas.`;
      }
    }
    if (block.type === "VALIDAR") {
      const targetBlockId = block.validation?.targetBlockId?.trim();
      if (!targetBlockId) {
        return `Selecione um bloco anterior para a validação “${block.name ?? "Validar"}”.`;
      }
      const targetIndex = method.blocks.findIndex((candidate) => candidate.id === targetBlockId);
      if (targetIndex < 0 || targetIndex >= blockIndex) {
        return `Selecione um bloco anterior para a validação “${block.name ?? "Validar"}”.`;
      }
      if (method.blocks[targetIndex].type === "VALIDAR") {
        return `A validação “${block.name ?? "Validar"}” deve apontar para um bloco Buscar, Escolher ou Criar.`;
      }
      const targetOutputKey = block.validation?.targetOutputKey?.trim();
      const requiresTargetOutput = block.validation?.mode !== "approval";
      if (requiresTargetOutput && !targetOutputKey) {
        return `Selecione qual saída será apresentada pela validação “${block.name ?? "Validar"}”.`;
      }
      if (
        targetOutputKey &&
        !method.blocks[targetIndex].outputs?.some((output) => output.key === targetOutputKey)
      ) {
        return `Selecione qual saída será apresentada pela validação “${block.name ?? "Validar"}”.`;
      }
      if (!targetOutputKey && block.validation?.targetPortKey) {
        return `Selecione qual saída será enviada ao plugin na validação “${block.name ?? "Validar"}”.`;
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

const FINAL_FIELD_SHAPE: Record<Exclude<ProcessId, "assets">, ValueShape> = {
  theme: contentShape("text"),
  title: contentShape("text"),
  thumbnail: contentShape("image"),
  script: contentShape("text"),
  narration: contentShape("audio"),
  editing: contentShape("video"),
  publishing: controlShape("url"),
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
  if (processType === "assets") {
    return [
      {
        id: "process-output-assets-images",
        label: "Imagens finais",
        key: "images",
        shape: contentShape("image", "many"),
        required: false,
        placeholder: "Adicione as imagens finais",
      },
      {
        id: "process-output-assets-videos",
        label: "Vídeos finais",
        key: "videos",
        shape: contentShape("video", "many"),
        required: false,
        placeholder: "Adicione os vídeos finais",
      },
    ];
  }
  return [
    {
      id: `process-output-${processType}`,
      label: FINAL_FIELD_LABEL[processType],
      key: FINAL_FIELD_KEY[processType],
      shape: FINAL_FIELD_SHAPE[processType],
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
  shape: ValueShape,
  placeholder?: string,
): BlockFieldDefinition {
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    label,
    key,
    shape,
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
      field(
        prefix,
        "Itens encontrados",
        "items_found",
        contentShape("text", "many"),
        "Adicione um item por linha",
      ),
      {
        ...field(
          prefix,
          "Fontes consultadas",
          "sources",
          contentShape("text", "many"),
          "Cole URLs ou referências",
        ),
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
      processType === "assets" ? contentShape("image", "many") : FINAL_FIELD_SHAPE[processType],
      "Entregue o resultado deste bloco",
    ),
  ];
}

export function createValidationFields(
  mode: ValidationMode,
  targetBlockId?: string,
  targetOutputKey?: string,
  targetOutputShape?: ValueShape,
): BlockFieldDefinition[] {
  const prefix = `validation-${mode}`;
  const feedback = {
    ...field(prefix, "Observações", "feedback", contentShape("text"), "Explique sua decisão"),
    required: false,
  };
  if (mode === "approval") {
    return [field(prefix, "Decisão", "decision", controlShape("approval")), feedback];
  }
  const selectedShape: ValueShape = targetOutputShape
    ? { ...structuredClone(targetOutputShape), cardinality: mode === "select_many" ? "many" : "one" }
    : contentShape("text", mode === "select_many" ? "many" : "one");
  return [
    {
      ...field(
        prefix,
        mode === "select_many" ? "Opções escolhidas" : "Opção escolhida",
        mode === "select_many" ? "selected_values" : "selected_value",
        selectedShape,
      ),
      optionsSourceBlockId: targetBlockId,
      optionsSourceKey: targetOutputKey,
    },
    feedback,
  ];
}

export function normalizeActionBlock(block: ActionBlock, processType: ProcessId): ActionBlock {
  return {
    ...block,
    name: block.name || `${block.type.charAt(0)}${block.type.slice(1).toLowerCase()}`,
    instructions: block.instructions ?? "",
    inputs: (block.inputs ?? []).map((input) => {
      const shape = input.shape;
      return {
        ...input,
        shape,
        presentation: normalizeFieldPresentation(shape, input.presentation),
      };
    }),
    outputs:
      block.type === "ESCOLHER"
        ? []
        : block.outputs?.length
          ? block.outputs.map((output) => ({
              ...output,
              presentation: normalizeFieldPresentation(output.shape, output.presentation),
            }))
          : createSuggestedHumanFields(processType, block.type).map((output) => ({
              ...output,
              presentation: normalizeFieldPresentation(output.shape, output.presentation),
            })),
    validation:
      block.type === "VALIDAR"
        ? {
            mode: block.validation?.mode ?? "approval",
            onReject: block.validation?.onReject ?? "retry_target",
            maxAttempts: Math.max(1, block.validation?.maxAttempts ?? 3),
            retryMode: block.validation?.retryMode ?? "full",
            targetBlockId: block.validation?.targetBlockId ?? "",
            targetOutputKey: block.validation?.targetOutputKey,
            targetPortKey: block.validation?.targetPortKey,
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
      const currentValidation = block.validation;
      const mode = currentValidation?.mode ?? "approval";
      const target = normalized.find(
        (candidate) => candidate.id === currentValidation?.targetBlockId,
      );
      const targetOutput = target?.outputs?.find(
        (output) => output.key === currentValidation?.targetOutputKey,
      );
      block.validation = {
        mode,
        targetBlockId: currentValidation?.targetBlockId ?? "",
        targetOutputKey: currentValidation?.targetOutputKey,
        targetPortKey: currentValidation?.targetPortKey,
        onReject: currentValidation?.onReject ?? "retry_target",
        maxAttempts: Math.max(1, currentValidation?.maxAttempts ?? 3),
        retryMode: currentValidation?.retryMode ?? "full",
      };
      const hasExpectedOutput = (block.outputs ?? []).some((output) =>
        mode === "approval"
          ? output.key === "decision"
          : ["selected_value", "selected_values"].includes(output.key),
      );
      if (!hasExpectedOutput) {
        block.outputs = createValidationFields(
          mode,
          block.validation.targetBlockId,
          block.validation.targetOutputKey,
          targetOutput?.shape,
        );
      } else if (mode !== "approval") {
        block.outputs = (block.outputs ?? []).map((output) =>
          ["selected_value", "selected_values"].includes(output.key)
            ? {
                ...output,
                optionsSourceBlockId: block.validation!.targetBlockId,
                optionsSourceKey: block.validation!.targetOutputKey,
              }
            : output,
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
