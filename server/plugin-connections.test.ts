import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { PluginConnectionStore } from "./plugin-connections";

function fixture() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE plugin_connections (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX plugin_connections_active_name
      ON plugin_connections(plugin_id, name COLLATE NOCASE)
      WHERE revoked_at IS NULL;
  `);
  return { database, store: new PluginConnectionStore(database) };
}

test("cria, renomeia e lista conexões sem armazenar secrets", () => {
  const { database, store } = fixture();
  store.create({ id: "connection-1", pluginId: "example.plugin", name: "Conta principal" });
  assert.equal(store.list("example.plugin")[0].name, "Conta principal");
  assert.equal(
    store.rename("example.plugin", "connection-1", "Conta do canal")?.id,
    "connection-1",
  );
  const raw = database.prepare("SELECT * FROM plugin_connections").get() as Record<string, unknown>;
  assert.equal(
    Object.keys(raw).some((key) => /secret|token|key/i.test(key)),
    false,
  );
  database.close();
});

test("revogação preserva identidade e oculta a conexão das opções ativas", () => {
  const { database, store } = fixture();
  store.create({ id: "connection-1", pluginId: "example.plugin", name: "Conta principal" });
  assert.ok(store.revoke("example.plugin", "connection-1")?.revokedAt);
  assert.equal(store.list("example.plugin").length, 0);
  assert.equal(store.list("example.plugin", true).length, 1);
  database.close();
});
