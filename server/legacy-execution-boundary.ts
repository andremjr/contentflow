import {
  PROCESS_ORDER,
  type BlockExecutionStatus,
  type ProcessExecution,
  type ProcessExecutionStatus,
  type UniversalProcess,
} from "../src/lib/domain";

const EXECUTION_STATUSES = new Set<ProcessExecutionStatus>([
  "not_started",
  "running",
  "awaiting_human",
  "awaiting_output",
  "blocked_executor",
  "failed",
  "completed",
  "cancelled",
]);

const BLOCK_STATUSES = new Set<BlockExecutionStatus>([
  "pending",
  "awaiting_human",
  "in_progress",
  "completed",
  "blocked_executor",
  "failed",
  "cancelled",
]);

const OUTPUT_STATUSES = new Set<ProcessExecution["outputStatus"]>([
  "pending",
  "awaiting_human",
  "completed",
]);

export type LegacyExecutionBoundaryReason =
  | "not_object"
  | "missing_identity"
  | "invalid_process_type"
  | "invalid_method_snapshot"
  | "invalid_blocks"
  | "invalid_status"
  | "invalid_output_status"
  | "invalid_timestamps"
  | "uncloneable_payload";

export type LegacyExecutionBoundaryResult =
  | { ok: true; execution: ProcessExecution }
  | { ok: false; reason: LegacyExecutionBoundaryReason; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUniversalProcess(value: unknown): value is UniversalProcess {
  return typeof value === "string" && (PROCESS_ORDER as readonly string[]).includes(value);
}

function isLegacyMethodSnapshot(value: unknown, processType: UniversalProcess) {
  if (!isRecord(value) || value.processType !== processType || !Array.isArray(value.blocks)) {
    return false;
  }
  return value.blocks.every((block) => isRecord(block) && isNonEmptyString(block.id));
}

function isLegacyExecutionBlock(value: unknown) {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.blockId)) return false;
  if (
    typeof value.status !== "string" ||
    !BLOCK_STATUSES.has(value.status as BlockExecutionStatus)
  ) {
    return false;
  }
  if (!isRecord(value.values)) return false;
  if (value.attempt !== undefined && typeof value.attempt !== "number") return false;
  return true;
}

/**
 * Compatibility adapter for the historical HTTP creation boundary.
 *
 * It validates only the minimum structure the current runtime dereferences and
 * preserves the already-materialized representation. It deliberately does not
 * apply canonical creation or normalize historical execution state.
 */
export function adaptLegacyExecutionCreatePayload(input: unknown): LegacyExecutionBoundaryResult {
  if (!isRecord(input)) {
    return { ok: false, reason: "not_object", message: "Execution payload must be an object." };
  }
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.projectId) ||
    !isNonEmptyString(input.channelId)
  ) {
    return {
      ok: false,
      reason: "missing_identity",
      message: "Execution id, projectId and channelId are required.",
    };
  }
  if (!isUniversalProcess(input.processType)) {
    return {
      ok: false,
      reason: "invalid_process_type",
      message: "Execution processType must be a UniversalProcess.",
    };
  }
  if (!isLegacyMethodSnapshot(input.methodSnapshot, input.processType)) {
    return {
      ok: false,
      reason: "invalid_method_snapshot",
      message: "Execution methodSnapshot is not structurally usable.",
    };
  }
  if (!Array.isArray(input.blocks) || !input.blocks.every(isLegacyExecutionBlock)) {
    return {
      ok: false,
      reason: "invalid_blocks",
      message: "Execution blocks are not structurally usable.",
    };
  }
  if (
    typeof input.status !== "string" ||
    !EXECUTION_STATUSES.has(input.status as ProcessExecutionStatus)
  ) {
    return { ok: false, reason: "invalid_status", message: "Execution status is invalid." };
  }
  if (
    typeof input.outputStatus !== "string" ||
    !OUTPUT_STATUSES.has(input.outputStatus as ProcessExecution["outputStatus"])
  ) {
    return {
      ok: false,
      reason: "invalid_output_status",
      message: "Execution outputStatus is invalid.",
    };
  }
  if (!isNonEmptyString(input.createdAt) || !isNonEmptyString(input.updatedAt)) {
    return {
      ok: false,
      reason: "invalid_timestamps",
      message: "Execution createdAt and updatedAt are required.",
    };
  }

  try {
    return { ok: true, execution: structuredClone(input) as ProcessExecution };
  } catch {
    return {
      ok: false,
      reason: "uncloneable_payload",
      message: "Execution payload cannot be safely cloned.",
    };
  }
}
