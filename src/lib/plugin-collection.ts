import type { ChannelLibraryItem, RuntimeValue, StrategicCollection } from "@/lib/domain";

export function collectionItemValuesForPlugin(
  collection: StrategicCollection,
  item: ChannelLibraryItem,
) {
  return Object.fromEntries(
    collection.fields.map((field) => [
      field.label,
      (item.values[field.id] ?? null) as RuntimeValue,
    ]),
  );
}
