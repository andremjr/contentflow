import Database from "better-sqlite3";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const USER_STATE_TABLES = [
  "channels",
  "projects",
  "plugin_connections",
  "plugin_consents",
  "plugin_jobs",
  "plugin_workspaces",
] as const;

const DATA_DIRECTORIES = ["uploads", "plugins", "plugin-workspaces"] as const;

type MigrationResult =
  { migrated: false } | { migrated: true; sourceDataDirectory: string; backupDirectory?: string };

function databaseScore(databasePath: string) {
  if (!existsSync(databasePath)) return 0;
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") return 0;
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => (row as { name: string }).name),
    );
    return USER_STATE_TABLES.reduce((score, table) => {
      if (!tables.has(table)) return score;
      const count = database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as {
        count: number;
      };
      return score + count.count;
    }, 0);
  } finally {
    database.close();
  }
}

function containsFile(directory: string): boolean {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && containsFile(entryPath)) return true;
  }
  return false;
}

function findDatabase(dataDirectory: string) {
  if (!existsSync(dataDirectory)) return undefined;
  return readdirSync(dataDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^contentflow.*\.sqlite$/i.test(entry.name) &&
        !entry.name.endsWith("-shm") &&
        !entry.name.endsWith("-wal"),
    )
    .map((entry) => path.join(dataDirectory, entry.name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

function hasCurrentState(dataDirectory: string) {
  const databasePath = path.join(dataDirectory, "contentflow.sqlite");
  if (databaseScore(databasePath) > 0) return true;
  return DATA_DIRECTORIES.some((directoryName) =>
    containsFile(path.join(dataDirectory, directoryName)),
  );
}

export async function migrateSiblingDataDirectory(
  currentDataDirectory: string,
  roamingDirectory: string | undefined,
): Promise<MigrationResult> {
  if (!roamingDirectory || hasCurrentState(currentDataDirectory)) return { migrated: false };

  const currentUserDataDirectory = path.dirname(currentDataDirectory);
  if (
    path.dirname(path.resolve(currentUserDataDirectory)).toLocaleLowerCase() !==
    path.resolve(roamingDirectory).toLocaleLowerCase()
  ) {
    return { migrated: false };
  }
  const currentUserDataKey = path.resolve(currentUserDataDirectory).toLocaleLowerCase();
  const candidates = readdirSync(roamingDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toLocaleLowerCase().startsWith("contentflow") &&
        path.resolve(roamingDirectory, entry.name).toLocaleLowerCase() !== currentUserDataKey,
    )
    .map((entry) => path.join(roamingDirectory, entry.name, "data"))
    .map((dataDirectory) => ({ dataDirectory, databasePath: findDatabase(dataDirectory) }))
    .filter((candidate): candidate is { dataDirectory: string; databasePath: string } =>
      Boolean(candidate.databasePath),
    )
    .map((candidate) => ({ ...candidate, score: databaseScore(candidate.databasePath) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const source = candidates[0];
  if (!source) return { migrated: false };

  mkdirSync(currentUserDataDirectory, { recursive: true });
  const migrationId = randomUUID();
  const stagingDirectory = path.join(currentUserDataDirectory, `.data-migrating-${migrationId}`);
  const backupDirectory = existsSync(currentDataDirectory)
    ? path.join(currentUserDataDirectory, `data-backup-before-migration-${migrationId}`)
    : undefined;

  mkdirSync(stagingDirectory, { recursive: true });
  try {
    const sourceDatabase = new Database(source.databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      await sourceDatabase.backup(path.join(stagingDirectory, "contentflow.sqlite"));
    } finally {
      sourceDatabase.close();
    }

    for (const directoryName of DATA_DIRECTORIES) {
      const sourceDirectory = path.join(source.dataDirectory, directoryName);
      if (existsSync(sourceDirectory)) {
        cpSync(sourceDirectory, path.join(stagingDirectory, directoryName), { recursive: true });
      }
    }

    if (databaseScore(path.join(stagingDirectory, "contentflow.sqlite")) !== source.score) {
      throw new Error("A validação do banco migrado não corresponde à origem.");
    }
    writeFileSync(
      path.join(stagingDirectory, "data-migration.json"),
      `${JSON.stringify({ version: 1, migratedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );

    if (backupDirectory) renameSync(currentDataDirectory, backupDirectory);
    try {
      renameSync(stagingDirectory, currentDataDirectory);
    } catch (error) {
      if (backupDirectory && existsSync(backupDirectory) && !existsSync(currentDataDirectory)) {
        renameSync(backupDirectory, currentDataDirectory);
      }
      throw error;
    }
  } catch (error) {
    if (existsSync(stagingDirectory)) rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    migrated: true,
    sourceDataDirectory: source.dataDirectory,
    backupDirectory,
  };
}
