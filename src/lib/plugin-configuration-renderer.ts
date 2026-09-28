import type { JsonSchema, PluginCapability, PluginProfileSetup } from "@/lib/plugin-contract";

export type PluginConfigurationEntry = [string, JsonSchema];

export type PluginConfigurationRendererModel = {
  capabilityEntries: PluginConfigurationEntry[];
  generationModeOptions: Array<string | number | boolean>;
  sequenceModeValue?: string;
  supportsItemSequence: boolean;
  simpleGenerationMode: string;
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
  const generationModeSchema = configProperties.generationMode;
  const generationModeOptions = [
    ...(generationModeSchema?.enum ?? []),
    ...(generationModeSchema?.oneOf?.map((option) => option.const) ?? []),
  ].filter(
    (value): value is string | number | boolean =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  );
  const sequenceModeValue = generationModeOptions.includes("sequence")
    ? "sequence"
    : generationModeOptions.includes("outline_sequence")
      ? "outline_sequence"
      : undefined;
  const supportsItemSequence =
    generationModeOptions.includes("single") && Boolean(sequenceModeValue);
  const generationMode = configuration.generationMode;
  const simpleGenerationMode = generationModeOptions.includes(generationMode as never)
    ? String(generationMode)
    : String(generationModeSchema?.default ?? "single");
  const isVisible = (schema: JsonSchema) => {
    const rule = schema.visibleWhen;
    return !rule || rule.values.includes(configuration[rule.property] as never);
  };
  const capabilityEntries = Object.entries(configProperties).filter(
    ([key, schema]) =>
      isVisible(schema) &&
      !(supportsItemSequence && key === "generationMode") &&
      !profileConfigurationKeys.includes(key),
  );

  return {
    capabilityEntries,
    generationModeOptions,
    sequenceModeValue,
    supportsItemSequence,
    simpleGenerationMode,
  };
}
