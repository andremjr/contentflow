import type {
  JsonSchema,
  PluginCapability,
  PluginLocalizedSchemaProperty,
  PluginManifest,
  PluginManifestLocalization,
} from "./plugin-contract";

function canonicalLocale(locale: string) {
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return undefined;
  }
}

function findLocaleOverlay(
  localizations: Record<string, PluginManifestLocalization> | undefined,
  locale: string,
) {
  if (!localizations) return undefined;
  const requested = canonicalLocale(locale);
  if (!requested) return undefined;
  const entries = Object.entries(localizations);
  const exact = entries.find(([key]) => canonicalLocale(key) === requested)?.[1];
  const language = requested.split("-")[0]?.toLowerCase();
  const base = entries.find(([key]) => {
    const canonical = canonicalLocale(key);
    return canonical && !canonical.includes("-") && canonical.toLowerCase() === language;
  })?.[1];
  return { base, exact };
}

function applySchemaLocalization(schema: JsonSchema, translation: PluginLocalizedSchemaProperty) {
  const localized = structuredClone(schema);
  if (translation.title) localized.title = translation.title;
  if (translation.description) localized.description = translation.description;
  if (translation.options?.length) {
    const labels = new Map<string, string>(
      translation.options.map((option) => [JSON.stringify(option.value), option.label]),
    );
    if (localized.oneOf?.length) {
      localized.oneOf = localized.oneOf.map((option) => {
        if (option.const === undefined) return option;
        const label = labels.get(JSON.stringify(option.const));
        return label ? { ...option, title: label } : option;
      });
    } else if (localized.enum?.length) {
      localized.oneOf = localized.enum.map((value) => ({
        const: value,
        title: labels.get(JSON.stringify(value)) ?? String(value),
      }));
    }
  }
  return localized;
}

function applyCapabilityOverlay(
  capability: PluginCapability,
  overlay: NonNullable<PluginManifestLocalization["capabilities"]>[string] | undefined,
) {
  if (!overlay) return capability;
  const localized = structuredClone(capability);
  if (overlay.name) localized.name = overlay.name;
  if (overlay.description) localized.description = overlay.description;
  localized.inputPorts = localized.inputPorts.map((port) => ({
    ...port,
    ...(overlay.inputPorts?.[port.key]?.label
      ? { label: overlay.inputPorts[port.key]!.label }
      : {}),
    ...(overlay.inputPorts?.[port.key]?.description
      ? { description: overlay.inputPorts[port.key]!.description }
      : {}),
  }));
  localized.outputPorts = localized.outputPorts.map((port) => ({
    ...port,
    ...(overlay.outputPorts?.[port.key]?.label
      ? { label: overlay.outputPorts[port.key]!.label }
      : {}),
    ...(overlay.outputPorts?.[port.key]?.description
      ? { description: overlay.outputPorts[port.key]!.description }
      : {}),
  }));
  localized.itemActions = localized.itemActions?.map((action) => ({
    ...action,
    ...(overlay.itemActions?.[action.action]?.label
      ? { label: overlay.itemActions[action.action]!.label }
      : {}),
  }));
  const propertyTranslations = overlay.blockConfigSchema?.properties;
  if (propertyTranslations && localized.blockConfigSchema.properties) {
    localized.blockConfigSchema.properties = Object.fromEntries(
      Object.entries(localized.blockConfigSchema.properties).map(([key, schema]) => [
        key,
        propertyTranslations[key]
          ? applySchemaLocalization(schema, propertyTranslations[key]!)
          : schema,
      ]),
    );
  }
  return localized;
}

function mergeCapabilityOverlay(
  base: NonNullable<PluginManifestLocalization["capabilities"]>[string] | undefined,
  exact: NonNullable<PluginManifestLocalization["capabilities"]>[string] | undefined,
) {
  if (!base) return exact;
  if (!exact) return base;
  return {
    ...base,
    ...exact,
    inputPorts: { ...base.inputPorts, ...exact.inputPorts },
    outputPorts: { ...base.outputPorts, ...exact.outputPorts },
    itemActions: { ...base.itemActions, ...exact.itemActions },
    blockConfigSchema: {
      properties: {
        ...base.blockConfigSchema?.properties,
        ...exact.blockConfigSchema?.properties,
      },
    },
  };
}

export function localizePluginManifest(manifest: PluginManifest, locale: string): PluginManifest {
  const overlays = findLocaleOverlay(manifest.localizations, locale);
  if (!overlays?.base && !overlays?.exact) return manifest;
  const base = overlays.base;
  const exact = overlays.exact;
  const localized = structuredClone(manifest);
  localized.name = exact?.name ?? base?.name ?? manifest.name;
  localized.description = exact?.description ?? base?.description ?? manifest.description;
  if (localized.profileSetup) {
    localized.profileSetup.label =
      exact?.profileSetup?.label ?? base?.profileSetup?.label ?? localized.profileSetup.label;
    localized.profileSetup.description =
      exact?.profileSetup?.description ??
      base?.profileSetup?.description ??
      localized.profileSetup.description;
  }
  localized.capabilities = localized.capabilities.map((capability) =>
    applyCapabilityOverlay(
      capability,
      mergeCapabilityOverlay(
        base?.capabilities?.[capability.id],
        exact?.capabilities?.[capability.id],
      ),
    ),
  );
  return localized;
}

export function isValidPluginLocale(locale: string) {
  return Boolean(canonicalLocale(locale));
}
