import type { RuntimeValue } from "../src/lib/domain";

type AssignedPluginInput = {
  label: string;
  value: RuntimeValue;
};

export function composePluginPortValue(
  assignedInputs: AssignedPluginInput[],
): RuntimeValue | undefined {
  if (!assignedInputs.length) return undefined;
  if (assignedInputs.length === 1) return assignedInputs[0].value ?? null;

  return assignedInputs
    .map(({ label, value }) => `${label}: ${JSON.stringify(value ?? null)}`)
    .join("\n");
}
