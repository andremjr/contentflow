import type { ProcessExecution, ProcessOutput, RuntimeValue } from "./domain";
import { areValueShapesCompatible } from "./data-shape";
import { createProcessOutputFields, isEmptyRuntimeValue } from "./human-workflow";

export function deriveProcessOutput(execution: ProcessExecution): ProcessOutput | undefined {
  const definitions = createProcessOutputFields(execution.processType);
  for (let index = execution.methodSnapshot.blocks.length - 1; index >= 0; index -= 1) {
    const block = execution.methodSnapshot.blocks[index];
    if (block.type === "ESCOLHER") continue;
    const blockExecution = execution.blocks.find((item) => item.blockId === block.id);
    if (!blockExecution) continue;

    if (block.type === "VALIDAR" && block.validation?.mode !== "approval") {
      const selectionKey =
        block.validation?.mode === "select_many" ? "selected_values" : "selected_value";
      const selectedValue = blockExecution.values[selectionKey];
      const selectedDefinition = block.outputs?.find((field) => field.key === selectionKey);
      const processDefinition = definitions.find(
        (field) =>
          selectedDefinition && areValueShapesCompatible(selectedDefinition.shape, field.shape),
      );
      if (processDefinition && selectedValue !== undefined && !isEmptyRuntimeValue(selectedValue)) {
        return processOutput(execution, block.id, {
          [processDefinition.key]: structuredClone(selectedValue),
        });
      }
      continue;
    }

    const values: Record<string, RuntimeValue> = {};
    for (const definition of definitions) {
      const output = block.outputs?.find(
        (field) =>
          field.key === definition.key && areValueShapesCompatible(field.shape, definition.shape),
      );
      const value = output ? blockExecution.values[output.key] : undefined;
      if (value !== undefined && !isEmptyRuntimeValue(value)) {
        values[definition.key] = structuredClone(value);
      }
    }
    if (Object.keys(values).length) return processOutput(execution, block.id, values);
  }
  return undefined;
}

function processOutput(
  execution: ProcessExecution,
  sourceBlockId: string,
  values: Record<string, RuntimeValue>,
): ProcessOutput {
  return {
    processType: execution.processType,
    values,
    sourceBlockId,
    createdAt: new Date().toISOString(),
  };
}
