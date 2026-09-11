import type { ActionBlock, BlockFieldDefinition, StrategicCollection } from "./domain";

export function getBlockSourceFields(
  block: ActionBlock | undefined,
  collections: StrategicCollection[],
): BlockFieldDefinition[] {
  if (!block) return [];

  const declaredOutputs = block.outputs ?? [];
  if (block.type !== "ESCOLHER" || !block.collectionId) return declaredOutputs;

  const collection = collections.find((candidate) => candidate.id === block.collectionId);
  if (!collection) return declaredOutputs;

  const declaredKeys = new Set(declaredOutputs.map((output) => output.key));
  const collectionFields: BlockFieldDefinition[] = collection.fields
    .filter((field) => !declaredKeys.has(field.id))
    .map((field) => ({
      id: `collection-field:${field.id}`,
      label: field.label,
      key: field.id,
      type: field.type,
      required: field.required,
      presentation: { renderer: "auto" },
    }));

  return [...declaredOutputs, ...collectionFields];
}
