import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  BrowserProfileStore,
  ensureLegacyBrowserProfile,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
} from "./browser-profiles";
import { runSchemaMigrations } from "./schema-migrations";

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-global-profile-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  database.pragma("foreign_keys = ON");
  await runSchemaMigrations(database, undefined, {
    backupDirectory: path.join(root, "migration-backups"),
  });
  return {
    root,
    database,
    profiles: new BrowserProfileStore(database),
    bindings: new PluginProfileBindingStore(database),
    readiness: new PluginProfileReadinessStore(database),
  };
}

test("pacote 3.1 cria, lista, obtém e renomeia perfil global preservando alias e storage", async () => {
  const { root, database, profiles } = await fixture();
  try {
    const created = profiles.create({
      id: "profile-1",
      name: "Conta principal",
      alias: "Principal",
      storageKind: "managed",
      storageKey: "browser-profiles/profile-1",
    });
    assert.equal(profiles.get(created.id)?.storageKey, "browser-profiles/profile-1");
    assert.deepEqual(
      profiles.list().map((profile) => profile.id),
      ["profile-1"],
    );

    const renamed = profiles.rename(created.id, "Conta da equipe");
    assert.equal(renamed?.name, "Conta da equipe");
    assert.equal(renamed?.alias, "Principal");
    assert.equal(renamed?.storageKind, "managed");
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("aliases globais homônimos permanecem permitidos e perfis continuam distintos", async () => {
  const { root, database, profiles } = await fixture();
  try {
    profiles.create({
      id: "profile-a",
      name: "Principal A",
      alias: "default",
      storageKind: "legacy",
      storageKey: "plugin-workspaces/profiles/plugin-a/default",
    });
    profiles.create({
      id: "profile-b",
      name: "Principal B",
      alias: "default",
      storageKind: "legacy",
      storageKey: "plugin-workspaces/profiles/plugin-b/default",
    });
    assert.equal(profiles.list().length, 2);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("link e unlink são explícitos e unlink remove readiness específico sem apagar perfil", async () => {
  const { root, database, profiles, bindings, readiness } = await fixture();
  try {
    profiles.create({
      id: "shared-profile",
      name: "Compartilhado",
      alias: "shared",
      storageKind: "managed",
      storageKey: "browser-profiles/shared-profile",
    });
    bindings.link("plugin.a", "shared-profile");
    bindings.link("plugin.b", "shared-profile");
    readiness.set({
      pluginId: "plugin.a",
      profileId: "shared-profile",
      state: "ready",
      checkedAt: "2026-09-26T12:00:00.000Z",
      metadata: { bridge: "installed" },
    });

    assert.equal(bindings.listForProfile("shared-profile").length, 2);
    assert.deepEqual(readiness.get("plugin.a", "shared-profile")?.metadata, {
      bridge: "installed",
    });
    assert.equal(bindings.unlink("plugin.a", "shared-profile"), 1);
    assert.equal(readiness.get("plugin.a", "shared-profile"), undefined);
    assert.ok(bindings.get("plugin.b", "shared-profile"));
    assert.ok(profiles.get("shared-profile"));
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("perfil legado explicitamente desvinculado não é vinculado novamente ao reler inventário", async () => {
  const { root, database, profiles, bindings } = await fixture();
  try {
    ensureLegacyBrowserProfile(database, {
      id: "legacy-default-source",
      pluginId: "plugin.a",
      name: "default",
      alias: "default",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const profileId = "legacy:legacy-default-source";
    assert.ok(profiles.get(profileId));
    assert.ok(bindings.get("plugin.a", profileId));

    assert.equal(bindings.unlink("plugin.a", profileId), 1);
    assert.equal(bindings.get("plugin.a", profileId), undefined);

    ensureLegacyBrowserProfile(database, {
      id: "legacy-default-source",
      pluginId: "plugin.a",
      name: "default",
      alias: "default",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(bindings.get("plugin.a", profileId), undefined);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.4 renomeia somente o nome visual e mantém alias, storage e vínculos", async () => {
  const { root, database, profiles, bindings } = await fixture();
  try {
    profiles.create({
      id: "profile-lifecycle",
      name: "Nome antigo",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/profile-lifecycle",
    });
    bindings.link("plugin.a", "profile-lifecycle");

    const renamed = profiles.rename("profile-lifecycle", "Nome novo");
    assert.equal(renamed?.name, "Nome novo");
    assert.equal(renamed?.alias, "principal");
    assert.equal(renamed?.storageKey, "browser-profiles/profile-lifecycle");
    assert.ok(bindings.get("plugin.a", "profile-lifecycle"));
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.4 desinstalação remove vínculos/readiness do plugin e preserva perfil compartilhado", async () => {
  const { root, database, profiles, bindings, readiness } = await fixture();
  try {
    profiles.create({
      id: "profile-shared",
      name: "Compartilhado",
      alias: "shared",
      storageKind: "managed",
      storageKey: "browser-profiles/profile-shared",
    });
    bindings.link("plugin.a", "profile-shared");
    bindings.link("plugin.b", "profile-shared");
    readiness.set({
      pluginId: "plugin.a",
      profileId: "profile-shared",
      state: "ready",
    });
    readiness.set({
      pluginId: "plugin.b",
      profileId: "profile-shared",
      state: "ready",
    });

    assert.equal(bindings.unlinkPlugin("plugin.a"), 1);
    assert.equal(bindings.get("plugin.a", "profile-shared"), undefined);
    assert.equal(readiness.get("plugin.a", "profile-shared"), undefined);
    assert.ok(bindings.get("plugin.b", "profile-shared"));
    assert.ok(readiness.get("plugin.b", "profile-shared"));
    assert.ok(profiles.get("profile-shared"));
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("pacote 3.4 último vínculo removido não apaga identidade nem storage do perfil", async () => {
  const { root, database, profiles, bindings } = await fixture();
  try {
    profiles.create({
      id: "profile-last-binding",
      name: "Sessão preservada",
      alias: "solo",
      storageKind: "legacy",
      storageKey: "plugin-workspaces/profiles/plugin.a/solo",
    });
    bindings.link("plugin.a", "profile-last-binding");

    assert.equal(bindings.unlink("plugin.a", "profile-last-binding"), 1);
    assert.equal(bindings.listForProfile("profile-last-binding").length, 0);
    assert.deepEqual(profiles.get("profile-last-binding"), {
      id: "profile-last-binding",
      name: "Sessão preservada",
      alias: "solo",
      storageKind: "legacy",
      storageKey: "plugin-workspaces/profiles/plugin.a/solo",
      createdAt: profiles.get("profile-last-binding")?.createdAt,
      updatedAt: profiles.get("profile-last-binding")?.updatedAt,
    });
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("readiness exige vínculo e vínculo exige perfil existente", async () => {
  const { root, database, bindings, readiness } = await fixture();
  try {
    assert.throws(() => bindings.link("plugin.a", "missing"), /não encontrado/i);
    assert.throws(
      () =>
        readiness.set({
          pluginId: "plugin.a",
          profileId: "missing",
          state: "ready",
        }),
      /não está vinculado/i,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema 3.1 possui constraints e índices esperados sem remover plugin_profiles legado", async () => {
  const { root, database } = await fixture();
  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    for (const name of [
      "browser_profiles",
      "plugin_profile_bindings",
      "plugin_profile_readiness",
    ]) {
      assert.ok(
        tables.some((table) => table.name === name),
        `tabela ausente: ${name}`,
      );
    }
    const indexes = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    for (const name of [
      "browser_profiles_alias",
      "browser_profiles_storage",
      "plugin_profile_bindings_plugin",
      "plugin_profile_bindings_profile",
      "plugin_profile_readiness_state",
      "plugin_profile_readiness_profile",
    ]) {
      assert.ok(
        indexes.some((index) => index.name === name),
        `índice ausente: ${name}`,
      );
    }
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});
