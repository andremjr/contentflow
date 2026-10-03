import { invalidateBlockDeliveries } from "../deliveries";
import type { ProcessExecution, ProcessMethod } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";
import { synchronizeExecutionMethod } from "./synchronize-method";
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
    const changed =
      JSON.stringify(block) !==
      JSON.stringify(currentMethod.blocks.find((candidate) => candidate.id === block.id));
    try {
      synchronizeExecutionMethod(execution, currentMethod, now);
    } catch {
      return { ok: false, outcome: "blocked", reason: "malformed_state" };
    }
    if (fact.scope === "all" && changed) blockExecution.items = undefined;
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

  // A cancellation marks the unfinished suffix as cancelled. Retrying a block
  // reopens that suffix as the next executable queue, otherwise successful
  // completion of the retried block is rejected by the state machine because
  // the following block is no longer pending.
  for (let index = retryBlockIndex + 1; index < execution.blocks.length; index += 1) {
    const suffixBlock = execution.blocks[index];
    suffixBlock.status = "pending";
    suffixBlock.values = {};
    // Give every reopened suffix block a fresh attempt identity. Older jobs
    // for this execution must remain historical and must never be mistaken
    // for the newly reopened work.
    suffixBlock.attempt = (suffixBlock.attempt ?? 1) + 1;
    suffixBlock.error = undefined;
    suffixBlock.jobId = undefined;
    suffixBlock.traceId = undefined;
    suffixBlock.completedAt = undefined;
    suffixBlock.progress = undefined;
    suffixBlock.progressMessage = undefined;
    suffixBlock.itemProgress = undefined;
    suffixBlock.profileLaneProgress = undefined;
    suffixBlock.items = undefined;
    suffixBlock.itemRetryScope = undefined;
    suffixBlock.itemRetryId = undefined;
    suffixBlock.pluginConversation = undefined;
  }

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
