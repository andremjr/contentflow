import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  BrowserProfileStore,
  browserProfileInventory,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
} from "./browser-profiles";
import { runSchemaMigrations } from "./schema-migrations";

const repositoryRoot = process.cwd();

test("pacote 7.1 separa vinculados, candidatos e usos sem expor storage físico", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-profile-inventory-v71-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    database.pragma("foreign_keys = ON");
    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(root, "migration-backups"),
    });
    const profiles = new BrowserProfileStore(database);
    const bindings = new PluginProfileBindingStore(database);
    const readiness = new PluginProfileReadinessStore(database);

    profiles.create({
      id: "linked-profile",
      name: "Perfil vinculado",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/segredo-linked",
    });
    profiles.create({
      id: "candidate-profile",
      name: "Perfil candidato",
      alias: "compartilhado",
      storageKind: "legacy",
      storageKey: "plugin-workspaces/profiles/outro-plugin/segredo-candidate",
    });
    bindings.link("plugin.a", "linked-profile");
    bindings.link("plugin.b", "candidate-profile");
    readiness.set({
      pluginId: "plugin.a",
      profileId: "linked-profile",
      state: "ready",
      checkedAt: "2026-09-26T12:00:00.000Z",
      metadata: { profilePath: "C:/nao-pode-vazar/perfil" },
    });

    const inventory = browserProfileInventory(
      profiles,
      bindings,
      readiness,
      "plugin.a",
      (binding, profile) =>
        binding.pluginId === "plugin.b" && profile.id === "candidate-profile"
          ? [
              {
                channelId: "channel-1",
                channelName: "Canal",
                processType: "assets",
                methodName: "Assets",
                blockId: "block-1",
                blockName: "Gerar",
                role: "primary",
              },
            ]
          : [],
    );
    assert.deepEqual(
      inventory.linked.map((entry) => entry.profile.id),
      ["linked-profile"],
    );
    assert.equal(inventory.linked[0]?.readiness?.state, "ready");
    assert.deepEqual(inventory.candidates, [
      {
        profile: {
          id: "candidate-profile",
          name: "Perfil candidato",
          alias: "compartilhado",
          createdAt: profiles.get("candidate-profile")?.createdAt,
          updatedAt: profiles.get("candidate-profile")?.updatedAt,
        },
        linkedPluginIds: ["plugin.b"],
      },
    ]);
    assert.deepEqual(inventory.uses, [
      {
        profileId: "candidate-profile",
        pluginId: "plugin.b",
        methods: [
          {
            channelId: "channel-1",
            channelName: "Canal",
            processType: "assets",
            methodName: "Assets",
            blockId: "block-1",
            blockName: "Gerar",
            role: "primary",
          },
        ],
      },
      { profileId: "linked-profile", pluginId: "plugin.a", methods: [] },
    ]);

    const serialized = JSON.stringify(inventory);
    assert.doesNotMatch(
      serialized,
      /storageKey|storageKind|segredo-linked|segredo-candidate|profilePath|nao-pode-vazar/,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("API 7.1 expõe inventário sanitizado e preserva a rota legada", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-profile-api-v71-"));
  const pluginsDirectory = path.join(dataDirectory, "plugins", "local");
  await mkdir(pluginsDirectory, { recursive: true });
  await cp(
    path.join(repositoryRoot, "tests", "fixtures", "profile-plugin"),
    path.join(pluginsDirectory, "profile-plugin"),
    { recursive: true },
  );
  const port = 9000 + (process.pid % 500);
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
        const response = await fetch(`${apiBase}/api/health`);
        if (response.ok) break;
      } catch {
        // Isolated API is still starting.
      }
      if (attempt === 79) throw new Error(`API não iniciou.\n${output.join("\n")}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.equal((await fetch(`${apiBase}/api/plugins`)).ok, true, output.join("\n"));
    const createdResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profiles`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Principal", alias: "principal" }),
      },
    );
    assert.equal(createdResponse.status, 201, output.join("\n"));

    const database = new Database(path.join(dataDirectory, "contentflow.sqlite"));
    const now = "2026-09-26T12:00:00.000Z";
    try {
      database
        .prepare(
          `INSERT INTO browser_profiles
            (id, name, alias, storage_kind, storage_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "candidate-api",
          "Candidato API",
          "compartilhado",
          "managed",
          "browser-profiles/caminho-privado",
          now,
          now,
        );
      database
        .prepare(
          `INSERT INTO plugin_profile_bindings
            (plugin_id, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        )
        .run("plugin.other", "candidate-api", now, now);
    } finally {
      database.close();
    }

    const inventoryResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-inventory`,
    );
    assert.equal(inventoryResponse.ok, true, output.join("\n"));
    const inventory = (await inventoryResponse.json()) as {
      linked: Array<{ profile: { id: string; alias: string } }>;
      candidates: Array<{ profile: { id: string }; linkedPluginIds: string[] }>;
      uses: Array<{ profileId: string; pluginId: string; methods: unknown[] }>;
    };
    assert.equal(
      inventory.linked.some((entry) => entry.profile.alias === "principal"),
      true,
    );
    assert.deepEqual(
      inventory.candidates.find((entry) => entry.profile.id === "candidate-api")?.linkedPluginIds,
      ["plugin.other"],
    );
    assert.equal(
      inventory.uses.some(
        (entry) => entry.profileId === "candidate-api" && entry.pluginId === "plugin.other",
      ),
      true,
    );
    const serialized = JSON.stringify(inventory);
    assert.doesNotMatch(serialized, /storageKey|storageKind|caminho-privado|browser-profiles\//);

    const legacyResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profiles`,
    );
    assert.equal(legacyResponse.ok, true);
    const legacy = (await legacyResponse.json()) as { profiles: Array<{ alias: string }> };
    assert.equal(
      legacy.profiles.some((profile) => profile.alias === "principal"),
      true,
    );
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
