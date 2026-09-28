import type { PluginCapability } from "../src/lib/plugin-contract";
import type { BlockExecutionItem, BlockExecutionItemDurableState } from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";

export type ProfileLaneAttemptSnapshot = {
  attempt: number;
  invocationId: string;
  state: "failed" | "reconciliation_required" | "reconciled";
  at: string;
  itemId?: string;
  itemState?: BlockExecutionItemDurableState;
  reasonCode?: string;
};

export type ProfileLaneSnapshot = {
  laneId: string;
  profileId: string;
  alias: string;
  itemIds: string[];
  state:
    | "planned"
    | "leased"
    | "running"
    | "completed"
    | "failed"
    | "reconciliation_required"
    | "cancelled";
  attempts?: ProfileLaneAttemptSnapshot[];
  reconciliationItemIds?: string[];
};

export type ProfileLanePoolSnapshot = {
  mode: "parallel";
  maxParallel: number;
  lanes: ProfileLaneSnapshot[];
};

export type ProfileLaneLease = {
  laneId: string;
  profileId: string;
  release: () => void | Promise<void>;
};

export type ProfileParallelEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason:
        | "PARALLEL_NOT_SELECTED"
        | "COLLECTION_NOT_MATERIALIZED"
        | "INCREMENTAL_CORRELATION_REQUIRED"
        | "ITEM_DEPENDENCY_REQUIRES_SEQUENTIAL";
    };

function hasItemDependency(items: BlockExecutionItem[]) {
  return items.some((item) => Boolean(item.parentItemId));
}

export function profileParallelEligibility(
  job: PersistentPluginJob,
  capability: PluginCapability,
): ProfileParallelEligibility {
  if (job.profileExecution?.mode !== "parallel") {
    return { eligible: false, reason: "PARALLEL_NOT_SELECTED" };
  }
  const orchestration = capability.execution.itemOrchestration;
  const workItems = job.itemOrchestration?.workItems;
  if (!workItems?.length) {
    return { eligible: false, reason: "COLLECTION_NOT_MATERIALIZED" };
  }
  if (
    job.itemOrchestration?.compatibility?.profileParallelism === false ||
    orchestration?.profileParallelism?.supported !== true ||
    !orchestration.strategies?.includes("continuous_session") ||
    (orchestration.preferredStrategy !== "continuous_session" &&
      !(orchestration.preferredStrategy === undefined && orchestration.strategies.length === 1))
  ) {
    return { eligible: false, reason: "INCREMENTAL_CORRELATION_REQUIRED" };
  }
  if (hasItemDependency(workItems)) {
    return { eligible: false, reason: "ITEM_DEPENDENCY_REQUIRES_SEQUENTIAL" };
  }
  return { eligible: true };
}

function itemHasUncertainExternalEffect(item: {
  durableState?: BlockExecutionItemDurableState;
  externalReceipt?: string;
}) {
  return Boolean(
    item.externalReceipt ||
    item.durableState === "submitted" ||
    item.durableState === "awaiting_result" ||
    item.durableState === "awaiting_human",
  );
}

function resetInterruptedUnsubmittedItem<
  T extends {
    id: string;
    status: string;
    durableState?: BlockExecutionItemDurableState;
    output?: unknown;
    externalReceipt?: string;
    attempt: number;
    attempts: Array<{
      attempt: number;
      status: string;
      completedAt?: string;
      error?: string;
    }>;
  },
>(item: T, now: string) {
  if (
    item.status !== "in_progress" ||
    itemHasUncertainExternalEffect(item) ||
    item.output !== undefined ||
    ![undefined, "planned", "pending", "leased"].includes(item.durableState)
  ) {
    return item;
  }
  return {
    ...item,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: item.attempt + 1,
    attempts: item.attempts.map((attempt) =>
      attempt.attempt === item.attempt && attempt.status === "in_progress"
        ? {
            ...attempt,
            status: "failed" as const,
            completedAt: now,
            error: "PROCESS_RESTARTED",
          }
        : attempt,
    ),
  };
}

/**
 * Marks every lane as cancelled and removes transient claims. Completed items
 * and items with a potentially external effect are preserved exactly as they
 * were persisted so a later diagnosis never turns cancellation into a retry.
 */
export function cancelProfileLanePool(job: PersistentPluginJob) {
  if (!job.profileLanePool) return job;
  const uncertain = new Set(
    (job.itemOrchestration?.workItems ?? [])
      .filter((item) => item.status !== "completed" && itemHasUncertainExternalEffect(item))
      .map((item) => item.id),
  );
  const lanes = job.profileLanePool.lanes.map((lane) => ({
    ...lane,
    state: "cancelled" as const,
    reconciliationItemIds: Array.from(
      new Set([
        ...(lane.reconciliationItemIds ?? []),
        ...lane.itemIds.filter((itemId) => uncertain.has(itemId)),
      ]),
    ),
  }));
  return {
    ...job,
    profileLanePool: { ...job.profileLanePool, lanes },
    itemOrchestration: job.itemOrchestration
      ? { ...job.itemOrchestration, claims: [] }
      : job.itemOrchestration,
  } satisfies PersistentPluginJob;
}

/**
 * Rebuilds transient lane state from durable work items after a process restart.
 * No in-memory lane/session state is trusted. Safe interrupted leases return to
 * pending; submitted/awaiting effects stay untouched and block their lane until
 * explicit reconciliation.
 */
export function recoverProfileLanePool(job: PersistentPluginJob, now = new Date()) {
  if (!job.profileLanePool || job.cancelRequested || job.status === "cancel_requested") return job;
  const timestamp = now.toISOString();
  const orchestration = job.itemOrchestration;
  if (!orchestration?.workItems?.length) return job;
  const claimedIds = new Set((orchestration.claims ?? []).map((claim) => claim.itemId));
  const recoverItem = (item: (typeof orchestration.workItems)[number]) =>
    claimedIds.has(item.id) ? resetInterruptedUnsubmittedItem(item, timestamp) : item;
  const workItems = orchestration.workItems.map(recoverItem);
  const registeredItems = (job.registeredItems ?? []).map((item) =>
    claimedIds.has(item.id) ? resetInterruptedUnsubmittedItem(item, timestamp) : item,
  );
  const byId = new Map(workItems.map((item) => [item.id, item] as const));
  const lanes = job.profileLanePool.lanes.map((lane) => {
    const uncertainIds = Array.from(
      new Set([
        ...(lane.reconciliationItemIds ?? []),
        ...lane.itemIds.filter((itemId) => {
          const item = byId.get(itemId);
          return Boolean(
            item &&
            item.status !== "completed" &&
            item.status !== "cancelled" &&
            itemHasUncertainExternalEffect(item),
          );
        }),
      ]),
    );
    const nonTerminal = lane.itemIds.some((itemId) => {
      const item = byId.get(itemId);
      return item && item.status !== "completed" && item.status !== "cancelled";
    });
    const state =
      lane.state === "failed"
        ? ("failed" as const)
        : uncertainIds.length
          ? ("reconciliation_required" as const)
          : nonTerminal
            ? ("planned" as const)
            : ("completed" as const);
    return {
      ...lane,
      state,
      reconciliationItemIds: uncertainIds,
      ...(uncertainIds.length && lane.state !== "failed"
        ? {
            attempts: [
              ...(lane.attempts ?? []),
              {
                attempt: job.attempt,
                invocationId: "process-restart",
                state: "reconciliation_required" as const,
                at: timestamp,
                itemId: uncertainIds[0],
                itemState: byId.get(uncertainIds[0]!)?.durableState,
                reasonCode: "PROCESS_RESTARTED",
              },
            ],
          }
        : {}),
    };
  });
  return {
    ...job,
    registeredItems,
    itemOrchestration: { ...orchestration, workItems, claims: [] },
    profileLanePool: { ...job.profileLanePool, lanes },
  } satisfies PersistentPluginJob;
}

export function supportsProfileLanePool(job: PersistentPluginJob, capability: PluginCapability) {
  return profileParallelEligibility(job, capability).eligible;
}

export function materializeProfileLanePool(
  job: PersistentPluginJob,
  capability: PluginCapability,
): ProfileLanePoolSnapshot | undefined {
  if (!supportsProfileLanePool(job, capability)) return undefined;
  const policy = job.profileExecution!;
  const declaration = capability.execution.itemOrchestration!.profileParallelism!;
  const selectedLimit = policy.maxParallel ?? policy.profiles.length;
  const declaredLimit = declaration.maxProfiles ?? policy.profiles.length;
  const capabilityLimit = capability.execution.maxConcurrency ?? policy.profiles.length;
  const maxParallel = Math.max(
    1,
    Math.min(policy.profiles.length, selectedLimit, declaredLimit, capabilityLimit),
  );
  const profiles = policy.profiles.slice(0, maxParallel);
  const itemIds = (job.itemOrchestration?.workItems ?? [])
    .filter((item) => item.status !== "completed" && item.status !== "cancelled")
    .sort((left, right) => left.order - right.order)
    .map((item) => item.id);
  const partitions = profiles.map(() => [] as string[]);
  itemIds.forEach((itemId, index) => partitions[index % profiles.length]!.push(itemId));
  return {
    mode: "parallel",
    maxParallel,
    lanes: profiles.map((profile, index) => ({
      laneId: `${job.id}:lane:${index + 1}`,
      profileId: profile.profileId,
      alias: profile.alias,
      itemIds: partitions[index]!,
      state: "planned",
    })),
  };
}

export async function runProfileLanePool<T>(input: {
  pool: ProfileLanePoolSnapshot;
  acquireLease: (lane: ProfileLaneSnapshot) => Promise<ProfileLaneLease | undefined>;
  invokeContinuousLane: (lane: ProfileLaneSnapshot) => Promise<T>;
}) {
  const leased: Array<{ lane: ProfileLaneSnapshot; lease: ProfileLaneLease }> = [];
  for (const lane of input.pool.lanes) {
    if (!lane.itemIds.length || lane.state !== "planned") continue;
    const lease = await input.acquireLease(lane);
    if (!lease) continue;
    leased.push({ lane: { ...lane, state: "leased" }, lease });
  }

  const results = await Promise.all(
    leased.map(async ({ lane, lease }) => {
      try {
        const value = await input.invokeContinuousLane({ ...lane, state: "running" });
        return { lane: { ...lane, state: "completed" as const }, value };
      } catch (error) {
        return { lane: { ...lane, state: "failed" as const }, error };
      } finally {
        await lease.release();
      }
    }),
  );

  const byLane = new Map(results.map((result) => [result.lane.laneId, result.lane] as const));
  return {
    pool: {
      ...input.pool,
      lanes: input.pool.lanes.map((lane) => byLane.get(lane.laneId) ?? lane),
    } satisfies ProfileLanePoolSnapshot,
    results,
  };
}
