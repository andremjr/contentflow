import type {
  PluginConfigurationOption,
  PluginConfigurationOptionsProvider,
  PluginExecutionResponse,
} from "../src/lib/plugin-contract";

type ScalarConfiguration = Record<string, string | number | boolean>;

type CacheEntry = {
  expiresAt: number;
  options: PluginConfigurationOption[];
};

function scalarKey(value: unknown) {
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "number" && Number.isFinite(value)) return `n:${value}`;
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
  return "u:";
}

export function configurationOptionsCacheKey(input: {
  pluginId: string;
  pluginVersion: string;
  capabilityId: string;
  provider: PluginConfigurationOptionsProvider;
  configuration: ScalarConfiguration;
  profileConfigurationKey?: string;
  connectionId?: string;
}) {
  const dependencies = new Set(input.provider.dependsOn ?? []);
  if (input.profileConfigurationKey) dependencies.add(input.profileConfigurationKey);
  const values = [...dependencies]
    .sort()
    .map((key) => [key, scalarKey(input.configuration[key])] as const);
  return JSON.stringify([
    input.pluginId,
    input.pluginVersion,
    input.capabilityId,
    input.connectionId ?? null,
    input.provider.providerId,
    input.provider.property,
    values,
  ]);
}

export function parseConfigurationOptionsResponse(
  response: PluginExecutionResponse,
): PluginConfigurationOption[] {
  if (response.status === "error") throw new Error(response.message);
  if (response.status !== "success") {
    throw new Error("A descoberta de opções precisa terminar na mesma chamada.");
  }
  const raw = response.values.options;
  if (!Array.isArray(raw)) throw new Error("O plugin não devolveu values.options como lista.");
  if (raw.length > 500) throw new Error("O plugin devolveu mais de 500 opções.");

  const seen = new Set<string>();
  return raw.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`A opção ${index + 1} é inválida.`);
    }
    const option = value as Record<string, unknown>;
    const optionValue = option.value;
    if (
      !["string", "number", "boolean"].includes(typeof optionValue) ||
      (typeof optionValue === "number" && !Number.isFinite(optionValue))
    ) {
      throw new Error(`A opção ${index + 1} possui value inválido.`);
    }
    if (typeof option.label !== "string" || !option.label.trim() || option.label.length > 200) {
      throw new Error(`A opção ${index + 1} possui label inválido.`);
    }
    if (
      option.description !== undefined &&
      (typeof option.description !== "string" || option.description.length > 500)
    ) {
      throw new Error(`A opção ${index + 1} possui description inválida.`);
    }
    if (option.disabled !== undefined && typeof option.disabled !== "boolean") {
      throw new Error(`A opção ${index + 1} possui disabled inválido.`);
    }
    const key = scalarKey(optionValue);
    if (seen.has(key)) throw new Error("O plugin devolveu valores de opção duplicados.");
    seen.add(key);
    return {
      value: optionValue as string | number | boolean,
      label: option.label.trim(),
      ...(option.description !== undefined ? { description: option.description } : {}),
      ...(option.disabled !== undefined ? { disabled: option.disabled } : {}),
    };
  });
}

export class PluginConfigurationOptionsCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.options;
  }

  set(key: string, options: PluginConfigurationOption[], ttlMs: number, now = Date.now()) {
    if (ttlMs <= 0) return;
    this.entries.set(key, { expiresAt: now + ttlMs, options });
  }

  clear() {
    this.entries.clear();
  }
}
