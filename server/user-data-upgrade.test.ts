import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  UserDataUpgrade,
  UpgradeError,
  planDatabaseMigration,
  convertLegacyMethod,
} from "./user-data-upgrade";
import { createEmptyMethods } from "../src/lib/domain";
import express from "express";
import { once } from "node:events";
import { registerUserDataUpgradeRoutes } from "./user-data-upgrade";

function fixture(t: test.TestContext, fieldType = "text") {
  const directory = mkdtempSync(path.join(tmpdir(), "contentflow-user-upgrade-"));
  const database = new Database(path.join(directory, "contentflow.sqlite"));
  database.exec(`CREATE TABLE channels(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE projects(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE process_executions(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE plugin_jobs(id TEXT PRIMARY KEY,execution_id TEXT,status TEXT,payload TEXT);
    CREATE TABLE state_clock(id INTEGER PRIMARY KEY,revision INTEGER); INSERT INTO state_clock VALUES(1,0);`);
  const method = {
    name: "Original name",
    processType: "theme",
    blocks: [
      {
        id: "b",
        type: "CRIAR",
        operator: "Humano",
        inputs: [],
        outputs: [
          { id: "o", key: "theme", label: "Original output", type: fieldType, required: true },
        ],
        parameters: [],
        order: 0,
      },
    ],
  };
  const channel = { id: "c", name: "Preserved channel", methods: { theme: method } };
  database.prepare("INSERT INTO channels VALUES(?,?)").run("c", JSON.stringify(channel));
  const execution = {
    id: "e",
    projectId: "p",
    channelId: "c",
    processType: "theme",
    status: "awaiting_human",
    methodSnapshot: method,
    blocks: [
      {
        blockId: "b",
        status: "awaiting_human",
        attempt: 2,
        items: [{ id: "partial-item", status: "completed", value: "Preserved", attempt: 1 }],
      },
    ],
  };
  database
    .prepare("INSERT INTO process_executions VALUES(?,?)")
    .run("e", JSON.stringify(execution));
  database
    .prepare("INSERT INTO projects VALUES(?,?)")
    .run(
      "p",
      JSON.stringify({ id: "p", channelId: "c", strategySnapshot: { methods: { theme: method } } }),
    );
  database.prepare("INSERT INTO plugin_jobs VALUES(?,?,?,?)").run(
    "old-job",
    "e",
    "pending",
    JSON.stringify({
      id: "old-job",
      request: { outputContract: [{ type: "text" }] },
      status: "pending",
      partialValues: { theme: "Preserved partial" },
    }),
  );
  mkdirSync(path.join(directory, "uploads"));
  writeFileSync(path.join(directory, "uploads", "sentinel.txt"), "preserved artifact");
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, database, upgrade: new UserDataUpgrade(database, directory), channel };
}
function payload(database: Database.Database, table = "channels", id = "c") {
  return (
    database.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id) as { payload: string }
  ).payload;
}

test("pending migration permits only idle project deletion, never other writes or deletion during apply", async (t) => {
  const { database, directory } = fixture(t, "files");
  let idle = true;
  const upgrade = new UserDataUpgrade(database, directory, () => idle);
  const app = express();
  registerUserDataUpgradeRoutes(app, upgrade);
  app.use((_request, response) => response.sendStatus(204));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/projects/p`, { method: "DELETE" })).status, 204);
  for (const [method, route] of [
    ["POST", "/api/projects"],
    ["PUT", "/api/projects/p"],
    ["DELETE", "/api/projects"],
    ["DELETE", "/api/projects/p/other"],
    ["DELETE", "/api/channels/c"],
  ])
    assert.equal((await fetch(`${base}${route}`, { method })).status, 409);
  idle = false;
  assert.equal((await fetch(`${base}/api/projects/p`, { method: "DELETE" })).status, 409);
  idle = true;
  upgrade.applying = true;
  assert.equal((await fetch(`${base}/api/projects/p`, { method: "DELETE" })).status, 409);
});

test("planning is read-only and old channels remain raw and visible", (t) => {
  const { database, directory, upgrade, channel } = fixture(t);
  const before = payload(database);
  const files = readdirSync(directory);
  const changes = database.prepare("SELECT total_changes() AS n").get();
  for (let i = 0; i < 3; i++) {
    assert.equal(upgrade.plan().canApply, true);
    assert.equal(upgrade.backgroundAllowed(), false);
  }
  assert.equal(payload(database), before);
  assert.deepEqual(JSON.parse(before), channel);
  assert.deepEqual(readdirSync(directory), files);
  assert.deepEqual(database.prepare("SELECT total_changes() AS n").get(), changes);
});

test("explicit apply creates verified backup, preserves operational history and is idempotent", async (t) => {
  const { database, directory, upgrade } = fixture(t);
  const before = payload(database);
  const oldJob = payload(database, "plugin_jobs", "old-job");
  const oldItems = JSON.parse(payload(database, "process_executions", "e")).blocks[0].items;
  const plan = upgrade.plan();
  const result = await upgrade.apply(plan.planId, true);
  assert.equal(result.applied, true);
  assert.equal(result.plan.required, false);
  assert.equal(upgrade.backgroundAllowed(), true);
  assert.equal(JSON.parse(payload(database)).methods.theme.contractVersion, 3);
  assert.equal(payload(database, "plugin_jobs", "old-job"), oldJob);
  assert.deepEqual(
    JSON.parse(payload(database, "process_executions", "e")).blocks[0].items,
    oldItems,
  );
  assert.equal(
    readFileSync(path.join(directory, "uploads", "sentinel.txt"), "utf8"),
    "preserved artifact",
  );
  const backup = new Database(result.backupPath, { readonly: true });
  assert.equal(payload(backup), before);
  assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
  backup.close();
  const manifest = JSON.parse(readFileSync(`${result.backupPath}.json`, "utf8"));
  assert.equal(
    createHash("sha256").update(readFileSync(result.backupPath)).digest("hex"),
    manifest.sha256,
  );
  assert.ok(manifest.recovery.includes("Stop ContentFlow"));
  assert.equal(upgrade.executionHasHistoricalJobs("e"), true);
  assert.equal(planDatabaseMigration(database, directory).updates.length, 0);
  await assert.rejects(upgrade.apply(result.plan.planId, true), { code: "UPGRADE_AMBIGUOUS" });
});

test("ambiguity leaves every row and directory unchanged", async (t) => {
  const { database, directory, upgrade } = fixture(t, "files");
  const before = payload(database);
  const plan = upgrade.plan();
  assert.ok(plan.diagnostics.length);
  assert.equal(plan.canApply, false);
  await assert.rejects(upgrade.apply(plan.planId, true), { code: "UPGRADE_AMBIGUOUS" });
  assert.equal(payload(database), before);
  assert.equal(readdirSync(directory).includes("migration-backups"), false);
});

test("apply requires explicit backup consent and an inspected fresh plan", async (t) => {
  const { database, upgrade } = fixture(t);
  const plan = upgrade.plan();
  const before = payload(database);
  await assert.rejects(upgrade.apply(plan.planId, false), { code: "BACKUP_CONFIRMATION_REQUIRED" });
  await assert.rejects(upgrade.apply("unseen", true), { code: "PLAN_CHANGED" });
  database
    .prepare("UPDATE channels SET payload=? WHERE id='c'")
    .run(JSON.stringify({ ...JSON.parse(before), name: "Changed" }));
  await assert.rejects(upgrade.apply(plan.planId, true), { code: "PLAN_CHANGED" });
});

test("transaction rolls back all converted rows on failure and retains verified backup", async (t) => {
  const { database, directory, upgrade } = fixture(t);
  const before = payload(database);
  database.exec(
    "CREATE TRIGGER reject_upgrade BEFORE UPDATE ON process_executions BEGIN SELECT RAISE(ABORT,'injected fault'); END;",
  );
  const plan = upgrade.plan();
  let backupPath: string | undefined;
  await assert.rejects(upgrade.apply(plan.planId, true), (error: unknown) => {
    assert.ok(error instanceof UpgradeError);
    backupPath = error.backupPath;
    return error.code === "UPGRADE_FAILED";
  });
  assert.equal(payload(database), before);
  assert.equal(upgrade.applying, false);
  assert.equal(upgrade.backgroundAllowed(), false);
  assert.ok(backupPath);
  assert.ok(
    readdirSync(path.join(directory, "migration-backups")).some((name) => name.endsWith(".sqlite")),
  );
});

test("new plugin capabilities invalidate prior plans and a refresh can resolve a missing plugin", async (t) => {
  const { database, directory, upgrade } = fixture(t);
  const channel = JSON.parse(payload(database));
  channel.methods.theme.blocks[0].plugin = {
    pluginId: "test.plugin",
    pluginVersion: "1.0.0",
    capabilityId: "write",
    configuration: {},
  };
  database.prepare("UPDATE channels SET payload=? WHERE id='c'").run(JSON.stringify(channel));
  const prior = upgrade.plan();
  assert.equal(prior.canApply, false);
  const root = path.join(directory, "plugins", "installed", "test.plugin");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "contentflow.plugin.json"),
    JSON.stringify({
      id: "test.plugin",
      apiVersion: "2",
      version: "2.0.0",
      capabilities: [
        {
          id: "write",
          inputPorts: [],
          outputPorts: [
            {
              key: "text",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
            },
          ],
        },
      ],
    }),
  );
  await assert.rejects(upgrade.apply(prior.planId, true), { code: "PLAN_CHANGED" });
  const refreshed = upgrade.plan();
  assert.equal(refreshed.canApply, true);
  assert.equal(refreshed.currentPluginCapabilities, 1);
});

test("valid v3 drafts and snapshots never trigger legacy inference or an upgrade gate", (t) => {
  const { database, directory } = fixture(t);
  const methods = createEmptyMethods();
  methods.theme.blocks = [
    {
      id: "current",
      type: "CRIAR",
      operator: "Humano",
      parameters: [],
      order: 0,
      inputs: [
        {
          id: "new-input",
          label: "Nova entrada",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          binding: { kind: "previous_block", blockId: "", outputKey: "" },
        },
        {
          id: "quantity",
          label: "Quantidade",
          shape: { kind: "control", control: "number", cardinality: "one" },
          binding: { kind: "static", value: "2" },
        },
        {
          id: "context",
          label: "Contexto",
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
          binding: { kind: "previous_process", processType: "assets", outputKey: "images" },
        },
      ],
      outputs: [],
    },
  ];
  database
    .prepare("UPDATE channels SET payload=? WHERE id='c'")
    .run(JSON.stringify({ id: "c", methods }));
  database
    .prepare("UPDATE projects SET payload=? WHERE id='p'")
    .run(JSON.stringify({ id: "p", strategySnapshot: { methods } }));
  database
    .prepare("UPDATE process_executions SET payload=? WHERE id='e'")
    .run(JSON.stringify({ id: "e", status: "awaiting_human", methodSnapshot: methods.theme }));
  const before = ["channels", "projects", "process_executions"].map((table) =>
    database.prepare(`SELECT payload FROM ${table}`).get(),
  );
  const upgrade = new UserDataUpgrade(database, directory);
  assert.equal(upgrade.state().required, false);
  assert.equal(upgrade.backgroundAllowed(), true);
  assert.equal(upgrade.plan().pendingUpdates, 0);
  assert.deepEqual(
    ["channels", "projects", "process_executions"].map((table) =>
      database.prepare(`SELECT payload FROM ${table}`).get(),
    ),
    before,
  );
});

test("a concurrent mutation during backup is detected before any conversion", async (t) => {
  const { database, upgrade } = fixture(t);
  const plan = upgrade.plan();
  const original = database.backup.bind(database);
  database.backup = (async (...args: Parameters<typeof database.backup>) => {
    const result = await original(...args);
    database
      .prepare("UPDATE channels SET payload=? WHERE id='c'")
      .run(JSON.stringify({ id: "c", name: "Concurrent", methods: {} }));
    return result;
  }) as typeof database.backup;
  await assert.rejects(upgrade.apply(plan.planId, true), { code: "PLAN_CHANGED" });
  assert.equal(JSON.parse(payload(database)).name, "Concurrent");
});

test("reviewed Methods are staged read-only, then committed with backup and open-work synchronization", async (t) => {
  const { database, directory, upgrade } = fixture(t);
  const before = payload(database);
  const execution = JSON.parse(payload(database, "process_executions", "e"));
  execution.blocks[0].values = {};
  database
    .prepare("UPDATE process_executions SET payload=? WHERE id='e'")
    .run(JSON.stringify(execution));
  const originalExecution = payload(database, "process_executions", "e");
  const method = structuredClone(upgrade.reviewChannel(JSON.parse(before)).methods.theme);
  method.name = "Reviewed strategy";
  method.blocks[0].instructions = "Preserved intent, revised configuration";
  const plan = upgrade.proposeMethods("c", { theme: method }, upgrade.plan().planId);
  assert.equal(plan.canApply, true);
  assert.equal(upgrade.backgroundAllowed(), false);
  assert.equal(payload(database), before);
  assert.equal(payload(database, "process_executions", "e"), originalExecution);
  assert.equal(readdirSync(directory).includes("migration-backups"), false);
  await assert.rejects(upgrade.apply(plan.planId, false), { code: "BACKUP_CONFIRMATION_REQUIRED" });
  const result = await upgrade.apply(plan.planId, true);
  assert.equal(result.plan.required, false);
  assert.equal(JSON.parse(payload(database)).methods.theme.name, "Reviewed strategy");
  assert.equal(
    JSON.parse(payload(database, "projects", "p")).strategySnapshot.definitionRevision,
    JSON.parse(payload(database)).definitionRevision,
  );
  const after = JSON.parse(payload(database, "process_executions", "e"));
  assert.equal(after.methodSnapshot.name, "Reviewed strategy");
  assert.deepEqual(after.blocks[0].items, execution.blocks[0].items);
  assert.equal(after.blocks[0].attempt, 2);
  const backup = new Database(result.backupPath, { readonly: true });
  assert.equal(payload(backup), before);
  backup.close();
});

test("proposals expire when data changes and cannot remove started work", (t) => {
  const { database, upgrade } = fixture(t);
  const before = payload(database);
  const method = upgrade.reviewChannel(JSON.parse(before)).methods.theme;
  const removed = structuredClone(method);
  removed.blocks = [];
  const staged = upgrade.proposeMethods("c", { theme: removed }, upgrade.plan().planId);
  assert.equal(staged.canApply, false);
  assert.ok(staged.diagnostics.some((issue) => /remover um bloco/.test(issue.message)));
  assert.equal(payload(database), before);
  database
    .prepare("UPDATE channels SET payload=? WHERE id='c'")
    .run(JSON.stringify({ ...JSON.parse(before), name: "Changed" }));
  assert.deepEqual(upgrade.plan().proposedMethods, []);
  assert.throws(() => upgrade.proposeMethods("c", { theme: method }, staged.planId), {
    code: "PLAN_CHANGED",
  });
});

test("updated plugins do not force historical snapshots into their new port shapes", async (t) => {
  const { database, directory, upgrade } = fixture(t);
  const channel = JSON.parse(payload(database));
  const method = channel.methods.theme;
  method.blocks[0].plugin = {
    pluginId: "test.writer",
    pluginVersion: "1.0.0",
    capabilityId: "write",
    configuration: {},
  };
  method.blocks[0].outputs[0].type = "records";
  method.blocks[0].outputs[0].recordFields = [
    { id: "value", key: "value", label: "Value", type: "text", required: true },
  ];
  database.prepare("UPDATE channels SET payload=? WHERE id='c'").run(JSON.stringify(channel));
  const execution = JSON.parse(payload(database, "process_executions", "e"));
  execution.status = "completed";
  execution.methodSnapshot = method;
  database
    .prepare("UPDATE process_executions SET payload=? WHERE id='e'")
    .run(JSON.stringify(execution));
  const root = path.join(directory, "plugins", "installed", "test.writer");
  mkdirSync(root, { recursive: true });
  const shape = {
    kind: "content",
    family: "text",
    cardinality: "one",
    representation: "inline",
  } as const;
  writeFileSync(
    path.join(root, "contentflow.plugin.json"),
    JSON.stringify({
      id: "test.writer",
      apiVersion: "2",
      version: "2.0.0",
      capabilities: [{ id: "write", inputPorts: [], outputPorts: [{ key: "text", shape }] }],
    }),
  );
  const prior = upgrade.plan();
  assert.equal(prior.canApply, false);
  const reviewed = upgrade.reviewChannel(channel).methods.theme;
  reviewed.blocks[0].outputs![0].shape = shape;
  reviewed.blocks[0].outputs![0].portKey = "text";
  reviewed.blocks[0].plugin!.pluginVersion = "2.0.0";
  const staged = upgrade.proposeMethods("c", { theme: reviewed }, prior.planId);
  assert.equal(staged.canApply, true);
  await upgrade.apply(staged.planId, true);
  const snapshot = JSON.parse(payload(database, "process_executions", "e"));
  assert.equal(snapshot.methodSnapshot.blocks[0].outputs[0].shape.kind, "record");
  assert.equal(snapshot.methodSnapshot.blocks[0].plugin.pluginVersion, "1.0.0");
  assert.deepEqual(snapshot.blocks, execution.blocks);
});

test("migration consumes a text collection through a scalar input, but never coerces records", () => {
  const text = {
    kind: "content",
    family: "text",
    cardinality: "one",
    representation: "inline",
  } as const;
  for (const type of ["list", "records"]) {
    const context = {
      capabilities: new Map([
        [
          "test.writer\u0000write",
          {
            pluginId: "test.writer",
            pluginVersion: "2.0.0",
            capabilityId: "write",
            inputPorts: [{ key: "context", shape: text }],
            outputPorts: [{ key: "text", shape: text }],
          },
        ],
      ]),
      collections: new Map(),
      diagnostics: [] as Array<{ path: string; message: string }>,
    };
    const output = {
      id: "source-output",
      key: "rows",
      label: "Rows",
      type,
      required: true,
      ...(type === "records"
        ? {
            recordFields: [
              { id: "value", key: "value", label: "Value", type: "text", required: true },
            ],
          }
        : {}),
    };
    const method = {
      name: "Migration",
      processType: "theme",
      blocks: [
        {
          id: "source",
          type: "CRIAR",
          operator: "Humano",
          inputs: [],
          outputs: [output],
          parameters: [],
          order: 0,
        },
        {
          id: "target",
          type: "CRIAR",
          operator: "IA",
          inputs: [
            {
              id: "input",
              label: "Context",
              type,
              source: "previous_block",
              blockId: "source",
              sourceKey: "rows",
            },
          ],
          outputs: [{ id: "output", key: "theme", label: "Theme", type: "text", required: true }],
          parameters: [],
          order: 1,
          plugin: {
            pluginId: "test.writer",
            pluginVersion: "2.0.0",
            capabilityId: "write",
            configuration: {},
          },
        },
      ],
    };
    const converted = convertLegacyMethod(method, "synthetic", context);
    if (type === "list") {
      assert.deepEqual(context.diagnostics, []);
      assert.equal(converted.blocks[0].outputs[0].shape.cardinality, "many");
      assert.deepEqual(converted.blocks[1].inputs[0].shape, text);
    } else assert.ok(context.diagnostics.some((issue) => /Nenhuma porta/.test(issue.message)));
  }
});
