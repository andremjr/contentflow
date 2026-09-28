import type Database from "better-sqlite3";
import path from "node:path";
import {
  normalizePluginProfileAlias,
  normalizePluginProfileName,
  type PluginProfileUsage,
} from "./plugin-profiles";

export type BrowserProfileStorageKind = "managed" | "legacy";

export type BrowserProfile = {
  id: string;
  name: string;
  alias: string;
  storageKind: BrowserProfileStorageKind;
  storageKey: string;
  createdAt: string;
  updatedAt: string;
};

export type PluginProfileBinding = {
  pluginId: string;
  profileId: string;
  createdAt: string;
  updatedAt: string;
};

export type PluginProfileReadiness = {
  pluginId: string;
  profileId: string;
  state: string;
  checkedAt?: string;
  preparedAt?: string;
  metadata: Record<string, unknown>;
};

export type PublicBrowserProfile = Pick<
  BrowserProfile,
  "id" | "name" | "alias" | "createdAt" | "updatedAt"
>;

export type PublicPluginProfileReadiness = Pick<
  PluginProfileReadiness,
  "state" | "checkedAt" | "preparedAt"
>;

export type BrowserProfileInventory = {
  linked: Array<{
    profile: PublicBrowserProfile;
    binding: PluginProfileBinding;
    readiness?: PublicPluginProfileReadiness;
  }>;
  candidates: Array<{
    profile: PublicBrowserProfile;
    linkedPluginIds: string[];
  }>;
  uses: Array<{
    profileId: string;
    pluginId: string;
    methods: PluginProfileUsage[];
  }>;
};

type BrowserProfileRow = {
  id: string;
  name: string;
  alias: string;
  storage_kind: BrowserProfileStorageKind;
  storage_key: string;
  created_at: string;
  updated_at: string;
};

type BindingRow = {
  plugin_id: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
};

type ReadinessRow = {
  plugin_id: string;
  profile_id: string;
  state: string;
  checked_at: string | null;
  prepared_at: string | null;
  metadata: string;
};

type LegacyProfileRow = {
  id: string;
  plugin_id: string;
  alias: string;
};

type BoundProfileRow = BrowserProfileRow & {
  plugin_id: string;
};

export type LegacyBrowserProfileResolution = {
  pluginId: string;
  alias: string;
  profile: BrowserProfile;
  binding: PluginProfileBinding;
  profileDirectory: string;
  source: "legacy" | "global";
};

export type BoundBrowserProfileResolution = {
  pluginId: string;
  profile: BrowserProfile;
  binding: PluginProfileBinding;
  profileDirectory: string;
};

export type LegacyBrowserProfileResolutionErrorCode = "not_found" | "ambiguous" | "inconsistent";

export class LegacyBrowserProfileResolutionError extends Error {
  constructor(
    public readonly code: LegacyBrowserProfileResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LegacyBrowserProfileResolutionError";
  }
}

function profileFromRow(row: BrowserProfileRow): BrowserProfile {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    storageKind: row.storage_kind,
    storageKey: row.storage_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bindingFromRow(row: BindingRow): PluginProfileBinding {
  return {
    pluginId: row.plugin_id,
    profileId: row.profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readinessMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readinessFromRow(row: ReadinessRow): PluginProfileReadiness {
  return {
    pluginId: row.plugin_id,
    profileId: row.profile_id,
    state: row.state,
    ...(row.checked_at ? { checkedAt: row.checked_at } : {}),
    ...(row.prepared_at ? { preparedAt: row.prepared_at } : {}),
    metadata: readinessMetadata(row.metadata),
  };
}

function publicProfile(profile: BrowserProfile): PublicBrowserProfile {
  return {
    id: profile.id,
    name: profile.name,
    alias: profile.alias,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function publicReadiness(readiness: PluginProfileReadiness): PublicPluginProfileReadiness {
  return {
    state: readiness.state,
    ...(readiness.checkedAt ? { checkedAt: readiness.checkedAt } : {}),
    ...(readiness.preparedAt ? { preparedAt: readiness.preparedAt } : {}),
  };
}

function normalizeIdentifier(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label} inválido.`);
  return normalized;
}

export function normalizeBrowserProfileStorageKey(value: unknown) {
  const key = typeof value === "string" ? value.trim().replaceAll("\\", "/") : "";
  if (
    !key ||
    key.startsWith("/") ||
    /^[A-Za-z]:/.test(key) ||
    key.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("A chave de armazenamento do perfil deve ser um caminho relativo válido.");
  }
  return key;
}

function legacyPluginProfileStorageKey(pluginId: string, alias: string) {
  const safePluginId = pluginId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `plugin-workspaces/profiles/${safePluginId}/${alias}`;
}

export function ensureLegacyBrowserProfile(
  database: Database.Database,
  legacyProfile: {
    id: string;
    pluginId: string;
    name: string;
    alias: string;
    createdAt: string;
    updatedAt: string;
  },
) {
  const pluginId = normalizeIdentifier(legacyProfile.pluginId, "ID de plugin");
  const alias = normalizePluginProfileAlias(legacyProfile.alias);
  const profileId = `legacy:${normalizeIdentifier(legacyProfile.id, "ID de perfil legado")}`;
  const storageKey = legacyPluginProfileStorageKey(pluginId, alias);
  return database.transaction(() => {
    const existing = database
      .prepare(
        `SELECT id, name, alias, storage_kind, storage_key, created_at, updated_at
         FROM browser_profiles WHERE id = ?`,
      )
      .get(profileId) as BrowserProfileRow | undefined;
    if (existing) {
      if (
        existing.alias.toLocaleLowerCase() !== alias.toLocaleLowerCase() ||
        existing.storage_kind !== "legacy" ||
        existing.storage_key !== storageKey
      ) {
        throw new LegacyBrowserProfileResolutionError(
          "inconsistent",
          "O perfil global existente não corresponde ao perfil legado materializado.",
        );
      }
    } else {
      database
        .prepare(
          `INSERT INTO browser_profiles
            (id, name, alias, storage_kind, storage_key, created_at, updated_at)
           VALUES (?, ?, ?, 'legacy', ?, ?, ?)`,
        )
        .run(
          profileId,
          legacyProfile.name,
          alias,
          storageKey,
          legacyProfile.createdAt,
          legacyProfile.updatedAt,
        );
    }
    database
      .prepare(
        `INSERT INTO plugin_profile_bindings
          (plugin_id, profile_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(plugin_id, profile_id) DO NOTHING`,
      )
      .run(pluginId, profileId, legacyProfile.createdAt, legacyProfile.updatedAt);
    return profileId;
  })();
}

function tableExists(database: Database.Database, tableName: string) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

/**
 * Resolves the legacy API v1 `pluginId + alias` reference without mutating the
 * stored Method/job/snapshot. The resolver deliberately fails closed when the
 * migration state cannot identify exactly one binding.
 */
export function resolveLegacyBrowserProfile(
  database: Database.Database,
  input: { pluginId: string; alias: string; dataDirectory: string },
): LegacyBrowserProfileResolution {
  const pluginId = normalizeIdentifier(input.pluginId, "ID de plugin");
  const alias = normalizePluginProfileAlias(input.alias);
  const dataDirectory = path.resolve(input.dataDirectory);

  const legacyRows = tableExists(database, "plugin_profiles")
    ? (database
        .prepare(
          `SELECT id, plugin_id, alias
           FROM plugin_profiles
           WHERE plugin_id = ? AND alias = ? COLLATE NOCASE
           ORDER BY created_at, id`,
        )
        .all(pluginId, alias) as LegacyProfileRow[])
    : [];
  if (legacyRows.length > 1) {
    throw new LegacyBrowserProfileResolutionError(
      "ambiguous",
      "Há mais de um perfil legado para este plugin e alias.",
    );
  }

  const boundRows = database
    .prepare(
      `SELECT p.id, p.name, p.alias, p.storage_kind, p.storage_key,
              p.created_at, p.updated_at, b.plugin_id
       FROM browser_profiles p
       JOIN plugin_profile_bindings b ON b.profile_id = p.id
       WHERE b.plugin_id = ? AND p.alias = ? COLLATE NOCASE
       ORDER BY p.created_at, p.id`,
    )
    .all(pluginId, alias) as BoundProfileRow[];
  if (boundRows.length > 1) {
    throw new LegacyBrowserProfileResolutionError(
      "ambiguous",
      "Há mais de um vínculo global para este plugin e alias.",
    );
  }
  if (boundRows.length === 0) {
    throw new LegacyBrowserProfileResolutionError(
      legacyRows.length ? "inconsistent" : "not_found",
      legacyRows.length
        ? "O perfil legado existe, mas seu vínculo global migrado não foi encontrado."
        : "Nenhum perfil vinculado foi encontrado para este plugin e alias.",
    );
  }

  const row = boundRows[0];
  const profile = profileFromRow(row);
  const binding: PluginProfileBinding = {
    pluginId: row.plugin_id,
    profileId: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const legacy = legacyRows[0];

  if (legacy) {
    const expectedProfileId = `legacy:${legacy.id}`;
    const expectedStorageKey = legacyPluginProfileStorageKey(pluginId, legacy.alias);
    if (
      profile.id !== expectedProfileId ||
      profile.storageKind !== "legacy" ||
      profile.storageKey !== expectedStorageKey
    ) {
      throw new LegacyBrowserProfileResolutionError(
        "inconsistent",
        "O vínculo global não corresponde ao perfil legado migrado.",
      );
    }

    const customWorkspace = tableExists(database, "plugin_workspaces")
      ? (database
          .prepare("SELECT directory FROM plugin_workspaces WHERE plugin_id = ?")
          .pluck()
          .get(pluginId) as string | undefined)
      : undefined;
    return {
      pluginId,
      alias: legacy.alias,
      profile,
      binding,
      profileDirectory: customWorkspace
        ? path.resolve(customWorkspace, legacy.alias)
        : path.resolve(dataDirectory, profile.storageKey),
      source: "legacy",
    };
  }

  if (profile.storageKind === "legacy") {
    throw new LegacyBrowserProfileResolutionError(
      "inconsistent",
      "O perfil global legado perdeu seu registro de compatibilidade de origem.",
    );
  }

  return {
    pluginId,
    alias: profile.alias,
    profile,
    binding,
    profileDirectory: path.resolve(dataDirectory, profile.storageKey),
    source: "global",
  };
}

export function resolveBoundBrowserProfile(
  database: Database.Database,
  input: { pluginId: string; profileId: string; dataDirectory: string },
): BoundBrowserProfileResolution {
  const pluginId = normalizeIdentifier(input.pluginId, "ID de plugin");
  const profileId = normalizeIdentifier(input.profileId, "ID de perfil");
  const row = database
    .prepare(
      `SELECT p.id, p.name, p.alias, p.storage_kind, p.storage_key,
              p.created_at, p.updated_at, b.plugin_id
       FROM browser_profiles p
       JOIN plugin_profile_bindings b ON b.profile_id = p.id
       WHERE b.plugin_id = ? AND p.id = ?`,
    )
    .get(pluginId, profileId) as BoundProfileRow | undefined;
  if (!row) {
    throw new LegacyBrowserProfileResolutionError(
      "not_found",
      "O plugin não está vinculado a este perfil de navegador.",
    );
  }

  const profile = profileFromRow(row);
  const binding: PluginProfileBinding = {
    pluginId: row.plugin_id,
    profileId: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const dataDirectory = path.resolve(input.dataDirectory);
  let profileDirectory = path.resolve(dataDirectory, profile.storageKey);
  if (profile.storageKind === "legacy" && tableExists(database, "plugin_workspaces")) {
    const customWorkspace = database
      .prepare("SELECT directory FROM plugin_workspaces WHERE plugin_id = ?")
      .pluck()
      .get(pluginId) as string | undefined;
    if (customWorkspace) profileDirectory = path.resolve(customWorkspace, profile.alias);
  }

  return { pluginId, profile, binding, profileDirectory };
}

export class BrowserProfileStore {
  constructor(private readonly database: Database.Database) {}

  list() {
    return (
      this.database
        .prepare(
          `SELECT id, name, alias, storage_kind, storage_key, created_at, updated_at
           FROM browser_profiles ORDER BY lower(name), created_at, id`,
        )
        .all() as BrowserProfileRow[]
    ).map(profileFromRow);
  }

  get(profileId: string) {
    const row = this.database
      .prepare(
        `SELECT id, name, alias, storage_kind, storage_key, created_at, updated_at
         FROM browser_profiles WHERE id = ?`,
      )
      .get(profileId) as BrowserProfileRow | undefined;
    return row ? profileFromRow(row) : undefined;
  }

  create(input: {
    id: string;
    name: string;
    alias: string;
    storageKind: BrowserProfileStorageKind;
    storageKey: string;
  }) {
    const id = normalizeIdentifier(input.id, "ID de perfil");
    const name = normalizePluginProfileName(input.name);
    const alias = normalizePluginProfileAlias(input.alias);
    const storageKind = input.storageKind;
    if (storageKind !== "managed" && storageKind !== "legacy") {
      throw new Error("Tipo de armazenamento de perfil inválido.");
    }
    const storageKey = normalizeBrowserProfileStorageKey(input.storageKey);
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO browser_profiles
          (id, name, alias, storage_kind, storage_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, alias, storageKind, storageKey, now, now);
    return this.get(id)!;
  }

  rename(profileId: string, name: string) {
    const current = this.get(profileId);
    if (!current) return undefined;
    const now = new Date();
    const currentTime = Date.parse(current.updatedAt);
    const updatedAt =
      Number.isFinite(currentTime) && now.getTime() <= currentTime
        ? new Date(currentTime + 1).toISOString()
        : now.toISOString();
    const result = this.database
      .prepare("UPDATE browser_profiles SET name = ?, updated_at = ? WHERE id = ?")
      .run(normalizePluginProfileName(name), updatedAt, profileId);
    return result.changes ? this.get(profileId) : undefined;
  }
}

export class PluginProfileBindingStore {
  constructor(private readonly database: Database.Database) {}

  listForPlugin(pluginId: string) {
    return (
      this.database
        .prepare(
          `SELECT plugin_id, profile_id, created_at, updated_at
           FROM plugin_profile_bindings WHERE plugin_id = ? ORDER BY created_at, profile_id`,
        )
        .all(pluginId) as BindingRow[]
    ).map(bindingFromRow);
  }

  listForProfile(profileId: string) {
    return (
      this.database
        .prepare(
          `SELECT plugin_id, profile_id, created_at, updated_at
           FROM plugin_profile_bindings WHERE profile_id = ? ORDER BY created_at, plugin_id`,
        )
        .all(profileId) as BindingRow[]
    ).map(bindingFromRow);
  }

  get(pluginId: string, profileId: string) {
    const row = this.database
      .prepare(
        `SELECT plugin_id, profile_id, created_at, updated_at
         FROM plugin_profile_bindings WHERE plugin_id = ? AND profile_id = ?`,
      )
      .get(pluginId, profileId) as BindingRow | undefined;
    return row ? bindingFromRow(row) : undefined;
  }

  link(pluginId: string, profileId: string) {
    const normalizedPluginId = normalizeIdentifier(pluginId, "ID de plugin");
    if (!this.database.prepare("SELECT 1 FROM browser_profiles WHERE id = ?").get(profileId)) {
      throw new Error("Perfil de navegador não encontrado.");
    }
    const existing = this.get(normalizedPluginId, profileId);
    if (existing) return existing;
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO plugin_profile_bindings
          (plugin_id, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .run(normalizedPluginId, profileId, now, now);
    return this.get(normalizedPluginId, profileId)!;
  }

  unlink(pluginId: string, profileId: string) {
    return this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM plugin_profile_readiness WHERE plugin_id = ? AND profile_id = ?")
        .run(pluginId, profileId);
      return this.database
        .prepare("DELETE FROM plugin_profile_bindings WHERE plugin_id = ? AND profile_id = ?")
        .run(pluginId, profileId).changes;
    })();
  }

  unlinkPlugin(pluginId: string) {
    const normalizedPluginId = normalizeIdentifier(pluginId, "ID de plugin");
    return this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM plugin_profile_readiness WHERE plugin_id = ?")
        .run(normalizedPluginId);
      return this.database
        .prepare("DELETE FROM plugin_profile_bindings WHERE plugin_id = ?")
        .run(normalizedPluginId).changes;
    })();
  }
}

export function browserProfileInventory(
  profiles: BrowserProfileStore,
  bindings: PluginProfileBindingStore,
  readiness: PluginProfileReadinessStore,
  pluginId: string,
  methodsForBinding: (
    binding: PluginProfileBinding,
    profile: PublicBrowserProfile,
  ) => PluginProfileUsage[] = () => [],
): BrowserProfileInventory {
  const linkedBindings = bindings.listForPlugin(pluginId);
  const linkedProfileIds = new Set(linkedBindings.map((binding) => binding.profileId));
  const allProfiles = profiles.list();

  const linked = linkedBindings.flatMap((binding) => {
    const profile = profiles.get(binding.profileId);
    if (!profile) return [];
    const state = readiness.get(pluginId, binding.profileId);
    return [
      {
        profile: publicProfile(profile),
        binding,
        ...(state ? { readiness: publicReadiness(state) } : {}),
      },
    ];
  });

  const candidates = allProfiles
    .filter((profile) => !linkedProfileIds.has(profile.id))
    .map((profile) => ({
      profile: publicProfile(profile),
      linkedPluginIds: bindings.listForProfile(profile.id).map((binding) => binding.pluginId),
    }));

  const uses = allProfiles.flatMap((profile) =>
    bindings.listForProfile(profile.id).map((binding) => ({
      profileId: profile.id,
      pluginId: binding.pluginId,
      methods: methodsForBinding(binding, publicProfile(profile)),
    })),
  );

  return { linked, candidates, uses };
}

export class PluginProfileReadinessStore {
  constructor(private readonly database: Database.Database) {}

  get(pluginId: string, profileId: string) {
    const row = this.database
      .prepare(
        `SELECT plugin_id, profile_id, state, checked_at, prepared_at, metadata
         FROM plugin_profile_readiness WHERE plugin_id = ? AND profile_id = ?`,
      )
      .get(pluginId, profileId) as ReadinessRow | undefined;
    return row ? readinessFromRow(row) : undefined;
  }

  set(input: {
    pluginId: string;
    profileId: string;
    state: string;
    checkedAt?: string;
    preparedAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    const pluginId = normalizeIdentifier(input.pluginId, "ID de plugin");
    const profileId = normalizeIdentifier(input.profileId, "ID de perfil");
    const state = normalizeIdentifier(input.state, "Estado de readiness");
    if (state.length > 64) throw new Error("Estado de readiness inválido.");
    if (
      !this.database
        .prepare("SELECT 1 FROM plugin_profile_bindings WHERE plugin_id = ? AND profile_id = ?")
        .get(pluginId, profileId)
    ) {
      throw new Error("O plugin não está vinculado a este perfil.");
    }
    const metadata = JSON.stringify(input.metadata ?? {});
    this.database
      .prepare(
        `INSERT INTO plugin_profile_readiness
          (plugin_id, profile_id, state, checked_at, prepared_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(plugin_id, profile_id) DO UPDATE SET
           state = excluded.state,
           checked_at = excluded.checked_at,
           prepared_at = excluded.prepared_at,
           metadata = excluded.metadata`,
      )
      .run(pluginId, profileId, state, input.checkedAt ?? null, input.preparedAt ?? null, metadata);
    return this.get(pluginId, profileId)!;
  }
}
