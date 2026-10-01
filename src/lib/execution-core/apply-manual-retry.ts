import { invalidateBlockDeliveries } from "../deliveries";
import type { ProcessExecution, ProcessMethod } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";
import type { ManualBlockRetryRequestedFact } from "./types";

export type ApplyManualBlockRetryResult =
  | {
      ok: true;
      outcome: "retried";
      blockId: string;
      blockStatus: "awaiting_human" | "blocked_executor";
      executionStatus: "awaiting_human" | "blocked_executor";
    }
  | {
      ok: false;
      outcome: "blocked";
      reason:
        "unknown_retry_block" | "block_not_retryable" | "selected_item_missing" | "malformed_state";
    };

/**
 * Applies an explicit user-requested Block retry to ProcessExecution state.
 * Project projection, persistence and executor scheduling stay with adapters.
 */
export function applyManualBlockRetry(
  execution: ProcessExecution,
  fact: ManualBlockRetryRequestedFact,
  now: string,
  currentMethod?: ProcessMethod,
  channelDefinitionRevision?: number,
): ApplyManualBlockRetryResult {
  const diagnostics = validateExecutionCoreInvariants(execution);
  if (diagnostics.length) {
    return { ok: false, outcome: "blocked", reason: "malformed_state" };
  }

  const blockIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === fact.blockId,
  );
  const block = execution.methodSnapshot.blocks[blockIndex];
  const blockExecution = execution.blocks[blockIndex];
  if (!block || !blockExecution || blockExecution.blockId !== fact.blockId) {
    return { ok: false, outcome: "blocked", reason: "unknown_retry_block" };
  }

  const retryable =
    blockExecution.status === "failed" ||
    blockExecution.status === "cancelled" ||
    (blockExecution.status === "completed" && fact.scope === "selected");
  if (!retryable) {
    return { ok: false, outcome: "blocked", reason: "block_not_retryable" };
  }

  if (
    fact.scope === "selected" &&
    (!fact.itemId || !blockExecution.items?.some((item) => item.id === fact.itemId))
  ) {
    return { ok: false, outcome: "blocked", reason: "selected_item_missing" };
  }

  if (currentMethod) {
    const rebased = rebaseMethodSuffix(
      execution,
      fact.blockId,
      fact.scope,
      currentMethod,
      now,
      channelDefinitionRevision,
    );
    if (!rebased) return { ok: false, outcome: "blocked", reason: "malformed_state" };
  }

  const retryBlockIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === fact.blockId,
  );
  const retryBlock = execution.methodSnapshot.blocks[retryBlockIndex];
  const retryBlockExecution = execution.blocks[retryBlockIndex];
  if (!retryBlock || !retryBlockExecution) {
    return { ok: false, outcome: "blocked", reason: "malformed_state" };
  }

  retryBlockExecution.attempt = (retryBlockExecution.attempt ?? 1) + 1;
  invalidateBlockDeliveries(
    execution,
    execution.methodSnapshot.blocks.slice(retryBlockIndex).map((candidate) => candidate.id),
    now,
  );
  retryBlockExecution.error = undefined;
  retryBlockExecution.pluginConversation = undefined;
  retryBlockExecution.jobId = undefined;
  retryBlockExecution.traceId = undefined;
  retryBlockExecution.itemRetryScope = fact.scope;
  retryBlockExecution.itemRetryId = fact.scope === "selected" ? fact.itemId : undefined;
  retryBlockExecution.completedAt = undefined;
  if (fact.scope === "all") {
    retryBlockExecution.values = {};
    retryBlockExecution.itemProgress = undefined;
    retryBlockExecution.progress = undefined;
  } else if (retryBlockExecution.itemProgress?.total) {
    retryBlockExecution.progress =
      retryBlockExecution.itemProgress.completed / retryBlockExecution.itemProgress.total;
  }
  retryBlockExecution.progressMessage = undefined;

  const retryStatus =
    retryBlock.operator === "Humano" && !retryBlock.plugin ? "awaiting_human" : "blocked_executor";
  retryBlockExecution.status = retryStatus;
  execution.error = undefined;
  execution.status = retryStatus;

  return {
    ok: true,
    outcome: "retried",
    blockId: fact.blockId,
    blockStatus: retryStatus,
    executionStatus: retryStatus,
  };
}

function rebaseMethodSuffix(
  execution: ProcessExecution,
  blockId: string,
  scope: ManualBlockRetryRequestedFact["scope"],
  currentMethod: ProcessMethod,
  now: string,
  channelDefinitionRevision?: number,
) {
  if (
    currentMethod.contractVersion !== 3 ||
    currentMethod.processType !== execution.processType ||
    currentMethod.blocks.length === 0
  ) {
    return false;
  }
  const oldIndex = execution.methodSnapshot.blocks.findIndex((block) => block.id === blockId);
  const currentIndex = currentMethod.blocks.findIndex((block) => block.id === blockId);
  if (oldIndex < 0 || currentIndex < 0) return false;

  const oldTarget = execution.methodSnapshot.blocks[oldIndex];
  const currentTarget = currentMethod.blocks[currentIndex];
  if (scope !== "all" && JSON.stringify(oldTarget) !== JSON.stringify(currentTarget)) return false;

  const prefixDefinitions = execution.methodSnapshot.blocks.slice(0, oldIndex);
  const suffixDefinitions = structuredClone(currentMethod.blocks.slice(currentIndex));
  const composedBlocks = [...structuredClone(prefixDefinitions), ...suffixDefinitions].map(
    (block, order) => ({ ...block, order }),
  );
  if (new Set(composedBlocks.map((block) => block.id)).size !== composedBlocks.length) return false;

  const previousMethod = structuredClone(execution.methodSnapshot);
  const previousSuffixIds = previousMethod.blocks.slice(oldIndex).map((block) => block.id);
  const oldTargetExecution = structuredClone(execution.blocks[oldIndex]);
  const methodSnapshot: ProcessMethod = {
    contractVersion: 3,
    name: currentMethod.name,
    imageUrl: currentMethod.imageUrl,
    processType: execution.processType,
    blocks: composedBlocks,
  };
  if (JSON.stringify(methodSnapshot) === JSON.stringify(execution.methodSnapshot)) return true;
  const methodSnapshotHistory = [
    ...(execution.methodSnapshotHistory ?? []),
    {
      method: previousMethod,
      replacedAt: now,
      fromBlockId: blockId,
      ...(channelDefinitionRevision === undefined ? {} : { channelDefinitionRevision }),
    },
  ];
  const blocks: ProcessExecution["blocks"] = [
    ...execution.blocks.slice(0, oldIndex),
    {
      ...oldTargetExecution,
      blockId,
      status: "pending" as const,
      error: undefined,
      jobId: undefined,
      traceId: undefined,
      completedAt: undefined,
      ...(JSON.stringify(oldTarget) === JSON.stringify(currentTarget) ? {} : { items: undefined }),
    },
    ...composedBlocks.slice(oldIndex + 1).map((block) => ({
      blockId: block.id,
      status: "pending" as const,
      values: {},
      attempt: 1,
    })),
  ];
  const candidate: ProcessExecution = {
    ...execution,
    methodSnapshot,
    methodSnapshotHistory,
    blocks,
    output: undefined,
    outputStatus: "pending",
  };
  if (validateExecutionCoreInvariants(candidate).length > 0) return false;

  execution.methodSnapshot = methodSnapshot;
  execution.methodSnapshotHistory = methodSnapshotHistory;
  execution.blocks = blocks;
  invalidateBlockDeliveries(execution, previousSuffixIds, now);
  execution.output = undefined;
  execution.outputStatus = "pending";
  return true;
}
