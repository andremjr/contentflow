import type { JsonSchema, PluginCapability, PluginProfileSetup } from "@/lib/plugin-contract";

export type PluginConfigurationEntry = [string, JsonSchema];

export type PluginConfigurationRendererModel = {
  capabilityEntries: PluginConfigurationEntry[];
  advancedEntries: PluginConfigurationEntry[];
};

export function buildPluginConfigurationRendererModel({
  capability,
  configuration,
  profileSetup,
}: {
  capability: PluginCapability;
  configuration: Record<string, string | number | boolean>;
  profileSetup?: PluginProfileSetup;
}): PluginConfigurationRendererModel {
  const configProperties = capability.blockConfigSchema.properties ?? {};
  const profileConfigurationKeys = [
    profileSetup?.configurationKey,
    profileSetup?.fallbackConfigurationKey,
  ].filter((key): key is string => Boolean(key));
  const effectiveConfiguration = Object.fromEntries(
    Object.entries(configProperties).map(([key, schema]) => [
      key,
      configuration[key] ?? schema.default,
    ]),
  );
  const isVisible = (schema: JsonSchema) => {
    const rule = schema.visibleWhen;
    return !rule || rule.values.includes(effectiveConfiguration[rule.property] as never);
  };
  const visibleEntries = Object.entries(configProperties).filter(
    ([key, schema]) => isVisible(schema) && !profileConfigurationKeys.includes(key),
  );
  const sortEntries = (entries: PluginConfigurationEntry[]) =>
    entries
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          (left.entry[1].ui?.order ?? left.index) - (right.entry[1].ui?.order ?? right.index),
      )
      .map(({ entry }) => entry);
  const capabilityEntries = sortEntries(
    visibleEntries.filter(([, schema]) => schema.ui?.section !== "advanced"),
  );
  const advancedEntries = sortEntries(
    visibleEntries.filter(([, schema]) => schema.ui?.section === "advanced"),
  );

  return {
    capabilityEntries,
    advancedEntries,
  };
}
