import type { ActionBlock, BlockInputBinding } from "@/lib/domain";
import { instructionInputKey, instructionReferencesInput } from "@/lib/instruction-template";
import type { PluginCapability } from "@/lib/plugin-contract";

type MappedInput = {
  input: BlockInputBinding;
  portKey?: string;
};

const DEFAULT_TEMPLATE = "{{BLOCK_INSTRUCTIONS}}\n\n{{CONTEXT_INPUTS}}";

function valueForInput(input: BlockInputBinding) {
  return `{{inputs.${instructionInputKey(input)}}}`;
}

function replaceAllLiteral(source: string, token: string, value: string) {
  return source.split(token).join(value);
}

function contextValue(inputs: MappedInput[]) {
  if (!inputs.length) return "";
  if (
    inputs.length === 1 &&
    ["content", "text", "prompt", "prompts"].includes(inputs[0].portKey ?? "")
  ) {
    return valueForInput(inputs[0].input);
  }
  return inputs
    .map(({ input, portKey }) => `${portKey ?? "entrada"}:\n${valueForInput(input)}`)
    .join("\n\n");
}

function outputContractValue(block: ActionBlock) {
  const outputs = block.outputs ?? [];
  if (outputs.length === 1) {
    const output = outputs[0];
    return `Entregue somente ${output.label} no formato ${output.type}, sem explicações adicionais.`;
  }
  if (!outputs.length) return "{{output.contract}}";
  return [
    "Retorne somente um objeto JSON válido, sem markdown, usando exatamente estas chaves:",
    ...outputs.map(
      (output) =>
        `- ${output.key}: ${output.label} (${output.type})${output.required ? ", obrigatório" : ""}`,
    ),
  ].join("\n");
}

/**
 * Renders the plugin-declared message shape without resolving project values.
 * It is deliberately limited to visible Method variables and never handles
 * connection settings or secrets.
 */
export function renderPluginPromptPreview(
  block: ActionBlock,
  capability: PluginCapability,
  mappedInputs: MappedInput[],
): string | undefined {
  if (capability.instructionUsage === "not_applicable" && !capability.promptPreview)
    return undefined;

  const preview = capability.promptPreview;
  const configurationTemplate = preview?.templateConfigurationKey
    ? block.plugin?.configuration[preview.templateConfigurationKey]
    : undefined;
  const template =
    typeof configurationTemplate === "string" && configurationTemplate.trim()
      ? configurationTemplate
      : preview?.template || DEFAULT_TEMPLATE;
  const unresolvedContext = mappedInputs.filter(
    ({ input }) => !instructionReferencesInput(block.instructions ?? "", input),
  );
  const inputByPort = new Map<string, BlockInputBinding[]>();
  for (const entry of mappedInputs) {
    if (!entry.portKey) continue;
    inputByPort.set(entry.portKey, [...(inputByPort.get(entry.portKey) ?? []), entry.input]);
  }

  let output = template;
  output = replaceAllLiteral(
    output,
    "{{BLOCK_INSTRUCTIONS}}",
    block.instructions?.trim() || "{{block.instructions}}",
  );
  output = replaceAllLiteral(output, "{{CHANNEL_NAME}}", "{{channel.name}}");
  output = replaceAllLiteral(output, "{{NICHE}}", "{{channel.niche}}");
  output = replaceAllLiteral(output, "{{NICHO}}", "{{channel.niche}}");
  output = replaceAllLiteral(output, "{{PROJECT_TITLE}}", "{{project.title}}");
  output = replaceAllLiteral(output, "{{PROCESS}}", "{{process.type}}");
  output = replaceAllLiteral(output, "{{BLOCK_NAME}}", block.name?.trim() || "{{block.name}}");
  output = replaceAllLiteral(output, "{{BLOCK_TYPE}}", block.type);
  output = replaceAllLiteral(output, "{{CONTENT}}", contextValue(unresolvedContext));
  output = replaceAllLiteral(output, "{{TEMA}}", contextValue(unresolvedContext));
  output = replaceAllLiteral(output, "{{CONTEXT_INPUTS}}", contextValue(unresolvedContext));
  output = replaceAllLiteral(output, "{{ALL_INPUTS}}", contextValue(mappedInputs));
  output = replaceAllLiteral(output, "{{OUTPUT_CONTRACT}}", outputContractValue(block));
  output = replaceAllLiteral(output, "{{SELECTED_COLLECTION}}", "{{collection.items}}");
  for (const [key, value] of Object.entries(block.plugin?.configuration ?? {})) {
    output = replaceAllLiteral(
      output,
      `{{CONFIG:${key}}}`,
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "",
    );
  }
  for (const [portKey, inputs] of inputByPort) {
    output = replaceAllLiteral(
      output,
      `{{INPUT:${portKey}}}`,
      contextValue(inputs.map((input) => ({ input, portKey }))),
    );
  }
  return output.replace(/\n{3,}/g, "\n\n").trim();
}
