import type Database from "better-sqlite3";

export type PluginConnection = {
  id: string;
  pluginId: string;
  name: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
};

type ConnectionRow = {
  id: string;
  plugin_id: string;
  name: string;
  metadata: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function fromRow(row: ConnectionRow): PluginConnection {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export class PluginConnectionStore {
  constructor(private readonly database: Database.Database) {}

  list(pluginId: string, includeRevoked = false) {
    const rows = this.database
      .prepare(
        `SELECT id, plugin_id, name, metadata, created_at, updated_at, revoked_at
         FROM plugin_connections
         WHERE plugin_id = ? ${includeRevoked ? "" : "AND revoked_at IS NULL"}
         ORDER BY lower(name), created_at`,
      )
      .all(pluginId) as ConnectionRow[];
    return rows.map(fromRow);
  }

  get(pluginId: string, connectionId: string) {
    const row = this.database
      .prepare(
        `SELECT id, plugin_id, name, metadata, created_at, updated_at, revoked_at
         FROM plugin_connections WHERE plugin_id = ? AND id = ?`,
      )
      .get(pluginId, connectionId) as ConnectionRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  create(input: {
    id: string;
    pluginId: string;
    name: string;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO plugin_connections
          (id, plugin_id, name, metadata, created_at, updated_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(input.id, input.pluginId, input.name, JSON.stringify(input.metadata ?? {}), now, now);
    return this.get(input.pluginId, input.id)!;
  }

  rename(pluginId: string, connectionId: string, name: string) {
    const result = this.database
      .prepare(
        `UPDATE plugin_connections SET name = ?, updated_at = ?
         WHERE plugin_id = ? AND id = ? AND revoked_at IS NULL`,
      )
      .run(name, new Date().toISOString(), pluginId, connectionId);
    return result.changes ? this.get(pluginId, connectionId) : undefined;
  }

  updateMetadata(pluginId: string, connectionId: string, metadata: Record<string, unknown>) {
    const result = this.database
      .prepare(
        `UPDATE plugin_connections SET metadata = ?, updated_at = ?
         WHERE plugin_id = ? AND id = ? AND revoked_at IS NULL`,
      )
      .run(JSON.stringify(metadata), new Date().toISOString(), pluginId, connectionId);
    return result.changes ? this.get(pluginId, connectionId) : undefined;
  }

  revoke(pluginId: string, connectionId: string) {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE plugin_connections SET revoked_at = ?, updated_at = ?
         WHERE plugin_id = ? AND id = ? AND revoked_at IS NULL`,
      )
      .run(now, now, pluginId, connectionId);
    return result.changes ? this.get(pluginId, connectionId) : undefined;
  }

  remove(pluginId: string, connectionId: string) {
    return this.database
      .prepare("DELETE FROM plugin_connections WHERE plugin_id = ? AND id = ?")
      .run(pluginId, connectionId).changes;
  }
}
