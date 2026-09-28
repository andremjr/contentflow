import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type MigrationBackupTable = {
  name: string;
  count: number;
};

export type MigrationBackupManifest = {
  formatVersion: 1;
  migrationVersion: number;
  migrationName: string;
  createdAt: string;
  tables: MigrationBackupTable[];
};

export type VerifiedMigrationBackup = {
  backupPath: string;
  manifestPath: string;
  manifest: MigrationBackupManifest;
  reused: boolean;
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function databaseTableInventory(database: Database.Database) {
  const tableNames = (
    database
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);

  return tableNames.map<MigrationBackupTable>((name) => ({
    name,
    count: (
      database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get() as {
        count: number;
      }
    ).count,
  }));
}

function isBackupManifest(value: unknown): value is MigrationBackupManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MigrationBackupManifest>;
  return (
    candidate.formatVersion === 1 &&
    Number.isInteger(candidate.migrationVersion) &&
    typeof candidate.migrationName === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.tables) &&
    candidate.tables.every(
      (table) =>
        table &&
        typeof table === "object" &&
        typeof table.name === "string" &&
        Number.isInteger(table.count) &&
        table.count >= 0,
    )
  );
}

function readManifest(manifestPath: string) {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    return isBackupManifest(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function verifyMigrationBackup(backupPath: string, manifest: MigrationBackupManifest) {
  if (!existsSync(backupPath)) return false;
  let backup: Database.Database | undefined;
  try {
    backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    const quickCheck = backup.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") return false;
    const actualTables = databaseTableInventory(backup);
    return JSON.stringify(actualTables) === JSON.stringify(manifest.tables);
  } catch {
    return false;
  } finally {
    backup?.close();
  }
}

function backupStem(version: number) {
  return `contentflow-before-schema-v${version}`;
}

function existingValidBackup(directory: string, migrationVersion: number, migrationName: string) {
  if (!existsSync(directory)) return undefined;
  const stem = backupStem(migrationVersion);
  const manifests = readdirSync(directory)
    .filter((name) => name.startsWith(stem) && name.endsWith(".json"))
    .sort();

  for (const manifestFile of manifests) {
    const manifestPath = path.join(directory, manifestFile);
    const manifest = readManifest(manifestPath);
    if (
      !manifest ||
      manifest.migrationVersion !== migrationVersion ||
      manifest.migrationName !== migrationName
    ) {
      continue;
    }
    const backupPath = manifestPath.slice(0, -".json".length) + ".sqlite";
    if (verifyMigrationBackup(backupPath, manifest)) {
      return { backupPath, manifestPath, manifest };
    }
  }
  return undefined;
}

function unusedBackupPaths(directory: string, migrationVersion: number) {
  const stem = backupStem(migrationVersion);
  let suffix = "";
  let attempt = 0;
  while (true) {
    const candidateStem = path.join(directory, `${stem}${suffix}`);
    const backupPath = `${candidateStem}.sqlite`;
    const manifestPath = `${candidateStem}.json`;
    if (!existsSync(backupPath) && !existsSync(manifestPath)) {
      return { backupPath, manifestPath };
    }
    attempt += 1;
    suffix = `-${attempt}`;
  }
}

export async function ensureVerifiedMigrationBackup(
  database: Database.Database,
  options: {
    directory: string;
    migrationVersion: number;
    migrationName: string;
  },
): Promise<VerifiedMigrationBackup | undefined> {
  const sourceTables = databaseTableInventory(database);
  if (sourceTables.length === 0) return undefined;

  const reusable = existingValidBackup(
    options.directory,
    options.migrationVersion,
    options.migrationName,
  );
  if (reusable) return { ...reusable, reused: true };

  mkdirSync(options.directory, { recursive: true });
  const { backupPath, manifestPath } = unusedBackupPaths(
    options.directory,
    options.migrationVersion,
  );
  const manifest: MigrationBackupManifest = {
    formatVersion: 1,
    migrationVersion: options.migrationVersion,
    migrationName: options.migrationName,
    createdAt: new Date().toISOString(),
    tables: sourceTables,
  };

  try {
    await database.backup(backupPath);
    if (!verifyMigrationBackup(backupPath, manifest)) {
      throw new Error("O backup de migração não passou na verificação de integridade e contagens.");
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return { backupPath, manifestPath, manifest, reused: false };
  } catch (error) {
    rmSync(backupPath, { force: true });
    rmSync(manifestPath, { force: true });
    throw error;
  }
}
