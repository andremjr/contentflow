import type Database from "better-sqlite3";
import { ensureVerifiedMigrationBackup } from "./migration-backup";

export type MigrationJournalStatus = "started" | "completed" | "failed";

export type SchemaMigrationStep = {
  id: string;
  run: (database: Database.Database) => void;
};

export type SchemaMigration = {
  version: number;
  name: string;
  backupBeforeStructuralWrite?: boolean;
  steps: SchemaMigrationStep[];
};

export type SchemaMigrationOptions = {
  backupDirectory?: string;
  onCheckpoint?: (checkpoint: SchemaMigrationCheckpoint) => void;
};

export const MIGRATION_RECOVERY_ERROR_CODE = "CONTENTFLOW_MIGRATION_RECOVERY_REQUIRED";

export type MigrationRecoveryDiagnostic = {
  code: typeof MIGRATION_RECOVERY_ERROR_CODE;
  message: string;
  schemaVersion: number;
  targetVersion: number;
  migrationVersion?: number;
  stepId?: string;
  journalStatus?: MigrationJournalStatus;
};

export type StartupSchemaMigrationResult =
  | {
      ok: true;
      version: number;
      journal: MigrationJournalEntry[];
    }
  | {
      ok: false;
      diagnostic: MigrationRecoveryDiagnostic;
    };

export type SchemaMigrationCheckpoint =
  | {
      phase: "after-backup";
      migrationVersion: number;
    }
  | {
      phase: "after-step";
      migrationVersion: number;
      stepId: string;
    }
  | {
      phase: "before-final-commit";
      migrationVersion: number;
    };

export type MigrationJournalEntry = {
  version: number;
  name: string;
  status: MigrationJournalStatus;
  currentStep?: string;
  completedSteps: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
};

type JournalRow = {
  migration_version: number;
  migration_name: string;
  status: MigrationJournalStatus;
  current_step: string | null;
  completed_steps: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  failed_at: string | null;
};

export const CONTENTFLOW_SCHEMA_VERSION = 4;

type LegacyPluginProfileRow = {
  id: string;
  plugin_id: string;
  name: string;
  alias: string;
  created_at: string;
  updated_at: string;
};

function tableExists(database: Database.Database, tableName: string) {
  return Boolean(
    database
      .prepare(
        `SELECT 1
         FROM sqlite_master
         WHERE type = 'table' AND name = ?`,
      )
      .get(tableName),
  );
}

function legacyPluginProfileStorageKey(pluginId: string, alias: string) {
  const safePluginId = pluginId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `plugin-workspaces/profiles/${safePluginId}/${alias}`;
}

export const CONTENTFLOW_SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    name: "migration-infrastructure-v2.1",
    backupBeforeStructuralWrite: true,
    steps: [
      {
        id: "establish-versioned-migration-baseline",
        run: () => {
          // The existing tables remain the source of truth. Package 2.1 only
          // establishes the version/journal contract used by later migrations.
        },
      },
    ],
  },
  {
    version: 2,
    name: "global-browser-profile-stores-v3.1",
    backupBeforeStructuralWrite: true,
    steps: [
      {
        id: "create-global-browser-profile-stores",
        run: (database) => {
          database.exec(`
            CREATE TABLE IF NOT EXISTS browser_profiles (
              id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
              name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
              alias TEXT NOT NULL CHECK (length(trim(alias)) BETWEEN 1 AND 64),
              storage_kind TEXT NOT NULL CHECK (storage_kind IN ('managed', 'legacy')),
              storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS browser_profiles_alias
              ON browser_profiles(alias COLLATE NOCASE, created_at);
            CREATE INDEX IF NOT EXISTS browser_profiles_storage
              ON browser_profiles(storage_kind, storage_key);

            CREATE TABLE IF NOT EXISTS plugin_profile_bindings (
              plugin_id TEXT NOT NULL CHECK (length(trim(plugin_id)) > 0),
              profile_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (plugin_id, profile_id),
              FOREIGN KEY (profile_id) REFERENCES browser_profiles(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS plugin_profile_bindings_plugin
              ON plugin_profile_bindings(plugin_id, created_at);
            CREATE INDEX IF NOT EXISTS plugin_profile_bindings_profile
              ON plugin_profile_bindings(profile_id, created_at);

            CREATE TABLE IF NOT EXISTS plugin_profile_readiness (
              plugin_id TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              state TEXT NOT NULL CHECK (length(trim(state)) BETWEEN 1 AND 64),
              checked_at TEXT,
              prepared_at TEXT,
              metadata TEXT NOT NULL DEFAULT '{}',
              PRIMARY KEY (plugin_id, profile_id),
              FOREIGN KEY (plugin_id, profile_id)
                REFERENCES plugin_profile_bindings(plugin_id, profile_id)
                ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS plugin_profile_readiness_state
              ON plugin_profile_readiness(plugin_id, state, checked_at);
            CREATE INDEX IF NOT EXISTS plugin_profile_readiness_profile
              ON plugin_profile_readiness(profile_id, state);
          `);
        },
      },
    ],
  },
  {
    version: 3,
    name: "convert-legacy-browser-profiles-v3.2",
    backupBeforeStructuralWrite: true,
    steps: [
      {
        id: "convert-legacy-plugin-profiles",
        run: (database) => {
          if (!tableExists(database, "plugin_profiles")) return;

          const rows = database
            .prepare(
              `SELECT id, plugin_id, name, alias, created_at, updated_at
               FROM plugin_profiles
               ORDER BY created_at, id`,
            )
            .all() as LegacyPluginProfileRow[];
          const insertProfile = database.prepare(
            `INSERT INTO browser_profiles
              (id, name, alias, storage_kind, storage_key, created_at, updated_at)
             VALUES (?, ?, ?, 'legacy', ?, ?, ?)`,
          );
          const insertBinding = database.prepare(
            `INSERT INTO plugin_profile_bindings
              (plugin_id, profile_id, created_at, updated_at)
             VALUES (?, ?, ?, ?)`,
          );

          for (const row of rows) {
            const profileId = `legacy:${row.id}`;
            insertProfile.run(
              profileId,
              row.name,
              row.alias,
              legacyPluginProfileStorageKey(row.plugin_id, row.alias),
              row.created_at,
              row.updated_at,
            );
            insertBinding.run(row.plugin_id, profileId, row.created_at, row.updated_at);
          }
        },
      },
    ],
  },
  {
    version: 4,
    name: "persistent-browser-profile-leases-v4.3",
    backupBeforeStructuralWrite: true,
    steps: [
      {
        id: "create-browser-profile-leases",
        run: (database) => {
          database.exec(`
            CREATE TABLE IF NOT EXISTS browser_profile_leases (
              profile_id TEXT PRIMARY KEY,
              lease_token TEXT NOT NULL UNIQUE,
              owner_type TEXT NOT NULL CHECK (owner_type IN ('job', 'invocation')),
              owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
              plugin_id TEXT,
              acquired_at TEXT NOT NULL,
              heartbeat_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              FOREIGN KEY (profile_id) REFERENCES browser_profiles(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS browser_profile_leases_expiration
              ON browser_profile_leases(expires_at);
            CREATE INDEX IF NOT EXISTS browser_profile_leases_owner
              ON browser_profile_leases(owner_type, owner_id);
          `);
        },
      },
    ],
  },
];

function parseCompletedSteps(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function journalEntry(row: JournalRow): MigrationJournalEntry {
  return {
    version: row.migration_version,
    name: row.migration_name,
    status: row.status,
    ...(row.current_step ? { currentStep: row.current_step } : {}),
    completedSteps: parseCompletedSteps(row.completed_steps),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.failed_at ? { failedAt: row.failed_at } : {}),
  };
}

export function ensureMigrationInfrastructure(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS contentflow_schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL CHECK (version >= 0),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contentflow_migration_journal (
      migration_version INTEGER PRIMARY KEY CHECK (migration_version > 0),
      migration_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
      current_step TEXT,
      completed_steps TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      failed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS contentflow_migration_journal_status
      ON contentflow_migration_journal(status, migration_version);
  `);

  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT OR IGNORE INTO contentflow_schema_version (id, version, updated_at)
       VALUES (1, 0, ?)`,
    )
    .run(now);
}

export function readSchemaVersion(database: Database.Database) {
  const versionTableExists = (
    database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM sqlite_master
         WHERE type = 'table' AND name = 'contentflow_schema_version'`,
      )
      .get() as { count: number }
  ).count;
  if (!versionTableExists) return 0;
  const row = database
    .prepare("SELECT version FROM contentflow_schema_version WHERE id = 1")
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}

export function listMigrationJournal(database: Database.Database) {
  return (
    database
      .prepare(
        `SELECT migration_version, migration_name, status, current_step, completed_steps,
                started_at, updated_at, completed_at, failed_at
         FROM contentflow_migration_journal
         ORDER BY migration_version`,
      )
      .all() as JournalRow[]
  ).map(journalEntry);
}

function validateMigrations(migrations: SchemaMigration[]) {
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  for (let index = 0; index < ordered.length; index += 1) {
    const migration = ordered[index];
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error("Versão de migração inválida.");
    }
    if (!migration.name.trim() || migration.steps.length === 0) {
      throw new Error(`Migração ${migration.version} sem nome ou passos.`);
    }
    if (index > 0 && ordered[index - 1].version === migration.version) {
      throw new Error(`Versão de migração duplicada: ${migration.version}.`);
    }
    const stepIds = migration.steps.map((step) => step.id);
    if (stepIds.some((stepId) => !stepId.trim()) || new Set(stepIds).size !== stepIds.length) {
      throw new Error(`Migração ${migration.version} contém passos inválidos ou duplicados.`);
    }
  }
  return ordered;
}

function migrationJournalAvailable(database: Database.Database) {
  try {
    return (
      (database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'table' AND name = 'contentflow_migration_journal'`,
        )
        .pluck()
        .get() as number) > 0
    );
  } catch {
    return false;
  }
}

export function buildMigrationRecoveryDiagnostic(
  database: Database.Database,
  migrations: SchemaMigration[] = CONTENTFLOW_SCHEMA_MIGRATIONS,
): MigrationRecoveryDiagnostic {
  let schemaVersion = 0;
  try {
    schemaVersion = readSchemaVersion(database);
  } catch {
    // Recovery diagnostics must remain available even when metadata is unreadable.
  }

  const targetVersion = migrations.reduce(
    (highest, migration) => Math.max(highest, migration.version),
    schemaVersion,
  );
  let journalEntry: MigrationJournalEntry | undefined;
  if (migrationJournalAvailable(database)) {
    try {
      journalEntry = [...listMigrationJournal(database)]
        .reverse()
        .find((entry) => entry.status !== "completed" && entry.version > schemaVersion);
    } catch {
      // Do not include raw SQLite errors, paths or user data in recovery output.
    }
  }

  const pendingMigration = [...migrations]
    .sort((left, right) => left.version - right.version)
    .find((migration) => migration.version > schemaVersion);

  return {
    code: MIGRATION_RECOVERY_ERROR_CODE,
    message:
      "A atualização interna do ContentFlow não foi concluída. A inicialização foi interrompida para evitar uso de um schema parcial. Feche o ContentFlow e tente iniciar novamente. Se o problema continuar, preserve os backups de migração existentes e informe o código de recuperação exibido no log.",
    schemaVersion,
    targetVersion,
    ...((journalEntry?.version ?? pendingMigration?.version) !== undefined
      ? { migrationVersion: journalEntry?.version ?? pendingMigration?.version }
      : {}),
    ...(journalEntry?.currentStep ? { stepId: journalEntry.currentStep } : {}),
    ...(journalEntry?.status ? { journalStatus: journalEntry.status } : {}),
  };
}

export function formatMigrationRecoveryLog(diagnostic: MigrationRecoveryDiagnostic) {
  const fields = [
    `code=${diagnostic.code}`,
    `schema=${diagnostic.schemaVersion}`,
    `target=${diagnostic.targetVersion}`,
    ...(diagnostic.migrationVersion !== undefined
      ? [`migration=${diagnostic.migrationVersion}`]
      : []),
    ...(diagnostic.stepId ? [`step=${diagnostic.stepId}`] : []),
    ...(diagnostic.journalStatus ? [`status=${diagnostic.journalStatus}`] : []),
  ];
  return `[ContentFlow migration] ${fields.join(" ")} ${diagnostic.message}`;
}

export async function runSchemaMigrations(
  database: Database.Database,
  migrations: SchemaMigration[] = CONTENTFLOW_SCHEMA_MIGRATIONS,
  options: SchemaMigrationOptions = {},
) {
  const ordered = validateMigrations(migrations);
  let currentVersion = readSchemaVersion(database);
  const backupsEnsured = new Set<number>();

  const ensureBackup = async (migration: SchemaMigration) => {
    if (!migration.backupBeforeStructuralWrite || backupsEnsured.has(migration.version)) return;
    if (!options.backupDirectory) {
      throw new Error(
        `Migração ${migration.version} exige backup verificável antes da escrita estrutural.`,
      );
    }
    await ensureVerifiedMigrationBackup(database, {
      directory: options.backupDirectory,
      migrationVersion: migration.version,
      migrationName: migration.name,
    });
    backupsEnsured.add(migration.version);
    options.onCheckpoint?.({
      phase: "after-backup",
      migrationVersion: migration.version,
    });
  };

  const firstPendingMigration = ordered.find((migration) => migration.version > currentVersion);
  if (firstPendingMigration?.version === 1) {
    await ensureBackup(firstPendingMigration);
  }

  ensureMigrationInfrastructure(database);
  currentVersion = readSchemaVersion(database);

  for (const migration of ordered) {
    if (migration.version <= currentVersion) continue;
    if (migration.version !== currentVersion + 1) {
      throw new Error(
        `Sequência de migração inválida: schema ${currentVersion}, próxima versão ${migration.version}.`,
      );
    }

    await ensureBackup(migration);

    const existing = database
      .prepare(
        `SELECT migration_version, migration_name, status, current_step, completed_steps,
                started_at, updated_at, completed_at, failed_at
         FROM contentflow_migration_journal
         WHERE migration_version = ?`,
      )
      .get(migration.version) as JournalRow | undefined;
    const completedSteps = new Set(existing ? parseCompletedSteps(existing.completed_steps) : []);
    const startTimestamp = existing?.started_at ?? new Date().toISOString();
    const firstPendingStep = migration.steps.find((step) => !completedSteps.has(step.id));
    const startNow = new Date().toISOString();

    database
      .prepare(
        `INSERT INTO contentflow_migration_journal
          (migration_version, migration_name, status, current_step, completed_steps,
           started_at, updated_at, completed_at, failed_at)
         VALUES (?, ?, 'started', ?, ?, ?, ?, NULL, NULL)
         ON CONFLICT(migration_version) DO UPDATE SET
           migration_name = excluded.migration_name,
           status = 'started',
           current_step = excluded.current_step,
           completed_steps = excluded.completed_steps,
           updated_at = excluded.updated_at,
           completed_at = NULL,
           failed_at = NULL`,
      )
      .run(
        migration.version,
        migration.name,
        firstPendingStep?.id ?? null,
        JSON.stringify([...completedSteps]),
        startTimestamp,
        startNow,
      );

    for (const step of migration.steps) {
      if (completedSteps.has(step.id)) continue;
      const stepStartedAt = new Date().toISOString();
      database
        .prepare(
          `UPDATE contentflow_migration_journal
           SET status = 'started', current_step = ?, updated_at = ?, failed_at = NULL
           WHERE migration_version = ?`,
        )
        .run(step.id, stepStartedAt, migration.version);

      try {
        database.transaction(() => {
          step.run(database);
          completedSteps.add(step.id);
          database
            .prepare(
              `UPDATE contentflow_migration_journal
               SET completed_steps = ?, updated_at = ?
               WHERE migration_version = ?`,
            )
            .run(JSON.stringify([...completedSteps]), new Date().toISOString(), migration.version);
        })();
        options.onCheckpoint?.({
          phase: "after-step",
          migrationVersion: migration.version,
          stepId: step.id,
        });
      } catch (error) {
        if (completedSteps.has(step.id)) {
          throw error;
        }
        const failedAt = new Date().toISOString();
        database
          .prepare(
            `UPDATE contentflow_migration_journal
             SET status = 'failed', current_step = ?, updated_at = ?, failed_at = ?
             WHERE migration_version = ?`,
          )
          .run(step.id, failedAt, failedAt, migration.version);
        throw error;
      }
    }

    options.onCheckpoint?.({
      phase: "before-final-commit",
      migrationVersion: migration.version,
    });

    const completedAt = new Date().toISOString();
    database.transaction(() => {
      database
        .prepare(
          `UPDATE contentflow_schema_version
           SET version = ?, updated_at = ?
           WHERE id = 1`,
        )
        .run(migration.version, completedAt);
      database
        .prepare(
          `UPDATE contentflow_migration_journal
           SET status = 'completed', current_step = NULL, updated_at = ?,
               completed_at = ?, failed_at = NULL
           WHERE migration_version = ?`,
        )
        .run(completedAt, completedAt, migration.version);
    })();
    currentVersion = migration.version;
  }

  return {
    version: currentVersion,
    journal: listMigrationJournal(database),
  };
}

export async function runSchemaMigrationsForStartup(
  database: Database.Database,
  migrations: SchemaMigration[] = CONTENTFLOW_SCHEMA_MIGRATIONS,
  options: SchemaMigrationOptions = {},
): Promise<StartupSchemaMigrationResult> {
  try {
    const result = await runSchemaMigrations(database, migrations, options);
    return { ok: true, ...result };
  } catch {
    return {
      ok: false,
      diagnostic: buildMigrationRecoveryDiagnostic(database, migrations),
    };
  }
}
