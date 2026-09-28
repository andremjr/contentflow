import type { BlockPluginBinding } from "@/lib/domain";
import type { JsonSchema, PluginCapability } from "@/lib/plugin-contract";

export type PluginConfigurationDraftIssue = {
  field: string;
  code: "required" | "type" | "enum" | "minimum" | "maximum" | "length" | "pattern";
};

export function clonePluginConfigurationDraft(binding: BlockPluginBinding): BlockPluginBinding {
  return {
    ...binding,
    configuration: { ...binding.configuration },
    profileExecution: binding.profileExecution
      ? {
          ...binding.profileExecution,
          profileIds: [...binding.profileExecution.profileIds],
        }
      : undefined,
    conversation: binding.conversation ? { ...binding.conversation } : undefined,
  };
}

function matchesSchemaType(value: string | number | boolean, schema: JsonSchema) {
  if (!schema.type) return true;
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  return true;
}

export function validatePluginConfigurationDraft(
  capability: PluginCapability,
  binding: BlockPluginBinding,
): PluginConfigurationDraftIssue[] {
  const schema = capability.blockConfigSchema;
  const properties = schema.properties ?? {};
  const issues: PluginConfigurationDraftIssue[] = [];

  for (const key of schema.required ?? []) {
    const value = binding.configuration[key];
    if (value === undefined || value === "") issues.push({ field: key, code: "required" });
  }

  for (const [key, value] of Object.entries(binding.configuration)) {
    const property = properties[key];
    if (!property || value === undefined) continue;
    if (!matchesSchemaType(value, property)) {
      issues.push({ field: key, code: "type" });
      continue;
    }
    const choices = [
      ...(property.enum ?? []),
      ...(property.oneOf ?? []).flatMap((option) =>
        typeof option.const === "string" ||
        typeof option.const === "number" ||
        typeof option.const === "boolean"
          ? [option.const]
          : [],
      ),
    ];
    if (choices.length > 0 && !choices.includes(value)) {
      issues.push({ field: key, code: "enum" });
    }
    if (typeof value === "number") {
      if (property.minimum !== undefined && value < property.minimum)
        issues.push({ field: key, code: "minimum" });
      if (property.maximum !== undefined && value > property.maximum)
        issues.push({ field: key, code: "maximum" });
    }
    if (typeof value === "string") {
      if (
        (property.minLength !== undefined && value.length < property.minLength) ||
        (property.maxLength !== undefined && value.length > property.maxLength)
      ) {
        issues.push({ field: key, code: "length" });
      }
      if (property.pattern) {
        try {
          if (!new RegExp(property.pattern).test(value))
            issues.push({ field: key, code: "pattern" });
        } catch {
          // Manifest validation owns malformed patterns; an installed legacy schema remains readable.
        }
      }
    }
  }

  return issues;
}

export function preparePluginConfigurationCommit(
  capability: PluginCapability,
  draft: BlockPluginBinding,
):
  { ok: true; value: BlockPluginBinding } | { ok: false; issues: PluginConfigurationDraftIssue[] } {
  const issues = validatePluginConfigurationDraft(capability, draft);
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: clonePluginConfigurationDraft(draft) };
}
