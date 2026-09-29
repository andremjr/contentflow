import type { BlockInputBinding, BlockInputSourceBinding } from "@/lib/domain";

export type AuthoritativeInputSource =
  | {
      representation: "canonical";
      binding: BlockInputSourceBinding;
    }
  | {
      representation: "legacy";
      binding?: BlockInputSourceBinding;
    };

function nonEmpty(value: string | undefined) {
  return value?.trim() ? value : undefined;
}

/** Materializes only identifiers already explicit in the compatibility representation. */
export function canonicalInputBindingFromLegacy(
  input: BlockInputBinding,
): BlockInputSourceBinding | undefined {
  switch (input.source) {
    case "project":
      return input.sourceKey === "title" || input.sourceKey === "deadline"
        ? { kind: "project", key: input.sourceKey }
        : undefined;
    case "previous_process": {
      const outputKey = nonEmpty(input.sourceKey);
      if (!input.sourceProcessType || !outputKey) return undefined;
      const blockId = nonEmpty(input.blockId);
      return {
        kind: "previous_process",
        processType: input.sourceProcessType,
        outputKey,
        ...(blockId ? { blockId } : {}),
      };
    }
    case "previous_block": {
      const blockId = nonEmpty(input.blockId);
      const outputKey = nonEmpty(input.sourceKey);
      return blockId && outputKey ? { kind: "previous_block", blockId, outputKey } : undefined;
    }
    case "channel_history": {
      const blockId = nonEmpty(input.blockId);
      const outputKey = nonEmpty(input.sourceKey);
      if (!input.sourceProcessType || !blockId || !outputKey) return undefined;
      return {
        kind: "channel_history",
        processType: input.sourceProcessType,
        blockId,
        outputKey,
        limit: Math.min(100, Math.max(1, input.historyLimit ?? 10)),
        eligibility: input.historyEligibility ?? "completed",
      };
    }
    case "runtime":
      return { kind: "runtime" };
    case "static":
      return typeof input.staticValue === "string"
        ? { kind: "static", value: input.staticValue }
        : undefined;
    case "channel_library":
      return undefined;
  }
}

/** Centralizes canonical authority without erasing whether compatibility fallback is allowed. */
export function authoritativeInputSource(input: BlockInputBinding): AuthoritativeInputSource {
  if (input.binding !== undefined) {
    return { representation: "canonical", binding: input.binding };
  }
  return {
    representation: "legacy",
    binding: canonicalInputBindingFromLegacy(input),
  };
}
