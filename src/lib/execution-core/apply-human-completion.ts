import type { ProcessExecution } from "../domain";
import { evaluateExecutionCore } from "./evaluate";
import type {
  ExecutionCoreDecision,
  ExecutionCoreFact,
  ExecutionCoreInvariantViolation,
} from "./types";

export type HumanBlockCompletedFact = Extract<ExecutionCoreFact, { type: "human_block_completed" }>;

export type ApplyHumanBlockCompletionResult =
  | {
      ok: true;
      outcome: "completed";
      decision: Extract<ExecutionCoreDecision, { type: "complete_human_block" }>;
    }
  | {
      ok: false;
      outcome: "blocked";
      decision: Extract<ExecutionCoreDecision, { type: "blocked" }>;
      diagnostics: ExecutionCoreInvariantViolation[];
    };

/**
 * Mutates only the accepted BlockExecution completion.
 * Input resolution, form/output validation, deliveries and progression stay with adapters.
 */
export function applyHumanBlockCompletion(
  execution: ProcessExecution,
  fact: HumanBlockCompletedFact,
): ApplyHumanBlockCompletionResult {
  const transition = evaluateExecutionCore(execution, fact);
  if (transition.decision.type === "blocked") {
    return {
      ok: false,
      outcome: "blocked",
      decision: transition.decision,
      diagnostics: transition.diagnostics,
    };
  }
  if (transition.decision.type !== "complete_human_block") {
    throw new Error(`Unexpected human completion decision: ${transition.decision.type}`);
  }

  const values = structuredClone(fact.values);
  const blockExecution = execution.blocks[transition.decision.blockIndex];
  blockExecution.values = values;
  blockExecution.status = "completed";
  blockExecution.completedAt = fact.now;
  return {
    ok: true,
    outcome: "completed",
    decision: transition.decision,
  };
}
