import { randomUUID } from "node:crypto";
import type {
  PluginClaimedWorkItem,
  PluginCapability,
  PluginExecutionRequest,
  PluginInvocation,
  PluginWorkItemUpdate,
  PluginWorkItemUpdateReceipt,
} from "../src/lib/plugin-contract";
import type {
  BlockExecutionItem,
  BlockExecutionItemValue,
  BlockItemProgress,
  RuntimeValue,
  StoredFile,
} from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";
import { workUnitAttemptIdFor } from "../src/lib/work-units";

export function supportsIncrementalItemCorrelation(capability: PluginCapability) {
  return Boolean(capability.execution.itemOrchestration);
}

export function deterministicAggregateMapping(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  values: Record<string, RuntimeValue>,
) {
  if (supportsIncrementalItemCorrelation(capability)) return undefined;
  const inputCandidates = Object.entries(request.inputs).filter(
    ([, value]) => Array.isArray(value) && value.length >= 2,
  );
  if (inputCandidates.length !== 1) return undefined;
  const [inputPort, inputItems] = inputCandidates[0];
  if (!Array.isArray(inputItems)) return undefined;
  const outputCandidates = request.outputContract.filter((field) => {
    const output = values[field.key];
    return Array.isArray(output) && output.length > 0 && output.length <= inputItems.length;
  });
  if (outputCandidates.length !== 1) return undefined;
  return {
    mode: "sequential" as const,
    inputPort,
    outputPort: outputCandidates[0].portKey,
  };
}

export function aggregateCompatibilityItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  values: Record<string, RuntimeValue>,
  completedAt?: string,
) {
  if (supportsIncrementalItemCorrelation(capability)) return undefined;
  const policy = deterministicAggregateMapping(capability, request, values);
  if (!policy) return undefined;
  const inputs = request.inputs[policy.inputPort];
  const outputKey = request.outputContract.find(
    (field) => field.portKey === policy.outputPort,
  )?.key;
  const outputs = outputKey ? values[outputKey] : undefined;
  if (!Array.isArray(inputs) || !Array.isArray(outputs) || inputs.length !== outputs.length) {
    return undefined;
  }
  const materialized = legacyItemOrchestration(
    {
      ...capability,
      execution: {
        ...capability.execution,
        itemOrchestration: policy,
      },
    },
    request,
    structuredClone(outputs) as RuntimeValue[],
    completedAt,
  );
  if (!materialized) return undefined;
  return {
    ...materialized,
    compatibility: {
      mode: "aggregate_completion" as const,
      lateUpdates: false as const,
      realtimeUpdates: false as const,
      profileParallelism: false as const,
    },
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function declaredItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  materializedInputItems?: BlockExecutionItem[],
) {
  const policy = capability.execution.itemOrchestration;
  const items = policy ? request.inputs[policy.inputPort] : undefined;
  if (!policy || !Array.isArray(items) || items.length < 2) return undefined;
  const sourceItemIds = request.inputDeliveries?.find(
    (delivery) => delivery.portKey === policy.inputPort,
  )?.itemIds;
  const sourceDelivery = request.inputDeliveries?.find(
    (delivery) => delivery.portKey === policy.inputPort,
  );
  const reusableItems = materializedInputItems
    ?.filter(
      (item) =>
        !item.parentItemId &&
        item.provenance?.origin === "block_input" &&
        item.provenance.inputPort === policy.inputPort,
    )
    .sort((left, right) => left.order - right.order);
  const canReuseMaterialized =
    reusableItems?.length === items.length &&
    reusableItems.every(
      (item, index) => JSON.stringify(item.input) === JSON.stringify(items[index]),
    );
  const itemIds = canReuseMaterialized
    ? reusableItems.map((item) => item.id)
    : items.map(() => randomUUID());
  const workItems = items.map((input, order) =>
    canReuseMaterialized
      ? ({
          ...structuredClone(reusableItems[order]),
          order,
          input: structuredClone(input) as BlockExecutionItemValue,
          status: "pending",
          attempt: request.attempt,
          error: undefined,
          output: undefined,
        } satisfies BlockExecutionItem)
      : ({
          id: itemIds[order],
          kind: "list_item",
          sourceItemId: sourceItemIds?.length === items.length ? sourceItemIds[order] : undefined,
          provenance: {
            origin: "block_input",
            inputPort: policy.inputPort,
            ...(sourceDelivery?.deliveryId ? { sourceDeliveryId: sourceDelivery.deliveryId } : {}),
            ...(sourceItemIds?.length === items.length && sourceItemIds[order]
              ? { sourceDeliveryItemId: sourceItemIds[order] }
              : {}),
          },
          order,
          input: structuredClone(input) as BlockExecutionItemValue,
          status: "pending",
          attempt: request.attempt,
          attempts: [],
        } satisfies BlockExecutionItem),
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
  const requiredItems = requiredOrchestratedItems(job);
  const total = requiredItems.length || orchestration.items.length;
  const durableWorkItemState = requiredItems.some(
    (item) =>
      item.durableState !== undefined ||
      item.revision !== undefined ||
      item.attempts.some((attempt) => attempt.id !== undefined),
  );
  if (requiredItems.length && durableWorkItemState) {
    const completed = requiredItems.filter((item) => item.status === "completed").length;
    const failedItem = requiredItems.find((item) => item.status === "failed");
    const currentItem = requiredItems.find((item) => item.status === "in_progress");
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

export function areRequiredOrchestratedItemsCompleted(job: PersistentPluginJob) {
  const requiredItems = requiredOrchestratedItems(job);
  return requiredItems.length > 0 && requiredItems.every((item) => item.status === "completed");
}

export function blockExecutionItemsForJob(
  job: PersistentPluginJob,
  currentItems: BlockExecutionItem[] | undefined = undefined,
) {
  const merged = new Map<string, BlockExecutionItem>();
  for (const item of currentItems ?? []) merged.set(item.id, structuredClone(item));
  for (const item of job.itemOrchestration?.workItems ?? []) {
    merged.set(item.id, structuredClone(item));
  }
  for (const item of job.incrementalItems ?? []) {
    merged.set(item.id, structuredClone(item));
  }
  for (const item of job.registeredItems ?? []) {
    merged.set(item.id, structuredClone(item));
  }
  if (!merged.size) return undefined;
  return [...merged.values()].sort((left, right) => {
    if (left.parentItemId && left.parentItemId === right.id) return 1;
    if (right.parentItemId && right.parentItemId === left.id) return -1;
    return left.order - right.order || left.id.localeCompare(right.id);
  });
}

export function requiredOrchestratedItems(job: PersistentPluginJob) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems?.length) return [] as BlockExecutionItem[];
  return requiredItemsFromRoots(
    [...orchestration.workItems, ...(job.registeredItems ?? [])],
    orchestration.itemIds,
  );
}

export function consolidatedOrchestratedOutputs(job: PersistentPluginJob) {
  const requiredItems = requiredOrchestratedItems(job);
  return {
    requiredItems,
    outputs: completedOutputs(requiredItems),
    complete:
      requiredItems.length > 0 &&
      requiredItems.every((item) => item.status === "completed" && item.output !== undefined),
  };
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
                  id: workUnitAttemptIdFor(item.id, item.attempt),
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
                id: workUnitAttemptIdFor(item.id, item.attempt),
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
                id: workUnitAttemptIdFor(item.id, item.attempt),
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
  const activeProfile = job.profileExecution
    ? job.profileExecution.profiles[fallback ? fallback.activeIndex : 0]?.alias
    : fallback?.candidates[fallback.activeIndex];
  if (job.profileExecution && activeProfile) {
    configuration[job.profileExecution.configurationKey] = activeProfile;
  } else if (fallback) {
    configuration[fallback.configurationKey] = fallback.candidates[fallback.activeIndex];
  }
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

export function usesContinuousItemSession(capability: PluginCapability) {
  const orchestration = capability.execution.itemOrchestration;
  if (!orchestration?.strategies?.includes("continuous_session")) return false;
  if (orchestration.preferredStrategy) {
    return orchestration.preferredStrategy === "continuous_session";
  }
  return orchestration.strategies.length === 1;
}

export function continuousInvocationRequestForJob(
  job: PersistentPluginJob,
  invocation: PluginInvocation,
) {
  const request = invocationRequestForJob(job, invocation);
  const orchestration = job.itemOrchestration;
  if (!orchestration) return request;
  return {
    ...request,
    inputs: {
      ...request.inputs,
      [orchestration.inputPort]: structuredClone(orchestration.items) as RuntimeValue,
    },
    batch: undefined,
  } satisfies PluginExecutionRequest;
}

export function claimOrchestratedItems(input: {
  job: PersistentPluginJob;
  limit: number;
  invocationId: string;
  profileId?: string;
  allowedItemIds?: readonly string[] | ReadonlySet<string>;
  expiresAt: string;
  now?: string;
}) {
  const orchestration = input.job.itemOrchestration;
  if (!orchestration?.workItems?.length) {
    return { job: input.job, claimed: [] as PluginClaimedWorkItem[] };
  }
  const now = input.now ?? new Date().toISOString();
  const activeClaims = (orchestration.claims ?? []).filter(
    (claim) => Date.parse(claim.expiresAt) > Date.parse(now),
  );
  const claimedIds = new Set(activeClaims.map((claim) => claim.itemId));
  const allowedItemIds = input.allowedItemIds
    ? input.allowedItemIds instanceof Set
      ? input.allowedItemIds
      : new Set(input.allowedItemIds)
    : undefined;
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
  const requiredItems = requiredOrchestratedItems(input.job);
  const candidates = requiredItems
    .filter(
      (item) =>
        item.status !== "completed" &&
        !claimedIds.has(item.id) &&
        (!allowedItemIds || allowedItemIds.has(item.id)),
    )
    .sort((left, right) => left.order - right.order)
    .slice(0, limit);
  if (!candidates.length) {
    return {
      job: {
        ...input.job,
        itemOrchestration: { ...orchestration, claims: activeClaims },
      } satisfies PersistentPluginJob,
      claimed: [] as PluginClaimedWorkItem[],
    };
  }
  const selectedIds = new Set(candidates.map((item) => item.id));
  const updateClaimedItem = (item: BlockExecutionItem) => {
    if (!selectedIds.has(item.id)) return item;
    const attempts = item.attempts.some(
      (attempt) => attempt.attempt === item.attempt && attempt.status === "in_progress",
    )
      ? item.attempts
      : [
          ...item.attempts,
          {
            id: workUnitAttemptIdFor(item.id, item.attempt),
            attempt: item.attempt,
            status: "in_progress" as const,
            input: structuredClone(item.input),
            startedAt: now,
          },
        ];
    return {
      ...item,
      status: "in_progress" as const,
      durableState:
        item.durableState && item.durableState !== "pending"
          ? item.durableState
          : ("leased" as const),
      error: undefined,
      attempts,
    };
  };
  const workItems = orchestration.workItems.map(updateClaimedItem);
  const registeredItems = (input.job.registeredItems ?? []).map(updateClaimedItem);
  const claims = [
    ...activeClaims,
    ...candidates.map((item) => ({
      itemId: item.id,
      invocationId: input.invocationId,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      claimedAt: now,
      expiresAt: input.expiresAt,
    })),
  ];
  const claimed = candidates.map((item) => ({
    itemId: item.id,
    index: item.order,
    total: requiredItems.length,
    order: item.order,
    attempt: item.attempt,
    revision: item.revision ?? 0,
    state:
      item.durableState && item.durableState !== "pending"
        ? item.durableState
        : ("leased" as const),
    input: structuredClone(item.input),
    sourceDeliveryId: item.provenance?.sourceDeliveryId,
    sourceItemId: item.provenance?.sourceDeliveryItemId ?? item.sourceItemId,
    parentItemId: item.parentItemId,
  })) satisfies PluginClaimedWorkItem[];
  return {
    job: {
      ...input.job,
      registeredItems,
      itemOrchestration: { ...orchestration, workItems, claims },
    } satisfies PersistentPluginJob,
    claimed,
  };
}

export function publishOrchestratedItemUpdate(input: {
  job: PersistentPluginJob;
  invocationId: string;
  update: PluginWorkItemUpdate;
  storedArtifacts?: StoredFile[];
  now?: string;
}) {
  const orchestration = input.job.itemOrchestration;
  if (!orchestration?.workItems?.length) {
    throw new Error("A invocação não possui unidades de trabalho orquestradas.");
  }
  const claim = (orchestration.claims ?? []).find(
    (candidate) =>
      candidate.invocationId === input.invocationId && candidate.itemId === input.update.itemId,
  );
  if (!claim) {
    throw new Error("O item não pertence à concessão desta invocação.");
  }
  const item = [...orchestration.workItems, ...(input.job.registeredItems ?? [])].find(
    (candidate) => candidate.id === input.update.itemId,
  );
  if (!item) throw new Error("O item concedido não existe mais.");
  const revision = item.revision ?? 0;
  if (input.update.expectedRevision !== revision) {
    throw new Error("A revisão do item está desatualizada.");
  }
  if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") {
    throw new Error("O item já está em estado terminal.");
  }
  const durableState = input.update.state;
  const status =
    durableState === "completed"
      ? ("completed" as const)
      : durableState === "failed"
        ? ("failed" as const)
        : durableState === "cancelled"
          ? ("cancelled" as const)
          : ("in_progress" as const);
  const outputPort = input.update.outputPort;
  if (outputPort && outputPort !== orchestration.outputPort) {
    throw new Error("A atualização referencia uma porta de saída diferente da concessão.");
  }
  if (
    durableState === "completed" &&
    input.update.value === undefined &&
    item.output === undefined
  ) {
    throw new Error("O item foi concluído sem resultado.");
  }
  if (
    (durableState === "submitted" || durableState === "awaiting_result") &&
    item.durableState === "awaiting_human"
  ) {
    throw new Error("O item não pode sair de awaiting_human sem nova concessão.");
  }
  const safeExternalReceipt = normalizeExternalReceipt(input.update.externalReceipt);
  const now = input.now ?? new Date().toISOString();
  const nextRevision = revision + 1;
  const artifacts = mergeItemArtifacts(item.artifacts, input.storedArtifacts);
  const output =
    input.update.value !== undefined ? structuredClone(input.update.value) : item.output;
  const error =
    durableState === "failed"
      ? (safeItemDiagnostic(input.update.message) ??
        safeItemDiagnostic(input.update.errorCode) ??
        "O item falhou.")
      : undefined;
  const attempts = item.attempts.map((attempt) =>
    attempt.attempt === item.attempt
      ? {
          ...attempt,
          status,
          ...(output !== undefined ? { output: structuredClone(output) } : {}),
          ...(artifacts.length ? { artifacts: structuredClone(artifacts) } : {}),
          ...(safeExternalReceipt ? { externalReceipt: safeExternalReceipt } : {}),
          error,
          ...(durableState === "completed" ||
          durableState === "failed" ||
          durableState === "cancelled"
            ? { completedAt: now }
            : {}),
        }
      : attempt,
  );
  const updateCandidate = (candidate: BlockExecutionItem) =>
    candidate.id === item.id
      ? {
          ...candidate,
          status,
          durableState,
          revision: nextRevision,
          ...(output !== undefined ? { output: structuredClone(output) } : {}),
          ...(artifacts.length ? { artifacts: structuredClone(artifacts) } : {}),
          ...(safeExternalReceipt ? { externalReceipt: safeExternalReceipt } : {}),
          error,
          attempts,
        }
      : candidate;
  const workItems = orchestration.workItems.map(updateCandidate);
  const registeredItems = (input.job.registeredItems ?? []).map(updateCandidate);
  const terminal =
    durableState === "completed" || durableState === "failed" || durableState === "cancelled";
  const job: PersistentPluginJob = {
    ...input.job,
    registeredItems,
    itemOrchestration: {
      ...orchestration,
      workItems,
      claims: terminal
        ? (orchestration.claims ?? []).filter(
            (candidate) =>
              !(
                candidate.invocationId === input.invocationId &&
                candidate.itemId === input.update.itemId
              ),
          )
        : orchestration.claims,
    },
  };
  return {
    job,
    receipt: { itemId: item.id, revision: nextRevision } satisfies PluginWorkItemUpdateReceipt,
  };
}

export function completeContinuousSessionClaims(
  job: PersistentPluginJob,
  invocationId: string,
  outputs: BlockExecutionItemValue[],
) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems?.length) return job;
  const requiredItems = requiredOrchestratedItems(job);
  const requiredIds = new Set(requiredItems.map((item) => item.id));
  const owned = (orchestration.claims ?? [])
    .filter((claim) => claim.invocationId === invocationId)
    .filter((claim) => requiredIds.has(claim.itemId))
    .sort((left, right) => {
      const leftOrder = requiredItems.find((item) => item.id === left.itemId)?.order ?? 0;
      const rightOrder = requiredItems.find((item) => item.id === right.itemId)?.order ?? 0;
      return leftOrder - rightOrder;
    });
  if (!owned.length) {
    return {
      ...job,
      itemOrchestration: {
        ...orchestration,
        claims: (orchestration.claims ?? []).filter((claim) => claim.invocationId !== invocationId),
      },
    } satisfies PersistentPluginJob;
  }
  if (owned.length !== outputs.length) return job;
  const byId = new Map(owned.map((claim, index) => [claim.itemId, outputs[index]] as const));
  const completedAt = new Date().toISOString();
  const completeItem = (item: BlockExecutionItem) => {
    if (!byId.has(item.id)) return item;
    const output = structuredClone(byId.get(item.id)!) as BlockExecutionItemValue;
    const attempts = item.attempts.map((attempt) =>
      attempt.attempt === item.attempt
        ? { ...attempt, status: "completed" as const, output, completedAt, error: undefined }
        : attempt,
    );
    return {
      ...item,
      status: "completed" as const,
      output,
      error: undefined,
      attempts,
    };
  };
  const workItems = orchestration.workItems.map(completeItem);
  const registeredItems = (job.registeredItems ?? []).map(completeItem);
  return {
    ...job,
    registeredItems,
    itemOrchestration: {
      ...orchestration,
      workItems,
      claims: (orchestration.claims ?? []).filter((claim) => claim.invocationId !== invocationId),
    },
  } satisfies PersistentPluginJob;
}

export function releaseContinuousSessionClaims(job: PersistentPluginJob, invocationId: string) {
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems?.length) return job;
  const releasedIds = new Set(
    (orchestration.claims ?? [])
      .filter((claim) => claim.invocationId === invocationId)
      .map((claim) => claim.itemId),
  );
  if (!releasedIds.size) return job;
  const releaseItem = (item: BlockExecutionItem) =>
    releasedIds.has(item.id) &&
    item.status === "in_progress" &&
    (item.durableState === undefined || item.durableState === "leased") &&
    item.output === undefined
      ? { ...item, status: "pending" as const, durableState: "pending" as const }
      : item;
  const workItems = orchestration.workItems.map(releaseItem);
  const registeredItems = (job.registeredItems ?? []).map(releaseItem);
  return {
    ...job,
    registeredItems,
    itemOrchestration: {
      ...orchestration,
      workItems,
      claims: (orchestration.claims ?? []).filter((claim) => claim.invocationId !== invocationId),
    },
  } satisfies PersistentPluginJob;
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
  const configuration = { ...input.job.request.configuration };
  const fallback = input.job.profileFallback;
  const activeProfile = input.job.profileExecution
    ? input.job.profileExecution.profiles[fallback ? fallback.activeIndex : 0]?.alias
    : fallback?.candidates[fallback.activeIndex];
  if (input.job.profileExecution && activeProfile) {
    configuration[input.job.profileExecution.configurationKey] = activeProfile;
  } else if (fallback) {
    configuration[fallback.configurationKey] = fallback.candidates[fallback.activeIndex];
  }
  return {
    ...structuredClone(input.job.request),
    configuration,
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
  return workItems.find((item) => item.status === "pending")?.order;
}

export function completedOutputs(items: BlockExecutionItem[]) {
  return items.flatMap((item) => {
    if (item.status !== "completed" || item.output === undefined) return [];
    return Array.isArray(item.output)
      ? (structuredClone(item.output) as RuntimeValue[])
      : ([structuredClone(item.output)] as RuntimeValue[]);
  });
}

function requiredItemsFromRoots(items: BlockExecutionItem[], rootIds: string[]) {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const children = new Map<string, BlockExecutionItem[]>();
  for (const item of items) {
    if (!item.parentItemId || !byId.has(item.parentItemId)) continue;
    const siblings = children.get(item.parentItemId) ?? [];
    siblings.push(item);
    children.set(item.parentItemId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }
  const result: BlockExecutionItem[] = [];
  const visit = (item: BlockExecutionItem) => {
    const derived = children.get(item.id) ?? [];
    if (!derived.length) {
      result.push(item);
      return;
    }
    for (const child of derived) visit(child);
  };
  for (const rootId of rootIds) {
    const root = byId.get(rootId);
    if (root) visit(root);
  }
  return result;
}

function mergeItemArtifacts(current: StoredFile[] | undefined, incoming: StoredFile[] | undefined) {
  const merged = new Map((current ?? []).map((artifact) => [artifact.id, artifact] as const));
  for (const artifact of incoming ?? []) merged.set(artifact.id, artifact);
  return [...merged.values()];
}

function normalizeExternalReceipt(value: string | undefined) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 1_024 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error("O recibo externo do item é inválido.");
  }
  return value.trim();
}

function safeItemDiagnostic(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const normalized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .trim();
  return normalized ? normalized.slice(0, 1_000) : undefined;
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
