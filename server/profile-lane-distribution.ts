import type { PluginWorkItemUpdate } from "../src/lib/plugin-contract";
import type { BlockExecutionItem, StoredFile } from "../src/lib/domain";
import type { PluginJobStore, PersistentPluginJob } from "./plugin-job-store";
import { claimOrchestratedItems, publishOrchestratedItemUpdate } from "./plugin-item-orchestration";

function laneFor(job: PersistentPluginJob, laneId: string) {
  const lane = job.profileLanePool?.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) throw new Error("A lane informada não pertence ao pool persistido deste job.");
  return lane;
}

const SAFE_LANE_REASON = /^[A-Z0-9_]{1,96}$/;

function resetUnsubmittedItem(item: BlockExecutionItem, now: string, reasonCode: string) {
  const eligible =
    item.status === "pending" ||
    (item.status === "in_progress" &&
      (item.durableState === undefined ||
        item.durableState === "planned" ||
        item.durableState === "pending" ||
        item.durableState === "leased") &&
      item.output === undefined &&
      item.externalReceipt === undefined);
  if (!eligible) return item;
  const attempts = item.attempts.map((attempt) =>
    attempt.attempt === item.attempt && attempt.status === "in_progress"
      ? { ...attempt, status: "failed" as const, completedAt: now, error: reasonCode }
      : attempt,
  );
  return {
    ...item,
    status: "pending" as const,
    durableState: "pending" as const,
    attempt: item.status === "in_progress" ? item.attempt + 1 : item.attempt,
    error: undefined,
    attempts,
  };
}

function redistributeItemIds(
  lanes: NonNullable<PersistentPluginJob["profileLanePool"]>["lanes"],
  failedLaneId: string,
  itemIds: string[],
) {
  const healthy = lanes.filter(
    (candidate) =>
      candidate.laneId !== failedLaneId &&
      candidate.state !== "failed" &&
      candidate.state !== "cancelled" &&
      candidate.state !== "reconciliation_required",
  );
  if (!healthy.length) return lanes;
  const assignments = new Map<string, string[]>(
    healthy.map((lane) => [lane.laneId, [...lane.itemIds]]),
  );
  itemIds.forEach((itemId, index) =>
    assignments.get(healthy[index % healthy.length]!.laneId)!.push(itemId),
  );
  const redistributed = new Set(itemIds);
  return lanes.map((candidate) =>
    candidate.laneId === failedLaneId
      ? { ...candidate, itemIds: candidate.itemIds.filter((itemId) => !redistributed.has(itemId)) }
      : assignments.has(candidate.laneId)
        ? {
            ...candidate,
            itemIds: assignments.get(candidate.laneId)!,
            state:
              itemIds.length > 0 && candidate.state === "completed"
                ? ("planned" as const)
                : candidate.state,
          }
        : candidate,
  );
}

/**
 * Concede no máximo uma unidade por vez para a lane. A mesma invocação contínua
 * pode chamar esta função repetidamente; o próximo item só fica elegível depois
 * que o anterior sair da lista de claims por um commit terminal.
 */
export function claimNextProfileLaneItem(input: {
  store: PluginJobStore;
  jobId: string;
  laneId: string;
  invocationId: string;
  limit?: number;
  expiresAt: string;
  now?: string;
}) {
  return input.store.mutateActiveJobAtomically(input.jobId, (job) => {
    const lane = laneFor(job, input.laneId);
    if (
      job.cancelRequested ||
      lane.state === "failed" ||
      lane.state === "cancelled" ||
      lane.state === "reconciliation_required"
    ) {
      return { job, value: [] };
    }
    const activeLaneClaim = (job.itemOrchestration?.claims ?? []).some(
      (claim) =>
        claim.invocationId === input.invocationId &&
        claim.profileId === lane.profileId &&
        lane.itemIds.includes(claim.itemId),
    );
    if (activeLaneClaim) return { job, value: [] };

    const claimed = claimOrchestratedItems({
      job,
      limit: Math.max(1, Math.floor(input.limit ?? 1)),
      invocationId: input.invocationId,
      profileId: lane.profileId,
      allowedItemIds: lane.itemIds,
      expiresAt: input.expiresAt,
      now: input.now,
    });
    const claimedIds = new Set(claimed.claimed.map((item) => item.itemId));
    const profileLanePool = job.profileLanePool
      ? {
          ...job.profileLanePool,
          lanes: job.profileLanePool.lanes.map((candidate) =>
            candidate.laneId === lane.laneId && claimedIds.size
              ? { ...candidate, state: "running" as const }
              : candidate,
          ),
        }
      : undefined;
    return {
      job: { ...claimed.job, profileLanePool },
      value: claimed.claimed,
    };
  });
}

export function failProfileLane(input: {
  store: PluginJobStore;
  jobId: string;
  laneId: string;
  invocationId: string;
  reasonCode: string;
  now?: string;
}) {
  if (!SAFE_LANE_REASON.test(input.reasonCode)) {
    throw new Error("O código de falha da lane é inválido.");
  }
  return input.store.mutateActiveJobAtomically(input.jobId, (job) => {
    const lane = laneFor(job, input.laneId);
    const orchestration = job.itemOrchestration;
    const now = input.now ?? new Date().toISOString();
    const ownedClaims = (orchestration?.claims ?? []).filter(
      (claim) =>
        claim.invocationId === input.invocationId &&
        claim.profileId === lane.profileId &&
        lane.itemIds.includes(claim.itemId),
    );
    const claimedIds = new Set(ownedClaims.map((claim) => claim.itemId));
    const byId = new Map((orchestration?.workItems ?? []).map((item) => [item.id, item] as const));
    const releasedIds: string[] = [];
    const reconciliationIds: string[] = [];
    for (const itemId of lane.itemIds) {
      const item = byId.get(itemId);
      if (!item) continue;
      const uncertain =
        claimedIds.has(itemId) &&
        (item.durableState === "submitted" ||
          item.durableState === "awaiting_result" ||
          item.durableState === "awaiting_human");
      if (uncertain) reconciliationIds.push(itemId);
      else if (
        item.status === "pending" ||
        (claimedIds.has(itemId) &&
          (item.durableState === undefined ||
            item.durableState === "planned" ||
            item.durableState === "pending" ||
            item.durableState === "leased"))
      ) {
        releasedIds.push(itemId);
      }
    }
    const released = new Set(releasedIds);
    const reset = (item: BlockExecutionItem) =>
      released.has(item.id) ? resetUnsubmittedItem(item, now, input.reasonCode) : item;
    const workItems = (orchestration?.workItems ?? []).map(reset);
    const registeredItems = (job.registeredItems ?? []).map(reset);
    const activeItem = ownedClaims.length ? byId.get(ownedClaims[0]!.itemId) : undefined;
    const attempts = [
      ...(lane.attempts ?? []),
      {
        attempt: job.attempt,
        invocationId: input.invocationId,
        state: reconciliationIds.length
          ? ("reconciliation_required" as const)
          : ("failed" as const),
        at: now,
        ...(activeItem ? { itemId: activeItem.id, itemState: activeItem.durableState } : {}),
        reasonCode: input.reasonCode,
      },
    ];
    let lanes = (job.profileLanePool?.lanes ?? []).map((candidate) =>
      candidate.laneId === lane.laneId
        ? {
            ...candidate,
            state: "failed" as const,
            attempts,
            reconciliationItemIds: reconciliationIds,
          }
        : candidate,
    );
    lanes = redistributeItemIds(lanes, lane.laneId, releasedIds);
    return {
      job: {
        ...job,
        registeredItems,
        itemOrchestration: orchestration
          ? {
              ...orchestration,
              workItems,
              claims: (orchestration.claims ?? []).filter(
                (claim) => claim.invocationId !== input.invocationId,
              ),
            }
          : orchestration,
        profileLanePool: job.profileLanePool ? { ...job.profileLanePool, lanes } : undefined,
      },
      value: { releasedItemIds: releasedIds, reconciliationItemIds: reconciliationIds },
    };
  });
}

/** Finaliza uma invocação saudável sem esconder unidades que o adapter deixou pendentes. */
export function completeProfileLaneInvocation(input: {
  store: PluginJobStore;
  jobId: string;
  laneId: string;
  invocationId: string;
}) {
  return input.store.mutateActiveJobAtomically(input.jobId, (job) => {
    const lane = laneFor(job, input.laneId);
    const remaining = (job.itemOrchestration?.workItems ?? []).some(
      (item) =>
        lane.itemIds.includes(item.id) &&
        item.status !== "completed" &&
        item.status !== "cancelled",
    );
    const claims = job.itemOrchestration?.claims ?? [];
    const activeClaim = claims.some((claim) => claim.invocationId === input.invocationId);
    if (activeClaim) {
      return { job, value: { complete: false, remaining: true, activeClaim: true } };
    }
    const profileLanePool = job.profileLanePool
      ? {
          ...job.profileLanePool,
          lanes: job.profileLanePool.lanes.map((candidate) =>
            candidate.laneId === lane.laneId
              ? {
                  ...candidate,
                  state: !remaining && !activeClaim ? ("completed" as const) : ("planned" as const),
                }
              : candidate,
          ),
        }
      : undefined;
    return {
      job: {
        ...job,
        profileLanePool,
        itemOrchestration: job.itemOrchestration,
      },
      value: { complete: !remaining && !activeClaim, remaining, activeClaim },
    };
  });
}

export function reconcileProfileLaneItemForRetry(input: {
  store: PluginJobStore;
  jobId: string;
  laneId: string;
  itemId: string;
  reasonCode: string;
  now?: string;
}) {
  if (!SAFE_LANE_REASON.test(input.reasonCode)) {
    throw new Error("O código de reconciliação da lane é inválido.");
  }
  return input.store.mutateActiveJobAtomically(input.jobId, (job) => {
    const lane = laneFor(job, input.laneId);
    if (!(lane.reconciliationItemIds ?? []).includes(input.itemId)) {
      throw new Error("O item não está aguardando reconciliação nesta lane.");
    }
    const now = input.now ?? new Date().toISOString();
    const workItem = job.itemOrchestration?.workItems?.find((item) => item.id === input.itemId);
    if (!workItem) throw new Error("O item reconciliado não existe mais.");
    const resetItem = (item: BlockExecutionItem) =>
      item.id === input.itemId
        ? resetUnsubmittedItem(
            { ...item, durableState: "leased", externalReceipt: undefined },
            now,
            input.reasonCode,
          )
        : item;
    const workItems = (job.itemOrchestration?.workItems ?? []).map(resetItem);
    const registeredItems = (job.registeredItems ?? []).map(resetItem);
    const remaining = (lane.reconciliationItemIds ?? []).filter(
      (itemId) => itemId !== input.itemId,
    );
    const attempts = [
      ...(lane.attempts ?? []),
      {
        attempt: job.attempt,
        invocationId: lane.attempts?.at(-1)?.invocationId ?? "reconciliation",
        state: "reconciled" as const,
        at: now,
        itemId: input.itemId,
        itemState: workItem.durableState,
        reasonCode: input.reasonCode,
      },
    ];
    let lanes = (job.profileLanePool?.lanes ?? []).map((candidate) =>
      candidate.laneId === lane.laneId
        ? {
            ...candidate,
            reconciliationItemIds: remaining,
            attempts,
            state:
              candidate.state === "reconciliation_required" && !remaining.length
                ? ("planned" as const)
                : candidate.state,
          }
        : candidate,
    );
    lanes = redistributeItemIds(lanes, lane.laneId, [input.itemId]);
    return {
      job: {
        ...job,
        registeredItems,
        itemOrchestration: job.itemOrchestration
          ? { ...job.itemOrchestration, workItems }
          : job.itemOrchestration,
        profileLanePool: job.profileLanePool ? { ...job.profileLanePool, lanes } : undefined,
      },
      value: { itemId: input.itemId, redistributed: true },
    };
  });
}

/** Confirma uma atualização dentro da mesma transação que libera a concessão terminal. */
export function commitProfileLaneItemUpdate(input: {
  store: PluginJobStore;
  jobId: string;
  laneId: string;
  invocationId: string;
  update: PluginWorkItemUpdate;
  storedArtifacts?: StoredFile[];
  now?: string;
}) {
  return input.store.mutateActiveJobAtomically(input.jobId, (job) => {
    const lane = laneFor(job, input.laneId);
    if (!lane.itemIds.includes(input.update.itemId)) {
      throw new Error("O item não pertence à partição desta lane.");
    }
    const claim = (job.itemOrchestration?.claims ?? []).find(
      (candidate) =>
        candidate.itemId === input.update.itemId &&
        candidate.invocationId === input.invocationId &&
        candidate.profileId === lane.profileId,
    );
    if (!claim) throw new Error("A lane não possui concessão ativa para este item.");

    const published = publishOrchestratedItemUpdate({
      job,
      invocationId: input.invocationId,
      update: input.update,
      storedArtifacts: input.storedArtifacts,
      now: input.now,
    });
    const terminal = ["completed", "failed", "cancelled"].includes(input.update.state);
    const remaining = published.job.itemOrchestration?.workItems?.some(
      (item) =>
        lane.itemIds.includes(item.id) &&
        item.status !== "completed" &&
        item.status !== "cancelled",
    );
    const profileLanePool = published.job.profileLanePool
      ? {
          ...published.job.profileLanePool,
          lanes: published.job.profileLanePool.lanes.map((candidate) =>
            candidate.laneId === lane.laneId
              ? {
                  ...candidate,
                  state: terminal && !remaining ? ("completed" as const) : ("running" as const),
                }
              : candidate,
          ),
        }
      : undefined;
    return {
      job: { ...published.job, profileLanePool },
      value: published.receipt,
    };
  });
}
