import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { BrowserProfileLeaseStore } from "./browser-profile-leases";
import { BrowserProfileStore } from "./browser-profiles";
import { runSchemaMigrations } from "./schema-migrations";

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-lease-v43-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  database.pragma("foreign_keys = ON");
  await runSchemaMigrations(database, undefined, {
    backupDirectory: path.join(root, "migration-backups"),
  });
  const profiles = new BrowserProfileStore(database);
  profiles.create({
    id: "profile-a",
    name: "Perfil A",
    alias: "a",
    storageKind: "managed",
    storageKey: "browser-profiles/profile-a",
  });
  profiles.create({
    id: "profile-b",
    name: "Perfil B",
    alias: "b",
    storageKind: "managed",
    storageKey: "browser-profiles/profile-b",
  });
  return { root, database, leases: new BrowserProfileLeaseStore(database) };
}

test("pacote 4.3 adquire atomicamente um único lease por perfil", async () => {
  const { root, database, leases } = await fixture();
  try {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const first = leases.acquire({
      profileId: "profile-a",
      ownerType: "job",
      ownerId: "job-1",
      pluginId: "plugin.alpha",
      now,
    });
    const blocked = leases.acquire({
      profileId: "profile-a",
      ownerType: "job",
      ownerId: "job-2",
      pluginId: "plugin.beta",
      now,
    });
    assert.equal(first.acquired, true);
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.lease.ownerId, "job-1");
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 4.3 permite perfis físicos distintos em paralelo", async () => {
  const { root, database, leases } = await fixture();
  try {
    const first = leases.acquire({ profileId: "profile-a", ownerType: "job", ownerId: "job-a" });
    const second = leases.acquire({ profileId: "profile-b", ownerType: "job", ownerId: "job-b" });
    assert.equal(first.acquired, true);
    assert.equal(second.acquired, true);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 4.3 renova heartbeat, expira após crash e permite recuperação", async () => {
  const { root, database, leases } = await fixture();
  try {
    const start = new Date("2026-09-26T12:00:00.000Z");
    const acquired = leases.acquire({
      profileId: "profile-a",
      ownerType: "job",
      ownerId: "job-1",
      now: start,
      ttlMs: 10_000,
    });
    assert.equal(acquired.acquired, true);
    assert.equal(
      leases.heartbeat(
        "profile-a",
        acquired.lease.leaseToken,
        new Date("2026-09-26T12:00:05.000Z"),
        10_000,
      ),
      true,
    );
    assert.equal(leases.recoverExpired(new Date("2026-09-26T12:00:14.999Z")), 0);
    assert.equal(leases.recoverExpired(new Date("2026-09-26T12:00:15.000Z")), 1);
    assert.equal(
      leases.acquire({
        profileId: "profile-a",
        ownerType: "job",
        ownerId: "job-2",
        now: new Date("2026-09-26T12:00:15.000Z"),
      }).acquired,
      true,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 4.3 libera lease em cancelamento/encerramento pelo proprietário", async () => {
  const { root, database, leases } = await fixture();
  try {
    const acquired = leases.acquire({
      profileId: "profile-a",
      ownerType: "job",
      ownerId: "job-cancelado",
    });
    assert.equal(acquired.acquired, true);
    assert.equal(leases.releaseByOwner("job", "job-cancelado"), 1);
    assert.equal(leases.get("profile-a"), undefined);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});
