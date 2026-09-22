import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { executionCommands } from "./execution-commands";
import { createMethodPackage, readMethodPackage } from "./method-package";
import {
  copyImportedMethods,
  parsePortableLibraryItems,
  type PortableCollectionV2,
  type PortableLibraryItemV2,
} from "../src/lib/method-file";
import { deriveProcessOutput } from "../src/lib/process-output";
import {
  applyGeneratedProjectTitle,
  reconcileGeneratedProjectTitles,
} from "../src/lib/project-title";
import Database from "better-sqlite3";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ActionBlock,
  BlockInputBinding,
  BlockExecution,
  BlockExecutionItemValue,
  Channel,
  ChannelLibraryItem,
  HumanFieldType,
  ProcessExecution,
  ProcessMethod,
  Project,
  RuntimeValue,
  StoredFile,
  StrategicCollection,
  ThumbnailLayout,
  UniversalProcess,
} from "../src/lib/domain";
import { createEmptyMethods, PROCESS_META, PROCESS_ORDER } from "../src/lib/domain";
import {
  effectiveProcessOrder,
  isProcessOrder,
  validateProcessDependencies,
  captureProjectStrategy,
  completedProcessProgress,
  nextExecutableProcess,
  projectProcessOrder,
  resolveProcessOrderForMethods,
} from "../src/lib/process-order";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeMethodBlocks,
} from "../src/lib/human-workflow";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  buildOrchestratorSteps,
  isAggregateOrchestratorStep,
  type ExecutionOrchestrator,
  type ExecutionOrchestratorMode,
  type ExecutionOrchestratorStatus,
} from "../src/lib/execution-orchestrator";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
} from "../src/lib/presentation";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginFieldContract,
  PluginProfileSetup,
} from "../src/lib/plugin-contract";
import { resolveInstructionTemplate } from "../src/lib/instruction-template";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";
import {
  activeProjectDeliveries,
  invalidateBlockDeliveries,
  normalizeExecutionDeliveries,
  recordBlockDeliveries,
  recordProcessOutputDelivery,
} from "../src/lib/deliveries";
import {
  executeRegisteredPlugin,
  getRegisteredPlugin,
  initializePluginRunner,
  type RegisteredPlugin,
} from "./plugin-runner";
import { normalizeNetworkHostPattern } from "./remote-artifact-downloader";
import { composePluginPortValue, selectPluginInputPort } from "./plugin-input-values";
import { instructionWithRetryFeedback } from "../src/lib/retry-feedback";
import {
  pluginConversationFallbackAttachments,
  pluginConversationFallbackContext,
} from "../src/lib/conversation-context";
import { collectionItemValuesForPlugin } from "../src/lib/plugin-collection";
import {
  createPersistentPluginJob,
  isPluginJobTimedOut,
  type ClaimedPluginJob,
  type PersistentPluginJob,
  PluginJobStore,
} from "./plugin-job-store";
import {
  deletePluginConnectionSecret,
  deletePluginSecret,
  getPluginConnectionSecret,
  getPluginSecret,
  setPluginConnectionSecret,
  setPluginSecret,
} from "./credential-vault";
import { canAdvanceProfileFallback, orderedProfileCandidates } from "./plugin-account-fallback";
import {
  blockExecutionItemsForJob,
  completedOutputs,
  completeCurrentOrchestratedItem,
  declaredItemOrchestration,
  failCurrentOrchestratedItem,
  invocationRequestForJob,
  itemProgressForJob,
  legacyItemOrchestration,
  nextPendingItemIndex,
  resumedItemOrchestration,
  resumedItemOrchestrationFromItems,
  selectedItemOrchestration,
  selectedItemOrchestrationFromItems,
  startCurrentOrchestratedItem,
} from "./plugin-item-orchestration";
import {
  findPluginConnectionDependencies,
  findPluginMethodDependencies,
} from "./plugin-dependencies";
import { validatePluginDirectory } from "./plugin-validation";
import { PluginConnectionStore, type PluginConnection } from "./plugin-connections";
import {
  findPluginProfileUsages,
  normalizePluginProfileAlias,
  normalizePluginProfileName,
  pluginProfileAliasFromName,
  PluginProfileStore,
  syncPluginProfilesFromMethods,
} from "./plugin-profiles";
import {
  normalizeConnectionSecretPatch,
  resolvePluginConnectionSecrets,
} from "./plugin-connection-runtime";
import { normalizePluginConversationId, resolvePluginConversation } from "./plugin-conversation";
import { discoverPluginDirectories, normalizeUserProvidedPath } from "./plugin-package";
import {
  downloadCatalogPlugin,
  extractPluginArchive,
  fetchPluginCatalog,
  type PluginCatalog,
} from "./plugin-catalog";
import { migrateSiblingDataDirectory } from "./data-directory-migration";
import { browserBridgeProfileState, stageBrowserBridge } from "./browser-profile-readiness";
import { fetchYouTubeChannel } from "./youtube";
import { pluginConcurrencySlot, pluginConcurrencySlotForRequest } from "./plugin-concurrency";
import {
  BUILDER_METHOD_CONTRACT,
  validateBuilderMethods,
  type BuilderPluginContext,
} from "./builder-methods";

const port = Number(process.env.CONTENTFLOW_API_PORT ?? 8787);
const applicationRoot = path.resolve(process.env.CONTENTFLOW_APP_ROOT ?? process.cwd());
const defaultDataDirectory =
  process.platform === "win32" && process.env.APPDATA
    ? path.join(process.env.APPDATA, "ContentFlow", "data")
    : path.join(applicationRoot, "data");
const dataDirectory = path.resolve(process.env.CONTENTFLOW_DATA_DIR ?? defaultDataDirectory);
const uploadsDirectory = path.join(dataDirectory, "uploads");
const installedPluginsDirectory = path.resolve(
  process.env.CONTENTFLOW_INSTALLED_PLUGINS_DIR ?? path.join(dataDirectory, "plugins", "installed"),
);
const developmentLinksDirectory = path.resolve(
  process.env.CONTENTFLOW_DEVELOPMENT_LINKS_DIR ??
    path.join(dataDirectory, "plugins", "development"),
);
const pluginCatalogUrl =
  process.env.CONTENTFLOW_PLUGIN_CATALOG_URL ??
  "https://github.com/andremjr/contentflow/releases/latest/download/ContentFlow-Plugin-Catalog.json";
await migrateSiblingDataDirectory(dataDirectory, process.env.APPDATA);
const nodeMajorVersion = Number(
  process.env.CONTENTFLOW_PLUGIN_NODE_MAJOR ?? process.versions.node.split(".")[0],
);
const communitySandboxAvailable = nodeMajorVersion >= 26;
const maxUploadMb = boundedEnvironmentNumber("CONTENTFLOW_MAX_UPLOAD_MB", 256, 1, 1_024);
const maxUploadStorageGb = boundedEnvironmentNumber(
  "CONTENTFLOW_MAX_UPLOAD_STORAGE_GB",
  10,
  1,
  1_024,
);
const maxUploadBytes = maxUploadMb * 1024 * 1024;
const maxUploadStorageBytes = maxUploadStorageGb * 1024 * 1024 * 1024;
const activeUploadExtensions = new Set([
  ".css",
  ".htm",
  ".html",
  ".js",
  ".mjs",
  ".svg",
  ".xhtml",
  ".xml",
]);
const activeUploadMimeTypes = new Set([
  "application/javascript",
  "application/xhtml+xml",
  "application/xml",
  "image/svg+xml",
  "text/css",
  "text/html",
  "text/javascript",
  "text/xml",
]);
mkdirSync(dataDirectory, { recursive: true });
const browserBridgeDirectory = stageBrowserBridge(applicationRoot, dataDirectory);
const builderMcpSessionPath = path.join(dataDirectory, "builder-mcp-session.json");
const builderMcpToken = randomBytes(32).toString("base64url");

function builderMcpLaunch(channelId?: string) {
  const bundledEntry = path.join(applicationRoot, "desktop-dist", "mcp.mjs");
  const sourceEntry = path.join(applicationRoot, "server", "mcp.ts");
  const tsxEntry = path.join(applicationRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const bundled = existsSync(bundledEntry);
  const command = process.env.CONTENTFLOW_PLUGIN_NODE_EXECUTABLE ?? process.execPath;
  const args = bundled
    ? [bundledEntry, "--session", builderMcpSessionPath]
    : [tsxEntry, sourceEntry, "--session", builderMcpSessionPath];
  if (channelId) args.push("--channel", channelId);
  return { command, args };
}

writeFileSync(
  builderMcpSessionPath,
  JSON.stringify(
    {
      version: 1,
      apiUrl: `http://127.0.0.1:${port}`,
      token: builderMcpToken,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  { encoding: "utf8", mode: 0o600 },
);

const databasePath = path.join(dataDirectory, "contentflow.sqlite");
const legacyDataDirectory = path.join(applicationRoot, "data");
const legacyDatabasePath = path.join(legacyDataDirectory, "contentflow.sqlite");

if (
  !existsSync(databasePath) &&
  databasePath !== legacyDatabasePath &&
  existsSync(legacyDatabasePath)
) {
  const legacyDatabase = new Database(legacyDatabasePath, { readonly: true });
  try {
    await legacyDatabase.backup(databasePath);
  } finally {
    legacyDatabase.close();
  }

  for (const directoryName of ["uploads", "plugins"]) {
    const legacyDirectory = path.join(legacyDataDirectory, directoryName);
    const destinationDirectory = path.join(dataDirectory, directoryName);
    if (existsSync(legacyDirectory) && !existsSync(destinationDirectory)) {
      cpSync(legacyDirectory, destinationDirectory, { recursive: true });
    }
  }
}

mkdirSync(uploadsDirectory, { recursive: true });
mkdirSync(installedPluginsDirectory, { recursive: true });
mkdirSync(developmentLinksDirectory, { recursive: true });

const sqlMetricsFile = process.env.CONTENTFLOW_SQL_METRICS_FILE;
let sqlStatementCount = 0;
const database = new Database(
  databasePath,
  sqlMetricsFile
    ? {
        verbose: () => {
          sqlStatementCount += 1;
          writeFileSync(sqlMetricsFile, String(sqlStatementCount));
        },
      }
    : undefined,
);
database.pragma("busy_timeout = 5000");
database.pragma("journal_mode = WAL");
const existingDatabaseTables = new Set(
  (
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name),
);
if (existingDatabaseTables.has("channels") && !existingDatabaseTables.has("plugin_profiles")) {
  const migrationBackupsDirectory = path.join(dataDirectory, "migration-backups");
  const profileMigrationBackup = path.join(
    migrationBackupsDirectory,
    "contentflow-before-profile-management.sqlite",
  );
  if (!existsSync(profileMigrationBackup)) {
    mkdirSync(migrationBackupsDirectory, { recursive: true });
    await database.backup(profileMigrationBackup);
  }
}
database.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channel_order (
    channel_id TEXT PRIMARY KEY,
    position INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_channel_id ON projects(channel_id);
  CREATE TABLE IF NOT EXISTS process_executions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, process_type)
  );
  CREATE INDEX IF NOT EXISTS executions_project_id ON process_executions(project_id);
  CREATE TABLE IF NOT EXISTS execution_orchestrators (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orchestrators_channel_id ON execution_orchestrators(channel_id);
  CREATE TABLE IF NOT EXISTS library_items (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS library_channel_id ON library_items(channel_id);
  CREATE TABLE IF NOT EXISTS library_collections (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS library_collections_channel_id ON library_collections(channel_id);
  CREATE TABLE IF NOT EXISTS app_preferences (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    language TEXT NOT NULL,
    notification_sound INTEGER NOT NULL DEFAULT 0,
    system_notifications INTEGER NOT NULL DEFAULT 0,
    methods_library_view TEXT NOT NULL DEFAULT 'channels',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channel_preferences (
    channel_id TEXT PRIMARY KEY,
    project_view TEXT NOT NULL DEFAULT 'cards',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plugin_consents (
    plugin_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    permissions TEXT NOT NULL,
    network_hosts TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plugin_workspaces (
    plugin_id TEXT PRIMARY KEY,
    directory TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plugin_connections (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    name TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS plugin_connections_plugin_id
    ON plugin_connections(plugin_id);
  CREATE UNIQUE INDEX IF NOT EXISTS plugin_connections_active_name
    ON plugin_connections(plugin_id, name COLLATE NOCASE)
    WHERE revoked_at IS NULL;
  CREATE TABLE IF NOT EXISTS plugin_profiles (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS plugin_profiles_plugin_id
    ON plugin_profiles(plugin_id);
  CREATE UNIQUE INDEX IF NOT EXISTS plugin_profiles_alias
    ON plugin_profiles(plugin_id, alias COLLATE NOCASE);
`);

const appPreferenceColumns = database.prepare("PRAGMA table_info(app_preferences)").all() as Array<{
  name: string;
}>;
if (!appPreferenceColumns.some((column) => column.name === "notification_sound")) {
  database.exec(
    "ALTER TABLE app_preferences ADD COLUMN notification_sound INTEGER NOT NULL DEFAULT 0",
  );
}
if (!appPreferenceColumns.some((column) => column.name === "system_notifications")) {
  database.exec(
    "ALTER TABLE app_preferences ADD COLUMN system_notifications INTEGER NOT NULL DEFAULT 0",
  );
}
if (!appPreferenceColumns.some((column) => column.name === "methods_library_view")) {
  database.exec(
    "ALTER TABLE app_preferences ADD COLUMN methods_library_view TEXT NOT NULL DEFAULT 'channels'",
  );
}

const pluginConsentColumns = database.prepare("PRAGMA table_info(plugin_consents)").all() as Array<{
  name: string;
}>;
if (!pluginConsentColumns.some((column) => column.name === "network_hosts")) {
  database.exec("ALTER TABLE plugin_consents ADD COLUMN network_hosts TEXT NOT NULL DEFAULT '[]'");
}
const pluginJobs = new PluginJobStore(database);
const pluginConnections = new PluginConnectionStore(database);
const pluginProfiles = new PluginProfileStore(database);
pluginJobs.recoverInterrupted();
// A database-wide sequence orders snapshots from commands and background workers.
database.exec(
  "CREATE TABLE IF NOT EXISTS state_clock (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL); INSERT OR IGNORE INTO state_clock VALUES (1, 0)",
);
for (const table of [
  "channels",
  "projects",
  "process_executions",
  "execution_orchestrators",
  "library_items",
  "library_collections",
  "channel_order",
]) {
  for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    database.exec(`CREATE TRIGGER IF NOT EXISTS clock_${table}_${operation} AFTER ${operation} ON ${table}
      BEGIN UPDATE state_clock SET revision = revision + 1 WHERE id = 1; END`);
  }
}
database.exec(
  "CREATE TABLE IF NOT EXISTS execution_commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
);

type AppPreferences = {
  theme: "light" | "dark";
  language: "pt-BR" | "en" | "es";
  notificationSound: boolean;
  systemNotifications: boolean;
  methodsLibraryView: "methods" | "channels";
};

const defaultPreferences: AppPreferences = {
  theme: "dark",
  language: "pt-BR",
  notificationSound: false,
  systemNotifications: false,
  methodsLibraryView: "channels",
};

function readPreferences(): AppPreferences {
  const row = database
    .prepare(
      `SELECT theme, language, notification_sound AS notificationSound,
              system_notifications AS systemNotifications,
              methods_library_view AS methodsLibraryView
       FROM app_preferences WHERE id = 'global'`,
    )
    .get() as
    | {
        theme: AppPreferences["theme"];
        language: AppPreferences["language"];
        notificationSound: number;
        systemNotifications: number;
        methodsLibraryView: AppPreferences["methodsLibraryView"];
      }
    | undefined;
  return row
    ? {
        theme: row.theme,
        language: row.language,
        notificationSound: Boolean(row.notificationSound),
        systemNotifications: Boolean(row.systemNotifications),
        methodsLibraryView: row.methodsLibraryView === "methods" ? "methods" : "channels",
      }
    : defaultPreferences;
}

type StoredPayload = {
  id: string;
  channelId?: string;
  projectId?: string;
  createdAt?: string;
  handle?: string;
  processType?: string;
  updatedAt?: string;
  collection?: string;
  collectionId?: string;
  name?: string;
  fields?: unknown[];
  values?: Record<string, unknown>;
};

function parseRows(rows: { payload: string }[]) {
  return rows.map((row) => JSON.parse(row.payload));
}

function readPayload<T>(table: string, id: string): T | undefined {
  const allowedTables = new Set(["channels", "projects", "process_executions"]);
  if (!allowedTables.has(table)) throw new Error("Tabela de leitura não permitida.");
  const row = database.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id) as
    { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as T) : undefined;
}

function reconcileStoredProjectTitles() {
  const projects = parseRows(
    database.prepare("SELECT payload FROM projects").all() as { payload: string }[],
  ) as Project[];
  const executions = parseRows(
    database.prepare("SELECT payload FROM process_executions").all() as { payload: string }[],
  ) as ProcessExecution[];
  const changedProjects = reconcileGeneratedProjectTitles(projects, executions);
  if (!changedProjects.length) return;

  const updateProject = database.prepare("UPDATE projects SET payload = ? WHERE id = ?");
  database.transaction(() => {
    for (const project of changedProjects) updateProject.run(JSON.stringify(project), project.id);
  })();
}

reconcileStoredProjectTitles();

function capabilityWithDeterministicItemMapping(
  capability: PluginCapability,
  request: PluginExecutionRequest,
  values: Record<string, RuntimeValue>,
) {
  if (capability.execution.itemOrchestration) return capability;
  const inputCandidates = Object.entries(request.inputs).filter(
    ([, value]) => Array.isArray(value) && value.length >= 2,
  );
  if (inputCandidates.length !== 1) return capability;
  const [inputPort, inputItems] = inputCandidates[0];
  if (!Array.isArray(inputItems)) return capability;
  const outputCandidates = request.outputContract.filter((field) => {
    const output = values[field.key];
    return Array.isArray(output) && output.length > 0 && output.length <= inputItems.length;
  });
  if (outputCandidates.length !== 1) return capability;
  return {
    ...capability,
    execution: {
      ...capability.execution,
      itemOrchestration: {
        mode: "sequential" as const,
        inputPort,
        outputPort: outputCandidates[0].portKey,
      },
    },
  } satisfies PluginCapability;
}

function reconcileStoredExecutionItems() {
  const executionRows = database
    .prepare("SELECT id, payload FROM process_executions")
    .all() as Array<{ id: string; payload: string }>;
  const jobsForBlock = database.prepare(
    "SELECT payload FROM plugin_jobs WHERE execution_id = ? AND block_id = ? ORDER BY attempt DESC, updated_at DESC",
  );
  const updateExecution = database.prepare(
    "UPDATE process_executions SET payload = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of executionRows) {
      const execution = JSON.parse(row.payload) as ProcessExecution;
      let changed = false;
      for (const blockExecution of execution.blocks) {
        if (blockExecution.items?.length) continue;
        const jobRows = jobsForBlock.all(execution.id, blockExecution.blockId) as Array<{
          payload: string;
        }>;
        for (const jobRow of jobRows) {
          const job = JSON.parse(jobRow.payload) as PersistentPluginJob;
          const plugin = getRegisteredPlugin(job.pluginId);
          const capability = plugin?.manifest.capabilities.find(
            (candidate) => candidate.id === job.capabilityId,
          );
          if (!capability) continue;
          const effectiveCapability = capabilityWithDeterministicItemMapping(
            capability,
            job.request,
            blockExecution.values,
          );
          const policy = effectiveCapability.execution.itemOrchestration;
          if (!policy) continue;
          const inputItems = job.request.inputs[policy.inputPort];
          if (!Array.isArray(inputItems) || inputItems.length < 2) continue;
          const outputKey =
            job.request.outputContract.find((field) => field.portKey === policy.outputPort)?.key ??
            policy.outputPort;
          const outputs = blockExecution.values[outputKey];
          if (!Array.isArray(outputs) || outputs.length > inputItems.length) continue;
          const migrated = legacyItemOrchestration(
            effectiveCapability,
            job.request,
            structuredClone(outputs) as RuntimeValue[],
            blockExecution.completedAt,
          );
          if (!migrated?.workItems?.length) continue;
          blockExecution.items = structuredClone(migrated.workItems);
          blockExecution.itemProgress = {
            total: inputItems.length,
            completed: outputs.length,
            pending: inputItems.length - outputs.length,
            currentIndex: outputs.length < inputItems.length ? outputs.length : undefined,
          };
          changed = true;
          break;
        }
      }
      if (changed) updateExecution.run(JSON.stringify(execution), execution.id);
    }
  })();
}

type PluginConsent = {
  version: string;
  permissions: string[];
  networkHosts: string[];
  enabled: boolean;
};

function readPluginConsent(pluginId: string): PluginConsent | undefined {
  const row = database
    .prepare(
      "SELECT version, permissions, network_hosts, enabled FROM plugin_consents WHERE plugin_id = ?",
    )
    .get(pluginId) as
    { version: string; permissions: string; network_hosts: string; enabled: number } | undefined;
  if (!row) return undefined;
  return {
    version: row.version,
    permissions: JSON.parse(row.permissions) as string[],
    networkHosts: JSON.parse(row.network_hosts) as string[],
    enabled: row.enabled === 1,
  };
}

function pluginConsentIsCurrent(plugin: {
  id: string;
  source: string;
  manifest: { version: string; permissions: string[]; networkHosts?: string[] };
}) {
  if (!communitySandboxAvailable) return false;
  const consent = readPluginConsent(plugin.id);
  return (
    consent?.enabled === true &&
    consent.version === plugin.manifest.version &&
    JSON.stringify(consent.permissions) === JSON.stringify(plugin.manifest.permissions) &&
    JSON.stringify(consent.networkHosts) === JSON.stringify(plugin.manifest.networkHosts ?? [])
  );
}

function readPluginWorkspace(pluginId: string) {
  const row = database
    .prepare("SELECT directory FROM plugin_workspaces WHERE plugin_id = ?")
    .get(pluginId) as { directory: string } | undefined;
  return row?.directory;
}

function executionWorkspaceForPlugin(plugin: { id: string; manifest: { profileSetup?: unknown } }) {
  const configuredWorkspace = readPluginWorkspace(plugin.id);
  if (configuredWorkspace) return configuredWorkspace;
  if (!plugin.manifest.profileSetup) return undefined;
  const safePluginId = plugin.id.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(dataDirectory, "plugin-workspaces", "profiles", safePluginId);
}

function executionFor(projectId: string, processType: string) {
  const row = database
    .prepare("SELECT payload FROM process_executions WHERE project_id = ? AND process_type = ?")
    .get(projectId, processType) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as ProcessExecution) : undefined;
}

function normalizePluginListValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => {
        const cleaned = line
          .trim()
          .replace(/^[-*•\s]+/, "")
          .replace(/^\d+[.)]\s*/, "")
          .trim();
        return cleaned || line.trim();
      })
      .filter(Boolean);
  }
  return [];
}

function valuesForPluginResponse(
  block: ActionBlock,
  responseValues: Record<string, RuntimeValue>,
  outputContract: PluginFieldContract[],
) {
  const values: Record<string, RuntimeValue> = {};
  for (const field of block.outputs ?? []) {
    const contract = outputContract.find((item) => item.key === field.key);
    let value =
      responseValues[field.key] ??
      (contract ? responseValues[contract.portKey] : undefined) ??
      responseValues.result;
    if (value !== undefined) {
      if (field.type === "list" && (typeof value === "string" || Array.isArray(value))) {
        value = normalizePluginListValue(value);
      }
      values[field.key] = value;
    }
  }
  return values;
}

function updateProjectAfterPluginBlock(project: Project, execution: ProcessExecution) {
  project.currentStage = execution.processType;
  project.state =
    execution.status === "cancelled"
      ? "not_started"
      : execution.status === "awaiting_human"
        ? "awaiting_human"
        : execution.status === "failed"
          ? "error"
          : execution.status === "completed"
            ? "done"
            : execution.status === "blocked_executor"
              ? "blocked"
              : "processing";
  project.stages = { ...project.stages, [execution.processType]: project.state };
  if (execution.status === "completed") {
    project.progress = completedProcessProgress(project.stages);
    const next = nextExecutableProcess(
      projectProcessOrder(project),
      project.stages,
      project.runFrom,
      project.runThrough,
    );
    project.currentStage = next ?? execution.processType;
    project.state = next ? project.stages[next] : "done";
  }
  project.updatedAt = "Agora";
}

function finishPluginBlock(
  execution: ProcessExecution,
  block: ActionBlock,
  blockExecution: BlockExecution,
  values: Record<string, RuntimeValue>,
) {
  const now = new Date().toISOString();
  if (block.operator === "Humano") {
    blockExecution.status = "awaiting_human";
    blockExecution.error = undefined;
    blockExecution.progress = undefined;
    blockExecution.progressMessage = undefined;
    execution.status = "awaiting_human";
    execution.updatedAt = now;
    return;
  }
  blockExecution.values = values;
  blockExecution.status = "completed";
  blockExecution.completedAt = now;
  blockExecution.error = undefined;
  recordBlockDeliveries(execution, block, values, "completed", now);
  const completedIndex = execution.blocks.indexOf(blockExecution);
  const rejected =
    block.type === "VALIDAR" &&
    (block.outputs ?? []).some(
      (output) => output.type === "approval" && values[output.key] === "rejected",
    );
  if (rejected && block.validation?.onReject === "retry_target") {
    const targetIndex = execution.methodSnapshot.blocks.findIndex(
      (candidate) => candidate.id === block.validation?.targetBlockId,
    );
    const maxAttempts = Math.max(1, block.validation.maxAttempts ?? 3);
    const targetExecution = execution.blocks[targetIndex];
    const targetBlock = execution.methodSnapshot.blocks[targetIndex];
    if (targetIndex >= 0 && targetIndex < completedIndex && targetExecution && targetBlock) {
      if ((targetExecution.attempt ?? 1) >= maxAttempts) {
        execution.status = "awaiting_human";
        blockExecution.status = "awaiting_human";
        blockExecution.error = `O limite de ${maxAttempts} tentativas foi atingido.`;
      } else {
        const retryMode = block.validation.retryMode ?? "full";
        const retryConversationContext = pluginConversationFallbackContext(
          targetBlock,
          targetExecution.values,
        );
        const retryConversationAttachments = pluginConversationFallbackAttachments(
          targetExecution.values,
        );
        for (let index = targetIndex; index < execution.blocks.length; index += 1) {
          const item = execution.blocks[index];
          const preserveConversation =
            index === targetIndex && retryMode === "conversation_feedback";
          item.attempt = attemptAfterRetryInvalidation(item);
          item.values = {};
          item.error = undefined;
          item.logs = undefined;
          item.completedAt = undefined;
          item.jobId = undefined;
          item.progress = undefined;
          item.progressMessage = undefined;
          item.retryFeedback = undefined;
          item.retryMode = undefined;
          item.retryConversationContext = undefined;
          item.retryConversationAttachments = undefined;
          if (!preserveConversation) item.pluginConversation = undefined;
          item.status = "pending";
        }
        targetExecution.retryFeedback = structuredClone(values);
        targetExecution.retryMode = retryMode;
        targetExecution.retryConversationContext = retryConversationContext;
        targetExecution.retryConversationAttachments = retryConversationAttachments;
        targetExecution.startedAt = now;
        targetExecution.status =
          targetBlock.operator === "Humano" && !targetBlock.plugin
            ? "awaiting_human"
            : "blocked_executor";
        invalidateBlockDeliveries(
          execution,
          execution.methodSnapshot.blocks.slice(targetIndex).map((candidate) => candidate.id),
        );
        execution.status =
          targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
      }
      execution.updatedAt = now;
      return;
    }
  }
  const nextExecution = execution.blocks[completedIndex + 1];
  const nextBlock = execution.methodSnapshot.blocks[completedIndex + 1];

  if (nextExecution && nextBlock) {
    nextExecution.status =
      nextBlock.operator === "Humano" && !nextBlock.plugin ? "awaiting_human" : "blocked_executor";
    nextExecution.startedAt = now;
    execution.status =
      nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
  } else {
    const output = deriveProcessOutput(execution);
    if (output) {
      execution.output = output;
      recordProcessOutputDelivery(execution, execution.output.values, now);
      execution.outputStatus = "completed";
      execution.status = "completed";
    } else {
      execution.outputStatus = "awaiting_human";
      execution.status = "awaiting_output";
    }
  }
  execution.updatedAt = now;
}

function executionById(executionId: string) {
  const row = database
    .prepare("SELECT payload FROM process_executions WHERE id = ?")
    .get(executionId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as ProcessExecution) : undefined;
}

function persistPluginExecution(execution: ProcessExecution, project: Project) {
  const latestProject = readPayload<Project>("projects", project.id);
  if (latestProject) Object.assign(project, latestProject);
  execution.revision = (executionById(execution.id)?.revision ?? 0) + 1;
  execution.updatedAt = new Date().toISOString();
  updateProjectAfterPluginBlock(project, execution);
  applyGeneratedProjectTitle(project, execution);
  const persist = () => {
    database
      .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(execution), execution.updatedAt, execution.id);
    database
      .prepare("UPDATE projects SET payload = ? WHERE id = ?")
      .run(JSON.stringify(project), project.id);
  };
  if (database.inTransaction) persist();
  else database.transaction(persist)();
  queueOrchestratorReconciliationForProject(execution.projectId);
}

function failAutomaticPluginStart(executionId: string, blockId: string, message: string) {
  const execution = executionById(executionId);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  if (!execution || !project || !blockExecution || blockExecution.status !== "blocked_executor") {
    return;
  }
  blockExecution.status = "failed";
  blockExecution.error = message;
  blockExecution.logs = [...(blockExecution.logs ?? []), message];
  execution.status = "failed";
  execution.error = message;
  persistPluginExecution(execution, project);
}

function automaticPluginBlockReady(block?: ActionBlock) {
  if (!block?.plugin) return false;
  const plugin = getRegisteredPlugin(block.plugin.pluginId);
  return Boolean(plugin?.executable && pluginConsentIsCurrent(plugin));
}

function scheduleAutomaticPluginBlock(execution: ProcessExecution) {
  if (execution.status !== "blocked_executor") return;
  const blockExecution = execution.blocks.find((item) => item.status !== "completed");
  const block = blockExecution
    ? execution.methodSnapshot.blocks.find((item) => item.id === blockExecution.blockId)
    : undefined;
  if (!blockExecution || blockExecution.status !== "blocked_executor" || !block || !block.plugin) {
    return;
  }
  if (!automaticPluginBlockReady(block)) return;

  const executionId = execution.id;
  const blockId = block.id;
  const requestBody = {
    projectId: execution.projectId,
    processType: execution.processType,
    blockId,
    pluginId: block.plugin.pluginId,
    parameters: {},
  };
  setTimeout(() => {
    void fetch(`http://127.0.0.1:${port}/api/execute-block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
      .then(async (response) => {
        if (response.ok) return;
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        failAutomaticPluginStart(
          executionId,
          blockId,
          body.error ?? "Não foi possível iniciar automaticamente o plugin.",
        );
      })
      .catch((error) => {
        failAutomaticPluginStart(
          executionId,
          blockId,
          error instanceof Error ? error.message : "Não foi possível acessar o executor local.",
        );
      });
  }, 0);
}

const orchestratorReconciliationLocks = new Set<string>();

function parseOrchestratorRow(row?: { payload: string }) {
  return row ? (JSON.parse(row.payload) as ExecutionOrchestrator) : undefined;
}

function executionOrchestratorById(id: string) {
  return parseOrchestratorRow(
    database.prepare("SELECT payload FROM execution_orchestrators WHERE id = ?").get(id) as
      { payload: string } | undefined,
  );
}

function executionOrchestrators(channelId?: string) {
  const rows = channelId
    ? (database
        .prepare(
          "SELECT payload FROM execution_orchestrators WHERE channel_id = ? ORDER BY created_at DESC",
        )
        .all(channelId) as { payload: string }[])
    : (database
        .prepare("SELECT payload FROM execution_orchestrators ORDER BY created_at DESC")
        .all() as { payload: string }[]);
  return rows.map((row) => JSON.parse(row.payload) as ExecutionOrchestrator);
}

function persistExecutionOrchestrator(orchestrator: ExecutionOrchestrator, create = false) {
  orchestrator.updatedAt = new Date().toISOString();
  if (create) {
    database
      .prepare(
        `INSERT INTO execution_orchestrators
          (id, channel_id, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        orchestrator.id,
        orchestrator.channelId,
        JSON.stringify(orchestrator),
        orchestrator.createdAt,
        orchestrator.updatedAt,
      );
    return;
  }
  database
    .prepare("UPDATE execution_orchestrators SET payload = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(orchestrator), orchestrator.updatedAt, orchestrator.id);
}

function setExecutionOrchestratorState(
  orchestrator: ExecutionOrchestrator,
  patch: Partial<ExecutionOrchestrator>,
) {
  const changed = Object.entries(patch).some(
    ([key, value]) => orchestrator[key as keyof ExecutionOrchestrator] !== value,
  );
  if (!changed) return false;
  Object.assign(orchestrator, patch);
  persistExecutionOrchestrator(orchestrator);
  return true;
}

function createOrchestratedProject(channelId: string, title: string, index: number): Project {
  const stages = Object.fromEntries(
    PROCESS_ORDER.map((processType) => [processType, "not_started"]),
  ) as Project["stages"];
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title,
    channelId,
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    createdAt: now,
    stages,
    assignee: { name: "Não atribuído", initials: "—" },
    thumbHue: (index * 47 + 211) % 360,
  };
}

function prepareExecutionOrchestration(input: {
  channel: Channel;
  mode: ExecutionOrchestratorMode;
  quantity: number;
  projectPrefix: string;
  globalBatchId?: string;
  globalChannelCount?: number;
  includeChannelName?: boolean;
}) {
  const { channel, mode, quantity } = input;
  const now = new Date().toISOString();
  const projects = Array.from({ length: quantity }, (_, index) => {
    const prefix = input.includeChannelName
      ? `${input.projectPrefix} · ${channel.name}`
      : input.projectPrefix;
    return createOrchestratedProject(channel.id, `${prefix} ${index + 1}`, index);
  });
  const strategyVersion = mode === "end_to_end" ? 3 : 4;
  const order = effectiveProcessOrder(channel);
  for (const project of projects) {
    captureProjectStrategy(project, channel, false);
    project.currentStage = order[0];
  }
  const steps = buildOrchestratorSteps(
    projects.map((project) => project.id),
    mode,
    strategyVersion,
    order,
  );
  const orchestrator: ExecutionOrchestrator = {
    id: randomUUID(),
    channelId: channel.id,
    globalBatchId: input.globalBatchId,
    globalChannelCount: input.globalChannelCount,
    mode,
    strategyVersion,
    processOrder: order,
    plannedSteps: strategyVersion === 4 ? steps : undefined,
    quantity,
    projectPrefix: input.projectPrefix,
    projectIds: projects.map((project) => project.id),
    currentStep: 0,
    totalSteps: steps.length,
    status: "running",
    message: "Preparando a primeira execução.",
    createdAt: now,
    updatedAt: now,
  };
  channel.activeProjects += quantity;
  return { channel, projects, orchestrator };
}

function startOrchestratedProcess(
  project: Project,
  channel: Channel,
  processType: UniversalProcess,
) {
  const existing = executionFor(project.id, processType);
  if (existing) return { execution: existing };
  captureProjectStrategy(
    project,
    channel,
    Boolean(
      database
        .prepare("SELECT 1 FROM process_executions WHERE project_id = ? LIMIT 1")
        .get(project.id),
    ),
  );
  const savedMethod =
    project.strategySnapshot?.methods[processType] ?? channel.methods?.[processType];
  const method = savedMethod
    ? {
        name: savedMethod.name || `Método de ${PROCESS_META[processType].label}`,
        imageUrl: savedMethod.imageUrl,
        processType,
        blocks: normalizeMethodBlocks(savedMethod.blocks ?? [], processType),
      }
    : undefined;
  const issue = getMethodConfigurationIssue(method);
  if (!method || issue) return { issue: issue ?? "O método deste processo não está disponível." };

  const now = new Date().toISOString();
  const methodSnapshot = structuredClone(method);
  const execution: ProcessExecution = {
    id: randomUUID(),
    projectId: project.id,
    channelId: channel.id,
    processType,
    methodSnapshot,
    blocks: methodSnapshot.blocks.map((block, index) => ({
      blockId: block.id,
      status:
        index === 0
          ? block.operator === "Humano" && !block.plugin
            ? "awaiting_human"
            : "blocked_executor"
          : "pending",
      values: {},
      attempt: 1,
      startedAt: index === 0 ? now : undefined,
    })),
    status:
      methodSnapshot.blocks[0].operator === "Humano" && !methodSnapshot.blocks[0].plugin
        ? "awaiting_human"
        : "blocked_executor",
    outputStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  project.stages = {
    ...project.stages,
    [processType]: execution.status === "awaiting_human" ? "awaiting_human" : "processing",
  };
  project.currentStage = processType;
  project.state = project.stages[processType];
  project.updatedAt = "Agora";

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO process_executions (id, project_id, process_type, payload, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(execution.id, execution.projectId, processType, JSON.stringify(execution), now);
    database
      .prepare("UPDATE projects SET payload = ? WHERE id = ?")
      .run(JSON.stringify(project), project.id);
  })();
  scheduleAutomaticPluginBlock(execution);
  return { execution };
}

function orchestrationMessage(
  status: ExecutionOrchestratorStatus,
  project: Project,
  processType: UniversalProcess,
) {
  const processLabel = PROCESS_META[processType].label;
  if (status === "awaiting_human") {
    return `${project.title} aguarda uma ação humana em ${processLabel}.`;
  }
  if (status === "blocked") {
    return `${project.title} está bloqueado em ${processLabel}: configure o executor necessário.`;
  }
  if (status === "failed") return `${project.title} encontrou um erro em ${processLabel}.`;
  return `Executando ${processLabel} em ${project.title}.`;
}

function reconcileExecutionOrchestrator(id: string) {
  if (orchestratorReconciliationLocks.has(id)) return;
  orchestratorReconciliationLocks.add(id);
  try {
    const orchestrator = executionOrchestratorById(id);
    if (!orchestrator || !ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status)) return;
    const channel = readPayload<Channel>("channels", orchestrator.channelId);
    if (!channel) {
      setExecutionOrchestratorState(orchestrator, {
        status: "failed",
        message: "O canal desta orquestração não existe mais.",
      });
      return;
    }

    const steps =
      orchestrator.plannedSteps ??
      buildOrchestratorSteps(
        orchestrator.projectIds,
        orchestrator.mode,
        orchestrator.strategyVersion ?? 1,
        orchestrator.processOrder,
      );
    while (orchestrator.currentStep < steps.length) {
      const step = steps[orchestrator.currentStep];
      if (isAggregateOrchestratorStep(step)) {
        let aggregateCompleted = true;
        for (let index = 0; index < step.projectIds.length; index += 1) {
          const projectId = step.projectIds[index];
          const project = readPayload<Project>("projects", projectId);
          if (!project) {
            setExecutionOrchestratorState(orchestrator, {
              status: "failed",
              message: "Um projeto da orquestração não existe mais.",
              currentProjectId: projectId,
              currentProcessType: step.processType,
              currentBatchItem: index,
              currentBatchTotal: step.projectIds.length,
            });
            return;
          }
          const started = startOrchestratedProcess(project, channel, step.processType);
          if (!started.execution) {
            setExecutionOrchestratorState(orchestrator, {
              status: "blocked",
              currentProjectId: projectId,
              currentProcessType: step.processType,
              currentBatchItem: index,
              currentBatchTotal: step.projectIds.length,
              message: started.issue,
            });
            return;
          }
          const execution = started.execution;
          if (execution.status === "completed") continue;
          aggregateCompleted = false;
          if (execution.status === "cancelled") {
            setExecutionOrchestratorState(orchestrator, {
              status: "cancelled",
              currentProjectId: projectId,
              currentProcessType: step.processType,
              currentBatchItem: index,
              currentBatchTotal: step.projectIds.length,
              message: "A execução atual foi cancelada.",
            });
            return;
          }
          const activeBlockExecution = execution.blocks.find((item) => item.status !== "completed");
          const activeBlock = activeBlockExecution
            ? execution.methodSnapshot.blocks.find(
                (item) => item.id === activeBlockExecution.blockId,
              )
            : undefined;
          const status: ExecutionOrchestratorStatus =
            execution.status === "awaiting_human" || execution.status === "awaiting_output"
              ? "awaiting_human"
              : execution.status === "failed"
                ? "failed"
                : execution.status === "blocked_executor" && !automaticPluginBlockReady(activeBlock)
                  ? "blocked"
                  : "running";
          setExecutionOrchestratorState(orchestrator, {
            status,
            currentProjectId: projectId,
            currentProcessType: step.processType,
            currentBatchItem: index,
            currentBatchTotal: step.projectIds.length,
            message: execution.error ?? orchestrationMessage(status, project, step.processType),
          });
          return;
        }
        if (aggregateCompleted) {
          orchestrator.currentStep += 1;
          continue;
        }
      }
      if (isAggregateOrchestratorStep(step)) return;
      const project = readPayload<Project>("projects", step.projectId);
      if (!project) {
        setExecutionOrchestratorState(orchestrator, {
          status: "failed",
          message: "Um projeto da orquestração não existe mais.",
          currentProjectId: step.projectId,
          currentProcessType: step.processType,
        });
        return;
      }

      const started = startOrchestratedProcess(project, channel, step.processType);
      if (!started.execution) {
        setExecutionOrchestratorState(orchestrator, {
          status: "blocked",
          currentProjectId: step.projectId,
          currentProcessType: step.processType,
          message: started.issue,
        });
        return;
      }
      const execution = started.execution;
      if (execution.status === "completed") {
        orchestrator.currentStep += 1;
        continue;
      }
      if (execution.status === "cancelled") {
        setExecutionOrchestratorState(orchestrator, {
          status: "cancelled",
          currentProjectId: step.projectId,
          currentProcessType: step.processType,
          message: "A execução atual foi cancelada.",
        });
        return;
      }

      const activeBlockExecution = execution.blocks.find((item) => item.status !== "completed");
      const activeBlock = activeBlockExecution
        ? execution.methodSnapshot.blocks.find((item) => item.id === activeBlockExecution.blockId)
        : undefined;
      const status: ExecutionOrchestratorStatus =
        execution.status === "awaiting_human" || execution.status === "awaiting_output"
          ? "awaiting_human"
          : execution.status === "failed"
            ? "failed"
            : execution.status === "blocked_executor" && !automaticPluginBlockReady(activeBlock)
              ? "blocked"
              : "running";
      setExecutionOrchestratorState(orchestrator, {
        status,
        currentProjectId: step.projectId,
        currentProcessType: step.processType,
        currentBatchItem: undefined,
        currentBatchTotal: undefined,
        message: execution.error ?? orchestrationMessage(status, project, step.processType),
      });
      return;
    }

    setExecutionOrchestratorState(orchestrator, {
      currentStep: steps.length,
      totalSteps: steps.length,
      status: "completed",
      currentProjectId: undefined,
      currentProcessType: undefined,
      currentBatchItem: undefined,
      currentBatchTotal: undefined,
      message: "Todos os projetos da orquestração foram concluídos.",
      completedAt: new Date().toISOString(),
    });
  } finally {
    orchestratorReconciliationLocks.delete(id);
  }
}

function queueOrchestratorReconciliation(id: string) {
  setTimeout(() => reconcileExecutionOrchestrator(id), 0);
}

function queueOrchestratorReconciliationForProject(projectId: string) {
  for (const orchestrator of executionOrchestrators()) {
    if (
      ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status) &&
      orchestrator.projectIds.includes(projectId)
    ) {
      queueOrchestratorReconciliation(orchestrator.id);
    }
  }
}

function cancelStoredProcessExecution(execution: ProcessExecution, project: Project) {
  delete project.runThrough;
  delete project.runFrom;
  execution.revision = (execution.revision ?? 0) + 1;
  pluginJobs.requestCancellation(execution.id);
  execution.status = "cancelled";
  execution.blocks = execution.blocks.map((item) =>
    item.status === "completed" ? item : { ...item, status: "cancelled" },
  );
  execution.updatedAt = new Date().toISOString();
  project.stages = { ...project.stages, [execution.processType]: "not_started" };
  project.currentStage = execution.processType;
  project.state = "not_started";
  project.updatedAt = "Agora";
  database.transaction(() => {
    database
      .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(execution), execution.updatedAt, execution.id);
    database
      .prepare("UPDATE projects SET payload = ? WHERE id = ?")
      .run(JSON.stringify(project), project.id);
  })();
  void processDuePluginJobs();
}

function resumeExecutionOrchestrators() {
  for (const orchestrator of executionOrchestrators()) {
    if (ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status)) {
      reconcileExecutionOrchestrator(orchestrator.id);
    }
  }
}

function mergeStoredArtifacts(current: StoredFile[], incoming: StoredFile[] = []) {
  const merged = new Map(current.map((file) => [file.id, file]));
  for (const file of incoming) merged.set(file.id, file);
  return [...merged.values()];
}

function publicPluginJob(job: PersistentPluginJob) {
  const { request: _request, partialArtifacts: _partialArtifacts, ...publicState } = job;
  return publicState;
}

function mappedPluginValues(
  block: ActionBlock,
  responseValues: Record<string, RuntimeValue>,
  outputContract: PluginFieldContract[],
) {
  return block.type === "ESCOLHER"
    ? { selectedItemId: responseValues.selectedItemId ?? responseValues.result }
    : valuesForPluginResponse(block, responseValues, outputContract);
}

function markPluginJobFailed(
  claim: ClaimedPluginJob,
  execution: ProcessExecution | undefined,
  project: Project | undefined,
  message: string,
  status: "failed" | "abandoned" = "failed",
) {
  const failedJob = failCurrentOrchestratedItem(claim.job, message);
  claim.job = failedJob;
  return pluginJobs.save(
    claim,
    {
      ...failedJob,
      status,
      error: message,
      message,
      nextPollAt: new Date(8_640_000_000_000_000).toISOString(),
    },
    (saved) => {
      if (saved.status === "cancel_requested" || !execution || !project) return;
      const blockExecution = execution.blocks.find((item) => item.blockId === saved.blockId);
      const block = execution.methodSnapshot.blocks.find((item) => item.id === saved.blockId);
      if (blockExecution && blockExecution.status !== "cancelled") {
        if (Object.keys(saved.partialValues).length > 0) {
          blockExecution.values = structuredClone(saved.partialValues);
          if (block) recordBlockDeliveries(execution, block, saved.partialValues, "partial");
        }
        blockExecution.itemProgress = itemProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved);
        blockExecution.status = "failed";
        blockExecution.error = message;
        blockExecution.progressMessage = message;
        execution.status = "failed";
        execution.error = message;
        persistPluginExecution(execution, project);
      }
    },
  );
}

function markPluginJobCancelled(
  claim: ClaimedPluginJob,
  execution: ProcessExecution | undefined,
  project: Project | undefined,
  message = "Execução cancelada.",
) {
  return pluginJobs.save(
    claim,
    {
      ...claim.job,
      status: "cancelled",
      cancelRequested: true,
      message,
      nextPollAt: new Date(8_640_000_000_000_000).toISOString(),
    },
    () => {
      if (!execution || !project) return;
      execution.status = "cancelled";
      execution.blocks = execution.blocks.map((item) =>
        item.status === "completed" ? item : { ...item, status: "cancelled" },
      );
      project.stages = { ...project.stages, [execution.processType]: "not_started" };
      project.currentStage = execution.processType;
      project.state = "not_started";
      persistPluginExecution(execution, project);
    },
  );
}

async function resolvePluginConnection(plugin: RegisteredPlugin, requestedConnectionId?: string) {
  return resolvePluginConnectionSecrets(plugin, requestedConnectionId, {
    migrateLegacy: () => migrateLegacyPluginConnection(plugin),
    listConnections: () => pluginConnections.list(plugin.id),
    getConnection: (connectionId) => pluginConnections.get(plugin.id, connectionId),
    getSecret: (connectionId, secretKey) =>
      getPluginConnectionSecret(plugin.id, connectionId, secretKey),
  });
}

async function processPluginJob(
  jobId: string,
  transientSecrets: Record<string, string> = {},
  existingClaim?: ClaimedPluginJob,
) {
  const claim = existingClaim ?? pluginJobs.claim(jobId);
  if (!claim) return pluginJobs.get(jobId);
  let job = claim.job;
  let execution = executionById(job.executionId);
  let project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "A execução associada ao job não existe mais.",
      "abandoned",
    );
  }
  let block = execution.methodSnapshot.blocks.find((item) => item.id === job.blockId);
  let blockExecution = execution.blocks.find((item) => item.blockId === job.blockId);
  if (!block || !blockExecution || (blockExecution.attempt ?? 1) !== job.attempt) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "O bloco ou a tentativa associada ao job não existe mais.",
      "abandoned",
    );
  }
  if (job.attempt > 1 && job.retryScope === "remaining") {
    const previousAttempt = pluginJobs.getByExecution(
      job.executionId,
      job.blockId,
      job.attempt - 1,
    );
    if (previousAttempt) {
      const inheritedValues = {
        ...previousAttempt.partialValues,
        ...job.partialValues,
      };
      const inheritedArtifacts = mergeStoredArtifacts(
        previousAttempt.partialArtifacts,
        job.partialArtifacts,
      );
      const inheritedSomething =
        Object.keys(inheritedValues).length !== Object.keys(job.partialValues).length ||
        inheritedArtifacts.length !== job.partialArtifacts.length;
      if (inheritedSomething) {
        job = pluginJobs.updateClaimed(claim, {
          ...job,
          partialValues: inheritedValues,
          partialArtifacts: inheritedArtifacts,
        });
      }
    }
  }
  const plugin = getRegisteredPlugin(job.pluginId);
  if (!plugin) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "O plugin foi removido enquanto o job estava pendente.",
      "abandoned",
    );
  }
  if (plugin.manifest.version !== job.pluginVersion) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      `O plugin foi atualizado de ${job.pluginVersion} para ${plugin.manifest.version}; o job antigo não foi retomado.`,
      "abandoned",
    );
  }
  if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "O plugin foi desativado ou perdeu consentimento enquanto o job estava pendente.",
      "abandoned",
    );
  }
  const capability = plugin.manifest.capabilities.find((item) => item.id === job.capabilityId);
  if (!capability) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "A capacidade usada pelo job não existe mais.",
      "abandoned",
    );
  }

  const remainingMs = new Date(job.deadlineAt).getTime() - Date.now();
  let storedSecrets: Record<string, string> = {};
  let secrets: Record<string, string> = { ...transientSecrets };
  const workspaceDirectory = executionWorkspaceForPlugin(plugin);
  // Browser-driven capabilities legitimately need more than two minutes for
  // page loading, model generation and UI transitions. Honor the capability's
  // declared bound while never exceeding the persistent job deadline.
  const invocationTimeout = Math.max(
    1_000,
    Math.min(remainingMs, capability.execution.defaultTimeoutMs ?? 120_000),
  );

  try {
    const requestedConnectionId =
      typeof job.request.settings.connectionId === "string"
        ? job.request.settings.connectionId
        : undefined;
    const resolvedConnection = await resolvePluginConnection(plugin, requestedConnectionId);
    storedSecrets = resolvedConnection.secrets;
    secrets = { ...storedSecrets, ...transientSecrets };
    if ((plugin.manifest.secretKeys?.length ?? 0) > 0 && !Object.keys(secrets).length) {
      throw new Error("Crie ou associe uma conta local válida a este bloco antes de executar.");
    }
    if (isPluginJobTimedOut(job)) {
      if (job.jobId && capability.execution.supportsCancellation) {
        await executeRegisteredPlugin(
          plugin,
          { ...job.request, invocation: { mode: "cancel", jobId: job.jobId } },
          30_000,
          secrets,
          { workspaceDirectory, existingArtifacts: job.partialArtifacts },
        ).catch(() => undefined);
      }
      return markPluginJobFailed(
        claim,
        execution,
        project,
        "O job do plugin excedeu o tempo máximo declarado.",
      );
    }

    if (job.status === "cancel_requested") {
      if (job.jobId && capability.execution.supportsCancellation) {
        const cancelResponse = await executeRegisteredPlugin(
          plugin,
          { ...job.request, invocation: { mode: "cancel", jobId: job.jobId } },
          invocationTimeout,
          secrets,
          { workspaceDirectory, existingArtifacts: job.partialArtifacts },
        );
        if (cancelResponse.status === "pending") {
          return pluginJobs.save(claim, {
            ...job,
            status: "cancel_requested",
            cancelRequested: true,
            message: cancelResponse.message ?? "Cancelamento solicitado ao plugin…",
            nextPollAt: new Date(
              Date.now() + Math.max(500, Math.min(30_000, cancelResponse.pollAfterMs)),
            ).toISOString(),
          });
        }
        if (cancelResponse.status === "error" && cancelResponse.code !== "CANCELLED") {
          throw new Error(`O plugin não confirmou o cancelamento: ${cancelResponse.message}`);
        }
        return markPluginJobCancelled(
          claim,
          execution,
          project,
          "Cancelamento confirmado pelo plugin.",
        );
      }
      return markPluginJobCancelled(
        claim,
        execution,
        project,
        job.jobId
          ? "Execução cancelada localmente; a capacidade não oferece cancelamento remoto."
          : "Execução cancelada antes da criação do job remoto.",
      );
    }

    const invocation =
      job.status === "starting"
        ? ({ mode: "start" } as const)
        : ({ mode: "resume", jobId: job.jobId! } as const);
    const startedItemJob = startCurrentOrchestratedItem(job);
    if (startedItemJob !== job) {
      job = pluginJobs.updateClaimed(claim, startedItemJob);
      claim.job = job;
      blockExecution.items = blockExecutionItemsForJob(job);
      blockExecution.itemProgress = itemProgressForJob(job);
      persistPluginExecution(execution, project);
    }
    const pluginResponse = await executeRegisteredPlugin(
      plugin,
      invocationRequestForJob(job, invocation),
      invocationTimeout,
      secrets,
      {
        workspaceDirectory,
        existingArtifacts: job.partialArtifacts,
        onPartial: async (update) => {
          const latestExecution = executionById(job.executionId);
          const latestProject = latestExecution
            ? readPayload<Project>("projects", latestExecution.projectId)
            : undefined;
          const latestBlock = latestExecution?.methodSnapshot.blocks.find(
            (item) => item.id === job.blockId,
          );
          const latestBlockExecution = latestExecution?.blocks.find(
            (item) => item.blockId === job.blockId,
          );
          if (
            !latestExecution ||
            !latestProject ||
            !latestBlock ||
            !latestBlockExecution ||
            latestExecution.status === "cancelled" ||
            (latestBlockExecution.attempt ?? 1) !== job.attempt
          ) {
            return;
          }
          const mappedUpdate = mappedPluginValues(
            latestBlock,
            update.values,
            job.request.outputContract,
          );
          const partialValues: Record<string, RuntimeValue> = {
            ...job.partialValues,
            ...mappedUpdate,
          };
          if (job.itemOrchestration) {
            const orchestration = job.itemOrchestration;
            const rawCurrent = update.values[orchestration.outputPort];
            const currentItems = Array.isArray(rawCurrent)
              ? rawCurrent
              : rawCurrent === undefined
                ? []
                : [rawCurrent];
            const visibleItems = [...(orchestration.accumulatedItems ?? []), ...currentItems];
            const mappedListKey = job.request.outputContract.find(
              (field) => field.portKey === orchestration.outputPort,
            )?.key;
            const mappedCombinedKey = orchestration.combinedOutputPort
              ? job.request.outputContract.find(
                  (field) => field.portKey === orchestration.combinedOutputPort,
                )?.key
              : undefined;
            if (mappedListKey) partialValues[mappedListKey] = visibleItems as RuntimeValue;
            if (mappedCombinedKey) {
              partialValues[mappedCombinedKey] = visibleItems
                .filter((item): item is string => typeof item === "string")
                .join(orchestration.separator ?? "\n\n");
            }
          }
          job = pluginJobs.updateClaimed(claim, {
            ...job,
            partialValues,
            partialArtifacts: mergeStoredArtifacts(job.partialArtifacts, update.storedArtifacts),
            progress: Number.isFinite(update.progress)
              ? Math.max(job.progress ?? 0, Math.min(1, Math.max(0, update.progress!)))
              : job.progress,
            message: update.message ?? job.message,
          });
          claim.job = job;
          latestBlockExecution.status = "in_progress";
          latestBlockExecution.values = structuredClone(partialValues);
          latestBlockExecution.progress = job.progress;
          latestBlockExecution.progressMessage = job.message;
          latestBlockExecution.itemProgress = itemProgressForJob(job);
          latestBlockExecution.items = blockExecutionItemsForJob(job);
          latestBlockExecution.logs = update.logs ?? latestBlockExecution.logs;
          latestExecution.status = "running";
          latestExecution.error = undefined;
          recordBlockDeliveries(latestExecution, latestBlock, partialValues, "partial");
          persistPluginExecution(latestExecution, latestProject);
        },
      },
    );

    // No object captured before an external await is allowed to overwrite newer state.
    execution = executionById(job.executionId);
    project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
    block = execution?.methodSnapshot.blocks.find((item) => item.id === job.blockId);
    blockExecution = execution?.blocks.find((item) => item.blockId === job.blockId);
    if (
      !execution ||
      !project ||
      !block ||
      !blockExecution ||
      execution.status === "cancelled" ||
      (blockExecution.attempt ?? 1) !== job.attempt
    ) {
      return markPluginJobCancelled(
        claim,
        undefined,
        undefined,
        "Resultado de execução encerrada descartado.",
      );
    }

    if (pluginResponse.status === "pending") {
      if (capability.execution.mode !== "async") {
        throw new Error("Uma capacidade immediate não pode devolver pending.");
      }
      if (
        typeof pluginResponse.jobId !== "string" ||
        !pluginResponse.jobId ||
        pluginResponse.jobId.length > 1_024 ||
        [...pluginResponse.jobId].some((character) => character.charCodeAt(0) < 32) ||
        (job.jobId && pluginResponse.jobId !== job.jobId)
      ) {
        throw new Error("O plugin mudou ou omitiu o jobId durante a retomada.");
      }
      if (
        Object.keys(transientSecrets).length &&
        Object.keys(transientSecrets).some((key) => !storedSecrets[key])
      ) {
        throw new Error(
          "Jobs persistentes exigem que a credencial seja salva na Central de Plugins.",
        );
      }
      const partialValues = {
        ...job.partialValues,
        ...mappedPluginValues(
          block,
          pluginResponse.partialValues ?? {},
          job.request.outputContract,
        ),
      };
      const progress = Number.isFinite(pluginResponse.progress)
        ? Math.max(job.progress ?? 0, Math.min(1, Math.max(0, pluginResponse.progress!)))
        : job.progress;
      const pollAfterMs = Number.isFinite(pluginResponse.pollAfterMs)
        ? Math.max(500, Math.min(30_000, pluginResponse.pollAfterMs))
        : 5_000;
      const saved = pluginJobs.save(claim, {
        ...job,
        jobId: pluginResponse.jobId,
        status: "pending",
        nextPollAt: new Date(Date.now() + pollAfterMs).toISOString(),
        progress,
        message: pluginResponse.message,
        partialValues,
        partialArtifacts: mergeStoredArtifacts(
          job.partialArtifacts,
          pluginResponse.storedArtifacts,
        ),
        error: undefined,
      });
      if (saved.status === "cancel_requested") return saved;
      blockExecution.status = "in_progress";
      blockExecution.values = structuredClone(partialValues);
      blockExecution.jobId = saved.jobId;
      blockExecution.traceId = saved.traceId;
      blockExecution.progress = saved.progress;
      blockExecution.progressMessage = saved.message;
      blockExecution.itemProgress = itemProgressForJob(saved);
      blockExecution.items = blockExecutionItemsForJob(saved);
      blockExecution.logs = pluginResponse.logs;
      execution.status = "running";
      execution.error = undefined;
      recordBlockDeliveries(execution, block, partialValues, "partial");
      persistPluginExecution(execution, project);
      return saved;
    }

    if (pluginResponse.status === "error") {
      const partialValues = {
        ...job.partialValues,
        ...mappedPluginValues(
          block,
          pluginResponse.partialValues ?? {},
          job.request.outputContract,
        ),
      };
      const partialArtifacts = mergeStoredArtifacts(
        job.partialArtifacts,
        pluginResponse.storedArtifacts,
      );
      const fallback = job.profileFallback;
      if (fallback && canAdvanceProfileFallback(job, pluginResponse)) {
        const currentProfile = fallback.candidates[fallback.activeIndex];
        const nextIndex = fallback.activeIndex + 1;
        const nextProfile = fallback.candidates[nextIndex];
        const saved = pluginJobs.save(claim, {
          ...job,
          status: "starting",
          retryCount: job.retryCount + 1,
          profileFallback: {
            ...fallback,
            activeIndex: nextIndex,
            history: [
              ...fallback.history,
              {
                profile: currentProfile,
                code: pluginResponse.code,
                message: pluginResponse.message,
              },
            ],
          },
          partialValues,
          partialArtifacts,
          error: pluginResponse.message,
          message: `Falha em ${currentProfile}; continuando com ${nextProfile}.`,
          nextPollAt: new Date().toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution.status = "in_progress";
        blockExecution.values = structuredClone(partialValues);
        blockExecution.progressMessage = saved.message;
        blockExecution.itemProgress = itemProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved);
        blockExecution.logs = pluginResponse.logs;
        execution.status = "running";
        recordBlockDeliveries(execution, block, partialValues, "partial");
        persistPluginExecution(execution, project);
        return saved;
      }
      if (
        pluginResponse.retryable &&
        job.retryCount < 2 &&
        Date.now() + 1_000 < new Date(job.deadlineAt).getTime()
      ) {
        const retryCount = job.retryCount + 1;
        const retryAfterMs = Math.max(
          1_000,
          Math.min(30_000, pluginResponse.retryAfterMs ?? 1_000 * 2 ** retryCount),
        );
        const saved = pluginJobs.save(claim, {
          ...job,
          status: job.jobId ? "pending" : "starting",
          retryCount,
          partialValues,
          partialArtifacts,
          error: pluginResponse.message,
          message: `Tentativa ${retryCount + 1}: ${pluginResponse.message}`,
          nextPollAt: new Date(Date.now() + retryAfterMs).toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution.status = "in_progress";
        blockExecution.values = structuredClone(partialValues);
        blockExecution.progressMessage = saved.message;
        blockExecution.itemProgress = itemProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved);
        blockExecution.logs = pluginResponse.logs;
        execution.status = "running";
        recordBlockDeliveries(execution, block, partialValues, "partial");
        persistPluginExecution(execution, project);
        return saved;
      }
      return markPluginJobFailed(claim, execution, project, pluginResponse.message);
    }

    const values = {
      ...job.partialValues,
      ...mappedPluginValues(block, pluginResponse.values, job.request.outputContract),
    };
    const itemOrchestration = job.itemOrchestration;
    if (itemOrchestration) {
      const outputKey = job.request.outputContract.find(
        (field) => field.portKey === itemOrchestration.outputPort,
      )?.key;
      const combinedOutputKey = itemOrchestration.combinedOutputPort
        ? job.request.outputContract.find(
            (field) => field.portKey === itemOrchestration.combinedOutputPort,
          )?.key
        : undefined;
      const mappedValues = mappedPluginValues(
        block,
        pluginResponse.values,
        job.request.outputContract,
      );
      const rawIncoming = pluginResponse.values[itemOrchestration.outputPort];
      const incomingItems = Array.isArray(rawIncoming)
        ? rawIncoming
        : rawIncoming === undefined
          ? []
          : [rawIncoming];
      const completedItemJob = completeCurrentOrchestratedItem(
        job,
        structuredClone(rawIncoming) as BlockExecutionItemValue,
      );
      const completedItemOrchestration = completedItemJob.itemOrchestration!;
      const accumulatedItems = completedItemOrchestration.workItems
        ? completedOutputs(completedItemOrchestration.workItems)
        : ([...(itemOrchestration.accumulatedItems ?? []), ...incomingItems] as RuntimeValue[]);
      const accumulated = { ...job.partialValues, ...mappedValues };
      if (outputKey) accumulated[outputKey] = accumulatedItems as RuntimeValue;
      if (combinedOutputKey) {
        accumulated[combinedOutputKey] = accumulatedItems
          .filter((item): item is string => typeof item === "string")
          .join(itemOrchestration.separator ?? "\n\n");
      }
      const nextItemOrchestration = { ...completedItemOrchestration, accumulatedItems };
      const nextIndex = nextPendingItemIndex(completedItemJob);
      if (nextIndex !== undefined) {
        const saved = pluginJobs.save(claim, {
          ...completedItemJob,
          status: "starting",
          nextPollAt: new Date().toISOString(),
          retryCount: 0,
          partialValues: accumulated,
          partialArtifacts: mergeStoredArtifacts(
            job.partialArtifacts,
            pluginResponse.storedArtifacts,
          ),
          itemOrchestration: { ...nextItemOrchestration, currentIndex: nextIndex },
          progress:
            (completedItemOrchestration.workItems?.filter((item) => item.status === "completed")
              .length ?? nextIndex) / itemOrchestration.items.length,
          message: `Item ${itemOrchestration.currentIndex + 1} de ${itemOrchestration.items.length} concluído.`,
          error: undefined,
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution.status = "in_progress";
        blockExecution.values = structuredClone(accumulated);
        blockExecution.progress = saved.progress;
        blockExecution.progressMessage = saved.message;
        blockExecution.itemProgress = itemProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved);
        blockExecution.logs = pluginResponse.logs;
        execution.status = "running";
        recordBlockDeliveries(execution, block, accumulated, "partial");
        persistPluginExecution(execution, project);
        return saved;
      }
      Object.assign(values, accumulated);
      job = { ...completedItemJob, itemOrchestration: nextItemOrchestration };
      claim.job = job;
    }
    if (
      block.type === "ESCOLHER" &&
      !job.request.context.selectedCollection?.items.some(
        (item) => item.id === values.selectedItemId,
      )
    ) {
      throw new Error("O plugin não escolheu um item válido da coleção vinculada.");
    }
    const missingOutputs = (block.outputs ?? [])
      .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
      .map((field) => field.label);
    if (missingOutputs.length)
      throw new Error(`O plugin não entregou: ${missingOutputs.join(", ")}.`);
    const restrictionIssues = (block.outputs ?? []).flatMap((field) => {
      const issue = getPresentationRestrictionIssue(field.presentation, values[field.key]);
      return issue ? [`${field.label}: ${issue}`] : [];
    });
    if (restrictionIssues.length) {
      throw new Error(`O plugin entregou valores incompatíveis: ${restrictionIssues.join("; ")}.`);
    }
    if (!job.itemOrchestration) {
      const inferredCapability = capabilityWithDeterministicItemMapping(
        capability,
        job.request,
        values,
      );
      const inferredPolicy = inferredCapability.execution.itemOrchestration;
      const inferredOutputKey = inferredPolicy
        ? job.request.outputContract.find((field) => field.portKey === inferredPolicy.outputPort)
            ?.key
        : undefined;
      const inferredInputs = inferredPolicy
        ? job.request.inputs[inferredPolicy.inputPort]
        : undefined;
      const inferredOutputs = inferredOutputKey ? values[inferredOutputKey] : undefined;
      if (
        inferredPolicy &&
        Array.isArray(inferredInputs) &&
        Array.isArray(inferredOutputs) &&
        inferredInputs.length === inferredOutputs.length
      ) {
        const materialized = legacyItemOrchestration(
          inferredCapability,
          job.request,
          structuredClone(inferredOutputs) as RuntimeValue[],
        );
        if (materialized) {
          job = { ...job, itemOrchestration: materialized };
          claim.job = job;
        }
      }
    }
    const completedConversationId = pluginResponse.conversation?.id
      ? normalizePluginConversationId(pluginResponse.conversation.id)
      : undefined;
    const saved = pluginJobs.save(
      claim,
      {
        ...job,
        status: "completed",
        progress: 1,
        partialValues: values,
        partialArtifacts: mergeStoredArtifacts(
          job.partialArtifacts,
          pluginResponse.storedArtifacts,
        ),
        error: undefined,
        nextPollAt: new Date(8_640_000_000_000_000).toISOString(),
      },
      (saved) => {
        if (saved.status === "cancel_requested") return;
        if (!execution || !project || !block || !blockExecution) return;
        finishPluginBlock(execution, block, blockExecution, values);
        if (completedConversationId) {
          const profileConfigurationKey = plugin.manifest.profileSetup?.configurationKey;
          const activeProfile = job.profileFallback
            ? job.profileFallback.candidates[job.profileFallback.activeIndex]
            : profileConfigurationKey
              ? String(job.request.configuration[profileConfigurationKey] ?? "").trim() || undefined
              : undefined;
          blockExecution.pluginConversation = {
            pluginId: plugin.id,
            connectionId: block.plugin?.connectionId,
            profile: activeProfile,
            id: completedConversationId,
            fallbackContext: pluginConversationFallbackContext(block, values),
          };
        }
        blockExecution.retryMode = undefined;
        blockExecution.retryConversationContext = undefined;
        blockExecution.retryConversationAttachments = undefined;
        blockExecution.logs = pluginResponse.logs;
        blockExecution.progress = 1;
        blockExecution.progressMessage = undefined;
        blockExecution.itemProgress = itemProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved);
        blockExecution.itemRetryScope = undefined;
        persistPluginExecution(execution, project);
      },
    );
    scheduleAutomaticPluginBlock(execution);
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível executar o plugin.";
    execution = executionById(job.executionId);
    project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
    blockExecution = execution?.blocks.find((item) => item.blockId === job.blockId);
    if (
      !execution ||
      !project ||
      !blockExecution ||
      execution.status === "cancelled" ||
      (blockExecution.attempt ?? 1) !== job.attempt
    ) {
      return markPluginJobCancelled(
        claim,
        undefined,
        undefined,
        "Execução encerrada; falha tardia descartada.",
      );
    }
    const errorCode = (error as { code?: string })?.code || "JOB_FAILED";
    const fallback = job.profileFallback;
    if (fallback && canAdvanceProfileFallback(job, { code: errorCode, message, status: "error" })) {
      const currentProfile = fallback.candidates[fallback.activeIndex];
      const nextIndex = fallback.activeIndex + 1;
      const nextProfile = fallback.candidates[nextIndex];
      const saved = pluginJobs.save(claim, {
        ...job,
        status: "starting",
        retryCount: job.retryCount + 1,
        profileFallback: {
          ...fallback,
          activeIndex: nextIndex,
          history: [
            ...fallback.history,
            {
              profile: currentProfile,
              code: errorCode,
              message,
            },
          ],
        },
        error: message,
        message: `Falha em ${currentProfile}; continuando com ${nextProfile}.`,
        nextPollAt: new Date().toISOString(),
      });
      if (saved.status === "cancel_requested") return saved;
      blockExecution.status = "in_progress";
      blockExecution.progressMessage = saved.message;
      blockExecution.itemProgress = itemProgressForJob(saved);
      blockExecution.items = blockExecutionItemsForJob(saved);
      execution.status = "running";
      persistPluginExecution(execution, project);
      return saved;
    }
    if (job.retryCount < 2 && Date.now() + 1_000 < new Date(job.deadlineAt).getTime()) {
      const retryCount = job.retryCount + 1;
      const saved = pluginJobs.save(claim, {
        ...job,
        status: job.jobId ? "pending" : "starting",
        retryCount,
        error: message,
        message: `Tentativa ${retryCount + 1}: ${message}`,
        nextPollAt: new Date(Date.now() + Math.min(30_000, 1_000 * 2 ** retryCount)).toISOString(),
      });
      if (saved.status === "cancel_requested") return saved;
      blockExecution.status = "in_progress";
      blockExecution.progressMessage = saved.message;
      blockExecution.itemProgress = itemProgressForJob(saved);
      blockExecution.items = blockExecutionItemsForJob(saved);
      execution.status = "running";
      persistPluginExecution(execution, project);
      return saved;
    }
    return markPluginJobFailed(claim, execution, project, message);
  }
}

let activePluginWorkers = 0;
const activePluginConcurrencySlots = new Map<string, number>();
async function processDuePluginJobs() {
  while (activePluginWorkers < 4) {
    const claim = pluginJobs.claimNext();
    if (!claim) break;
    const slot = pluginConcurrencySlot(getRegisteredPlugin(claim.job.pluginId), claim.job);
    const activeInSlot = activePluginConcurrencySlots.get(slot.key) ?? 0;
    if (activeInSlot >= slot.limit) {
      pluginJobs.defer(claim, new Date(Date.now() + 250));
      continue;
    }
    activePluginWorkers += 1;
    activePluginConcurrencySlots.set(slot.key, activeInSlot + 1);
    void processPluginJob(claim.job.id, {}, claim)
      .catch((error) => console.error("Falha no worker de plugin:", error))
      .finally(() => {
        activePluginWorkers -= 1;
        const remaining = (activePluginConcurrencySlots.get(slot.key) ?? 1) - 1;
        if (remaining > 0) activePluginConcurrencySlots.set(slot.key, remaining);
        else activePluginConcurrencySlots.delete(slot.key);
      });
  }
}

initializePluginRunner();
reconcileStoredExecutionItems();
const pluginJobScheduler = setInterval(() => void processDuePluginJobs(), 500);
pluginJobScheduler.unref();
function cleanupAbandonedPluginJobs() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const expired = pluginJobs.terminalBefore(cutoff);
  for (const job of expired) {
    if (job.status === "completed") continue;
    for (const file of job.partialArtifacts) {
      if (!file.url.startsWith("/api/files/")) continue;
      const storedName = file.url.slice("/api/files/".length);
      if (!storedName || path.basename(storedName) !== storedName) continue;
      const storedPath = path.resolve(uploadsDirectory, storedName);
      if (storedPath.startsWith(`${path.resolve(uploadsDirectory)}${path.sep}`)) {
        rmSync(storedPath, { force: true });
      }
    }
  }
  pluginJobs.deleteTerminalBefore(cutoff);
  const partialCutoff = Date.now() - 24 * 60 * 60 * 1_000;
  for (const entry of readdirSync(uploadsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(".") || !entry.name.endsWith(".partial"))
      continue;
    const partialPath = path.join(uploadsDirectory, entry.name);
    try {
      if (statSync(partialPath).mtimeMs < partialCutoff) rmSync(partialPath, { force: true });
    } catch {
      // Another cleanup or importer may have removed the partial concurrently.
    }
  }
}
const pluginJobCleanup = setInterval(cleanupAbandonedPluginJobs, 60 * 60 * 1_000);
pluginJobCleanup.unref();
cleanupAbandonedPluginJobs();
void processDuePluginJobs();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUniqueStringArray(value: unknown, allowed?: readonly string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isNonEmptyString(item) && (!allowed || allowed.includes(item))) &&
    new Set(value).size === value.length
  );
}

function isOptionalHttpsUrl(value: unknown) {
  if (value === undefined) return true;
  if (!isNonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isPluginManifest(manifest: Record<string, unknown>) {
  const runtime = manifest.runtime as Record<string, unknown> | undefined;
  const capabilities = manifest.capabilities;
  const profileSetup = manifest.profileSetup as Record<string, unknown> | undefined;
  const permissions = [
    "network",
    "filesystem:read",
    "filesystem:write",
    "process",
    "worker",
    "native",
  ] as const;
  const blockTypes = ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"] as const;
  const processTypes = [
    "theme",
    "title",
    "thumbnail",
    "script",
    "narration",
    "assets",
    "editing",
    "publishing",
  ] as const;
  const dataTypes = [
    "text",
    "textarea",
    "number",
    "boolean",
    "list",
    "records",
    "select",
    "multiselect",
    "datetime",
    "url",
    "file",
    "files",
    "image",
    "audio",
    "video",
    "approval",
    "thumbnail_layout",
  ] as const;
  const presentationRenderers = [
    "auto",
    "text-short",
    "text-long",
    "list",
    "tags",
    "table",
    "cards",
    "file-list",
    "image-gallery",
    "audio-player",
    "video-player",
    "decision",
  ] as const;
  const presentationItemTypes = ["text", "record", "file", "image", "audio", "video"] as const;
  const sideEffects = [
    "external_read",
    "external_write",
    "public_publish",
    "local_artifact",
    "subprocess",
  ] as const;

  const manifestPermissions = isUniqueStringArray(manifest.permissions, permissions)
    ? manifest.permissions
    : [];
  let networkHostsAreValid = manifest.networkHosts === undefined;
  if (
    Array.isArray(manifest.networkHosts) &&
    manifest.networkHosts.length <= 100 &&
    manifest.networkHosts.every((host) => typeof host === "string")
  ) {
    try {
      const normalizedHosts = manifest.networkHosts.map(normalizeNetworkHostPattern);
      networkHostsAreValid =
        manifestPermissions.includes("network") &&
        normalizedHosts.length > 0 &&
        new Set(normalizedHosts).size === normalizedHosts.length;
    } catch {
      networkHostsAreValid = false;
    }
  }

  return Boolean(
    manifest.apiVersion === "1" &&
    isNonEmptyString(manifest.id) &&
    isNonEmptyString(manifest.name) &&
    isNonEmptyString(manifest.version) &&
    isNonEmptyString(manifest.description) &&
    isNonEmptyString(manifest.author) &&
    isNonEmptyString(manifest.license) &&
    isOptionalHttpsUrl(manifest.homepage) &&
    isOptionalHttpsUrl(manifest.repository) &&
    isNonEmptyString(manifest.entrypoint) &&
    !path.isAbsolute(manifest.entrypoint) &&
    !manifest.entrypoint.includes("..") &&
    isUniqueStringArray(manifest.permissions, permissions) &&
    networkHostsAreValid &&
    (profileSetup === undefined ||
      (isNonEmptyString(profileSetup.configurationKey) &&
        (profileSetup.fallbackConfigurationKey === undefined ||
          isNonEmptyString(profileSetup.fallbackConfigurationKey)) &&
        isNonEmptyString(profileSetup.label) &&
        (profileSetup.description === undefined || typeof profileSetup.description === "string") &&
        (profileSetup.prepareTimeoutMs === undefined ||
          (Number.isInteger(profileSetup.prepareTimeoutMs) &&
            Number(profileSetup.prepareTimeoutMs) >= 30_000 &&
            Number(profileSetup.prepareTimeoutMs) <= 900_000)) &&
        Object.keys(profileSetup).every((key) =>
          [
            "configurationKey",
            "fallbackConfigurationKey",
            "label",
            "description",
            "prepareTimeoutMs",
          ].includes(key),
        ))) &&
    (manifest.secretKeys === undefined || isUniqueStringArray(manifest.secretKeys)) &&
    runtime?.kind === "node" &&
    runtime.module === "esm" &&
    isNonEmptyString(runtime.version) &&
    Array.isArray(capabilities) &&
    capabilities.length > 0 &&
    capabilities.every((value) => {
      if (!value || typeof value !== "object") return false;
      const capability = value as Record<string, unknown>;
      const execution = capability.execution as Record<string, unknown> | undefined;
      const itemOrchestration = execution?.itemOrchestration as Record<string, unknown> | undefined;
      const cost = capability.cost as Record<string, unknown> | undefined;
      const dataPolicy = capability.dataPolicy as Record<string, unknown> | undefined;
      const capabilitySideEffects = capability.sideEffects;
      const portsAreValid = (ports: unknown, typeKey: "acceptedTypes" | "producedTypes") =>
        Array.isArray(ports) &&
        ports.every((portValue) => {
          if (!portValue || typeof portValue !== "object") return false;
          const port = portValue as Record<string, unknown>;
          const presentation = port.presentation as Record<string, unknown> | undefined;
          const allowedPortKeys =
            typeKey === "acceptedTypes"
              ? [
                  "key",
                  "label",
                  "description",
                  "acceptedTypes",
                  "required",
                  "multiple",
                  "presentation",
                ]
              : ["key", "label", "description", "producedTypes", "required", "presentation"];
          const declaredTypes = Array.isArray(port[typeKey])
            ? (port[typeKey] as HumanFieldType[])
            : [];
          const presentationIsValid =
            presentation === undefined ||
            (presentation !== null &&
              typeof presentation === "object" &&
              presentationRenderers.includes(
                String(presentation.renderer) as (typeof presentationRenderers)[number],
              ) &&
              declaredTypes.some(
                (type) =>
                  dataTypes.includes(type) &&
                  getCompatiblePresentationRenderers(type).includes(
                    String(presentation.renderer) as (typeof presentationRenderers)[number],
                  ),
              ) &&
              (presentation.itemType === undefined ||
                presentationItemTypes.includes(
                  String(presentation.itemType) as (typeof presentationItemTypes)[number],
                )) &&
              (presentation.acceptedMimeTypes === undefined ||
                (isUniqueStringArray(presentation.acceptedMimeTypes) &&
                  presentation.acceptedMimeTypes.every((mime) =>
                    /^[-\w.+]+\/[-\w.+*]+$/.test(mime),
                  ))) &&
              Object.keys(presentation).every((key) =>
                ["renderer", "itemType", "acceptedMimeTypes"].includes(key),
              ));
          return (
            isNonEmptyString(port.key) &&
            isNonEmptyString(port.label) &&
            typeof port.required === "boolean" &&
            (port.description === undefined || typeof port.description === "string") &&
            (typeKey !== "acceptedTypes" ||
              port.multiple === undefined ||
              typeof port.multiple === "boolean") &&
            Object.keys(port).every((key) => allowedPortKeys.includes(key)) &&
            isUniqueStringArray(port[typeKey], dataTypes) &&
            presentationIsValid
          );
        }) &&
        new Set(ports.map((port) => String((port as Record<string, unknown>).key))).size ===
          ports.length;
      const sendsData = dataPolicy?.sendsDataToThirdParties === true;
      const usesNetwork =
        Array.isArray(capabilitySideEffects) &&
        capabilitySideEffects.some((effect) =>
          ["external_read", "external_write", "public_publish"].includes(String(effect)),
        );

      return (
        isNonEmptyString(capability.id) &&
        ["Humano", "IA", "Código"].includes(String(capability.operator)) &&
        isUniqueStringArray(capability.blockTypes, blockTypes) &&
        capability.blockTypes.length > 0 &&
        (capability.processTypes === undefined ||
          isUniqueStringArray(capability.processTypes, processTypes)) &&
        portsAreValid(capability.inputPorts, "acceptedTypes") &&
        portsAreValid(capability.outputPorts, "producedTypes") &&
        (capability.outputPorts as unknown[]).length > 0 &&
        ["immediate", "async"].includes(String(execution?.mode)) &&
        (execution?.maxConcurrency === undefined ||
          (Number.isInteger(execution.maxConcurrency) &&
            Number(execution.maxConcurrency) >= 1 &&
            Number(execution.maxConcurrency) <= 100)) &&
        (itemOrchestration === undefined ||
          (itemOrchestration.mode === "sequential" &&
            isNonEmptyString(itemOrchestration.inputPort) &&
            isNonEmptyString(itemOrchestration.outputPort) &&
            (capability.inputPorts as Array<Record<string, unknown>>).some(
              (port) => port.key === itemOrchestration.inputPort,
            ) &&
            (capability.outputPorts as Array<Record<string, unknown>>).some(
              (port) => port.key === itemOrchestration.outputPort,
            ) &&
            (itemOrchestration.combinedOutputPort === undefined ||
              (isNonEmptyString(itemOrchestration.combinedOutputPort) &&
                (capability.outputPorts as Array<Record<string, unknown>>).some(
                  (port) => port.key === itemOrchestration.combinedOutputPort,
                ))) &&
            (itemOrchestration.separator === undefined ||
              (typeof itemOrchestration.separator === "string" &&
                itemOrchestration.separator.length <= 20)))) &&
        isUniqueStringArray(capabilitySideEffects, sideEffects) &&
        (!usesNetwork || manifestPermissions.includes("network")) &&
        (!capabilitySideEffects.includes("local_artifact") ||
          manifestPermissions.includes("filesystem:write")) &&
        (!capabilitySideEffects.includes("subprocess") ||
          manifestPermissions.includes("process")) &&
        ["free", "metered", "unknown"].includes(String(cost?.model)) &&
        typeof cost?.estimateSupported === "boolean" &&
        typeof dataPolicy?.sendsDataToThirdParties === "boolean" &&
        (!sendsData || isUniqueStringArray(dataPolicy?.providers)) &&
        isOptionalHttpsUrl(dataPolicy?.retentionPolicyUrl) &&
        isOptionalHttpsUrl(dataPolicy?.trainingPolicyUrl) &&
        capability.blockConfigSchema !== null &&
        typeof capability.blockConfigSchema === "object" &&
        capability.outputSchema !== null &&
        typeof capability.outputSchema === "object"
      );
    }) &&
    new Set(capabilities.map((capability) => String((capability as Record<string, unknown>).id)))
      .size === capabilities.length,
  );
}

function migrateLegacyLibraryItems() {
  const rows = database.prepare("SELECT id, payload FROM library_items").all() as {
    id: string;
    payload: string;
  }[];
  const legacyItems = rows
    .map((row) => ({ id: row.id, item: JSON.parse(row.payload) as StoredPayload }))
    .filter(({ item }) => !item.collectionId && item.collection && item.channelId);
  if (!legacyItems.length) return;

  const existingCollections = (
    database.prepare("SELECT payload FROM library_collections").all() as { payload: string }[]
  ).map((row) => JSON.parse(row.payload) as StoredPayload);

  const migrate = database.transaction(() => {
    const grouped = new Map<string, typeof legacyItems>();
    for (const legacy of legacyItems) {
      const key = `${legacy.item.channelId}::${legacy.item.collection}`;
      grouped.set(key, [...(grouped.get(key) ?? []), legacy]);
    }

    for (const group of grouped.values()) {
      const first = group[0].item;
      let collection = existingCollections.find(
        (candidate) =>
          candidate.channelId === first.channelId && candidate.name === first.collection,
      );
      if (!collection) {
        const fields = [
          { id: randomUUID(), label: "Nome", type: "text", required: true },
          { id: randomUUID(), label: "Conteúdo", type: "textarea", required: true },
          { id: randomUUID(), label: "Descrição", type: "textarea", required: false },
        ];
        collection = {
          id: randomUUID(),
          channelId: first.channelId,
          name: first.collection,
          fields,
          createdAt: new Date().toISOString(),
        };
        existingCollections.push(collection);
        database
          .prepare(
            "INSERT INTO library_collections (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(
            collection.id,
            collection.channelId,
            JSON.stringify(collection),
            collection.createdAt,
          );
      }

      const fields = collection.fields as { id: string }[];
      for (const { id, item } of group) {
        const migrated = {
          id,
          channelId: item.channelId,
          collectionId: collection.id,
          values: {
            [fields[0].id]: String(item.name ?? ""),
            [fields[1].id]: String((item as StoredPayload & { value?: string }).value ?? ""),
            [fields[2].id]: String(
              (item as StoredPayload & { description?: string }).description ?? "",
            ),
          },
          createdAt: item.createdAt,
        };
        database
          .prepare("UPDATE library_items SET payload = ? WHERE id = ?")
          .run(JSON.stringify(migrated), id);
      }
    }
  });
  migrate();
}

migrateLegacyLibraryItems();

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(
  "/api/files",
  express.static(uploadsDirectory, {
    dotfiles: "deny",
    setHeaders(response, filePath) {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (activeUploadExtensions.has(path.extname(filePath).toLowerCase())) {
        response.setHeader("Content-Disposition", "attachment");
      }
    },
  }),
);
app.post(
  "/api/uploads",
  express.raw({ type: "application/octet-stream", limit: maxUploadBytes }),
  (request, response) => {
    const originalName = decodeUploadName(request.headers["x-file-name"]);
    const mimeType = String(request.headers["x-file-type"] ?? "application/octet-stream")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.status(400).json({ error: "Arquivo vazio ou inválido." });
      return;
    }
    const extension = path
      .extname(originalName)
      .replace(/[^a-zA-Z0-9.]/g, "")
      .slice(0, 12)
      .toLowerCase();
    if (activeUploadExtensions.has(extension) || activeUploadMimeTypes.has(mimeType)) {
      response.status(415).json({
        error: "Esse formato ativo não pode ser armazenado. Envie uma mídia ou arquivo de dados.",
      });
      return;
    }
    if (uploadDirectorySize() + request.body.length > maxUploadStorageBytes) {
      response.status(507).json({
        error: `O armazenamento local de uploads atingiu o limite de ${maxUploadStorageGb} GB.`,
      });
      return;
    }
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    writeFileSync(path.join(uploadsDirectory, storedName), request.body);
    response.status(201).json({
      id,
      name: path.basename(originalName),
      mimeType,
      size: request.body.length,
      url: `/api/files/${storedName}`,
    });
  },
);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/method-packages/export", async (request, response) => {
  try {
    if (typeof request.body?.manifest !== "string") {
      response.status(400).json({ error: "Manifesto ausente." });
      return;
    }
    const archive = await createMethodPackage(request.body.manifest, (url) => {
      const storedName = url.slice("/api/files/".length);
      if (!/^[a-zA-Z0-9._-]+$/.test(storedName)) throw new Error("Capa local inválida.");
      return readFileSync(path.join(uploadsDirectory, storedName));
    });
    response.type("application/zip").send(archive);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Não foi possível criar o pacote.",
    });
  }
});

app.post(
  "/api/method-packages/import",
  express.raw({ type: ["application/zip", "application/octet-stream"], limit: "20mb" }),
  async (request, response) => {
    try {
      if (!Buffer.isBuffer(request.body) || !request.body.length) {
        response.status(400).json({ error: "Pacote vazio ou inválido." });
        return;
      }
      // Abrir um pacote serve apenas para pré-visualização. Os assets permanecem
      // embutidos no manifesto como data URLs até a aplicação/importação efetiva.
      const manifest = await readMethodPackage(request.body);
      response.json({ manifest });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Não foi possível abrir o pacote.",
      });
    }
  },
);

app.get("/api/preferences", (_request, response) => {
  response.json(readPreferences());
});

app.put("/api/preferences", (request, response) => {
  const current = readPreferences();
  const theme = request.body?.theme;
  const language = request.body?.language;
  const notificationSound = request.body?.notificationSound;
  const systemNotifications = request.body?.systemNotifications;
  const methodsLibraryView = request.body?.methodsLibraryView ?? current.methodsLibraryView;
  if (
    !(["light", "dark"] as const).includes(theme) ||
    !(["pt-BR", "en", "es"] as const).includes(language) ||
    typeof notificationSound !== "boolean" ||
    typeof systemNotifications !== "boolean" ||
    !(["methods", "channels"] as const).includes(methodsLibraryView)
  ) {
    response.status(400).json({ error: "Preferências inválidas." });
    return;
  }
  database
    .prepare(
      `INSERT INTO app_preferences (
          id, theme, language, notification_sound, system_notifications, methods_library_view,
          updated_at
        )
        VALUES ('global', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          theme = excluded.theme,
          language = excluded.language,
          notification_sound = excluded.notification_sound,
          system_notifications = excluded.system_notifications,
          methods_library_view = excluded.methods_library_view,
          updated_at = excluded.updated_at`,
    )
    .run(
      theme,
      language,
      Number(notificationSound),
      Number(systemNotifications),
      methodsLibraryView,
      new Date().toISOString(),
    );
  response.json(readPreferences());
});

app.get("/api/plugins", (_request, response) => {
  const registry = initializePluginRunner();
  const plugins = registry.plugins.map((plugin) => {
    const enabled = pluginConsentIsCurrent(plugin);
    return {
      id: plugin.id,
      source: plugin.source,
      directory: plugin.directory,
      manifest: plugin.manifest,
      enabled,
      executable: Boolean(plugin.executable && enabled),
      sandboxed: true,
      networkIsolation: communitySandboxAvailable,
      profileCount: plugin.manifest.profileSetup ? profileInventory(plugin).length : undefined,
    };
  });
  response.json({
    plugins,
    issues: registry.issues,
  });
});

app.get("/api/plugins/:pluginId/icon", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const iconPath = plugin?.manifest.branding?.iconPath;
  if (!plugin || !iconPath) {
    response.status(404).end();
    return;
  }
  const absoluteIconPath = path.resolve(plugin.absoluteDirectory, iconPath);
  if (!absoluteIconPath.startsWith(`${plugin.absoluteDirectory}${path.sep}`)) {
    response.status(404).end();
    return;
  }
  response.setHeader("Cache-Control", "public, max-age=3600");
  response.type(
    path.extname(absoluteIconPath).toLowerCase() === ".webp" ? "image/webp" : "image/png",
  );
  response.sendFile(absoluteIconPath);
});

function storedChannels() {
  const rows = database.prepare("SELECT payload FROM channels").all() as { payload: string }[];
  return parseRows(rows);
}

function profileInventory(plugin: RegisteredPlugin) {
  const setup = plugin.manifest.profileSetup;
  if (!setup) return [];
  const channels = storedChannels();
  database.transaction(() =>
    syncPluginProfilesFromMethods(pluginProfiles, channels, plugin.id, setup, randomUUID),
  )();
  const usages = findPluginProfileUsages(channels, plugin.id, setup);
  return pluginProfiles.list(plugin.id).map((profile) => ({
    ...profile,
    usages: usages.get(profile.alias.toLocaleLowerCase()) ?? [],
  }));
}

function registeredProfilePlugin(pluginId: string) {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(pluginId);
  if (!plugin?.manifest.profileSetup) return undefined;
  return plugin;
}

app.get("/api/plugins/:pluginId/profiles", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  response.json({ profiles: profileInventory(plugin), browserBridgeDirectory });
});

app.post("/api/plugins/:pluginId/profiles", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  try {
    const name = normalizePluginProfileName(request.body?.name);
    const profileId = randomUUID();
    const aliasBase =
      request.body?.alias === undefined
        ? pluginProfileAliasFromName(name) || `perfil-${profileId.slice(0, 8)}`
        : normalizePluginProfileAlias(request.body.alias);
    let alias = aliasBase;
    let suffix = 2;
    while (pluginProfiles.findByAlias(plugin.id, alias)) {
      const suffixText = `-${suffix++}`;
      alias = `${aliasBase.slice(0, 48 - suffixText.length).replace(/-+$/, "")}${suffixText}`;
    }
    const profile = pluginProfiles.create({ id: profileId, pluginId: plugin.id, name, alias });
    response.status(201).json({ ...profile, usages: [] });
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível criar o perfil.",
    });
  }
});

app.patch("/api/plugins/:pluginId/profiles/:profileId", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  try {
    const name = normalizePluginProfileName(request.body?.name);
    const profile = pluginProfiles.rename(plugin.id, request.params.profileId, name);
    if (!profile) {
      response.status(404).json({ error: "Perfil não encontrado." });
      return;
    }
    const usages = findPluginProfileUsages(
      storedChannels(),
      plugin.id,
      plugin.manifest.profileSetup!,
    );
    response.json({
      ...profile,
      usages: usages.get(profile.alias.toLocaleLowerCase()) ?? [],
    });
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível renomear o perfil.",
    });
  }
});

app.delete("/api/plugins/:pluginId/profiles/:profileId", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  const profile = pluginProfiles.get(plugin.id, request.params.profileId);
  if (!profile) {
    response.status(404).json({ error: "Perfil não encontrado." });
    return;
  }
  const usages =
    findPluginProfileUsages(storedChannels(), plugin.id, plugin.manifest.profileSetup!).get(
      profile.alias.toLocaleLowerCase(),
    ) ?? [];
  if (usages.length) {
    response.status(409).json({
      error: "Este perfil ainda é usado por Métodos. Troque essas referências antes de removê-lo.",
      usages,
    });
    return;
  }
  pluginProfiles.remove(plugin.id, profile.id);
  response.status(204).end();
});

async function executePluginProfileAction(
  plugin: RegisteredPlugin,
  action: "status" | "prepare",
  profileName: string,
) {
  const setup = plugin.manifest.profileSetup as PluginProfileSetup;
  const profileKey = setup.configurationKey;
  const capability = plugin.manifest.capabilities.find(
    (candidate) => candidate.blockConfigSchema.properties?.[profileKey],
  );
  if (!capability) throw new Error("O perfil não pertence à configuração deste plugin.");
  const pluginSecrets: Record<string, string> = {};
  for (const declaredSecret of plugin.manifest.secretKeys ?? []) {
    const storedSecret = await getPluginSecret(plugin.id, declaredSecret);
    if (storedSecret) pluginSecrets[declaredSecret] = storedSecret;
  }
  const pluginRequest: PluginExecutionRequest = {
    executionId: `profile-${randomUUID()}`,
    traceId: randomUUID(),
    blockId: "profile-setup",
    capabilityId: capability.id,
    attempt: 1,
    invocation: { mode: "configure", action },
    configuration: { [profileKey]: profileName },
    settings: {},
    inputs: {},
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "profile-setup", name: "Configuração", language: "pt-BR", niche: "" },
      project: { id: "profile-setup", title: "Preparação de perfil" },
      processType: "theme",
      block: { type: "CRIAR", name: "Preparar perfil", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
  const timeoutMs = action === "prepare" ? undefined : 30_000;
  return executeRegisteredPlugin(plugin, pluginRequest, timeoutMs, pluginSecrets, {
    workspaceDirectory: executionWorkspaceForPlugin(plugin),
  });
}

app.post("/api/plugins/:pluginId/profiles/:profileId/:action", async (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  const action = request.params.action;
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
    response.status(403).json({
      error: "Ative este plugin e confirme suas permissões na Central de Plugins.",
    });
    return;
  }
  if (action !== "status" && action !== "prepare") {
    response.status(400).json({ error: "Ação de perfil inválida." });
    return;
  }
  const profile = pluginProfiles.get(plugin.id, request.params.profileId);
  if (!profile) {
    response.status(404).json({ error: "Perfil não encontrado." });
    return;
  }
  try {
    const result = await executePluginProfileAction(plugin, action, profile.alias);
    if (result.status === "error") {
      response.status(action === "status" ? 200 : 422).json({
        ready: false,
        error: result.message,
      });
      return;
    }
    const markerReady = result.status === "success" && result.values.ready === true;
    const bridgeState = markerReady
      ? browserBridgeProfileState(executionWorkspaceForPlugin(plugin)!, profile.alias)
      : "unknown";
    response.json({
      ready: markerReady && bridgeState !== "missing",
      bridgeState,
      error:
        markerReady && bridgeState === "missing"
          ? `A ContentFlow Browser Bridge não permaneceu instalada neste perfil. Em chrome://extensions, carregue uma única vez a pasta estável ${browserBridgeDirectory ?? "indicada na Central de Plugins"} e prepare novamente.`
          : undefined,
      message:
        result.status === "success" && typeof result.values.message === "string"
          ? result.values.message
          : undefined,
    });
  } catch (error) {
    response.status(422).json({
      ready: false,
      error: error instanceof Error ? error.message : "Não foi possível preparar o perfil.",
    });
  }
});

app.post("/api/plugins/:pluginId/profile", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const action = request.body?.action;
  const configuration = request.body?.configuration;
  if (!plugin || !plugin.manifest.profileSetup) {
    response.status(404).json({ error: "Este plugin não oferece preparação de perfil." });
    return;
  }
  if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
    response.status(403).json({
      error: "Ative este plugin e confirme suas permissões na Central de Plugins.",
    });
    return;
  }
  if (
    !["status", "prepare"].includes(String(action)) ||
    !configuration ||
    typeof configuration !== "object" ||
    Array.isArray(configuration)
  ) {
    response.status(400).json({ error: "Solicitação de preparação de perfil inválida." });
    return;
  }
  const profileKey = plugin.manifest.profileSetup.configurationKey;
  const profileName = (configuration as Record<string, unknown>)[profileKey];
  if (typeof profileName !== "string" || !profileName.trim()) {
    response.status(422).json({ error: "Informe o nome do perfil antes de prepará-lo." });
    return;
  }
  try {
    pluginProfiles.ensure({ id: randomUUID(), pluginId: plugin.id, alias: profileName.trim() });
    const result = await executePluginProfileAction(
      plugin,
      action as "status" | "prepare",
      profileName.trim(),
    );
    if (result.status === "error") {
      response.status(action === "status" ? 200 : 422).json({
        ready: false,
        error: result.message,
      });
      return;
    }
    response.json({
      ready: result.status === "success" && result.values.ready === true,
      message:
        result.status === "success" && typeof result.values.message === "string"
          ? result.values.message
          : undefined,
    });
  } catch (error) {
    response.status(422).json({
      ready: false,
      error: error instanceof Error ? error.message : "Não foi possível preparar o perfil.",
    });
  }
});

app.post("/api/plugins/install-from-folder", (request, response) => {
  const requestedPath =
    typeof request.body?.path === "string" ? normalizeUserProvidedPath(request.body.path) : "";
  if (!requestedPath) {
    response.status(400).json({ error: "Informe a pasta de um plugin ou do pacote extraído." });
    return;
  }
  const temporaryDestinations: string[] = [];
  const installedDestinations: string[] = [];
  try {
    const pluginDirectories = discoverPluginDirectories(requestedPath);
    const candidates = pluginDirectories.map((sourceDirectory) => {
      const validated = validatePluginDirectory(sourceDirectory, true);
      const pluginId = validated.manifest.id;
      const destination = path.resolve(installedPluginsDirectory, pluginId);
      if (!destination.startsWith(`${path.resolve(installedPluginsDirectory)}${path.sep}`))
        throw new Error("O destino calculado para o plugin é inválido.");
      return { sourceDirectory, pluginId, destination };
    });
    if (new Set(candidates.map((candidate) => candidate.pluginId)).size !== candidates.length) {
      throw new Error("O pacote contém IDs de plugin duplicados.");
    }
    const skipped = candidates
      .filter((candidate) => existsSync(candidate.destination))
      .map((candidate) => candidate.pluginId);
    const pending = candidates.filter((candidate) => !existsSync(candidate.destination));
    mkdirSync(installedPluginsDirectory, { recursive: true });
    const staged = pending.map((candidate) => {
      const temporaryDestination = path.join(installedPluginsDirectory, `.install-${randomUUID()}`);
      temporaryDestinations.push(temporaryDestination);
      cpSync(candidate.sourceDirectory, temporaryDestination, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
      });
      validatePluginDirectory(temporaryDestination, true);
      return { ...candidate, temporaryDestination };
    });
    const registry = initializePluginRunner();
    for (const candidate of staged) {
      const installed = registry.plugins.find(
        (plugin) => plugin.id === candidate.pluginId && plugin.source === "installed",
      );
      if (!installed) {
        const issue = registry.issues.find((item) =>
          item.directory.includes(path.basename(candidate.temporaryDestination)),
        );
        throw new Error(issue?.message ?? `${candidate.pluginId} não passou pela validação.`);
      }
    }
    for (const candidate of staged) {
      renameSync(candidate.temporaryDestination, candidate.destination);
      temporaryDestinations.splice(
        temporaryDestinations.indexOf(candidate.temporaryDestination),
        1,
      );
      installedDestinations.push(candidate.destination);
    }
    initializePluginRunner();
    response.status(staged.length ? 201 : 200).json({
      installed: staged.map((candidate) => candidate.pluginId),
      skipped,
    });
  } catch (error) {
    for (const destination of [...temporaryDestinations, ...installedDestinations])
      if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    initializePluginRunner();
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível instalar os plugins.",
    });
  }
});

app.post("/api/plugins/link-development-folder", (request, response) => {
  const requestedPath =
    typeof request.body?.path === "string" ? normalizeUserProvidedPath(request.body.path) : "";
  if (!requestedPath) {
    response.status(400).json({ error: "Informe a pasta de desenvolvimento do plugin." });
    return;
  }
  const sourceDirectory = path.resolve(requestedPath);
  const manifestPath = path.join(sourceDirectory, "contentflow.plugin.json");
  if (!existsSync(sourceDirectory) || !statSync(sourceDirectory).isDirectory()) {
    response.status(404).json({ error: "A pasta informada não existe." });
    return;
  }
  if (!existsSync(manifestPath)) {
    response.status(422).json({ error: "A pasta não contém contentflow.plugin.json." });
    return;
  }
  let linkPath: string | undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    if (!isPluginManifest(manifest)) throw new Error("O manifesto do plugin é inválido.");
    const pluginId = String(manifest.id);
    if (!/^[a-z0-9.-]+$/.test(pluginId)) throw new Error("O id do plugin é inválido.");
    linkPath = path.join(developmentLinksDirectory, `${pluginId}.json`);
    writeFileSync(linkPath, JSON.stringify({ path: sourceDirectory }, null, 2), "utf8");
    const registry = initializePluginRunner();
    const linked = registry.plugins.find(
      (plugin) => plugin.id === pluginId && plugin.source === "local",
    );
    if (!linked) {
      const issue = registry.issues.find(
        (item) => item.directory === sourceDirectory || item.directory === linkPath,
      );
      throw new Error(issue?.message ?? "A pasta não passou pela validação automática.");
    }
    response.status(201).json({ id: pluginId, linked: true });
  } catch (error) {
    if (linkPath) rmSync(linkPath, { force: true });
    initializePluginRunner();
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível vincular o plugin.",
    });
  }
});

function semverCore(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return undefined;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    prerelease: match[4],
  };
}

function isNewerPluginVersion(candidate: string, current: string) {
  const next = semverCore(candidate);
  const previous = semverCore(current);
  if (!next || !previous) return false;
  for (let index = 0; index < next.numbers.length; index += 1) {
    if (next.numbers[index] !== previous.numbers[index]) {
      return next.numbers[index] > previous.numbers[index];
    }
  }
  if (next.prerelease === previous.prerelease) return false;
  if (!next.prerelease) return true;
  if (!previous.prerelease) return false;
  return next.prerelease.localeCompare(previous.prerelease, undefined, { numeric: true }) > 0;
}

let pluginCatalogCache: { catalog: PluginCatalog; loadedAt: number } | undefined;

async function currentPluginCatalog(force = false) {
  if (!force && pluginCatalogCache && Date.now() - pluginCatalogCache.loadedAt < 5 * 60_000)
    return pluginCatalogCache.catalog;
  const catalog = await fetchPluginCatalog(pluginCatalogUrl);
  pluginCatalogCache = { catalog, loadedAt: Date.now() };
  return catalog;
}

app.get("/api/plugins/updates", async (request, response) => {
  try {
    const catalog = await currentPluginCatalog(request.query.refresh === "true");
    const registry = initializePluginRunner();
    const updates = registry.plugins
      .filter((plugin) => plugin.source === "installed")
      .map((plugin) => {
        const available = catalog.plugins.find((entry) => entry.id === plugin.id);
        return {
          id: plugin.id,
          currentVersion: plugin.manifest.version,
          version: available?.version,
          updateAvailable: Boolean(
            available && isNewerPluginVersion(available.version, plugin.manifest.version),
          ),
        };
      });
    response.json({ generatedAt: catalog.generatedAt, updates });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Não foi possível consultar as atualizações.",
    });
  }
});

function replaceInstalledPluginFromDirectory(plugin: RegisteredPlugin, sourceDirectory: string) {
  const installedRoot = path.resolve(installedPluginsDirectory);
  const destination = path.resolve(plugin.absoluteDirectory);
  const updateBackupsDirectory = path.resolve(dataDirectory, "plugins", "update-backups");
  let temporaryDestination: string | undefined;
  let backupDestination: string | undefined;
  let replacementInstalled = false;
  try {
    if (!existsSync(sourceDirectory) || !statSync(sourceDirectory).isDirectory())
      throw new Error("A pasta informada não existe.");
    if (!destination.startsWith(`${installedRoot}${path.sep}`))
      throw new Error("A instalação atual não está dentro do armazenamento autorizado.");
    const source = validatePluginDirectory(sourceDirectory, true);
    if (source.manifest.id !== plugin.id)
      throw new Error("A pasta selecionada pertence a outro plugin.");
    if (!isNewerPluginVersion(source.manifest.version, plugin.manifest.version))
      throw new Error(
        `A atualização precisa ser superior à versão atual v${plugin.manifest.version}.`,
      );

    mkdirSync(installedRoot, { recursive: true });
    mkdirSync(updateBackupsDirectory, { recursive: true });
    temporaryDestination = path.join(installedRoot, `.update-${randomUUID()}`);
    backupDestination = path.join(updateBackupsDirectory, `${plugin.id}-${randomUUID()}`);
    cpSync(sourceDirectory, temporaryDestination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    validatePluginDirectory(temporaryDestination, true);

    renameSync(destination, backupDestination);
    renameSync(temporaryDestination, destination);
    temporaryDestination = undefined;
    replacementInstalled = true;
    const registry = initializePluginRunner();
    const updated = registry.plugins.find(
      (candidate) =>
        candidate.id === plugin.id &&
        candidate.source === "installed" &&
        candidate.manifest.version === source.manifest.version,
    );
    if (!updated) {
      const issue = registry.issues.find((item) => item.directory.includes(plugin.id));
      throw new Error(issue?.message ?? "A nova versão não passou pela validação automática.");
    }
    rmSync(backupDestination, { recursive: true, force: true });
    backupDestination = undefined;
    return {
      id: plugin.id,
      previousVersion: plugin.manifest.version,
      version: source.manifest.version,
    };
  } catch (error) {
    if (temporaryDestination) rmSync(temporaryDestination, { recursive: true, force: true });
    if (replacementInstalled && existsSync(destination))
      rmSync(destination, { recursive: true, force: true });
    if (backupDestination && existsSync(backupDestination))
      renameSync(backupDestination, destination);
    initializePluginRunner();
    throw error;
  }
}

app.put("/api/plugins/:pluginId/update-from-folder", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  if (plugin.source !== "installed") {
    response.status(409).json({
      error: "Plugins vinculados usam a própria pasta e não precisam ser substituídos.",
    });
    return;
  }
  const requestedPath =
    typeof request.body?.path === "string" ? normalizeUserProvidedPath(request.body.path) : "";
  if (!requestedPath) {
    response.status(400).json({ error: "Informe a pasta da nova versão do plugin." });
    return;
  }

  try {
    response.json(replaceInstalledPluginFromDirectory(plugin, path.resolve(requestedPath)));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar o plugin.",
    });
  }
});

app.put("/api/plugins/:pluginId/update-from-catalog", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  if (plugin.source !== "installed") {
    response.status(409).json({
      error: "Plugins vinculados usam a própria pasta e não recebem atualizações do catálogo.",
    });
    return;
  }

  const downloadsRoot = path.resolve(dataDirectory, "plugins", "catalog-downloads");
  mkdirSync(downloadsRoot, { recursive: true });
  const temporaryRoot = mkdtempSync(path.join(downloadsRoot, "update-"));
  try {
    const catalog = await currentPluginCatalog(true);
    const entry = catalog.plugins.find((candidate) => candidate.id === plugin.id);
    if (!entry) throw new Error("Este plugin não possui atualização no catálogo configurado.");
    if (!isNewerPluginVersion(entry.version, plugin.manifest.version))
      throw new Error(`O plugin já está na versão mais recente (v${plugin.manifest.version}).`);

    const archivePath = path.join(temporaryRoot, entry.asset);
    const extractedRoot = path.join(temporaryRoot, "extracted");
    await downloadCatalogPlugin(pluginCatalogUrl, entry, archivePath);
    await extractPluginArchive(archivePath, extractedRoot);
    const directories = discoverPluginDirectories(extractedRoot);
    if (directories.length !== 1) throw new Error("O pacote individual contém plugins extras.");
    response.json(replaceInstalledPluginFromDirectory(plugin, directories[0]));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar o plugin.",
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function pluginMethodDependencies(pluginId: string) {
  const rows = database.prepare("SELECT payload FROM channels").all() as { payload: string }[];
  return findPluginMethodDependencies(parseRows(rows), pluginId);
}

app.get("/api/plugins/:pluginId/dependencies", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  const dependencies = pluginMethodDependencies(plugin.id);
  response.json({ dependencies, historicalOutputsPreserved: true });
});

app.delete("/api/plugins/:pluginId", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  const dependencies = pluginMethodDependencies(plugin.id);
  if (dependencies.length && request.query.confirmDependencies !== "true") {
    response.status(409).json({
      error: "Este plugin ainda é usado por Métodos. Revise as dependências antes de removê-lo.",
      dependencies,
      historicalOutputsPreserved: true,
    });
    return;
  }
  try {
    const connections = pluginConnections.list(plugin.id, true);
    if (plugin.source === "installed") {
      const installedRoot = path.resolve(installedPluginsDirectory);
      if (!plugin.absoluteDirectory.startsWith(`${installedRoot}${path.sep}`)) {
        throw new Error("A pasta instalada não está dentro do armazenamento autorizado.");
      }
      rmSync(plugin.absoluteDirectory, { recursive: true, force: true });
    } else {
      rmSync(path.join(developmentLinksDirectory, `${plugin.id}.json`), { force: true });
    }
    database.transaction(() => {
      database.prepare("DELETE FROM plugin_consents WHERE plugin_id = ?").run(plugin.id);
      database.prepare("DELETE FROM plugin_workspaces WHERE plugin_id = ?").run(plugin.id);
    })();
    for (const connection of connections) {
      for (const secretKey of plugin.manifest.secretKeys ?? []) {
        await deletePluginConnectionSecret(plugin.id, connection.id, secretKey);
      }
    }
    for (const secretKey of plugin.manifest.secretKeys ?? []) {
      await deletePluginSecret(plugin.id, secretKey);
    }
    database.prepare("DELETE FROM plugin_connections WHERE plugin_id = ?").run(plugin.id);
    database.prepare("DELETE FROM plugin_profiles WHERE plugin_id = ?").run(plugin.id);
    initializePluginRunner();
    response.status(204).end();
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível remover o plugin.",
    });
  }
});

app.put("/api/plugins/:pluginId/consent", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado no registro local." });
    return;
  }
  if (!communitySandboxAvailable && request.body?.enabled === true) {
    response.status(426).json({
      error: `A sandbox comunitária exige Node 26; o servidor atual usa Node ${process.versions.node}. Reinicie o aplicativo com a versão correta.`,
    });
    return;
  }
  const enabled = request.body?.enabled === true;
  database
    .prepare(
      `INSERT INTO plugin_consents (plugin_id, version, permissions, network_hosts, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id) DO UPDATE SET
         version = excluded.version,
         permissions = excluded.permissions,
         network_hosts = excluded.network_hosts,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
    .run(
      plugin.id,
      plugin.manifest.version,
      JSON.stringify(plugin.manifest.permissions),
      JSON.stringify(plugin.manifest.networkHosts ?? []),
      enabled ? 1 : 0,
      new Date().toISOString(),
    );
  response.json({ enabled });
});

app.get("/api/plugins/:pluginId/workspace", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  response.json({ path: readPluginWorkspace(plugin.id) ?? "" });
});

app.put("/api/plugins/:pluginId/workspace", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const requestedPath =
    typeof request.body?.path === "string" ? normalizeUserProvidedPath(request.body.path) : "";
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  if (
    !plugin.manifest.permissions.includes("filesystem:read") &&
    !plugin.manifest.permissions.includes("filesystem:write")
  ) {
    response.status(422).json({ error: "Este plugin não declarou acesso a arquivos." });
    return;
  }
  if (!requestedPath) {
    database.prepare("DELETE FROM plugin_workspaces WHERE plugin_id = ?").run(plugin.id);
    response.json({ path: "" });
    return;
  }
  try {
    const directory = path.resolve(requestedPath);
    mkdirSync(directory, { recursive: true });
    if (!statSync(directory).isDirectory()) throw new Error("O caminho não é uma pasta.");
    database
      .prepare(
        `INSERT INTO plugin_workspaces (plugin_id, directory, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(plugin_id) DO UPDATE SET
           directory = excluded.directory,
           updated_at = excluded.updated_at`,
      )
      .run(plugin.id, directory, new Date().toISOString());
    response.json({ path: directory });
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível preparar a pasta.",
    });
  }
});

app.get("/api/plugins/:pluginId/secrets/:secretKey", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const secretKey = request.params.secretKey;
  if (!plugin || !plugin.manifest.secretKeys?.includes(secretKey)) {
    response.status(404).json({ error: "Credencial não declarada pelo plugin." });
    return;
  }
  response.json({ connected: Boolean(await getPluginSecret(plugin.id, secretKey)) });
});

app.put("/api/plugins/:pluginId/secrets/:secretKey", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const secretKey = request.params.secretKey;
  const value = typeof request.body?.value === "string" ? request.body.value : "";
  if (!plugin || !plugin.manifest.secretKeys?.includes(secretKey)) {
    response.status(404).json({ error: "Credencial não declarada pelo plugin." });
    return;
  }
  await setPluginSecret(plugin.id, secretKey, value);
  response.json({ connected: true });
});

app.delete("/api/plugins/:pluginId/secrets/:secretKey", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const secretKey = request.params.secretKey;
  if (!plugin || !plugin.manifest.secretKeys?.includes(secretKey)) {
    response.status(404).json({ error: "Credencial não declarada pelo plugin." });
    return;
  }
  await deletePluginSecret(plugin.id, secretKey);
  response.json({ connected: false });
});

function normalizedConnectionName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 80)
    throw new Error("Informe um nome de conexão com até 80 caracteres.");
  return name;
}

async function migrateLegacyPluginConnection(plugin: {
  id: string;
  manifest: { secretKeys?: string[] };
}) {
  if (pluginConnections.list(plugin.id).length) return;
  const legacySecrets: Record<string, string> = {};
  for (const secretKey of plugin.manifest.secretKeys ?? []) {
    const value = await getPluginSecret(plugin.id, secretKey);
    if (value) legacySecrets[secretKey] = value;
  }
  if (!Object.keys(legacySecrets).length) return;

  const connectionId = randomUUID();
  pluginConnections.create({
    id: connectionId,
    pluginId: plugin.id,
    name: "Conexão principal",
    metadata: { migratedFromLegacy: true },
  });
  try {
    for (const [secretKey, value] of Object.entries(legacySecrets)) {
      await setPluginConnectionSecret(plugin.id, connectionId, secretKey, value);
      if (!(await getPluginConnectionSecret(plugin.id, connectionId, secretKey))) {
        throw new Error("A credencial migrada não pôde ser confirmada no cofre seguro.");
      }
    }
    for (const secretKey of Object.keys(legacySecrets)) {
      await deletePluginSecret(plugin.id, secretKey);
    }
  } catch (error) {
    for (const secretKey of Object.keys(legacySecrets)) {
      await deletePluginConnectionSecret(plugin.id, connectionId, secretKey);
    }
    pluginConnections.remove(plugin.id, connectionId);
    throw error;
  }
}

async function publicPluginConnection(
  plugin: { id: string; manifest: { secretKeys?: string[] } },
  connection: PluginConnection,
) {
  const requiredSecretKeys = plugin.manifest.secretKeys ?? [];
  const connectedSecretKeys: string[] = [];
  for (const secretKey of requiredSecretKeys) {
    if (await getPluginConnectionSecret(plugin.id, connection.id, secretKey)) {
      connectedSecretKeys.push(secretKey);
    }
  }
  return {
    id: connection.id,
    pluginId: connection.pluginId,
    name: connection.name,
    metadata: connection.metadata,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    revokedAt: connection.revokedAt,
    requiredSecretKeys,
    connectedSecretKeys,
    connected: !connection.revokedAt && connectedSecretKeys.length > 0,
  };
}

app.get("/api/plugins/:pluginId/connections", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  try {
    await migrateLegacyPluginConnection(plugin);
    const includeRevoked = request.query.includeRevoked === "true";
    response.json({
      connections: await Promise.all(
        pluginConnections
          .list(plugin.id, includeRevoked)
          .map((connection) => publicPluginConnection(plugin, connection)),
      ),
    });
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível listar as conexões.",
    });
  }
});

app.post("/api/plugins/:pluginId/connections", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  const requiredSecretKeys = plugin.manifest.secretKeys ?? [];
  if (!requiredSecretKeys.length) {
    response.status(409).json({ error: "Este plugin não declara credenciais nomeadas." });
    return;
  }
  let connectionId: string | undefined;
  try {
    const name = normalizedConnectionName(request.body?.name);
    const { values } = normalizeConnectionSecretPatch(requiredSecretKeys, request.body?.secrets);
    connectionId = randomUUID();
    const connection = pluginConnections.create({ id: connectionId, pluginId: plugin.id, name });
    for (const [secretKey, value] of Object.entries(values)) {
      await setPluginConnectionSecret(plugin.id, connectionId, secretKey, value);
    }
    response.status(201).json(await publicPluginConnection(plugin, connection));
  } catch (error) {
    if (connectionId) {
      for (const secretKey of requiredSecretKeys) {
        await deletePluginConnectionSecret(plugin.id, connectionId, secretKey);
      }
      pluginConnections.remove(plugin.id, connectionId);
    }
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível criar a conexão.",
    });
  }
});

app.put("/api/plugins/:pluginId/connections/:connectionId", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  try {
    const connection = pluginConnections.get(plugin.id, request.params.connectionId);
    if (!connection || connection.revokedAt) {
      response.status(404).json({ error: "Conexão ativa não encontrada." });
      return;
    }
    const current = await publicPluginConnection(plugin, connection);
    const hasSecretPatch =
      request.body?.secrets !== undefined || request.body?.removeSecretKeys !== undefined;
    if (hasSecretPatch) {
      const patch = normalizeConnectionSecretPatch(
        plugin.manifest.secretKeys ?? [],
        request.body?.secrets,
        request.body?.removeSecretKeys,
        current.connectedSecretKeys,
      );
      for (const [secretKey, value] of Object.entries(patch.values)) {
        await setPluginConnectionSecret(plugin.id, connection.id, secretKey, value);
      }
      for (const secretKey of patch.removeSecretKeys) {
        await deletePluginConnectionSecret(plugin.id, connection.id, secretKey);
      }
    }
    const updated =
      request.body?.name === undefined
        ? pluginConnections.get(plugin.id, connection.id)!
        : pluginConnections.rename(
            plugin.id,
            connection.id,
            normalizedConnectionName(request.body.name),
          )!;
    response.json(await publicPluginConnection(plugin, updated));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível renomear a conexão.",
    });
  }
});

app.post("/api/plugins/:pluginId/connections/:connectionId/test", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const connection = plugin
    ? pluginConnections.get(plugin.id, request.params.connectionId)
    : undefined;
  if (!plugin || !connection || connection.revokedAt) {
    response.status(404).json({ error: "Conexão ativa não encontrada." });
    return;
  }
  try {
    const secrets: Record<string, string> = {};
    for (const secretKey of plugin.manifest.secretKeys ?? []) {
      const value = await getPluginConnectionSecret(plugin.id, connection.id, secretKey);
      if (value) secrets[secretKey] = value;
    }
    if (!Object.keys(secrets).length) throw new Error("A conexão não possui credenciais.");
    const tested = pluginConnections.updateMetadata(plugin.id, connection.id, {
      ...connection.metadata,
      testedAt: new Date().toISOString(),
      verification: "local-vault",
    })!;
    response.json({ ...(await publicPluginConnection(plugin, tested)), valid: true });
  } catch (error) {
    response.status(422).json({
      valid: false,
      error: error instanceof Error ? error.message : "Não foi possível testar a conexão.",
    });
  }
});

app.delete("/api/plugins/:pluginId/connections/:connectionId", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const connection = plugin
    ? pluginConnections.get(plugin.id, request.params.connectionId)
    : undefined;
  if (!plugin || !connection || connection.revokedAt) {
    response.status(404).json({ error: "Conexão ativa não encontrada." });
    return;
  }
  const rows = database.prepare("SELECT payload FROM channels").all() as { payload: string }[];
  const dependencies = findPluginConnectionDependencies(parseRows(rows), plugin.id, connection.id);
  if (dependencies.length && request.query.confirmDependencies !== "true") {
    response.status(409).json({
      error: "Esta conexão ainda é usada por Métodos. Revise as dependências antes de revogá-la.",
      dependencies,
    });
    return;
  }
  for (const secretKey of plugin.manifest.secretKeys ?? []) {
    await deletePluginConnectionSecret(plugin.id, connection.id, secretKey);
  }
  const revoked = pluginConnections.revoke(plugin.id, connection.id)!;
  response.json(await publicPluginConnection(plugin, revoked));
});

function requireBuilderMcp(request: Request, response: Response, next: NextFunction) {
  if (request.get("authorization") !== `Bearer ${builderMcpToken}`) {
    response.status(401).json({ error: "Sessão MCP local inválida ou expirada." });
    return;
  }
  next();
}

async function builderPluginContexts(): Promise<BuilderPluginContext[]> {
  const registry = initializePluginRunner();
  return Promise.all(
    registry.plugins.map(async (plugin) => ({
      plugin,
      enabled: pluginConsentIsCurrent(plugin),
      connections: await Promise.all(
        pluginConnections.list(plugin.id).map(async (connection) => {
          const publicConnection = await publicPluginConnection(plugin, connection);
          return {
            id: publicConnection.id,
            name: publicConnection.name,
            connected: publicConnection.connected,
          };
        }),
      ),
      profiles: plugin.manifest.profileSetup
        ? profileInventory(plugin).map((profile) => ({
            id: profile.id,
            name: profile.name,
            alias: profile.alias,
          }))
        : [],
    })),
  );
}

function publicBuilderPlugin(entry: BuilderPluginContext) {
  const { manifest } = entry.plugin;
  return {
    id: entry.plugin.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    enabled: entry.enabled,
    executable: entry.plugin.executable && entry.enabled,
    connectionRequired: Boolean(manifest.secretKeys?.length),
    connections: entry.connections,
    profiles: entry.profiles,
    profileSetup: manifest.profileSetup,
    capabilities: manifest.capabilities,
  };
}

function channelCollections(channelId: string) {
  return parseRows(
    database
      .prepare("SELECT payload FROM library_collections WHERE channel_id = ? ORDER BY created_at")
      .all(channelId) as { payload: string }[],
  ) as StrategicCollection[];
}

app.get("/api/builder/mcp-info", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  if (channelId && !readPayload<Channel>("channels", channelId)) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const launch = builderMcpLaunch(channelId);
  response.json({
    available: true,
    transport: "stdio",
    scope: channelId ? "channel" : "workspace",
    channelId,
    config: JSON.stringify(
      {
        mcpServers: {
          contentflow: { command: launch.command, args: launch.args },
        },
      },
      null,
      2,
    ),
  });
});

app.get("/api/builder/channels", requireBuilderMcp, (_request, response) => {
  response.json({
    channels: (storedChannels() as Channel[]).map((channel) => ({
      id: channel.id,
      name: channel.name,
      handle: channel.handle,
      niche: channel.niche,
      language: channel.language,
      configuredProcesses: PROCESS_ORDER.filter(
        (processType) => channel.methods?.[processType]?.blocks?.length,
      ),
    })),
  });
});

app.get("/api/builder/method-contract", requireBuilderMcp, (_request, response) => {
  response.json(BUILDER_METHOD_CONTRACT);
});

app.get(
  "/api/builder/channels/:channelId/context",
  requireBuilderMcp,
  async (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const plugins = await builderPluginContexts();
    response.json({
      channel: {
        id: channel.id,
        name: channel.name,
        handle: channel.handle,
        niche: channel.niche,
        language: channel.language,
        description: channel.description,
        methods: channel.methods,
      },
      collections: channelCollections(channel.id),
      plugins: plugins.map(publicBuilderPlugin),
      contract: BUILDER_METHOD_CONTRACT,
    });
  },
);

app.post(
  "/api/builder/channels/:channelId/validate",
  requireBuilderMcp,
  async (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const result = validateBuilderMethods({
      channel,
      methods: request.body?.methods,
      plugins: await builderPluginContexts(),
      collections: channelCollections(channel.id),
    });
    response.status(result.ok ? 200 : 422).json(result);
  },
);

app.post("/api/builder/channels/:channelId/apply", requireBuilderMcp, async (request, response) => {
  const channel = readPayload<Channel>("channels", String(request.params.channelId));
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const result = validateBuilderMethods({
    channel,
    methods: request.body?.methods,
    plugins: await builderPluginContexts(),
    collections: channelCollections(channel.id),
  });
  if (!result.ok || !result.methods) {
    response.status(422).json(result);
    return;
  }
  for (const [processType, method] of Object.entries(result.methods) as [
    UniversalProcess,
    ProcessMethod,
  ][]) {
    channel.methods[processType] = {
      ...method,
      imageUrl:
        typeof method.imageUrl === "string" &&
        (/^data:image\/(webp|png|jpeg);base64,/.test(method.imageUrl) ||
          /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(method.imageUrl))
          ? method.imageUrl.slice(0, 1_500_000)
          : undefined,
    };
  }
  const dependencyErrors = validateProcessDependencies(
    effectiveProcessOrder(channel),
    channel.methods,
  );
  if (dependencyErrors.length) {
    response.status(422).json({ ok: false, errors: dependencyErrors, warnings: result.warnings });
    return;
  }
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  response.json({
    ok: true,
    channelId: channel.id,
    appliedProcesses: Object.keys(result.methods),
    warnings: result.warnings,
    methods: channel.methods,
  });
});

app.post("/api/execute-block", async (request, response) => {
  const body = request.body as {
    projectId?: string;
    processType?: UniversalProcess;
    blockId?: string;
    pluginId?: string;
    parameters?: Record<string, unknown>;
  };
  if (
    !body.projectId ||
    !body.processType ||
    !PROCESS_ORDER.includes(body.processType) ||
    !body.blockId ||
    !body.pluginId ||
    !body.parameters ||
    typeof body.parameters !== "object" ||
    Array.isArray(body.parameters)
  ) {
    response.status(400).json({ error: "Solicitação de execução inválida." });
    return;
  }

  const plugin = getRegisteredPlugin(body.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado no registro local." });
    return;
  }
  if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
    response.status(403).json({
      error: "Ative este plugin e confirme suas permissões na Central de Plugins.",
    });
    return;
  }

  const project = readPayload<Project>("projects", body.projectId);
  const execution = executionFor(body.projectId, body.processType);
  const channel = project ? readPayload<Channel>("channels", project.channelId) : undefined;
  if (!project || !execution || !channel) {
    response.status(404).json({ error: "Projeto ou execução não encontrados." });
    return;
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === body.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === body.blockId);
  if (!block || !blockExecution) {
    response.status(404).json({ error: "Bloco não encontrado no snapshot desta execução." });
    return;
  }
  const existingJob = pluginJobs.getByExecution(
    execution.id,
    blockExecution.blockId,
    blockExecution.attempt ?? 1,
  );
  if (existingJob) {
    const currentExecution = executionById(execution.id) ?? execution;
    const currentProject = readPayload<Project>("projects", project.id) ?? project;
    const pending = ["starting", "pending", "cancel_requested"].includes(existingJob.status);
    response.status(pending ? 202 : existingJob.status === "completed" ? 200 : 409).json({
      ok: pending || existingJob.status === "completed",
      pending,
      job: publicPluginJob(existingJob),
      execution: currentExecution,
      project: currentProject,
      error: existingJob.error,
    });
    return;
  }
  if (blockExecution.status !== "blocked_executor" || block.plugin?.pluginId !== plugin.id) {
    response.status(409).json({
      error: "Este bloco não está pronto ou não está vinculado ao plugin informado.",
    });
    return;
  }

  const capability = plugin.manifest.capabilities.find(
    (item) => item.id === block.plugin?.capabilityId,
  );
  if (
    !capability ||
    capability.operator !== block.operator ||
    !capability.blockTypes.includes(block.type) ||
    (capability.processTypes && !capability.processTypes.includes(body.processType))
  ) {
    response.status(422).json({ error: "A capacidade não é compatível com este bloco." });
    return;
  }

  const projectExecutions = (
    database
      .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
      .all(project.id) as { payload: string }[]
  ).map((row) => normalizeExecutionDeliveries(JSON.parse(row.payload) as ProcessExecution));
  let conversation: PluginExecutionRequest["conversation"];
  try {
    conversation = resolvePluginConversation({
      block,
      blockExecution,
      execution,
      projectExecutions,
      processOrder: projectProcessOrder(project),
      pluginId: plugin.id,
      supportsContinuation: plugin.manifest.supportsConversationContinuation === true,
      profileSetup: plugin.manifest.profileSetup,
    });
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível resolver a conversa.",
    });
    return;
  }
  const channelProjects = (
    database.prepare("SELECT payload FROM projects WHERE channel_id = ?").all(channel.id) as {
      payload: string;
    }[]
  ).map((row) => JSON.parse(row.payload) as Project);
  const channelExecutions = (
    database
      .prepare(
        `SELECT process_executions.payload
         FROM process_executions
         INNER JOIN projects ON projects.id = process_executions.project_id
         WHERE projects.channel_id = ?`,
      )
      .all(channel.id) as { payload: string }[]
  ).map((row) => normalizeExecutionDeliveries(JSON.parse(row.payload) as ProcessExecution));
  const collections = (
    database
      .prepare("SELECT payload FROM library_collections WHERE channel_id = ?")
      .all(channel.id) as { payload: string }[]
  ).map((row) => JSON.parse(row.payload) as StrategicCollection);
  const libraryItems = (
    database.prepare("SELECT payload FROM library_items WHERE channel_id = ?").all(channel.id) as {
      payload: string;
    }[]
  ).map((row) => JSON.parse(row.payload) as ChannelLibraryItem);
  const resolvedInputs = resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions,
    channelExecutions,
    channelProjects,
    collections,
    libraryItems,
  });
  const missingInputs = resolvedInputs.filter((item) => !item.resolved);
  if (missingInputs.length) {
    response.status(422).json({
      error: `Entradas ausentes: ${missingInputs.map((item) => item.input.label).join(", ")}.`,
    });
    return;
  }

  const usedInputPorts = new Set<string>();
  const assignedInputs = resolvedInputs.map((item) => {
    const port = selectPluginInputPort(item.input, capability.inputPorts, usedInputPorts);
    if (port && !port.multiple) usedInputPorts.add(port.key);
    return { resolved: item, port };
  });
  const unsupportedInputs = assignedInputs.filter((item) => !item.port);
  if (unsupportedInputs.length) {
    response.status(422).json({
      error: `O plugin não aceita: ${unsupportedInputs
        .map((item) => item.resolved.input.label)
        .join(", ")}.`,
    });
    return;
  }
  const inputContract = assignedInputs.map(({ resolved: item, port }) => ({
    id: item.input.id,
    portKey: port?.key ?? item.input.id,
    label: item.input.label,
    type: item.input.type,
    recordFields: item.input.recordFields,
    presentation: item.input.presentation,
  }));
  const inputs = Object.fromEntries(
    capability.inputPorts.flatMap((port) => {
      const assigned = assignedInputs.filter((item) => item.port?.key === port.key);
      if (!assigned.length) return [];
      return [
        [
          port.key,
          composePluginPortValue(
            assigned.map(({ resolved }) => ({
              label: resolved.input.label,
              value: resolved.value ?? null,
            })),
          ),
        ],
      ];
    }),
  ) as Record<string, RuntimeValue>;
  if (block.type === "VALIDAR" && block.validation?.targetBlockId) {
    const targetBlock = execution.methodSnapshot.blocks.find(
      (candidate) => candidate.id === block.validation?.targetBlockId,
    );
    const targetExecution = execution.blocks.find(
      (candidate) => candidate.blockId === block.validation?.targetBlockId,
    );
    const targetOutput =
      targetBlock?.outputs?.find((field) => field.key === block.validation?.targetOutputKey) ??
      targetBlock?.outputs?.[0];
    const targetValue = targetOutput ? targetExecution?.values[targetOutput.key] : undefined;
    const targetPort = targetOutput
      ? capability.inputPorts.find((port) => port.acceptedTypes.includes(targetOutput.type))
      : undefined;
    if (
      targetOutput &&
      targetValue !== undefined &&
      targetPort &&
      inputs[targetPort.key] === undefined
    ) {
      inputs[targetPort.key] = targetValue;
      inputContract.push({
        id: `validation-${targetBlock?.id ?? "target"}-${targetOutput.key}`,
        portKey: targetPort.key,
        label: targetOutput.label,
        type: targetOutput.type,
        recordFields: targetOutput.recordFields,
        presentation: targetOutput.presentation,
      });
    }
  }
  // A plugin receives values only through bindings that are visible in the
  // Method. Outputs from previous blocks and processes must never be inferred
  // into an unbound port or serialized as hidden textual context.
  const selectedCollection =
    block.type === "ESCOLHER"
      ? collections.find((item) => item.id === block.collectionId)
      : undefined;
  const selectedCollectionItems = selectedCollection
    ? libraryItems.filter((item) => item.collectionId === selectedCollection.id)
    : [];
  if (block.type === "ESCOLHER" && (!selectedCollection || !selectedCollectionItems.length)) {
    response.status(422).json({
      error: selectedCollection
        ? "A coleção vinculada ao bloco não possui itens para escolher."
        : "O bloco Escolher precisa estar vinculado a uma coleção do canal.",
    });
    return;
  }

  const invalidOutputBindings = (block.outputs ?? []).filter(
    (field) =>
      field.portKey &&
      !capability.outputPorts.some(
        (port) => port.key === field.portKey && port.producedTypes.includes(field.type),
      ),
  );
  if (invalidOutputBindings.length) {
    response.status(422).json({
      error: `O plugin não consegue entregar: ${invalidOutputBindings
        .map((field) => field.label)
        .join(", ")}. Revise o vínculo da entrega no painel do plugin.`,
    });
    return;
  }

  const outputContract: PluginFieldContract[] =
    block.type === "ESCOLHER"
      ? [
          {
            label: "Item escolhido",
            key: "selectedItemId",
            type: "text",
            required: true,
            portKey: capability.outputPorts[0]?.key ?? "result",
          },
        ]
      : (block.outputs ?? []).map((field) => ({
          label: field.label,
          key: field.key,
          type: field.type,
          required: field.required,
          options: field.options,
          recordFields: field.recordFields,
          presentation: field.presentation,
          portKey:
            field.portKey ??
            capability.outputPorts.find((port) => port.producedTypes.includes(field.type))?.key ??
            capability.outputPorts[0]?.key ??
            field.key,
        }));
  const methodParameterValues = Object.fromEntries(
    (block.parameters ?? []).map((parameter) => [parameter.key, parameter.value]),
  );
  const providedExecutionParameters = body.parameters;
  const executionParameters = {
    ...methodParameterValues,
    ...providedExecutionParameters,
  };
  const resolvedInstruction = resolveInstructionTemplate(block.instructions ?? "", {
    channel: {
      name: channel.name,
      language: channel.language,
      niche: channel.niche,
    },
    project: { title: project.title, deadline: project.deadline },
    block: { name: block.name ?? block.type, type: block.type },
    inputs: assignedInputs.map(({ resolved, port }) => ({
      id: resolved.input.id,
      label: resolved.input.label,
      sourceKey: resolved.resolvedSourceKey ?? resolved.input.sourceKey,
      portKey: port?.key,
      value: resolved.value ?? null,
    })),
    parameters: executionParameters,
  });
  if (resolvedInstruction.unresolved.length) {
    response.status(422).json({
      error: `Variáveis sem valor no prompt: ${resolvedInstruction.unresolved
        .map((variable) => `{{${variable}}}`)
        .join(", ")}. Revise as entradas conectadas ao bloco.`,
    });
    return;
  }
  if (capability.instructionUsage === "required" && !resolvedInstruction.instruction) {
    response.status(422).json({
      error: `Defina o prompt do bloco “${block.name ?? block.type}” antes de executar.`,
    });
    return;
  }
  const referencedInstructionInputIds = new Set(resolvedInstruction.referencedInputIds);
  const instructionContextInputs = Object.fromEntries(
    capability.inputPorts.flatMap((port) => {
      const assigned = assignedInputs.filter((item) => item.port?.key === port.key);
      if (!assigned.length) {
        return inputs[port.key] === undefined ? [] : [[port.key, inputs[port.key]]];
      }
      const unreferenced = assigned.filter(
        (item) => !referencedInstructionInputIds.has(item.resolved.input.id),
      );
      if (!unreferenced.length) return [];
      return [
        [
          port.key,
          composePluginPortValue(
            unreferenced.map(({ resolved }) => ({
              label: resolved.input.label,
              value: resolved.value ?? null,
            })),
          ),
        ],
      ];
    }),
  ) as Record<string, RuntimeValue>;
  let resolvedConnection: Awaited<ReturnType<typeof resolvePluginConnection>>;
  try {
    resolvedConnection = await resolvePluginConnection(plugin, block.plugin.connectionId);
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível carregar a conexão.",
    });
    return;
  }
  const pluginSecrets: Record<string, string> = { ...resolvedConnection.secrets };
  if ((plugin.manifest.secretKeys?.length ?? 0) > 0 && !Object.keys(pluginSecrets).length) {
    response.status(422).json({
      error: "Crie ou associe uma conta local válida a este bloco.",
    });
    return;
  }
  const pluginRequest: PluginExecutionRequest = {
    executionId: execution.id,
    traceId: randomUUID(),
    blockId: block.id,
    capabilityId: capability.id,
    attempt: blockExecution.attempt ?? 1,
    invocation: { mode: "start" },
    configuration: {
      ...block.plugin.configuration,
      ...executionParameters,
    },
    settings: resolvedConnection.connectionId
      ? { connectionId: resolvedConnection.connectionId }
      : {},
    inputs,
    instructionContextInputs,
    inputContract,
    inputDeliveries: resolvedInputs.map((item, index) => ({
      inputId: item.input.id,
      portKey: inputContract[index]?.portKey ?? item.input.id,
      deliveryId: item.sourceDeliveryId,
      itemIds: item.sourceDeliveryItemIds ?? [],
    })),
    outputContract,
    validation: block.validation,
    retryFeedback: blockExecution.retryFeedback,
    resolvedInstruction: instructionWithRetryFeedback(
      resolvedInstruction.instruction,
      blockExecution.retryFeedback,
    ),
    unresolvedInstructionVariables: resolvedInstruction.unresolved,
    conversation,
    context: {
      locale: channel.language || "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: {
        id: channel.id,
        // Channel content is available only through an explicit block input or
        // a placeholder resolved in the block instruction.
        name: "",
        language: "",
        niche: "",
      },
      // The opaque project ID scopes plugin workspaces; its title is content
      // and must be supplied explicitly when a capability needs it.
      project: { id: project.id, title: "" },
      processType: body.processType,
      block: {
        type: block.type,
        name: block.name ?? block.type,
        instructions: block.instructions ?? "",
      },
      selectedCollection: selectedCollection
        ? {
            collectionId: selectedCollection.id,
            items: selectedCollectionItems.map((item) => ({
              id: item.id,
              values: collectionItemValuesForPlugin(selectedCollection, item),
            })),
          }
        : undefined,
    },
  };

  const latestExecution = executionById(execution.id);
  if (!latestExecution) {
    response.status(404).json({ error: "Execução removida." });
    return;
  }
  if (
    latestExecution.status === "cancelled" ||
    (latestExecution.revision ?? 0) !== (execution.revision ?? 0)
  ) {
    response.status(202).json({
      ok: true,
      execution: latestExecution,
      project: readPayload<Project>("projects", project.id),
    });
    return;
  }
  const executionTimeoutMs = capability.execution.defaultTimeoutMs ?? 60_000;
  const requestedRetryScope = blockExecution.itemRetryScope ?? "all";
  const itemCapability =
    requestedRetryScope === "all"
      ? capability
      : capabilityWithDeterministicItemMapping(capability, pluginRequest, blockExecution.values);
  const previousJob =
    ["remaining", "selected"].includes(requestedRetryScope) && pluginRequest.attempt > 1
      ? pluginJobs.getByExecution(execution.id, block.id, pluginRequest.attempt - 1)
      : undefined;
  const resumedOrchestration =
    requestedRetryScope === "remaining" && previousJob
      ? resumedItemOrchestration(itemCapability, pluginRequest, previousJob)
      : requestedRetryScope === "remaining"
        ? resumedItemOrchestrationFromItems(itemCapability, pluginRequest, blockExecution.items)
        : undefined;
  const selectedOrchestration =
    requestedRetryScope === "selected" && blockExecution.itemRetryId
      ? ((previousJob
          ? selectedItemOrchestration(
              itemCapability,
              pluginRequest,
              previousJob,
              blockExecution.itemRetryId,
            )
          : undefined) ??
        selectedItemOrchestrationFromItems(
          itemCapability,
          pluginRequest,
          blockExecution.items,
          blockExecution.itemRetryId,
        ))
      : undefined;
  const itemOrchestration =
    selectedOrchestration ??
    resumedOrchestration ??
    declaredItemOrchestration(itemCapability, pluginRequest);
  const retryScope = selectedOrchestration
    ? "selected"
    : resumedOrchestration
      ? "remaining"
      : "all";
  if (
    ["remaining", "selected"].includes(requestedRetryScope) &&
    !selectedOrchestration &&
    !resumedOrchestration
  ) {
    blockExecution.values = {};
    blockExecution.itemProgress = undefined;
  }
  const pendingJob = createPersistentPluginJob({
    pluginId: plugin.id,
    pluginVersion: plugin.manifest.version,
    request: pluginRequest,
    timeoutMs: executionTimeoutMs,
    profileFallback: orderedProfileCandidates(plugin.manifest, pluginRequest.configuration),
    itemOrchestration,
    retryScope,
  });
  if (selectedOrchestration) pendingJob.partialValues = structuredClone(blockExecution.values);
  const createdJob = pluginJobs.create(pendingJob);
  blockExecution.status = "in_progress";
  blockExecution.traceId = pluginRequest.traceId;
  blockExecution.itemProgress = itemProgressForJob(createdJob);
  blockExecution.items = blockExecutionItemsForJob(createdJob);
  blockExecution.itemRetryScope = undefined;
  blockExecution.itemRetryId = undefined;
  blockExecution.progress = itemOrchestration
    ? (blockExecution.itemProgress?.completed ?? 0) / itemOrchestration.items.length
    : 0;
  blockExecution.progressMessage = "Iniciando job…";
  execution.status = "running";
  persistPluginExecution(execution, project);

  if (capability.execution.mode === "async") {
    void processDuePluginJobs();
    response.status(202).json({
      ok: true,
      pending: true,
      job: publicPluginJob(createdJob),
      execution,
      project,
      values: {},
    });
    return;
  }

  const job = await processPluginJob(createdJob.id, pluginSecrets);
  const currentExecution = executionById(execution.id) ?? execution;
  const currentProject = readPayload<Project>("projects", project.id) ?? project;
  if (!job || ["failed", "abandoned", "cancelled"].includes(job.status)) {
    response.status(job?.status === "cancelled" ? 409 : 422).json({
      error: job?.error ?? job?.message ?? "O job do plugin não pôde ser iniciado.",
      job: job ? publicPluginJob(job) : undefined,
      execution: currentExecution,
      project: currentProject,
    });
    return;
  }
  const pending = ["starting", "pending", "cancel_requested"].includes(job.status);
  response.status(pending ? 202 : 200).json({
    ok: true,
    pending,
    job: publicPluginJob(job),
    execution: currentExecution,
    project: currentProject,
    values: job.partialValues,
  });
});

app.get("/api/youtube/channel", async (request, response) => {
  try {
    const handle = typeof request.query.handle === "string" ? request.query.handle : "";
    response.json(await fetchYouTubeChannel(handle));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível consultar o YouTube.",
    });
  }
});

function stateSnapshot() {
  return database.transaction(() => {
    const read = <T>(table: string) =>
      (
        database.prepare(`SELECT payload FROM ${table} ORDER BY rowid DESC`).all() as {
          payload: string;
        }[]
      ).map((row) => JSON.parse(row.payload) as T);
    return {
      revision: (
        database.prepare("SELECT revision FROM state_clock WHERE id = 1").get() as {
          revision: number;
        }
      ).revision,
      channels: (
        database
          .prepare(
            `SELECT channels.payload FROM channels LEFT JOIN channel_order ON channel_order.channel_id = channels.id
        ORDER BY CASE WHEN channel_order.position IS NULL THEN 1 ELSE 0 END, channel_order.position ASC, channels.created_at DESC`,
          )
          .all() as { payload: string }[]
      ).map((row) => {
        const channel = JSON.parse(row.payload) as Channel;
        channel.activeProjects = (
          database
            .prepare("SELECT COUNT(*) AS count FROM projects WHERE channel_id = ?")
            .get(channel.id) as { count: number }
        ).count;
        return channel;
      }),
      projects: read<Project>("projects"),
      executions: read<ProcessExecution>("process_executions"),
      orchestrators: read<ExecutionOrchestrator>("execution_orchestrators"),
      libraryItems: read<ChannelLibraryItem>("library_items"),
      libraryCollections: read<StrategicCollection>("library_collections"),
    };
  })();
}

app.get("/api/state", (request, response) => {
  const revision = (
    database.prepare("SELECT revision FROM state_clock WHERE id = 1").get() as { revision: number }
  ).revision;
  response.setHeader("Cache-Control", "no-store");
  if (request.query.since === String(revision)) {
    response.status(204).end();
    return;
  }
  response.json(stateSnapshot());
});

const commandSchema = z.object({
  id: z.string().uuid(),
  action: z.enum([
    "start",
    "choose",
    "draft",
    "outputDraft",
    "completeHuman",
    "completeOutput",
    "acceptBlockDelivery",
    "retry",
    "reset",
  ]),
  projectId: z.string().optional(),
  processType: z.enum(PROCESS_ORDER).optional(),
  executionId: z.string().optional(),
  blockId: z.string().optional(),
  itemId: z.string().optional(),
  attempt: z.number().int().positive().optional(),
  retryScope: z.enum(["remaining", "all", "selected"]).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
});

app.post("/api/commands", (request, response) => {
  const parsed = commandSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Comando inválido." });
    return;
  }
  const command = parsed.data;
  try {
    const result = database.transaction(() => {
      const receipt = database
        .prepare("SELECT payload FROM execution_commands WHERE id = ?")
        .get(command.id) as { payload: string } | undefined;
      if (receipt) return JSON.parse(receipt.payload);
      const state = stateSnapshot();
      const execution = state.executions.find((item) => item.id === command.executionId);
      const project = state.projects.find(
        (item) => item.id === (execution?.projectId ?? command.projectId),
      );
      if (!project) throw new Error("Projeto não encontrado.");
      if (command.action !== "start" && command.action !== "reset" && !execution)
        throw new Error("Execução não encontrada.");
      if (command.blockId) {
        const block = execution?.blocks.find((item) => item.blockId === command.blockId);
        if (!block || command.attempt !== (block.attempt ?? 1))
          throw new Error("Esta etapa mudou. Atualize a tela antes de continuar.");
      }
      const engine = executionCommands(state);
      let result: unknown;
      let updated = execution;
      const values = (command.values ?? {}) as Record<string, RuntimeValue>;
      switch (command.action) {
        case "start":
          if (!command.processType) throw new Error("Processo não informado.");
          updated = engine.startProcessExecution(project.id, command.processType);
          if (!updated) throw new Error("Configure o Método antes de executar.");
          project.runThrough = projectProcessOrder(project).at(-1);
          project.runFrom = command.processType;
          result = updated;
          break;
        case "choose":
          result = engine.chooseCollectionItem(
            execution!.id,
            command.blockId ?? "",
            command.itemId ?? "",
          );
          break;
        case "draft":
          result = engine.saveHumanBlockDraft(execution!.id, command.blockId ?? "", values);
          break;
        case "completeHuman":
          result = engine.completeHumanBlock(execution!.id, command.blockId ?? "", values);
          break;
        case "completeOutput":
          result = engine.completeProcessOutput(execution!.id, values);
          break;
        case "acceptBlockDelivery":
          result = engine.acceptBlockDelivery(execution!.id, command.blockId ?? "");
          break;
        case "outputDraft":
          if (execution!.status !== "awaiting_output") {
            result = false;
            break;
          }
          execution!.output = {
            processType: execution!.processType,
            values,
            createdAt: new Date().toISOString(),
          };
          result = true;
          break;
        case "retry":
          result = engine.retryBlockExecution(
            execution!.id,
            command.blockId ?? "",
            command.retryScope ?? "all",
            command.itemId,
          );
          break;
        case "reset": {
          if (!command.processType) throw new Error("Processo não informado.");
          const prior = state.executions.find(
            (item) => item.projectId === project.id && item.processType === command.processType,
          );
          if (prior && !["completed", "cancelled", "failed"].includes(prior.status))
            throw new Error("Cancele a execução antes de reiniciar.");
          if (prior) database.prepare("DELETE FROM process_executions WHERE id = ?").run(prior.id);
          delete project.runThrough;
          project.stages[command.processType] = "not_started";
          project.currentStage = command.processType;
          project.state = "not_started";
          project.progress = completedProcessProgress(project.stages);
          result = true;
          break;
        }
      }
      if (
        result === false ||
        (result && typeof result === "object" && "ok" in result && !result.ok)
      )
        return result;
      if (updated) {
        updated.revision = (updated.revision ?? 0) + 1;
        updated.updatedAt = new Date().toISOString();
        database
          .prepare(
            `INSERT INTO process_executions (id, project_id, process_type, payload, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
          )
          .run(
            updated.id,
            project.id,
            updated.processType,
            JSON.stringify(updated),
            updated.updatedAt,
          );
      }
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
      if (!["draft", "outputDraft"].includes(command.action)) {
        database
          .prepare("INSERT INTO execution_commands (id, payload) VALUES (?, ?)")
          .run(command.id, JSON.stringify(result));
      }
      return result;
    })();
    response.json({ result, state: stateSnapshot() });
    const projectId =
      command.projectId ??
      (command.executionId ? executionById(command.executionId)?.projectId : undefined);
    if (projectId) {
      for (const row of database
        .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
        .all(projectId) as { payload: string }[])
        scheduleAutomaticPluginBlock(JSON.parse(row.payload));
      queueOrchestratorReconciliationForProject(projectId);
    }
    reconcileStandaloneProcesses();
  } catch (error) {
    response.status(409).json({
      error: error instanceof Error ? error.message : "Não foi possível aplicar o comando.",
    });
  }
});

function reconcileStandaloneProcesses() {
  const projects = (
    database
      .prepare(
        "SELECT payload FROM projects WHERE json_extract(payload, '$.runThrough') IS NOT NULL",
      )
      .all() as { payload: string }[]
  ).map((row) => JSON.parse(row.payload) as Project);
  if (!projects.length) return;
  const orchestrators = executionOrchestrators();
  for (const project of projects) {
    if (
      !project.runThrough ||
      orchestrators.some(
        (item) =>
          ACTIVE_ORCHESTRATOR_STATUSES.has(item.status) && item.projectIds.includes(project.id),
      )
    )
      continue;
    const channel = readPayload<Channel>("channels", project.channelId);
    if (!channel) continue;
    const current = executionFor(project.id, project.currentStage);
    if (current && current.status !== "completed") {
      if (current.status === "blocked_executor") scheduleAutomaticPluginBlock(current);
      continue;
    }
    const order = projectProcessOrder(project);
    const next = nextExecutableProcess(order, project.stages, project.runFrom, project.runThrough);
    if (
      !next ||
      !(project.strategySnapshot?.methods[next] ?? channel.methods[next])?.blocks.length
    ) {
      delete project.runThrough;
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
      continue;
    }
    startOrchestratedProcess(project, channel, next);
  }
}

app.get("/api/channels", (_request, response) => {
  const rows = database
    .prepare(
      `SELECT channels.payload
       FROM channels
       LEFT JOIN channel_order ON channel_order.channel_id = channels.id
       ORDER BY
         CASE WHEN channel_order.position IS NULL THEN 1 ELSE 0 END,
         channel_order.position ASC,
         channels.created_at DESC`,
    )
    .all() as { payload: string }[];
  response.json(parseRows(rows));
});

app.get("/api/channels/:id/preferences", (request, response) => {
  const channel = database.prepare("SELECT 1 FROM channels WHERE id = ?").get(request.params.id);
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const stored = database
    .prepare("SELECT project_view AS projectView FROM channel_preferences WHERE channel_id = ?")
    .get(request.params.id) as { projectView: "cards" | "list" } | undefined;
  response.json({ projectView: stored?.projectView ?? "cards" });
});

app.put("/api/channels/:id/preferences", (request, response) => {
  const projectView = request.body?.projectView;
  if (!(["cards", "list"] as const).includes(projectView)) {
    response.status(400).json({ error: "Preferência de visualização inválida." });
    return;
  }
  const channel = database.prepare("SELECT 1 FROM channels WHERE id = ?").get(request.params.id);
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  if (projectView === "cards") {
    database.prepare("DELETE FROM channel_preferences WHERE channel_id = ?").run(request.params.id);
  } else {
    database
      .prepare(
        `INSERT INTO channel_preferences (channel_id, project_view, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET
           project_view = excluded.project_view,
           updated_at = excluded.updated_at`,
      )
      .run(request.params.id, projectView, new Date().toISOString());
  }
  response.json({ projectView });
});

app.post("/api/channels", (request, response) => {
  const channel = request.body as Channel;
  if (!channel?.id || !channel.createdAt) {
    response.status(400).json({ error: "Canal inválido." });
    return;
  }
  if (channel.processOrder !== undefined && !isProcessOrder(channel.processOrder)) {
    response.status(400).json({ error: "Ordem dos Processos inválida." });
    return;
  }
  const dependencyErrors = validateProcessDependencies(
    effectiveProcessOrder(channel),
    channel.methods ?? {},
  );
  if (dependencyErrors.length) {
    response.status(422).json({ error: dependencyErrors[0], errors: dependencyErrors });
    return;
  }
  if (
    typeof channel.methodsImageUrl === "string" &&
    (!(
      /^data:image\/(webp|png|jpeg);base64,/.test(channel.methodsImageUrl) ||
      /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(channel.methodsImageUrl)
    ) ||
      channel.methodsImageUrl.length > 1_500_000)
  ) {
    response.status(400).json({ error: "Capa do Canal inválida." });
    return;
  }
  const insertChannel = database.transaction(() => {
    database.prepare("UPDATE channel_order SET position = position + 1").run();
    database
      .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
      .run(channel.id, JSON.stringify(channel), channel.createdAt);
    database
      .prepare("INSERT INTO channel_order (channel_id, position) VALUES (?, 0)")
      .run(channel.id);
  });
  insertChannel();
  response.status(201).json(channel);
});

app.put("/api/channels/order", (request, response) => {
  const channelIds = (request.body as { channelIds?: unknown })?.channelIds;
  if (
    !Array.isArray(channelIds) ||
    channelIds.some((id) => typeof id !== "string") ||
    new Set(channelIds).size !== channelIds.length
  ) {
    response.status(400).json({ error: "Ordem de canais inválida." });
    return;
  }

  const existingIds = (database.prepare("SELECT id FROM channels").all() as { id: string }[]).map(
    (row) => row.id,
  );
  const requestedIds = channelIds as string[];
  if (
    existingIds.length !== requestedIds.length ||
    existingIds.some((id) => !requestedIds.includes(id))
  ) {
    response.status(409).json({ error: "A lista de canais mudou. Recarregue e tente novamente." });
    return;
  }

  const saveOrder = database.transaction((ids: string[]) => {
    database.prepare("DELETE FROM channel_order").run();
    const insert = database.prepare(
      "INSERT INTO channel_order (channel_id, position) VALUES (?, ?)",
    );
    ids.forEach((id, position) => insert.run(id, position));
  });
  saveOrder(requestedIds);
  response.json({ channelIds: requestedIds });
});

app.put("/api/channels/:id/methods/:processType", (request, response) => {
  const channel = readPayload<Channel>("channels", request.params.id);
  const processType = request.params.processType as UniversalProcess;
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  if (!PROCESS_ORDER.includes(processType) || !Array.isArray(request.body?.blocks)) {
    response.status(400).json({ error: "Método inválido." });
    return;
  }
  if (
    request.body?.definitionRevision !== undefined &&
    request.body.definitionRevision !== (channel.definitionRevision ?? 0)
  ) {
    response.status(409).json({
      error: "A definição do Canal mudou em outra aba. Recarregue antes de salvar o Método.",
    });
    return;
  }
  const nextMethod: ProcessMethod = {
    name:
      typeof request.body?.name === "string" && request.body.name.trim()
        ? request.body.name.trim().slice(0, 200)
        : channel.methods[processType]?.name || `Método de ${PROCESS_META[processType].label}`,
    imageUrl:
      typeof request.body?.imageUrl === "string" &&
      (/^data:image\/(webp|png|jpeg);base64,/.test(request.body.imageUrl) ||
        /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(request.body.imageUrl))
        ? request.body.imageUrl.slice(0, 1_500_000)
        : channel.methods[processType]?.imageUrl,
    processType,
    blocks: normalizeMethodBlocks(request.body.blocks, processType),
  };
  const errors = validateProcessDependencies(
    effectiveProcessOrder(channel),
    { ...channel.methods, [processType]: nextMethod },
    PROCESS_ORDER,
  );
  if (errors.length) {
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  channel.methods[processType] = nextMethod;
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  response.json({
    method: channel.methods[processType],
    definitionRevision: channel.definitionRevision,
  });
});

app.put("/api/channels/:id/methods", (request, response) => {
  const channel = readPayload<Channel>("channels", request.params.id);
  const methods = request.body?.methods as
    Partial<Record<UniversalProcess, ProcessMethod>> | undefined;
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  if (!methods || typeof methods !== "object" || Array.isArray(methods)) {
    response.status(400).json({ error: "Pacote de Métodos inválido." });
    return;
  }
  const entries = Object.entries(methods) as [UniversalProcess, ProcessMethod][];
  if (
    !entries.length ||
    entries.some(
      ([processType, method]) =>
        !PROCESS_ORDER.includes(processType) ||
        method?.processType !== processType ||
        !Array.isArray(method.blocks),
    )
  ) {
    response.status(400).json({ error: "Pacote de Métodos inválido." });
    return;
  }
  for (const [processType, method] of entries) {
    channel.methods[processType] = {
      name:
        typeof method.name === "string" && method.name.trim()
          ? method.name.trim().slice(0, 200)
          : `Método de ${PROCESS_META[processType].label}`,
      imageUrl:
        typeof method.imageUrl === "string" &&
        (/^data:image\/(webp|png|jpeg);base64,/.test(method.imageUrl) ||
          /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(method.imageUrl))
          ? method.imageUrl.slice(0, 1_500_000)
          : undefined,
      processType,
      blocks: normalizeMethodBlocks(method.blocks, processType),
    };
  }
  const errors = validateProcessDependencies(effectiveProcessOrder(channel), channel.methods);
  if (errors.length) {
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  response.json({ methods: channel.methods });
});

app.put("/api/channels/:id/process-order", (request, response) => {
  const channel = readPayload<Channel>("channels", request.params.id);
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const order = request.body?.processOrder;
  if (!isProcessOrder(order)) {
    response.status(400).json({ error: "Ordem dos Processos inválida." });
    return;
  }
  if (request.body?.definitionRevision !== (channel.definitionRevision ?? 0)) {
    response.status(409).json({ error: "A definição do Canal mudou. Recarregue antes de salvar." });
    return;
  }
  const errors = validateProcessDependencies(order, channel.methods);
  if (errors.length) {
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  channel.processOrder = [...order];
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  response.json({
    processOrder: effectiveProcessOrder(channel),
    definitionRevision: channel.definitionRevision,
  });
});

app.post("/api/method-transfers/apply", (request, response) => {
  const body = request.body as {
    targetChannelId?: string;
    sourceChannelId?: string;
    newChannel?: { id?: string; name?: string; methodsImageUrl?: string };
    expectedDefinitionRevision?: number;
    methods?: ProcessMethod[];
    collections?: PortableCollectionV2[];
    itemsIncluded?: boolean;
    items?: PortableLibraryItemV2[];
    preferredOrder?: UniversalProcess[];
    selectedProcesses?: UniversalProcess[];
    preserveLocalConnections?: boolean;
  };
  const selectedProcesses = body.selectedProcesses ?? [];
  if (
    !Array.isArray(body.methods) ||
    !body.methods.length ||
    !Array.isArray(body.collections) ||
    (body.items !== undefined && !Array.isArray(body.items)) ||
    !isProcessOrder(body.preferredOrder) ||
    !Array.isArray(selectedProcesses) ||
    selectedProcesses.some((processType) => !PROCESS_ORDER.includes(processType))
  ) {
    response.status(400).json({ error: "Plano de importação inválido." });
    return;
  }
  const selected = body.methods.filter((method) => selectedProcesses.includes(method.processType));
  if (!selected.length || selected.length !== selectedProcesses.length) {
    response.status(400).json({ error: "Seleção de Métodos inválida." });
    return;
  }

  const existing = body.targetChannelId
    ? readPayload<Channel>("channels", body.targetChannelId)
    : undefined;
  if (body.targetChannelId && !existing) {
    response.status(404).json({ error: "Canal de destino não encontrado." });
    return;
  }
  if (
    existing &&
    body.expectedDefinitionRevision !== undefined &&
    body.expectedDefinitionRevision !== (existing.definitionRevision ?? 0)
  ) {
    response
      .status(409)
      .json({ error: "A definição do Canal mudou. Revise a importação novamente." });
    return;
  }
  if (!existing && (!body.newChannel?.name?.trim() || !body.newChannel?.id)) {
    response.status(400).json({ error: "Novo Canal inválido." });
    return;
  }

  let portableItems: PortableLibraryItemV2[] = [];
  try {
    portableItems = parsePortableLibraryItems(body.items ?? []);
    if (body.itemsIncluded !== true && portableItems.length) {
      response.status(400).json({ error: "Itens enviados sem a opção de compartilhamento ativa." });
      return;
    }
  } catch {
    response.status(400).json({ error: "Itens portáteis inválidos." });
    return;
  }

  const channelId = existing?.id ?? body.newChannel!.id!;
  const createdAt = new Date().toISOString();
  const sourceItems = body.sourceChannelId
    ? (
        database
          .prepare("SELECT payload FROM library_items WHERE channel_id = ?")
          .all(body.sourceChannelId) as { payload: string }[]
      ).map((row) => JSON.parse(row.payload) as ChannelLibraryItem)
    : [];
  const allowedSourceAssetUrls = new Set(
    sourceItems.flatMap((item) =>
      Object.values(item.values).flatMap((value) =>
        value && typeof value === "object" && !Array.isArray(value) && "url" in value
          ? [String((value as StoredFile).url)]
          : [],
      ),
    ),
  );
  const collectionIds = new Map<string, string>();
  const fieldIds = new Map<string, string>();
  const localCollections: StrategicCollection[] = body.collections.map((collection) => {
    const id = `collection-${randomUUID()}`;
    collectionIds.set(collection.key, id);
    return {
      id,
      channelId,
      name: collection.name,
      fields: collection.fields.map((field) => {
        const fieldId = `field-${randomUUID()}`;
        fieldIds.set(`${collection.key}:${field.key}`, fieldId);
        return {
          id: fieldId,
          label: field.label,
          type: field.type,
          required: field.required,
        };
      }),
      createdAt,
    };
  });

  const copied = copyImportedMethods(selected, (prefix) => `${prefix}-${randomUUID()}`, {
    collectionIds,
    preserveLocalConnections: body.preserveLocalConnections === true,
  });
  const finalMethods = existing ? structuredClone(existing.methods) : createEmptyMethods();
  for (const method of copied) finalMethods[method.processType] = method;
  const preferredOrder = existing ? effectiveProcessOrder(existing) : body.preferredOrder;
  const resultOrder = resolveProcessOrderForMethods(preferredOrder, finalMethods);
  if (!resultOrder) {
    response.status(422).json({ error: "As dependências dos Métodos formam um ciclo." });
    return;
  }
  const dependencyErrors = validateProcessDependencies(resultOrder, finalMethods);
  if (dependencyErrors.length) {
    response.status(422).json({ error: dependencyErrors[0], errors: dependencyErrors });
    return;
  }

  const stagedDirectory = mkdtempSync(path.join(dataDirectory, "method-transfer-"));
  const promotedFiles: string[] = [];
  const stagedFiles: Array<{ stagedPath: string; finalPath: string }> = [];
  let stagedBytes = 0;
  const materializePortableValue = (
    value: unknown,
  ): string | number | StoredFile | ThumbnailLayout => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      if (typeof value === "string" || typeof value === "number") return value;
      throw new Error("ITEM_VALUE_INVALID");
    }
    const candidate = value as Partial<StoredFile> & { aspectRatio?: unknown };
    if (candidate.aspectRatio === "16:9") return structuredClone(value) as ThumbnailLayout;
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.mimeType !== "string" ||
      typeof candidate.url !== "string"
    ) {
      throw new Error("ITEM_VALUE_INVALID");
    }
    const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/.exec(candidate.url);
    const localAssetName = /^\/api\/files\/([a-zA-Z0-9._-]+)$/.exec(candidate.url)?.[1];
    const localAssetAllowed = Boolean(
      localAssetName && body.sourceChannelId && allowedSourceAssetUrls.has(candidate.url),
    );
    if (!match && !localAssetAllowed) throw new Error("ITEM_ASSET_NOT_STAGED");
    const mimeType = (match?.[1] ?? candidate.mimeType).trim().toLowerCase();
    let data: Buffer;
    try {
      data = match
        ? Buffer.from(match[2], "base64")
        : readFileSync(path.join(uploadsDirectory, localAssetName!));
    } catch {
      throw new Error("ITEM_ASSET_NOT_STAGED");
    }
    if (!data.length || data.length > maxUploadBytes || activeUploadMimeTypes.has(mimeType)) {
      throw new Error("ITEM_ASSET_INVALID");
    }
    const extension = path
      .extname(candidate.name)
      .replace(/[^a-zA-Z0-9.]/g, "")
      .slice(0, 12)
      .toLowerCase();
    if (activeUploadExtensions.has(extension)) throw new Error("ITEM_ASSET_INVALID");
    const sha256 = createHash("sha256").update(data).digest("hex");
    if (candidate.sha256 && candidate.sha256 !== sha256) throw new Error("ITEM_ASSET_INTEGRITY");
    if (typeof candidate.size === "number" && candidate.size !== data.length) {
      throw new Error("ITEM_ASSET_INTEGRITY");
    }
    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const stagedPath = path.join(stagedDirectory, storedName);
    const finalPath = path.join(uploadsDirectory, storedName);
    writeFileSync(stagedPath, data);
    stagedBytes += data.length;
    stagedFiles.push({ stagedPath, finalPath });
    return {
      id,
      name: path.basename(candidate.name),
      mimeType,
      size: data.length,
      sha256,
      url: `/api/files/${storedName}`,
    };
  };

  let localItems: ChannelLibraryItem[] = [];
  try {
    if (body.itemsIncluded === true) {
      localItems = portableItems.map((item) => {
        const collectionId = collectionIds.get(item.collectionKey);
        if (!collectionId) throw new Error("ITEM_COLLECTION_MISSING");
        const values = Object.fromEntries(
          Object.entries(item.values).map(([portableFieldKey, value]) => {
            const fieldId = fieldIds.get(`${item.collectionKey}:${portableFieldKey}`);
            if (!fieldId) throw new Error("ITEM_FIELD_MISSING");
            return [fieldId, materializePortableValue(value)];
          }),
        );
        return {
          id: `item-${randomUUID()}`,
          channelId,
          collectionId,
          values,
          createdAt: item.createdAt ?? createdAt,
        } as ChannelLibraryItem;
      });
      if (uploadDirectorySize() + stagedBytes > maxUploadStorageBytes) {
        throw new Error("ITEM_ASSET_STORAGE_LIMIT");
      }
    }
  } catch (error) {
    rmSync(stagedDirectory, { recursive: true, force: true });
    const code = error instanceof Error ? error.message : "ITEM_IMPORT_INVALID";
    const messages: Record<string, string> = {
      TOO_MANY_ITEMS: "O pacote possui itens demais para uma única importação.",
      ITEM_COLLECTION_MISSING: "Um item referencia uma coleção ausente do pacote.",
      ITEM_FIELD_MISSING: "Um item referencia um campo ausente do schema portátil.",
      ITEM_VALUE_INVALID: "Um item contém um valor incompatível com a Biblioteca Estratégica.",
      ITEM_ASSET_NOT_STAGED: "Um asset do item não foi incorporado ao pacote.",
      ITEM_ASSET_INVALID: "Um asset do item possui formato ou tamanho não permitido.",
      ITEM_ASSET_INTEGRITY: "A integridade de um asset do item não confere.",
      ITEM_ASSET_STORAGE_LIMIT: `O armazenamento local de uploads atingiu o limite de ${maxUploadStorageGb} GB.`,
    };
    response.status(422).json({ error: messages[code] ?? "Os itens do pacote são inválidos." });
    return;
  }
  const apply = database.transaction(() => {
    let channel: Channel;
    if (existing) {
      const current = readPayload<Channel>("channels", existing.id);
      if (!current || (current.definitionRevision ?? 0) !== (existing.definitionRevision ?? 0)) {
        throw new Error("CHANNEL_REVISION_CONFLICT");
      }
      channel = {
        ...current,
        methods: finalMethods,
        processOrder: resultOrder,
        definitionRevision: (current.definitionRevision ?? 0) + 1,
      };
      database
        .prepare("UPDATE channels SET payload = ? WHERE id = ?")
        .run(JSON.stringify(channel), channel.id);
    } else {
      channel = {
        id: channelId,
        name: body.newChannel!.name!.trim().slice(0, 200),
        handle: "",
        color: "#2563EB",
        subscribers: "—",
        methodsImageUrl: body.newChannel?.methodsImageUrl,
        description: "",
        niche: "",
        language: "PT-BR",
        activeProjects: 0,
        frequency: "1x / semana",
        nextPublish: "",
        currentProjectProgress: 0,
        status: "healthy",
        trend: [],
        methods: finalMethods,
        processOrder: resultOrder,
        definitionRevision: 1,
        createdAt,
      };
      database.prepare("UPDATE channel_order SET position = position + 1").run();
      database
        .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
        .run(channel.id, JSON.stringify(channel), channel.createdAt);
      database
        .prepare("INSERT INTO channel_order (channel_id, position) VALUES (?, 0)")
        .run(channel.id);
    }
    const insertCollection = database.prepare(
      "INSERT INTO library_collections (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const collection of localCollections) {
      insertCollection.run(
        collection.id,
        collection.channelId,
        JSON.stringify(collection),
        collection.createdAt,
      );
    }
    for (const staged of stagedFiles) {
      renameSync(staged.stagedPath, staged.finalPath);
      promotedFiles.push(staged.finalPath);
    }
    const insertItem = database.prepare(
      "INSERT INTO library_items (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const item of localItems) {
      insertItem.run(item.id, item.channelId, JSON.stringify(item), item.createdAt);
    }
    return channel;
  });

  try {
    const channel = apply();
    rmSync(stagedDirectory, { recursive: true, force: true });
    response.status(existing ? 200 : 201).json({
      channel,
      processOrder: resultOrder,
      collections: localCollections,
      items: localItems,
    });
  } catch (error) {
    for (const promoted of promotedFiles) rmSync(promoted, { force: true });
    rmSync(stagedDirectory, { recursive: true, force: true });
    if (error instanceof Error && error.message === "CHANNEL_REVISION_CONFLICT") {
      response
        .status(409)
        .json({ error: "A definição do Canal mudou. Revise a importação novamente." });
      return;
    }
    throw error;
  }
});

app.put("/api/channels/:id", (request, response) => {
  const channel = request.body as Channel;
  if (!channel?.id || channel.id !== request.params.id) {
    response.status(400).json({ error: "Canal inválido." });
    return;
  }
  if (
    typeof channel.methodsImageUrl === "string" &&
    (!(
      /^data:image\/(webp|png|jpeg);base64,/.test(channel.methodsImageUrl) ||
      /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(channel.methodsImageUrl)
    ) ||
      channel.methodsImageUrl.length > 1_500_000)
  ) {
    response.status(400).json({ error: "Capa do Canal inválida." });
    return;
  }
  const current = readPayload<Channel>("channels", channel.id);
  if (current) {
    channel.methods = current.methods;
    channel.processOrder = current.processOrder;
    channel.definitionRevision = current.definitionRevision;
  }
  const result = database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  response.json(channel);
});

app.post("/api/channels/:id/sync-youtube", async (request, response) => {
  const row = database
    .prepare("SELECT payload FROM channels WHERE id = ?")
    .get(request.params.id) as { payload: string } | undefined;

  if (!row) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }

  try {
    const channel = JSON.parse(row.payload) as StoredPayload;
    const profile = await fetchYouTubeChannel(channel.handle ?? "");
    const latest = readPayload<Channel>("channels", request.params.id);
    if (!latest) {
      response.status(404).json({ error: "Canal removido durante a atualização." });
      return;
    }
    const updated = { ...latest, ...profile };
    database
      .prepare("UPDATE channels SET payload = ? WHERE id = ?")
      .run(JSON.stringify(updated), request.params.id);
    response.json(updated);
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar esse canal.",
    });
  }
});

app.delete("/api/channels/:id", (request, response) => {
  const remove = database.transaction((channelId: string) => {
    const projects = database
      .prepare("SELECT id FROM projects WHERE channel_id = ?")
      .all(channelId) as { id: string }[];
    for (const project of projects) {
      for (const row of database
        .prepare("SELECT id FROM process_executions WHERE project_id = ?")
        .all(project.id) as { id: string }[])
        pluginJobs.requestCancellation(row.id);
      database.prepare("DELETE FROM process_executions WHERE project_id = ?").run(project.id);
    }
    database.prepare("DELETE FROM projects WHERE channel_id = ?").run(channelId);
    database.prepare("DELETE FROM library_items WHERE channel_id = ?").run(channelId);
    database.prepare("DELETE FROM library_collections WHERE channel_id = ?").run(channelId);
    database.prepare("DELETE FROM execution_orchestrators WHERE channel_id = ?").run(channelId);
    database.prepare("DELETE FROM channel_preferences WHERE channel_id = ?").run(channelId);
    database.prepare("DELETE FROM channel_order WHERE channel_id = ?").run(channelId);
    return database.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
});

function executionOrchestratorState(orchestrator: ExecutionOrchestrator) {
  const projects = orchestrator.projectIds
    .map((id) => readPayload<Project>("projects", id))
    .filter((project): project is Project => !!project);
  const executions = orchestrator.projectIds.flatMap(
    (projectId) =>
      parseRows(
        database
          .prepare(
            "SELECT payload FROM process_executions WHERE project_id = ? ORDER BY updated_at DESC",
          )
          .all(projectId) as { payload: string }[],
      ) as ProcessExecution[],
  );
  return {
    orchestrator,
    channel: readPayload<Channel>("channels", orchestrator.channelId),
    projects,
    executions,
  };
}

app.get("/api/orchestrators", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  response.json(executionOrchestrators(channelId));
});

app.get("/api/orchestrators/:id/state", (request, response) => {
  const orchestrator = executionOrchestratorById(request.params.id);
  if (!orchestrator) {
    response.status(404).json({ error: "Orquestração não encontrada." });
    return;
  }
  reconcileExecutionOrchestrator(orchestrator.id);
  response.json(executionOrchestratorState(executionOrchestratorById(orchestrator.id)!));
});

app.post("/api/orchestrators/:id/resume", (request, response) => {
  const orchestrator = executionOrchestratorById(request.params.id);
  if (!orchestrator) {
    response.status(404).json({ error: "Orquestração não encontrada." });
    return;
  }
  if (orchestrator.status !== "failed") {
    response.status(409).json({ error: "Somente uma fila com erro pode ser retomada." });
    return;
  }
  const otherActive = executionOrchestrators(orchestrator.channelId).find(
    (item) => item.id !== orchestrator.id && ACTIVE_ORCHESTRATOR_STATUSES.has(item.status),
  );
  if (otherActive) {
    response.status(409).json({ error: "Este canal já possui outra orquestração em andamento." });
    return;
  }
  if (orchestrator.currentProjectId && orchestrator.currentProcessType) {
    const execution = executionFor(orchestrator.currentProjectId, orchestrator.currentProcessType);
    if (execution?.status === "failed") {
      response.status(409).json({
        error: "Corrija ou tente novamente a etapa que falhou antes de retomar a fila.",
      });
      return;
    }
    if (execution?.status === "cancelled") {
      response.status(409).json({
        error: "A execução atual foi cancelada e não pode ser retomada nesta fila.",
      });
      return;
    }
  }

  setExecutionOrchestratorState(orchestrator, {
    status: "running",
    message: "Retomando a fila a partir da última etapa preservada.",
    completedAt: undefined,
    stoppedAt: undefined,
  });
  reconcileExecutionOrchestrator(orchestrator.id);
  response.json(executionOrchestratorState(executionOrchestratorById(orchestrator.id)!));
});

app.post("/api/orchestrators/:id/stop", (request, response) => {
  const orchestrator = executionOrchestratorById(request.params.id);
  if (!orchestrator) {
    response.status(404).json({ error: "Orquestração não encontrada." });
    return;
  }
  if (orchestrator.status === "completed") {
    response.status(409).json({ error: "Uma orquestração concluída não pode ser parada." });
    return;
  }
  if (orchestrator.status === "cancelled") {
    response.json(executionOrchestratorState(orchestrator));
    return;
  }

  const stoppedAt = new Date().toISOString();
  setExecutionOrchestratorState(orchestrator, {
    status: "cancelled",
    message: "Fila interrompida pelo usuário. Os projetos criados foram preservados.",
    stoppedAt,
  });

  if (orchestrator.currentProjectId && orchestrator.currentProcessType) {
    const project = readPayload<Project>("projects", orchestrator.currentProjectId);
    const execution = project
      ? executionFor(orchestrator.currentProjectId, orchestrator.currentProcessType)
      : undefined;
    if (
      project &&
      execution &&
      execution.status !== "completed" &&
      execution.status !== "cancelled"
    ) {
      cancelStoredProcessExecution(execution, project);
    }
  }

  response.json(executionOrchestratorState(executionOrchestratorById(orchestrator.id)!));
});

app.post("/api/orchestrators", (request, response) => {
  const body = request.body as {
    channelId?: string;
    mode?: ExecutionOrchestratorMode;
    quantity?: number;
    projectPrefix?: string;
  };
  const channel = body.channelId ? readPayload<Channel>("channels", body.channelId) : undefined;
  const quantity = Math.trunc(Number(body.quantity));
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  if (body.mode !== "end_to_end" && body.mode !== "batch") {
    response.status(400).json({ error: "Modo de orquestração inválido." });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) {
    response.status(400).json({ error: "Escolha entre 1 e 50 projetos." });
    return;
  }
  const active = executionOrchestrators(channel.id).find((orchestrator) =>
    ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status),
  );
  if (active) {
    response.status(409).json({
      error: "Este canal já possui uma orquestração em andamento.",
      orchestrator: active,
    });
    return;
  }

  const projectPrefix = body.projectPrefix?.trim() || "Produção orquestrada";
  const prepared = prepareExecutionOrchestration({
    channel,
    mode: body.mode,
    quantity,
    projectPrefix,
  });

  database.transaction(() => {
    const insertProject = database.prepare(
      "INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const project of prepared.projects) {
      insertProject.run(project.id, project.channelId, JSON.stringify(project), project.createdAt);
    }
    database
      .prepare("UPDATE channels SET payload = ? WHERE id = ?")
      .run(JSON.stringify(prepared.channel), prepared.channel.id);
    persistExecutionOrchestrator(prepared.orchestrator, true);
  })();
  reconcileExecutionOrchestrator(prepared.orchestrator.id);
  response
    .status(201)
    .json(executionOrchestratorState(executionOrchestratorById(prepared.orchestrator.id)!));
});

app.post("/api/orchestrators/global", (request, response) => {
  const body = request.body as {
    channelIds?: string[];
    mode?: ExecutionOrchestratorMode;
    quantity?: number;
    projectPrefix?: string;
  };
  const channelIds = Array.from(
    new Set((Array.isArray(body.channelIds) ? body.channelIds : []).filter(Boolean)),
  );
  const quantity = Math.trunc(Number(body.quantity));
  if (!channelIds.length) {
    response.status(400).json({ error: "Selecione pelo menos um canal." });
    return;
  }
  if (body.mode !== "end_to_end" && body.mode !== "batch") {
    response.status(400).json({ error: "Modo de orquestração inválido." });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) {
    response.status(400).json({ error: "Escolha entre 1 e 50 projetos por canal." });
    return;
  }

  const channels = channelIds.map((id) => readPayload<Channel>("channels", id));
  if (channels.some((channel) => !channel)) {
    response.status(404).json({ error: "Um dos canais selecionados não existe mais." });
    return;
  }
  const typedChannels = channels as Channel[];
  const busyChannel = typedChannels.find((channel) =>
    executionOrchestrators(channel.id).some((orchestrator) =>
      ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status),
    ),
  );
  if (busyChannel) {
    response.status(409).json({
      error: `${busyChannel.name} já possui uma orquestração em andamento.`,
    });
    return;
  }

  const globalBatchId = randomUUID();
  const projectPrefix = body.projectPrefix?.trim() || "Produção global";
  const prepared = typedChannels.map((channel) =>
    prepareExecutionOrchestration({
      channel,
      mode: body.mode!,
      quantity,
      projectPrefix,
      globalBatchId,
      globalChannelCount: typedChannels.length,
      includeChannelName: true,
    }),
  );

  database.transaction(() => {
    const insertProject = database.prepare(
      "INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    );
    const updateChannel = database.prepare("UPDATE channels SET payload = ? WHERE id = ?");
    for (const item of prepared) {
      for (const project of item.projects) {
        insertProject.run(
          project.id,
          project.channelId,
          JSON.stringify(project),
          project.createdAt,
        );
      }
      updateChannel.run(JSON.stringify(item.channel), item.channel.id);
      persistExecutionOrchestrator(item.orchestrator, true);
    }
  })();

  for (const item of prepared) reconcileExecutionOrchestrator(item.orchestrator.id);
  response.status(201).json({
    globalBatchId,
    orchestrators: prepared.map(
      (item) => executionOrchestratorById(item.orchestrator.id) ?? item.orchestrator,
    ),
  });
});

app.get("/api/projects", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  const rows = channelId
    ? (database
        .prepare("SELECT payload FROM projects WHERE channel_id = ? ORDER BY created_at DESC")
        .all(channelId) as { payload: string }[])
    : (database.prepare("SELECT payload FROM projects ORDER BY created_at DESC").all() as {
        payload: string;
      }[]);
  response.json(parseRows(rows));
});

app.post("/api/projects", (request, response) => {
  const project = request.body as Project;
  if (!project?.id || !project.channelId || !project.createdAt) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
  delete project.strategySnapshot;
  database
    .prepare("INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(project.id, project.channelId, JSON.stringify(project), project.createdAt);
  response.status(201).json(project);
});

app.put("/api/projects/:id", (request, response) => {
  const project = request.body as Project;
  if (!project?.id || project.id !== request.params.id || !project.channelId) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
  const current = readPayload<Project>("projects", project.id);
  if (current?.strategySnapshot) project.strategySnapshot = current.strategySnapshot;
  else delete project.strategySnapshot;
  const result = database
    .prepare("UPDATE projects SET channel_id = ?, payload = ? WHERE id = ?")
    .run(project.channelId, JSON.stringify(project), project.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  response.json(project);
});

app.delete("/api/projects/:id", (request, response) => {
  const activeOrchestrator = executionOrchestrators().find(
    (orchestrator) =>
      ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status) &&
      orchestrator.projectIds.includes(request.params.id),
  );
  if (activeOrchestrator) {
    response.status(409).json({
      error: "Pare a fila do orquestrador antes de excluir um projeto vinculado a ela.",
    });
    return;
  }
  const remove = database.transaction((projectId: string) => {
    for (const row of database
      .prepare("SELECT id FROM process_executions WHERE project_id = ?")
      .all(projectId) as { id: string }[])
      pluginJobs.requestCancellation(row.id);
    database.prepare("DELETE FROM process_executions WHERE project_id = ?").run(projectId);
    return database.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
});

app.get("/api/projects/:id/deliveries", (request, response) => {
  const executions = (
    database
      .prepare(
        "SELECT payload FROM process_executions WHERE project_id = ? ORDER BY updated_at ASC",
      )
      .all(request.params.id) as { payload: string }[]
  ).map((row) => normalizeExecutionDeliveries(JSON.parse(row.payload) as ProcessExecution));
  const includeHistory = request.query.history === "true";
  const deliveries = includeHistory
    ? executions.flatMap((execution) => execution.deliveries ?? [])
    : activeProjectDeliveries(executions);
  response.json({ deliveries });
});

app.get("/api/deliveries/:deliveryId", (request, response) => {
  const rows = database.prepare("SELECT payload FROM process_executions").all() as {
    payload: string;
  }[];
  for (const row of rows) {
    const execution = JSON.parse(row.payload) as ProcessExecution;
    const delivery = activeProjectDeliveries([execution]).find(
      (item) => item.id === request.params.deliveryId,
    );
    if (delivery) {
      response.json({ delivery });
      return;
    }
  }
  response.status(404).json({ error: "Entrega nao encontrada." });
});

app.get("/api/delivery-items/:itemId", (request, response) => {
  const rows = database.prepare("SELECT payload FROM process_executions").all() as {
    payload: string;
  }[];
  for (const row of rows) {
    const execution = JSON.parse(row.payload) as ProcessExecution;
    for (const delivery of activeProjectDeliveries([execution])) {
      const item = delivery.items.find((candidate) => candidate.id === request.params.itemId);
      if (item) {
        response.json({ delivery, item });
        return;
      }
    }
  }
  response.status(404).json({ error: "Item de entrega nao encontrado." });
});

app.get("/api/executions", (request, response) => {
  const projectId =
    typeof request.query.projectId === "string" ? request.query.projectId : undefined;
  const rows = projectId
    ? (database
        .prepare(
          "SELECT payload FROM process_executions WHERE project_id = ? ORDER BY updated_at DESC",
        )
        .all(projectId) as { payload: string }[])
    : (database
        .prepare("SELECT payload FROM process_executions ORDER BY updated_at DESC")
        .all() as { payload: string }[]);
  response.json(parseRows(rows));
});

app.get("/api/executions/:id/state", (request, response) => {
  const projectId = typeof request.query.projectId === "string" ? request.query.projectId : "";
  const processType =
    typeof request.query.processType === "string" ? request.query.processType : "";
  const execution =
    executionById(request.params.id) ||
    (projectId && processType ? executionFor(projectId, processType) : undefined);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  const jobs = pluginJobs.listForExecution(execution.id).map(publicPluginJob);
  response.json({ execution, project, jobs });
});

app.post("/api/executions/:id/cancel", (request, response) => {
  const execution = executionById(request.params.id);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  if (execution.status === "completed") {
    response.status(409).json({ error: "Uma execução concluída não pode ser cancelada." });
    return;
  }
  cancelStoredProcessExecution(execution, project);
  response.status(202).json({ ok: true, execution, project });
});

app.post("/api/executions", (request, response) => {
  const execution = request.body as StoredPayload;
  if (!execution?.id || !execution.projectId || !execution.processType || !execution.updatedAt) {
    response.status(400).json({ error: "Execução inválida." });
    return;
  }
  const project = readPayload<Project>("projects", String(execution.projectId));
  const channel = project && readPayload<Channel>("channels", project.channelId);
  if (project && channel && !project.strategySnapshot) {
    captureProjectStrategy(
      project,
      channel,
      Boolean(
        database
          .prepare("SELECT 1 FROM process_executions WHERE project_id = ? LIMIT 1")
          .get(project.id),
      ),
    );
    if (project.strategySnapshot) {
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
    }
  }
  const existing = executionFor(execution.projectId, execution.processType as UniversalProcess);
  if (existing) {
    response
      .status(409)
      .json({ error: "Este processo já possui uma execução.", execution: existing });
    return;
  }
  database
    .prepare(
      `INSERT INTO process_executions (id, project_id, process_type, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      execution.id,
      execution.projectId,
      execution.processType,
      JSON.stringify(execution),
      execution.updatedAt,
    );
  scheduleAutomaticPluginBlock(execution as unknown as ProcessExecution);
  queueOrchestratorReconciliationForProject(execution.projectId);
  response.status(201).json(execution);
});

app.patch("/api/executions/:id/blocks/:blockId/values", (request, response) => {
  const execution = executionById(request.params.id);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  const revision = Number(request.body?.revision);
  if (!Number.isInteger(revision) || revision !== (execution.revision ?? 0)) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de salvar a edição." });
    return;
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === request.params.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === request.params.blockId);
  if (!block || !blockExecution) {
    response.status(404).json({ error: "Bloco da execução não encontrado." });
    return;
  }
  if (blockExecution.status !== "completed") {
    response.status(409).json({ error: "Aguarde o bloco terminar antes de editar a entrega." });
    return;
  }
  const submitted = request.body?.values;
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    response.status(400).json({ error: "Valores de entrega inválidos." });
    return;
  }
  const allowedKeys = new Set((block.outputs ?? []).map((field) => field.key));
  const unknownKeys = Object.keys(submitted).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    response
      .status(400)
      .json({ error: `Campos de entrega desconhecidos: ${unknownKeys.join(", ")}.` });
    return;
  }
  const values = Object.fromEntries(
    (block.outputs ?? []).map((field) => [field.key, submitted[field.key] ?? null]),
  ) as Record<string, RuntimeValue>;
  const missing = (block.outputs ?? [])
    .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
    .map((field) => field.label);
  const restrictionIssues = (block.outputs ?? []).flatMap((field) => {
    const issue = getPresentationRestrictionIssue(field.presentation, values[field.key]);
    return issue ? [`${field.label}: ${issue}`] : [];
  });
  if (missing.length || restrictionIssues.length) {
    response.status(400).json({
      error: [
        ...(missing.length ? [`Preencha: ${missing.join(", ")}.`] : []),
        ...restrictionIssues,
      ].join(" "),
    });
    return;
  }
  blockExecution.values = structuredClone(values);
  const now = new Date().toISOString();
  blockExecution.completedAt = now;
  recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
  if (execution.outputStatus === "completed") {
    const derived = deriveProcessOutput(execution);
    if (derived) {
      execution.output = derived;
      recordProcessOutputDelivery(execution, derived.values, now);
    }
  }
  persistPluginExecution(execution, project);
  response.json({ execution, project });
});

app.patch("/api/executions/:id/blocks/:blockId/items-order", (request, response) => {
  const execution = executionById(request.params.id);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  const revision = Number(request.body?.revision);
  if (!Number.isInteger(revision) || revision !== (execution.revision ?? 0)) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de reorganizar os itens." });
    return;
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === request.params.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === request.params.blockId);
  const executionItems = blockExecution?.items;
  if (!block || !blockExecution || !executionItems) {
    response.status(404).json({ error: "Itens da execução não encontrados." });
    return;
  }
  if (blockExecution.status === "in_progress") {
    response
      .status(409)
      .json({ error: "Aguarde a execução atual terminar antes de reorganizar os itens." });
    return;
  }
  const itemIds: string[] = Array.isArray(request.body?.itemIds)
    ? request.body.itemIds.filter((item: unknown): item is string => typeof item === "string")
    : [];
  const existingIds = new Set(executionItems.map((item) => item.id));
  if (
    itemIds.length !== executionItems.length ||
    new Set(itemIds).size !== itemIds.length ||
    itemIds.some((itemId) => !existingIds.has(itemId))
  ) {
    response
      .status(400)
      .json({ error: "A nova ordem precisa conter todos os itens uma única vez." });
    return;
  }

  const previousOrder = [...executionItems].sort((left, right) => left.order - right.order);
  const byId = new Map(previousOrder.map((item) => [item.id, item]));
  const reordered = itemIds.map((itemId, order) => {
    const item = byId.get(itemId)!;
    item.order = order;
    return item;
  });
  blockExecution.items = reordered;

  const now = new Date().toISOString();
  const job = pluginJobs.getByExecution(execution.id, block.id, blockExecution.attempt ?? 1);
  if (job?.itemOrchestration) {
    const outputKey = job.request.outputContract.find(
      (field) => field.portKey === job.itemOrchestration!.outputPort,
    )?.key;
    const combinedOutputKey = job.itemOrchestration.combinedOutputPort
      ? job.request.outputContract.find(
          (field) => field.portKey === job.itemOrchestration!.combinedOutputPort,
        )?.key
      : undefined;
    const accumulatedItems = reordered.flatMap((item) => {
      if (item.status !== "completed" || item.output === undefined) return [];
      return Array.isArray(item.output)
        ? (structuredClone(item.output) as RuntimeValue[])
        : [structuredClone(item.output) as RuntimeValue];
    });
    if (outputKey) blockExecution.values[outputKey] = accumulatedItems as RuntimeValue;
    if (combinedOutputKey) {
      blockExecution.values[combinedOutputKey] = accumulatedItems
        .filter((value): value is string => typeof value === "string")
        .join(job.itemOrchestration.separator ?? "\n\n");
    }
    job.itemOrchestration.workItems = structuredClone(reordered);
    job.itemOrchestration.accumulatedItems = structuredClone(accumulatedItems);
    job.partialValues = structuredClone(blockExecution.values);
    job.updatedAt = now;
    database
      .prepare(
        `UPDATE plugin_jobs SET payload = ?, updated_at = ?
         WHERE id = ? AND status NOT IN ('starting', 'pending', 'cancel_requested')`,
      )
      .run(JSON.stringify(job), now, job.id);
  } else {
    const oldIndexById = new Map(previousOrder.map((item, index) => [item.id, index]));
    for (const field of block.outputs ?? []) {
      const value = blockExecution.values[field.key];
      if (!Array.isArray(value) || value.length !== previousOrder.length) continue;
      blockExecution.values[field.key] = reordered.map(
        (item) => structuredClone(value[oldIndexById.get(item.id)!]) as RuntimeValue,
      ) as RuntimeValue;
    }
  }

  recordBlockDeliveries(
    execution,
    block,
    blockExecution.values,
    blockExecution.status === "completed" ? "completed" : "partial",
    now,
  );
  if (execution.outputStatus === "completed") {
    const derived = deriveProcessOutput(execution);
    if (derived) {
      execution.output = derived;
      recordProcessOutputDelivery(execution, derived.values, now);
    }
  }
  persistPluginExecution(execution, project);
  response.json({ execution, project });
});

app.patch("/api/executions/:id/blocks/:blockId/items/:itemId", (request, response) => {
  const execution = executionById(request.params.id);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  const revision = Number(request.body?.revision);
  if (!Number.isInteger(revision) || revision !== (execution.revision ?? 0)) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de alterar este item." });
    return;
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === request.params.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === request.params.blockId);
  const executionItems = blockExecution?.items;
  if (!block || !blockExecution || !executionItems) {
    response.status(404).json({ error: "Item da execução não encontrado." });
    return;
  }
  const item = executionItems.find((candidate) => candidate.id === request.params.itemId);
  if (!item) {
    response.status(404).json({ error: "Item da execução não encontrado." });
    return;
  }
  if (blockExecution.status === "in_progress") {
    response
      .status(409)
      .json({ error: "Aguarde a execução atual terminar antes de alterar o item." });
    return;
  }

  const currentOutput = item.output;
  const submittedOutput = request.body?.output as BlockExecutionItemValue | undefined;
  const unwrapSingle = (value: BlockExecutionItemValue | undefined) =>
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  const currentSingle = unwrapSingle(currentOutput);
  const submittedSingle = unwrapSingle(submittedOutput);
  const currentIsText = typeof currentSingle === "string";
  const currentIsMedia =
    currentSingle &&
    typeof currentSingle === "object" &&
    !Array.isArray(currentSingle) &&
    "mimeType" in currentSingle &&
    typeof currentSingle.mimeType === "string" &&
    /^(image|audio|video)\//.test(currentSingle.mimeType);
  const submittedIsMedia =
    submittedSingle &&
    typeof submittedSingle === "object" &&
    !Array.isArray(submittedSingle) &&
    "mimeType" in submittedSingle &&
    typeof submittedSingle.mimeType === "string" &&
    /^(image|audio|video)\//.test(submittedSingle.mimeType) &&
    "url" in submittedSingle &&
    typeof submittedSingle.url === "string" &&
    submittedSingle.url.startsWith("/api/files/");

  if (currentIsText && typeof submittedSingle !== "string") {
    response.status(400).json({ error: "Este item aceita somente texto." });
    return;
  }
  if (currentIsMedia && !submittedIsMedia) {
    response.status(400).json({ error: "Este item aceita somente imagem, áudio ou vídeo local." });
    return;
  }
  if (!currentIsText && !currentIsMedia) {
    response
      .status(400)
      .json({ error: "Este tipo de item ainda não pode ser alterado manualmente." });
    return;
  }

  const normalizedOutput = Array.isArray(currentOutput)
    ? ([structuredClone(submittedSingle)] as BlockExecutionItemValue)
    : (structuredClone(submittedSingle) as BlockExecutionItemValue);
  const now = new Date().toISOString();
  item.output = normalizedOutput;
  item.status = "completed";
  item.error = undefined;
  const currentAttempt = item.attempts.find((attempt) => attempt.attempt === item.attempt);
  if (currentAttempt) {
    currentAttempt.output = structuredClone(normalizedOutput);
    currentAttempt.status = "completed";
    currentAttempt.error = undefined;
    currentAttempt.completedAt = now;
  } else {
    item.attempts.push({
      attempt: item.attempt,
      status: "completed",
      input: structuredClone(item.input),
      output: structuredClone(normalizedOutput),
      completedAt: now,
    });
  }

  const completedItems = executionItems.filter((candidate) => candidate.status === "completed");
  const failedItem = executionItems.find((candidate) => candidate.status === "failed");
  const activeItem = executionItems.find((candidate) => candidate.status === "in_progress");
  blockExecution.itemProgress = {
    total: executionItems.length,
    completed: completedItems.length,
    pending: Math.max(0, executionItems.length - completedItems.length),
    currentIndex: failedItem?.order ?? activeItem?.order,
    failedIndex: failedItem?.order,
  };

  const job = pluginJobs.getByExecution(execution.id, block.id, blockExecution.attempt ?? 1);
  if (job?.itemOrchestration) {
    const outputKey = job.request.outputContract.find(
      (field) => field.portKey === job.itemOrchestration!.outputPort,
    )?.key;
    const combinedOutputKey = job.itemOrchestration.combinedOutputPort
      ? job.request.outputContract.find(
          (field) => field.portKey === job.itemOrchestration!.combinedOutputPort,
        )?.key
      : undefined;
    const accumulatedItems = executionItems.flatMap((candidate) => {
      if (candidate.status !== "completed" || candidate.output === undefined) return [];
      return Array.isArray(candidate.output)
        ? (structuredClone(candidate.output) as RuntimeValue[])
        : [structuredClone(candidate.output) as RuntimeValue];
    });
    if (outputKey) blockExecution.values[outputKey] = accumulatedItems as RuntimeValue;
    if (combinedOutputKey) {
      blockExecution.values[combinedOutputKey] = accumulatedItems
        .filter((value): value is string => typeof value === "string")
        .join(job.itemOrchestration.separator ?? "\n\n");
    }
    job.itemOrchestration.workItems = structuredClone(executionItems);
    job.itemOrchestration.accumulatedItems = structuredClone(accumulatedItems);
    job.partialValues = structuredClone(blockExecution.values);
    job.updatedAt = now;
    database
      .prepare(
        `UPDATE plugin_jobs SET payload = ?, updated_at = ?
         WHERE id = ? AND status NOT IN ('starting', 'pending', 'cancel_requested')`,
      )
      .run(JSON.stringify(job), now, job.id);
  } else {
    const listOutput = (block.outputs ?? []).find((field) => {
      const value = blockExecution.values[field.key];
      return Array.isArray(value) && value.length === executionItems.length;
    });
    if (listOutput) {
      const values = [...(blockExecution.values[listOutput.key] as RuntimeValue[])];
      values[item.order] = structuredClone(submittedSingle) as RuntimeValue;
      blockExecution.values[listOutput.key] = values as RuntimeValue;
    }
  }

  recordBlockDeliveries(
    execution,
    block,
    blockExecution.values,
    blockExecution.status === "completed" ? "completed" : "partial",
    now,
  );
  if (execution.outputStatus === "completed") {
    const derived = deriveProcessOutput(execution);
    if (derived) {
      execution.output = derived;
      recordProcessOutputDelivery(execution, derived.values, now);
    }
  }
  persistPluginExecution(execution, project);
  response.json({ execution, project });
});

app.put("/api/executions/:id", (request, response) => {
  const execution = request.body as ProcessExecution;
  if (!execution?.id || execution.id !== request.params.id || !execution.updatedAt) {
    response.status(400).json({ error: "Execução inválida." });
    return;
  }
  const current = executionById(execution.id);
  if (!current) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  if (
    (execution.revision ?? 0) !== (current.revision ?? 0) ||
    execution.projectId !== current.projectId ||
    execution.processType !== current.processType ||
    JSON.stringify(execution.methodSnapshot) !== JSON.stringify(current.methodSnapshot) ||
    (current.status === "cancelled" && execution.status !== "cancelled")
  ) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de continuar." });
    return;
  }
  execution.revision = (current.revision ?? 0) + 1;
  const result = database
    .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(execution), execution.updatedAt, execution.id);
  if (result.changes) {
    scheduleAutomaticPluginBlock(execution as unknown as ProcessExecution);
    if (execution.projectId) queueOrchestratorReconciliationForProject(execution.projectId);
  }
  response
    .status(result.changes ? 200 : 404)
    .json(result.changes ? execution : { error: "Execução não encontrada." });
});

app.delete("/api/executions/:id", (request, response) => {
  pluginJobs.requestCancellation(request.params.id);
  const result = database
    .prepare("DELETE FROM process_executions WHERE id = ?")
    .run(request.params.id);
  response.status(result.changes ? 204 : 404).end();
});

app.get("/api/library/collections", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  const rows = channelId
    ? (database
        .prepare(
          "SELECT payload FROM library_collections WHERE channel_id = ? ORDER BY created_at ASC",
        )
        .all(channelId) as { payload: string }[])
    : (database
        .prepare("SELECT payload FROM library_collections ORDER BY created_at ASC")
        .all() as {
        payload: string;
      }[]);
  response.json(parseRows(rows));
});

app.post("/api/library/collections", (request, response) => {
  const collection = request.body as StoredPayload;
  if (
    !collection?.id ||
    !collection.channelId ||
    !collection.name ||
    !collection.createdAt ||
    !Array.isArray(collection.fields) ||
    collection.fields.length === 0
  ) {
    response.status(400).json({ error: "Coleção estratégica inválida." });
    return;
  }
  database
    .prepare(
      "INSERT INTO library_collections (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(collection.id, collection.channelId, JSON.stringify(collection), collection.createdAt);
  response.status(201).json(collection);
});

app.put("/api/library/collections/:id", (request, response) => {
  const collection = request.body as StoredPayload;
  if (
    !collection?.id ||
    collection.id !== request.params.id ||
    !collection.channelId ||
    !collection.name ||
    !collection.createdAt ||
    !Array.isArray(collection.fields) ||
    collection.fields.length === 0
  ) {
    response.status(400).json({ error: "Coleção estratégica inválida." });
    return;
  }
  const result = database
    .prepare("UPDATE library_collections SET channel_id = ?, payload = ? WHERE id = ?")
    .run(collection.channelId, JSON.stringify(collection), collection.id);
  if (!result.changes) {
    response.status(404).json({ error: "Coleção não encontrada." });
    return;
  }
  response.json(collection);
});

app.delete("/api/library/collections/:id", (request, response) => {
  const remove = database.transaction((collectionId: string) => {
    const itemRows = database.prepare("SELECT id, payload FROM library_items").all() as {
      id: string;
      payload: string;
    }[];
    const deleteItem = database.prepare("DELETE FROM library_items WHERE id = ?");
    for (const row of itemRows) {
      const item = JSON.parse(row.payload) as StoredPayload;
      if (item.collectionId === collectionId) deleteItem.run(row.id);
    }
    return database.prepare("DELETE FROM library_collections WHERE id = ?").run(collectionId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
});

app.get("/api/library", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  const rows = channelId
    ? (database
        .prepare("SELECT payload FROM library_items WHERE channel_id = ? ORDER BY created_at DESC")
        .all(channelId) as { payload: string }[])
    : (database.prepare("SELECT payload FROM library_items ORDER BY created_at DESC").all() as {
        payload: string;
      }[]);
  response.json(parseRows(rows));
});

app.post("/api/library", (request, response) => {
  const item = request.body as StoredPayload;
  if (!item?.id || !item.channelId || !item.collectionId || !item.values || !item.createdAt) {
    response.status(400).json({ error: "Item de biblioteca inválido." });
    return;
  }
  database
    .prepare("INSERT INTO library_items (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(item.id, item.channelId, JSON.stringify(item), item.createdAt);
  response.status(201).json(item);
});

app.put("/api/library/:id", (request, response) => {
  const item = request.body as StoredPayload;
  if (!item?.id || item.id !== request.params.id || !item.channelId) {
    response.status(400).json({ error: "Item de biblioteca inválido." });
    return;
  }
  const result = database
    .prepare("UPDATE library_items SET channel_id = ?, payload = ? WHERE id = ?")
    .run(item.channelId, JSON.stringify(item), item.id);
  response
    .status(result.changes ? 200 : 404)
    .json(result.changes ? item : { error: "Item não encontrado." });
});

app.delete("/api/library/:id", (request, response) => {
  const result = database.prepare("DELETE FROM library_items WHERE id = ?").run(request.params.id);
  response.status(result.changes ? 204 : 404).end();
});

const payloadErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({
      error: `O arquivo excede o limite local de ${maxUploadMb} MB.`,
    });
    return;
  }
  next(error);
};

app.use(payloadErrorHandler);

app.listen(port, "127.0.0.1", () => {
  console.log(`ContentFlow API local pronta em http://127.0.0.1:${port}`);
  resumeExecutionOrchestrators();
});

setInterval(resumeExecutionOrchestrators, 2_000).unref();
setInterval(reconcileStandaloneProcesses, 1_000).unref();

function boundedEnvironmentNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function decodeUploadName(value: string | string[] | undefined) {
  try {
    return decodeURIComponent(String(value ?? "arquivo"));
  } catch {
    return "arquivo";
  }
}

function uploadDirectorySize() {
  return directorySize(uploadsDirectory);
}

function directorySize(directory: string, recursive = false): number {
  try {
    return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
      const entryPath = path.join(directory, entry.name);
      if (recursive && entry.isDirectory()) return total + directorySize(entryPath, true);
      if (!entry.isFile()) return total;
      try {
        return total + statSync(entryPath).size;
      } catch {
        return total;
      }
    }, 0);
  } catch {
    return 0;
  }
}
