import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { createEmptyMethods } from "../src/lib/domain";
import { PluginJobStore, type PersistentPluginJob } from "./plugin-job-store";

test(
  "real API deletes ambiguous project and execution, refreshes migration and preserves unrelated data",
  { timeout: 60_000 },
  async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "contentflow-delete-upgrade-"));
    const database = new Database(path.join(directory, "contentflow.sqlite"));
    database.exec(`CREATE TABLE channels(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE projects(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE process_executions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,process_type TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    const methods = createEmptyMethods();
    const channel = { id: "c", name: "Preserved channel", methods };
    database
      .prepare("INSERT INTO channels VALUES(?,?,?)")
      .run("c", JSON.stringify(channel), "2026-01-01");
    const legacyMethod = (processType: string) => ({
      name: processType,
      processType,
      blocks: [
        {
          id: "b",
          type: "CRIAR",
          operator: "Humano",
          order: 0,
          parameters: [],
          inputs: [],
          outputs: [{ id: "o", key: "unknown", label: "Unknown", type: "file", required: true }],
        },
      ],
    });
    // The surviving Channel still needs a non-ambiguous migration after deletion.
    const channelMethod = legacyMethod("theme");
    channelMethod.blocks[0].outputs[0].type = "text";
    database.prepare("UPDATE channels SET payload=? WHERE id='c'").run(
      JSON.stringify({
        ...channel,
        methods: { ...methods, theme: channelMethod },
      }),
    );
    const bad = {
      id: "bad",
      channelId: "c",
      strategySnapshot: {
        methods: {
          theme: legacyMethod("theme"),
          thumbnail: legacyMethod("thumbnail"),
        },
      },
    };
    const good = { id: "good", channelId: "c", title: "Preserved project" };
    for (const project of [bad, good])
      database
        .prepare("INSERT INTO projects VALUES(?,?,?,?)")
        .run(project.id, "c", JSON.stringify(project), "2026-01-01");
    database.prepare("INSERT INTO process_executions VALUES(?,?,?,?,?)").run(
      "e",
      "bad",
      "theme",
      JSON.stringify({
        id: "e",
        projectId: "bad",
        channelId: "c",
        processType: "theme",
        status: "awaiting_human",
        methodSnapshot: legacyMethod("theme"),
        blocks: [],
      }),
      "2026-01-01",
    );
    new PluginJobStore(database).create({
      id: "historical-job",
      executionId: "e",
      blockId: "b",
      attempt: 1,
      pluginId: "test.legacy",
      pluginVersion: "1.0.0",
      capabilityId: "write",
      traceId: "old-trace",
      request: { outputContract: [{ type: "file" }] },
      status: "pending",
      nextPollAt: "2026-01-01",
      deadlineAt: "2026-01-02",
      partialValues: { preserved: "partial" },
      partialArtifacts: [],
      cancelRequested: false,
      retryCount: 0,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    } as unknown as PersistentPluginJob);
    database.close();
    mkdirSync(path.join(directory, "uploads"));
    writeFileSync(path.join(directory, "uploads", "sentinel.txt"), "preserved artifact");
    const socket = net.createServer().listen(0, "127.0.0.1");
    await once(socket, "listening");
    const address = socket.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    socket.close();
    await once(socket, "close");
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, CONTENTFLOW_API_PORT: String(port), CONTENTFLOW_DATA_DIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let logs = "";
    child.stdout.on("data", (chunk) => (logs += chunk));
    child.stderr.on("data", (chunk) => (logs += chunk));
    const base = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        assert.equal(child.exitCode, null, logs);
        try {
          ready = (await fetch(`${base}/api/upgrade/plan`)).ok;
        } catch {
          // Startup may not have opened the HTTP listener yet.
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, logs);
      const before = await (await fetch(`${base}/api/upgrade/plan`)).json();
      assert.equal(before.required, true);
      assert.equal(before.canApply, false);
      assert.equal(before.diagnostics.length, 6);
      assert.equal(
        (
          await fetch(`${base}/api/projects/good`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(good),
          })
        ).status,
        409,
      );
      assert.equal((await fetch(`${base}/api/projects/bad`, { method: "DELETE" })).status, 204);
      const after = await (await fetch(`${base}/api/upgrade/plan`)).json();
      assert.deepEqual(after.diagnostics, []);
      assert.equal(after.required, true);
      assert.equal(after.canApply, true);
      assert.notEqual(after.planId, before.planId);
      const stale = await fetch(`${base}/api/upgrade/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: before.planId, confirmBackup: true }),
      });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).code, "PLAN_CHANGED");
      const applied = await fetch(`${base}/api/upgrade/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: after.planId, confirmBackup: true }),
      });
      assert.equal(applied.status, 200);
      assert.equal((await applied.json()).applied, true);
      assert.equal((await fetch(`${base}/api/projects/bad`, { method: "DELETE" })).status, 404);
      const state = await (await fetch(`${base}/api/state?since=-1`)).json();
      assert.equal(state.upgrade.required, false);
      assert.deepEqual(
        state.projects.map((project: { id: string }) => project.id),
        ["good"],
      );
      assert.equal(state.executions.length, 0);
      assert.equal(state.channels[0].name, channel.name);
      const persisted = new Database(path.join(directory, "contentflow.sqlite"), {
        readonly: true,
      });
      try {
        const job = new PluginJobStore(persisted).get("historical-job");
        assert.ok(job);
        assert.equal(job.cancelRequested, true);
        assert.equal(job.status, "cancel_requested");
        assert.deepEqual(job.partialValues, { preserved: "partial" });
      } finally {
        persisted.close();
      }
      assert.equal(
        readFileSync(path.join(directory, "uploads", "sentinel.txt"), "utf8"),
        "preserved artifact",
      );
    } finally {
      const exited = once(child, "exit");
      child.kill();
      await exited;
      // Only this test's freshly created, resolved temporary directory is removed.
      assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
