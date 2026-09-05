import type { ProcessExecution, ProcessOutput } from "./domain";
import { createProcessOutputFields, isEmptyRuntimeValue } from "./human-workflow";

export function deriveProcessOutput(execution: ProcessExecution): ProcessOutput | undefined {
  const [definition] = createProcessOutputFields(execution.processType);
  const legacyKey = `final_${execution.processType}`;
  for (let index = execution.methodSnapshot.blocks.length - 1; index >= 0; index -= 1) {
    const block = execution.methodSnapshot.blocks[index];
    const blockExecution = execution.blocks.find((item) => item.blockId === block.id);
    if (block.type === "VALIDAR") {
      if (block.validation?.mode === "approval") continue;
      const selectionKey =
        block.validation?.mode === "select_many" ? "selected_values" : "selected_value";
      const selectedValue = blockExecution?.values[selectionKey];
      if (selectedValue === undefined || isEmptyRuntimeValue(selectedValue)) continue;
      return {
        processType: execution.processType,
        values: { [definition.key]: structuredClone(selectedValue) },
        sourceBlockId: block.id,
        createdAt: new Date().toISOString(),
      };
    }
    if (block.type === "ESCOLHER") continue;
    const compatibleOutput = block.outputs?.find(
      (field) =>
        (field.key === definition.key || field.key === legacyKey) && field.type === definition.type,
    );
    if (!compatibleOutput) continue;
    const value = blockExecution?.values[definition.key] ?? blockExecution?.values[legacyKey];
    if (value === undefined || isEmptyRuntimeValue(value)) continue;
    return {
      processType: execution.processType,
      values: { [definition.key]: structuredClone(value) },
      sourceBlockId: block.id,
      createdAt: new Date().toISOString(),
    };
  }
  return undefined;
}
