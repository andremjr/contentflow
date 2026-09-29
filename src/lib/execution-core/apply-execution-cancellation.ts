import type { ProcessExecution } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";
import type { ExecutionCancellationRequestedFact } from "./types";

export type ApplyExecutionCancellationResult =
  | {
      ok: true;
      outcome: "cancelled" | "already_cancelled";
    }
  | {
      ok: false;
      outcome: "blocked";
      reason: "execution_already_completed" | "malformed_state";
    };

/**
 * Materializes only the canonical cancellation state of a ProcessExecution.
 * External cancellation, Project projection, revision, timestamps and persistence stay with adapters.
 */
export function applyExecutionCancellation(
  execution: ProcessExecution,
  _fact: ExecutionCancellationRequestedFact,
): ApplyExecutionCancellationResult {
  const diagnostics = validateExecutionCoreInvariants(execution);
  if (diagnostics.length) {
    return { ok: false, outcome: "blocked", reason: "malformed_state" };
  }

  if (execution.status === "completed") {
    return {
      ok: false,
      outcome: "blocked",
      reason: "execution_already_completed",
    };
  }
  if (execution.status === "cancelled") {
    return { ok: true, outcome: "already_cancelled" };
  }

  execution.status = "cancelled";
  execution.blocks = execution.blocks.map((block) =>
    block.status === "completed" ? block : { ...block, status: "cancelled" },
  );

  return { ok: true, outcome: "cancelled" };
}
