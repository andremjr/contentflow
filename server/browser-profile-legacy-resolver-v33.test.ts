import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  BrowserProfileStore,
  LegacyBrowserProfileResolutionError,
  PluginProfileBindingStore,
  resolveLegacyBrowserProfile,
} from "./browser-profiles";
import { runSchemaMigrations } from "./schema-migrations";

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
    CREATE TABLE plugin_workspaces (
      plugin_id TEXT PRIMARY KEY,
      directory TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

async function migratedFixture(customWorkspace?: string, alias = "principal") {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v33-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  database.pragma("foreign_keys = ON");
  createLegacySchema(database);
  database
    .prepare(
      `INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "legacy-primary",
      "plugin.alpha",
      alias === "default" ? "Default" : "Principal",
      alias,
      "2026-09-20T10:00:00.000Z",
      "2026-09-20T10:00:00.000Z",
    );
  if (customWorkspace) {
    database
      .prepare("INSERT INTO plugin_workspaces (plugin_id, directory, updated_at) VALUES (?, ?, ?)")
      .run("plugin.alpha", customWorkspace, "2026-09-20T10:00:00.000Z");
  }
  await runSchemaMigrations(database, undefined, {
    backupDirectory: path.join(root, "migration-backups"),
  });
  return { root, database };
}

test("pacote 3.3 resolve pluginId + alias para o vínculo e a pasta padrão originais", async () => {
  const { root, database } = await migratedFixture();
  try {
    const resolved = resolveLegacyBrowserProfile(database, {
      pluginId: "plugin.alpha",
      alias: "PRINCIPAL",
      dataDirectory: root,
    });
    assert.equal(resolved.profile.id, "legacy:legacy-primary");
    assert.equal(resolved.binding.pluginId, "plugin.alpha");
    assert.equal(resolved.source, "legacy");
    assert.equal(
      resolved.profileDirectory,
      path.resolve(root, "plugin-workspaces", "profiles", "plugin.alpha", "principal"),
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.3 preserva a raiz de workspace customizada do plugin", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v33-custom-"));
  const customWorkspace = path.join(root, "external-workspace");
  const fixture = await migratedFixture(customWorkspace);
  try {
    const resolved = resolveLegacyBrowserProfile(fixture.database, {
      pluginId: "plugin.alpha",
      alias: "principal",
      dataDirectory: fixture.root,
    });
    assert.equal(resolved.profileDirectory, path.resolve(customWorkspace, "principal"));
  } finally {
    fixture.database.close();
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.3 resolve default legado na própria raiz do workspace customizado", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v33-default-"));
  const customWorkspace = path.join(root, "external-workspace");
  const fixture = await migratedFixture(customWorkspace, "default");
  try {
    const resolved = resolveLegacyBrowserProfile(fixture.database, {
      pluginId: "plugin.alpha",
      alias: "default",
      dataDirectory: fixture.root,
    });
    assert.equal(resolved.profileDirectory, path.resolve(customWorkspace));
  } finally {
    fixture.database.close();
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.3 rejeita alias ambíguo sem escolher vínculo silenciosamente", async () => {
  const { root, database } = await migratedFixture();
  try {
    const profiles = new BrowserProfileStore(database);
    const bindings = new PluginProfileBindingStore(database);
    profiles.create({
      id: "duplicate-profile",
      name: "Duplicado",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/duplicate-profile",
    });
    bindings.link("plugin.alpha", "duplicate-profile");
    assert.throws(
      () =>
        resolveLegacyBrowserProfile(database, {
          pluginId: "plugin.alpha",
          alias: "principal",
          dataDirectory: root,
        }),
      (error) => error instanceof LegacyBrowserProfileResolutionError && error.code === "ambiguous",
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.3 rejeita migração inconsistente e não altera payloads persistidos", async () => {
  const { root, database } = await migratedFixture();
  try {
    database.exec(`
      CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE plugin_jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE process_executions (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    `);
    const payloads = {
      method: JSON.stringify({ pluginId: "plugin.alpha", accountProfile: "principal" }),
      job: JSON.stringify({ configuration: { accountProfile: "principal" }, cursor: 2 }),
      execution: JSON.stringify({ snapshot: { accountProfile: "principal" } }),
    };
    database.prepare("INSERT INTO channels VALUES (?, ?, ?)").run("c1", payloads.method, "now");
    database.prepare("INSERT INTO plugin_jobs VALUES (?, ?)").run("j1", payloads.job);
    database.prepare("INSERT INTO process_executions VALUES (?, ?)").run("e1", payloads.execution);
    database
      .prepare("UPDATE browser_profiles SET storage_key = ? WHERE id = ?")
      .run("plugin-workspaces/profiles/wrong/principal", "legacy:legacy-primary");

    assert.throws(
      () =>
        resolveLegacyBrowserProfile(database, {
          pluginId: "plugin.alpha",
          alias: "principal",
          dataDirectory: root,
        }),
      (error) =>
        error instanceof LegacyBrowserProfileResolutionError && error.code === "inconsistent",
    );
    assert.equal(
      database.prepare("SELECT payload FROM channels WHERE id = 'c1'").pluck().get(),
      payloads.method,
    );
    assert.equal(
      database.prepare("SELECT payload FROM plugin_jobs WHERE id = 'j1'").pluck().get(),
      payloads.job,
    );
    assert.equal(
      database.prepare("SELECT payload FROM process_executions WHERE id = 'e1'").pluck().get(),
      payloads.execution,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.3 resolve vínculo global único sem registro legado", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-v33-global-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(root, "migration-backups"),
    });
    const profiles = new BrowserProfileStore(database);
    const bindings = new PluginProfileBindingStore(database);
    profiles.create({
      id: "managed-profile",
      name: "Conta",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/managed-profile",
    });
    bindings.link("plugin.alpha", "managed-profile");
    const resolved = resolveLegacyBrowserProfile(database, {
      pluginId: "plugin.alpha",
      alias: "principal",
      dataDirectory: root,
    });
    assert.equal(resolved.source, "global");
    assert.equal(
      resolved.profileDirectory,
      path.resolve(root, "browser-profiles", "managed-profile"),
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});
