import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { runSchemaMigrations } from "./schema-migrations";

type GlobalProfileRow = {
  id: string;
  name: string;
  alias: string;
  storage_kind: string;
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

function createLegacySchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE plugin_profiles (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      alias TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX plugin_profiles_alias
      ON plugin_profiles(plugin_id, alias COLLATE NOCASE);
    CREATE TABLE plugin_workspaces (
      plugin_id TEXT PRIMARY KEY,
      directory TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

test("pacote 3.2 converte cada linha legada em perfil global distinto e vínculo original", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v32-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    createLegacySchema(database);
    const insert = database.prepare(
      `INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      "legacy-a",
      "plugin.alpha",
      "Principal Alpha",
      "principal",
      "2026-09-20T10:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
    );
    insert.run(
      "legacy-b",
      "plugin.beta",
      "Principal Beta",
      "principal",
      "2026-09-22T10:00:00.000Z",
      "2026-09-23T10:00:00.000Z",
    );
    insert.run(
      "legacy-c",
      "plugin.alpha",
      "Reserva",
      "reserva",
      "2026-09-24T10:00:00.000Z",
      "2026-09-25T10:00:00.000Z",
    );
    const sourceBefore = JSON.stringify(
      database.prepare("SELECT * FROM plugin_profiles ORDER BY id").all(),
    );

    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(root, "migration-backups"),
    });

    const profiles = database
      .prepare(
        `SELECT id, name, alias, storage_kind, storage_key, created_at, updated_at
         FROM browser_profiles ORDER BY id`,
      )
      .all() as GlobalProfileRow[];
    const bindings = database
      .prepare(
        `SELECT plugin_id, profile_id, created_at, updated_at
         FROM plugin_profile_bindings ORDER BY profile_id`,
      )
      .all() as BindingRow[];

    assert.equal(profiles.length, 3);
    assert.equal(new Set(profiles.map((profile) => profile.id)).size, 3);
    assert.deepEqual(
      profiles.map((profile) => [
        profile.id,
        profile.alias,
        profile.storage_kind,
        profile.storage_key,
      ]),
      [
        [
          "legacy:legacy-a",
          "principal",
          "legacy",
          "plugin-workspaces/profiles/plugin.alpha/principal",
        ],
        [
          "legacy:legacy-b",
          "principal",
          "legacy",
          "plugin-workspaces/profiles/plugin.beta/principal",
        ],
        ["legacy:legacy-c", "reserva", "legacy", "plugin-workspaces/profiles/plugin.alpha/reserva"],
      ],
    );
    assert.deepEqual(
      bindings.map((binding) => [binding.plugin_id, binding.profile_id]),
      [
        ["plugin.alpha", "legacy:legacy-a"],
        ["plugin.beta", "legacy:legacy-b"],
        ["plugin.alpha", "legacy:legacy-c"],
      ],
    );
    assert.equal(
      JSON.stringify(database.prepare("SELECT * FROM plugin_profiles ORDER BY id").all()),
      sourceBefore,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.2 mantém workspace customizado e payload legado intactos", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v32-custom-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    createLegacySchema(database);
    database
      .prepare(
        `INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "custom-profile",
        "plugin/custom",
        "Conta customizada",
        "principal",
        "2026-09-20T10:00:00.000Z",
        "2026-09-20T10:00:00.000Z",
      );
    database
      .prepare("INSERT INTO plugin_workspaces (plugin_id, directory, updated_at) VALUES (?, ?, ?)")
      .run("plugin/custom", "D:\\ContentFlow\\custom-workspace", "2026-09-20T10:00:00.000Z");
    const payload = JSON.stringify({ id: "channel-1", method: { profile: "principal" } });
    database
      .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
      .run("channel-1", payload, "2026-09-20T10:00:00.000Z");

    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(root, "migration-backups"),
    });

    assert.equal(
      database
        .prepare("SELECT directory FROM plugin_workspaces WHERE plugin_id = ?")
        .pluck()
        .get("plugin/custom"),
      "D:\\ContentFlow\\custom-workspace",
    );
    assert.equal(
      database.prepare("SELECT payload FROM channels WHERE id = ?").pluck().get("channel-1"),
      payload,
    );
    assert.deepEqual(
      database
        .prepare("SELECT storage_kind, storage_key FROM browser_profiles WHERE id = ?")
        .get("legacy:custom-profile"),
      {
        storage_kind: "legacy",
        storage_key: "plugin-workspaces/profiles/plugin_custom/principal",
      },
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.2 é vazio em instalação nova sem plugin_profiles legado", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v32-empty-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(root, "migration-backups"),
    });
    assert.equal(database.prepare("SELECT COUNT(*) FROM browser_profiles").pluck().get(), 0);
    assert.equal(database.prepare("SELECT COUNT(*) FROM plugin_profile_bindings").pluck().get(), 0);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});
