import type { BlockItemRetryScope, ProcessExecution, RuntimeValue } from "../domain";

export type ExecutionCoreState = Readonly<ProcessExecution>;

export type ManualBlockRetryRequestedFact = {
  type: "manual_block_retry_requested";
  blockId: string;
  scope: BlockItemRetryScope;
  itemId?: string;
};

export type ExecutionCoreFact =
  | { type: "start_requested" }
  | { type: "block_completed"; blockId: string }
  | ManualBlockRetryRequestedFact
  | {
      type: "human_block_completed";
      blockId: string;
      values: Record<string, RuntimeValue>;
      now: string;
    }
  | {
      type: "executor_block_completed";
      blockId: string;
      values: Record<string, RuntimeValue>;
      now: string;
    };

export type ExecutionCoreReason =
  | "first_block_human"
  | "first_block_executor"
  | "next_block_human"
  | "next_block_executor"
  | "method_blocks_complete"
  | "human_block_completion_allowed"
  | "executor_block_completion_allowed";

export type ExecutionCoreDiagnosticCode =
  | "empty_method"
  | "malformed_state"
  | "unknown_completed_block"
  | "block_not_completed"
  | "next_block_not_pending"
  | "start_state_not_pristine"
  | "unknown_human_block"
  | "block_not_human"
  | "human_block_not_awaiting"
  | "execution_not_awaiting_human"
  | "unknown_executor_block"
  | "block_not_executor"
  | "executor_block_not_active"
  | "execution_not_running";

export type ExecutionCoreDecision =
  | {
      type: "complete_human_block";
      blockId: string;
      blockIndex: number;
      reason: "human_block_completion_allowed";
      expectedRevision?: number;
    }
  | {
      type: "complete_executor_block";
      blockId: string;
      blockIndex: number;
      reason: "executor_block_completion_allowed";
      expectedRevision?: number;
    }
  | {
      type: "activate_block";
      blockId: string;
      blockIndex: number;
      blockStatus: "awaiting_human" | "blocked_executor";
      executionStatus: "awaiting_human" | "blocked_executor";
      reason: ExecutionCoreReason;
      expectedRevision?: number;
    }
  | {
      type: "finish_blocks";
      reason: "method_blocks_complete";
      expectedRevision?: number;
    }
  | {
      type: "blocked";
      reason: ExecutionCoreDiagnosticCode;
      expectedRevision?: number;
    };

export type ExecutionCoreInvariantCode =
  | "process_type_snapshot_mismatch"
  | "snapshot_block_ids_not_unique"
  | "execution_block_ids_not_unique"
  | "snapshot_execution_length_mismatch"
  | "snapshot_execution_order_mismatch"
  | "multiple_active_blocks"
  | "downstream_active_before_predecessor";

export type ExecutionCoreInvariantViolation = {
  code: ExecutionCoreInvariantCode;
  blockId?: string;
  predecessorBlockId?: string;
};

export type ExecutionCoreTransitionResult = {
  state: ExecutionCoreState;
  fact: ExecutionCoreFact;
  decision: ExecutionCoreDecision;
  diagnostics: ExecutionCoreInvariantViolation[];
};
