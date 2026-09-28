import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type BrowserProfileLeaseOwnerType = "job" | "invocation";

export type BrowserProfileLease = {
  profileId: string;
  leaseToken: string;
  ownerType: BrowserProfileLeaseOwnerType;
  ownerId: string;
  pluginId?: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
};

type BrowserProfileLeaseRow = {
  profile_id: string;
  lease_token: string;
  owner_type: BrowserProfileLeaseOwnerType;
  owner_id: string;
  plugin_id: string | null;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
};

function leaseFromRow(row: BrowserProfileLeaseRow): BrowserProfileLease {
  return {
    profileId: row.profile_id,
    leaseToken: row.lease_token,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    ...(row.plugin_id ? { pluginId: row.plugin_id } : {}),
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
  };
}

function normalizeId(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label} inválido.`);
  return normalized;
}

export class BrowserProfileLeaseStore {
  constructor(private readonly database: Database.Database) {}

  get(profileId: string) {
    const row = this.database
      .prepare(
        `SELECT profile_id, lease_token, owner_type, owner_id, plugin_id,
                acquired_at, heartbeat_at, expires_at
         FROM browser_profile_leases WHERE profile_id = ?`,
      )
      .get(profileId) as BrowserProfileLeaseRow | undefined;
    return row ? leaseFromRow(row) : undefined;
  }

  acquire(input: {
    profileId: string;
    ownerType: BrowserProfileLeaseOwnerType;
    ownerId: string;
    pluginId?: string;
    now?: Date;
    ttlMs?: number;
  }) {
    const profileId = normalizeId(input.profileId, "ID de perfil");
    const ownerId = normalizeId(input.ownerId, "ID do proprietário do lease");
    const pluginId = input.pluginId ? normalizeId(input.pluginId, "ID de plugin") : undefined;
    const now = input.now ?? new Date();
    const ttlMs = Math.max(1_000, Math.floor(input.ttlMs ?? 30_000));
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    const acquire = this.database.transaction(() => {
      if (!this.database.prepare("SELECT 1 FROM browser_profiles WHERE id = ?").get(profileId)) {
        throw new Error("Perfil de navegador não encontrado para lease.");
      }

      const current = this.get(profileId);
      if (current && current.expiresAt > nowIso) {
        if (current.ownerType !== input.ownerType || current.ownerId !== ownerId) {
          return { acquired: false as const, lease: current };
        }
        const result = this.database
          .prepare(
            `UPDATE browser_profile_leases
             SET heartbeat_at = ?, expires_at = ?, plugin_id = ?
             WHERE profile_id = ? AND lease_token = ?`,
          )
          .run(nowIso, expiresAt, pluginId ?? null, profileId, current.leaseToken);
        if (!result.changes) return { acquired: false as const, lease: this.get(profileId)! };
        return { acquired: true as const, lease: this.get(profileId)! };
      }

      const leaseToken = randomUUID();
      this.database
        .prepare(
          `INSERT INTO browser_profile_leases
            (profile_id, lease_token, owner_type, owner_id, plugin_id,
             acquired_at, heartbeat_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id) DO UPDATE SET
             lease_token = excluded.lease_token,
             owner_type = excluded.owner_type,
             owner_id = excluded.owner_id,
             plugin_id = excluded.plugin_id,
             acquired_at = excluded.acquired_at,
             heartbeat_at = excluded.heartbeat_at,
             expires_at = excluded.expires_at`,
        )
        .run(
          profileId,
          leaseToken,
          input.ownerType,
          ownerId,
          pluginId ?? null,
          nowIso,
          nowIso,
          expiresAt,
        );
      return { acquired: true as const, lease: this.get(profileId)! };
    });

    return acquire.immediate();
  }

  heartbeat(profileId: string, leaseToken: string, now = new Date(), ttlMs = 30_000) {
    const timestamp = now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(1_000, Math.floor(ttlMs))).toISOString();
    return Boolean(
      this.database
        .prepare(
          `UPDATE browser_profile_leases
           SET heartbeat_at = ?, expires_at = ?
           WHERE profile_id = ? AND lease_token = ? AND expires_at > ?`,
        )
        .run(timestamp, expiresAt, profileId, leaseToken, timestamp).changes,
    );
  }

  release(profileId: string, leaseToken: string) {
    return this.database
      .prepare("DELETE FROM browser_profile_leases WHERE profile_id = ? AND lease_token = ?")
      .run(profileId, leaseToken).changes;
  }

  releaseByOwner(ownerType: BrowserProfileLeaseOwnerType, ownerId: string) {
    return this.database
      .prepare("DELETE FROM browser_profile_leases WHERE owner_type = ? AND owner_id = ?")
      .run(ownerType, ownerId).changes;
  }

  recoverExpired(now = new Date()) {
    return this.database
      .prepare("DELETE FROM browser_profile_leases WHERE expires_at <= ?")
      .run(now.toISOString()).changes;
  }
}
