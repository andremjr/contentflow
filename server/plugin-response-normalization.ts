import type {
  ActionBlock,
  AtomicValueShape,
  RuntimeValue,
  StoredFile,
  ValueShape,
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
  | "INCOMPATIBLE_OUTPUT_SHAPE"
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
  | { ok: true; values: Record<string, RuntimeValue>; compatibility: "canonical" }
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
  existingValues?: Record<string, RuntimeValue>;
  /** Item orchestration validates one member of a many-shaped port. */
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
    } else {
      contractsByPort.set(contract.portKey, contract);
    }
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
    if (!Object.hasOwn(input.responseValues, contract.portKey)) continue;
    const rawValue = input.responseValues[contract.portKey];
    if (!matchesValueShape(contract.shape, rawValue, input.valueShape ?? "snapshot")) {
      issues.push({
        code: "INCOMPATIBLE_OUTPUT_SHAPE",
        message: `${contract.portKey} é incompatível com o shape de ${contract.label}.`,
        outputKey: contract.key,
        portKey: contract.portKey,
      });
      continue;
    }
    const normalizedValue = rawValue as RuntimeValue;
    issues.push(...requiredRecordFieldIssues(contract, normalizedValue));
    const presentationIssue = getPresentationRestrictionIssue(
      input.valueShape === "item" ? { ...contract.shape, cardinality: "one" } : contract.shape,
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
      continue;
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

  return issues.length ? { ok: false, issues } : { ok: true, values, compatibility: "canonical" };
}

export function requireNormalizedPluginResponseValues(input: NormalizePluginResponseValuesInput) {
  const result = normalizePluginResponseValues(input);
  if (!result.ok) throw new PluginResponseContractError(result.issues);
  return result;
}

function matchesValueShape(shape: ValueShape, value: unknown, mode: "snapshot" | "item") {
  const effective = mode === "item" ? { ...shape, cardinality: "one" as const } : shape;
  if (effective.cardinality === "many") {
    return Array.isArray(value) && value.every((item) => matchesOne(effective, item));
  }
  return !Array.isArray(value) && matchesOne(effective, value);
}

function matchesOne(shape: ValueShape, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (shape.kind === "content") {
    const allowsInline = shape.representation === "inline" || shape.representation === "either";
    const allowsArtifact = shape.representation === "artifact" || shape.representation === "either";
    if (shape.family === "text" && allowsInline && typeof value === "string") return true;
    if (!allowsArtifact || !isStoredFile(value)) return false;
    if (shape.family !== "text" && !value.mimeType.startsWith(`${shape.family}/`)) return false;
    return (
      !shape.formats?.mimeTypes?.length ||
      shape.formats.mimeTypes.some((pattern) => mimeMatches(value.mimeType, pattern))
    );
  }
  if (shape.kind === "record") {
    if (!isPlainObject(value) || isStoredFile(value)) return false;
    return shape.fields.every((field) => {
      const fieldValue = value[field.key];
      if (field.required && isEmptyRuntimeValue(fieldValue as RuntimeValue | undefined))
        return false;
      return fieldValue == null || matchesAtomicShape(field.shape, fieldValue);
    });
  }
  return matchesControl(shape, value);
}

function matchesAtomicShape(shape: AtomicValueShape, value: unknown) {
  return matchesOne(shape, value);
}

function matchesControl(shape: Extract<ValueShape, { kind: "control" }>, value: unknown) {
  if (shape.control === "number") return typeof value === "number" && Number.isFinite(value);
  if (shape.control === "boolean") return typeof value === "boolean";
  if (shape.control === "thumbnail_layout") {
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
  return typeof value === "string";
}

function requiredRecordFieldIssues(contract: PluginFieldContract, value: RuntimeValue) {
  if (contract.shape.kind !== "record") return [];
  const recordValues = (Array.isArray(value) ? value : [value]) as unknown[];
  const issues: PluginResponseContractIssue[] = [];
  recordValues.forEach((record, index) => {
    if (!isPlainObject(record) || isStoredFile(record)) return;
    for (const field of contract.shape.fields) {
      const fieldValue = record[field.key];
      if (field.required && isEmptyRuntimeValue(fieldValue as RuntimeValue | undefined)) {
        issues.push({
          code: "MISSING_REQUIRED_RECORD_FIELD",
          message: `${contract.portKey}, registro ${index + 1}, não contém ${field.label}.`,
          outputKey: contract.key,
          portKey: contract.portKey,
        });
      }
    }
  });
  return issues;
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

function mimeMatches(mimeType: string, pattern: string) {
  return pattern.endsWith("/*") ? mimeType.startsWith(pattern.slice(0, -1)) : mimeType === pattern;
}
