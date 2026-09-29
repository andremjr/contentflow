import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PluginJobStore, type PersistentPluginJob } from "../server/plugin-job-store";
import { CONTENTFLOW_SCHEMA_VERSION, runSchemaMigrations } from "../server/schema-migrations";
import type {
  ActionBlock,
  Channel,
  ProcessExecution,
  ProcessMethod,
  Project,
  ProjectDelivery,
  RuntimeValue,
  StoredFile,
  UniversalProcess,
} from "../src/lib/domain";
import { PROCESS_ORDER } from "../src/lib/domain";
import {
  buildOrchestratorSteps,
  type ExecutionOrchestrator,
} from "../src/lib/execution-orchestrator";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureDirectory = path.join(repositoryRoot, "test-fixtures", "reliability", "v1.2.1");
const fixedAt = "2026-09-01T12:00:00.000Z";
const laterAt = "2026-09-01T12:30:00.000Z";
const channelId = "fixture-v121-channel";
const projectId = "fixture-v121-project";
const pluginId = "fixture.safe-plugin";
const profileId = "fixture-v121-browser-profile";

const outputDefinitions: Record<
  UniversalProcess,
  { key: string; type: ActionBlock["outputs"] extends Array<infer Output> ? Output : never }
> = {
  theme: {
    key: "theme",
    type: { id: "theme-output", label: "Theme", key: "theme", type: "textarea", required: true },
  },
  title: {
    key: "title",
    type: { id: "title-output", label: "Title", key: "title", type: "text", required: true },
  },
  thumbnail: {
    key: "thumbnail",
    type: {
      id: "thumbnail-output",
      label: "Thumbnail",
      key: "thumbnail",
      type: "image",
      required: true,
    },
  },
  script: {
    key: "script",
    type: { id: "script-output", label: "Script", key: "script", type: "textarea", required: true },
  },
  narration: {
    key: "narration",
    type: {
      id: "narration-output",
      label: "Narration",
      key: "narration",
      type: "audio",
      required: true,
    },
  },
  assets: {
    key: "assets",
    type: { id: "assets-output", label: "Assets", key: "assets", type: "files", required: true },
  },
  editing: {
    key: "editing",
    type: { id: "editing-output", label: "Editing", key: "editing", type: "video", required: true },
  },
  publishing: {
    key: "publishing",
    type: {
      id: "publishing-output",
      label: "Publishing",
      key: "publishing",
      type: "url",
      required: true,
    },
  },
};

function methodFor(processType: UniversalProcess): ProcessMethod {
  if (processType === "script") {
    return {
      name: "Fixture Script Method",
      processType,
      blocks: [
        {
          id: "script-research",
          type: "BUSCAR",
          operator: "Código",
          name: "Collect synthetic research",
          instructions: "Collect deterministic, synthetic research notes.",
          inputs: [],
          outputs: [
            {
              id: "script-findings-output",
              label: "Research findings",
              key: "findings",
              type: "list",
              required: true,
              portKey: "result",
            },
          ],
          plugin: {
            pluginId,
            pluginVersion: "1.0.0-fixture",
            capabilityId: "safe-research",
            configuration: { scenario: "fixture_completed" },
            profileExecution: { mode: "fallback", profileIds: [profileId] },
          },
          parameters: [],
          order: 0,
        },
        {
          id: "script-draft",
          type: "CRIAR",
          operator: "Humano",
          name: "Finish script draft",
          instructions: "Complete the synthetic draft using the preserved findings.",
          inputs: [
            {
              id: "script-findings-input",
              label: "Research findings",
              type: "list",
              source: "previous_block",
              sourceKey: "findings",
              blockId: "script-research",
            },
          ],
          outputs: [outputDefinitions.script.type],
          parameters: [],
          order: 1,
        },
        {
          id: "script-validation",
          type: "VALIDAR",
          operator: "Humano",
          name: "Validate script",
          instructions: "Approve or request another editorial attempt.",
          inputs: [],
          outputs: [
            {
              id: "script-approval-output",
              label: "Approval",
              key: "approval",
              type: "approval",
              required: true,
            },
          ],
          validation: {
            targetBlockId: "script-draft",
            targetOutputKey: "script",
            mode: "approval",
            onReject: "retry_target",
            maxAttempts: 2,
            retryMode: "conversation_feedback",
          },
          parameters: [],
          order: 2,
        },
      ],
    };
  }

  return {
    name: `Fixture ${processType} Method`,
    processType,
    blocks: [
      {
        id: `${processType}-create`,
        type: "CRIAR",
        operator: "Humano",
        name: `Create ${processType}`,
        instructions: `Produce the synthetic ${processType} fixture output.`,
        inputs: [],
        outputs: [outputDefinitions[processType].type],
        parameters: [],
        order: 0,
      },
    ],
  };
}

const methods = Object.fromEntries(
  PROCESS_ORDER.map((processType) => [processType, methodFor(processType)]),
) as Channel["methods"];

const channel: Channel = {
  id: channelId,
  processOrder: [...PROCESS_ORDER],
  definitionRevision: 1,
  name: "Fixture 1.2.1 Channel",
  handle: "@fixture-v121",
  color: "#2563EB",
  subscribers: "0",
  description: "Synthetic channel for the ContentFlow 1.2.1 reliability baseline.",
  niche: "Reliability education",
  language: "en",
  activeProjects: 1,
  frequency: "Weekly",
  nextPublish: "Not scheduled",
  currentProjectProgress: 38,
  status: "attention",
  trend: [0, 1, 1, 2],
  methods,
  createdAt: fixedAt,
};

const project: Project = {
  id: projectId,
  title: "Fixture 1.2.1 Project",
  channelId,
  currentStage: "script",
  state: "awaiting_human",
  progress: 38,
  deadline: "2026-09-08",
  duration: "30 min",
  updatedAt: laterAt,
  stages: {
    theme: "done",
    title: "done",
    thumbnail: "done",
    script: "awaiting_human",
    narration: "not_started",
    assets: "not_started",
    editing: "not_started",
    publishing: "not_started",
  },
  assignee: { name: "Fixture Operator", initials: "FO" },
  thumbHue: 215,
  strategySnapshot: {
    processOrder: [...PROCESS_ORDER],
    methods: structuredClone(methods),
    definitionRevision: 1,
    capturedAt: fixedAt,
  },
  createdAt: fixedAt,
};

function delivery(
  execution: Pick<ProcessExecution, "id" | "processType">,
  blockId: string,
  outputKey: string,
  label: string,
  type: ProjectDelivery["type"],
  value: RuntimeValue,
  sourceExecutionItemIds: string[] = [],
): ProjectDelivery {
  const id = `delivery:${execution.id}:${blockId}:${outputKey}:attempt:1`;
  const values =
    ["list", "multiselect", "records", "files"].includes(type) && Array.isArray(value)
      ? value
      : [value];
  return {
    id,
    projectId,
    channelId,
    processType: execution.processType,
    executionId: execution.id,
    blockId,
    outputKey,
    label,
    type,
    cardinality:
      values.length > 1 || ["list", "multiselect", "records", "files"].includes(type)
        ? "many"
        : "one",
    attempt: 1,
    status: "completed",
    items: values.map((item, order) => ({
      id: `${id}:item:${order + 1}`,
      ...(sourceExecutionItemIds[order]
        ? { sourceExecutionItemId: sourceExecutionItemIds[order] }
        : {}),
      order,
      value: item,
    })),
    createdAt: fixedAt,
    updatedAt: fixedAt,
  };
}

const thumbnail: StoredFile = {
  id: "fixture-thumbnail-reference",
  name: "fixture-thumbnail-placeholder.png",
  mimeType: "image/png",
  size: 0,
  url: "/api/files/fixture-thumbnail-placeholder.png",
  sha256: "0000000000000000000000000000000000000000000000000000000000000000",
};

function completedExecution(processType: "theme" | "title" | "thumbnail", value: RuntimeValue) {
  const id = `fixture-v121-execution-${processType}`;
  const blockId = `${processType}-create`;
  const output = outputDefinitions[processType];
  const execution: ProcessExecution = {
    revision: 1,
    id,
    projectId,
    channelId,
    processType,
    methodSnapshot: structuredClone(methods[processType]),
    blocks: [
      {
        blockId,
        status: "completed",
        values: { [output.key]: value },
        attempt: 1,
        startedAt: fixedAt,
        completedAt: fixedAt,
      },
    ],
    deliveries: [
      delivery(
        { id, processType },
        blockId,
        output.key,
        output.type.label,
        output.type.type,
        value,
      ),
    ],
    status: "completed",
    outputStatus: "completed",
    output: {
      processType,
      values: { [output.key]: value },
      sourceBlockId: blockId,
      createdAt: fixedAt,
    },
    createdAt: fixedAt,
    updatedAt: fixedAt,
  };
  return execution;
}

const workItemIds = ["fixture-work-unit-1", "fixture-work-unit-2"];
const findings = [
  "Persist confirmed work before delegation.",
  "Reconcile uncertain effects before retry.",
];
const scriptExecution: ProcessExecution = {
  revision: 3,
  id: "fixture-v121-execution-script",
  projectId,
  channelId,
  processType: "script",
  methodSnapshot: structuredClone(methods.script),
  blocks: [
    {
      blockId: "script-research",
      status: "completed",
      values: { findings },
      attempt: 1,
      jobId: "fixture-v121-plugin-job",
      traceId: "fixture-v121-trace",
      progress: 100,
      progressMessage: "Synthetic research completed safely.",
      itemProgress: { total: 2, completed: 2, pending: 0 },
      items: findings.map((finding, order) => ({
        id: workItemIds[order],
        kind: "list_item" as const,
        order,
        input: `Synthetic research request ${order + 1}`,
        status: "completed" as const,
        durableState: "completed" as const,
        revision: 2,
        attempt: 1,
        output: finding,
        provenance: { origin: "block_input" as const, inputPort: "items" },
        startedAt: fixedAt,
        completedAt: fixedAt,
        attempts: [
          {
            id: `work-unit-attempt:${encodeURIComponent(workItemIds[order])}:1`,
            attempt: 1,
            status: "completed" as const,
            input: `Synthetic research request ${order + 1}`,
            output: finding,
            startedAt: fixedAt,
            completedAt: fixedAt,
          },
        ],
      })),
      startedAt: fixedAt,
      completedAt: fixedAt,
    },
    {
      blockId: "script-draft",
      status: "awaiting_human",
      values: { script: "A deterministic draft is waiting for a human to finish it." },
      attempt: 1,
      startedAt: laterAt,
    },
    { blockId: "script-validation", status: "pending", values: {}, attempt: 1 },
  ],
  deliveries: [
    delivery(
      { id: "fixture-v121-execution-script", processType: "script" },
      "script-research",
      "findings",
      "Research findings",
      "list",
      findings,
      workItemIds,
    ),
  ],
  status: "awaiting_human",
  outputStatus: "pending",
  createdAt: fixedAt,
  updatedAt: laterAt,
};

const executions = [
  completedExecution("theme", "Reliable unattended content production"),
  completedExecution("title", "Fixture 1.2.1 Project"),
  completedExecution("thumbnail", thumbnail),
  scriptExecution,
];

const orchestrator: ExecutionOrchestrator = {
  id: "fixture-v121-orchestrator",
  channelId,
  mode: "end_to_end",
  strategyVersion: 5,
  processOrder: [...PROCESS_ORDER],
  plannedSteps: buildOrchestratorSteps([projectId], "end_to_end", 5, PROCESS_ORDER),
  quantity: 1,
  projectPrefix: "Fixture 1.2.1",
  projectIds: [projectId],
  currentStep: 3,
  totalSteps: 8,
  status: "cancelled",
  currentProjectId: projectId,
  currentProcessType: "script",
  message: "Synthetic queue stopped safely before the fixture was captured.",
  createdAt: fixedAt,
  updatedAt: laterAt,
  stoppedAt: laterAt,
};

const pluginJob: PersistentPluginJob = {
  id: "fixture-v121-plugin-job",
  pluginId,
  pluginVersion: "1.0.0-fixture",
  capabilityId: "safe-research",
  executionId: scriptExecution.id,
  blockId: "script-research",
  attempt: 1,
  traceId: "fixture-v121-trace",
  jobId: "fixture-provider-job-terminal",
  request: {
    executionId: scriptExecution.id,
    traceId: "fixture-v121-trace",
    blockId: "script-research",
    capabilityId: "safe-research",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: { scenario: "fixture_completed" },
    settings: {},
    inputs: { items: ["Synthetic research request 1", "Synthetic research request 2"] },
    inputContract: [{ id: "fixture-items-input", label: "Items", type: "list", portKey: "items" }],
    outputContract: [
      {
        label: "Research findings",
        key: "findings",
        type: "list",
        required: true,
        portKey: "result",
      },
    ],
    resolvedInstruction: "Collect deterministic, synthetic research notes.",
    context: {
      locale: "en",
      timeZone: "UTC",
      channel: {
        id: channelId,
        name: channel.name,
        language: channel.language,
        niche: channel.niche,
      },
      project: { id: projectId, title: project.title },
      processType: "script",
      block: {
        type: "BUSCAR",
        name: "Collect synthetic research",
        instructions: "Collect deterministic, synthetic research notes.",
      },
    },
  },
  status: "completed",
  nextPollAt: laterAt,
  deadlineAt: "2026-09-01T13:00:00.000Z",
  progress: 100,
  message: "Synthetic terminal job; no external action is pending.",
  partialValues: { findings },
  partialArtifacts: [],
  cancelRequested: false,
  retryCount: 1,
  diagnosticTimeline: [
    { at: fixedAt, code: "JOB_CREATED", attempt: 1 },
    { at: laterAt, code: "JOB_COMPLETED", attempt: 1 },
  ],
  browserProfile: { profileId, alias: "fixture-v121" },
  itemOrchestration: {
    inputPort: "items",
    outputPort: "result",
    items: ["Synthetic research request 1", "Synthetic research request 2"],
    itemIds: workItemIds,
    workItems: structuredClone(scriptExecution.blocks[0].items ?? []),
    currentIndex: 2,
    accumulatedItems: findings,
  },
  createdAt: fixedAt,
  updatedAt: laterAt,
};

function createDomainSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE channel_order (channel_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX projects_channel_id ON projects(channel_id);
    CREATE TABLE process_executions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, process_type TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, process_type));
    CREATE INDEX executions_project_id ON process_executions(project_id);
    CREATE TABLE execution_orchestrators (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX orchestrators_channel_id ON execution_orchestrators(channel_id);
    CREATE TABLE library_items (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX library_channel_id ON library_items(channel_id);
    CREATE TABLE library_collections (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX library_collections_channel_id ON library_collections(channel_id);
    CREATE TABLE app_preferences (id TEXT PRIMARY KEY, theme TEXT NOT NULL, language TEXT NOT NULL, notification_sound INTEGER NOT NULL DEFAULT 0, system_notifications INTEGER NOT NULL DEFAULT 0, methods_library_view TEXT NOT NULL DEFAULT 'channels', updated_at TEXT NOT NULL);
    CREATE TABLE channel_preferences (channel_id TEXT PRIMARY KEY, project_view TEXT NOT NULL DEFAULT 'cards', updated_at TEXT NOT NULL);
    CREATE TABLE plugin_consents (plugin_id TEXT PRIMARY KEY, version TEXT NOT NULL, permissions TEXT NOT NULL, network_hosts TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE plugin_workspaces (plugin_id TEXT PRIMARY KEY, directory TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE plugin_connections (id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, name TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revoked_at TEXT);
    CREATE TABLE plugin_profiles (id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, name TEXT NOT NULL, alias TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE state_clock (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
    INSERT INTO state_clock VALUES (1, 0);
    CREATE TABLE execution_commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  `);
}

function insertFixture(database: Database.Database) {
  database
    .prepare("INSERT INTO channels VALUES (?, ?, ?)")
    .run(channel.id, JSON.stringify(channel), fixedAt);
  database.prepare("INSERT INTO channel_order VALUES (?, ?)").run(channel.id, 0);
  database
    .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
    .run(project.id, channel.id, JSON.stringify(project), fixedAt);
  const insertExecution = database.prepare("INSERT INTO process_executions VALUES (?, ?, ?, ?, ?)");
  for (const execution of executions) {
    insertExecution.run(
      execution.id,
      project.id,
      execution.processType,
      JSON.stringify(execution),
      execution.updatedAt,
    );
  }
  database
    .prepare("INSERT INTO execution_orchestrators VALUES (?, ?, ?, ?, ?)")
    .run(orchestrator.id, channel.id, JSON.stringify(orchestrator), fixedAt, laterAt);

  const collection = {
    id: "fixture-v121-collection",
    channelId,
    name: "Fixture Editorial Principles",
    fields: [
      { id: "fixture-field-name", label: "Name", type: "text", required: true },
      { id: "fixture-field-guidance", label: "Guidance", type: "textarea", required: true },
    ],
    createdAt: fixedAt,
  };
  const libraryItem = {
    id: "fixture-v121-library-item",
    channelId,
    collectionId: collection.id,
    values: {
      "fixture-field-name": "Preserve completed work",
      "fixture-field-guidance": "Never repeat a confirmed external effect without reconciliation.",
    },
    createdAt: fixedAt,
  };
  database
    .prepare("INSERT INTO library_collections VALUES (?, ?, ?, ?)")
    .run(collection.id, channel.id, JSON.stringify(collection), fixedAt);
  database
    .prepare("INSERT INTO library_items VALUES (?, ?, ?, ?)")
    .run(libraryItem.id, channel.id, JSON.stringify(libraryItem), fixedAt);
  database
    .prepare("INSERT INTO app_preferences VALUES ('global', 'light', 'en', 0, 0, 'methods', ?)")
    .run(laterAt);
  database
    .prepare("INSERT INTO channel_preferences VALUES (?, 'list', ?)")
    .run(channel.id, laterAt);
  database
    .prepare("INSERT INTO plugin_consents VALUES (?, ?, '[]', '[]', 0, ?)")
    .run(pluginId, "1.0.0-fixture", laterAt);

  database
    .prepare("INSERT INTO browser_profiles VALUES (?, ?, ?, 'managed', ?, ?, ?)")
    .run(
      profileId,
      "Fixture 1.2.1 Browser Profile",
      "fixture-v121",
      "browser-profiles/fixture-v121",
      fixedAt,
      laterAt,
    );
  database
    .prepare("INSERT INTO plugin_profile_bindings VALUES (?, ?, ?, ?)")
    .run(pluginId, profileId, fixedAt, laterAt);
  database
    .prepare("INSERT INTO plugin_profile_readiness VALUES (?, ?, 'not_prepared', ?, NULL, ?)")
    .run(pluginId, profileId, laterAt, JSON.stringify({ fixture: true, bridge: "not_checked" }));
  database
    .prepare("INSERT INTO browser_profile_leases VALUES (?, ?, 'job', ?, ?, ?, ?, ?)")
    .run(
      profileId,
      "fixture-expired-lease",
      pluginJob.id,
      pluginId,
      fixedAt,
      fixedAt,
      "2026-09-01T12:05:00.000Z",
    );
  new PluginJobStore(database).create(pluginJob);
  // Startup deletes terminal jobs whose indexed retention timestamp is older than seven days.
  // Keep the historical payload timestamps intact while pinning only that operational index so
  // this versioned fixture remains useful after its capture date.
  database
    .prepare("UPDATE plugin_jobs SET updated_at = ? WHERE id = ?")
    .run("9999-12-31T23:59:59.999Z", pluginJob.id);
}

function normalizeMigrationMetadata(database: Database.Database) {
  database
    .prepare("UPDATE contentflow_schema_version SET updated_at = ? WHERE id = 1")
    .run(fixedAt);
  database
    .prepare(
      "UPDATE contentflow_migration_journal SET started_at = ?, updated_at = ?, completed_at = ?, failed_at = NULL",
    )
    .run(fixedAt, fixedAt, fixedAt);
}

async function main() {
  const packageVersion = (
    JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  if (packageVersion !== "1.2.1")
    throw new Error(`Expected ContentFlow 1.2.1, found ${packageVersion}.`);
  if (CONTENTFLOW_SCHEMA_VERSION !== 4)
    throw new Error(`Review fixture for schema ${CONTENTFLOW_SCHEMA_VERSION} before rebuilding.`);

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "contentflow-v121-fixture-"));
  const databasePath = path.join(temporaryRoot, "contentflow.sqlite");
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    await runSchemaMigrations(database, undefined, {
      backupDirectory: path.join(temporaryRoot, "migration-backups"),
    });
    createDomainSchema(database);
    insertFixture(database);
    normalizeMigrationMetadata(database);
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.pragma("journal_mode = DELETE");
    database.exec("VACUUM");
  } finally {
    database.close();
  }

  mkdirSync(fixtureDirectory, { recursive: true });
  copyFileSync(databasePath, path.join(fixtureDirectory, "contentflow.sqlite"));
  const manifest = {
    productVersion: "1.2.1",
    fixtureVersion: 1,
    schemaVersion: CONTENTFLOW_SCHEMA_VERSION,
    generatedBy: "scripts/build-reliability-v121-fixture.ts",
    terminalJobRetentionAnchor: "9999-12-31T23:59:59.999Z",
    description:
      "Synthetic persistent ContentFlow 1.2.1 installation with completed early stages and a script stage awaiting human work.",
    expected: {
      channels: 1,
      projects: 1,
      processExecutions: 4,
      completedExecutions: 3,
      awaitingHumanExecutions: 1,
      deliveries: 4,
      workUnits: 2,
      pluginJobs: 1,
      browserProfiles: 1,
      pluginProfileBindings: 1,
      pluginProfileReadiness: 1,
      expiredLeasesBeforeBootstrap: 1,
      leasesAfterBootstrap: 0,
      orchestrators: 1,
      libraryCollections: 1,
      libraryItems: 1,
    },
    ids: {
      channelId,
      projectId,
      scriptExecutionId: scriptExecution.id,
      pluginJobId: pluginJob.id,
      profileId,
      orchestratorId: orchestrator.id,
    },
  };
  writeFileSync(
    path.join(fixtureDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(fixtureDirectory, "README.md"),
    `# ContentFlow 1.2.1 reliability fixture\n\nSynthetic, secret-free persistent installation generated by \`npm run build:v121-fixture\`. It contains one channel and project, completed Theme/Title/Thumbnail executions, a Script execution with completed research work units followed by a human wait and pending validation, a terminal plugin job, a cancelled Orchestrator, a synthetic browser profile binding/readiness record, an expired lease for startup reconciliation, a strategic collection/item, and preferences.\n\nThe terminal job payload keeps its historical timestamps. Only the denormalized SQLite retention index uses the fixed future anchor declared in the manifest, preventing the normal seven-day cleanup from making this versioned fixture decay over time.\n\nThe thumbnail is metadata-only and deliberately references a nonexistent safe placeholder; no media, credentials, cookies, real profiles, or personal paths are included.\n`,
  );
  rmSync(temporaryRoot, { recursive: true, force: true });
}

await main();
