import {
  pluginConversationFallbackAttachments,
  pluginConversationFallbackContext,
} from "../conversation-context";
import { invalidateBlockDeliveries } from "../deliveries";
import type { ActionBlock, ProcessExecution, RuntimeValue } from "../domain";
import { attemptAfterRetryInvalidation } from "../retry-attempt";
import { validateExecutionCoreInvariants } from "./invariants";

export type ValidationOutcome =
  { decision: "approved" } | { decision: "rejected"; values: Record<string, RuntimeValue> };

export type ApplyValidationOutcomeResult =
  | { ok: true; outcome: "approved" }
  | { ok: true; outcome: "paused" }
  | {
      ok: true;
      outcome: "retry_target";
      targetBlockId: string;
      targetBlockName: string;
    }
  | {
      ok: false;
      outcome: "blocked";
      reason: "invalid_validation" | "invalid_target" | "max_attempts" | "malformed_state";
      message: string;
    };

export function validationOutcomeFromValues(
  block: ActionBlock,
  values: Record<string, RuntimeValue>,
): ValidationOutcome {
  const rejected =
    block.type === "VALIDAR" &&
    (block.outputs ?? []).some(
      (output) =>
        output.shape.kind === "control" &&
        output.shape.control === "approval" &&
        values[output.key] === "rejected",
    );
  return rejected
    ? { decision: "rejected", values: structuredClone(values) }
    : { decision: "approved" };
}

/**
 * Applies the Method snapshot's editorial VALIDAR strategy after decision values and
 * deliveries have been materialized. Project projection and persistence stay in adapters.
 */
export function applyValidationOutcome(
  execution: ProcessExecution,
  validationBlockId: string,
  outcome: ValidationOutcome,
  now: string,
): ApplyValidationOutcomeResult {
  const diagnostics = validateExecutionCoreInvariants(execution);
  if (diagnostics.length) {
    return {
      ok: false,
      outcome: "blocked",
      reason: "malformed_state",
      message: "O estado da execução é incompatível com a validação editorial.",
    };
  }

  const validationIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === validationBlockId,
  );
  const validationBlock = execution.methodSnapshot.blocks[validationIndex];
  const validationExecution = execution.blocks[validationIndex];
  if (!validationBlock || validationBlock.type !== "VALIDAR" || !validationExecution) {
    return {
      ok: false,
      outcome: "blocked",
      reason: "invalid_validation",
      message: "O bloco de validação não está disponível no snapshot da execução.",
    };
  }
  if (outcome.decision === "approved") return { ok: true, outcome: "approved" };

  const parkValidation = () => {
    validationExecution.status = "awaiting_human";
    validationExecution.completedAt = undefined;
    execution.status = "awaiting_human";
  };

  if (validationBlock.validation?.onReject !== "retry_target") {
    parkValidation();
    return { ok: true, outcome: "paused" };
  }

  const targetBlockId = validationBlock.validation.targetBlockId;
  const targetIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === targetBlockId,
  );
  const targetBlock = execution.methodSnapshot.blocks[targetIndex];
  const targetExecution = execution.blocks[targetIndex];
  if (targetIndex < 0 || targetIndex >= validationIndex || !targetBlock || !targetExecution) {
    parkValidation();
    return {
      ok: false,
      outcome: "blocked",
      reason: "invalid_target",
      message: "O bloco validado não está disponível para nova tentativa.",
    };
  }

  const maxAttempts = Math.max(1, validationBlock.validation.maxAttempts ?? 3);
  // Provider retries on the target do not consume editorial rounds.
  if ((validationExecution.attempt ?? 1) >= maxAttempts) {
    parkValidation();
    return {
      ok: false,
      outcome: "blocked",
      reason: "max_attempts",
      message: `O limite de ${maxAttempts} tentativas foi atingido. Revise o método ou aprove manualmente o resultado atual.`,
    };
  }

  const retryMode = validationBlock.validation.retryMode ?? "full";
  const retryConversationContext = pluginConversationFallbackContext(
    targetBlock,
    targetExecution.values,
  );
  const retryConversationAttachments = pluginConversationFallbackAttachments(
    targetExecution.values,
  );

  for (let index = targetIndex; index < execution.blocks.length; index += 1) {
    const blockExecution = execution.blocks[index];
    const preserveConversation = index === targetIndex && retryMode === "conversation_feedback";
    blockExecution.attempt = attemptAfterRetryInvalidation(blockExecution);
    blockExecution.values = {};
    blockExecution.error = undefined;
    blockExecution.logs = undefined;
    blockExecution.completedAt = undefined;
    blockExecution.jobId = undefined;
    blockExecution.progress = undefined;
    blockExecution.progressMessage = undefined;
    blockExecution.retryFeedback = undefined;
    blockExecution.retryMode = undefined;
    blockExecution.retryConversationContext = undefined;
    blockExecution.retryConversationAttachments = undefined;
    if (!preserveConversation) blockExecution.pluginConversation = undefined;
    if (index === targetIndex) {
      blockExecution.startedAt = now;
      blockExecution.retryFeedback = structuredClone(outcome.values);
      blockExecution.retryMode = retryMode;
      blockExecution.retryConversationContext = retryConversationContext;
      blockExecution.retryConversationAttachments = retryConversationAttachments;
      blockExecution.status =
        targetBlock.operator === "Humano" && !targetBlock.plugin
          ? "awaiting_human"
          : "blocked_executor";
    } else {
      blockExecution.startedAt = undefined;
      blockExecution.status = "pending";
    }
  }

  invalidateBlockDeliveries(
    execution,
    [
      ...execution.methodSnapshot.blocks.slice(targetIndex).map((candidate) => candidate.id),
      "__process_output__",
    ],
    now,
  );
  execution.output = undefined;
  execution.outputStatus = "pending";
  execution.error = undefined;
  execution.status =
    targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";

  return {
    ok: true,
    outcome: "retry_target",
    targetBlockId: targetBlock.id,
    targetBlockName: targetBlock.name ?? targetBlock.type,
  };
}
