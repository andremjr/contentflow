import type { BlockExecutionStatus } from "../domain";
import type { ExecutionCoreInvariantViolation, ExecutionCoreState } from "./types";

const ACTIVE_BLOCK_STATUSES = new Set<BlockExecutionStatus>([
  "awaiting_human",
  "blocked_executor",
  "in_progress",
]);

export function isExecutionCoreActiveBlockStatus(status: BlockExecutionStatus) {
  return ACTIVE_BLOCK_STATUSES.has(status);
}

export function validateExecutionCoreInvariants(
  state: ExecutionCoreState,
): ExecutionCoreInvariantViolation[] {
  const violations: ExecutionCoreInvariantViolation[] = [];
  const snapshotBlocks = state.methodSnapshot.blocks;
  const executionBlocks = state.blocks;

  if (new Set(snapshotBlocks.map((block) => block.id)).size !== snapshotBlocks.length) {
    violations.push({ code: "snapshot_block_ids_not_unique" });
  }
  if (new Set(executionBlocks.map((block) => block.blockId)).size !== executionBlocks.length) {
    violations.push({ code: "execution_block_ids_not_unique" });
  }
  if (snapshotBlocks.length !== executionBlocks.length) {
    violations.push({ code: "snapshot_execution_length_mismatch" });
  }

  const comparableLength = Math.min(snapshotBlocks.length, executionBlocks.length);
  for (let index = 0; index < comparableLength; index += 1) {
    if (snapshotBlocks[index].id !== executionBlocks[index].blockId) {
      violations.push({
        code: "snapshot_execution_order_mismatch",
        blockId: executionBlocks[index].blockId,
      });
    }
  }

  const activeIndexes = executionBlocks
    .map((block, index) => (isExecutionCoreActiveBlockStatus(block.status) ? index : -1))
    .filter((index) => index >= 0);
  if (activeIndexes.length > 1) {
    violations.push({ code: "multiple_active_blocks" });
  }

  for (const activeIndex of activeIndexes) {
    for (let predecessorIndex = 0; predecessorIndex < activeIndex; predecessorIndex += 1) {
      if (executionBlocks[predecessorIndex].status !== "completed") {
        violations.push({
          code: "downstream_active_before_predecessor",
          blockId: executionBlocks[activeIndex].blockId,
          predecessorBlockId: executionBlocks[predecessorIndex].blockId,
        });
        break;
      }
    }
  }

  return violations;
}
