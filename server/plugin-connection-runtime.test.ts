import assert from "node:assert/strict";
import test from "node:test";
import type { PluginConnection } from "./plugin-connections";
import {
  normalizeConnectionSecretPatch,
  resolvePluginConnectionSecrets,
} from "./plugin-connection-runtime";

const plugin = {
  id: "example.plugin",
  manifest: { secretKeys: ["API_KEY"] },
};

function connection(id: string, revokedAt?: string): PluginConnection {
  return {
    id,
    pluginId: plugin.id,
    name: id,
    metadata: {},
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    revokedAt,
  };
}

function dependencies(connections: PluginConnection[]) {
  const values = new Map([
    ["account-a", "secret-a"],
    ["account-b", "secret-b"],
  ]);
  return {
    migrateLegacy: async () => undefined,
    listConnections: () => connections.filter((item) => !item.revokedAt),
    getConnection: (connectionId: string) => connections.find((item) => item.id === connectionId),
    getSecret: async (connectionId: string) => values.get(connectionId),
  };
}

test("dois blocos podem resolver contas diferentes do mesmo plugin", async () => {
  const connections = [connection("account-a"), connection("account-b")];
  const first = await resolvePluginConnectionSecrets(
    plugin,
    "account-a",
    dependencies(connections),
  );
  const second = await resolvePluginConnectionSecrets(
    plugin,
    "account-b",
    dependencies(connections),
  );
  assert.deepEqual(first, { connectionId: "account-a", secrets: { API_KEY: "secret-a" } });
  assert.deepEqual(second, { connectionId: "account-b", secrets: { API_KEY: "secret-b" } });
});

test("Método antigo só usa fallback quando existe uma única conexão", async () => {
  const single = await resolvePluginConnectionSecrets(
    plugin,
    undefined,
    dependencies([connection("account-a")]),
  );
  assert.equal(single.connectionId, "account-a");
  await assert.rejects(
    resolvePluginConnectionSecrets(
      plugin,
      undefined,
      dependencies([connection("account-a"), connection("account-b")]),
    ),
    /Escolha qual conta/,
  );
});

test("conexão revogada nunca é resolvida", async () => {
  await assert.rejects(
    resolvePluginConnectionSecrets(
      plugin,
      "account-a",
      dependencies([connection("account-a", "2026-08-27T01:00:00.000Z")]),
    ),
    /não está mais disponível/,
  );
});

test("conexão aceita somente parte das credenciais declaradas pelo plugin", () => {
  assert.deepEqual(
    normalizeConnectionSecretPatch(["PEXELS_API_KEY", "PIXABAY_API_KEY", "UNSPLASH_ACCESS_KEY"], {
      PEXELS_API_KEY: " pexels-key ",
      PIXABAY_API_KEY: "",
    }),
    {
      values: { PEXELS_API_KEY: "pexels-key" },
      removeSecretKeys: [],
      connectedSecretKeys: ["PEXELS_API_KEY"],
    },
  );
});

test("edição preserva credenciais existentes e permite substituir uma delas", () => {
  assert.deepEqual(
    normalizeConnectionSecretPatch(
      ["PEXELS_API_KEY", "PIXABAY_API_KEY"],
      { PEXELS_API_KEY: "nova-chave" },
      [],
      ["PEXELS_API_KEY", "PIXABAY_API_KEY"],
    ).connectedSecretKeys,
    ["PEXELS_API_KEY", "PIXABAY_API_KEY"],
  );
});

test("edição não permite remover a última credencial da conexão", () => {
  assert.throws(
    () => normalizeConnectionSecretPatch(["API_KEY"], {}, ["API_KEY"], ["API_KEY"]),
    /ao menos uma credencial/,
  );
});
