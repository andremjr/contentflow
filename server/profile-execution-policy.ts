import type { ActionBlock, ProfileExecutionPolicy } from "../src/lib/domain";
import type { PluginProfileSetup } from "../src/lib/plugin-contract";

export type ResolvedProfileExecutionSnapshot = ProfileExecutionPolicy & {
  configurationKey: string;
  profiles: Array<{ profileId: string; alias: string }>;
};

export type LocalProfileExecutionValidation = {
  policy?: ProfileExecutionPolicy;
  error?: string;
};

function legacyFallbackAliases(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter((item, index, all) => item && all.indexOf(item) === index)
    : [];
}

export function normalizeStoredProfileExecution(
  value: unknown,
): ProfileExecutionPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Partial<ProfileExecutionPolicy> & { mode?: string };
  if (source.mode !== "single" && source.mode !== "fallback" && source.mode !== "parallel") {
    return undefined;
  }
  if (!Array.isArray(source.profileIds)) return undefined;
  const profileIds = source.profileIds
    .filter((profileId): profileId is string => typeof profileId === "string")
    .map((profileId) => profileId.trim())
    .filter((profileId, index, all) => profileId && all.indexOf(profileId) === index);
  if (!profileIds.length) return undefined;

  if (source.mode === "single") return { mode: "fallback", profileIds: [profileIds[0]] };
  if (source.mode === "fallback") {
    return { mode: "fallback", profileIds };
  }
  if (profileIds.length === 1) return { mode: "fallback", profileIds };
  const maxParallel =
    typeof source.maxParallel === "number" && Number.isFinite(source.maxParallel)
      ? Math.max(1, Math.min(profileIds.length, Math.trunc(source.maxParallel)))
      : profileIds.length;
  return { mode: "parallel", profileIds, maxParallel };
}

export function validateLocalProfileExecution(input: {
  policy: unknown;
  profileSetup?: PluginProfileSetup;
  isBoundProfile: (profileId: string) => boolean;
}): LocalProfileExecutionValidation {
  if (input.policy === undefined) return {};
  const policy = normalizeStoredProfileExecution(input.policy);
  if (!policy) {
    return { error: "A política local de perfis deste Bloco é inválida." };
  }
  if (!input.profileSetup) {
    return {
      error: "Este plugin não declara perfis de navegador para a política local deste Bloco.",
    };
  }
  const unbound = policy.profileIds.find((profileId) => !input.isBoundProfile(profileId));
  if (unbound) {
    return {
      error: "Um perfil selecionado não está vinculado localmente a este plugin.",
    };
  }
  return { policy };
}

export function clearImportedProfileAssociations(input: {
  blocks: ActionBlock[];
  profileSetupForPlugin: (pluginId: string) => PluginProfileSetup | undefined;
}) {
  return input.blocks.map((block) => {
    if (!block.plugin) return block;
    const setup = input.profileSetupForPlugin(block.plugin.pluginId);
    if (!setup) return block;
    const configuration = { ...block.plugin.configuration };
    delete configuration[setup.configurationKey];
    if (setup.fallbackConfigurationKey) delete configuration[setup.fallbackConfigurationKey];
    return {
      ...block,
      plugin: {
        ...block.plugin,
        configuration,
        profileExecution: undefined,
      },
    };
  });
}

export function materializeLocalProfileExecution(input: {
  blocks: ActionBlock[];
  profileSetupForPlugin: (pluginId: string) => PluginProfileSetup | undefined;
  resolveAlias: (pluginId: string, alias: string) => { profileId: string } | undefined;
}) {
  return input.blocks.map((block) => {
    if (!block.plugin) return block;
    const stored = normalizeStoredProfileExecution(block.plugin.profileExecution);
    if (stored) {
      return { ...block, plugin: { ...block.plugin, profileExecution: stored } };
    }

    const setup = input.profileSetupForPlugin(block.plugin.pluginId);
    if (!setup) return block;
    const primaryAlias = String(block.plugin.configuration[setup.configurationKey] ?? "").trim();
    if (!primaryAlias) return block;
    const aliases = [
      primaryAlias,
      ...(setup.fallbackConfigurationKey
        ? legacyFallbackAliases(block.plugin.configuration[setup.fallbackConfigurationKey])
        : []),
    ].filter(
      (alias, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLocaleLowerCase() === alias.toLocaleLowerCase(),
        ) === index,
    );
    const resolved = aliases.map((alias) => input.resolveAlias(block.plugin!.pluginId, alias));
    if (resolved.some((profile) => !profile)) return block;
    const uniqueProfileIds = resolved
      .map((profile) => profile!.profileId)
      .filter((profileId, index, all) => all.indexOf(profileId) === index);
    if (!uniqueProfileIds.length) return block;
    const profileExecution: ProfileExecutionPolicy = {
      mode: "fallback",
      profileIds: uniqueProfileIds,
    };
    return { ...block, plugin: { ...block.plugin, profileExecution } };
  });
}

export function resolveProfileExecutionSnapshot(input: {
  policy: unknown;
  configurationKey: string;
  resolveProfile: (
    profileId: string,
  ) => { profileId: string; alias: string; readinessState?: string } | undefined;
}): ResolvedProfileExecutionSnapshot | undefined {
  const policy = normalizeStoredProfileExecution(input.policy);
  if (!policy) return undefined;

  const profiles = policy.profileIds.map((profileId) => {
    const resolved = input.resolveProfile(profileId);
    if (!resolved) {
      throw new Error("Um perfil selecionado não está mais vinculado a este plugin.");
    }
    if (resolved.readinessState !== "ready") {
      throw new Error(`O perfil ${resolved.alias} ainda não está preparado para este plugin.`);
    }
    return { profileId: resolved.profileId, alias: resolved.alias };
  });

  return {
    ...policy,
    configurationKey: input.configurationKey,
    profiles,
  };
}
