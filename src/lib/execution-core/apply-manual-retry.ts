import { invalidateBlockDeliveries } from "../deliveries";
import type { ProcessExecution } from "../domain";
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

  blockExecution.attempt = (blockExecution.attempt ?? 1) + 1;
  invalidateBlockDeliveries(execution, [fact.blockId], now);
  blockExecution.error = undefined;
  blockExecution.pluginConversation = undefined;
  blockExecution.jobId = undefined;
  blockExecution.traceId = undefined;
  blockExecution.itemRetryScope = fact.scope;
  blockExecution.itemRetryId = fact.scope === "selected" ? fact.itemId : undefined;
  blockExecution.completedAt = undefined;
  if (fact.scope === "all") {
    blockExecution.values = {};
    blockExecution.itemProgress = undefined;
    blockExecution.progress = undefined;
  } else if (blockExecution.itemProgress?.total) {
    blockExecution.progress =
      blockExecution.itemProgress.completed / blockExecution.itemProgress.total;
  }
  blockExecution.progressMessage = undefined;

  const retryStatus =
    block.operator === "Humano" && !block.plugin ? "awaiting_human" : "blocked_executor";
  blockExecution.status = retryStatus;
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
