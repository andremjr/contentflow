import type { ProcessExecution } from "../domain";

export type ExecutionCoreState = Readonly<ProcessExecution>;

export type ExecutionCoreFact =
  { type: "start_requested" } | { type: "block_completed"; blockId: string };

export type ExecutionCoreReason =
  | "first_block_human"
  | "first_block_executor"
  | "next_block_human"
  | "next_block_executor"
  | "method_blocks_complete";

export type ExecutionCoreDiagnosticCode =
  | "empty_method"
  | "malformed_state"
  | "unknown_completed_block"
  | "block_not_completed"
  | "next_block_not_pending"
  | "start_state_not_pristine";

export type ExecutionCoreDecision =
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
