import type { ActionBlock } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";
import type {
  ExecutionCoreDecision,
  ExecutionCoreFact,
  ExecutionCoreReason,
  ExecutionCoreState,
  ExecutionCoreTransitionResult,
} from "./types";

function activationDecision(
  state: ExecutionCoreState,
  block: ActionBlock,
  blockIndex: number,
  position: "first" | "next",
): ExecutionCoreDecision {
  const human = block.operator === "Humano" && !block.plugin;
  const reason: ExecutionCoreReason = human
    ? position === "first"
      ? "first_block_human"
      : "next_block_human"
    : position === "first"
      ? "first_block_executor"
      : "next_block_executor";
  const status = human ? "awaiting_human" : "blocked_executor";
  return {
    type: "activate_block",
    blockId: block.id,
    blockIndex,
    blockStatus: status,
    executionStatus: status,
    reason,
    expectedRevision: state.revision,
  };
}

function blocked(
  state: ExecutionCoreState,
  fact: ExecutionCoreFact,
  reason: Extract<ExecutionCoreDecision, { type: "blocked" }>["reason"],
  diagnostics = validateExecutionCoreInvariants(state),
): ExecutionCoreTransitionResult {
  return {
    state,
    fact,
    decision: { type: "blocked", reason, expectedRevision: state.revision },
    diagnostics,
  };
}

export function evaluateExecutionCore(
  state: ExecutionCoreState,
  fact: ExecutionCoreFact,
): ExecutionCoreTransitionResult {
  const diagnostics = validateExecutionCoreInvariants(state);
  if (diagnostics.length) return blocked(state, fact, "malformed_state", diagnostics);

  if (fact.type === "start_requested") {
    if (!state.methodSnapshot.blocks.length)
      return blocked(state, fact, "empty_method", diagnostics);
    if (
      state.status !== "not_started" ||
      state.blocks.some(
        (block) => block.status !== "pending" || block.startedAt || block.completedAt,
      )
    ) {
      return blocked(state, fact, "start_state_not_pristine", diagnostics);
    }
    return {
      state,
      fact,
      decision: activationDecision(state, state.methodSnapshot.blocks[0], 0, "first"),
      diagnostics,
    };
  }

  const completedIndex = state.methodSnapshot.blocks.findIndex(
    (block) => block.id === fact.blockId,
  );
  if (completedIndex < 0) return blocked(state, fact, "unknown_completed_block", diagnostics);
  if (state.blocks[completedIndex]?.status !== "completed") {
    return blocked(state, fact, "block_not_completed", diagnostics);
  }

  const nextIndex = completedIndex + 1;
  const nextBlock = state.methodSnapshot.blocks[nextIndex];
  if (!nextBlock) {
    return {
      state,
      fact,
      decision: {
        type: "finish_blocks",
        reason: "method_blocks_complete",
        expectedRevision: state.revision,
      },
      diagnostics,
    };
  }
  if (state.blocks[nextIndex]?.status !== "pending") {
    return blocked(state, fact, "next_block_not_pending", diagnostics);
  }
  return {
    state,
    fact,
    decision: activationDecision(state, nextBlock, nextIndex, "next"),
    diagnostics,
  };
}
