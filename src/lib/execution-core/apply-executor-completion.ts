import type { ProcessExecution } from "../domain";
import { evaluateExecutionCore } from "./evaluate";
import type {
  ExecutionCoreDecision,
  ExecutionCoreFact,
  ExecutionCoreInvariantViolation,
} from "./types";

export type ExecutorBlockCompletedFact = Extract<
  ExecutionCoreFact,
  { type: "executor_block_completed" }
>;

export type ApplyExecutorBlockCompletionResult =
  | {
      ok: true;
      outcome: "completed";
      decision: Extract<ExecutionCoreDecision, { type: "complete_executor_block" }>;
    }
  | {
      ok: false;
      outcome: "blocked";
      decision: Extract<ExecutionCoreDecision, { type: "blocked" }>;
      diagnostics: ExecutionCoreInvariantViolation[];
    };

/**
 * Mutates only the accepted executor BlockExecution completion.
 * Plugin response mapping, validation, deliveries, runtime metadata and progression stay with adapters.
 */
export function applyExecutorBlockCompletion(
  execution: ProcessExecution,
  fact: ExecutorBlockCompletedFact,
): ApplyExecutorBlockCompletionResult {
  const transition = evaluateExecutionCore(execution, fact);
  if (transition.decision.type === "blocked") {
    return {
      ok: false,
      outcome: "blocked",
      decision: transition.decision,
      diagnostics: transition.diagnostics,
    };
  }
  if (transition.decision.type !== "complete_executor_block") {
    throw new Error(`Unexpected executor completion decision: ${transition.decision.type}`);
  }

  const values = structuredClone(fact.values);
  const blockExecution = execution.blocks[transition.decision.blockIndex];
  blockExecution.values = values;
  blockExecution.status = "completed";
  blockExecution.completedAt = fact.now;
  blockExecution.error = undefined;
  return {
    ok: true,
    outcome: "completed",
    decision: transition.decision,
  };
}
