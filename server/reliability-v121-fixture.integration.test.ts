import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import Database from "better-sqlite3";
import type { Channel, ProcessExecution, Project, ProjectDelivery } from "../src/lib/domain";
import type { ExecutionOrchestrator } from "../src/lib/execution-orchestrator";
import { CONTENTFLOW_SCHEMA_VERSION } from "./schema-migrations";

type FixtureManifest = {
  productVersion: string;
  fixtureVersion: number;
  schemaVersion: number;
  expected: Record<string, number>;
  ids: {
    channelId: string;
    projectId: string;
    scriptExecutionId: string;
    pluginJobId: string;
    profileId: string;
    orchestratorId: string;
  };
};

type ServerHandle = {
  child: ChildProcess;
  baseUrl: string;
  logs: string[];
};

const repositoryRoot = process.cwd();
const fixtureRoot = path.join(repositoryRoot, "test-fixtures", "reliability", "v1.2.1");
const manifest = JSON.parse(
  readFileSync(path.join(fixtureRoot, "manifest.json"), "utf8"),
) as FixtureManifest;

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  server.close();
  await once(server, "close");
  return address.port;
}

async function request<T>(handle: ServerHandle, route: string): Promise<T> {
  const response = await fetch(`${handle.baseUrl}${route}`);
  const body = await response.text();
  assert.ok(response.ok, `${response.status} ${route}: ${body}\n${handle.logs.join("")}`);
  return JSON.parse(body) as T;
}

async function startServer(dataDirectory: string): Promise<ServerHandle> {
  const port = await availablePort();
  const logs: string[] = [];
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
      CONTENTFLOW_INSTALLED_PLUGINS_DIR: path.join(dataDirectory, "plugins", "installed"),
      CONTENTFLOW_DEVELOPMENT_LINKS_DIR: path.join(dataDirectory, "plugins", "development"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr?.on("data", (chunk) => logs.push(String(chunk)));
  const handle = { child, baseUrl: `http://127.0.0.1:${port}`, logs };
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited during bootstrap:\n${logs.join("")}`);
    try {
      await request(handle, "/api/preferences");
      return handle;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`API did not become ready:\n${logs.join("")}`);
}

async function stopServer(handle: ServerHandle) {
  handle.child.kill();
  if (handle.child.exitCode === null) {
    await Promise.race([
      once(handle.child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
}

function databaseFacts(dataDirectory: string) {
  const database = new Database(path.join(dataDirectory, "contentflow.sqlite"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const count = (table: string) =>
      Number(database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
    const schemaVersion = Number(
      database.prepare("SELECT version FROM contentflow_schema_version WHERE id = 1").pluck().get(),
    );
    const journal = database
      .prepare(
        "SELECT migration_version AS version, migration_name AS name, status, current_step AS currentStep, completed_steps AS completedSteps FROM contentflow_migration_journal ORDER BY migration_version",
      )
      .all() as Array<Record<string, unknown>>;
    const profile = database
      .prepare(
        "SELECT id, name, alias, storage_kind AS storageKind, storage_key AS storageKey FROM browser_profiles WHERE id = ?",
      )
      .get(manifest.ids.profileId) as {
      id: string;
      name: string;
      alias: string;
      storageKind: string;
      storageKey: string;
    };
    const binding = database
      .prepare(
        "SELECT plugin_id AS pluginId, profile_id AS profileId FROM plugin_profile_bindings WHERE profile_id = ?",
      )
      .get(manifest.ids.profileId) as { pluginId: string; profileId: string };
    const readiness = database
      .prepare(
        "SELECT plugin_id AS pluginId, profile_id AS profileId, state, metadata FROM plugin_profile_readiness WHERE profile_id = ?",
      )
      .get(manifest.ids.profileId) as {
      pluginId: string;
      profileId: string;
      state: string;
      metadata: string;
    };
    const pluginJob = database
      .prepare(
        "SELECT status, attempt, next_poll_at AS nextPollAt, payload FROM plugin_jobs WHERE id = ?",
      )
      .get(manifest.ids.pluginJobId) as Record<string, unknown>;
    return {
      integrity: database.pragma("integrity_check", { simple: true }),
      schemaVersion,
      journal,
      counts: {
        channels: count("channels"),
        projects: count("projects"),
        processExecutions: count("process_executions"),
        pluginJobs: count("plugin_jobs"),
        browserProfiles: count("browser_profiles"),
        pluginProfileBindings: count("plugin_profile_bindings"),
        pluginProfileReadiness: count("plugin_profile_readiness"),
        browserProfileLeases: count("browser_profile_leases"),
        orchestrators: count("execution_orchestrators"),
        libraryCollections: count("library_collections"),
        libraryItems: count("library_items"),
      },
      profile,
      binding,
      readiness: { ...readiness, metadata: JSON.parse(readiness.metadata) },
      pluginJob: {
        status: pluginJob.status,
        attempt: pluginJob.attempt,
        nextPollAt: pluginJob.nextPollAt,
        payload: JSON.parse(String(pluginJob.payload)),
      },
    };
  } finally {
    database.close();
  }
}

function persistedDomainPayloads(dataDirectory: string) {
  const database = new Database(path.join(dataDirectory, "contentflow.sqlite"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return Object.fromEntries(
      [
        "channels",
        "projects",
        "process_executions",
        "execution_orchestrators",
        "library_collections",
        "library_items",
      ].map((table) => [
        table,
        database.prepare(`SELECT id, payload FROM ${table} ORDER BY id`).all(),
      ]),
    );
  } finally {
    database.close();
  }
}

async function semanticState(handle: ServerHandle, dataDirectory: string) {
  const channels = await request<Channel[]>(handle, "/api/channels");
  const projects = await request<Project[]>(
    handle,
    `/api/projects?channelId=${manifest.ids.channelId}`,
  );
  const executions = await request<ProcessExecution[]>(
    handle,
    `/api/executions?projectId=${manifest.ids.projectId}`,
  );
  const scriptState = await request<{
    execution: ProcessExecution;
    project: Project;
    jobs: Array<Record<string, unknown>>;
  }>(handle, `/api/executions/${manifest.ids.scriptExecutionId}/state`);
  const deliveries = await request<{ deliveries: ProjectDelivery[] }>(
    handle,
    `/api/projects/${manifest.ids.projectId}/deliveries?history=true`,
  );
  const orchestrators = await request<ExecutionOrchestrator[]>(
    handle,
    `/api/orchestrators?channelId=${manifest.ids.channelId}`,
  );
  return {
    channels,
    projects,
    executions,
    scriptState,
    deliveries,
    orchestrators,
    preferences: await request(handle, "/api/preferences"),
    channelPreferences: await request(
      handle,
      `/api/channels/${manifest.ids.channelId}/preferences`,
    ),
    collections: await request(
      handle,
      `/api/library/collections?channelId=${manifest.ids.channelId}`,
    ),
    library: await request(handle, `/api/library?channelId=${manifest.ids.channelId}`),
    persistent: databaseFacts(dataDirectory),
  };
}

function assertExpectedState(state: Awaited<ReturnType<typeof semanticState>>) {
  assert.equal(state.channels.length, 1);
  assert.equal(state.channels[0].name, "Fixture 1.2.1 Channel");
  assert.deepEqual(state.channels[0].processOrder, [
    "theme",
    "title",
    "thumbnail",
    "script",
    "narration",
    "assets",
    "editing",
    "publishing",
  ]);
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].title, "Fixture 1.2.1 Project");
  assert.equal(state.projects[0].strategySnapshot?.definitionRevision, 1);
  assert.deepEqual(
    state.projects[0].strategySnapshot?.processOrder,
    state.channels[0].processOrder,
  );
  assert.equal(state.executions.length, 4);
  assert.equal(state.executions.filter((execution) => execution.status === "completed").length, 3);
  assert.equal(state.scriptState.execution.status, "awaiting_human");
  assert.deepEqual(
    state.scriptState.execution.blocks.map((block) => block.status),
    ["completed", "awaiting_human", "pending"],
  );
  assert.equal(state.scriptState.execution.methodSnapshot.name, "Fixture Script Method");
  assert.equal(state.scriptState.execution.methodSnapshot.contractVersion, 2);
  assert.deepEqual(state.scriptState.execution.methodSnapshot.blocks[1].inputs?.[0].binding, {
    kind: "previous_block",
    blockId: "script-research",
    outputKey: "findings",
  });
  assert.equal(state.scriptState.execution.blocks[0].items?.length, 2);
  assert.deepEqual(
    state.scriptState.execution.blocks[0].items?.map((item) => item.status),
    ["completed", "completed"],
  );
  assert.equal(state.scriptState.jobs.length, 1);
  assert.equal(state.scriptState.jobs[0].status, "completed");
  assert.equal(state.deliveries.deliveries.length, 4);
  assert.equal(
    state.deliveries.deliveries.find((delivery) => delivery.blockId === "script-research")?.items
      .length,
    2,
  );
  assert.equal(state.orchestrators.length, 1);
  assert.equal(state.orchestrators[0].status, "cancelled");
  assert.deepEqual(state.preferences, {
    theme: "light",
    language: "en",
    notificationSound: false,
    systemNotifications: false,
    methodsLibraryView: "methods",
  });
  assert.deepEqual(state.channelPreferences, { projectView: "list" });
  assert.equal((state.collections as unknown[]).length, 1);
  assert.equal((state.library as unknown[]).length, 1);
  assert.equal(state.persistent.schemaVersion, CONTENTFLOW_SCHEMA_VERSION);
  assert.equal(state.persistent.counts.browserProfileLeases, 0);
  assert.equal(state.persistent.profile.storageKey, "browser-profiles/fixture-v121");
  assert.equal(state.persistent.binding.profileId, manifest.ids.profileId);
  assert.equal(state.persistent.readiness.state, "not_prepared");
  assert.equal(state.persistent.pluginJob.status, "completed");
}

test("fixture 1.2.1 is structurally valid, portable, small, and secret-free", () => {
  const databasePath = path.join(fixtureRoot, "contentflow.sqlite");
  assert.equal(manifest.productVersion, "1.2.1");
  assert.equal(manifest.fixtureVersion, 1);
  assert.equal(manifest.schemaVersion, CONTENTFLOW_SCHEMA_VERSION);
  assert.ok(statSync(databasePath).size < 1024 * 1024, "fixture database must stay under 1 MiB");

  const facts = databaseFacts(fixtureRoot);
  assert.equal(facts.integrity, "ok");
  assert.equal(facts.schemaVersion, CONTENTFLOW_SCHEMA_VERSION);
  assert.deepEqual(
    facts.journal.map((entry) => ({
      version: entry.version,
      status: entry.status,
      currentStep: entry.currentStep,
      completedSteps: JSON.parse(String(entry.completedSteps)),
    })),
    [
      {
        version: 1,
        status: "completed",
        currentStep: null,
        completedSteps: ["establish-versioned-migration-baseline"],
      },
      {
        version: 2,
        status: "completed",
        currentStep: null,
        completedSteps: ["create-global-browser-profile-stores"],
      },
      {
        version: 3,
        status: "completed",
        currentStep: null,
        completedSteps: ["convert-legacy-plugin-profiles"],
      },
      {
        version: 4,
        status: "completed",
        currentStep: null,
        completedSteps: ["create-browser-profile-leases"],
      },
    ],
  );
  assert.deepEqual(facts.counts, {
    channels: 1,
    projects: 1,
    processExecutions: 4,
    pluginJobs: 1,
    browserProfiles: 1,
    pluginProfileBindings: 1,
    pluginProfileReadiness: 1,
    browserProfileLeases: 1,
    orchestrators: 1,
    libraryCollections: 1,
    libraryItems: 1,
  });

  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const textValues = [
      readFileSync(path.join(fixtureRoot, "manifest.json"), "utf8"),
      ...[
        "channels",
        "projects",
        "process_executions",
        "execution_orchestrators",
        "library_collections",
        "library_items",
        "plugin_jobs",
      ].flatMap(
        (table) => database.prepare(`SELECT payload FROM ${table}`).pluck().all() as string[],
      ),
      ...(database.prepare("SELECT storage_key FROM browser_profiles").pluck().all() as string[]),
    ].join("\n");
    for (const forbidden of [
      /C:\\Users\\/i,
      /\/home\//i,
      /ghp_[A-Za-z0-9]+/,
      /sk-[A-Za-z0-9]{12,}/,
      /cookie\s*=/i,
      /password\s*[:=]/i,
      /bearer\s+[A-Za-z0-9._-]+/i,
    ]) {
      assert.doesNotMatch(textValues, forbidden);
    }
  } finally {
    database.close();
  }
});

test(
  "real bootstrap and restart preserve the 1.2.1 fixture semantics",
  { timeout: 90_000 },
  async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "contentflow-v121-open-"));
    const dataDirectory = path.join(temporaryRoot, "data");
    cpSync(fixtureRoot, dataDirectory, { recursive: true });
    const payloadsBeforeBootstrap = persistedDomainPayloads(dataDirectory);
    let first: ServerHandle | undefined;
    let second: ServerHandle | undefined;
    try {
      first = await startServer(dataDirectory);
      const afterFirstBootstrap = await semanticState(first, dataDirectory);
      assertExpectedState(afterFirstBootstrap);
      assert.deepEqual(persistedDomainPayloads(dataDirectory), payloadsBeforeBootstrap);
      await stopServer(first);
      first = undefined;

      second = await startServer(dataDirectory);
      const afterRestart = await semanticState(second, dataDirectory);
      assertExpectedState(afterRestart);
      assert.deepEqual(afterRestart, afterFirstBootstrap);
      assert.deepEqual(persistedDomainPayloads(dataDirectory), payloadsBeforeBootstrap);
    } finally {
      if (first) await stopServer(first);
      if (second) await stopServer(second);
      await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);
