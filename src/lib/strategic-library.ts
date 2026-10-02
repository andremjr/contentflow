import type { ChannelLibraryItem, ProcessExecution, StrategicCollection } from "./domain";
import { validateRuntimeValueAgainstShape } from "./runtime-value-validation";

/** The execution snapshot owns reservations, including failed/cancelled resumable runs. */
export function libraryReservation(itemId: string, executions: ProcessExecution[]) {
  for (const execution of executions) {
    if (
      execution.status === "completed" &&
      execution.outputStatus === "completed" &&
      execution.output
    )
      continue;
    for (const block of execution.blocks) {
      if (
        block.status === "completed" &&
        block.collectionSelection?.usage === "consumable" &&
        block.collectionSelection.item.id === itemId &&
        block.values.selectedItemId === itemId
      ) {
        return { executionId: execution.id, blockId: block.blockId };
      }
    }
  }
  return undefined;
}

export function captureCollectionSelection(
  execution: ProcessExecution,
  blockId: string,
  item: ChannelLibraryItem,
  collection: StrategicCollection,
  executions: ProcessExecution[],
) {
  const owner = libraryReservation(item.id, executions);
  if (owner && (owner.executionId !== execution.id || owner.blockId !== blockId)) {
    throw new Error("Este item está reservado por outra execução.");
  }
  const block = execution.blocks.find((candidate) => candidate.blockId === blockId);
  if (
    !block ||
    item.channelId !== execution.channelId ||
    collection.channelId !== execution.channelId ||
    item.collectionId !== collection.id
  )
    throw new Error("Item de biblioteca inválido.");
  const snapshot = structuredClone(item);
  delete snapshot.reservation;
  block.collectionSelection = {
    item: snapshot,
    collection: structuredClone(collection),
    usage: collection.usage ?? "fixed",
  };
}

export function completedConsumableItemIds(execution: ProcessExecution) {
  if (
    execution.status !== "completed" ||
    execution.outputStatus !== "completed" ||
    !execution.output
  )
    return [];
  return execution.blocks.flatMap((block) =>
    block.status === "completed" &&
    block.collectionSelection?.usage === "consumable" &&
    block.values.selectedItemId === block.collectionSelection.item.id
      ? [block.collectionSelection.item.id]
      : [],
  );
}

export function libraryValuesIssues(
  collection: StrategicCollection,
  values: ChannelLibraryItem["values"],
) {
  const issues: string[] = [];
  for (const key of Object.keys(values)) {
    if (!collection.fields.some((field) => field.id === key))
      issues.push("Campo desconhecido na coleção.");
  }
  for (const field of collection.fields) {
    const value = values[field.id];
    const empty =
      value === undefined || value === null || (typeof value === "string" && !value.trim());
    if (empty) {
      if (field.required) issues.push(field.label);
    } else {
      if (field.shape.kind === "control" && field.shape.control === "url") {
        try {
          if (!["http:", "https:"].includes(new URL(String(value)).protocol))
            issues.push(field.label);
        } catch {
          issues.push(field.label);
        }
      }
      if (validateRuntimeValueAgainstShape(field.shape, value, field.id).length)
        issues.push(field.label);
    }
  }
  return issues;
}
