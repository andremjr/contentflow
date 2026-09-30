import type { ActionBlock, BlockFieldDefinition, ProcessMethod } from "@/lib/domain";
import { legacyTypeListAccepts } from "@/lib/data-shape";
import { createSuggestedHumanFields } from "@/lib/human-workflow";
import { canonicalInputBindingFromLegacy } from "@/lib/input-source-binding";
import type { PluginCapability } from "@/lib/plugin-contract";

export const CURRENT_METHOD_CONTRACT_VERSION = 2 as const;

export type LegacyMethodSource =
  | "persisted_channel"
  | "strategy_snapshot"
  | "execution_snapshot"
  | "portable_file"
  | "method_transfer"
  | "builder"
  | "editor_save";

export type LegacyMethodDiagnosticCode =
  | "modern_contract_invalid"
  | "legacy_input_ambiguous"
  | "legacy_validation_target_missing"
  | "legacy_validation_output_ambiguous"
  | "legacy_plugin_missing"
  | "legacy_plugin_version_unfrozen"
  | "legacy_plugin_version_mismatch"
  | "legacy_capability_missing"
  | "legacy_input_port_ambiguous"
  | "legacy_output_port_ambiguous"
  | "legacy_validation_port_ambiguous";

export type LegacyMethodDiagnostic = {
  code: LegacyMethodDiagnosticCode;
  path: string;
  message: string;
};

export type LegacyMethodCapability = {
  pluginVersion?: string;
  capability: Pick<PluginCapability, "inputPorts" | "outputPorts">;
};

export type LegacyMethodAdapterOptions = {
  source: LegacyMethodSource;
  resolveCapability?: (
    pluginId: string,
    capabilityId: string,
  ) => LegacyMethodCapability | undefined;
  /** Historical positional target recovery is allowed only at persisted/file boundaries. */
  recoverHistoricalValidationTarget?: boolean;
  /** Snapshot port recovery must be pinned to an exact plugin version. */
  requireFrozenPluginVersionForPorts?: boolean;
  /** Portable parsing may defer technical ports until the destination has the plugin. */
  allowDeferredPluginPorts?: boolean;
  /** The current editor still posts its explicit source fields; materialize them on save. */
  preferExplicitLegacyInputFields?: boolean;
};

export type LegacyMethodAdaptation =
  | {
      ok: true;
      method: ProcessMethod;
      adapted: boolean;
      complete: boolean;
      source: LegacyMethodSource;
    }
  | {
      ok: false;
      diagnostics: LegacyMethodDiagnostic[];
      source: LegacyMethodSource;
    };

function diagnostic(
  code: LegacyMethodDiagnosticCode,
  path: string,
  message: string,
): LegacyMethodDiagnostic {
  return { code, path, message };
}

function legacyParameterOutputs(block: ActionBlock): BlockFieldDefinition[] {
  return (block.parameters ?? []).map((parameter) => ({
    id: parameter.id,
    label: parameter.label,
    key: parameter.key,
    type: parameter.type,
    required: false,
    placeholder: parameter.placeholder,
    options: parameter.options,
  }));
}

function outputCandidatesForHistoricalSelection(target: ActionBlock) {
  const outputs = target.outputs ?? [];
  const collectionOutputs = outputs.filter((output) =>
    ["list", "files", "multiselect"].includes(output.type),
  );
  return collectionOutputs.length ? collectionOutputs : outputs;
}

function portAdaptationRequired(block: ActionBlock) {
  if (!block.plugin) return false;
  if ((block.inputs ?? []).some((input) => !input.portKey)) return true;
  if (block.type !== "ESCOLHER" && (block.outputs ?? []).some((output) => !output.portKey)) {
    return true;
  }
  return Boolean(block.validation?.targetOutputKey && !block.validation.targetPortKey);
}

function validateCanonicalMethod(method: ProcessMethod): LegacyMethodDiagnostic[] {
  const diagnostics: LegacyMethodDiagnostic[] = [];
  method.blocks.forEach((block, blockIndex) => {
    for (const [inputIndex, input] of (block.inputs ?? []).entries()) {
      if (!input.binding && input.source !== "channel_library") {
        diagnostics.push(
          diagnostic(
            "modern_contract_invalid",
            `blocks.${blockIndex}.inputs.${inputIndex}.binding`,
            "Método canônico possui input sem binding estratégico explícito.",
          ),
        );
      }
      if (block.plugin && !input.portKey) {
        diagnostics.push(
          diagnostic(
            "modern_contract_invalid",
            `blocks.${blockIndex}.inputs.${inputIndex}.portKey`,
            "Método canônico possui input de plugin sem portKey.",
          ),
        );
      }
    }
    if (block.plugin && block.type !== "ESCOLHER") {
      for (const [outputIndex, output] of (block.outputs ?? []).entries()) {
        if (!output.portKey) {
          diagnostics.push(
            diagnostic(
              "modern_contract_invalid",
              `blocks.${blockIndex}.outputs.${outputIndex}.portKey`,
              "Método canônico possui output de plugin sem portKey.",
            ),
          );
        }
      }
    }
    if (block.type === "VALIDAR") {
      if (!block.validation?.targetBlockId) {
        diagnostics.push(
          diagnostic(
            "modern_contract_invalid",
            `blocks.${blockIndex}.validation.targetBlockId`,
            "Método canônico possui VALIDAR sem targetBlockId.",
          ),
        );
      }
      if (block.validation?.mode !== "approval" && !block.validation?.targetOutputKey) {
        diagnostics.push(
          diagnostic(
            "modern_contract_invalid",
            `blocks.${blockIndex}.validation.targetOutputKey`,
            "Método canônico possui seleção VALIDAR sem targetOutputKey.",
          ),
        );
      }
      if (block.plugin && block.validation?.targetOutputKey && !block.validation.targetPortKey) {
        diagnostics.push(
          diagnostic(
            "modern_contract_invalid",
            `blocks.${blockIndex}.validation.targetPortKey`,
            "Método canônico possui target material de VALIDAR sem targetPortKey.",
          ),
        );
      }
    }
  });
  return diagnostics;
}

/**
 * Explicit compatibility boundary for historical Method representations.
 * It never ranks candidates: zero or multiple candidates are diagnostics.
 */
export function adaptLegacyMethod(
  input: ProcessMethod,
  options: LegacyMethodAdapterOptions,
): LegacyMethodAdaptation {
  if (input.contractVersion === CURRENT_METHOD_CONTRACT_VERSION) {
    const diagnostics = validateCanonicalMethod(input);
    return diagnostics.length
      ? { ok: false, diagnostics, source: options.source }
      : {
          ok: true,
          method: structuredClone(input),
          adapted: false,
          complete: true,
          source: options.source,
        };
  }

  const method = structuredClone(input);
  const diagnostics: LegacyMethodDiagnostic[] = [];
  let adapted = false;
  let complete = true;

  method.blocks.forEach((block, blockIndex) => {
    const blockPath = `blocks.${blockIndex}`;
    const historicalOutputs = legacyParameterOutputs(block);
    if (!block.outputs?.length && historicalOutputs.length) {
      block.outputs = historicalOutputs;
      adapted = true;
    } else if (!block.outputs?.length) {
      block.outputs = createSuggestedHumanFields(method.processType, block.type);
      adapted = true;
    }

    const canonicalInputs = [];
    for (const [inputIndex, inputBinding] of (block.inputs ?? []).entries()) {
      if (inputBinding.binding && !options.preferExplicitLegacyInputFields) {
        canonicalInputs.push(inputBinding);
        continue;
      }
      if (inputBinding.source === "channel_library") {
        // Historical ESCOLHER collection context is delivered by its specialized contract.
        adapted = true;
        continue;
      }
      const binding = canonicalInputBindingFromLegacy(inputBinding);
      if (!binding) {
        diagnostics.push(
          diagnostic(
            "legacy_input_ambiguous",
            `${blockPath}.inputs.${inputIndex}`,
            "A representação histórica não identifica uma única origem de input.",
          ),
        );
        continue;
      }
      canonicalInputs.push({ ...inputBinding, binding });
      adapted = true;
    }
    block.inputs = canonicalInputs;

    if (block.type === "VALIDAR") {
      const validation = block.validation;
      if (!validation) {
        diagnostics.push(
          diagnostic(
            "legacy_validation_target_missing",
            `${blockPath}.validation`,
            "VALIDAR histórico não possui configuração recuperável.",
          ),
        );
      } else {
        if (!validation.targetBlockId) {
          const target = options.recoverHistoricalValidationTarget
            ? [...method.blocks.slice(0, blockIndex)]
                .reverse()
                .find((candidate) => candidate.type !== "VALIDAR")
            : undefined;
          if (!target) {
            diagnostics.push(
              diagnostic(
                "legacy_validation_target_missing",
                `${blockPath}.validation.targetBlockId`,
                "O target histórico de VALIDAR não pode ser comprovado nesta boundary.",
              ),
            );
          } else {
            validation.targetBlockId = target.id;
            adapted = true;
          }
        }
        const target = method.blocks
          .slice(0, blockIndex)
          .find((candidate) => candidate.id === validation.targetBlockId);
        if (!target) {
          diagnostics.push(
            diagnostic(
              "legacy_validation_target_missing",
              `${blockPath}.validation.targetBlockId`,
              "O target histórico de VALIDAR não existe antes da validação.",
            ),
          );
        } else if (!validation.targetOutputKey && validation.mode !== "approval") {
          const candidates = outputCandidatesForHistoricalSelection(target);
          if (candidates.length !== 1) {
            diagnostics.push(
              diagnostic(
                "legacy_validation_output_ambiguous",
                `${blockPath}.validation.targetOutputKey`,
                "A representação histórica não identifica uma única saída para seleção.",
              ),
            );
          } else {
            validation.targetOutputKey = candidates[0].key;
            adapted = true;
          }
        } else if (!validation.targetOutputKey && block.plugin) {
          const candidates = target.outputs ?? [];
          if (candidates.length === 1) {
            validation.targetOutputKey = candidates[0].key;
            adapted = true;
          } else if (candidates.length > 1) {
            diagnostics.push(
              diagnostic(
                "legacy_validation_output_ambiguous",
                `${blockPath}.validation.targetOutputKey`,
                "VALIDAR histórico por plugin possui múltiplas saídas materiais plausíveis.",
              ),
            );
          }
        }
      }
    }

    if (!block.plugin || !portAdaptationRequired(block)) return;
    const resolved = options.resolveCapability?.(block.plugin.pluginId, block.plugin.capabilityId);
    if (!resolved) {
      if (options.allowDeferredPluginPorts) {
        complete = false;
        return;
      }
      diagnostics.push(
        diagnostic(
          "legacy_plugin_missing",
          `${blockPath}.plugin`,
          "O plugin histórico necessário para materializar portas não está disponível.",
        ),
      );
      return;
    }
    if (options.requireFrozenPluginVersionForPorts && !block.plugin.pluginVersion) {
      diagnostics.push(
        diagnostic(
          "legacy_plugin_version_unfrozen",
          `${blockPath}.plugin.pluginVersion`,
          "Snapshot histórico sem versão de plugin não pode reconstruir portas de forma estável.",
        ),
      );
      return;
    }
    if (
      block.plugin.pluginVersion &&
      resolved.pluginVersion &&
      block.plugin.pluginVersion !== resolved.pluginVersion
    ) {
      diagnostics.push(
        diagnostic(
          "legacy_plugin_version_mismatch",
          `${blockPath}.plugin.pluginVersion`,
          "A versão instalada do plugin não corresponde à versão congelada no Método histórico.",
        ),
      );
      return;
    }

    const occupied = new Set<string>();
    for (const [inputIndex, methodInput] of (block.inputs ?? []).entries()) {
      if (methodInput.portKey) {
        const port = resolved.capability.inputPorts.find(
          (candidate) => candidate.key === methodInput.portKey,
        );
        if (
          !port ||
          !legacyTypeListAccepts(port.acceptedTypes, methodInput.type) ||
          (!port.multiple && occupied.has(port.key))
        ) {
          diagnostics.push(
            diagnostic(
              "legacy_input_port_ambiguous",
              `${blockPath}.inputs.${inputIndex}.portKey`,
              "A porta histórica de input é inválida ou está ocupada.",
            ),
          );
        } else if (!port.multiple) occupied.add(port.key);
        continue;
      }
      const candidates = resolved.capability.inputPorts.filter(
        (port) =>
          legacyTypeListAccepts(port.acceptedTypes, methodInput.type) &&
          (port.multiple || !occupied.has(port.key)),
      );
      if (candidates.length !== 1) {
        diagnostics.push(
          diagnostic(
            "legacy_input_port_ambiguous",
            `${blockPath}.inputs.${inputIndex}.portKey`,
            `informe portKey para a entrada ambígua “${methodInput.label}”.`,
          ),
        );
      } else {
        methodInput.portKey = candidates[0].key;
        if (!candidates[0].multiple) occupied.add(candidates[0].key);
        adapted = true;
      }
    }

    const targetOutput =
      block.type === "VALIDAR" && block.validation?.targetOutputKey
        ? method.blocks
            .slice(0, blockIndex)
            .find((candidate) => candidate.id === block.validation?.targetBlockId)
            ?.outputs?.find((output) => output.key === block.validation?.targetOutputKey)
        : undefined;
    if (targetOutput) {
      if (block.validation?.targetPortKey) {
        const port = resolved.capability.inputPorts.find(
          (candidate) => candidate.key === block.validation?.targetPortKey,
        );
        if (
          !port ||
          !legacyTypeListAccepts(port.acceptedTypes, targetOutput.type) ||
          (!port.multiple && occupied.has(port.key))
        ) {
          diagnostics.push(
            diagnostic(
              "legacy_validation_port_ambiguous",
              `${blockPath}.validation.targetPortKey`,
              "A porta histórica do target de VALIDAR é inválida ou está ocupada.",
            ),
          );
        }
      } else {
        const candidates = resolved.capability.inputPorts.filter(
          (port) =>
            legacyTypeListAccepts(port.acceptedTypes, targetOutput.type) &&
            (port.multiple || !occupied.has(port.key)),
        );
        if (candidates.length !== 1) {
          diagnostics.push(
            diagnostic(
              "legacy_validation_port_ambiguous",
              `${blockPath}.validation.targetPortKey`,
              "informe targetPortKey para o target ambíguo de VALIDAR.",
            ),
          );
        } else {
          block.validation!.targetPortKey = candidates[0].key;
          adapted = true;
        }
      }
    }

    if (block.type !== "ESCOLHER") {
      for (const [outputIndex, output] of (block.outputs ?? []).entries()) {
        if (output.portKey) {
          const port = resolved.capability.outputPorts.find(
            (candidate) => candidate.key === output.portKey,
          );
          if (!port || !legacyTypeListAccepts(port.producedTypes, output.type)) {
            diagnostics.push(
              diagnostic(
                "legacy_output_port_ambiguous",
                `${blockPath}.outputs.${outputIndex}.portKey`,
                "A porta histórica de output é inválida.",
              ),
            );
          }
          continue;
        }
        const candidates = resolved.capability.outputPorts.filter((port) =>
          legacyTypeListAccepts(port.producedTypes, output.type),
        );
        if (candidates.length !== 1) {
          diagnostics.push(
            diagnostic(
              "legacy_output_port_ambiguous",
              `${blockPath}.outputs.${outputIndex}.portKey`,
              `informe portKey para a saída ambígua “${output.label}”.`,
            ),
          );
        } else {
          output.portKey = candidates[0].key;
          adapted = true;
        }
      }
    }
  });

  if (diagnostics.length) return { ok: false, diagnostics, source: options.source };
  if (complete) method.contractVersion = CURRENT_METHOD_CONTRACT_VERSION;
  return { ok: true, method, adapted, complete, source: options.source };
}
