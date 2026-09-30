import {
  PROCESS_ORDER,
  type BlockExecutionStatus,
  type ProcessExecution,
  type ProcessExecutionStatus,
  type UniversalProcess,
} from "../src/lib/domain";
import { validateExecutionCoreInvariants } from "../src/lib/execution-core";
import { createProcessOutputFields, isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { processMethodV3Schema } from "../src/lib/method-contract-v3";
import {
  runtimeItemMatchesShape,
  runtimeValueMatchesShape,
} from "../src/lib/runtime-value-validation";
import { valueShapeSchema } from "../src/lib/value-shape-schema";

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

export type ExecutionCreateBoundaryResult =
  { ok: true; execution: ProcessExecution } | { ok: false; message: string };

export function parseCanonicalExecutionCreatePayload(
  input: unknown,
): ExecutionCreateBoundaryResult {
  if (!isRecord(input)) return invalid("Execution payload must be an object.");
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.projectId) ||
    !isNonEmptyString(input.channelId)
  ) {
    return invalid("Execution id, projectId and channelId are required.");
  }
  if (!isUniversalProcess(input.processType)) return invalid("Execution processType is invalid.");

  const method = processMethodV3Schema.safeParse(input.methodSnapshot);
  if (!method.success || method.data.processType !== input.processType) {
    return invalid(
      "Execution methodSnapshot must be a canonical ProcessMethod v3 for the same process.",
    );
  }
  if (!Array.isArray(input.blocks) || !input.blocks.every(isCanonicalExecutionBlock)) {
    return invalid("Execution blocks are invalid.");
  }
  if (
    typeof input.status !== "string" ||
    !EXECUTION_STATUSES.has(input.status as ProcessExecutionStatus)
  ) {
    return invalid("Execution status is invalid.");
  }
  if (
    typeof input.outputStatus !== "string" ||
    !OUTPUT_STATUSES.has(input.outputStatus as ProcessExecution["outputStatus"])
  ) {
    return invalid("Execution outputStatus is invalid.");
  }
  if (!isNonEmptyString(input.createdAt) || !isNonEmptyString(input.updatedAt)) {
    return invalid("Execution createdAt and updatedAt are required.");
  }

  let execution: ProcessExecution;
  try {
    execution = structuredClone({ ...input, methodSnapshot: method.data }) as ProcessExecution;
  } catch {
    return invalid("Execution payload cannot be safely cloned.");
  }

  const invariantIssues = validateExecutionCoreInvariants(execution);
  if (invariantIssues.length) {
    return invalid(
      `Execution state violates Core invariants: ${invariantIssues.map((issue) => issue.code).join(", ")}.`,
    );
  }

  for (const [index, blockExecution] of execution.blocks.entries()) {
    const block = execution.methodSnapshot.blocks[index];
    const outputMap = new Map((block.outputs ?? []).map((output) => [output.key, output] as const));
    for (const [key, value] of Object.entries(blockExecution.values ?? {})) {
      if (block.type === "ESCOLHER" && key === "selectedItemId") {
        if (typeof value !== "string") return invalid(`${block.name}: selectedItemId is invalid.`);
        continue;
      }
      const output = outputMap.get(key);
      if (!output || !runtimeValueMatchesShape(output.shape, value)) {
        return invalid(`${block.name}: value ${key} does not match the declared ValueShape.`);
      }
    }
    if (blockExecution.status === "completed") {
      if (block.type === "ESCOLHER") {
        if (typeof blockExecution.values.selectedItemId !== "string") {
          return invalid(`${block.name}: completed selection is missing selectedItemId.`);
        }
      } else {
        for (const output of block.outputs ?? []) {
          if (output.required && isEmptyRuntimeValue(blockExecution.values[output.key])) {
            return invalid(
              `${block.name}: completed block is missing required output ${output.key}.`,
            );
          }
        }
      }
    }

    if (blockExecution.runtimeInputs !== undefined) {
      if (!isRecord(blockExecution.runtimeInputs))
        return invalid(`${block.name}: runtimeInputs are invalid.`);
      const runtimeInputs = new Map(
        (block.inputs ?? [])
          .filter((input) => input.binding?.kind === "runtime")
          .map((input) => [input.id, input] as const),
      );
      for (const [key, value] of Object.entries(blockExecution.runtimeInputs)) {
        const inputDefinition = runtimeInputs.get(key);
        if (!inputDefinition || !runtimeValueMatchesShape(inputDefinition.shape, value)) {
          return invalid(
            `${block.name}: runtime input ${key} does not match the declared ValueShape.`,
          );
        }
      }
    }
  }

  if (execution.output) {
    if (
      execution.output.processType !== execution.processType ||
      !isRecord(execution.output.values)
    ) {
      return invalid("Execution process output is invalid.");
    }
    const fields = new Map(
      createProcessOutputFields(execution.processType).map((field) => [field.key, field] as const),
    );
    for (const [key, value] of Object.entries(execution.output.values)) {
      const field = fields.get(key);
      if (!field || !runtimeValueMatchesShape(field.shape, value)) {
        return invalid(`Process output ${key} does not match the declared ValueShape.`);
      }
    }
    if (execution.outputStatus === "completed") {
      for (const field of fields.values()) {
        if (field.required && isEmptyRuntimeValue(execution.output.values[field.key])) {
          return invalid(`Completed process output is missing required field ${field.key}.`);
        }
      }
    }
  } else if (execution.outputStatus === "completed") {
    return invalid("Completed process output is missing its value payload.");
  }

  if (execution.deliveries !== undefined) {
    if (!Array.isArray(execution.deliveries)) return invalid("Execution deliveries are invalid.");
    for (const delivery of execution.deliveries) {
      const parsedShape = valueShapeSchema.safeParse(delivery.shape);
      if (!parsedShape.success || !Array.isArray(delivery.items)) {
        return invalid("Execution delivery shape is invalid.");
      }
      if (parsedShape.data.cardinality === "one" && delivery.items.length > 1) {
        return invalid(`Delivery ${delivery.id} violates one cardinality.`);
      }
      const materialValue =
        parsedShape.data.cardinality === "many"
          ? delivery.items.map((item) => item.value)
          : delivery.items[0]?.value;
      if (
        materialValue !== undefined &&
        !runtimeValueMatchesShape(parsedShape.data, materialValue)
      ) {
        return invalid(`Delivery ${delivery.id} does not match its ValueShape.`);
      }
      for (const item of delivery.items) {
        if (!runtimeItemMatchesShape(parsedShape.data, item.value)) {
          return invalid(`Delivery item ${item.id} does not match its ValueShape.`);
        }
      }
    }
  }

  return { ok: true, execution };
}

function isCanonicalExecutionBlock(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.blockId) || !isRecord(value.values)) return false;
  if (typeof value.status !== "string" || !BLOCK_STATUSES.has(value.status as BlockExecutionStatus))
    return false;
  if (
    value.attempt !== undefined &&
    (!Number.isInteger(value.attempt) || Number(value.attempt) < 1)
  )
    return false;
  return true;
}

function isUniversalProcess(value: unknown): value is UniversalProcess {
  return typeof value === "string" && (PROCESS_ORDER as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalid(message: string): ExecutionCreateBoundaryResult {
  return { ok: false, message };
}
