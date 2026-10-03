import type { ActionBlock, BlockFieldDefinition, BlockInputBinding } from "./domain";
import type { PluginInputPort, PluginOutputPort } from "./plugin-contract";
import { areValueShapesCompatible } from "./data-shape";

export function addPluginOutput(block: ActionBlock, port: PluginOutputPort): ActionBlock {
  if (port.shape.kind !== "content") return block;
  if ((block.outputs ?? []).some((field) => field.portKey === port.key)) return block;
  const keys = new Set((block.outputs ?? []).map((field) => field.key));
  let key = port.key;
  for (let suffix = 2; keys.has(key); suffix++) key = `${port.key}_${suffix}`;
  const field: BlockFieldDefinition = {
    id: `${block.id}-plugin-output-${key}`,
    label: port.label,
    key,
    portKey: port.key,
    shape: structuredClone(port.shape),
    required: port.required,
    ...(port.presentation ? { presentation: structuredClone(port.presentation) } : {}),
  };
  return { ...block, outputs: [...(block.outputs ?? []), field] };
}

export function pluginInputSources(blocks: ActionBlock[], blockId: string, port: PluginInputPort) {
  const index = blocks.findIndex((block) => block.id === blockId);
  return blocks
    .slice(0, Math.max(0, index))
    .flatMap((block) =>
      (block.outputs ?? [])
        .filter(
          (field) =>
            field.shape.kind === "content" && areValueShapesCompatible(field.shape, port.shape),
        )
        .map((field) => ({ block, field, value: JSON.stringify([block.id, field.key]) })),
    );
}

export function bindPluginInput(
  block: ActionBlock,
  blocks: ActionBlock[],
  port: PluginInputPort,
  source: string,
): ActionBlock {
  const inputs = (block.inputs ?? []).filter((input) => input.portKey !== port.key);
  if (!source) return { ...block, inputs };
  const selected = pluginInputSources(blocks, block.id, port).find((item) => item.value === source);
  if (!selected) throw new Error("Invalid plugin input source");
  const existing = (block.inputs ?? []).find((input) => input.portKey === port.key);
  const input: BlockInputBinding = {
    id: existing?.id ?? `${block.id}-plugin-input-${port.key}`,
    label: port.label,
    portKey: port.key,
    shape: structuredClone(port.shape),
    binding: { kind: "previous_block", blockId: selected.block.id, outputKey: selected.field.key },
  };
  return { ...block, inputs: [...inputs, input] };
}
