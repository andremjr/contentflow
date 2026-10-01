import type {
  ActionBlock,
  BlockFieldDefinition,
  DeliveryItem,
  ProcessExecution,
  ProjectDelivery,
  RuntimeValue,
  StoredFile,
  StructuredRecord,
  ValueShape,
} from "@/lib/domain";
import { createProcessOutputFields } from "@/lib/human-workflow";
import { areValueShapesCompatible, controlShape } from "@/lib/data-shape";
import { runtimeValueMatchesShape } from "@/lib/runtime-value-validation";

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
  const outputs: BlockFieldDefinition[] =
    block.type === "ESCOLHER"
      ? [
          {
            id: `${block.id}-selected-item`,
            label: "Item estratégico escolhido",
            key: "selectedItemId",
            shape: controlShape("selection"),
            required: true,
          },
        ]
      : (block.outputs ?? []);
  return outputs.flatMap((output) => {
    const value = values[output.key];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      return [];
    }
    const id = deliveryIdFor(execution, block.id, output.key, attempt);
    const previous = execution.deliveries?.find((item) => item.id === id);
    const shape = fieldValueShape(output);
    if (!runtimeValueMatchesShape(shape, value)) {
      throw new Error(
        `Delivery ${block.id}.${output.key} recebeu valor incompatível com o ValueShape.`,
      );
    }
    const rawItems = shape.cardinality === "many" && Array.isArray(value) ? value : [value];
    const blockExecution = execution.blocks.find((item) => item.blockId === block.id);
    const matchingOutputExecutionItems = (blockExecution?.items ?? []).filter(
      (item) => !item.pluginCorrelation || item.pluginCorrelation.outputKey === output.key,
    );
    // Core-owned work units are the canonical lineage for outputs materialized from
    // block inputs. Incremental plugin-derived units may coexist in older/partial
    // snapshots, but must not change the positional alignment or erase derived_from.
    const coreOwnedOutputExecutionItems = matchingOutputExecutionItems.filter(
      (item) => item.provenance?.origin !== "plugin_derived",
    );
    const outputExecutionItems =
      coreOwnedOutputExecutionItems.length > 0
        ? coreOwnedOutputExecutionItems
        : matchingOutputExecutionItems;
    const sortedOutputExecutionItems = [...outputExecutionItems].sort(
      (left, right) => left.order - right.order,
    );
    const expandedOutputExecutionItems = sortedOutputExecutionItems.flatMap((item) =>
      Array.isArray(item.output) ? item.output.map(() => item) : [item],
    );
    const executionItems =
      shape.cardinality === "many" && expandedOutputExecutionItems.length === rawItems.length
        ? expandedOutputExecutionItems
        : undefined;
    const executionItemOccurrences = new Map<string, number>();
    for (const item of executionItems ?? []) {
      executionItemOccurrences.set(item.id, (executionItemOccurrences.get(item.id) ?? 0) + 1);
    }
    const usedIdentities = new Set<string>();
    const items = rawItems.map((item, order) => {
      const externalKey = externalItemKey(item);
      const executionItem = executionItems?.[order];
      const sourceExecutionItemId = executionItem?.id;
      const sourceHasVariants =
        sourceExecutionItemId && (executionItemOccurrences.get(sourceExecutionItemId) ?? 0) > 1;
      const baseIdentity = sourceHasVariants
        ? `${sourceExecutionItemId}:${externalKey ?? String(order + 1)}`
        : (sourceExecutionItemId ?? externalKey ?? String(order + 1));
      let identity = baseIdentity;
      let duplicate = 2;
      while (usedIdentities.has(identity)) identity = `${baseIdentity}-${duplicate++}`;
      usedIdentities.add(identity);
      const generatedItemId = deliveryItemIdFor(id, identity);
      const previousItem =
        previous?.items.find((candidate) => candidate.id === generatedItemId) ??
        (!sourceHasVariants
          ? previous?.items.find(
              (candidate) =>
                sourceExecutionItemId && candidate.sourceExecutionItemId === sourceExecutionItemId,
            )
          : undefined) ??
        previous?.items.find(
          (candidate) =>
            candidate.order === order &&
            candidate.sourceExecutionItemId === undefined &&
            deepEqual(candidate.value, item),
        );
      return {
        id: previousItem?.id ?? generatedItemId,
        sourceExecutionItemId,
        order,
        value: structuredClone(item) as RuntimeValue | StructuredRecord,
        externalKey,
        references: mergeReferences(
          previousItem?.references,
          executionItem?.provenance?.sourceDeliveryItemId
            ? [
                {
                  itemId: executionItem.provenance.sourceDeliveryItemId,
                  role: "derived_from",
                },
              ]
            : undefined,
          declaredRecordReferences(output.shape, item),
        ),
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
        shape,
        attempt,
        status,
        items,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      } satisfies ProjectDelivery,
    ];
  });
}

function declaredRecordReferences(shape: ValueShape, value: unknown): DeliveryItem["references"] {
  if (shape.kind !== "record" || !isStructuredRecord(value)) return undefined;
  const references = shape.fields.flatMap((field) => {
    if (!field.referencesInputId) return [];
    const raw = value[field.key];
    const values = Array.isArray(raw) ? raw : [raw];
    return values.flatMap((itemId) =>
      typeof itemId === "string" ? [{ itemId, role: field.key }] : [],
    );
  });
  return references.length ? references : undefined;
}

function mergeReferences(...groups: Array<DeliveryItem["references"]>): DeliveryItem["references"] {
  const merged = new Map<string, NonNullable<DeliveryItem["references"]>[number]>();
  for (const reference of groups.flatMap((group) => group ?? [])) {
    merged.set(`${reference.itemId}:${reference.role ?? ""}`, reference);
  }
  return merged.size ? [...merged.values()] : undefined;
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
  const promoted = promotedProcessOutputDeliveries(execution, values);
  if (promoted.length === createProcessOutputFields(execution.processType).length) {
    execution.deliveries = (execution.deliveries ?? []).map((delivery) =>
      delivery.blockId === "__process_output__" && delivery.status !== "invalidated"
        ? { ...delivery, status: "invalidated" as const, updatedAt: now }
        : delivery,
    );
    return promoted;
  }
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

export function processOutputDeliveryFor(
  execution: ProcessExecution,
  outputKey: string,
): ProjectDelivery | undefined {
  const synthetic = [...(execution.deliveries ?? [])]
    .reverse()
    .find(
      (delivery) =>
        delivery.blockId === "__process_output__" &&
        delivery.outputKey === outputKey &&
        delivery.status !== "invalidated",
    );
  if (synthetic) return synthetic;

  const value = execution.output?.values[outputKey];
  if (value === undefined || !execution.output?.sourceBlockId) return undefined;
  return promotedProcessOutputDeliveries(execution, { [outputKey]: value }).find((delivery) =>
    deepEqual(deliveryRuntimeValue(delivery), value),
  );
}

function promotedProcessOutputDeliveries(
  execution: ProcessExecution,
  values: Record<string, RuntimeValue>,
) {
  const sourceBlockId = execution.output?.sourceBlockId;
  if (!sourceBlockId) return [];

  return createProcessOutputFields(execution.processType).flatMap((output) => {
    const value = values[output.key];
    if (value === undefined) return [];
    const delivery = [...(execution.deliveries ?? [])]
      .reverse()
      .find(
        (candidate) =>
          candidate.blockId === sourceBlockId &&
          candidate.status !== "invalidated" &&
          areDeliveryShapesCompatible(candidate.shape, fieldValueShape(output)) &&
          deepEqual(deliveryRuntimeValue(candidate), value),
      );
    return delivery ? [delivery] : [];
  });
}

function fieldValueShape(field: Pick<BlockFieldDefinition, "shape">): ValueShape {
  return field.shape;
}

function areDeliveryShapesCompatible(output: ValueShape, input: ValueShape) {
  return areValueShapesCompatible(output, input);
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
  if (execution.methodSnapshot.contractVersion !== 3) return normalized;
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
  if (delivery.shape.cardinality === "many") {
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
  const targets = (execution.deliveries ?? [])
    .filter(
      (delivery) =>
        delivery.blockId === block.validation?.targetBlockId && delivery.status !== "invalidated",
    )
    .filter(
      (delivery) =>
        !block.validation?.targetOutputKey ||
        delivery.outputKey === block.validation.targetOutputKey,
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
