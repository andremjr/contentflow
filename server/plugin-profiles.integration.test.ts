import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const port = 8794;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/api/health`);
      if (response.ok) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

test("faz backup e inventaria perfis legados sem reescrever o Canal", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-profile-migration-"));
  const pluginsDirectory = path.join(dataDirectory, "plugins", "local");
  await mkdir(pluginsDirectory, { recursive: true });
  await cp(
    path.join(repositoryRoot, "tests", "fixtures", "profile-plugin"),
    path.join(pluginsDirectory, "profile-plugin"),
    { recursive: true },
  );

  const originalChannel = {
    id: "legacy-channel",
    name: "Históricos",
    createdAt: "2026-09-08T00:00:00.000Z",
    methods: {
      title: {
        name: "Títulos",
        processType: "title",
        blocks: [
          {
            id: "legacy-block",
            type: "CRIAR",
            operator: "IA",
            name: "Criar título",
            instructions: "Crie um título.",
            inputs: [],
            outputs: [],
            parameters: [],
            order: 0,
            plugin: {
              pluginId: "com.contentflow.e2e-profile",
              capabilityId: "generate",
              configuration: {
                accountProfile: "principal-legado",
                fallbackAccountProfiles: "reserva-legado",
              },
            },
          },
        ],
      },
    },
  };
  const databasePath = path.join(dataDirectory, "contentflow.sqlite");
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  legacyDatabase
    .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
    .run(originalChannel.id, JSON.stringify(originalChannel), originalChannel.createdAt);
  legacyDatabase.close();

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
    await waitForServer();
    const pluginsResponse = await fetch(`${apiBase}/api/plugins`);
    assert.equal(pluginsResponse.ok, true, output.join("\n"));
    const profilesResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profiles`,
    );
    const profiles = (await profilesResponse.json()) as {
      profiles: Array<{ id: string; alias: string; usages: unknown[] }>;
    };
    assert.equal(profilesResponse.ok, true);
    assert.deepEqual(profiles.profiles.map((profile) => profile.alias).sort(), [
      "principal-legado",
      "reserva-legado",
    ]);
    assert.equal(
      profiles.profiles.every((profile) => profile.usages.length === 1),
      true,
    );

    const consentResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/consent`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      },
    );
    assert.equal(consentResponse.ok, true);
    const primary = profiles.profiles.find((profile) => profile.alias === "principal-legado")!;
    const prepareResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profiles/${primary.id}/prepare`,
      { method: "POST" },
    );
    assert.equal(prepareResponse.ok, true, JSON.stringify(await prepareResponse.json()));
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
  }

  try {
    const migratedDatabase = new Database(databasePath, { readonly: true, fileMustExist: true });
    const migratedProfiles = migratedDatabase
      .prepare("SELECT COUNT(*) AS count FROM plugin_profiles")
      .get() as { count: number };
    assert.equal(migratedProfiles.count, 2);
    const migratedChannel = migratedDatabase
      .prepare("SELECT payload FROM channels WHERE id = ?")
      .get(originalChannel.id) as { payload: string };
    assert.equal(migratedChannel.payload, JSON.stringify(originalChannel));
    migratedDatabase.close();

    const backupPath = path.join(
      dataDirectory,
      "migration-backups",
      "contentflow-before-profile-management.sqlite",
    );
    assert.equal(existsSync(backupPath), true);
    const backupDatabase = new Database(backupPath, { readonly: true, fileMustExist: true });
    const backupProfileTable = backupDatabase
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = ?")
      .get("plugin_profiles") as { count: number };
    assert.equal(backupProfileTable.count, 0);
    backupDatabase.close();
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
