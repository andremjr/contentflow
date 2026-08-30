import {
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockInputBinding,
  type ChannelLibraryItem,
  type HumanFieldType,
  type ProcessExecution,
  type ProjectDelivery,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
} from "@/lib/domain";
import { createProcessOutputFields, isEmptyRuntimeValue } from "@/lib/human-workflow";
import { normalizeExecutionDeliveries } from "@/lib/deliveries";
import { resolveChannelHistory } from "@/lib/channel-history";
import { collectionItemValuesForPlugin } from "@/lib/plugin-collection";

type RuntimeCandidate = {
  id: string;
  label: string;
  key: string;
  type: HumanFieldType;
  value: RuntimeValue;
  sourceLabel: string;
  sourceBlockId?: string;
  sourceProcessType?: ProcessExecution["processType"];
  deliveryId?: string;
  deliveryItemIds?: string[];
};

export type ResolvedBlockInput = {
  input: BlockInputBinding;
  resolved: boolean;
  value?: RuntimeValue;
  resolvedSourceKey?: string;
  sourceLabel?: string;
  sourceBlockId?: string;
  sourceProcessType?: ProcessExecution["processType"];
  sourceDeliveryId?: string;
  sourceDeliveryItemIds?: string[];
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
  channelExecutions = projectExecutions,
  channelProjects = [project],
  collections,
  libraryItems,
}: {
  block: ActionBlock;
  execution: ProcessExecution;
  project: Project;
  projectExecutions: ProcessExecution[];
  channelExecutions?: ProcessExecution[];
  channelProjects?: Project[];
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
    if (input.source === "channel_history" && block.type !== "ESCOLHER" && block.type !== "CRIAR") {
      return { input, resolved: false };
    }
    const explicit = resolveExplicitInput(input, project, candidates, usedCandidateIds, {
      execution,
      channelExecutions,
      channelProjects,
    });
    if (explicit) {
      if (explicit.candidateId) usedCandidateIds.add(explicit.candidateId);
      return { input, ...explicit.result };
    }

    const available = candidates.filter(
      (candidate) =>
        !usedCandidateIds.has(candidate.id) &&
        areRuntimeTypesCompatible(candidate.type, input.type),
    );
    const completeSelectedItems = available.filter((candidate) => candidate.key === "selectedItem");
    const selected = [...(completeSelectedItems.length ? completeSelectedItems : available)].sort(
      (left, right) => labelScore(input.label, right.label) - labelScore(input.label, left.label),
    )[0];
    if (!selected) return { input, resolved: false };
    usedCandidateIds.add(selected.id);
    return {
      input,
      resolved: true,
      value: selected.value,
      resolvedSourceKey: selected.key,
      sourceLabel: selected.sourceLabel,
      sourceBlockId: selected.sourceBlockId,
      sourceProcessType: selected.sourceProcessType,
      sourceDeliveryId: selected.deliveryId,
      sourceDeliveryItemIds: selected.deliveryItemIds,
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
  const normalizedCurrentExecution = normalizeExecutionDeliveries(execution);
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
      if (item && collection) {
        const completeItem = collectionItemValuesForPlugin(collection, item);
        candidates.push({
          id: `${completed.blockId}:selected-item`,
          label: `Item escolhido — ${collection.name}`,
          key: "selectedItem",
          type: "textarea",
          value: `ITEM ESCOLHIDO — ${collection.name}:\n${JSON.stringify(completeItem, null, 2)}`,
          sourceLabel: definition.name ?? "Escolher",
          sourceBlockId: completed.blockId,
        });
      }
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
      const delivery = activeDeliveryFor(
        normalizedCurrentExecution.deliveries,
        completed.blockId,
        output.key,
      );
      candidates.push({
        id: `${completed.blockId}:${output.key}`,
        label: output.label,
        key: output.key,
        type: output.type,
        value,
        sourceLabel: definition.name ?? definition.type,
        sourceBlockId: completed.blockId,
        deliveryId: delivery?.id,
        deliveryItemIds: delivery?.items.map((item) => item.id),
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
  for (const rawProcessExecution of completedProcesses) {
    const processExecution = normalizeExecutionDeliveries(rawProcessExecution);
    const processBlocks = new Map(
      processExecution.methodSnapshot.blocks.map((item) => [item.id, item] as const),
    );
    for (const delivery of (processExecution.deliveries ?? []).filter(
      (item) => item.status !== "invalidated",
    )) {
      const sourceBlock = processBlocks.get(delivery.blockId);
      candidates.push({
        id: delivery.id,
        label: delivery.label,
        key: delivery.outputKey,
        type: delivery.type,
        value:
          delivery.cardinality === "many"
            ? (delivery.items.map((item) => item.value) as RuntimeValue)
            : ((delivery.items[0]?.value ?? null) as RuntimeValue),
        sourceLabel: `${PROCESS_META[processExecution.processType].label} / ${sourceBlock?.name ?? sourceBlock?.type ?? "Entrega"}`,
        sourceBlockId: delivery.blockId,
        sourceProcessType: processExecution.processType,
        deliveryId: delivery.id,
        deliveryItemIds: delivery.items.map((item) => item.id),
      });
    }
    for (const output of createProcessOutputFields(processExecution.processType)) {
      const value = processExecution.output?.values[output.key];
      if (value === undefined || isEmptyRuntimeValue(value)) continue;
      const delivery = activeDeliveryFor(
        processExecution.deliveries,
        "__process_output__",
        output.key,
      );
      candidates.push({
        id: `process:${processExecution.processType}:${output.key}`,
        label: output.label,
        key: output.key,
        type: output.type,
        value,
        sourceLabel: `Processo ${PROCESS_META[processExecution.processType].label}`,
        sourceBlockId: "__process_output__",
        sourceProcessType: processExecution.processType,
        deliveryId: delivery?.id,
        deliveryItemIds: delivery?.items.map((item) => item.id),
      });
    }
  }
  return candidates;
}

function resolveExplicitInput(
  input: BlockInputBinding,
  project: Project,
  candidates: RuntimeCandidate[],
  usedCandidateIds: ReadonlySet<string>,
  historyContext: {
    execution: ProcessExecution;
    channelExecutions: ProcessExecution[];
    channelProjects: Project[];
  },
):
  | {
      candidateId?: string;
      result: Omit<ResolvedBlockInput, "input">;
    }
  | undefined {
  if (input.source === "channel_history") {
    const value = resolveChannelHistory({
      input,
      currentExecution: historyContext.execution,
      channelExecutions: historyContext.channelExecutions,
      channelProjects: historyContext.channelProjects,
    });
    return value
      ? {
          result: {
            resolved: true,
            value,
            sourceLabel: "Histórico do canal",
          },
        }
      : { result: { resolved: false } };
  }
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
        (!usedCandidateIds.has(item.id) || (!input.sourceKey && item.key === "selectedItem")) &&
        item.sourceBlockId === input.blockId &&
        (!input.sourceKey || item.key === input.sourceKey) &&
        areRuntimeTypesCompatible(item.type, input.type),
    );
    return candidate
      ? {
          candidateId:
            !input.sourceKey && candidate.key === "selectedItem" ? undefined : candidate.id,
          result: {
            resolved: true,
            value: candidate.value,
            resolvedSourceKey: candidate.key,
            sourceLabel: candidate.sourceLabel,
            sourceBlockId: candidate.sourceBlockId,
            sourceDeliveryId: candidate.deliveryId,
            sourceDeliveryItemIds: candidate.deliveryItemIds,
          },
        }
      : { result: { resolved: false } };
  }
  if (input.source === "previous_process" && input.sourceKey) {
    const candidate = candidates.find(
      (item) =>
        Boolean(item.sourceProcessType) &&
        (!input.sourceProcessType || item.sourceProcessType === input.sourceProcessType) &&
        (!input.blockId || item.sourceBlockId === input.blockId) &&
        item.key === input.sourceKey &&
        areRuntimeTypesCompatible(item.type, input.type),
    );
    return candidate
      ? {
          candidateId: candidate.id,
          result: {
            resolved: true,
            value: candidate.value,
            resolvedSourceKey: candidate.key,
            sourceLabel: candidate.sourceLabel,
            sourceProcessType: candidate.sourceProcessType,
            sourceBlockId: candidate.sourceBlockId,
            sourceDeliveryId: candidate.deliveryId,
            sourceDeliveryItemIds: candidate.deliveryItemIds,
          },
        }
      : { result: { resolved: false } };
  }
  return undefined;
}

function activeDeliveryFor(
  deliveries: ProjectDelivery[] | undefined,
  blockId: string,
  outputKey: string,
) {
  return [...(deliveries ?? [])]
    .reverse()
    .find(
      (delivery) =>
        delivery.blockId === blockId &&
        delivery.outputKey === outputKey &&
        delivery.status !== "invalidated",
    );
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
