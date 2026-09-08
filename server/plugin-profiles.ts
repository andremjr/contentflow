import type Database from "better-sqlite3";
import type { PluginProfileSetup } from "../src/lib/plugin-contract";
import type { UniversalProcess } from "../src/lib/domain";

export type PluginProfile = {
  id: string;
  pluginId: string;
  name: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
};

export type PluginProfileUsage = {
  channelId: string;
  channelName: string;
  processType: UniversalProcess;
  methodName: string;
  blockId: string;
  blockName: string;
  role: "primary" | "fallback";
  fallbackPosition?: number;
};

type ProfileRow = {
  id: string;
  plugin_id: string;
  name: string;
  alias: string;
  created_at: string;
  updated_at: string;
};

const PROFILE_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.\s-]{0,63}$/;
const processTypes = new Set<UniversalProcess>([
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fromRow(row: ProfileRow): PluginProfile {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    alias: row.alias,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePluginProfileAlias(value: unknown) {
  const alias = typeof value === "string" ? value.trim() : "";
  if (!PROFILE_ALIAS.test(alias)) {
    throw new Error(
      "Informe um nome com até 64 caracteres, começando por letra ou número e usando apenas letras, números, espaços, ponto, hífen ou sublinhado.",
    );
  }
  return alias;
}

export function normalizePluginProfileName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 80) {
    throw new Error("Informe um nome de perfil com até 80 caracteres.");
  }
  return name;
}

export function pluginProfileAliasFromName(name: string) {
  const alias = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .trim()
    .slice(0, 48)
    .replace(/-+$/, "");
  return PROFILE_ALIAS.test(alias) ? alias : "";
}

function fallbackAliases(value: unknown) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((alias) => alias.trim())
    .filter(
      (alias, index, aliases) => PROFILE_ALIAS.test(alias) && aliases.indexOf(alias) === index,
    );
}

export function findPluginProfileUsages(
  channels: unknown[],
  pluginId: string,
  setup: PluginProfileSetup,
): Map<string, PluginProfileUsage[]> {
  const usages = new Map<string, PluginProfileUsage[]>();
  const add = (alias: string, usage: PluginProfileUsage) => {
    const key = alias.toLocaleLowerCase();
    usages.set(key, [...(usages.get(key) ?? []), usage]);
  };

  for (const channelValue of channels) {
    const channel = record(channelValue);
    const channelId = typeof channel?.id === "string" ? channel.id : "";
    const channelName =
      typeof channel?.name === "string" && channel.name.trim()
        ? channel.name.trim()
        : "Canal sem nome";
    const methods = record(channel?.methods);
    if (!channelId || !methods) continue;

    for (const [processKey, methodValue] of Object.entries(methods)) {
      if (!processTypes.has(processKey as UniversalProcess)) continue;
      const method = record(methodValue);
      const blocks = method?.blocks;
      if (!Array.isArray(blocks)) continue;
      const methodName =
        typeof method?.name === "string" && method.name.trim()
          ? method.name.trim()
          : `Método de ${processKey}`;

      for (const blockValue of blocks) {
        const block = record(blockValue);
        const plugin = record(block?.plugin);
        const configuration = record(plugin?.configuration);
        if (!block || plugin?.pluginId !== pluginId || !configuration) continue;
        const base = {
          channelId,
          channelName,
          processType: processKey as UniversalProcess,
          methodName,
          blockId: typeof block.id === "string" ? block.id : "",
          blockName:
            typeof block.name === "string" && block.name.trim()
              ? block.name.trim()
              : typeof block.type === "string"
                ? block.type
                : "Bloco sem nome",
        };
        const primary = String(configuration[setup.configurationKey] ?? "").trim();
        if (PROFILE_ALIAS.test(primary)) add(primary, { ...base, role: "primary" });
        if (!setup.fallbackConfigurationKey) continue;
        fallbackAliases(configuration[setup.fallbackConfigurationKey]).forEach((alias, index) =>
          add(alias, { ...base, role: "fallback", fallbackPosition: index + 1 }),
        );
      }
    }
  }
  return usages;
}

export class PluginProfileStore {
  constructor(private readonly database: Database.Database) {}

  list(pluginId: string) {
    return (
      this.database
        .prepare(
          `SELECT id, plugin_id, name, alias, created_at, updated_at
           FROM plugin_profiles WHERE plugin_id = ? ORDER BY lower(name), created_at`,
        )
        .all(pluginId) as ProfileRow[]
    ).map(fromRow);
  }

  get(pluginId: string, profileId: string) {
    const row = this.database
      .prepare(
        `SELECT id, plugin_id, name, alias, created_at, updated_at
         FROM plugin_profiles WHERE plugin_id = ? AND id = ?`,
      )
      .get(pluginId, profileId) as ProfileRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  findByAlias(pluginId: string, alias: string) {
    const row = this.database
      .prepare(
        `SELECT id, plugin_id, name, alias, created_at, updated_at
         FROM plugin_profiles WHERE plugin_id = ? AND alias = ? COLLATE NOCASE`,
      )
      .get(pluginId, alias) as ProfileRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  create(input: { id: string; pluginId: string; name: string; alias: string }) {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.pluginId, input.name, input.alias, now, now);
    return this.get(input.pluginId, input.id)!;
  }

  ensure(input: { id: string; pluginId: string; alias: string }) {
    return (
      this.findByAlias(input.pluginId, input.alias) ?? this.create({ ...input, name: input.alias })
    );
  }

  rename(pluginId: string, profileId: string, name: string) {
    const result = this.database
      .prepare(
        `UPDATE plugin_profiles SET name = ?, updated_at = ?
         WHERE plugin_id = ? AND id = ?`,
      )
      .run(name, new Date().toISOString(), pluginId, profileId);
    return result.changes ? this.get(pluginId, profileId) : undefined;
  }

  remove(pluginId: string, profileId: string) {
    return this.database
      .prepare("DELETE FROM plugin_profiles WHERE plugin_id = ? AND id = ?")
      .run(pluginId, profileId).changes;
  }
}

export function syncPluginProfilesFromMethods(
  store: PluginProfileStore,
  channels: unknown[],
  pluginId: string,
  setup: PluginProfileSetup,
  createId: () => string,
) {
  const usages = findPluginProfileUsages(channels, pluginId, setup);
  for (const channelValue of channels) {
    const methods = record(record(channelValue)?.methods);
    if (!methods) continue;
    for (const methodValue of Object.values(methods)) {
      const method = record(methodValue);
      if (!Array.isArray(method?.blocks)) continue;
      for (const blockValue of method.blocks) {
        const plugin = record(record(blockValue)?.plugin);
        const configuration = record(plugin?.configuration);
        if (plugin?.pluginId !== pluginId || !configuration) continue;
        const aliases = [
          String(configuration[setup.configurationKey] ?? "").trim(),
          ...(setup.fallbackConfigurationKey
            ? fallbackAliases(configuration[setup.fallbackConfigurationKey])
            : []),
        ];
        for (const alias of aliases) {
          if (PROFILE_ALIAS.test(alias)) {
            store.ensure({ id: createId(), pluginId, alias });
          }
        }
      }
    }
  }
  return usages;
}
