import type {
  ActionBlock,
  DeliveryItem,
  HumanFieldType,
  ProcessExecution,
  ProjectDelivery,
  RuntimeValue,
  StoredFile,
  StructuredRecord,
} from "@/lib/domain";
import { createProcessOutputFields } from "@/lib/human-workflow";

const MANY_TYPES = new Set<HumanFieldType>(["list", "multiselect", "records", "files"]);

export function deliveryIdFor(
  execution: Pick<ProcessExecution, "id">,
  blockId: string,
  outputKey: string,
  attempt: number,
) {
  return `delivery:${execution.id}:${blockId}:${outputKey}:attempt:${attempt}`;
}

export function deliveryItemIdFor(deliveryId: string, identity: string) {
  return `${deliveryId}:item:${encodeURIComponent(identity)}`;
}

export function materializeBlockDeliveries({
  execution,
  block,
  values,
  status,
  now = new Date().toISOString(),
}: {
  execution: ProcessExecution;
  block: ActionBlock;
  values: Record<string, RuntimeValue>;
  status: ProjectDelivery["status"];
  now?: string;
}): ProjectDelivery[] {
  const attempt = execution.blocks.find((item) => item.blockId === block.id)?.attempt ?? 1;
  return (block.outputs ?? []).flatMap((output) => {
    const value = values[output.key];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      return [];
    }
    const id = deliveryIdFor(execution, block.id, output.key, attempt);
    const previous = execution.deliveries?.find((item) => item.id === id);
    const rawItems = MANY_TYPES.has(output.type) && Array.isArray(value) ? value : [value];
    const usedIdentities = new Set<string>();
    const items = rawItems.map((item, order) => {
      const externalKey = externalItemKey(item);
      const baseIdentity = externalKey ?? String(order + 1);
      let identity = baseIdentity;
      let duplicate = 2;
      while (usedIdentities.has(identity)) identity = `${baseIdentity}-${duplicate++}`;
      usedIdentities.add(identity);
      const itemId = deliveryItemIdFor(id, identity);
      const previousItem = previous?.items.find((candidate) => candidate.id === itemId);
      return {
        id: itemId,
        order,
        value: structuredClone(item) as RuntimeValue | StructuredRecord,
        externalKey,
        references: previousItem?.references,
      } satisfies DeliveryItem;
    });
    attachValidationReferences(execution, block, items);
    return [
      {
        id,
        projectId: execution.projectId,
        channelId: execution.channelId,
        processType: execution.processType,
        executionId: execution.id,
        blockId: block.id,
        outputKey: output.key,
        label: output.label,
        type: output.type,
        cardinality: MANY_TYPES.has(output.type) ? "many" : "one",
        attempt,
        status,
        items,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      } satisfies ProjectDelivery,
    ];
  });
}

export function recordBlockDeliveries(
  execution: ProcessExecution,
  block: ActionBlock,
  values: Record<string, RuntimeValue>,
  status: "partial" | "completed",
  now = new Date().toISOString(),
) {
  const current = execution.deliveries ?? [];
  const incoming = materializeBlockDeliveries({ execution, block, values, status, now });
  const incomingIds = new Set(incoming.map((item) => item.id));
  execution.deliveries = [
    ...current.map((delivery) =>
      delivery.blockId === block.id &&
      delivery.status !== "invalidated" &&
      !incomingIds.has(delivery.id)
        ? { ...delivery, status: "invalidated" as const, updatedAt: now }
        : delivery,
    ),
    ...incoming.filter((delivery) => !current.some((item) => item.id === delivery.id)),
  ].map((delivery) => incoming.find((item) => item.id === delivery.id) ?? delivery);
  return incoming;
}

export function recordProcessOutputDelivery(
  execution: ProcessExecution,
  values: Record<string, RuntimeValue>,
  now = new Date().toISOString(),
) {
  const syntheticBlock: ActionBlock = {
    id: "__process_output__",
    type: "CRIAR",
    operator: "Humano",
    name: "Resultado oficial",
    inputs: [],
    outputs: createProcessOutputFields(execution.processType),
    parameters: [],
    order: execution.methodSnapshot.blocks.length,
  };
  return recordBlockDeliveries(execution, syntheticBlock, values, "completed", now);
}

export function invalidateBlockDeliveries(
  execution: ProcessExecution,
  blockIds: string[],
  now = new Date().toISOString(),
) {
  const ids = new Set(blockIds);
  execution.deliveries = (execution.deliveries ?? []).map((delivery) =>
    ids.has(delivery.blockId) && delivery.status !== "invalidated"
      ? { ...delivery, status: "invalidated", updatedAt: now }
      : delivery,
  );
}

export function normalizeExecutionDeliveries(execution: ProcessExecution): ProcessExecution {
  const normalized = { ...execution, deliveries: [...(execution.deliveries ?? [])] };
  for (const blockExecution of normalized.blocks) {
    if (
      blockExecution.status !== "completed" &&
      !(
        blockExecution.status === "in_progress" &&
        Object.keys(blockExecution.values ?? {}).length > 0
      )
    ) {
      continue;
    }
    const block = normalized.methodSnapshot.blocks.find(
      (item) => item.id === blockExecution.blockId,
    );
    if (!block) continue;
    recordBlockDeliveries(
      normalized,
      block,
      blockExecution.values,
      blockExecution.status === "completed" ? "completed" : "partial",
      blockExecution.completedAt ?? blockExecution.startedAt ?? normalized.updatedAt,
    );
  }
  if (normalized.outputStatus === "completed" && normalized.output) {
    recordProcessOutputDelivery(
      normalized,
      normalized.output.values,
      normalized.output.createdAt ?? normalized.updatedAt,
    );
  }
  return normalized;
}

export function activeProjectDeliveries(executions: ProcessExecution[]) {
  return executions.flatMap((execution) =>
    normalizeExecutionDeliveries(execution).deliveries!.filter(
      (delivery) => delivery.status !== "invalidated",
    ),
  );
}

export function deliveryRuntimeValue(delivery: ProjectDelivery): RuntimeValue {
  if (delivery.cardinality === "many") {
    return delivery.items.map((item) => structuredClone(item.value)) as RuntimeValue;
  }
  return structuredClone(delivery.items[0]?.value ?? null) as RuntimeValue;
}

function externalItemKey(value: unknown): string | undefined {
  if (isStoredFile(value)) return value.id;
  if (isStructuredRecord(value)) {
    for (const key of ["id", "key", "externalId", "external_id"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return undefined;
}

function attachValidationReferences(
  execution: ProcessExecution,
  block: ActionBlock,
  items: DeliveryItem[],
) {
  if (block.type !== "VALIDAR" || !block.validation?.targetBlockId) return;
  const targets = (execution.deliveries ?? []).filter(
    (delivery) =>
      delivery.blockId === block.validation?.targetBlockId && delivery.status !== "invalidated",
  );
  for (const item of items) {
    const target = targets
      .flatMap((delivery) => delivery.items)
      .find((candidate) => deepEqual(candidate.value, item.value));
    if (target) item.references = [{ itemId: target.id, role: "selected_from" }];
  }
}

function isStoredFile(value: unknown): value is StoredFile {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as StoredFile).id === "string" &&
    typeof (value as StoredFile).url === "string",
  );
}

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && !isStoredFile(value),
  );
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
