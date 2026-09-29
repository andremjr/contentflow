import type { BlockInputBinding, RuntimeValue } from "../src/lib/domain";
import type { PluginInputPort } from "../src/lib/plugin-contract";
import { legacyTypeListAccepts } from "../src/lib/data-shape";

type AssignedPluginInput = {
  label: string;
  value: RuntimeValue;
};

export function selectPluginInputPort(
  input: BlockInputBinding,
  ports: PluginInputPort[],
  usedInputPorts: ReadonlySet<string>,
) {
  if (!input.portKey) return undefined;
  const port = ports.find((candidate) => candidate.key === input.portKey);
  if (
    !port ||
    !legacyTypeListAccepts(port.acceptedTypes, input.type) ||
    (!port.multiple && usedInputPorts.has(port.key))
  ) {
    return undefined;
  }
  return port;
}

export function composePluginPortValue(
  assignedInputs: AssignedPluginInput[],
): RuntimeValue | undefined {
  if (!assignedInputs.length) return undefined;
  if (assignedInputs.length === 1) return assignedInputs[0].value ?? null;

  return assignedInputs
    .map(({ label, value }) => `${label}: ${JSON.stringify(value ?? null)}`)
    .join("\n");
}
