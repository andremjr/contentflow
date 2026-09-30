import type { BlockFieldDefinition } from "../src/lib/domain";
import type { PluginFieldContract, PluginOutputPort } from "../src/lib/plugin-contract";
import { areValueShapesCompatible } from "../src/lib/data-shape";

export type PluginOutputContractValidation = {
  outputContract: PluginFieldContract[];
  unsupportedFields: BlockFieldDefinition[];
};

/**
 * Validates already-materialized Method bindings without selecting a port.
 * Type compatibility confirms an explicit binding; it never creates one.
 */
export function validatePluginOutputContract(
  fields: BlockFieldDefinition[],
  ports: PluginOutputPort[],
): PluginOutputContractValidation {
  const unsupportedFields = fields.filter((field) => {
    if (!field.portKey) return true;
    const port = ports.find((candidate) => candidate.key === field.portKey);
    return !port || !areValueShapesCompatible(port.shape, field.shape);
  });

  if (unsupportedFields.length) return { outputContract: [], unsupportedFields };

  return {
    unsupportedFields: [],
    outputContract: fields.map((field) => ({
      label: field.label,
      key: field.key,
      shape: field.shape,
      required: field.required,
      presentation: field.presentation,
      portKey: field.portKey!,
    })),
  };
}
