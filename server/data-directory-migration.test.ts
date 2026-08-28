import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateSiblingDataDirectory } from "./data-directory-migration";

test("migra banco e arquivos de uma pasta irmã somente quando o destino está vazio", async () => {
  const roamingDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-data-migration-"));
  try {
    const currentDataDirectory = path.join(roamingDirectory, "ContentFlow", "data");
    const sourceDataDirectory = path.join(roamingDirectory, "ContentFlow Legacy", "data");
    mkdirSync(path.join(currentDataDirectory, "plugins", "installed"), { recursive: true });
    mkdirSync(path.join(sourceDataDirectory, "plugins", "installed", "example.plugin"), {
      recursive: true,
    });
    mkdirSync(path.join(sourceDataDirectory, "uploads"), { recursive: true });

    const emptyDatabase = new Database(path.join(currentDataDirectory, "contentflow.sqlite"));
    emptyDatabase.exec(
      "CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT, created_at TEXT)",
    );
    emptyDatabase.close();

    const sourceDatabase = new Database(path.join(sourceDataDirectory, "contentflow-v0.sqlite"));
    sourceDatabase.exec(
      "CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT, created_at TEXT)",
    );
    sourceDatabase
      .prepare("INSERT INTO channels VALUES (?, ?, ?)")
      .run("channel-1", "{}", new Date(0).toISOString());
    sourceDatabase.close();
    writeFileSync(
      path.join(sourceDataDirectory, "plugins", "installed", "example.plugin", "handler.mjs"),
      "export const value = true;\n",
    );
    writeFileSync(path.join(sourceDataDirectory, "uploads", "asset.txt"), "asset\n");

    const result = await migrateSiblingDataDirectory(currentDataDirectory, roamingDirectory);
    assert.equal(result.migrated, true);
    const migratedDatabase = new Database(path.join(currentDataDirectory, "contentflow.sqlite"), {
      readonly: true,
    });
    const channelCount = migratedDatabase
      .prepare("SELECT COUNT(*) AS count FROM channels")
      .get() as { count: number };
    assert.equal(channelCount.count, 1);
    migratedDatabase.close();
    assert.equal(
      readFileSync(
        path.join(currentDataDirectory, "plugins", "installed", "example.plugin", "handler.mjs"),
        "utf8",
      ),
      "export const value = true;\n",
    );
    assert.equal(
      readFileSync(path.join(currentDataDirectory, "uploads", "asset.txt"), "utf8"),
      "asset\n",
    );
    assert.ok(result.migrated && result.backupDirectory);

    const secondRun = await migrateSiblingDataDirectory(currentDataDirectory, roamingDirectory);
    assert.deepEqual(secondRun, { migrated: false });
  } finally {
    await rm(roamingDirectory, { recursive: true, force: true });
  }
});

test("não inspeciona o perfil real quando a API usa um diretório explícito", async () => {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "contentflow-explicit-data-"));
  const roamingDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-roaming-"));
  try {
    const result = await migrateSiblingDataDirectory(testRoot, roamingDirectory);
    assert.deepEqual(result, { migrated: false });
  } finally {
    await rm(testRoot, { recursive: true, force: true });
    await rm(roamingDirectory, { recursive: true, force: true });
  }
});
