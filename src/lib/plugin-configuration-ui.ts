import type { PluginConfigurationOption } from "@/lib/plugin-contract";

export type PluginConfigurationScalar = string | number | boolean;

export function isPluginConfigurationScalar(value: unknown): value is PluginConfigurationScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function toPluginConfigurationRequest(
  configuration: Record<string, unknown> | undefined,
): Record<string, PluginConfigurationScalar> {
  return Object.fromEntries(
    Object.entries(configuration ?? {}).filter(
      (entry): entry is [string, PluginConfigurationScalar] =>
        isPluginConfigurationScalar(entry[1]),
    ),
  );
}

export function pluginConfigurationDependencySignature(
  configuration: Record<string, unknown> | undefined,
  dependencies: readonly string[],
): string {
  const scalarConfiguration = toPluginConfigurationRequest(configuration);
  return JSON.stringify(
    [...new Set(dependencies)]
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, scalarConfiguration[key] ?? null]),
  );
}

export function encodePluginConfigurationOptionValue(value: PluginConfigurationScalar): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

export function findPluginConfigurationOption(
  options: readonly PluginConfigurationOption[],
  encodedValue: string,
): PluginConfigurationOption | undefined {
  return options.find(
    (option) => encodePluginConfigurationOptionValue(option.value) === encodedValue,
  );
}

export function withSavedPluginConfigurationOption(
  options: readonly PluginConfigurationOption[],
  savedValue: PluginConfigurationScalar | undefined,
  unavailableLabel: string,
): PluginConfigurationOption[] {
  if (savedValue === undefined || options.some((option) => Object.is(option.value, savedValue))) {
    return [...options];
  }
  return [
    {
      value: savedValue,
      label: `${String(savedValue)} — ${unavailableLabel}`,
      disabled: true,
    },
    ...options,
  ];
}
