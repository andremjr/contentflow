import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Database from "better-sqlite3";

const repositoryRoot = process.cwd();
const fixtureRoot = path.join(repositoryRoot, "tests", "fixtures", "shared-browser-upgrade-v14");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedExpectations(value, root) {
  return JSON.stringify(value).replaceAll(path.resolve(root), "<FIXTURE_ROOT>");
}

test("fixtures 1.4 cobrem todos os estados de atualização e são reproduzíveis", async () => {
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "manifest.json"), "utf8"));
  assert.deepEqual(
    manifest.scenarios.map((entry) => entry.id),
    [
      "01-no-profiles",
      "02-single-profile-ready",
      "03-multiple-profiles-fallbacks",
      "04-homonymous-aliases",
      "05-method-primary-and-fallback",
      "06-completed-project",
      "07-paused-project",
      "08-interrupted-plugin-job",
      "09-partial-item-queue",
      "10-missing-plugin",
      "11-custom-workspace",
    ],
  );

  const generatedRoot = await mkdtemp(path.join(tmpdir(), "contentflow-upgrade-v14-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-shared-browser-upgrade-v14.mjs", generatedRoot],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    for (const scenario of manifest.scenarios) {
      const committedScenario = path.join(fixtureRoot, scenario.id);
      const generatedScenario = path.join(generatedRoot, scenario.id);
      const committedExpected = JSON.parse(
        await readFile(path.join(committedScenario, "expectations.json"), "utf8"),
      );
      const generatedExpected = JSON.parse(
        await readFile(path.join(generatedScenario, "expectations.json"), "utf8"),
      );
      assert.equal(
        normalizedExpectations(generatedExpected, generatedScenario),
        normalizedExpectations(committedExpected, committedScenario),
        scenario.id,
      );

      const database = new Database(path.join(committedScenario, "data", "contentflow.sqlite"), {
        readonly: true,
        fileMustExist: true,
      });
      try {
        assert.equal(database.pragma("integrity_check", { simple: true }), "ok", scenario.id);
        for (const [table, count] of Object.entries(committedExpected.counts)) {
          assert.equal(
            database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
            count,
            `${scenario.id}:${table}`,
          );
        }
        for (const [key, expectedHash] of Object.entries(committedExpected.payloadSha256)) {
          const separator = key.indexOf(":");
          const table = key.slice(0, separator);
          const id = key.slice(separator + 1);
          const row = database.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id);
          assert.ok(row, key);
          assert.equal(hash(row.payload), expectedHash, key);
        }
      } finally {
        database.close();
      }

      for (const marker of committedExpected.markers) {
        assert.equal(
          existsSync(path.join(committedScenario, marker)),
          true,
          `${scenario.id}:${marker}`,
        );
      }
      for (const relativeFolder of Object.values(committedExpected.resolvedFolders)) {
        assert.equal(
          path.isAbsolute(relativeFolder),
          false,
          `${scenario.id} deve guardar expectativa portátil de pasta`,
        );
      }
    }

    const homonymousDb = new Database(
      path.join(fixtureRoot, "04-homonymous-aliases", "data", "contentflow.sqlite"),
      { readonly: true },
    );
    try {
      const aliases = homonymousDb
        .prepare("SELECT plugin_id, alias FROM plugin_profiles ORDER BY plugin_id")
        .all();
      assert.deepEqual(aliases, [
        { plugin_id: "com.contentflow.fixture.alpha", alias: "principal" },
        { plugin_id: "com.contentflow.fixture.beta", alias: "principal" },
      ]);
    } finally {
      homonymousDb.close();
    }

    const partialDb = new Database(
      path.join(fixtureRoot, "09-partial-item-queue", "data", "contentflow.sqlite"),
      { readonly: true },
    );
    try {
      const row = partialDb
        .prepare("SELECT payload FROM plugin_jobs WHERE id = 'job-partial'")
        .get();
      const job = JSON.parse(row.payload);
      assert.equal(job.itemOrchestration.currentIndex, 1);
      assert.deepEqual(job.itemOrchestration.itemIds, ["item-1", "item-2", "item-3"]);
      assert.deepEqual(
        job.incrementalItems.map((item) => item.state),
        ["completed", "active", "pending"],
      );
    } finally {
      partialDb.close();
    }
  } finally {
    await rm(generatedRoot, { recursive: true, force: true });
  }
});
