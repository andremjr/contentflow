import { randomUUID } from "node:crypto";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginInvocation,
} from "../src/lib/plugin-contract";
import type {
  BlockExecutionItem,
  BlockExecutionItemValue,
  BlockItemProgress,
  RuntimeValue,
} from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";

export function declaredItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
) {
  const policy = capability.execution.itemOrchestration;
  const items = policy ? request.inputs[policy.inputPort] : undefined;
  if (!policy || !Array.isArray(items) || items.length < 2) return undefined;
  const sourceItemIds = request.inputDeliveries?.find(
    (delivery) => delivery.portKey === policy.inputPort,
  )?.itemIds;
  const itemIds = items.map(() => randomUUID());
  const workItems = items.map(
    (input, order) =>
      ({
        id: itemIds[order],
        sourceItemId: sourceItemIds?.length === items.length ? sourceItemIds[order] : undefined,
        order,
        input: structuredClone(input) as BlockExecutionItemValue,
        status: "pending",
        attempt: 1,
        attempts: [],
      }) satisfies BlockExecutionItem,
  );
  return {
    inputPort: policy.inputPort,
    outputPort: policy.outputPort,
    combinedOutputPort: policy.combinedOutputPort,
    separator: policy.separator,
    items: structuredClone(items) as RuntimeValue[],
    itemIds,
    workItems,
    currentIndex: 0,
    accumulatedItems: [],
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function resumedItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  previousJob: PersistentPluginJob,
) {
  const fresh = declaredItemOrchestration(capability, request);
  const previous = previousJob.itemOrchestration;
  if (
    !fresh ||
    !previous ||
    !sameOrchestratedInput(request, previousJob.request, fresh.inputPort)
  ) {
    return undefined;
  }
  const completed = itemProgressForJob(previousJob)?.completed ?? 0;
  if (completed >= fresh.items.length) return undefined;
  const resumedWorkItems = previous.workItems?.map((item, index) => {
    const wasCompleted = item.status === "completed" || index < completed;
    return {
      ...structuredClone(item),
      status: wasCompleted ? ("completed" as const) : ("pending" as const),
      attempt: wasCompleted ? item.attempt : item.attempt + 1,
      output:
        item.output ??
        (index < (previous.accumulatedItems?.length ?? 0)
          ? (structuredClone(previous.accumulatedItems![index]) as BlockExecutionItemValue)
          : undefined),
      error: undefined,
    };
  }) satisfies BlockExecutionItem[] | undefined;
  return {
    ...fresh,
    itemIds:
      previous.itemIds.length === fresh.items.length
        ? structuredClone(previous.itemIds)
        : fresh.itemIds,
    workItems: resumedWorkItems?.length === fresh.items.length ? resumedWorkItems : fresh.workItems,
    currentIndex: completed,
    accumulatedItems: structuredClone(previous.accumulatedItems ?? []),
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function selectedItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  previousJob: PersistentPluginJob,
  selectedItemId: string,
) {
  const fresh = declaredItemOrchestration(capability, request);
  const previous = previousJob.itemOrchestration;
  if (
    !fresh ||
    !previous?.workItems?.length ||
    !sameOrchestratedInput(request, previousJob.request, fresh.inputPort)
  ) {
    return undefined;
  }
  const selectedIndex = previous.workItems.findIndex((item) => item.id === selectedItemId);
  if (selectedIndex < 0 || previous.workItems.length !== fresh.items.length) return undefined;
  const workItems = previous.workItems.map((item, index) =>
    index === selectedIndex
      ? {
          ...structuredClone(item),
          status: "pending" as const,
          attempt: item.attempt + 1,
          error: undefined,
        }
      : {
          ...structuredClone(item),
          status: item.output === undefined ? ("pending" as const) : ("completed" as const),
          error: undefined,
        },
  );
  return {
    ...fresh,
    itemIds:
      previous.itemIds.length === fresh.items.length
        ? structuredClone(previous.itemIds)
        : fresh.itemIds,
    workItems,
    currentIndex: selectedIndex,
    accumulatedItems: completedOutputs(workItems),
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function selectedItemOrchestrationFromItems(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  previousItems: BlockExecutionItem[] | undefined,
  selectedItemId: string,
) {
  const fresh = declaredItemOrchestration(capability, request);
  if (!fresh || !previousItems?.length || previousItems.length !== fresh.items.length)
    return undefined;
  if (
    previousItems.some(
      (item, index) => JSON.stringify(item.input) !== JSON.stringify(fresh.items[index]),
    )
  ) {
    return undefined;
  }
  const selectedIndex = previousItems.findIndex((item) => item.id === selectedItemId);
  if (selectedIndex < 0) return undefined;
  const workItems = previousItems.map((item, index) =>
    index === selectedIndex
      ? {
          ...structuredClone(item),
          status: "pending" as const,
          attempt: item.attempt + 1,
          error: undefined,
        }
      : {
          ...structuredClone(item),
          status: item.output === undefined ? ("pending" as const) : ("completed" as const),
          error: undefined,
        },
  );
  return {
    ...fresh,
    itemIds: workItems.map((item) => item.id),
    workItems,
    currentIndex: selectedIndex,
    accumulatedItems: completedOutputs(workItems),
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function resumedItemOrchestrationFromItems(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  previousItems: BlockExecutionItem[] | undefined,
) {
  const fresh = declaredItemOrchestration(capability, request);
  if (!fresh || !previousItems?.length || previousItems.length !== fresh.items.length)
    return undefined;
  if (
    previousItems.some(
      (item, index) => JSON.stringify(item.input) !== JSON.stringify(fresh.items[index]),
    )
  ) {
    return undefined;
  }
  const workItems = previousItems.map((item) => {
    const wasCompleted = item.output !== undefined;
    return {
      ...structuredClone(item),
      status: wasCompleted ? ("completed" as const) : ("pending" as const),
      attempt: wasCompleted ? item.attempt : item.attempt + 1,
      error: undefined,
    };
  });
  const currentIndex = workItems.find((item) => item.status !== "completed")?.order;
  if (currentIndex === undefined) return undefined;
  return {
    ...fresh,
    itemIds: workItems.map((item) => item.id),
    workItems,
    currentIndex,
    accumulatedItems: completedOutputs(workItems),
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function legacyItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  outputs: RuntimeValue[],
  completedAt?: string,
) {
  const fresh = declaredItemOrchestration(capability, request);
  if (!fresh || outputs.length > fresh.items.length) return undefined;
  const finishedAt = completedAt ?? new Date().toISOString();
  const workItems = fresh.workItems!.map((item, index) => {
    const output = outputs[index] as BlockExecutionItemValue | undefined;
    if (output === undefined) return item;
    return {
      ...item,
      status: "completed" as const,
      output: structuredClone(output),
      attempts: [
        {
          attempt: 1,
          status: "completed" as const,
          input: structuredClone(item.input),
          output: structuredClone(output),
          completedAt: finishedAt,
        },
      ],
    };
  });
  return {
    ...fresh,
    workItems,
    currentIndex: Math.min(outputs.length, Math.max(0, fresh.items.length - 1)),
    accumulatedItems: structuredClone(outputs),
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function itemProgressForJob(job: PersistentPluginJob): BlockItemProgress | undefined {
  if (job.incrementalItems?.length) {
    const items = job.incrementalItems;
    const completed = items.filter((item) => item.status === "completed").length;
    const failedItem = items.find((item) => item.status === "failed");
    const currentItem = items.find((item) => item.status === "in_progress");
    return {
      total: items.length,
      completed,
      pending: Math.max(0, items.length - completed),
      currentIndex: (failedItem ?? currentItem)?.order,
      failedIndex: failedItem?.order,
    };
  }
  const orchestration = job.itemOrchestration;
  if (!orchestration) return undefined;
  const total = orchestration.items.length;
  const workItemsCarryState = orchestration.workItems?.some((item) => item.status !== "pending");
  if (orchestration.workItems?.length === total && workItemsCarryState) {
    const completed = orchestration.workItems.filter((item) => item.status === "completed").length;
    const failedItem = orchestration.workItems.find((item) => item.status === "failed");
    const currentItem = orchestration.workItems.find((item) => item.status === "in_progress");
    const activeItem = failedItem ?? currentItem;
    return {
      total,
      completed,
      pending: Math.max(0, total - completed),
      currentIndex:
        completed < total
          ? (activeItem?.order ?? Math.min(orchestration.currentIndex, total - 1))
          : undefined,
      failedIndex: failedItem?.order,
    };
  }
  const terminalSuccess = job.status === "completed";
  const completed = terminalSuccess ? total : Math.min(orchestration.currentIndex, total);
  const currentIndex =
    completed < total ? Math.min(orchestration.currentIndex, total - 1) : undefined;
  const failed = ["failed", "abandoned"].includes(job.status);
  return {
    total,
    completed,
    pending: Math.max(0, total - completed),
    currentIndex,
    failedIndex: failed ? currentIndex : undefined,
  };
}

export function blockExecutionItemsForJob(job: PersistentPluginJob) {
  if (job.incrementalItems?.length) return structuredClone(job.incrementalItems);
  return job.itemOrchestration?.workItems
    ? structuredClone(job.itemOrchestration.workItems)
    : undefined;
}

export function startCurrentOrchestratedItem(job: PersistentPluginJob) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems) return job;
  const now = new Date().toISOString();
  const workItems = orchestration.workItems.map((item, index) =>
    index === orchestration.currentIndex && item.status !== "completed"
      ? {
          ...item,
          status: "in_progress" as const,
          error: undefined,
          attempts: item.attempts.some(
            (attempt) => attempt.attempt === item.attempt && attempt.status === "in_progress",
          )
            ? item.attempts
            : [
                ...item.attempts,
                {
                  attempt: item.attempt,
                  status: "in_progress" as const,
                  input: structuredClone(item.input),
                  startedAt: now,
                },
              ],
        }
      : item,
  );
  return {
    ...job,
    itemOrchestration: { ...orchestration, workItems },
  } satisfies PersistentPluginJob;
}

export function completeCurrentOrchestratedItem(
  job: PersistentPluginJob,
  output: BlockExecutionItemValue | undefined,
) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems) return job;
  const now = new Date().toISOString();
  const workItems = orchestration.workItems.map((item, index) => {
    if (index !== orchestration.currentIndex) return item;
    const attempts = item.attempts.map((attempt) =>
      attempt.attempt === item.attempt
        ? { ...attempt, status: "completed" as const, output, completedAt: now, error: undefined }
        : attempt,
    );
    return {
      ...item,
      status: "completed" as const,
      output,
      error: undefined,
      attempts:
        attempts.length === item.attempts.length &&
        attempts.some((attempt) => attempt.attempt === item.attempt)
          ? attempts
          : [
              ...attempts,
              {
                attempt: item.attempt,
                status: "completed" as const,
                input: structuredClone(item.input),
                output,
                completedAt: now,
              },
            ],
    };
  });
  return {
    ...job,
    itemOrchestration: { ...orchestration, workItems },
  } satisfies PersistentPluginJob;
}

export function failCurrentOrchestratedItem(job: PersistentPluginJob, error: string) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems) return job;
  const now = new Date().toISOString();
  const workItems = orchestration.workItems.map((item, index) => {
    if (index !== orchestration.currentIndex || item.status === "completed") return item;
    const attempts = item.attempts.map((attempt) =>
      attempt.attempt === item.attempt
        ? { ...attempt, status: "failed" as const, error, completedAt: now }
        : attempt,
    );
    return {
      ...item,
      status: "failed" as const,
      error,
      attempts:
        attempts.length === item.attempts.length &&
        attempts.some((attempt) => attempt.attempt === item.attempt)
          ? attempts
          : [
              ...attempts,
              {
                attempt: item.attempt,
                status: "failed" as const,
                input: structuredClone(item.input),
                error,
                completedAt: now,
              },
            ],
    };
  });
  return {
    ...job,
    itemOrchestration: { ...orchestration, workItems },
  } satisfies PersistentPluginJob;
}

export function invocationRequestForJob(job: PersistentPluginJob, invocation: PluginInvocation) {
  const configuration = { ...job.request.configuration };
  const fallback = job.profileFallback;
  if (fallback)
    configuration[fallback.configurationKey] = fallback.candidates[fallback.activeIndex];
  const activeProfile = fallback?.candidates[fallback.activeIndex];
  const conversation =
    job.request.conversation?.mode === "reuse" &&
    job.request.conversation.sourceProfile &&
    activeProfile &&
    job.request.conversation.sourceProfile !== activeProfile
      ? {
          mode: "new" as const,
          fallbackContext: job.request.conversation.fallbackContext,
          continuationMessage: job.request.conversation.continuationMessage,
        }
      : job.request.conversation;
  const inputs = { ...job.request.inputs };
  const item = job.itemOrchestration;
  if (item) inputs[item.inputPort] = structuredClone(item.items[item.currentIndex]);
  return {
    ...job.request,
    // A retry explícita é uma nova tentativa lógica. Avançar o número impede
    // que bridges idempotentes reproduzam do cache os comandos da tentativa
    // anterior (por exemplo, "preencher" e "enviar" em uma nova aba vazia).
    attempt: job.request.attempt + job.retryCount,
    invocation,
    configuration,
    conversation,
    inputs,
    resume: {
      values: structuredClone(job.partialValues),
      artifacts: structuredClone(job.partialArtifacts),
    },
    batch: item
      ? {
          itemId: item.itemIds[item.currentIndex],
          index: item.currentIndex,
          total: item.items.length,
        }
      : undefined,
  } satisfies PluginExecutionRequest;
}

/** Builds the core-owned context for an isolated item regeneration. */
export function itemActionRequestForJob(input: {
  job: PersistentPluginJob;
  item: BlockExecutionItem;
  outputPort: string;
  attempt: number;
  traceId: string;
}) {
  const batchItem = input.item.pluginCorrelation?.batchItemId
    ? input.job.itemOrchestration?.workItems?.find(
        (candidate) => candidate.id === input.item.pluginCorrelation?.batchItemId,
      )
    : undefined;
  return {
    ...structuredClone(input.job.request),
    traceId: input.traceId,
    attempt: input.attempt,
    invocation: {
      mode: "item_action" as const,
      action: "regenerate" as const,
      itemId: input.item.id,
      outputPort: input.outputPort,
    },
    batch: batchItem
      ? {
          itemId: batchItem.id,
          index: batchItem.order,
          total: input.job.itemOrchestration?.workItems?.length ?? 1,
        }
      : {
          itemId: input.item.id,
          index: input.item.order,
          total: input.job.incrementalItems?.length ?? 1,
        },
    itemAction: {
      key: input.item.pluginCorrelation?.key,
      variantKey: input.item.pluginCorrelation?.variantKey,
      input: structuredClone(input.item.input),
      ...(input.item.output !== undefined ? { output: structuredClone(input.item.output) } : {}),
      attempt: input.attempt,
    },
  } satisfies PluginExecutionRequest;
}

/** Selection is local to one output port and, for batch variants, one batch item. */
export function belongsToSameItemActionGroup(
  target: BlockExecutionItem,
  candidate: BlockExecutionItem,
) {
  const outputPort = target.pluginCorrelation?.outputPort;
  if (!outputPort) return true;
  return (
    candidate.pluginCorrelation?.outputPort === outputPort &&
    candidate.pluginCorrelation?.batchItemId === target.pluginCorrelation?.batchItemId
  );
}

export function nextPendingItemIndex(job: PersistentPluginJob) {
  const workItems = job.itemOrchestration?.workItems;
  if (!workItems?.length) return undefined;
  return workItems.find((item) => item.status !== "completed")?.order;
}

export function completedOutputs(items: BlockExecutionItem[]) {
  return items.flatMap((item) => {
    if (item.status !== "completed" || item.output === undefined) return [];
    return Array.isArray(item.output)
      ? (structuredClone(item.output) as RuntimeValue[])
      : ([structuredClone(item.output)] as RuntimeValue[]);
  });
}

export function appendOrchestratedOutput(
  current: Record<string, RuntimeValue>,
  incoming: Record<string, RuntimeValue>,
  outputKey: string,
  combinedOutputKey?: string,
  separator = "\n\n",
) {
  const next = { ...current, ...incoming };
  const priorItems = Array.isArray(current[outputKey]) ? current[outputKey] : [];
  const incomingItems = Array.isArray(incoming[outputKey])
    ? incoming[outputKey]
    : incoming[outputKey] === undefined
      ? []
      : [incoming[outputKey]];
  next[outputKey] = [...priorItems, ...incomingItems] as RuntimeValue;
  if (combinedOutputKey) {
    next[combinedOutputKey] = [...priorItems, ...incomingItems]
      .filter((item): item is string => typeof item === "string")
      .join(separator);
  }
  return next;
}

function sameOrchestratedInput(
  current: PluginExecutionRequest,
  previous: PluginExecutionRequest,
  inputPort: string,
) {
  const currentDelivery = current.inputDeliveries?.find((item) => item.portKey === inputPort);
  const previousDelivery = previous.inputDeliveries?.find((item) => item.portKey === inputPort);
  if (currentDelivery?.itemIds.length && previousDelivery?.itemIds.length) {
    return (
      currentDelivery.deliveryId === previousDelivery.deliveryId &&
      currentDelivery.itemIds.length === previousDelivery.itemIds.length &&
      currentDelivery.itemIds.every((id, index) => id === previousDelivery.itemIds[index])
    );
  }
  const currentItems = current.inputs[inputPort];
  const previousItems = previous.inputs[inputPort];
  return JSON.stringify(currentItems) === JSON.stringify(previousItems);
}
