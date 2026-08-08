import {
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockInputBinding,
  type ChannelLibraryItem,
  type HumanFieldType,
  type ProcessExecution,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
} from "@/lib/domain";
import { createProcessOutputFields, isEmptyRuntimeValue } from "@/lib/human-workflow";

type RuntimeCandidate = {
  id: string;
  label: string;
  key: string;
  type: HumanFieldType;
  value: RuntimeValue;
  sourceLabel: string;
  sourceBlockId?: string;
  sourceProcessType?: ProcessExecution["processType"];
};

export type ResolvedBlockInput = {
  input: BlockInputBinding;
  resolved: boolean;
  value?: RuntimeValue;
  sourceLabel?: string;
  sourceBlockId?: string;
  sourceProcessType?: ProcessExecution["processType"];
};

function areRuntimeTypesCompatible(output: HumanFieldType, input: HumanFieldType) {
  if (output === input) return true;
  if (["text", "textarea"].includes(output) && ["text", "textarea"].includes(input)) return true;
  if (input === "file" && ["image", "audio", "video"].includes(output)) return true;
  return false;
}

export function resolveBlockInputs({
  block,
  execution,
  project,
  projectExecutions,
  collections,
  libraryItems,
}: {
  block: ActionBlock;
  execution: ProcessExecution;
  project: Project;
  projectExecutions: ProcessExecution[];
  collections: StrategicCollection[];
  libraryItems: ChannelLibraryItem[];
}): ResolvedBlockInput[] {
  const candidates = collectCandidates({
    block,
    execution,
    projectExecutions,
    collections,
    libraryItems,
  });
  const usedCandidateIds = new Set<string>();

  return (block.inputs ?? []).map((input) => {
    const explicit = resolveExplicitInput(input, project, candidates);
    if (explicit) {
      if (explicit.candidateId) usedCandidateIds.add(explicit.candidateId);
      return { input, ...explicit.result };
    }

    const available = candidates.filter(
      (candidate) =>
        !usedCandidateIds.has(candidate.id) &&
        areRuntimeTypesCompatible(candidate.type, input.type),
    );
    const selected = [...available].sort(
      (left, right) => labelScore(input.label, right.label) - labelScore(input.label, left.label),
    )[0];
    if (!selected) return { input, resolved: false };
    usedCandidateIds.add(selected.id);
    return {
      input,
      resolved: true,
      value: selected.value,
      sourceLabel: selected.sourceLabel,
      sourceBlockId: selected.sourceBlockId,
      sourceProcessType: selected.sourceProcessType,
    };
  });
}

function collectCandidates({
  block,
  execution,
  projectExecutions,
  collections,
  libraryItems,
}: {
  block: ActionBlock;
  execution: ProcessExecution;
  projectExecutions: ProcessExecution[];
  collections: StrategicCollection[];
  libraryItems: ChannelLibraryItem[];
}) {
  const candidates: RuntimeCandidate[] = [];
  const blockIndex = execution.methodSnapshot.blocks.findIndex((item) => item.id === block.id);
  const completedBlocks = execution.blocks
    .slice(0, blockIndex)
    .filter((item) => item.status === "completed")
    .reverse();

  for (const completed of completedBlocks) {
    const definition = execution.methodSnapshot.blocks.find(
      (item) => item.id === completed.blockId,
    );
    if (!definition) continue;
    if (definition.type === "ESCOLHER") {
      const selectedItemId = completed.values.selectedItemId;
      const item =
        typeof selectedItemId === "string"
          ? libraryItems.find((candidate) => candidate.id === selectedItemId)
          : undefined;
      const collection = collections.find((candidate) => candidate.id === item?.collectionId);
      for (const field of collection?.fields ?? []) {
        const value = item?.values[field.id];
        if (value === undefined || isEmptyRuntimeValue(value)) continue;
        candidates.push({
          id: `${completed.blockId}:${field.id}`,
          label: field.label,
          key: field.id,
          type: field.type,
          value,
          sourceLabel: definition.name ?? "Escolher",
          sourceBlockId: completed.blockId,
        });
      }
      continue;
    }

    for (const output of definition.outputs ?? []) {
      const value = completed.values[output.key];
      if (isEmptyRuntimeValue(value)) continue;
      candidates.push({
        id: `${completed.blockId}:${output.key}`,
        label: output.label,
        key: output.key,
        type: output.type,
        value,
        sourceLabel: definition.name ?? definition.type,
        sourceBlockId: completed.blockId,
      });
    }
  }

  const currentProcessIndex = PROCESS_ORDER.indexOf(execution.processType);
  const completedProcesses = projectExecutions
    .filter(
      (item) =>
        item.outputStatus === "completed" &&
        PROCESS_ORDER.indexOf(item.processType) < currentProcessIndex,
    )
    .sort(
      (left, right) =>
        PROCESS_ORDER.indexOf(right.processType) - PROCESS_ORDER.indexOf(left.processType),
    );
  for (const processExecution of completedProcesses) {
    for (const output of createProcessOutputFields(processExecution.processType)) {
      const value = processExecution.output?.values[output.key];
      if (value === undefined || isEmptyRuntimeValue(value)) continue;
      candidates.push({
        id: `process:${processExecution.processType}:${output.key}`,
        label: output.label,
        key: output.key,
        type: output.type,
        value,
        sourceLabel: `Processo ${PROCESS_META[processExecution.processType].label}`,
        sourceProcessType: processExecution.processType,
      });
    }
  }
  return candidates;
}

function resolveExplicitInput(
  input: BlockInputBinding,
  project: Project,
  candidates: RuntimeCandidate[],
):
  | {
      candidateId?: string;
      result: Omit<ResolvedBlockInput, "input">;
    }
  | undefined {
  if (input.source === "static") {
    return input.staticValue
      ? { result: { resolved: true, value: input.staticValue, sourceLabel: "Valor fixo" } }
      : { result: { resolved: false } };
  }
  if (input.source === "project") {
    const value = input.sourceKey === "deadline" ? project.deadline : project.title;
    return { result: { resolved: true, value, sourceLabel: "Projeto" } };
  }
  if (input.source === "previous_block" && input.blockId) {
    const candidate = candidates.find(
      (item) =>
        item.sourceBlockId === input.blockId &&
        (!input.sourceKey || item.key === input.sourceKey) &&
        areRuntimeTypesCompatible(item.type, input.type),
    );
    return candidate
      ? {
          candidateId: candidate.id,
          result: {
            resolved: true,
            value: candidate.value,
            sourceLabel: candidate.sourceLabel,
            sourceBlockId: candidate.sourceBlockId,
          },
        }
      : { result: { resolved: false } };
  }
  if (input.source === "previous_process" && input.sourceKey) {
    const candidate = candidates.find(
      (item) =>
        Boolean(item.sourceProcessType) &&
        item.key === input.sourceKey &&
        areRuntimeTypesCompatible(item.type, input.type),
    );
    return candidate
      ? {
          candidateId: candidate.id,
          result: {
            resolved: true,
            value: candidate.value,
            sourceLabel: candidate.sourceLabel,
            sourceProcessType: candidate.sourceProcessType,
          },
        }
      : { result: { resolved: false } };
  }
  return undefined;
}

function labelScore(inputLabel: string, outputLabel: string) {
  const inputTokens = normalizeLabel(inputLabel);
  const outputTokens = normalizeLabel(outputLabel);
  return inputTokens.filter((token) => outputTokens.includes(token)).length;
}

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}
