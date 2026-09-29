import type { ProcessExecution } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";
import type { CurrentBlockDeliveryAcceptedFact } from "./types";

export type ApplyCurrentBlockDeliveryAcceptanceResult =
  | {
      ok: true;
      outcome: "completed";
      blockId: string;
    }
  | {
      ok: false;
      outcome: "blocked";
      reason:
        | "unknown_delivery_block"
        | "block_not_accepting_current_delivery"
        | "unsupported_delivery_acceptance"
        | "malformed_state";
    };

/**
 * Promotes values already persisted for a failed or cancelled BlockExecution.
 * Content validation, deliveries, progression, Project projection and persistence stay with adapters.
 */
export function applyCurrentBlockDeliveryAcceptance(
  execution: ProcessExecution,
  fact: CurrentBlockDeliveryAcceptedFact,
): ApplyCurrentBlockDeliveryAcceptanceResult {
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
    return { ok: false, outcome: "blocked", reason: "unknown_delivery_block" };
  }

  if (block.type === "ESCOLHER" || block.type === "VALIDAR") {
    return { ok: false, outcome: "blocked", reason: "unsupported_delivery_acceptance" };
  }
  if (blockExecution.status !== "failed" && blockExecution.status !== "cancelled") {
    return {
      ok: false,
      outcome: "blocked",
      reason: "block_not_accepting_current_delivery",
    };
  }

  blockExecution.status = "completed";
  blockExecution.completedAt = fact.now;
  blockExecution.error = undefined;
  blockExecution.progress = 1;
  blockExecution.progressMessage = undefined;
  blockExecution.itemProgress = undefined;
  blockExecution.itemRetryScope = undefined;
  blockExecution.itemRetryId = undefined;
  execution.error = undefined;

  return { ok: true, outcome: "completed", blockId: fact.blockId };
}
