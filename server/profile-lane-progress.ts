import type { BlockExecutionItem } from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";
import { requiredOrchestratedItems } from "./plugin-item-orchestration";

export type ProfileLaneUnitCounts = {
  total: number;
  completed: number;
  active: number;
  pending: number;
  failed: number;
};

export type ProfileLaneProgressDiagnostic = {
  laneId: string;
  profileId: string;
  state: NonNullable<PersistentPluginJob["profileLanePool"]>["lanes"][number]["state"];
  counts: ProfileLaneUnitCounts;
  reconciliationRequired: number;
  reasonCode?: string;
};

function unitCounts(items: readonly BlockExecutionItem[]): ProfileLaneUnitCounts {
  let completed = 0;
  let active = 0;
  let pending = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "completed") {
      completed += 1;
      continue;
    }
    if (item.status === "failed") {
      failed += 1;
      continue;
    }
    if (
      item.status === "in_progress" ||
      item.durableState === "leased" ||
      item.durableState === "submitted" ||
      item.durableState === "awaiting_result" ||
      item.durableState === "awaiting_human"
    ) {
      active += 1;
      continue;
    }
    if (
      item.status === "pending" ||
      item.durableState === undefined ||
      item.durableState === "planned" ||
      item.durableState === "pending"
    ) {
      pending += 1;
    }
  }
  return { total: items.length, completed, active, pending, failed };
}

function rootIdFor(item: BlockExecutionItem, byId: Map<string, BlockExecutionItem>) {
  let current = item;
  const visited = new Set<string>();
  while (current.parentItemId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parentItemId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/** Builds progress only from core-owned work-unit state and opaque profile IDs. */
export function profileLaneProgressForJob(job: PersistentPluginJob) {
  const pool = job.profileLanePool;
  if (!pool) return undefined;
  const requiredItems = requiredOrchestratedItems(job);
  const allItems = [...(job.itemOrchestration?.workItems ?? []), ...(job.registeredItems ?? [])];
  const byId = new Map(allItems.map((item) => [item.id, item] as const));
  const lanes = pool.lanes.map((lane) => {
    const ownedRoots = new Set(lane.itemIds);
    const items = requiredItems.filter(
      (item) => ownedRoots.has(item.id) || ownedRoots.has(rootIdFor(item, byId)),
    );
    return {
      laneId: lane.laneId,
      profileId: lane.profileId,
      state: lane.state,
      counts: unitCounts(items),
      reconciliationRequired: lane.reconciliationItemIds?.length ?? 0,
      ...(lane.attempts?.at(-1)?.reasonCode
        ? { reasonCode: lane.attempts.at(-1)!.reasonCode }
        : {}),
    } satisfies ProfileLaneProgressDiagnostic;
  });
  const counts = unitCounts(requiredItems);
  return {
    counts,
    complete: counts.total > 0 && counts.completed === counts.total,
    lanes,
  };
}
