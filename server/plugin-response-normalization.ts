import type { ActionBlock, RuntimeValue } from "../src/lib/domain";
import { isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import type { PluginFieldContract } from "../src/lib/plugin-contract";
import {
  validateRuntimeValueAgainstShape,
  runtimeItemMatchesShape,
} from "../src/lib/runtime-value-validation";

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
    const materialIssues =
      input.valueShape === "item"
        ? runtimeItemMatchesShape(contract.shape, rawValue)
          ? []
          : validateRuntimeValueAgainstShape(
              { ...contract.shape, cardinality: "one" },
              rawValue,
              contract.portKey,
            )
        : validateRuntimeValueAgainstShape(contract.shape, rawValue, contract.portKey);
    if (materialIssues.length) {
      const missingRecordField = materialIssues.find(
        (issue) => issue.code === "MISSING_REQUIRED_RECORD_FIELD",
      );
      issues.push({
        code: missingRecordField ? "MISSING_REQUIRED_RECORD_FIELD" : "INCOMPATIBLE_OUTPUT_SHAPE",
        message: missingRecordField
          ? `${contract.portKey}: ${missingRecordField.message}`
          : `${contract.portKey} é incompatível com o shape de ${contract.label}: ${materialIssues[0].message}`,
        outputKey: contract.key,
        portKey: contract.portKey,
      });
      continue;
    }
    const normalizedValue = rawValue as RuntimeValue;
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

function missingRequiredIssue(contract: PluginFieldContract): PluginResponseContractIssue {
  return {
    code: "MISSING_REQUIRED_OUTPUT",
    message: `a porta obrigatória ${contract.portKey} (${contract.label}) está ausente ou vazia.`,
    outputKey: contract.key,
    portKey: contract.portKey,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
