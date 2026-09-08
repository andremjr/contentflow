import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  findPluginProfileUsages,
  pluginProfileAliasFromName,
  PluginProfileStore,
  syncPluginProfilesFromMethods,
} from "./plugin-profiles";

test("gera alias compatível sem limitar o nome visual em português", () => {
  assert.equal(
    pluginProfileAliasFromName("Conta temporária — produção"),
    "Conta-temporaria-producao",
  );
});

function fixture() {
  const database = new Database(":memory:");
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
  `);
  return { database, store: new PluginProfileStore(database) };
}

const setup = {
  configurationKey: "accountProfile",
  fallbackConfigurationKey: "fallbackAccountProfiles",
  label: "Preparar perfil",
};

const channels = [
  {
    id: "channel-1",
    name: "Históricos",
    methods: {
      title: {
        name: "Títulos",
        blocks: [
          {
            id: "block-1",
            type: "CRIAR",
            name: "Criar títulos",
            plugin: {
              pluginId: "browser.plugin",
              capabilityId: "generate",
              configuration: {
                accountProfile: "Principal",
                fallbackAccountProfiles: "Reserva 1\nReserva 2",
              },
            },
          },
        ],
      },
    },
  },
  {
    id: "channel-2",
    name: "Documentários",
    methods: {
      script: {
        name: "Roteiros",
        blocks: [
          {
            id: "block-2",
            type: "CRIAR",
            plugin: {
              pluginId: "browser.plugin",
              capabilityId: "generate",
              configuration: {
                accountProfile: "principal",
                fallbackAccountProfiles: "Reserva 2",
              },
            },
          },
        ],
      },
    },
  },
];

test("migra aliases legados sem duplicar o mesmo perfil no plugin", () => {
  const { database, store } = fixture();
  let sequence = 0;
  syncPluginProfilesFromMethods(store, channels, "browser.plugin", setup, () => `p-${++sequence}`);

  const profiles = store.list("browser.plugin");
  assert.equal(profiles.length, 3);
  assert.deepEqual(profiles.map((profile) => profile.alias).sort(), [
    "Principal",
    "Reserva 1",
    "Reserva 2",
  ]);
  database.close();
});

test("deriva canais, blocos e papel principal ou fallback sem criar restrições", () => {
  const usages = findPluginProfileUsages(channels, "browser.plugin", setup);
  assert.equal(usages.get("principal")?.length, 2);
  assert.deepEqual(
    usages
      .get("reserva 2")
      ?.map((usage) => [usage.channelName, usage.role, usage.fallbackPosition]),
    [
      ["Históricos", "fallback", 2],
      ["Documentários", "fallback", 1],
    ],
  );
});

test("renomeia somente o nome visual e preserva o alias usado pelos Métodos", () => {
  const { database, store } = fixture();
  const profile = store.create({
    id: "profile-1",
    pluginId: "browser.plugin",
    name: "Principal",
    alias: "perfil-runtime",
  });
  assert.equal(
    store.rename(profile.pluginId, profile.id, "Conta da equipe")?.name,
    "Conta da equipe",
  );
  assert.equal(store.get(profile.pluginId, profile.id)?.alias, "perfil-runtime");
  database.close();
});
