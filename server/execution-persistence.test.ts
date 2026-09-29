import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob, PluginJobStore } from "./plugin-job-store";

function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE process_executions (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE execution_commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE state_clock (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL);
    INSERT INTO state_clock VALUES (1, 0);
    CREATE TRIGGER execution_clock AFTER UPDATE ON process_executions BEGIN
      UPDATE state_clock SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER project_clock AFTER UPDATE ON projects BEGIN
      UPDATE state_clock SET revision = revision + 1 WHERE id = 1;
    END;
  `);
  db.prepare("INSERT INTO process_executions VALUES (?, ?)").run("execution-1", "before");
  db.prepare("INSERT INTO projects VALUES (?, ?)").run("project-1", "before");
  const jobStore = new PluginJobStore(db);
  const request = {
    executionId: "execution-1",
    traceId: "trace-1",
    blockId: "block-1",
    capabilityId: "capability-1",
    attempt: 1,
  } as PluginExecutionRequest;
  const job = jobStore.create(
    createPersistentPluginJob({
      pluginId: "plugin-1",
      pluginVersion: "1.0.0",
      request,
      timeoutMs: 60_000,
    }),
  );
  const claim = jobStore.claim(job.id);
  assert.ok(claim);
  const read = (table: "process_executions" | "projects", id: string) =>
    (db.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id) as { payload: string })
      .payload;
  const clock = () =>
    (db.prepare("SELECT revision FROM state_clock WHERE id = 1").get() as { revision: number })
      .revision;
  return { db, jobStore, job, claim, read, clock };
}

test("manual command rollback removes execution, project, receipt and state clock changes", () => {
  const { db, read, clock } = fixture();
  try {
    assert.throws(() =>
      db.transaction(() => {
        db.prepare("UPDATE process_executions SET payload = ? WHERE id = ?").run(
          "after",
          "execution-1",
        );
        db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run("after", "project-1");
        db.prepare("INSERT INTO execution_commands VALUES (?, ?)").run("command-1", "receipt");
        throw new Error("injected commit failure");
      })(),
    );
    assert.equal(read("process_executions", "execution-1"), "before");
    assert.equal(read("projects", "project-1"), "before");
    assert.equal(db.prepare("SELECT 1 FROM execution_commands").get(), undefined);
    assert.equal(clock(), 0);
  } finally {
    db.close();
  }
});

test("PluginJobStore.save callback rolls back job, execution and project on a middle failure", () => {
  const { db, jobStore, job, claim, read, clock } = fixture();
  try {
    assert.throws(() =>
      jobStore.save(claim, { ...job, status: "completed" }, () => {
        db.prepare("UPDATE process_executions SET payload = ? WHERE id = ?").run(
          "after",
          "execution-1",
        );
        db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run("after", "project-1");
        throw new Error("injected callback failure");
      }),
    );
    assert.equal(jobStore.get(job.id)?.status, "starting");
    assert.equal(read("process_executions", "execution-1"), "before");
    assert.equal(read("projects", "project-1"), "before");
    assert.equal(clock(), 0);
  } finally {
    db.close();
  }
});

test("PluginJobStore.save commits terminal job, execution and project together", () => {
  const { db, jobStore, job, claim, read, clock } = fixture();
  try {
    jobStore.save(claim, { ...job, status: "completed" }, () => {
      db.prepare("UPDATE process_executions SET payload = ? WHERE id = ?").run(
        "after",
        "execution-1",
      );
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run("after", "project-1");
    });
    assert.equal(jobStore.get(job.id)?.status, "completed");
    assert.equal(read("process_executions", "execution-1"), "after");
    assert.equal(read("projects", "project-1"), "after");
    assert.equal(clock(), 2);
  } finally {
    db.close();
  }
});

test("cancellation intention and execution projection roll back together before abort", () => {
  const { db, jobStore, job, read, clock } = fixture();
  let aborted = false;
  try {
    assert.throws(() =>
      db.transaction(() => {
        jobStore.requestCancellation("execution-1");
        db.prepare("UPDATE process_executions SET payload = ? WHERE id = ?").run(
          "cancelled",
          "execution-1",
        );
        throw new Error("injected project write failure");
      })(),
    );
    assert.equal(aborted, false);
    assert.equal(jobStore.get(job.id)?.status, "starting");
    assert.equal(read("process_executions", "execution-1"), "before");
    assert.equal(read("projects", "project-1"), "before");
    assert.equal(clock(), 0);
    db.transaction(() => {
      jobStore.requestCancellation("execution-1");
      db.prepare("UPDATE process_executions SET payload = ? WHERE id = ?").run(
        "cancelled",
        "execution-1",
      );
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run("not_started", "project-1");
    })();
    aborted = true;
    assert.equal(jobStore.get(job.id)?.status, "cancel_requested");
    assert.equal(read("process_executions", "execution-1"), "cancelled");
    assert.equal(read("projects", "project-1"), "not_started");
    assert.equal(clock(), 2);
    assert.equal(aborted, true);
  } finally {
    db.close();
  }
});
