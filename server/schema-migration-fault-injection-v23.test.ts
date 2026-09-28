import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  listMigrationJournal,
  readSchemaVersion,
  runSchemaMigrations,
  type SchemaMigration,
  type SchemaMigrationCheckpoint,
} from "./schema-migrations";

const fixtureRoot = path.resolve(
  "tests/fixtures/shared-browser-upgrade-v14/02-single-profile-ready",
);

function treeHash(root: string) {
  const hash = createHash("sha256");
  const visit = (current: string, relative = "") => {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name).replaceAll("\\", "/");
      const stats = statSync(absolute);
      hash.update(stats.isDirectory() ? `d:${childRelative}\n` : `f:${childRelative}\n`);
      if (stats.isDirectory()) {
        visit(absolute, childRelative);
      } else {
        hash.update(readFileSync(absolute));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

function sourceSnapshot(database: Database.Database) {
  const rows = database
    .prepare(
      `SELECT id, plugin_id, name, alias, created_at, updated_at
       FROM plugin_profiles
       ORDER BY plugin_id, alias, id`,
    )
    .all();
  return JSON.stringify(rows);
}

function createMigration(failHalfCopy: () => boolean): SchemaMigration[] {
  return [
    {
      version: 1,
      name: "shared-browser-fault-harness-v2.3",
      backupBeforeStructuralWrite: true,
      steps: [
        {
          id: "create-target-table",
          run: (database) => {
            database.exec(`
              CREATE TABLE shared_browser_profile_copy (
                legacy_profile_id TEXT PRIMARY KEY,
                plugin_id TEXT NOT NULL,
                alias TEXT NOT NULL
              )
            `);
          },
        },
        {
          id: "copy-legacy-profiles",
          run: (database) => {
            const rows = database
              .prepare(
                `SELECT id, plugin_id, alias
                 FROM plugin_profiles
                 ORDER BY plugin_id, alias, id`,
              )
              .all() as Array<{ id: string; plugin_id: string; alias: string }>;
            const insert = database.prepare(
              `INSERT INTO shared_browser_profile_copy
                 (legacy_profile_id, plugin_id, alias)
               VALUES (?, ?, ?)`,
            );
            const midpoint = Math.max(1, Math.ceil(rows.length / 2));
            rows.forEach((row, index) => {
              insert.run(row.id, row.plugin_id, row.alias);
              if (index + 1 === midpoint && failHalfCopy()) {
                throw new Error("falha injetada na metade da cópia");
              }
            });
          },
        },
      ],
    },
  ];
}

type FailureCase = {
  name: string;
  shouldInterrupt: (checkpoint: SchemaMigrationCheckpoint) => boolean;
  failHalfCopy?: boolean;
  assertInterruptedState: (database: Database.Database) => void;
};

const cases: FailureCase[] = [
  {
    name: "depois do backup",
    shouldInterrupt: (checkpoint) => checkpoint.phase === "after-backup",
    assertInterruptedState: (database) => {
      assert.equal(readSchemaVersion(database), 0);
      assert.equal(
        database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM sqlite_master
             WHERE type = 'table' AND name = 'shared_browser_profile_copy'`,
          )
          .pluck()
          .get(),
        0,
      );
    },
  },
  {
    name: "depois da criação da tabela",
    shouldInterrupt: (checkpoint) =>
      checkpoint.phase === "after-step" && checkpoint.stepId === "create-target-table",
    assertInterruptedState: (database) => {
      assert.equal(readSchemaVersion(database), 0);
      assert.equal(
        database.prepare("SELECT COUNT(*) FROM shared_browser_profile_copy").pluck().get(),
        0,
      );
      assert.deepEqual(listMigrationJournal(database)[0]?.completedSteps, ["create-target-table"]);
    },
  },
  {
    name: "na metade da cópia",
    shouldInterrupt: () => false,
    failHalfCopy: true,
    assertInterruptedState: (database) => {
      assert.equal(readSchemaVersion(database), 0);
      assert.equal(
        database.prepare("SELECT COUNT(*) FROM shared_browser_profile_copy").pluck().get(),
        0,
      );
      assert.equal(listMigrationJournal(database)[0]?.status, "failed");
      assert.deepEqual(listMigrationJournal(database)[0]?.completedSteps, ["create-target-table"]);
    },
  },
  {
    name: "antes do commit final",
    shouldInterrupt: (checkpoint) => checkpoint.phase === "before-final-commit",
    assertInterruptedState: (database) => {
      const sourceCount = database.prepare("SELECT COUNT(*) FROM plugin_profiles").pluck().get();
      assert.equal(readSchemaVersion(database), 0);
      assert.equal(
        database.prepare("SELECT COUNT(*) FROM shared_browser_profile_copy").pluck().get(),
        sourceCount,
      );
      assert.deepEqual(listMigrationJournal(database)[0]?.completedSteps, [
        "create-target-table",
        "copy-legacy-profiles",
      ]);
    },
  },
];

for (const failureCase of cases) {
  test(`pacote 2.3 retoma sem duplicatas após interrupção ${failureCase.name}`, async () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-v23-"));
    const isolatedFixture = path.join(temporaryDirectory, "fixture");
    cpSync(fixtureRoot, isolatedFixture, { recursive: true });
    const databasePath = path.join(isolatedFixture, "data", "contentflow.sqlite");
    const profileRoot = path.join(isolatedFixture, "plugin-workspaces", "profiles");
    const backupDirectory = path.join(isolatedFixture, "data", "migration-backups");
    const database = new Database(databasePath);
    const insertProfile = database.prepare(
      `INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertProfile.run(
      "fixture-extra-a",
      "com.contentflow.fixture.browser",
      "Reserva A",
      "reserva-a",
      "2026-09-26T12:00:00.000Z",
      "2026-09-26T12:00:00.000Z",
    );
    insertProfile.run(
      "fixture-extra-b",
      "com.contentflow.fixture.browser",
      "Reserva B",
      "reserva-b",
      "2026-09-26T12:00:00.000Z",
      "2026-09-26T12:00:00.000Z",
    );
    const originalSource = sourceSnapshot(database);
    const originalProfileHash = treeHash(profileRoot);
    let halfCopyFailurePending = failureCase.failHalfCopy === true;
    let checkpointFailurePending = true;
    const migrations = createMigration(() => {
      if (!halfCopyFailurePending) return false;
      halfCopyFailurePending = false;
      return true;
    });

    try {
      await assert.rejects(
        runSchemaMigrations(database, migrations, {
          backupDirectory,
          onCheckpoint: (checkpoint) => {
            if (checkpointFailurePending && failureCase.shouldInterrupt(checkpoint)) {
              checkpointFailurePending = false;
              throw new Error(`interrupção 2.3: ${failureCase.name}`);
            }
          },
        }),
        /(?:interrupção 2\.3|falha injetada)/,
      );

      assert.equal(
        existsSync(path.join(backupDirectory, "contentflow-before-schema-v1.sqlite")),
        true,
      );
      assert.equal(sourceSnapshot(database), originalSource);
      assert.equal(treeHash(profileRoot), originalProfileHash);
      failureCase.assertInterruptedState(database);

      await runSchemaMigrations(database, migrations, { backupDirectory });
      await runSchemaMigrations(database, migrations, { backupDirectory });

      const sourceCount = database.prepare("SELECT COUNT(*) FROM plugin_profiles").pluck().get();
      const copiedCount = database
        .prepare("SELECT COUNT(*) FROM shared_browser_profile_copy")
        .pluck()
        .get();
      const distinctCopiedCount = database
        .prepare("SELECT COUNT(DISTINCT legacy_profile_id) FROM shared_browser_profile_copy")
        .pluck()
        .get();

      assert.equal(readSchemaVersion(database), 1);
      assert.equal(copiedCount, sourceCount);
      assert.equal(distinctCopiedCount, sourceCount);
      assert.equal(sourceSnapshot(database), originalSource);
      assert.equal(treeHash(profileRoot), originalProfileHash);
      assert.equal(listMigrationJournal(database)[0]?.status, "completed");
    } finally {
      database.close();
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
}
