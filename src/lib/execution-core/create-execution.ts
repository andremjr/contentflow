import type { ProcessExecution, ProcessMethod, UniversalProcess } from "../domain";
import { evaluateExecutionCore } from "./evaluate";
import { validateExecutionCoreInvariants } from "./invariants";
import type { ExecutionCoreDiagnosticCode, ExecutionCoreInvariantViolation } from "./types";

export type CreateCanonicalProcessExecutionInput = {
  executionId: string;
  projectId: string;
  channelId: string;
  processType: UniversalProcess;
  methodSnapshot: ProcessMethod;
  now: string;
  revision?: number;
};

export type CreateCanonicalProcessExecutionResult =
  | {
      ok: true;
      execution: ProcessExecution;
    }
  | {
      ok: false;
      reason: ExecutionCoreDiagnosticCode;
      diagnostics: ExecutionCoreInvariantViolation[];
    };

export function createCanonicalProcessExecution(
  input: CreateCanonicalProcessExecutionInput,
): CreateCanonicalProcessExecutionResult {
  const methodSnapshot = structuredClone(input.methodSnapshot);
  const execution: ProcessExecution = {
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    id: input.executionId,
    projectId: input.projectId,
    channelId: input.channelId,
    processType: input.processType,
    methodSnapshot,
    blocks: methodSnapshot.blocks.map((block) => ({
      blockId: block.id,
      status: "pending",
      values: {},
      attempt: 1,
    })),
    status: "not_started",
    outputStatus: "pending",
    createdAt: input.now,
    updatedAt: input.now,
  };

  const pristineDiagnostics = validateExecutionCoreInvariants(execution);
  if (pristineDiagnostics.length) {
    return {
      ok: false,
      reason: "malformed_state",
      diagnostics: pristineDiagnostics,
    };
  }

  const transition = evaluateExecutionCore(execution, { type: "start_requested" });
  if (transition.decision.type !== "activate_block") {
    return {
      ok: false,
      reason:
        transition.decision.type === "blocked" ? transition.decision.reason : "malformed_state",
      diagnostics: transition.diagnostics,
    };
  }

  const firstExecution = execution.blocks[transition.decision.blockIndex];
  firstExecution.status = transition.decision.blockStatus;
  firstExecution.startedAt = input.now;
  execution.status = transition.decision.executionStatus;

  const activatedDiagnostics = validateExecutionCoreInvariants(execution);
  if (activatedDiagnostics.length) {
    return {
      ok: false,
      reason: "malformed_state",
      diagnostics: activatedDiagnostics,
    };
  }

  return { ok: true, execution };
}
