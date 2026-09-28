import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { verifyMigrationBackup, type MigrationBackupManifest } from "./migration-backup";
import {
  CONTENTFLOW_SCHEMA_MIGRATIONS,
  CONTENTFLOW_SCHEMA_VERSION,
  MIGRATION_RECOVERY_ERROR_CODE,
  formatMigrationRecoveryLog,
  listMigrationJournal,
  readSchemaVersion,
  runSchemaMigrations,
  runSchemaMigrationsForStartup,
  type SchemaMigration,
} from "./schema-migrations";

test("pacote 2.1 cria versão e journal sem alterar a fonte de verdade", async () => {
  const database = new Database(":memory:");
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-schema-"));
  try {
    database.exec(`
      CREATE TABLE channels (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const payload = JSON.stringify({ id: "canal-1", name: "Canal legado" });
    database
      .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
      .run("canal-1", payload, "2026-09-26T00:00:00.000Z");

    const result = await runSchemaMigrations(database, undefined, {
      backupDirectory: temporaryDirectory,
    });

    assert.equal(result.version, CONTENTFLOW_SCHEMA_VERSION);
    assert.equal(readSchemaVersion(database), CONTENTFLOW_SCHEMA_VERSION);
    assert.deepEqual(
      listMigrationJournal(database)
        .slice(0, 1)
        .map((entry) => ({
          version: entry.version,
          name: entry.name,
          status: entry.status,
          currentStep: entry.currentStep,
          completedSteps: entry.completedSteps,
        })),
      [
        {
          version: 1,
          name: "migration-infrastructure-v2.1",
          status: "completed",
          currentStep: undefined,
          completedSteps: ["establish-versioned-migration-baseline"],
        },
      ],
    );
    assert.equal(
      (
        database.prepare("SELECT payload FROM channels WHERE id = 'canal-1'").get() as {
          payload: string;
        }
      ).payload,
      payload,
    );
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("reentrada é idempotente e não repete passos concluídos", async () => {
  const database = new Database(":memory:");
  let runs = 0;
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "idempotent",
      steps: [
        {
          id: "create-sample",
          run: (db) => {
            runs += 1;
            db.exec("CREATE TABLE sample (id TEXT PRIMARY KEY)");
          },
        },
      ],
    },
  ];
  try {
    await runSchemaMigrations(database, migrations);
    await runSchemaMigrations(database, migrations);
    assert.equal(runs, 1);
    assert.equal(readSchemaVersion(database), 1);
    assert.equal(listMigrationJournal(database)[0]?.status, "completed");
  } finally {
    database.close();
  }
});

test("falha registra etapa atual e reentrada retoma sem repetir etapa concluída", async () => {
  const database = new Database(":memory:");
  let firstRuns = 0;
  let secondRuns = 0;
  let shouldFail = true;
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "resumable",
      steps: [
        {
          id: "first",
          run: (db) => {
            firstRuns += 1;
            db.exec("CREATE TABLE first_step (id TEXT PRIMARY KEY)");
          },
        },
        {
          id: "second",
          run: (db) => {
            secondRuns += 1;
            db.exec("CREATE TABLE second_step (id TEXT PRIMARY KEY)");
            if (shouldFail) throw new Error("falha injetada");
          },
        },
      ],
    },
  ];
  try {
    await assert.rejects(runSchemaMigrations(database, migrations), /falha injetada/);
    assert.equal(readSchemaVersion(database), 0);
    assert.deepEqual(
      listMigrationJournal(database).map((entry) => ({
        status: entry.status,
        currentStep: entry.currentStep,
        completedSteps: entry.completedSteps,
      })),
      [{ status: "failed", currentStep: "second", completedSteps: ["first"] }],
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("second_step") instanceof Object,
      true,
    );
    const secondStepExistsAfterRollback = (
      database
        .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("second_step") as { count: number }
    ).count;
    assert.equal(secondStepExistsAfterRollback, 0);

    shouldFail = false;
    await runSchemaMigrations(database, migrations);

    assert.equal(firstRuns, 1);
    assert.equal(secondRuns, 2);
    assert.equal(readSchemaVersion(database), 1);
    assert.deepEqual(listMigrationJournal(database)[0]?.completedSteps, ["first", "second"]);
    assert.equal(listMigrationJournal(database)[0]?.status, "completed");
  } finally {
    database.close();
  }
});

test("pacote 2.4 retorna diagnóstico seguro e acionável sem vazar detalhes do erro", async () => {
  const database = new Database(":memory:");
  const sensitivePath = "C:\\Users\\andre\\segredo\\perfil-google";
  const sensitivePayload = "cookie=session-secret-token";
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "recovery-diagnostic",
      steps: [
        {
          id: "copy-private-state",
          run: () => {
            throw new Error(`Falha em ${sensitivePath}: ${sensitivePayload}`);
          },
        },
      ],
    },
  ];

  try {
    const result = await runSchemaMigrationsForStartup(database, migrations);
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.deepEqual(
      {
        code: result.diagnostic.code,
        schemaVersion: result.diagnostic.schemaVersion,
        targetVersion: result.diagnostic.targetVersion,
        migrationVersion: result.diagnostic.migrationVersion,
        stepId: result.diagnostic.stepId,
        journalStatus: result.diagnostic.journalStatus,
      },
      {
        code: MIGRATION_RECOVERY_ERROR_CODE,
        schemaVersion: 0,
        targetVersion: 1,
        migrationVersion: 1,
        stepId: "copy-private-state",
        journalStatus: "failed",
      },
    );
    assert.match(result.diagnostic.message, /inicialização foi interrompida/i);
    assert.match(result.diagnostic.message, /tente iniciar novamente/i);

    const log = formatMigrationRecoveryLog(result.diagnostic);
    assert.match(log, /CONTENTFLOW_MIGRATION_RECOVERY_REQUIRED/);
    assert.match(log, /schema=0 target=1 migration=1 step=copy-private-state status=failed/);
    assert.doesNotMatch(log, /Users\\andre/i);
    assert.doesNotMatch(log, /session-secret-token/i);
    assert.doesNotMatch(log, /perfil-google/i);
  } finally {
    database.close();
  }
});

test("pacote 2.4 bloqueia a continuação do bootstrap quando a migração fica parcial", async () => {
  const database = new Database(":memory:");
  let initializedAfterMigration = false;
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "startup-guard",
      steps: [
        {
          id: "first-structural-write",
          run: (db) => db.exec("CREATE TABLE partial_state (id TEXT PRIMARY KEY)"),
        },
        {
          id: "failing-write",
          run: () => {
            throw new Error("falha controlada");
          },
        },
      ],
    },
  ];

  try {
    const result = await runSchemaMigrationsForStartup(database, migrations);
    if (result.ok) initializedAfterMigration = true;

    assert.equal(result.ok, false);
    assert.equal(initializedAfterMigration, false);
    assert.equal(readSchemaVersion(database), 0);
    assert.equal(listMigrationJournal(database)[0]?.status, "failed");
    assert.deepEqual(listMigrationJournal(database)[0]?.completedSteps, ["first-structural-write"]);
  } finally {
    database.close();
  }
});

test("pacote 2.2 cria backup verificável antes da primeira escrita estrutural", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-backup-"));
  const databasePath = path.join(temporaryDirectory, "source.sqlite");
  const backupDirectory = path.join(temporaryDirectory, "migration-backups");
  const database = new Database(databasePath);
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "backup-before-write",
      backupBeforeStructuralWrite: true,
      steps: [
        {
          id: "structural-write",
          run: (db) => {
            db.exec("CREATE TABLE added_after_backup (id TEXT PRIMARY KEY)");
          },
        },
      ],
    },
  ];
  try {
    database.exec("CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
    database.prepare("INSERT INTO channels (id, payload) VALUES (?, ?)").run("c1", "one");
    database.prepare("INSERT INTO channels (id, payload) VALUES (?, ?)").run("c2", "two");

    await runSchemaMigrations(database, migrations, { backupDirectory });

    const manifestPath = path.join(backupDirectory, "contentflow-before-schema-v1.json");
    const backupPath = path.join(backupDirectory, "contentflow-before-schema-v1.sqlite");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as MigrationBackupManifest;
    assert.deepEqual(manifest.tables, [{ name: "channels", count: 2 }]);
    assert.equal(verifyMigrationBackup(backupPath, manifest), true);
    const backup = new Database(backupPath, { readonly: true });
    try {
      assert.equal(
        (
          backup
            .prepare(
              "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'added_after_backup'",
            )
            .get() as { count: number }
        ).count,
        0,
      );
    } finally {
      backup.close();
    }
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("pacote 2.2 reutiliza backup válido e nunca o sobrescreve na reentrada", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-backup-reentry-"));
  const backupDirectory = path.join(temporaryDirectory, "migration-backups");
  const database = new Database(path.join(temporaryDirectory, "source.sqlite"));
  let shouldFail = true;
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "resumable-with-backup",
      backupBeforeStructuralWrite: true,
      steps: [
        {
          id: "write",
          run: (db) => {
            db.exec("CREATE TABLE structural_change (id TEXT PRIMARY KEY)");
            if (shouldFail) throw new Error("falha depois do backup");
          },
        },
      ],
    },
  ];
  try {
    database.exec("CREATE TABLE channels (id TEXT PRIMARY KEY)");
    database.prepare("INSERT INTO channels (id) VALUES (?)").run("c1");
    await assert.rejects(
      runSchemaMigrations(database, migrations, { backupDirectory }),
      /falha depois do backup/,
    );
    const backupPath = path.join(backupDirectory, "contentflow-before-schema-v1.sqlite");
    const originalBytes = readFileSync(backupPath);

    shouldFail = false;
    await runSchemaMigrations(database, migrations, { backupDirectory });

    assert.deepEqual(readFileSync(backupPath), originalBytes);
    assert.equal(
      readFileSync(path.join(backupDirectory, "contentflow-before-schema-v1.json"), "utf8").length >
        0,
      true,
    );
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("pacote 2.2 preserva arquivo existente inválido e cria outro backup", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-backup-existing-"));
  const backupDirectory = path.join(temporaryDirectory, "migration-backups");
  const database = new Database(path.join(temporaryDirectory, "source.sqlite"));
  const migrations: SchemaMigration[] = [
    {
      version: 1,
      name: "do-not-overwrite",
      backupBeforeStructuralWrite: true,
      steps: [{ id: "write", run: (db) => db.exec("CREATE TABLE next_table (id TEXT)") }],
    },
  ];
  try {
    database.exec("CREATE TABLE channels (id TEXT PRIMARY KEY)");
    mkdirSync(backupDirectory, { recursive: true });
    const occupiedPath = path.join(backupDirectory, "contentflow-before-schema-v1.sqlite");
    writeFileSync(occupiedPath, "arquivo existente");

    await runSchemaMigrations(database, migrations, { backupDirectory });

    assert.equal(readFileSync(occupiedPath, "utf8"), "arquivo existente");
    assert.equal(
      verifyMigrationBackup(
        path.join(backupDirectory, "contentflow-before-schema-v1-1.sqlite"),
        JSON.parse(
          readFileSync(path.join(backupDirectory, "contentflow-before-schema-v1-1.json"), "utf8"),
        ) as MigrationBackupManifest,
      ),
      true,
    );
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("migrações de produção são contíguas até a versão declarada", () => {
  assert.equal(CONTENTFLOW_SCHEMA_MIGRATIONS.at(-1)?.version, CONTENTFLOW_SCHEMA_VERSION);
  assert.deepEqual(
    CONTENTFLOW_SCHEMA_MIGRATIONS.map((migration) => migration.version),
    Array.from({ length: CONTENTFLOW_SCHEMA_VERSION }, (_, index) => index + 1),
  );
});
