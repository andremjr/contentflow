import type { RegisteredPlugin } from "./plugin-runner";
import type { PersistentPluginJob } from "./plugin-job-store";

export type PluginConcurrencySlot = {
  key: string;
  limit: number;
};

export function pluginConcurrencySlot(
  plugin: RegisteredPlugin | undefined,
  job: PersistentPluginJob,
): PluginConcurrencySlot {
  return pluginConcurrencySlotForRequest(
    plugin,
    job.pluginId,
    job.capabilityId,
    job.request.configuration,
    job.profileFallback
      ? job.profileFallback.candidates[job.profileFallback.activeIndex]
      : undefined,
  );
}

export function pluginConcurrencySlotForRequest(
  plugin: RegisteredPlugin | undefined,
  pluginId: string,
  capabilityId: string,
  configuration: Record<string, unknown>,
  fallbackProfile?: string,
): PluginConcurrencySlot {
  const capability = plugin?.manifest.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );
  const declaredLimit = capability?.execution.maxConcurrency;
  const limit = Number.isInteger(declaredLimit)
    ? Math.max(1, Math.min(100, Number(declaredLimit)))
    : 1;
  const profileKey = plugin?.manifest.profileSetup?.configurationKey;
  const activeProfile = fallbackProfile
    ? fallbackProfile
    : profileKey
      ? String(configuration[profileKey] ?? "").trim()
      : "";

  return {
    key:
      profileKey && activeProfile
        ? `${pluginId}:profile:${activeProfile}`
        : `${pluginId}:capability:${capabilityId}`,
    limit,
  };
}
