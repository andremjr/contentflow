import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import {
  BrowserProfileStore,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
} from "./browser-profiles";
import { runSchemaMigrations } from "./schema-migrations";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-bindings-v72-"));
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

test("7.2 cria perfil global managed, vincula somente o plugin atual e preserva alias ao renomear", async () => {
  const { root, database, profiles, bindings } = await fixture();
  try {
    const profile = profiles.create({
      id: "profile-new",
      name: "Conta principal",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/profile-new",
    });
    const binding = bindings.link("plugin.a", profile.id);
    assert.ok(binding);
    assert.equal(bindings.get("plugin.b", profile.id), undefined);
    const revision = profile.updatedAt;
    const renamed = profiles.rename(profile.id, "Conta renomeada");
    assert.equal(renamed?.alias, "principal");
    assert.notEqual(renamed?.updatedAt, revision);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("7.2 compartilhamento é vínculo explícito e desvínculo apaga apenas readiness do plugin", async () => {
  const { root, database, profiles, bindings, readiness } = await fixture();
  try {
    const profile = profiles.create({
      id: "shared",
      name: "Compartilhado",
      alias: "shared",
      storageKind: "managed",
      storageKey: "browser-profiles/shared",
    });
    bindings.link("plugin.a", profile.id);
    bindings.link("plugin.b", profile.id);
    readiness.set({ pluginId: "plugin.a", profileId: profile.id, state: "ready" });
    readiness.set({ pluginId: "plugin.b", profileId: profile.id, state: "needs_auth" });
    assert.equal(bindings.unlink("plugin.a", profile.id), 1);
    assert.equal(readiness.get("plugin.a", profile.id), undefined);
    assert.equal(readiness.get("plugin.b", profile.id)?.state, "needs_auth");
    assert.ok(bindings.get("plugin.b", profile.id));
    assert.ok(profiles.get(profile.id));
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("7.2 updatedAt funciona como revisão observável para detectar escrita concorrente", async () => {
  const { root, database, profiles } = await fixture();
  try {
    const profile = profiles.create({
      id: "revisioned",
      name: "Antes",
      alias: "revisioned",
      storageKind: "managed",
      storageKey: "browser-profiles/revisioned",
    });
    const observedRevision = profile.updatedAt;
    profiles.rename(profile.id, "Depois");
    assert.notEqual(profiles.get(profile.id)?.updatedAt, observedRevision);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("API 7.2 exige consentimento e revisão e preserva perfil ao desvincular", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-profile-api-v72-"));
  const pluginsDirectory = path.join(dataDirectory, "plugins", "local");
  await mkdir(pluginsDirectory, { recursive: true });
  await cp(
    path.join(repositoryRoot, "tests", "fixtures", "profile-plugin"),
    path.join(pluginsDirectory, "profile-plugin"),
    { recursive: true },
  );
  const port = 9500 + (process.pid % 400);
  const apiBase = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));

  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if ((await fetch(`${apiBase}/api/health`)).ok) break;
      } catch {
        // API isolada ainda iniciando.
      }
      if (attempt === 79) throw new Error(`API não iniciou.\n${output.join("\n")}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal((await fetch(`${apiBase}/api/plugins`)).ok, true, output.join("\n"));

    const createResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-bindings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Novo global", alias: "owned" }),
      },
    );
    assert.equal(createResponse.status, 201, output.join("\n"));
    const created = (await createResponse.json()) as {
      profile: { id: string; alias: string; storageKind: string; updatedAt: string };
      binding: { pluginId: string };
    };
    assert.equal(created.profile.storageKind, "managed");
    assert.equal(created.binding.pluginId, "com.contentflow.e2e-profile");

    const database = new Database(path.join(dataDirectory, "contentflow.sqlite"));
    const candidateUpdatedAt = "2026-09-26T12:00:00.000Z";
    try {
      database
        .prepare(
          `INSERT INTO browser_profiles
            (id, name, alias, storage_kind, storage_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "candidate-v72",
          "Sessão compartilhada",
          "shared",
          "managed",
          "browser-profiles/candidate-v72",
          candidateUpdatedAt,
          candidateUpdatedAt,
        );
      database
        .prepare(
          `INSERT INTO plugin_profile_bindings
            (plugin_id, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        )
        .run("plugin.other", "candidate-v72", candidateUpdatedAt, candidateUpdatedAt);
    } finally {
      database.close();
    }

    const linkUrl = `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-bindings/candidate-v72`;
    const noConsent = await fetch(linkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUpdatedAt: candidateUpdatedAt }),
    });
    assert.equal(noConsent.status, 422);

    const staleLink = await fetch(linkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharedSessionConsent: true,
        profileUpdatedAt: "2026-09-26T11:59:59.000Z",
      }),
    });
    assert.equal(staleLink.status, 409);

    const linkedResponse = await fetch(linkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharedSessionConsent: true,
        profileUpdatedAt: candidateUpdatedAt,
      }),
    });
    assert.equal(linkedResponse.status, 201, output.join("\n"));
    const linked = (await linkedResponse.json()) as {
      profile: { alias: string; updatedAt: string };
      binding: { updatedAt: string };
    };

    const usageDatabase = new Database(path.join(dataDirectory, "contentflow.sqlite"));
    try {
      const channel = {
        id: "channel-uses-profile-v72",
        name: "Canal com perfil",
        createdAt: "2026-09-26T12:05:00.000Z",
        methods: {
          title: {
            name: "Título",
            processType: "title",
            blocks: [
              {
                id: "block-uses-profile-v72",
                type: "CRIAR",
                operator: "IA",
                name: "Criar título",
                instructions: "Teste",
                inputs: [],
                outputs: [],
                parameters: [],
                order: 0,
                plugin: {
                  pluginId: "com.contentflow.e2e-profile",
                  capabilityId: "generate",
                  configuration: { accountProfile: "shared" },
                },
              },
            ],
          },
        },
      };
      usageDatabase
        .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
        .run(channel.id, JSON.stringify(channel), channel.createdAt);
    } finally {
      usageDatabase.close();
    }

    const inventoryWithUsageResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-inventory`,
    );
    assert.equal(inventoryWithUsageResponse.status, 200, output.join("\n"));
    const inventoryWithUsage = (await inventoryWithUsageResponse.json()) as {
      uses: Array<{ profileId: string; methods: unknown[] }>;
    };
    assert.equal(
      inventoryWithUsage.uses.find(
        (entry) =>
          entry.profileId === "candidate-v72" &&
          (entry as { pluginId?: string }).pluginId === "com.contentflow.e2e-profile",
      )?.methods.length,
      1,
    );

    const staleRename = await fetch(linkUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renomeado", profileUpdatedAt: "stale" }),
    });
    assert.equal(staleRename.status, 409);
    const renameResponse = await fetch(linkUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renomeado", profileUpdatedAt: linked.profile.updatedAt }),
    });
    assert.equal(renameResponse.status, 200, output.join("\n"));
    const renamed = (await renameResponse.json()) as { profile: { name: string; alias: string } };
    assert.equal(renamed.profile.name, "Renomeado");
    assert.equal(renamed.profile.alias, "shared");

    const staleUnlink = await fetch(linkUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bindingUpdatedAt: "stale" }),
    });
    assert.equal(staleUnlink.status, 409);
    const unlinkResponse = await fetch(linkUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bindingUpdatedAt: linked.binding.updatedAt }),
    });
    assert.equal(unlinkResponse.status, 200, output.join("\n"));
    assert.deepEqual(await unlinkResponse.json(), {
      profileId: "candidate-v72",
      remainingBindings: 1,
      profilePreserved: true,
    });
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
