import type {
  ActionBlock,
  HumanFieldType,
  RecordFieldDefinition,
  RuntimeValue,
  StoredFile,
} from "../src/lib/domain";
import { isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import type { PluginFieldContract } from "../src/lib/plugin-contract";

export type PluginResponseContractIssueCode =
  | "INVALID_VALUES_SHAPE"
  | "AMBIGUOUS_OUTPUT_PORT"
  | "UNKNOWN_OUTPUT_PORT"
  | "STRATEGIC_KEY_ALIAS_NOT_ALLOWED"
  | "GENERIC_RESULT_ALIAS_NOT_ALLOWED"
  | "CHOOSE_ALIAS_NOT_ALLOWED"
  | "INCOMPATIBLE_OUTPUT_TYPE"
  | "MISSING_REQUIRED_OUTPUT"
  | "MISSING_REQUIRED_RECORD_FIELD"
  | "PRESENTATION_RESTRICTION_FAILED";

export type PluginResponseContractIssue = {
  code: PluginResponseContractIssueCode;
  message: string;
  responseKey?: string;
  outputKey?: string;
  portKey?: string;
};

export type PluginResponseNormalizationResult =
  | {
      ok: true;
      values: Record<string, RuntimeValue>;
      compatibility: "canonical" | "historical_choose_contract";
    }
  | { ok: false; issues: PluginResponseContractIssue[] };

export class PluginResponseContractError extends Error {
  readonly code = "OUTPUT_CONTRACT_VIOLATION";

  constructor(readonly issues: PluginResponseContractIssue[]) {
    super(
      `Resposta do executor viola o contrato de outputs: ${issues.map((issue) => issue.message).join("; ")}`,
    );
    this.name = "PluginResponseContractError";
  }
}

type NormalizePluginResponseValuesInput = {
  block: Pick<ActionBlock, "type">;
  responseValues: unknown;
  outputContract: PluginFieldContract[];
  completion: "partial" | "final";
  /** Previously normalized strategic values accumulated from valid partial responses. */
  existingValues?: Record<string, RuntimeValue>;
  /** Per-item capabilities return one element for list/files/records output ports. */
  valueShape?: "snapshot" | "item";
};

export function normalizePluginResponseValues(
  input: NormalizePluginResponseValuesInput,
): PluginResponseNormalizationResult {
  if (!isPlainObject(input.responseValues)) {
    return {
      ok: false,
      issues: [{ code: "INVALID_VALUES_SHAPE", message: "values precisa ser um objeto." }],
    };
  }

  const issues: PluginResponseContractIssue[] = [];
  const contractsByPort = new Map<string, PluginFieldContract>();
  for (const contract of input.outputContract) {
    const previous = contractsByPort.get(contract.portKey);
    if (previous && previous.key !== contract.key) {
      issues.push({
        code: "AMBIGUOUS_OUTPUT_PORT",
        message: `a porta ${contract.portKey} está vinculada a mais de um output estratégico.`,
        portKey: contract.portKey,
      });
      continue;
    }
    contractsByPort.set(contract.portKey, contract);
  }

  for (const responseKey of Object.keys(input.responseValues)) {
    if (contractsByPort.has(responseKey)) continue;
    const strategic = input.outputContract.find((contract) => contract.key === responseKey);
    const code: PluginResponseContractIssueCode = strategic
      ? "STRATEGIC_KEY_ALIAS_NOT_ALLOWED"
      : responseKey === "selectedItemId" && input.block.type === "ESCOLHER"
        ? "CHOOSE_ALIAS_NOT_ALLOWED"
        : responseKey === "result"
          ? "GENERIC_RESULT_ALIAS_NOT_ALLOWED"
          : "UNKNOWN_OUTPUT_PORT";
    issues.push({
      code,
      message: strategic
        ? `a chave estratégica ${responseKey} não pode substituir a porta técnica ${strategic.portKey}.`
        : `a porta ${responseKey} não existe no outputContract.`,
      responseKey,
      outputKey: strategic?.key,
      portKey: strategic?.portKey,
    });
  }

  const values: Record<string, RuntimeValue> = structuredClone(input.existingValues ?? {});
  for (const contract of input.outputContract) {
    if (!Object.hasOwn(input.responseValues, contract.portKey)) {
      continue;
    }
    const rawValue = input.responseValues[contract.portKey];
    const value = normalizeAllowedValue(contract.type, rawValue, input.valueShape ?? "snapshot");
    if (
      !matchesFieldType(contract.type, value) &&
      !(input.valueShape === "item" && matchesItemType(contract.type, value, contract.recordFields))
    ) {
      issues.push({
        code: "INCOMPATIBLE_OUTPUT_TYPE",
        message: `${contract.portKey} é incompatível com o tipo ${contract.type} de ${contract.label}.`,
        outputKey: contract.key,
        portKey: contract.portKey,
      });
      continue;
    }
    const normalizedValue = value as RuntimeValue;
    const mediaIssue = mediaTypeIssue(contract.type, normalizedValue);
    if (mediaIssue) {
      issues.push({
        code: "INCOMPATIBLE_OUTPUT_TYPE",
        message: `${contract.portKey} ${mediaIssue}.`,
        outputKey: contract.key,
        portKey: contract.portKey,
      });
      continue;
    }
    const recordIssues = requiredRecordFieldIssues(contract, normalizedValue);
    issues.push(...recordIssues);
    const presentationIssue = getPresentationRestrictionIssue(
      contract.presentation,
      normalizedValue,
    );
    if (presentationIssue) {
      issues.push({
        code: "PRESENTATION_RESTRICTION_FAILED",
        message: `${contract.portKey}: ${presentationIssue}.`,
        outputKey: contract.key,
        portKey: contract.portKey,
      });
    }
    values[contract.key] = structuredClone(normalizedValue);
  }

  if (input.completion === "final") {
    for (const contract of input.outputContract) {
      if (contract.required && isEmptyRuntimeValue(values[contract.key])) {
        issues.push(missingRequiredIssue(contract));
      }
    }
  }

  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        values,
        compatibility: input.block.type === "ESCOLHER" ? "historical_choose_contract" : "canonical",
      };
}

export function requireNormalizedPluginResponseValues(input: NormalizePluginResponseValuesInput) {
  const result = normalizePluginResponseValues(input);
  if (!result.ok) throw new PluginResponseContractError(result.issues);
  return result;
}

function normalizeAllowedValue(
  type: HumanFieldType,
  value: unknown,
  valueShape: "snapshot" | "item",
): unknown {
  if (
    valueShape === "item" ||
    type !== "list" ||
    (typeof value !== "string" && !Array.isArray(value))
  )
    return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => typeof item !== "string" || Boolean(item));
  }
  return value
    .split(/\r?\n/)
    .map((line) => {
      const cleaned = line
        .trim()
        .replace(/^[-*•\s]+/, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();
      return cleaned || line.trim();
    })
    .filter(Boolean);
}

function matchesItemType(
  type: HumanFieldType,
  value: unknown,
  recordFields: RecordFieldDefinition[] | undefined,
) {
  if (type === "list" || type === "multiselect") return typeof value === "string";
  if (type === "files") return isStoredFile(value);
  if (type === "records") {
    if (!isPlainObject(value) || isStoredFile(value)) return false;
    return (recordFields ?? []).every((field) => {
      const fieldValue = value[field.key];
      if (field.required && isEmptyRuntimeValue(fieldValue as RuntimeValue | undefined))
        return false;
      return fieldValue == null || matchesRecordFieldType(field, fieldValue);
    });
  }
  return false;
}

function matchesFieldType(type: HumanFieldType, value: unknown): value is RuntimeValue {
  if (value === null || value === undefined) return false;
  if (["text", "textarea", "select", "datetime", "url", "approval"].includes(type)) {
    return typeof value === "string";
  }
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "list" || type === "multiselect") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (type === "records") {
    return (
      Array.isArray(value) && value.every((item) => isPlainObject(item) && !isStoredFile(item))
    );
  }
  if (type === "files") return Array.isArray(value) && value.every(isStoredFile);
  if (["file", "image", "audio", "video"].includes(type)) return isStoredFile(value);
  if (type === "thumbnail_layout") {
    return Boolean(
      isPlainObject(value) &&
      value.aspectRatio === "16:9" &&
      Array.isArray(value.boxes) &&
      value.boxes.every(
        (box) =>
          isPlainObject(box) &&
          typeof box.id === "string" &&
          typeof box.label === "string" &&
          typeof box.color === "string" &&
          [box.x, box.y, box.w, box.h].every(
            (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
          ),
      ),
    );
  }
  return false;
}

function mediaTypeIssue(type: HumanFieldType, value: RuntimeValue) {
  const expectedPrefix =
    type === "image"
      ? "image/"
      : type === "audio"
        ? "audio/"
        : type === "video"
          ? "video/"
          : undefined;
  if (!expectedPrefix) return undefined;
  const file = value as StoredFile;
  return file.mimeType.toLowerCase().startsWith(expectedPrefix)
    ? undefined
    : `precisa referenciar mídia ${type}`;
}

function requiredRecordFieldIssues(contract: PluginFieldContract, value: RuntimeValue) {
  if (contract.type !== "records") return [];
  const recordValues = (Array.isArray(value) ? value : [value]) as unknown[];
  const issues: PluginResponseContractIssue[] = [];
  recordValues.forEach((record, index) => {
    if (!isPlainObject(record) || isStoredFile(record)) return;
    for (const field of contract.recordFields ?? []) {
      const fieldValue = record[field.key];
      if (field.required && isEmptyRuntimeValue(fieldValue as RuntimeValue | undefined)) {
        issues.push({
          code: "MISSING_REQUIRED_RECORD_FIELD",
          message: `${contract.portKey}, registro ${index + 1}, não contém ${field.label}.`,
          outputKey: contract.key,
          portKey: contract.portKey,
        });
        continue;
      }
      if (
        fieldValue !== undefined &&
        fieldValue !== null &&
        !matchesRecordFieldType(field, fieldValue)
      ) {
        issues.push({
          code: "INCOMPATIBLE_OUTPUT_TYPE",
          message: `${contract.portKey}, registro ${index + 1}, contém ${field.label} incompatível.`,
          outputKey: contract.key,
          portKey: contract.portKey,
        });
      }
    }
  });
  return issues;
}

function matchesRecordFieldType(field: RecordFieldDefinition, value: unknown) {
  if (["text", "textarea", "select", "datetime", "url"].includes(field.type)) {
    return typeof value === "string";
  }
  if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (field.type === "boolean") return typeof value === "boolean";
  if (["file", "image", "audio", "video"].includes(field.type)) {
    return isStoredFile(value) && !mediaTypeIssue(field.type, value);
  }
  return false;
}

function missingRequiredIssue(contract: PluginFieldContract): PluginResponseContractIssue {
  return {
    code: "MISSING_REQUIRED_OUTPUT",
    message: `a porta obrigatória ${contract.portKey} (${contract.label}) está ausente ou vazia.`,
    outputKey: contract.key,
    portKey: contract.portKey,
  };
}

function isStoredFile(value: unknown): value is StoredFile {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    Boolean(value.id) &&
    typeof value.name === "string" &&
    Boolean(value.name) &&
    typeof value.mimeType === "string" &&
    Boolean(value.mimeType) &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.url === "string" &&
    Boolean(value.url)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
