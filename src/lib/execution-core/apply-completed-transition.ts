import type { ProcessExecution, ProcessOutput, RuntimeValue } from "../domain";
import { evaluateExecutionCore } from "./evaluate";
import type { ExecutionCoreDecision, ExecutionCoreInvariantViolation } from "./types";

type TransitionDependencies = {
  deriveProcessOutput: (execution: ProcessExecution) => ProcessOutput | undefined;
  recordProcessOutputDelivery: (
    execution: ProcessExecution,
    values: Record<string, RuntimeValue>,
    now: string,
  ) => unknown;
};

export type ApplyCompletedBlockTransitionResult =
  | {
      ok: true;
      outcome: "activate_block";
      decision: Extract<ExecutionCoreDecision, { type: "activate_block" }>;
    }
  | {
      ok: true;
      outcome: "finish_blocks";
      decision: Extract<ExecutionCoreDecision, { type: "finish_blocks" }>;
    }
  | {
      ok: false;
      outcome: "blocked";
      decision: Extract<ExecutionCoreDecision, { type: "blocked" }>;
      diagnostics: ExecutionCoreInvariantViolation[];
    };

/**
 * Mutates only ProcessExecution state after a block is already completed.
 * Project projection, persistence and executor scheduling stay with adapters.
 */
export function applyCompletedBlockTransition(
  execution: ProcessExecution,
  blockId: string,
  now: string,
  dependencies: TransitionDependencies,
): ApplyCompletedBlockTransitionResult {
  const transition = evaluateExecutionCore(execution, {
    type: "block_completed",
    blockId,
  });

  if (transition.decision.type === "blocked") {
    return {
      ok: false,
      outcome: "blocked",
      decision: transition.decision,
      diagnostics: transition.diagnostics,
    };
  }

  if (transition.decision.type === "activate_block") {
    const nextExecution = execution.blocks[transition.decision.blockIndex];
    nextExecution.startedAt = now;
    nextExecution.attempt = Math.max(1, nextExecution.attempt ?? 1);
    nextExecution.error = undefined;
    nextExecution.status = transition.decision.blockStatus;
    execution.status = transition.decision.executionStatus;
    return {
      ok: true,
      outcome: "activate_block",
      decision: transition.decision,
    };
  }

  if (transition.decision.type !== "finish_blocks") {
    throw new Error(`Unexpected completed block decision: ${transition.decision.type}`);
  }

  const output = dependencies.deriveProcessOutput(execution);
  if (output) {
    execution.output = { ...output, createdAt: now };
    dependencies.recordProcessOutputDelivery(execution, execution.output.values, now);
    execution.outputStatus = "completed";
    execution.status = "completed";
  } else {
    execution.outputStatus = "awaiting_human";
    execution.status = "awaiting_output";
  }
  return {
    ok: true,
    outcome: "finish_blocks",
    decision: transition.decision,
  };
}
