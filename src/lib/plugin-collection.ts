import type { ChannelLibraryItem, RuntimeValue, StrategicCollection } from "@/lib/domain";

export function collectionItemValuesForPlugin(
  collection: StrategicCollection,
  item: ChannelLibraryItem,
) {
  return Object.fromEntries(
    collection.fields.flatMap((field) => {
      const value = item.values[field.id];
      return value === undefined ? [] : [[field.label, value as RuntimeValue]];
    }),
  );
}
