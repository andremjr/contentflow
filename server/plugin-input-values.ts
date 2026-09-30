import type { BlockInputBinding, RuntimeValue } from "../src/lib/domain";
import type { PluginInputPort } from "../src/lib/plugin-contract";
import { areValueShapesCompatible } from "../src/lib/data-shape";

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
  if (!port || !areValueShapesCompatible(input.shape, port.shape) || usedInputPorts.has(port.key)) {
    return undefined;
  }
  return port;
}

export function composePluginPortValue(
  assignedInputs: AssignedPluginInput[],
): RuntimeValue | undefined {
  if (!assignedInputs.length) return undefined;
  return assignedInputs.length === 1 ? (assignedInputs[0].value ?? null) : undefined;
}
