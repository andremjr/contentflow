import {
  UserDataUpgrade,
  UpgradeError,
  jobHasCurrentContract,
  registerUserDataUpgradeRoutes,
} from "./user-data-upgrade";
import { observeExecution, observeJob } from "./dev-monitor/probes";
import { stateEvents } from "./state-events";
import {
  reportSupportEvent,
  supportRequestDiagnostics,
  supportErrorDiagnostics,
} from "./support-diagnostics";
import { disposeCoreBrowserSessions } from "./plugin-runner";
import { monitorEnabled, devProbe } from "./dev-monitor/client";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { executionCommands } from "./execution-commands";
import { synchronizeExecutionMethod } from "../src/lib/execution-core/synchronize-method";
import { createMethodPackage, readMethodPackage } from "./method-package";
import { fetchMethodCatalog, methodCatalogCompatible, readCatalogMethod } from "./method-catalog";
import {
  copyImportedMethods,
  parsePortableLibraryItems,
  type PortableCollection,
  type PortableLibraryItem,
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
  refreshProjectProcessStrategy,
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
  executionOrchestratorIsActive,
  expandOrchestratorSlots,
  isAggregateOrchestratorStep,
  type ExecutionOrchestrator,
  type ExecutionOrchestratorMode,
  type ExecutionOrchestratorStatus,
} from "../src/lib/execution-orchestrator";
import {
  applyCompletedBlockTransition,
  applyExecutionCancellation,
  applyExecutionProjectProjection,
  applyExecutorBlockCompletion,
  applyValidationOutcome,
  createCanonicalProcessExecution,
  validationOutcomeFromValues,
} from "../src/lib/execution-core";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import type {
  PluginCapability,
  PluginConfigurationOption,
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginFieldContract,
  PluginProfileSetup,
} from "../src/lib/plugin-contract";
import { pluginConnectionRequired } from "../src/lib/plugin-contract";
import {
  configurationOptionsCacheKey,
  parseConfigurationOptionsResponse,
  PluginConfigurationOptionsCache,
} from "./plugin-configuration-options";
import {
  instructionCollectionKey,
  instructionVariables,
  resolveInstructionTemplate,
} from "../src/lib/instruction-template";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { normalizeItemReplacement } from "../src/lib/plugin-item-actions";
import {
  activeProjectDeliveries,
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
import { areValueShapesCompatible } from "../src/lib/data-shape";
import { processMethodV3Schema } from "../src/lib/method-contract-v3";
import { parseCanonicalExecutionCreatePayload } from "./execution-create-boundary";
import { valueShapeSchema } from "../src/lib/value-shape-schema";
import { composePluginPortValue, selectPluginInputPort } from "./plugin-input-values";
import { validatePluginOutputContract } from "./plugin-output-contract";
import { requireNormalizedPluginResponseValues } from "./plugin-response-normalization";
import { instructionWithRetryFeedback } from "../src/lib/retry-feedback";
import { pluginConversationFallbackContext } from "../src/lib/conversation-context";
import { collectionItemValuesForPlugin } from "../src/lib/plugin-collection";
import {
  captureCollectionSelection,
  completedConsumableItemIds,
  libraryReservation,
  libraryValuesIssues,
} from "../src/lib/strategic-library";
import {
  appendPluginDiagnostic,
  createPersistentPluginJob,
  isPluginJobTimedOut,
  type ClaimedPluginJob,
  type PersistentPluginJob,
  PluginJobStore,
} from "./plugin-job-store";
import { exportBrowserDiagnostics } from "./browser-diagnostics";
import { normalizeBlockExecutionWorkUnits } from "./work-unit-normalization";
import { materializeReceivedInputWorkUnits } from "./work-unit-materialization";
import { workItemPolicy } from "./plugin-item-orchestration";
import { registerDerivedWorkItems } from "./work-unit-registration";
import {
  deletePluginConnectionSecret,
  deletePluginSecret,
  getPluginConnectionSecret,
  getPluginSecret,
  setPluginConnectionSecret,
  setPluginSecret,
} from "./credential-vault";
import { orderedProfileCandidates } from "./plugin-account-fallback";
import { decideExecutionRecovery, recoveryProductMessage } from "./execution-recovery-policy";
import {
  aggregateCompatibilityItemOrchestration,
  areRequiredOrchestratedItemsCompleted,
  belongsToSameItemActionGroup,
  blockExecutionItemsForJob,
  canFinalizeFromDurableOrchestratedItems,
  claimOrchestratedItems,
  consolidatedOrchestratedOutputs,
  orchestratedPartialValues,
  completeContinuousSessionClaims,
  completeCurrentOrchestratedItem,
  continuousInvocationRequestForJob,
  declaredItemOrchestration,
  failCurrentOrchestratedItem,
  invocationRequestForJob,
  itemActionRequestForJob,
  itemProgressForJob,
  legacyItemOrchestration,
  deterministicAggregateMapping,
  nextPendingItemIndex,
  publishOrchestratedItemUpdate,
  resumedItemOrchestration,
  resumedItemOrchestrationFromItems,
  releaseContinuousSessionClaims,
  selectedItemOrchestration,
  selectedItemOrchestrationFromItems,
  startCurrentOrchestratedItem,
  usesContinuousItemSession,
} from "./plugin-item-orchestration";
import {
  applyPluginIncrementalItemUpdates,
  incrementalItemValues,
  isCompatiblePluginItemValue,
} from "./plugin-incremental-items";
import {
  findPluginConnectionDependencies,
  findPluginMethodDependencies,
} from "./plugin-dependencies";
import { validatePluginDirectory, validatePluginManifest } from "./plugin-validation";
import {
  runtimeInputBindings,
  runtimeInputsReady,
  validateRuntimeInputValues,
} from "./runtime-input-values";
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
  BrowserProfileStore,
  browserProfileInventory,
  ensureLegacyBrowserProfile,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
  resolveBoundBrowserProfile,
  resolveLegacyBrowserProfile,
} from "./browser-profiles";
import { BrowserProfileLeaseStore } from "./browser-profile-leases";
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
import { formatMigrationRecoveryLog, runSchemaMigrationsForStartup } from "./schema-migrations";
import {
  browserBridgeProfileDirectoryState,
  browserBridgeProfileState,
  stageBrowserBridge,
} from "./browser-profile-readiness";
import { fetchYouTubeChannel } from "./youtube";
import { pluginConcurrencySlot, pluginConcurrencySlotForRequest } from "./plugin-concurrency";
import {
  BUILDER_METHOD_CONTRACT,
  validateBuilderMethods,
  type BuilderPluginContext,
} from "./builder-methods";
import {
  clearImportedProfileAssociations,
  materializeLocalProfileExecution,
  resolveProfileExecutionSnapshot,
  validateLocalProfileExecution,
} from "./profile-execution-policy";
import { materializeProfileLanePool } from "./profile-lane-pool";
import { profileLaneProgressForJob } from "./profile-lane-progress";
import { executeParallelProfileLanes } from "./parallel-profile-executor";

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
  "https://raw.githubusercontent.com/andremjr/plugins-contentflow/main/catalog.json";
const methodCatalogUrl =
  process.env.CONTENTFLOW_METHOD_CATALOG_URL ??
  "https://raw.githubusercontent.com/andremjr/methods-contentflow/main/catalog.json";
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
  const sourceAvailable = existsSync(sourceEntry) && existsSync(tsxEntry);
  const bundled = !sourceAvailable && existsSync(bundledEntry);
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
const schemaMigration = await runSchemaMigrationsForStartup(database, undefined, {
  backupDirectory: path.join(dataDirectory, "migration-backups"),
});
if (!schemaMigration.ok) {
  console.error(formatMigrationRecoveryLog(schemaMigration.diagnostic));
  database.close();
  process.exit(1);
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
const browserProfiles = new BrowserProfileStore(database);
const pluginProfileBindings = new PluginProfileBindingStore(database);
const pluginProfileReadiness = new PluginProfileReadinessStore(database);
const browserProfileLeases = new BrowserProfileLeaseStore(database);
const pluginConfigurationOptionsCache = new PluginConfigurationOptionsCache();
const userDataUpgrade = new UserDataUpgrade(
  database,
  dataDirectory,
  () => activePluginWorkers === 0 && activePluginInvocations.size === 0,
);
if (userDataUpgrade.backgroundAllowed())
  pluginJobs.recoverInterrupted(new Date(), jobHasCurrentContract);
// Expired physical leases are operational state, independent of Method migration.
// This does not reclaim a live lease or replay an interrupted external effect.
browserProfileLeases.recoverExpired();
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
  usage?: "fixed" | "consumable";
  fields?: unknown[];
  values?: Record<string, unknown>;
};

function parseRows(rows: { payload: string }[]) {
  return rows.map((row) => JSON.parse(row.payload));
}

function parseStoredExecution(payload: string): ProcessExecution {
  return JSON.parse(payload) as ProcessExecution;
}

function serializeStoredExecution(execution: ProcessExecution) {
  return JSON.stringify(execution);
}

function readPayload<T>(table: string, id: string): T | undefined {
  const allowedTables = new Set([
    "channels",
    "projects",
    "process_executions",
    "library_collections",
    "library_items",
    "execution_commands",
  ]);
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

if (userDataUpgrade.backgroundAllowed()) reconcileStoredProjectTitles();

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
          const policy =
            capability.execution.itemOrchestration ??
            deterministicAggregateMapping(capability, job.request, blockExecution.values);
          if (!policy) continue;
          const inputItems = job.request.inputs[policy.inputPort];
          if (!Array.isArray(inputItems) || inputItems.length < 2) continue;
          const outputKey =
            job.request.outputContract.find((field) => field.portKey === policy.outputPort)?.key ??
            policy.outputPort;
          const outputs = blockExecution.values[outputKey];
          if (!Array.isArray(outputs) || outputs.length > inputItems.length) continue;
          const migrated = capability.execution.itemOrchestration
            ? legacyItemOrchestration(
                capability,
                job.request,
                structuredClone(outputs) as RuntimeValue[],
                blockExecution.completedAt,
              )
            : aggregateCompatibilityItemOrchestration(
                capability,
                job.request,
                blockExecution.values,
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
      if (changed) updateExecution.run(serializeStoredExecution(execution), execution.id);
    }
  })();
}

function normalizeStoredExecutionWorkUnits() {
  const executionRows = database
    .prepare("SELECT id, payload FROM process_executions")
    .all() as Array<{ id: string; payload: string }>;
  const jobsForBlock = database.prepare(
    "SELECT payload FROM plugin_jobs WHERE execution_id = ? AND block_id = ? ORDER BY attempt ASC, updated_at ASC",
  );
  const updateExecution = database.prepare(
    "UPDATE process_executions SET payload = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of executionRows) {
      const execution = JSON.parse(row.payload) as ProcessExecution;
      let changed = false;
      for (const blockExecution of execution.blocks) {
        const jobs = (
          jobsForBlock.all(execution.id, blockExecution.blockId) as Array<{ payload: string }>
        ).map((jobRow) => JSON.parse(jobRow.payload) as PersistentPluginJob);
        const normalized = normalizeBlockExecutionWorkUnits(blockExecution, jobs);
        if (!normalized.length && !blockExecution.items?.length) continue;
        if (JSON.stringify(normalized) === JSON.stringify(blockExecution.items ?? [])) continue;
        blockExecution.items = normalized;
        if (normalized.length && !blockExecution.itemProgress) {
          const roots = normalized.filter((item) => !item.parentItemId);
          const completed = roots.filter((item) => item.status === "completed").length;
          blockExecution.itemProgress = {
            total: roots.length,
            completed,
            pending: Math.max(0, roots.length - completed),
          };
        }
        changed = true;
      }
      if (changed) updateExecution.run(serializeStoredExecution(execution), execution.id);
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

function executionProfileForPluginRequest(
  plugin: { id: string; manifest: { profileSetup?: PluginProfileSetup } },
  request: PluginExecutionRequest,
) {
  return executionBrowserProfileForPluginRequest(plugin, request)?.profileDirectory;
}

function executionBrowserProfileForPluginRequest(
  plugin: { id: string; manifest: { profileSetup?: PluginProfileSetup } },
  request: PluginExecutionRequest,
) {
  const configurationKey = plugin.manifest.profileSetup?.configurationKey;
  if (!configurationKey) return undefined;
  const alias = String(request.configuration[configurationKey] ?? "").trim();
  if (!alias) return undefined;
  return resolveLegacyBrowserProfile(database, {
    pluginId: plugin.id,
    alias,
    dataDirectory,
  });
}

function persistLocalProfileExecution(blocks: ActionBlock[]) {
  initializePluginRunner();
  const materialized = materializeLocalProfileExecution({
    blocks,
    profileSetupForPlugin: (pluginId) => getRegisteredPlugin(pluginId)?.manifest.profileSetup,
    resolveAlias: (pluginId, alias) => {
      try {
        return {
          profileId: resolveLegacyBrowserProfile(database, { pluginId, alias, dataDirectory })
            .profile.id,
        };
      } catch {
        return undefined;
      }
    },
  });
  const errors: string[] = [];
  const validated = materialized.map((block) => {
    if (!block.plugin || block.plugin.profileExecution === undefined) return block;
    const plugin = getRegisteredPlugin(block.plugin.pluginId);
    const validation = validateLocalProfileExecution({
      policy: block.plugin.profileExecution,
      profileSetup: plugin?.manifest.profileSetup,
      isBoundProfile: (profileId) =>
        Boolean(pluginProfileBindings.get(block.plugin!.pluginId, profileId)),
    });
    if (validation.error) {
      errors.push(`${block.name ?? block.type}: ${validation.error}`);
      return block;
    }
    return validation.policy
      ? { ...block, plugin: { ...block.plugin, profileExecution: validation.policy } }
      : block;
  });
  return { blocks: validated, errors };
}

function resolvedProfileExecutionForBlock(plugin: RegisteredPlugin, block: ActionBlock) {
  const policy = block.plugin?.profileExecution;
  if (!policy) return undefined;
  const setup = plugin.manifest.profileSetup;
  if (!setup)
    throw new Error("Este plugin não declara perfis de navegador para esta política local.");
  return resolveProfileExecutionSnapshot({
    policy,
    configurationKey: setup.configurationKey,
    resolveProfile: (profileId) => {
      try {
        const resolved = resolveBoundBrowserProfile(database, {
          pluginId: plugin.id,
          profileId,
          dataDirectory,
        });
        return {
          profileId: resolved.profile.id,
          alias: resolved.profile.alias,
          readinessState: pluginProfileReadiness.get(plugin.id, resolved.profile.id)?.state,
        };
      } catch {
        return undefined;
      }
    },
  });
}

function activeProfileAliasForJob(plugin: RegisteredPlugin, job: PersistentPluginJob) {
  const configurationKey = plugin.manifest.profileSetup?.configurationKey;
  if (!configurationKey) return undefined;
  if (job.profileExecution) {
    const index = job.profileFallback?.activeIndex ?? 0;
    return job.profileExecution.profiles[index]?.alias;
  }
  if (job.profileFallback)
    return job.profileFallback.candidates[job.profileFallback.activeIndex]?.trim() || undefined;
  return String(job.request.configuration[configurationKey] ?? "").trim() || undefined;
}

function browserProfileForJob(plugin: RegisteredPlugin, job: PersistentPluginJob) {
  if (job.profileExecution) {
    const index = job.profileFallback?.activeIndex ?? 0;
    const snapshot = job.profileExecution.profiles[index];
    if (!snapshot) throw new Error("O perfil ativo não existe no snapshot desta tentativa.");
    const resolved = resolveBoundBrowserProfile(database, {
      pluginId: plugin.id,
      profileId: snapshot.profileId,
      dataDirectory,
    });
    if (resolved.profile.alias !== snapshot.alias) {
      throw new Error("O alias do perfil físico mudou desde que a tentativa foi criada.");
    }
    if (job.browserProfile?.profileId && job.browserProfile.profileId !== snapshot.profileId) {
      throw new Error("O perfil físico deste job divergiu do snapshot da política local.");
    }
    return resolved;
  }
  const alias = activeProfileAliasForJob(plugin, job);
  if (!alias) return undefined;
  const resolved = resolveLegacyBrowserProfile(database, {
    pluginId: plugin.id,
    alias,
    dataDirectory,
  });
  if (job.browserProfile) {
    if (job.browserProfile.profileId !== resolved.profile.id)
      throw new Error("O perfil físico deste job mudou desde que a tentativa foi criada.");
  } else {
    job.browserProfile = { profileId: resolved.profile.id, alias };
  }
  return resolved;
}

function browserProfileSnapshot(plugin: RegisteredPlugin, alias: string | undefined) {
  if (!alias) return undefined;
  const resolved = resolveLegacyBrowserProfile(database, {
    pluginId: plugin.id,
    alias,
    dataDirectory,
  });
  return { profileId: resolved.profile.id, alias: resolved.alias };
}

const BROWSER_PROFILE_LEASE_TTL_MS = 30_000;
const BROWSER_PROFILE_LEASE_HEARTBEAT_MS = 10_000;
const activeJobProfileLeases = new Map<
  string,
  { profileId: string; leaseToken: string; timer: ReturnType<typeof setInterval> }
>();
const activePluginInvocations = new Map<
  string,
  { executionId: string; controller: AbortController }
>();

async function runActivePluginInvocation<T>(
  job: PersistentPluginJob,
  invoke: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  activePluginInvocations.set(job.id, { executionId: job.executionId, controller });
  if (pluginJobs.get(job.id)?.status === "cancel_requested") controller.abort();
  try {
    return await invoke(controller.signal);
  } finally {
    if (activePluginInvocations.get(job.id)?.controller === controller) {
      activePluginInvocations.delete(job.id);
    }
  }
}

async function executeActivePlugin(
  job: PersistentPluginJob,
  ...args: Parameters<typeof executeRegisteredPlugin>
) {
  return runActivePluginInvocation(job, (signal) => {
    const [plugin, request, timeoutMs, secrets, options] = args;
    return executeRegisteredPlugin(plugin, request, timeoutMs, secrets, { ...options, signal });
  });
}

function abortActivePluginInvocations(executionId: string) {
  for (const active of activePluginInvocations.values()) {
    if (active.executionId === executionId) active.controller.abort();
  }
}

function requestPluginExecutionCancellation(executionId: string) {
  const changed = pluginJobs.requestCancellation(executionId);
  abortActivePluginInvocations(executionId);
  return changed;
}

function releaseJobProfileLease(jobId: string) {
  const active = activeJobProfileLeases.get(jobId);
  if (active) {
    clearInterval(active.timer);
    browserProfileLeases.release(active.profileId, active.leaseToken);
    activeJobProfileLeases.delete(jobId);
    return;
  }
  browserProfileLeases.releaseByOwner("job", jobId);
}

function ensureJobProfileLease(plugin: RegisteredPlugin, job: PersistentPluginJob) {
  const resolved = browserProfileForJob(plugin, job);
  const active = activeJobProfileLeases.get(job.id);
  if (!resolved) {
    if (active) releaseJobProfileLease(job.id);
    return true;
  }
  if (active && active.profileId !== resolved.profile.id) releaseJobProfileLease(job.id);

  const acquired = browserProfileLeases.acquire({
    profileId: resolved.profile.id,
    ownerType: "job",
    ownerId: job.id,
    pluginId: plugin.id,
    ttlMs: BROWSER_PROFILE_LEASE_TTL_MS,
  });
  if (!acquired.acquired) return false;

  const current = activeJobProfileLeases.get(job.id);
  if (current?.leaseToken === acquired.lease.leaseToken) return true;
  if (current) clearInterval(current.timer);
  const timer = setInterval(() => {
    const renewed = browserProfileLeases.heartbeat(
      resolved.profile.id,
      acquired.lease.leaseToken,
      new Date(),
      BROWSER_PROFILE_LEASE_TTL_MS,
    );
    if (!renewed) {
      clearInterval(timer);
      activeJobProfileLeases.delete(job.id);
    }
  }, BROWSER_PROFILE_LEASE_HEARTBEAT_MS);
  timer.unref();
  activeJobProfileLeases.set(job.id, {
    profileId: resolved.profile.id,
    leaseToken: acquired.lease.leaseToken,
    timer,
  });
  return true;
}

function executionFor(projectId: string, processType: string) {
  const row = database
    .prepare("SELECT payload FROM process_executions WHERE project_id = ? AND process_type = ?")
    .get(projectId, processType) as { payload: string } | undefined;
  return row ? parseStoredExecution(row.payload) : undefined;
}

function finishPluginBlock(
  execution: ProcessExecution,
  block: ActionBlock,
  blockExecution: BlockExecution,
  values: Record<string, RuntimeValue>,
) {
  const now = new Date().toISOString();
  if (block.type === "ESCOLHER" && block.operator !== "Humano") {
    const collection = readPayload<StrategicCollection>(
      "library_collections",
      block.collectionId ?? "",
    );
    const item = readPayload<ChannelLibraryItem>("library_items", String(values.selectedItemId));
    if (!collection || !item) throw new Error("Item de biblioteca inválido.");
    captureCollectionSelection(execution, block.id, item, collection, storedLibraryExecutions());
  }
  if (block.operator === "Humano") {
    blockExecution.status = "awaiting_human";
    blockExecution.error = undefined;
    blockExecution.progress = undefined;
    blockExecution.progressMessage = undefined;
    execution.status = "awaiting_human";
    execution.updatedAt = now;
    return;
  }
  const completion = applyExecutorBlockCompletion(execution, {
    type: "executor_block_completed",
    blockId: blockExecution.blockId,
    values,
    now,
  });
  if (!completion.ok) {
    throw new Error(
      `Execution Core blocked executor completion: ${completion.decision.reason} (${completion.diagnostics
        .map((diagnostic) => diagnostic.code)
        .join(", ")})`,
    );
  }
  recordBlockDeliveries(execution, block, values, "completed", now);
  if (block.type === "VALIDAR") {
    const validation = applyValidationOutcome(
      execution,
      block.id,
      validationOutcomeFromValues(block, values),
      now,
    );
    if (!validation.ok || validation.outcome !== "approved") {
      execution.updatedAt = now;
      return;
    }
  }
  const transition = applyCompletedBlockTransition(execution, blockExecution.blockId, now, {
    deriveProcessOutput,
    recordProcessOutputDelivery,
  });
  if (!transition.ok) {
    throw new Error(
      `Execution Core blocked transition: ${transition.decision.reason} (${transition.diagnostics
        .map((diagnostic) => diagnostic.code)
        .join(", ")})`,
    );
  }
  execution.updatedAt = now;
}

function observeCommittedExecution(execution: ProcessExecution) {
  if (!monitorEnabled()) return;
  try {
    observeExecution(execution);
    for (const job of pluginJobs.listForExecution(execution.id)) observeJob(job);
  } catch {
    devProbe("core", "execution-persistence").emit({
      kind: "instrumentation.invalid",
      entity: { type: "execution", id: execution.id },
      correlation: { executionId: execution.id },
    });
  }
}

function executionById(executionId: string) {
  const row = database
    .prepare("SELECT payload FROM process_executions WHERE id = ?")
    .get(executionId) as { payload: string } | undefined;
  return row ? parseStoredExecution(row.payload) : undefined;
}

function storedLibraryExecutions() {
  return (
    database.prepare("SELECT payload FROM process_executions").all() as { payload: string }[]
  ).map((row) => parseStoredExecution(row.payload));
}

/** Called inside the same transaction that commits the successful Process. Files stay in snapshots. */
function commitLibraryConsumption(execution: ProcessExecution) {
  for (const id of completedConsumableItemIds(execution)) {
    database.prepare("DELETE FROM library_items WHERE id = ?").run(id);
  }
}

function hasLibraryReservation(itemId: string) {
  return Boolean(libraryReservation(itemId, storedLibraryExecutions()));
}

class PersistenceCommitError extends Error {
  constructor(cause: unknown) {
    super("A transição não pôde ser persistida.", { cause });
  }
}

function persistPluginExecution(execution: ProcessExecution, project: Project) {
  const latestProject = readPayload<Project>("projects", project.id);
  if (latestProject) Object.assign(project, latestProject);
  const currentChannel = readPayload<Channel>("channels", execution.channelId);
  const currentMethod = currentChannel?.methods[execution.processType];
  if (currentMethod) synchronizeExecutionMethod(execution, currentMethod, new Date().toISOString());
  execution.revision = (executionById(execution.id)?.revision ?? 0) + 1;
  execution.updatedAt = new Date().toISOString();
  applyExecutionProjectProjection(project, execution);
  project.updatedAt = "Agora";
  applyGeneratedProjectTitle(project, execution);
  const persist = () => {
    commitLibraryConsumption(execution);
    database
      .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
      .run(serializeStoredExecution(execution), execution.updatedAt, execution.id);
    database
      .prepare("UPDATE projects SET payload = ? WHERE id = ?")
      .run(JSON.stringify(project), project.id);
  };
  try {
    if (database.inTransaction) persist();
    else database.transaction(persist)();
  } catch (error) {
    throw new PersistenceCommitError(error);
  }
  // An outer PluginJobStore.save() owns the commit when called from onSaved.
  // Its caller queues reconciliation only after that commit succeeds.
  if (!database.inTransaction) observeCommittedExecution(execution);
  if (!database.inTransaction) queueOrchestratorReconciliationForProject(execution.projectId);
}

function savePluginJob(
  claim: ClaimedPluginJob,
  job: PersistentPluginJob,
  onSaved?: (saved: PersistentPluginJob) => void,
) {
  let saved: PersistentPluginJob;
  try {
    saved = pluginJobs.save(claim, job, onSaved);
  } catch (error) {
    throw new PersistenceCommitError(error);
  }
  if (onSaved && !database.inTransaction) {
    const execution = executionById(saved.executionId);
    if (execution) {
      observeCommittedExecution(execution);
      queueOrchestratorReconciliationForProject(execution.projectId);
    }
  }
  return saved;
}

function commitPluginJobTransition<T>(projectId: string, apply: () => T): T {
  let result: T;
  try {
    result = database.transaction(apply)();
  } catch (error) {
    throw new PersistenceCommitError(error);
  }
  if (monitorEnabled()) {
    for (const row of database
      .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
      .all(projectId) as { payload: string }[])
      observeCommittedExecution(parseStoredExecution(row.payload));
  }
  queueOrchestratorReconciliationForProject(projectId);
  return result;
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

function automaticPluginBlockReady(block?: ActionBlock, blockExecution?: BlockExecution) {
  if (!block?.plugin) return false;
  const plugin = getRegisteredPlugin(block.plugin.pluginId);
  return Boolean(
    plugin?.executable &&
    pluginConsentIsCurrent(plugin) &&
    runtimeInputsReady(block.inputs, blockExecution?.runtimeInputs),
  );
}

function scheduleAutomaticPluginBlock(execution: ProcessExecution) {
  // Historical jobs are preserved for inspection and are excluded by the
  // compatible-job claim path. A newly scheduled attempt still has the
  // current contract and must be allowed to continue the execution.
  if (!userDataUpgrade.backgroundAllowed()) return;
  if (execution.status !== "blocked_executor") return;
  const blockExecution = execution.blocks.find((item) => item.status !== "completed");
  const block = blockExecution
    ? execution.methodSnapshot.blocks.find((item) => item.id === blockExecution.blockId)
    : undefined;
  if (!blockExecution || blockExecution.status !== "blocked_executor" || !block || !block.plugin) {
    return;
  }
  if (!automaticPluginBlockReady(block, blockExecution)) return;

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
    void executePluginBlockInternal(requestBody)
      .then((result) => {
        if (result.status >= 200 && result.status < 300) return;
        failAutomaticPluginStart(
          executionId,
          blockId,
          typeof result.body.error === "string"
            ? result.body.error
            : "Não foi possível iniciar automaticamente o plugin.",
        );
      })
      .catch((error) => {
        if (error instanceof PersistenceCommitError) {
          console.error("Falha interna de persistência ao iniciar plugin automaticamente:", error);
          return;
        }
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
  const strategyVersion = 5;
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
    plannedSteps: steps,
    quantity,
    projectPrefix: input.projectPrefix,
    projectIds: projects.map((project) => project.id),
    currentStep: 0,
    totalSteps: expandOrchestratorSlots(steps).length,
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
    channel.methods?.[processType] ?? project.strategySnapshot?.methods[processType];
  const parsedMethod = savedMethod ? processMethodV3Schema.safeParse(savedMethod) : undefined;
  const method = parsedMethod?.success
    ? {
        contractVersion: parsedMethod.data.contractVersion,
        name: parsedMethod.data.name || `Método de ${PROCESS_META[processType].label}`,
        imageUrl: parsedMethod.data.imageUrl,
        processType,
        blocks: normalizeMethodBlocks(parsedMethod.data.blocks, processType),
      }
    : undefined;
  const issue =
    parsedMethod && !parsedMethod.success
      ? parsedMethod.error.issues[0]?.message
      : getMethodConfigurationIssue(method);
  if (!method || issue) return { issue: issue ?? "O método deste processo não está disponível." };

  const now = new Date().toISOString();
  const creation = createCanonicalProcessExecution({
    executionId: randomUUID(),
    projectId: project.id,
    channelId: channel.id,
    processType,
    methodSnapshot: method,
    now,
  });
  if (!creation.ok) return { issue: "O método deste processo não está disponível." };
  const execution = creation.execution;
  applyExecutionProjectProjection(project, execution);
  project.updatedAt = "Agora";

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO process_executions (id, project_id, process_type, payload, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        execution.id,
        execution.projectId,
        processType,
        serializeStoredExecution(execution),
        now,
      );
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

function executionSlotState(execution: ProcessExecution) {
  if (execution.status === "completed") return "completed" as const;
  if (execution.status === "cancelled") return "cancelled" as const;
  if (execution.status === "awaiting_human" || execution.status === "awaiting_output") {
    return "awaiting_human" as const;
  }
  if (execution.status === "failed") return "failed" as const;
  if (execution.status === "blocked_executor") {
    const activeBlockExecution = execution.blocks.find((item) => item.status !== "completed");
    const activeBlock = activeBlockExecution
      ? execution.methodSnapshot.blocks.find((item) => item.id === activeBlockExecution.blockId)
      : undefined;
    if (
      activeBlock &&
      runtimeInputBindings(activeBlock.inputs).length &&
      !runtimeInputsReady(activeBlock.inputs, activeBlockExecution?.runtimeInputs)
    ) {
      return "awaiting_human" as const;
    }
    return automaticPluginBlockReady(activeBlock, activeBlockExecution)
      ? ("running" as const)
      : ("blocked" as const);
  }
  return "running" as const;
}

function executionSlotDependenciesReady(
  orchestrator: ExecutionOrchestrator,
  project: Project,
  processType: UniversalProcess,
) {
  const order =
    project.strategySnapshot?.processOrder ?? orchestrator.processOrder ?? PROCESS_ORDER;
  const index = order.indexOf(processType);
  if (index <= 0) return index === 0;
  return order
    .slice(0, index)
    .every((previousProcess) => executionFor(project.id, previousProcess)?.status === "completed");
}

function reconcileEligibleSlotOrchestrator(orchestrator: ExecutionOrchestrator, channel: Channel) {
  const steps =
    orchestrator.plannedSteps ??
    buildOrchestratorSteps(
      orchestrator.projectIds,
      orchestrator.mode,
      5,
      orchestrator.processOrder,
    );
  const slots = expandOrchestratorSlots(steps);
  const completedCount = () =>
    slots.filter((slot) => executionFor(slot.projectId, slot.processType)?.status === "completed")
      .length;
  const updateCurrent = (slot: (typeof slots)[number], patch: Partial<ExecutionOrchestrator>) =>
    setExecutionOrchestratorState(orchestrator, {
      currentStep: completedCount(),
      totalSteps: slots.length,
      currentProjectId: slot.projectId,
      currentProcessType: slot.processType,
      currentBatchItem: slot.batchItem,
      currentBatchTotal: slot.batchTotal,
      ...patch,
    });

  for (const slot of slots) {
    const execution = executionFor(slot.projectId, slot.processType);
    if (!execution) continue;
    const state = executionSlotState(execution);
    if (state === "cancelled") {
      updateCurrent(slot, {
        status: "cancelled",
        message: "A execução atual foi cancelada.",
      });
      return;
    }
    if (state !== "running") continue;
    if (execution.status === "blocked_executor") scheduleAutomaticPluginBlock(execution);
    const project = readPayload<Project>("projects", slot.projectId);
    updateCurrent(slot, {
      status: "running",
      message: project
        ? (execution.error ?? orchestrationMessage("running", project, slot.processType))
        : "Executando a próxima etapa elegível.",
    });
    return;
  }

  const parked: Array<{
    slot: (typeof slots)[number];
    status: "awaiting_human" | "blocked" | "failed";
    message?: string;
  }> = [];

  for (const slot of slots) {
    let execution = executionFor(slot.projectId, slot.processType);
    if (execution?.status === "completed") continue;
    if (execution) {
      const state = executionSlotState(execution);
      if (state === "awaiting_human" || state === "blocked" || state === "failed") {
        const project = readPayload<Project>("projects", slot.projectId);
        parked.push({
          slot,
          status: state,
          message:
            execution.error ??
            (project ? orchestrationMessage(state, project, slot.processType) : undefined),
        });
      }
      continue;
    }

    const project = readPayload<Project>("projects", slot.projectId);
    if (!project) {
      updateCurrent(slot, {
        status: "failed",
        message: "Um projeto da orquestração não existe mais.",
      });
      return;
    }
    if (!executionSlotDependenciesReady(orchestrator, project, slot.processType)) continue;

    const started = startOrchestratedProcess(project, channel, slot.processType);
    if (!started.execution) {
      parked.push({
        slot,
        status: "blocked",
        message: started.issue,
      });
      continue;
    }
    execution = started.execution;
    const state = executionSlotState(execution);
    if (state === "completed") continue;
    if (state === "cancelled") {
      updateCurrent(slot, {
        status: "cancelled",
        message: "A execução atual foi cancelada.",
      });
      return;
    }
    if (state === "awaiting_human" || state === "blocked" || state === "failed") {
      parked.push({
        slot,
        status: state,
        message: execution.error ?? orchestrationMessage(state, project, slot.processType),
      });
      continue;
    }
    updateCurrent(slot, {
      status: "running",
      message: execution.error ?? orchestrationMessage("running", project, slot.processType),
    });
    return;
  }

  const completed = completedCount();
  if (completed === slots.length) {
    setExecutionOrchestratorState(orchestrator, {
      currentStep: completed,
      totalSteps: slots.length,
      status: "completed",
      currentProjectId: undefined,
      currentProcessType: undefined,
      currentBatchItem: undefined,
      currentBatchTotal: undefined,
      message: "Todos os projetos da orquestração foram concluídos.",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const waiting = parked[0];
  if (waiting) {
    updateCurrent(waiting.slot, {
      status: waiting.status,
      message: waiting.message,
    });
    return;
  }

  setExecutionOrchestratorState(orchestrator, {
    currentStep: completed,
    totalSteps: slots.length,
    status: "blocked",
    currentProjectId: undefined,
    currentProcessType: undefined,
    currentBatchItem: undefined,
    currentBatchTotal: undefined,
    message: "Nenhum slot da fila está elegível para execução neste momento.",
  });
}

function reconcileExecutionOrchestrator(id: string) {
  if (!userDataUpgrade.backgroundAllowed()) return;
  if (orchestratorReconciliationLocks.has(id)) return;
  orchestratorReconciliationLocks.add(id);
  try {
    const orchestrator = executionOrchestratorById(id);
    if (!orchestrator || !executionOrchestratorIsActive(orchestrator)) return;
    const channel = readPayload<Channel>("channels", orchestrator.channelId);
    if (!channel) {
      setExecutionOrchestratorState(orchestrator, {
        status: "failed",
        message: "O canal desta orquestração não existe mais.",
      });
      return;
    }
    if (orchestrator.strategyVersion === 5) {
      reconcileEligibleSlotOrchestrator(orchestrator, channel);
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
          const status = executionSlotState(execution) as ExecutionOrchestratorStatus;
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

      const status = executionSlotState(execution) as ExecutionOrchestratorStatus;
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
      executionOrchestratorIsActive(orchestrator) &&
      orchestrator.projectIds.includes(projectId)
    ) {
      queueOrchestratorReconciliation(orchestrator.id);
    }
  }
}

function cancelStoredProcessExecution(execution: ProcessExecution, project: Project) {
  const cancellation = applyExecutionCancellation(execution, {
    type: "execution_cancellation_requested",
  });
  if (!cancellation.ok || cancellation.outcome === "already_cancelled") return cancellation;

  delete project.runThrough;
  delete project.runFrom;
  execution.revision = (execution.revision ?? 0) + 1;
  execution.updatedAt = new Date().toISOString();
  applyExecutionProjectProjection(project, execution);
  project.updatedAt = "Agora";
  database.transaction(() => {
    pluginJobs.requestCancellation(execution.id);
    database
      .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
      .run(serializeStoredExecution(execution), execution.updatedAt, execution.id);
    database
      .prepare("UPDATE projects SET payload = ? WHERE id = ?")
      .run(JSON.stringify(project), project.id);
  })();
  abortActivePluginInvocations(execution.id);
  observeCommittedExecution(execution);
  void processDuePluginJobs();
  return cancellation;
}

function resumeExecutionOrchestrators() {
  for (const orchestrator of executionOrchestrators()) {
    if (executionOrchestratorIsActive(orchestrator)) {
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

// Saving a Method and updating open executions is one transaction, on every write surface.
function persistChannelDefinition(channel: Channel) {
  return database.transaction(() => {
    const now = new Date().toISOString();
    const projects = (
      database.prepare("SELECT payload FROM projects WHERE channel_id = ?").all(channel.id) as {
        payload: string;
      }[]
    ).map((row) => JSON.parse(row.payload) as Project);
    const projectIds = new Set(projects.map((project) => project.id));
    const executions = (
      database.prepare("SELECT payload FROM process_executions").all() as { payload: string }[]
    )
      .map((row) => parseStoredExecution(row.payload))
      .filter((execution) => projectIds.has(execution.projectId));
    for (const execution of executions) {
      const method = channel.methods[execution.processType];
      if (!method || !synchronizeExecutionMethod(execution, method, now)) continue;
      database
        .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(execution), execution.updatedAt, execution.id);
    }
    for (const project of projects) {
      if (!project.strategySnapshot) continue;
      for (const processType of PROCESS_ORDER) {
        if (["done", "approved"].includes(project.stages[processType])) continue;
        project.strategySnapshot.methods[processType] = structuredClone(
          channel.methods[processType],
        );
      }
      project.strategySnapshot.definitionRevision = channel.definitionRevision ?? 0;
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
    }
    return database
      .prepare("UPDATE channels SET payload = ? WHERE id = ?")
      .run(JSON.stringify(channel), channel.id);
  })();
}

function normalizedPluginValues(
  block: ActionBlock,
  responseValues: unknown,
  outputContract: PluginFieldContract[],
  completion: "partial" | "final",
  valueShape: "snapshot" | "item" = "snapshot",
  existingValues?: Record<string, RuntimeValue>,
  inputDeliveries?: PluginExecutionRequest["inputDeliveries"],
) {
  return requireNormalizedPluginResponseValues({
    block,
    responseValues,
    outputContract,
    completion,
    valueShape,
    existingValues,
    inputDeliveries,
  }).values;
}

function liveJobOutputContract(block: ActionBlock, capability: PluginCapability) {
  const validation = validatePluginOutputContract(block.outputs ?? [], capability.outputPorts);
  if (validation.unsupportedFields.length) {
    throw new Error("Revise o vínculo da entrega no painel do plugin.");
  }
  return validation.outputContract;
}

function declaredItemActionForBlock(block: ActionBlock, action: string) {
  if (!block.plugin) return undefined;
  initializePluginRunner();
  const plugin = getRegisteredPlugin(block.plugin.pluginId);
  const capability = plugin?.manifest.capabilities.find(
    (candidate) => candidate.id === block.plugin?.capabilityId,
  );
  const declaration = capability?.itemActions?.find((candidate) => candidate.action === action);
  return plugin && capability && declaration ? { plugin, capability, declaration } : undefined;
}

function persistCompletedPluginJob(job: PersistentPluginJob, now: string) {
  job.updatedAt = now;
  database
    .prepare(
      `UPDATE plugin_jobs SET payload = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('starting', 'pending', 'cancel_requested')`,
    )
    .run(JSON.stringify(job), now, job.id);
}

function synchronizeExecutionItems(
  block: ActionBlock,
  blockExecution: BlockExecution,
  executionItems: NonNullable<BlockExecution["items"]>,
  job: PersistentPluginJob | undefined,
  now: string,
) {
  const nextValues = structuredClone(blockExecution.values);
  if (job?.itemOrchestration) {
    const outputKey = job.request.outputContract.find(
      (field) => field.portKey === job.itemOrchestration!.outputPort,
    )?.key;
    const combinedOutputKey = job.itemOrchestration.combinedOutputPort
      ? job.request.outputContract.find(
          (field) => field.portKey === job.itemOrchestration!.combinedOutputPort,
        )?.key
      : undefined;
    const rootIds = new Set(job.itemOrchestration.itemIds);
    const registeredIds = new Set((job.registeredItems ?? []).map((item) => item.id));
    job.itemOrchestration.workItems = executionItems
      .filter((item) => rootIds.has(item.id))
      .map((item) => structuredClone(item));
    job.registeredItems = executionItems
      .filter((item) => registeredIds.has(item.id))
      .map((item) => structuredClone(item));
    const accumulatedItems = consolidatedOrchestratedOutputs(job).outputs;
    if (outputKey) nextValues[outputKey] = accumulatedItems as RuntimeValue;
    if (combinedOutputKey) {
      nextValues[combinedOutputKey] = accumulatedItems
        .filter((value): value is string => typeof value === "string")
        .join(job.itemOrchestration.separator ?? "\n\n");
    }
    job.itemOrchestration.accumulatedItems = structuredClone(accumulatedItems);
  } else if (job && executionItems.some((item) => item.pluginCorrelation)) {
    job.incrementalItems = structuredClone(executionItems);
    const values = incrementalItemValues(executionItems, job.request.outputContract);
    for (const contract of job.request.outputContract) {
      if (values[contract.key] === undefined) delete nextValues[contract.key];
    }
    Object.assign(nextValues, values);
  } else {
    for (const field of block.outputs ?? []) {
      const correlated = executionItems.filter(
        (item) => item.pluginCorrelation?.outputKey === field.key,
      );
      if (!correlated.length) continue;
      const outputs = correlated
        .filter((item) => item.status === "completed" && item.output !== undefined)
        .sort((left, right) => left.order - right.order)
        .map((item) => structuredClone(item.output!));
      nextValues[field.key] = outputs as RuntimeValue;
    }
  }
  if (job) {
    // O job é a autoridade persistente das unidades. A alteração proposta pela
    // interface só vira projeção da execução depois que o snapshot autoritativo
    // foi gravado com sucesso.
    job.partialValues = structuredClone(nextValues);
    persistCompletedPluginJob(job, now);
    blockExecution.items = blockExecutionItemsForJob(job, executionItems);
    blockExecution.itemProgress = itemProgressForJob(job);
  }
  blockExecution.values = nextValues;
}

function markPluginJobFailed(
  claim: ClaimedPluginJob,
  execution: ProcessExecution | undefined,
  project: Project | undefined,
  message: string,
  status: "failed" | "abandoned" = "failed",
  reasonCode?: string,
) {
  const failedJob = appendPluginDiagnostic(failCurrentOrchestratedItem(claim.job, message), {
    code: "JOB_FAILED",
    ...(reasonCode ? { reasonCode } : {}),
    attempt: claim.job.attempt,
  });
  claim.job = failedJob;
  return savePluginJob(
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
        blockExecution.profileLaneProgress = profileLaneProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved, blockExecution.items);
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
  return savePluginJob(
    claim,
    {
      ...appendPluginDiagnostic(claim.job, {
        code: "JOB_CANCELLED",
        attempt: claim.job.attempt,
      }),
      status: "cancelled",
      cancelRequested: true,
      message,
      nextPollAt: new Date(8_640_000_000_000_000).toISOString(),
    },
    () => {
      if (!execution || !project) return;
      const cancellation = applyExecutionCancellation(execution, {
        type: "execution_cancellation_requested",
      });
      if (!cancellation.ok || cancellation.outcome === "already_cancelled") return;
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

async function processPluginJobClaimed(
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
  if (!job.profileLanePool && !ensureJobProfileLease(plugin, job)) {
    const fallback = job.profileFallback;
    const recoveryDecision = decideExecutionRecovery({
      job,
      failure: {
        code: "PROFILE_BUSY",
        message: "Os perfis selecionados estão sendo usados por outra execução.",
        retryable: true,
        recovery: { externalEffect: "none", stage: "before_effect" },
      },
    });
    if (fallback && recoveryDecision.action === "switch_profile") {
      const currentProfile = fallback.candidates[fallback.activeIndex];
      const nextIndex = fallback.activeIndex + 1;
      const nextProfile = fallback.candidates[nextIndex];
      const resolvedNextProfile = job.profileExecution?.profiles[nextIndex];
      const nextBrowserProfile = resolvedNextProfile
        ? { profileId: resolvedNextProfile.profileId, alias: resolvedNextProfile.alias }
        : browserProfileSnapshot(plugin, nextProfile);
      return commitPluginJobTransition(project.id, () => {
        const saved = savePluginJob(claim, {
          ...appendPluginDiagnostic(job, {
            code: "PROFILE_SWITCH",
            reasonCode: "PROFILE_BUSY",
            previousProfileId: job.browserProfile?.profileId,
            profileId: nextBrowserProfile?.profileId,
            attempt: job.attempt,
          }),
          status: "starting",
          profileFallback: {
            ...fallback,
            activeIndex: nextIndex,
            history: [
              ...fallback.history,
              {
                profile: currentProfile,
                code: "PROFILE_BUSY",
                message: "Os perfis selecionados estão sendo usados por outra execução.",
              },
            ],
          },
          browserProfile: nextBrowserProfile,
          message: recoveryProductMessage({
            decision: recoveryDecision,
            failureMessage: "Os perfis selecionados estão sendo usados por outra execução.",
            currentProfile,
            nextProfile,
            preservedCount: itemProgressForJob(job)?.completed,
          }),
          nextPollAt: new Date().toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution!.status = "in_progress";
        blockExecution!.progressMessage = saved.message;
        execution!.status = "running";
        persistPluginExecution(execution!, project!);
        return saved;
      });
    }
    if (recoveryDecision.action === "retry" || recoveryDecision.action === "reload_and_retry") {
      return commitPluginJobTransition(project.id, () => {
        const saved = savePluginJob(claim, {
          ...appendPluginDiagnostic(job, {
            code: "PLUGIN_RETRY_SCHEDULED",
            reasonCode: "PROFILE_BUSY",
            profileId: job.browserProfile?.profileId,
            attempt: job.attempt,
          }),
          status: "starting",
          request:
            recoveryDecision.action === "reload_and_retry"
              ? {
                  ...job.request,
                  recoveryDirective: {
                    action: "reload_page",
                    reasonCode: recoveryDecision.reasonCode,
                  },
                }
              : job.request,
          retryCount: job.retryCount + 1,
          message: recoveryProductMessage({
            decision: recoveryDecision,
            failureMessage: "Os perfis selecionados estão sendo usados por outra execução.",
            currentProfile: activeProfileAliasForJob(plugin, job),
            preservedCount: itemProgressForJob(job)?.completed,
          }),
          nextPollAt: new Date(Date.now() + recoveryDecision.delayMs).toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution!.status = "in_progress";
        blockExecution!.progressMessage = saved.message;
        execution!.status = "running";
        persistPluginExecution(execution!, project!);
        return saved;
      });
    }
    return markPluginJobFailed(
      claim,
      execution,
      project,
      recoveryProductMessage({
        decision: recoveryDecision,
        failureMessage: "Os perfis selecionados estão sendo usados por outra execução.",
        currentProfile: activeProfileAliasForJob(plugin, job),
        preservedCount: itemProgressForJob(job)?.completed,
      }),
      "failed",
      "PROFILE_BUSY",
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
    job = {
      ...job,
      request: { ...job.request, outputContract: liveJobOutputContract(block, capability) },
    };
    claim.job = job;
    const requestedConnectionId =
      typeof job.request.settings.connectionId === "string"
        ? job.request.settings.connectionId
        : undefined;
    const resolvedConnection = await resolvePluginConnection(plugin, requestedConnectionId);
    storedSecrets = resolvedConnection.secrets;
    secrets = { ...storedSecrets, ...transientSecrets };
    if (pluginConnectionRequired(plugin.manifest) && !Object.keys(secrets).length) {
      throw new Error("Crie ou associe uma conta local válida a este bloco antes de executar.");
    }
    if (isPluginJobTimedOut(job)) {
      if (job.jobId && capability.execution.supportsCancellation) {
        const cancelRequest = invocationRequestForJob(job, { mode: "cancel", jobId: job.jobId });
        await executeRegisteredPlugin(plugin, cancelRequest, 30_000, secrets, {
          workspaceDirectory,
          profileDirectory: browserProfileForJob(plugin, job)?.profileDirectory,
          existingArtifacts: job.partialArtifacts,
        }).catch(() => undefined);
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
        const cancelRequest = invocationRequestForJob(job, { mode: "cancel", jobId: job.jobId });
        const cancelResponse = await executeRegisteredPlugin(
          plugin,
          cancelRequest,
          invocationTimeout,
          secrets,
          {
            workspaceDirectory,
            profileDirectory: browserProfileForJob(plugin, job)?.profileDirectory,
            existingArtifacts: job.partialArtifacts,
          },
        );
        if (cancelResponse.status === "pending") {
          return savePluginJob(claim, {
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
    const parallelExecution = Boolean(job.profileLanePool);
    const parallelResult = parallelExecution
      ? await runActivePluginInvocation(job, (signal) =>
          executeParallelProfileLanes({
            plugin,
            capability,
            job,
            timeoutMs: invocationTimeout,
            secrets,
            workspaceDirectory,
            signal,
            dependencies: {
              pluginJobs,
              browserProfileLeases,
              resolveProfile: (pluginId, profileId) =>
                resolveBoundBrowserProfile(database, {
                  pluginId,
                  profileId,
                  dataDirectory,
                }),
              executePlugin: executeRegisteredPlugin,
              leaseTtlMs: BROWSER_PROFILE_LEASE_TTL_MS,
              leaseHeartbeatMs: BROWSER_PROFILE_LEASE_HEARTBEAT_MS,
            },
          }),
        )
      : undefined;
    if (parallelResult) {
      job = parallelResult.job;
      claim.job = job;
    }
    const continuousSession = Boolean(
      !parallelExecution && job.itemOrchestration && usesContinuousItemSession(capability),
    );
    const continuousInvocationId = continuousSession ? randomUUID() : undefined;
    const startedItemJob =
      parallelExecution || continuousSession ? job : startCurrentOrchestratedItem(job);
    if (startedItemJob !== job) {
      commitPluginJobTransition(project.id, () => {
        job = pluginJobs.updateClaimed(claim, startedItemJob);
        claim.job = job;
        blockExecution!.items = blockExecutionItemsForJob(job, blockExecution!.items);
        blockExecution!.itemProgress = itemProgressForJob(job);
        blockExecution!.profileLaneProgress = profileLaneProgressForJob(job);
        persistPluginExecution(execution!, project!);
      });
    }
    const invocationRequest = continuousSession
      ? continuousInvocationRequestForJob(job, invocation)
      : invocationRequestForJob(job, invocation);
    const parallelConsolidation = parallelResult
      ? consolidatedOrchestratedOutputs(parallelResult.job)
      : undefined;
    const parallelCompletionResponse: Awaited<ReturnType<typeof executeActivePlugin>> | undefined =
      parallelConsolidation?.complete && job.itemOrchestration
        ? {
            status: "success" as const,
            values: {
              [job.itemOrchestration.outputPort]: parallelConsolidation.outputs as RuntimeValue,
              ...(job.itemOrchestration.combinedOutputPort
                ? {
                    [job.itemOrchestration.combinedOutputPort]: parallelConsolidation.outputs
                      .filter((value): value is string => typeof value === "string")
                      .join(job.itemOrchestration.separator ?? "\n\n"),
                  }
                : {}),
            },
          }
        : undefined;
    const pluginResponse =
      parallelCompletionResponse ??
      parallelResult?.response ??
      (await executeActivePlugin(job, plugin, invocationRequest, invocationTimeout, secrets, {
        workspaceDirectory,
        profileDirectory: browserProfileForJob(plugin, job)?.profileDirectory,
        monitorCorrelation: { profileId: job.browserProfile?.profileId, pluginJobId: job.id },
        existingArtifacts: job.partialArtifacts,
        onRegisterItems: async (parentItemId, plannedItems) => {
          const latestExecution = executionById(job.executionId);
          const latestProject = latestExecution
            ? readPayload<Project>("projects", latestExecution.projectId)
            : undefined;
          const latestBlockExecution = latestExecution?.blocks.find(
            (item) => item.blockId === job.blockId,
          );
          if (
            !latestExecution ||
            !latestProject ||
            !latestBlockExecution ||
            latestExecution.status === "cancelled" ||
            (latestBlockExecution.attempt ?? 1) !== job.attempt
          ) {
            throw new Error("A tentativa do bloco não está mais ativa.");
          }
          const registered = registerDerivedWorkItems({
            job,
            existingItems: latestBlockExecution.items,
            parentItemId,
            plannedItems,
          });
          commitPluginJobTransition(latestProject.id, () => {
            job = pluginJobs.updateClaimed(claim, registered.job);
            claim.job = job;
            latestBlockExecution.items = blockExecutionItemsForJob(job, latestBlockExecution.items);
            persistPluginExecution(latestExecution, latestProject);
          });
          return registered.claimed;
        },
        ...(continuousInvocationId
          ? {
              onClaimItems: async (limit: number) => {
                const latestExecution = executionById(job.executionId);
                const latestProject = latestExecution
                  ? readPayload<Project>("projects", latestExecution.projectId)
                  : undefined;
                const latestBlockExecution = latestExecution?.blocks.find(
                  (item) => item.blockId === job.blockId,
                );
                if (
                  !latestExecution ||
                  !latestProject ||
                  !latestBlockExecution ||
                  latestExecution.status === "cancelled" ||
                  (latestBlockExecution.attempt ?? 1) !== job.attempt
                ) {
                  return [];
                }
                const claimed = claimOrchestratedItems({
                  job,
                  limit,
                  invocationId: continuousInvocationId,
                  profileId: job.browserProfile?.profileId,
                  expiresAt: job.deadlineAt,
                });
                commitPluginJobTransition(latestProject.id, () => {
                  job = pluginJobs.updateClaimed(claim, claimed.job);
                  claim.job = job;
                  latestBlockExecution.items = blockExecutionItemsForJob(
                    job,
                    latestBlockExecution.items,
                  );
                  latestBlockExecution.itemProgress = itemProgressForJob(job);
                  latestBlockExecution.profileLaneProgress = profileLaneProgressForJob(job);
                  persistPluginExecution(latestExecution, latestProject);
                });
                return claimed.claimed;
              },
              onPublishItemUpdate: async (update, storedArtifacts) => {
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
                  throw new Error("A tentativa do bloco não está mais ativa.");
                }
                const published = publishOrchestratedItemUpdate({
                  job,
                  invocationId: continuousInvocationId,
                  update,
                  storedArtifacts,
                });
                const nextJob = published.job;
                const orchestration = nextJob.itemOrchestration!;
                const consolidation = consolidatedOrchestratedOutputs(nextJob);
                const accumulatedItems = consolidation.outputs;
                const partialValues = { ...nextJob.partialValues };
                const outputKey = nextJob.request.outputContract.find(
                  (field) => field.portKey === orchestration.outputPort,
                )?.key;
                const combinedOutputKey = orchestration.combinedOutputPort
                  ? nextJob.request.outputContract.find(
                      (field) => field.portKey === orchestration.combinedOutputPort,
                    )?.key
                  : undefined;
                if (outputKey) partialValues[outputKey] = accumulatedItems as RuntimeValue;
                if (combinedOutputKey) {
                  partialValues[combinedOutputKey] = accumulatedItems
                    .filter((item): item is string => typeof item === "string")
                    .join(orchestration.separator ?? "\\n\\n");
                }
                commitPluginJobTransition(latestProject.id, () => {
                  job = pluginJobs.updateClaimed(claim, {
                    ...nextJob,
                    partialValues,
                    partialArtifacts: mergeStoredArtifacts(
                      nextJob.partialArtifacts,
                      storedArtifacts,
                    ),
                    progress:
                      consolidation.requiredItems.filter((item) => item.status === "completed")
                        .length / Math.max(1, consolidation.requiredItems.length),
                    message: update.message ?? nextJob.message,
                  });
                  claim.job = job;
                  latestBlockExecution.status = "in_progress";
                  latestBlockExecution.values = structuredClone(partialValues);
                  latestBlockExecution.progress = job.progress;
                  latestBlockExecution.progressMessage = job.message;
                  latestBlockExecution.itemProgress = itemProgressForJob(job);
                  latestBlockExecution.profileLaneProgress = profileLaneProgressForJob(job);
                  latestBlockExecution.items = blockExecutionItemsForJob(
                    job,
                    latestBlockExecution.items,
                  );
                  latestExecution.status = "running";
                  latestExecution.error = undefined;
                  recordBlockDeliveries(latestExecution, latestBlock, partialValues, "partial");
                  persistPluginExecution(latestExecution, latestProject);
                });
                return published.receipt;
              },
            }
          : {}),
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
          job = {
            ...job,
            request: {
              ...job.request,
              outputContract: liveJobOutputContract(latestBlock, capability),
            },
          };
          const mappedUpdate = normalizedPluginValues(
            latestBlock,
            update.values,
            job.request.outputContract,
            "partial",
            job.itemOrchestration ? "item" : "snapshot",
            undefined,
            job.request.inputDeliveries,
          );
          const incremental = applyPluginIncrementalItemUpdates({
            job,
            updates: update.itemUpdates,
            outputContract: job.request.outputContract,
          });
          const partialValues: Record<string, RuntimeValue> = {
            ...job.partialValues,
            ...mappedUpdate,
            ...incremental.values,
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
          commitPluginJobTransition(latestProject.id, () => {
            job = pluginJobs.updateClaimed(claim, {
              ...job,
              incrementalItems: incremental.items,
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
            latestBlockExecution.profileLaneProgress = profileLaneProgressForJob(job);
            latestBlockExecution.items = blockExecutionItemsForJob(job, latestBlockExecution.items);
            latestBlockExecution.logs = update.logs ?? latestBlockExecution.logs;
            latestExecution.status = "running";
            latestExecution.error = undefined;
            recordBlockDeliveries(latestExecution, latestBlock, partialValues, "partial");
            persistPluginExecution(latestExecution, latestProject);
          });
        },
      }));
    for (const event of pluginResponse.bridgeDiagnostics ?? []) {
      job = appendPluginDiagnostic(job, {
        code: event.code,
        profileId: job.browserProfile?.profileId,
        attempt: job.attempt,
      });
    }
    claim.job = job;

    if (continuousInvocationId && pluginResponse.status !== "success") {
      job = pluginJobs.updateClaimed(
        claim,
        releaseContinuousSessionClaims(job, continuousInvocationId),
      );
      claim.job = job;
    }

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

    job = {
      ...job,
      request: { ...job.request, outputContract: liveJobOutputContract(block, capability) },
    };
    claim.job = job;
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
      const partialValues = orchestratedPartialValues(job, {
        ...normalizedPluginValues(
          block,
          pluginResponse.partialValues ?? {},
          job.request.outputContract,
          "partial",
          job.itemOrchestration ? "item" : "snapshot",
          undefined,
          job.request.inputDeliveries,
        ),
      });
      const progress = Number.isFinite(pluginResponse.progress)
        ? Math.max(job.progress ?? 0, Math.min(1, Math.max(0, pluginResponse.progress!)))
        : job.progress;
      const pollAfterMs = Number.isFinite(pluginResponse.pollAfterMs)
        ? Math.max(500, Math.min(30_000, pluginResponse.pollAfterMs))
        : 5_000;
      return commitPluginJobTransition(project.id, () => {
        const saved = savePluginJob(claim, {
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
        blockExecution!.status = "in_progress";
        blockExecution!.values = structuredClone(partialValues);
        blockExecution!.jobId = saved.jobId;
        blockExecution!.traceId = saved.traceId;
        blockExecution!.progress = saved.progress;
        blockExecution!.progressMessage = saved.message;
        blockExecution!.itemProgress = itemProgressForJob(saved);
        blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
        blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
        blockExecution!.logs = pluginResponse.logs;
        execution!.status = "running";
        execution!.error = undefined;
        recordBlockDeliveries(execution!, block!, partialValues, "partial");
        persistPluginExecution(execution!, project!);
        return saved;
      });
    }

    if (pluginResponse.status === "error") {
      const partialValues = orchestratedPartialValues(job, {
        ...normalizedPluginValues(
          block,
          pluginResponse.partialValues ?? {},
          job.request.outputContract,
          "partial",
          job.itemOrchestration ? "item" : "snapshot",
          undefined,
          job.request.inputDeliveries,
        ),
      });
      const partialArtifacts = mergeStoredArtifacts(
        job.partialArtifacts,
        pluginResponse.storedArtifacts,
      );
      const fallback = job.profileFallback;
      const recoveryDecision = decideExecutionRecovery({ job, failure: pluginResponse });
      if (fallback && recoveryDecision.action === "switch_profile") {
        const currentProfile = fallback.candidates[fallback.activeIndex];
        const nextIndex = fallback.activeIndex + 1;
        const nextProfile = fallback.candidates[nextIndex];
        const nextBrowserProfile = browserProfileSnapshot(plugin, nextProfile);
        const saved = commitPluginJobTransition(project.id, () => {
          const saved = savePluginJob(claim, {
            ...appendPluginDiagnostic(job, {
              code: "PROFILE_SWITCH",
              reasonCode: pluginResponse.code,
              previousProfileId: job.browserProfile?.profileId,
              profileId: nextBrowserProfile?.profileId,
              attempt: job.attempt,
            }),
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
            browserProfile: nextBrowserProfile,
            partialValues,
            partialArtifacts,
            error: pluginResponse.message,
            message: recoveryProductMessage({
              decision: recoveryDecision,
              failureMessage: pluginResponse.message,
              currentProfile,
              nextProfile,
              preservedCount: itemProgressForJob(job)?.completed,
            }),
            nextPollAt: new Date().toISOString(),
          });
          if (saved.status === "cancel_requested") return saved;
          blockExecution!.status = "in_progress";
          blockExecution!.values = structuredClone(partialValues);
          blockExecution!.progressMessage = saved.message;
          blockExecution!.itemProgress = itemProgressForJob(saved);
          blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
          blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
          blockExecution!.logs = pluginResponse.logs;
          execution!.status = "running";
          recordBlockDeliveries(execution!, block!, partialValues, "partial");
          persistPluginExecution(execution!, project!);
          return saved;
        });
        releaseJobProfileLease(job.id);
        return saved;
      }
      if (recoveryDecision.action === "retry" || recoveryDecision.action === "reload_and_retry") {
        const retryCount = job.retryCount + 1;
        return commitPluginJobTransition(project.id, () => {
          const saved = savePluginJob(claim, {
            ...appendPluginDiagnostic(job, {
              code: "PLUGIN_RETRY_SCHEDULED",
              reasonCode: pluginResponse.code,
              profileId: job.browserProfile?.profileId,
              attempt: job.attempt,
            }),
            status: job.jobId ? "pending" : "starting",
            request:
              recoveryDecision.action === "reload_and_retry"
                ? {
                    ...job.request,
                    recoveryDirective: {
                      action: "reload_page",
                      reasonCode: recoveryDecision.reasonCode,
                    },
                  }
                : job.request,
            retryCount,
            partialValues,
            partialArtifacts,
            error: pluginResponse.message,
            message: recoveryProductMessage({
              decision: recoveryDecision,
              failureMessage: pluginResponse.message,
              currentProfile: activeProfileAliasForJob(plugin, job),
              preservedCount: itemProgressForJob(job)?.completed,
            }),
            nextPollAt: new Date(Date.now() + recoveryDecision.delayMs).toISOString(),
          });
          if (saved.status === "cancel_requested") return saved;
          blockExecution!.status = "in_progress";
          blockExecution!.values = structuredClone(partialValues);
          blockExecution!.progressMessage = saved.message;
          blockExecution!.itemProgress = itemProgressForJob(saved);
          blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
          blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
          blockExecution!.logs = pluginResponse.logs;
          execution!.status = "running";
          recordBlockDeliveries(execution!, block!, partialValues, "partial");
          persistPluginExecution(execution!, project!);
          return saved;
        });
      }
      const terminalMessage = recoveryProductMessage({
        decision: recoveryDecision,
        failureMessage: pluginResponse.message,
        currentProfile: activeProfileAliasForJob(plugin, job),
        preservedCount: itemProgressForJob(job)?.completed,
      });
      job = { ...job, partialValues, partialArtifacts };
      claim.job = job;
      return markPluginJobFailed(
        claim,
        execution,
        project,
        terminalMessage,
        "failed",
        pluginResponse.code,
      );
    }

    const values = {
      ...job.partialValues,
      ...normalizedPluginValues(
        block,
        pluginResponse.values,
        job.request.outputContract,
        "final",
        job.itemOrchestration ? "item" : "snapshot",
        job.partialValues,
        job.request.inputDeliveries,
      ),
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
      const rawIncoming = pluginResponse.values[itemOrchestration.outputPort];
      const finalizesFromDurableItems = canFinalizeFromDurableOrchestratedItems(job, rawIncoming);
      const mappedValues = normalizedPluginValues(
        block,
        pluginResponse.values,
        job.request.outputContract,
        finalizesFromDurableItems ? "partial" : "final",
        "item",
        undefined,
        job.request.inputDeliveries,
      );
      const incomingItems = Array.isArray(rawIncoming)
        ? rawIncoming
        : rawIncoming === undefined
          ? []
          : [rawIncoming];
      const ownedClaimCount = continuousInvocationId
        ? (itemOrchestration.claims ?? []).filter(
            (claim) => claim.invocationId === continuousInvocationId,
          ).length
        : 0;
      const completedItemJob = finalizesFromDurableItems
        ? job
        : parallelExecution
          ? job
          : continuousInvocationId
            ? completeContinuousSessionClaims(
                job,
                continuousInvocationId,
                structuredClone(
                  ownedClaimCount === 1 && !Array.isArray(rawIncoming)
                    ? [rawIncoming]
                    : incomingItems,
                ) as BlockExecutionItemValue[],
              )
            : completeCurrentOrchestratedItem(
                job,
                structuredClone(rawIncoming) as BlockExecutionItemValue,
              );
      const completedItemOrchestration = completedItemJob.itemOrchestration!;
      const consolidation = consolidatedOrchestratedOutputs(completedItemJob);
      if ((parallelExecution || continuousInvocationId) && !consolidation.complete) {
        throw new Error(
          "A sessão contínua encerrou antes de confirmar duravelmente todas as unidades concedidas.",
        );
      }
      const accumulatedItems = consolidation.requiredItems.length
        ? consolidation.outputs
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
        return commitPluginJobTransition(project.id, () => {
          const saved = savePluginJob(claim, {
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
              consolidation.requiredItems.filter((item) => item.status === "completed").length /
              Math.max(1, consolidation.requiredItems.length || itemOrchestration.items.length),
            message: continuousInvocationId
              ? job.message
              : `Item ${itemOrchestration.currentIndex + 1} de ${itemOrchestration.items.length} concluído.`,
            error: undefined,
          });
          if (saved.status === "cancel_requested") return saved;
          blockExecution!.status = "in_progress";
          blockExecution!.values = structuredClone(accumulated);
          blockExecution!.progress = saved.progress;
          blockExecution!.progressMessage = saved.message;
          blockExecution!.itemProgress = itemProgressForJob(saved);
          blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
          blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
          blockExecution!.logs = pluginResponse.logs;
          execution!.status = "running";
          recordBlockDeliveries(execution!, block!, accumulated, "partial");
          persistPluginExecution(execution!, project!);
          return saved;
        });
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
    if (!job.itemOrchestration) {
      const materialized = aggregateCompatibilityItemOrchestration(capability, job.request, values);
      if (materialized) {
        job = { ...job, itemOrchestration: materialized };
        claim.job = job;
      }
    }
    if (job.itemOrchestration && !areRequiredOrchestratedItemsCompleted(job)) {
      throw new Error(
        "O plugin encerrou a execução antes de todas as unidades obrigatórias chegarem ao estado concluído.",
      );
    }
    const completedConversationId = pluginResponse.conversation?.id
      ? normalizePluginConversationId(pluginResponse.conversation.id)
      : undefined;
    const saved = savePluginJob(
      claim,
      {
        ...appendPluginDiagnostic(job, {
          code: "JOB_COMPLETED",
          profileId: job.browserProfile?.profileId,
          attempt: job.attempt,
        }),
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
          const activeProfile = activeProfileAliasForJob(plugin, job);
          blockExecution.pluginConversation = {
            pluginId: plugin.id,
            connectionId: block.plugin?.connectionId,
            profile: activeProfile,
            profileId: job.browserProfile?.profileId,
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
        blockExecution.profileLaneProgress = profileLaneProgressForJob(saved);
        blockExecution.items = blockExecutionItemsForJob(saved, blockExecution.items);
        blockExecution.itemRetryScope = undefined;
        persistPluginExecution(execution, project);
      },
    );
    scheduleAutomaticPluginBlock(execution);
    return saved;
  } catch (error) {
    // A failed local commit is not a plugin failure: keep the durable snapshots
    // unchanged and let the worker boundary report the persistence error.
    if (error instanceof PersistenceCommitError) throw error;
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
    const recoveryDecision = decideExecutionRecovery({
      job,
      failure: {
        code: errorCode,
        message,
        retryable: errorCode === "JOB_FAILED",
        recovery: (error as { recovery?: import("../src/lib/plugin-contract").PluginRecoveryFacts })
          .recovery,
      },
    });
    if (fallback && recoveryDecision.action === "switch_profile") {
      const currentProfile = fallback.candidates[fallback.activeIndex];
      const nextIndex = fallback.activeIndex + 1;
      const nextProfile = fallback.candidates[nextIndex];
      const resolvedNextProfile = job.profileExecution?.profiles[nextIndex];
      const nextBrowserProfile = resolvedNextProfile
        ? { profileId: resolvedNextProfile.profileId, alias: resolvedNextProfile.alias }
        : browserProfileSnapshot(plugin, nextProfile);
      const saved = commitPluginJobTransition(project.id, () => {
        const saved = savePluginJob(claim, {
          ...appendPluginDiagnostic(job, {
            code: "PROFILE_SWITCH",
            reasonCode: errorCode,
            previousProfileId: job.browserProfile?.profileId,
            profileId: nextBrowserProfile?.profileId,
            attempt: job.attempt,
          }),
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
          browserProfile: nextBrowserProfile,
          error: message,
          message: recoveryProductMessage({
            decision: recoveryDecision,
            failureMessage: message,
            currentProfile,
            nextProfile,
            preservedCount: itemProgressForJob(job)?.completed,
          }),
          nextPollAt: new Date().toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution!.status = "in_progress";
        blockExecution!.progressMessage = saved.message;
        blockExecution!.itemProgress = itemProgressForJob(saved);
        blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
        blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
        execution!.status = "running";
        persistPluginExecution(execution!, project!);
        return saved;
      });
      releaseJobProfileLease(job.id);
      return saved;
    }
    if (recoveryDecision.action === "retry" || recoveryDecision.action === "reload_and_retry") {
      const retryCount = job.retryCount + 1;
      return commitPluginJobTransition(project.id, () => {
        const saved = savePluginJob(claim, {
          ...appendPluginDiagnostic(job, {
            code: "PLUGIN_RETRY_SCHEDULED",
            reasonCode: errorCode,
            profileId: job.browserProfile?.profileId,
            attempt: job.attempt,
          }),
          status: job.jobId ? "pending" : "starting",
          request:
            recoveryDecision.action === "reload_and_retry"
              ? {
                  ...job.request,
                  recoveryDirective: {
                    action: "reload_page",
                    reasonCode: recoveryDecision.reasonCode,
                  },
                }
              : job.request,
          retryCount,
          error: message,
          message: recoveryProductMessage({
            decision: recoveryDecision,
            failureMessage: message,
            currentProfile: activeProfileAliasForJob(plugin, job),
            preservedCount: itemProgressForJob(job)?.completed,
          }),
          nextPollAt: new Date(Date.now() + recoveryDecision.delayMs).toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution!.status = "in_progress";
        blockExecution!.progressMessage = saved.message;
        blockExecution!.itemProgress = itemProgressForJob(saved);
        blockExecution!.profileLaneProgress = profileLaneProgressForJob(saved);
        blockExecution!.items = blockExecutionItemsForJob(saved, blockExecution!.items);
        execution!.status = "running";
        persistPluginExecution(execution!, project!);
        return saved;
      });
    }
    return markPluginJobFailed(
      claim,
      execution,
      project,
      recoveryProductMessage({
        decision: recoveryDecision,
        failureMessage: message,
        currentProfile: activeProfileAliasForJob(plugin, job),
        preservedCount: itemProgressForJob(job)?.completed,
      }),
      "failed",
      errorCode,
    );
  }
}
async function processPluginJob(
  jobId: string,
  transientSecrets: Record<string, string> = {},
  existingClaim?: ClaimedPluginJob,
) {
  try {
    return await processPluginJobClaimed(jobId, transientSecrets, existingClaim);
  } finally {
    const current = pluginJobs.get(jobId);
    if (!current || ["completed", "failed", "cancelled", "abandoned"].includes(current.status)) {
      releaseJobProfileLease(jobId);
    }
  }
}

let activePluginWorkers = 0;
const activePluginConcurrencySlots = new Map<string, number>();
async function processDuePluginJobs() {
  if (!userDataUpgrade.backgroundAllowed()) return;
  while (activePluginWorkers < 4) {
    const claim = userDataUpgrade.claimCompatibleJob(pluginJobs);
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
if (userDataUpgrade.backgroundAllowed() && !userDataUpgrade.hasHistoricalJobs()) {
  reconcileStoredExecutionItems();
  normalizeStoredExecutionWorkUnits();
}
const pluginJobScheduler = setInterval(() => void processDuePluginJobs(), 500);
pluginJobScheduler.unref();
function cleanupAbandonedPluginJobs() {
  if (!userDataUpgrade.backgroundAllowed() || userDataUpgrade.hasHistoricalJobs()) return;
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

const { comparePluginVersions, pluginCatalogCompatibility } = await import("./plugin-catalog");
type ManagedPlugin = RegisteredPlugin | import("./plugin-runner").AdministrativePlugin;

function getAdministrativePlugin(pluginId: string): ManagedPlugin | undefined {
  const registry = initializePluginRunner();
  return (
    registry.plugins.find((plugin) => plugin.id === pluginId) ??
    registry.administrativePlugins.find((plugin) => plugin.id === pluginId)
  );
}

function isPluginManifest(manifest: Record<string, unknown>) {
  try {
    validatePluginManifest(manifest);
    return true;
  } catch {
    return false;
  }
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
          {
            id: randomUUID(),
            label: "Nome",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
          {
            id: randomUUID(),
            label: "Conteúdo",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
          {
            id: randomUUID(),
            label: "Descrição",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: false,
          },
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
app.use(supportRequestDiagnostics);
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
    plugins: [
      ...plugins.map((plugin) => ({ ...plugin, compatibility: { status: "compatible" } })),
      ...registry.administrativePlugins.map(
        ({ absoluteDirectory: _absoluteDirectory, ...plugin }) => ({
          ...plugin,
          enabled: false,
          executable: false,
          sandboxed: true,
          networkIsolation: communitySandboxAvailable,
        }),
      ),
    ],
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
  for (const profile of pluginProfiles.list(plugin.id)) {
    ensureLegacyBrowserProfile(database, profile);
  }
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

app.get("/api/plugins/:pluginId/profile-inventory", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  const channels = storedChannels();
  profileInventory(plugin);
  const inventory = browserProfileInventory(
    browserProfiles,
    pluginProfileBindings,
    pluginProfileReadiness,
    plugin.id,
    (binding, profile) => {
      const boundPlugin = getRegisteredPlugin(binding.pluginId);
      const setup = boundPlugin?.manifest.profileSetup;
      if (!setup) return [];
      return (
        findPluginProfileUsages(channels, binding.pluginId, setup).get(
          profile.alias.toLocaleLowerCase(),
        ) ?? []
      );
    },
  );
  response.json({
    ...inventory,
    linked: inventory.linked.map((entry) => {
      const lease = browserProfileLeases.get(entry.profile.id);
      return {
        ...entry,
        occupied: Boolean(lease && Date.parse(lease.expiresAt) > Date.now()),
      };
    }),
  });
});

function linkedBrowserProfileAliasExists(
  pluginId: string,
  alias: string,
  exceptProfileId?: string,
) {
  return pluginProfileBindings.listForPlugin(pluginId).some((binding) => {
    if (binding.profileId === exceptProfileId) return false;
    return (
      browserProfiles.get(binding.profileId)?.alias.toLocaleLowerCase() ===
      alias.toLocaleLowerCase()
    );
  });
}

function staleBrowserProfileRevision(expected: unknown, actual: string) {
  return typeof expected !== "string" || expected !== actual;
}

app.post("/api/plugins/:pluginId/profile-bindings", (request, response) => {
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
    while (linkedBrowserProfileAliasExists(plugin.id, alias)) {
      const suffixText = `-${suffix++}`;
      alias = `${aliasBase.slice(0, 48 - suffixText.length).replace(/-+$/, "")}${suffixText}`;
    }
    const result = database
      .transaction(() => {
        const profile = browserProfiles.create({
          id: profileId,
          name,
          alias,
          storageKind: "managed",
          storageKey: `browser-profiles/${profileId}`,
        });
        const binding = pluginProfileBindings.link(plugin.id, profileId);
        return { profile, binding };
      })
      .immediate();
    response.status(201).json(result);
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível criar o perfil.",
    });
  }
});

app.post("/api/plugins/:pluginId/profile-bindings/:profileId", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  const profile = browserProfiles.get(request.params.profileId);
  if (!profile) {
    response.status(404).json({ error: "Perfil de navegador não encontrado." });
    return;
  }
  if (request.body?.sharedSessionConsent !== true) {
    response.status(422).json({
      error:
        "Confirme explicitamente o uso da sessão local compartilhada antes de vincular o perfil.",
    });
    return;
  }
  if (staleBrowserProfileRevision(request.body?.profileUpdatedAt, profile.updatedAt)) {
    response
      .status(409)
      .json({ error: "O perfil mudou. Recarregue o inventário antes de vinculá-lo." });
    return;
  }
  if (pluginProfileBindings.get(plugin.id, profile.id)) {
    response.status(409).json({ error: "Este perfil já está vinculado ao plugin." });
    return;
  }
  if (linkedBrowserProfileAliasExists(plugin.id, profile.alias)) {
    response.status(409).json({
      error: "Já existe um perfil vinculado a este plugin com o mesmo alias.",
    });
    return;
  }
  try {
    const binding = database
      .transaction(() => {
        const latest = browserProfiles.get(profile.id);
        if (
          !latest ||
          staleBrowserProfileRevision(request.body?.profileUpdatedAt, latest.updatedAt)
        ) {
          throw new Error("PROFILE_REVISION_CONFLICT");
        }
        return pluginProfileBindings.link(plugin.id, profile.id);
      })
      .immediate();
    response.status(201).json({ profile, binding });
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_REVISION_CONFLICT") {
      response
        .status(409)
        .json({ error: "O perfil mudou. Recarregue o inventário antes de vinculá-lo." });
      return;
    }
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível vincular o perfil.",
    });
  }
});

app.patch("/api/plugins/:pluginId/profile-bindings/:profileId", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  const binding = pluginProfileBindings.get(plugin.id, request.params.profileId);
  const profile = browserProfiles.get(request.params.profileId);
  if (!binding || !profile) {
    response.status(404).json({ error: "Vínculo de perfil não encontrado." });
    return;
  }
  if (staleBrowserProfileRevision(request.body?.profileUpdatedAt, profile.updatedAt)) {
    response
      .status(409)
      .json({ error: "O perfil mudou. Recarregue o inventário antes de renomeá-lo." });
    return;
  }
  try {
    const name = normalizePluginProfileName(request.body?.name);
    const renamed = database
      .transaction(() => {
        const latest = browserProfiles.get(profile.id);
        if (
          !latest ||
          staleBrowserProfileRevision(request.body?.profileUpdatedAt, latest.updatedAt)
        ) {
          throw new Error("PROFILE_REVISION_CONFLICT");
        }
        return browserProfiles.rename(profile.id, name)!;
      })
      .immediate();
    response.json({ profile: renamed, binding: pluginProfileBindings.get(plugin.id, profile.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_REVISION_CONFLICT") {
      response
        .status(409)
        .json({ error: "O perfil mudou. Recarregue o inventário antes de renomeá-lo." });
      return;
    }
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível renomear o perfil.",
    });
  }
});

app.delete("/api/plugins/:pluginId/profile-bindings/:profileId", (request, response) => {
  const plugin = registeredProfilePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Este plugin não oferece gerenciamento de perfis." });
    return;
  }
  const binding = pluginProfileBindings.get(plugin.id, request.params.profileId);
  const profile = browserProfiles.get(request.params.profileId);
  if (!binding || !profile) {
    response.status(404).json({ error: "Vínculo de perfil não encontrado." });
    return;
  }
  if (request.body?.bindingUpdatedAt !== binding.updatedAt) {
    response
      .status(409)
      .json({ error: "O vínculo mudou. Recarregue o inventário antes de desvinculá-lo." });
    return;
  }
  try {
    const remainingBindings = database
      .transaction(() => {
        const latest = pluginProfileBindings.get(plugin.id, profile.id);
        if (!latest || request.body?.bindingUpdatedAt !== latest.updatedAt) {
          throw new Error("BINDING_REVISION_CONFLICT");
        }
        pluginProfileBindings.unlink(plugin.id, profile.id);
        return pluginProfileBindings.listForProfile(profile.id).length;
      })
      .immediate();
    response.json({ profileId: profile.id, remainingBindings, profilePreserved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BINDING_REVISION_CONFLICT") {
      response
        .status(409)
        .json({ error: "O vínculo mudou. Recarregue o inventário antes de desvinculá-lo." });
      return;
    }
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível desvincular o perfil.",
    });
  }
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
    const profile = database.transaction(() => {
      const created = pluginProfiles.create({ id: profileId, pluginId: plugin.id, name, alias });
      ensureLegacyBrowserProfile(database, created);
      return created;
    })();
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
  const migratedProfileId = `legacy:${profile.id}`;
  if (pluginProfileBindings.get(plugin.id, migratedProfileId)) {
    pluginProfileBindings.unlink(plugin.id, migratedProfileId);
  }
  pluginProfiles.remove(plugin.id, profile.id);
  response.status(204).end();
});

async function executePluginProfileAction(
  plugin: RegisteredPlugin,
  action: "status" | "prepare",
  profileName: string,
  profileDirectory?: string,
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
    profileDirectory: profileDirectory ?? executionProfileForPluginRequest(plugin, pluginRequest),
  });
}

function updateBoundProfileReadiness(input: {
  pluginId: string;
  profileId: string;
  action: "status" | "prepare";
  ready: boolean;
  bridgeState: "installed" | "missing" | "unknown";
}) {
  const now = new Date().toISOString();
  const previous = pluginProfileReadiness.get(input.pluginId, input.profileId);
  return pluginProfileReadiness.set({
    pluginId: input.pluginId,
    profileId: input.profileId,
    state: input.ready ? "ready" : "not_ready",
    checkedAt: now,
    preparedAt: input.action === "prepare" && input.ready ? now : previous?.preparedAt,
    metadata: { bridgeState: input.bridgeState },
  });
}

const configurationOptionsRequestSchema = z
  .object({
    configuration: z.record(z.union([z.string(), z.number().finite(), z.boolean()])).default({}),
    connectionId: z.string().min(1).max(200).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();

async function executePluginConfigurationOptions(input: {
  plugin: RegisteredPlugin;
  capability: PluginCapability;
  property: string;
  configuration: Record<string, string | number | boolean>;
  connectionId?: string;
  refresh: boolean;
}) {
  const provider = input.capability.configurationOptions?.find(
    (candidate) => candidate.property === input.property,
  );
  if (!provider) throw new Error("Este campo não possui opções dinâmicas declaradas.");

  const profileKey = input.plugin.manifest.profileSetup?.configurationKey;
  const profileAlias = profileKey ? String(input.configuration[profileKey] ?? "").trim() : "";
  if (profileKey && provider.dependsOn?.includes(profileKey) && !profileAlias) {
    throw new Error("Selecione um perfil preparado antes de carregar estas opções.");
  }
  if (profileAlias && !pluginProfiles.findByAlias(input.plugin.id, profileAlias)) {
    throw new Error("O perfil selecionado não pertence a este plugin.");
  }

  const cacheKey = configurationOptionsCacheKey({
    pluginId: input.plugin.id,
    pluginVersion: input.plugin.manifest.version,
    capabilityId: input.capability.id,
    provider,
    configuration: input.configuration,
    profileConfigurationKey: profileKey,
    connectionId: input.connectionId,
  });
  if (!input.refresh) {
    const cached = pluginConfigurationOptionsCache.get(cacheKey);
    if (cached) return { options: cached, cached: true };
  }

  const pluginSecrets = (await resolvePluginConnection(input.plugin, input.connectionId)).secrets;
  const pluginRequest: PluginExecutionRequest = {
    executionId: `configuration-options-${randomUUID()}`,
    traceId: randomUUID(),
    blockId: "configuration-options",
    capabilityId: input.capability.id,
    attempt: 1,
    invocation: {
      mode: "configure",
      action: "options",
      providerId: provider.providerId,
      property: provider.property,
    },
    configuration: input.configuration,
    settings: {},
    inputs: {},
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "configuration-options", name: "", language: "", niche: "" },
      project: { id: "configuration-options", title: "" },
      processType: "theme",
      block: { type: "CRIAR", name: "", instructions: "" },
    },
  };
  const result = await executeRegisteredPlugin(input.plugin, pluginRequest, 60_000, pluginSecrets, {
    workspaceDirectory: executionWorkspaceForPlugin(input.plugin),
    profileDirectory: executionProfileForPluginRequest(input.plugin, pluginRequest),
  });
  const options = parseConfigurationOptionsResponse(result);
  pluginConfigurationOptionsCache.set(cacheKey, options, provider.cacheTtlMs ?? 300_000);
  return { options, cached: false };
}

app.post(
  "/api/plugins/:pluginId/capabilities/:capabilityId/configuration-options/:property",
  async (request, response) => {
    initializePluginRunner();
    const plugin = getRegisteredPlugin(request.params.pluginId);
    if (!plugin) {
      response.status(404).json({ error: "Plugin não encontrado." });
      return;
    }
    if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
      response.status(403).json({
        error: "Ative este plugin e confirme suas permissões na Central de Plugins.",
      });
      return;
    }
    const capability = plugin.manifest.capabilities.find(
      (candidate) => candidate.id === request.params.capabilityId,
    );
    if (!capability) {
      response.status(404).json({ error: "Capacidade do plugin não encontrada." });
      return;
    }
    const provider = capability.configurationOptions?.find(
      (candidate) => candidate.property === request.params.property,
    );
    if (!provider) {
      response.status(404).json({ error: "Este campo não oferece opções dinâmicas." });
      return;
    }
    const parsed = configurationOptionsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Configuração inválida para descoberta de opções." });
      return;
    }
    try {
      const result = await executePluginConfigurationOptions({
        plugin,
        capability,
        property: provider.property,
        configuration: parsed.data.configuration,
        connectionId: parsed.data.connectionId,
        refresh: parsed.data.refresh === true,
      });
      response.json(result satisfies { options: PluginConfigurationOption[]; cached: boolean });
    } catch (error) {
      response.status(422).json({
        error: error instanceof Error ? error.message : "Não foi possível carregar as opções.",
      });
    }
  },
);

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

app.post(
  "/api/plugins/:pluginId/profile-bindings/:profileId/:action",
  async (request, response) => {
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

    let resolved;
    try {
      resolved = resolveBoundBrowserProfile(database, {
        pluginId: plugin.id,
        profileId: request.params.profileId,
        dataDirectory,
      });
    } catch (error) {
      response.status(404).json({
        ready: false,
        error: error instanceof Error ? error.message : "Vínculo de perfil não encontrado.",
      });
      return;
    }

    try {
      const result = await executePluginProfileAction(
        plugin,
        action,
        resolved.profile.alias,
        resolved.profileDirectory,
      );
      if (result.status === "error") {
        const readiness = updateBoundProfileReadiness({
          pluginId: plugin.id,
          profileId: resolved.profile.id,
          action,
          ready: false,
          bridgeState: browserBridgeProfileDirectoryState(resolved.profileDirectory),
        });
        response.status(action === "status" ? 200 : 422).json({
          ready: false,
          readiness: {
            state: readiness.state,
            checkedAt: readiness.checkedAt,
            preparedAt: readiness.preparedAt,
          },
          error: result.message,
        });
        return;
      }

      const markerReady = result.status === "success" && result.values.ready === true;
      const bridgeState = markerReady
        ? browserBridgeProfileDirectoryState(resolved.profileDirectory)
        : "unknown";
      const ready = markerReady && bridgeState !== "missing";
      const readiness = updateBoundProfileReadiness({
        pluginId: plugin.id,
        profileId: resolved.profile.id,
        action,
        ready,
        bridgeState,
      });
      response.json({
        ready,
        bridgeState,
        readiness: {
          state: readiness.state,
          checkedAt: readiness.checkedAt,
          preparedAt: readiness.preparedAt,
        },
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
      const readiness = updateBoundProfileReadiness({
        pluginId: plugin.id,
        profileId: resolved.profile.id,
        action,
        ready: false,
        bridgeState: browserBridgeProfileDirectoryState(resolved.profileDirectory),
      });
      response.status(422).json({
        ready: false,
        readiness: {
          state: readiness.state,
          checkedAt: readiness.checkedAt,
          preparedAt: readiness.preparedAt,
        },
        error: error instanceof Error ? error.message : "Não foi possível preparar o perfil.",
      });
    }
  },
);

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

function installPluginDirectories(pluginDirectories: string[]) {
  const temporaryDestinations: string[] = [];
  const installedDestinations: string[] = [];
  try {
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
    return { installed: staged.map((candidate) => candidate.pluginId), skipped };
  } catch (error) {
    for (const destination of [...temporaryDestinations, ...installedDestinations])
      if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    initializePluginRunner();
    throw error;
  }
}

app.post("/api/plugins/install-from-folder", (request, response) => {
  try {
    const requestedPath =
      typeof request.body?.path === "string" ? normalizeUserProvidedPath(request.body.path) : "";
    if (!requestedPath) throw new Error("Informe a pasta de um plugin ou do pacote extraído.");
    const result = installPluginDirectories(discoverPluginDirectories(requestedPath));
    response.status(result.installed.length ? 201 : 200).json(result);
  } catch (error) {
    response
      .status(422)
      .json({ error: error instanceof Error ? error.message : "PLUGIN_INSTALL_FAILED" });
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

function isNewerPluginVersion(candidate: string, current: string) {
  return comparePluginVersions(candidate, current) > 0;
}

let pluginCatalogCache: { catalog: PluginCatalog; loadedAt: number } | undefined;

async function currentPluginCatalog(force = false) {
  if (!force && pluginCatalogCache && Date.now() - pluginCatalogCache.loadedAt < 5 * 60_000)
    return pluginCatalogCache.catalog;
  const catalog = await fetchPluginCatalog(pluginCatalogUrl);
  pluginCatalogCache = { catalog, loadedAt: Date.now() };
  return catalog;
}

app.get("/api/plugins/catalog", async (_request, response) => {
  try {
    const catalog = await currentPluginCatalog(true);
    const registry = initializePluginRunner();
    response.json({
      plugins: catalog.plugins.map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        compatible: pluginCatalogCompatibility(entry).status === "compatible",
        installed: [...registry.plugins, ...registry.administrativePlugins].some(
          (plugin) => plugin.id === entry.id,
        ),
      })),
    });
  } catch {
    response.status(502).json({ error: "CATALOG_UNAVAILABLE" });
  }
});

async function extractCatalogPlugin(pluginId: string, temporaryRoot: string) {
  const catalog = await currentPluginCatalog(true);
  const entry = catalog.plugins.find((candidate) => candidate.id === pluginId);
  if (!entry || pluginCatalogCompatibility(entry).status !== "compatible")
    throw new Error("CATALOG_INCOMPATIBLE");
  const archivePath = path.join(temporaryRoot, entry.asset);
  const extractedRoot = path.join(temporaryRoot, "extracted");
  await downloadCatalogPlugin(pluginCatalogUrl, entry, archivePath);
  await extractPluginArchive(archivePath, extractedRoot);
  const directories = discoverPluginDirectories(extractedRoot);
  if (directories.length !== 1) throw new Error("CATALOG_EXTRA_PLUGINS");
  const candidate = validatePluginDirectory(directories[0], true).manifest;
  if (
    candidate.id !== entry.id ||
    candidate.version !== entry.version ||
    candidate.apiVersion !== entry.apiVersion ||
    candidate.minCoreVersion !== entry.minCoreVersion
  )
    throw new Error("CATALOG_MANIFEST_MISMATCH");
  return directories[0];
}

app.post("/api/plugins/:pluginId/install-from-catalog", async (request, response) => {
  const root = path.resolve(dataDirectory, "plugins", "catalog-downloads");
  mkdirSync(root, { recursive: true });
  const temporaryRoot = mkdtempSync(path.join(root, "install-"));
  try {
    initializePluginRunner();
    if (getAdministrativePlugin(request.params.pluginId)) {
      response.status(409).json({ error: "PLUGIN_ALREADY_INSTALLED" });
      return;
    }
    const directory = await extractCatalogPlugin(request.params.pluginId, temporaryRoot);
    const result = installPluginDirectories([directory]);
    response.status(result.installed.length ? 201 : 200).json(result);
  } catch {
    response.status(422).json({ error: "CATALOG_INSTALL_FAILED" });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

app.get("/api/methods/catalog", async (_request, response) => {
  try {
    const catalog = await fetchMethodCatalog(methodCatalogUrl);
    response.json({
      methods: catalog.methods.map((entry) => ({
        ...entry,
        compatible: methodCatalogCompatible(entry),
      })),
    });
  } catch {
    response.status(502).json({ error: "CATALOG_UNAVAILABLE" });
  }
});

app.get("/api/methods/catalog/:methodId/preview", async (request, response) => {
  try {
    const catalog = await fetchMethodCatalog(methodCatalogUrl);
    const entry = catalog.methods.find((candidate) => candidate.id === request.params.methodId);
    if (!entry) {
      response.status(404).json({ error: "METHOD_NOT_FOUND" });
      return;
    }
    response.json({ manifest: await readCatalogMethod(methodCatalogUrl, entry) });
  } catch {
    response.status(422).json({ error: "CATALOG_IMPORT_FAILED" });
  }
});

app.get("/api/plugins/updates", async (request, response) => {
  try {
    const catalog = await currentPluginCatalog(request.query.refresh === "true");
    const registry = initializePluginRunner();
    const updates = [...registry.plugins, ...registry.administrativePlugins]
      .filter((plugin) => plugin.source === "installed")
      .map((plugin) => {
        const available = catalog.plugins.find((entry) => entry.id === plugin.id);
        const compatibility = available ? pluginCatalogCompatibility(available) : undefined;
        return {
          id: plugin.id,
          currentVersion: plugin.manifest.version,
          version: available?.version,
          apiVersion: available?.apiVersion,
          minCoreVersion: available?.minCoreVersion,
          compatibility,
          updateAvailable: Boolean(
            available &&
            compatibility?.status === "compatible" &&
            isNewerPluginVersion(available.version, plugin.manifest.version),
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

function replaceInstalledPluginFromDirectory(plugin: ManagedPlugin, sourceDirectory: string) {
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
    if (pluginCatalogCompatibility(source.manifest).status !== "compatible")
      throw new Error("O plugin exige uma versão mais recente do ContentFlow.");
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

    // Another request may have replaced the same package while a catalog download awaited I/O.
    const latest = JSON.parse(
      readFileSync(path.join(destination, "contentflow.plugin.json"), "utf8"),
    ) as { id?: unknown; version?: unknown };
    if (latest.id !== plugin.id || latest.version !== plugin.manifest.version)
      throw new Error("O plugin mudou. Recarregue antes de atualizar.");

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
  const plugin = getAdministrativePlugin(request.params.pluginId);
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
  const plugin = getAdministrativePlugin(request.params.pluginId);
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
    if (pluginCatalogCompatibility(entry).status !== "compatible")
      throw new Error("A versão do catálogo é incompatível com este ContentFlow.");
    if (!isNewerPluginVersion(entry.version, plugin.manifest.version))
      throw new Error(`O plugin já está na versão mais recente (v${plugin.manifest.version}).`);

    const directory = await extractCatalogPlugin(plugin.id, temporaryRoot);
    response.json(replaceInstalledPluginFromDirectory(plugin, directory));
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
  const plugin = getAdministrativePlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  const dependencies = pluginMethodDependencies(plugin.id);
  response.json({ dependencies, historicalOutputsPreserved: true });
});

app.delete("/api/plugins/:pluginId", async (request, response) => {
  initializePluginRunner();
  const plugin = getAdministrativePlugin(request.params.pluginId);
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
    const secretKeys = "secretKeys" in plugin.manifest ? (plugin.manifest.secretKeys ?? []) : [];
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
      for (const secretKey of secretKeys) {
        await deletePluginConnectionSecret(plugin.id, connection.id, secretKey);
      }
    }
    for (const secretKey of secretKeys) {
      await deletePluginSecret(plugin.id, secretKey);
    }
    database.prepare("DELETE FROM plugin_connections WHERE plugin_id = ?").run(plugin.id);
    pluginProfileBindings.unlinkPlugin(plugin.id);
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
    registry.plugins.map(async (plugin) => {
      if (plugin.manifest.profileSetup) profileInventory(plugin);
      return {
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
          ? pluginProfileBindings.listForPlugin(plugin.id).flatMap((binding) => {
              const profile = browserProfiles.get(binding.profileId);
              return profile ? [{ id: profile.id, name: profile.name, alias: profile.alias }] : [];
            })
          : [],
      };
    }),
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
    connectionRequired: pluginConnectionRequired(manifest),
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

function channelLibraryItems(channelId: string) {
  return parseRows(
    database
      .prepare("SELECT payload FROM library_items WHERE channel_id = ? ORDER BY created_at ASC")
      .all(channelId) as { payload: string }[],
  ) as ChannelLibraryItem[];
}

const builderCollectionFieldSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  label: z.string().trim().min(1).max(200),
  shape: valueShapeSchema,
  required: z.boolean(),
});

function builderCollectionReferences(channel: Channel, collection: StrategicCollection) {
  const instructionKey = instructionCollectionKey(collection);
  const references: string[] = [];
  for (const [processType, method] of Object.entries(channel.methods ?? {}) as [
    UniversalProcess,
    ProcessMethod | undefined,
  ][]) {
    for (const block of method?.blocks ?? []) {
      if (block.collectionId === collection.id) {
        references.push(`${processType}/${block.name ?? block.type}`);
      }
      if (
        instructionVariables(block.instructions ?? "").some(
          (variable) => variable.toLowerCase() === `collections.${instructionKey}`.toLowerCase(),
        )
      ) {
        references.push(`${processType}/${block.name ?? block.type}`);
      }
    }
  }
  return [...new Set(references)];
}

function normalizeBuilderLibraryValues(
  collection: StrategicCollection,
  values: unknown,
): { ok: true; values: ChannelLibraryItem["values"] } | { ok: false; error: string } {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, error: "Informe values como um objeto." };
  }
  const normalized: ChannelLibraryItem["values"] = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    const field = collection.fields.find(
      (candidate) =>
        candidate.id === key ||
        candidate.label.trim().toLocaleLowerCase("pt-BR") === key.trim().toLocaleLowerCase("pt-BR"),
    );
    if (!field) return { ok: false, error: `Campo desconhecido na coleção: “${key}”.` };
    if (field.shape.kind === "control" && field.shape.control === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: `O campo “${field.label}” exige um número.` };
      }
      normalized[field.id] = value;
      continue;
    }
    if (
      (field.shape.kind === "content" && field.shape.family === "text") ||
      (field.shape.kind === "control" && field.shape.control === "url")
    ) {
      if (typeof value !== "string") {
        return { ok: false, error: `O campo “${field.label}” exige texto.` };
      }
      if (field.shape.kind === "control" && field.shape.control === "url" && value.trim()) {
        try {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid");
        } catch {
          return { ok: false, error: `O campo “${field.label}” exige uma URL HTTP válida.` };
        }
      }
      normalized[field.id] = value.trim();
      continue;
    }
    if (!value || typeof value !== "object") {
      return {
        ok: false,
        error: `O campo “${field.label}” exige um valor estruturado compatível com seu shape.`,
      };
    }
    normalized[field.id] = value as StoredFile | ThumbnailLayout;
  }
  for (const field of collection.fields) {
    const value = normalized[field.id];
    const empty =
      value === undefined || value === null || (typeof value === "string" && !value.trim());
    if (field.required && empty) {
      return { ok: false, error: `O campo obrigatório “${field.label}” está vazio.` };
    }
    if (!empty && field.shape.kind === "content" && field.shape.family !== "text") {
      const file = value as StoredFile;
      if (
        typeof file.id !== "string" ||
        typeof file.name !== "string" ||
        typeof file.mimeType !== "string" ||
        typeof file.size !== "number" ||
        typeof file.url !== "string"
      ) {
        return { ok: false, error: `O campo “${field.label}” exige um arquivo válido.` };
      }
      if (!file.mimeType.startsWith(`${field.shape.family}/`)) {
        return {
          ok: false,
          error: `O campo “${field.label}” exige conteúdo ${field.shape.family}.`,
        };
      }
    }
    if (!empty && field.shape.kind === "control" && field.shape.control === "thumbnail_layout") {
      const layout = value as ThumbnailLayout;
      if (layout.aspectRatio !== "16:9" || !Array.isArray(layout.boxes)) {
        return {
          ok: false,
          error: `O campo “${field.label}” exige um layout de thumbnail 16:9 válido.`,
        };
      }
    }
  }
  return { ok: true, values: normalized };
}

app.post("/api/builder/upgrade/apply", requireBuilderMcp, async (request, response) => {
  try {
    response.json(
      await userDataUpgrade.apply(request.body?.planId, request.body?.confirmBackup === true),
    );
  } catch (error) {
    const failure = error instanceof UpgradeError ? error : new UpgradeError("UPGRADE_FAILED");
    response
      .status(409)
      .json({ error: failure.code, code: failure.code, backupPath: failure.backupPath });
  }
});
registerUserDataUpgradeRoutes(app, userDataUpgrade);

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
      processOrder: effectiveProcessOrder(channel),
      definitionRevision: channel.definitionRevision ?? 0,
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
        processOrder: effectiveProcessOrder(channel),
        definitionRevision: channel.definitionRevision ?? 0,
        methods: channel.methods,
      },
      collections: channelCollections(channel.id).map((collection) => ({
        ...collection,
        itemCount: channelLibraryItems(channel.id).filter(
          (item) => item.collectionId === collection.id,
        ).length,
      })),
      plugins: plugins.map(publicBuilderPlugin),
      contract: BUILDER_METHOD_CONTRACT,
      migration: userDataUpgrade.state().required
        ? {
            ...userDataUpgrade.plan(),
            reviewMethods: userDataUpgrade.reviewChannel(channel).methods,
          }
        : undefined,
    });
  },
);

app.get("/api/builder/channels/:channelId/library", requireBuilderMcp, (request, response) => {
  const channel = readPayload<Channel>("channels", String(request.params.channelId));
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const collections = channelCollections(channel.id);
  const items = channelLibraryItems(channel.id);
  response.json({
    channelId: channel.id,
    collections: collections.map((collection) => ({
      ...collection,
      items: items.filter((item) => item.collectionId === collection.id),
    })),
  });
});

app.put(
  "/api/builder/channels/:channelId/process-order",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const order = request.body?.processOrder;
    if (!isProcessOrder(order)) {
      response.status(400).json({ error: "Ordem dos Processos inválida." });
      return;
    }
    const errors = validateProcessDependencies(order, channel.methods);
    if (errors.length) {
      response.status(422).json({ ok: false, error: errors[0], errors });
      return;
    }
    channel.processOrder = [...order];
    channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
    persistChannelDefinition(channel);
    response.json({
      ok: true,
      channelId: channel.id,
      processOrder: effectiveProcessOrder(channel),
      definitionRevision: channel.definitionRevision,
    });
  },
);

app.post("/api/builder/channels/:channelId/collections", requireBuilderMcp, (request, response) => {
  const channel = readPayload<Channel>("channels", String(request.params.channelId));
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      fields: z.array(builderCollectionFieldSchema).min(1).max(100),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: "Coleção estratégica inválida.", issues: parsed.error.issues });
    return;
  }
  const key = instructionCollectionKey({ name: parsed.data.name });
  if (
    channelCollections(channel.id).some(
      (collection) => instructionCollectionKey(collection) === key,
    )
  ) {
    response.status(409).json({ error: "Já existe uma coleção com esse nome no canal." });
    return;
  }
  const fieldIds = new Set<string>();
  const fields: StrategicCollection["fields"] = [];
  for (const field of parsed.data.fields) {
    const id = field.id ?? `collection-field-${randomUUID()}`;
    if (fieldIds.has(id)) {
      response.status(400).json({ error: "Os IDs dos campos da coleção precisam ser únicos." });
      return;
    }
    fieldIds.add(id);
    fields.push({ ...field, id });
  }
  const collection: StrategicCollection = {
    id: `collection-${randomUUID()}`,
    channelId: channel.id,
    name: parsed.data.name,
    fields,
    createdAt: new Date().toISOString(),
  };
  database
    .prepare(
      "INSERT INTO library_collections (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(collection.id, collection.channelId, JSON.stringify(collection), collection.createdAt);
  response.status(201).json({ ok: true, collection });
});

app.put(
  "/api/builder/channels/:channelId/collections/:collectionId",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const existing = channelCollections(channel.id).find(
      (collection) => collection.id === String(request.params.collectionId),
    );
    if (!existing) {
      response.status(404).json({ error: "Coleção não encontrada." });
      return;
    }
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        fields: z.array(builderCollectionFieldSchema).min(1).max(100),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "Coleção estratégica inválida.", issues: parsed.error.issues });
      return;
    }
    if (
      channelLibraryItems(channel.id).some(
        (item) => item.collectionId === existing.id && hasLibraryReservation(item.id),
      )
    ) {
      response.status(409).json({ error: "Esta coleção possui itens reservados." });
      return;
    }
    const nextKey = instructionCollectionKey({ name: parsed.data.name });
    if (
      channelCollections(channel.id).some(
        (collection) =>
          collection.id !== existing.id && instructionCollectionKey(collection) === nextKey,
      )
    ) {
      response.status(409).json({ error: "Já existe uma coleção com esse nome no canal." });
      return;
    }
    const existingByLabel = new Map(
      existing.fields.map((field) => [field.label.trim().toLocaleLowerCase("pt-BR"), field]),
    );
    const fields = parsed.data.fields.map((field) => ({
      ...field,
      id:
        field.id ??
        existingByLabel.get(field.label.trim().toLocaleLowerCase("pt-BR"))?.id ??
        `collection-field-${randomUUID()}`,
    }));
    if (new Set(fields.map((field) => field.id)).size !== fields.length) {
      response.status(400).json({ error: "Os IDs dos campos da coleção precisam ser únicos." });
      return;
    }
    const references = builderCollectionReferences(channel, existing);
    const removed = existing.fields.filter(
      (field) => !fields.some((candidate) => candidate.id === field.id),
    );
    const changedTypes = existing.fields.filter((field) => {
      const next = fields.find((candidate) => candidate.id === field.id);
      return next && JSON.stringify(next.shape) !== JSON.stringify(field.shape);
    });
    if (references.length && (removed.length || changedTypes.length)) {
      response.status(422).json({
        ok: false,
        error:
          "A coleção está em uso por Métodos. Preserve os campos existentes e seus tipos enquanto houver referências.",
        references,
      });
      return;
    }
    const oldKey = instructionCollectionKey(existing);
    const updated: StrategicCollection = {
      ...existing,
      name: parsed.data.name,
      fields,
    };
    database
      .prepare("UPDATE library_collections SET payload = ? WHERE id = ?")
      .run(JSON.stringify(updated), updated.id);
    if (oldKey !== nextKey) {
      const matcher = new RegExp(`\\{\\{\\s*collections\\.${oldKey}\\s*\\}\\}`, "gi");
      let changed = false;
      for (const method of Object.values(channel.methods ?? {})) {
        for (const block of method?.blocks ?? []) {
          const current = block.instructions ?? "";
          const next = current.replace(matcher, `{{collections.${nextKey}}}`);
          if (next !== current) {
            block.instructions = next;
            changed = true;
          }
        }
      }
      if (changed) {
        channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
        persistChannelDefinition(channel);
      }
    }
    response.json({ ok: true, collection: updated });
  },
);

app.delete(
  "/api/builder/channels/:channelId/collections/:collectionId",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const collection = channelCollections(channel.id).find(
      (candidate) => candidate.id === String(request.params.collectionId),
    );
    if (!collection) {
      response.status(404).json({ error: "Coleção não encontrada." });
      return;
    }
    const references = builderCollectionReferences(channel, collection);
    if (references.length) {
      response.status(422).json({
        ok: false,
        error: "A coleção está em uso por Métodos e não pode ser excluída.",
        references,
      });
      return;
    }
    const remove = database.transaction(() => {
      if (
        channelLibraryItems(channel.id).some(
          (item) => item.collectionId === collection.id && hasLibraryReservation(item.id),
        )
      ) {
        throw new Error("Esta coleção possui itens reservados.");
      }
      for (const item of channelLibraryItems(channel.id).filter(
        (candidate) => candidate.collectionId === collection.id,
      )) {
        database.prepare("DELETE FROM library_items WHERE id = ?").run(item.id);
      }
      database.prepare("DELETE FROM library_collections WHERE id = ?").run(collection.id);
    });
    remove();
    response.json({ ok: true, deletedCollectionId: collection.id });
  },
);

app.post(
  "/api/builder/channels/:channelId/collections/:collectionId/items",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const collection = channelCollections(channel.id).find(
      (candidate) => candidate.id === String(request.params.collectionId),
    );
    if (!collection) {
      response.status(404).json({ error: "Coleção não encontrada." });
      return;
    }
    const normalized = normalizeBuilderLibraryValues(collection, request.body?.values);
    if (!normalized.ok) {
      response.status(400).json({ error: normalized.error });
      return;
    }
    const item: ChannelLibraryItem = {
      id: `library-item-${randomUUID()}`,
      channelId: channel.id,
      collectionId: collection.id,
      values: normalized.values,
      createdAt: new Date().toISOString(),
    };
    database
      .prepare(
        "INSERT INTO library_items (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(item.id, item.channelId, JSON.stringify(item), item.createdAt);
    response.status(201).json({ ok: true, item });
  },
);

app.put(
  "/api/builder/channels/:channelId/collections/:collectionId/items/:itemId",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const collection = channelCollections(channel.id).find(
      (candidate) => candidate.id === String(request.params.collectionId),
    );
    const item = channelLibraryItems(channel.id).find(
      (candidate) =>
        candidate.id === String(request.params.itemId) &&
        candidate.collectionId === String(request.params.collectionId),
    );
    if (!collection || !item) {
      response.status(404).json({ error: "Coleção ou item não encontrado." });
      return;
    }
    const normalized = normalizeBuilderLibraryValues(collection, request.body?.values);
    if (!normalized.ok) {
      response.status(400).json({ error: normalized.error });
      return;
    }
    const updated: ChannelLibraryItem = { ...item, values: normalized.values };
    if (hasLibraryReservation(item.id)) {
      response.status(409).json({ error: "Este item está reservado por outra execução." });
      return;
    }
    database
      .prepare("UPDATE library_items SET payload = ? WHERE id = ?")
      .run(JSON.stringify(updated), updated.id);
    response.json({ ok: true, item: updated });
  },
);

app.delete(
  "/api/builder/channels/:channelId/collections/:collectionId/items/:itemId",
  requireBuilderMcp,
  (request, response) => {
    const channel = readPayload<Channel>("channels", String(request.params.channelId));
    if (!channel) {
      response.status(404).json({ error: "Canal não encontrado." });
      return;
    }
    const item = channelLibraryItems(channel.id).find(
      (candidate) =>
        candidate.id === String(request.params.itemId) &&
        candidate.collectionId === String(request.params.collectionId),
    );
    if (!item) {
      response.status(404).json({ error: "Item não encontrado." });
      return;
    }
    if (hasLibraryReservation(item.id)) {
      response.status(409).json({ error: "Este item está reservado por outra execução." });
      return;
    }
    database.prepare("DELETE FROM library_items WHERE id = ?").run(item.id);
    response.json({ ok: true, deletedItemId: item.id });
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
      channel: userDataUpgrade.state().required ? userDataUpgrade.reviewChannel(channel) : channel,
      methods: request.body?.methods,
      plugins: await builderPluginContexts(),
      collections: channelCollections(channel.id),
      migrationReview: userDataUpgrade.state().required,
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
    channel: userDataUpgrade.state().required ? userDataUpgrade.reviewChannel(channel) : channel,
    methods: request.body?.methods,
    plugins: await builderPluginContexts(),
    collections: channelCollections(channel.id),
    migrationReview: userDataUpgrade.state().required,
  });
  if (!result.ok || !result.methods) {
    response.status(422).json(result);
    return;
  }
  if (userDataUpgrade.state().required) {
    try {
      const plan = userDataUpgrade.proposeMethods(channel.id, result.methods, request.body?.planId);
      response.json({
        ok: true,
        staged: true,
        channelId: channel.id,
        methods: result.methods,
        warnings: result.warnings,
        migration: plan,
      });
    } catch (error) {
      response
        .status(409)
        .json({ ok: false, error: error instanceof Error ? error.message : "UPGRADE_FAILED" });
    }
    return;
  }
  for (const [processType, method] of Object.entries(result.methods) as [
    UniversalProcess,
    ProcessMethod,
  ][]) {
    const localProfiles = persistLocalProfileExecution(method.blocks);
    if (localProfiles.errors.length) {
      response
        .status(422)
        .json({ ok: false, errors: localProfiles.errors, warnings: result.warnings });
      return;
    }
    channel.methods[processType] = {
      ...method,
      imageUrl:
        typeof method.imageUrl === "string" &&
        (/^data:image\/(webp|png|jpeg);base64,/.test(method.imageUrl) ||
          /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(method.imageUrl))
          ? method.imageUrl.slice(0, 1_500_000)
          : undefined,
      blocks: localProfiles.blocks,
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
  persistChannelDefinition(channel);
  response.json({
    ok: true,
    channelId: channel.id,
    appliedProcesses: Object.keys(result.methods),
    warnings: result.warnings,
    methods: channel.methods,
  });
});

type ExecutePluginBlockInput = {
  projectId?: string;
  processType?: UniversalProcess;
  blockId?: string;
  pluginId?: string;
  parameters?: Record<string, unknown>;
};

type ExecutePluginBlockResult = {
  status: number;
  body: Record<string, unknown>;
};

async function executePluginBlockInternal(
  body: ExecutePluginBlockInput,
): Promise<ExecutePluginBlockResult> {
  if (!userDataUpgrade.backgroundAllowed())
    return { status: 409, body: { error: "USER_DATA_UPGRADE_REQUIRED" } };
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
    return { status: 400, body: { error: "Solicitação de execução inválida." } };
  }

  const plugin = getRegisteredPlugin(body.pluginId);
  if (!plugin) {
    return { status: 404, body: { error: "Plugin não encontrado no registro local." } };
  }
  if (!plugin.executable || !pluginConsentIsCurrent(plugin)) {
    return {
      status: 403,
      body: { error: "Ative este plugin e confirme suas permissões na Central de Plugins." },
    };
  }

  const project = readPayload<Project>("projects", body.projectId);
  const execution = executionFor(body.projectId, body.processType);
  const channel = project ? readPayload<Channel>("channels", project.channelId) : undefined;
  if (!project || !execution || !channel) {
    return { status: 404, body: { error: "Projeto ou execução não encontrados." } };
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === body.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === body.blockId);
  if (!block || !blockExecution) {
    return {
      status: 404,
      body: { error: "Bloco não encontrado no snapshot desta execução." },
    };
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
    return {
      status: pending ? 202 : existingJob.status === "completed" ? 200 : 409,
      body: {
        ok: pending || existingJob.status === "completed",
        pending,
        job: publicPluginJob(existingJob),
        execution: currentExecution,
        project: currentProject,
        error: existingJob.error,
      },
    };
  }
  if (blockExecution.status !== "blocked_executor" || block.plugin?.pluginId !== plugin.id) {
    return {
      status: 409,
      body: { error: "Este bloco não está pronto ou não está vinculado ao plugin informado." },
    };
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
    return { status: 422, body: { error: "A capacidade não é compatível com este bloco." } };
  }

  const projectExecutions = (
    database
      .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
      .all(project.id) as { payload: string }[]
  ).map((row) => normalizeExecutionDeliveries(parseStoredExecution(row.payload)));
  let conversation: PluginExecutionRequest["conversation"];
  let resolvedProfileExecution: ReturnType<typeof resolvedProfileExecutionForBlock>;
  try {
    resolvedProfileExecution = resolvedProfileExecutionForBlock(plugin, block);
    const profileConfigurationKey = plugin.manifest.profileSetup?.configurationKey;
    const configuredProfileAlias = profileConfigurationKey
      ? String(block.plugin?.configuration[profileConfigurationKey] ?? "").trim() || undefined
      : undefined;
    const configuredBrowserProfile = resolvedProfileExecution?.profiles[0]
      ? {
          profileId: resolvedProfileExecution.profiles[0].profileId,
          alias: resolvedProfileExecution.profiles[0].alias,
        }
      : configuredProfileAlias
        ? browserProfileSnapshot(plugin, configuredProfileAlias)
        : undefined;
    conversation = resolvePluginConversation({
      block,
      blockExecution,
      execution,
      projectExecutions,
      processOrder: projectProcessOrder(project),
      pluginId: plugin.id,
      supportsContinuation: plugin.manifest.supportsConversationContinuation === true,
      profileSetup: plugin.manifest.profileSetup,
      profileId: configuredBrowserProfile?.profileId,
    });
  } catch (error) {
    return {
      status: 422,
      body: {
        error: error instanceof Error ? error.message : "Não foi possível resolver a conversa.",
      },
    };
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
  ).map((row) => normalizeExecutionDeliveries(parseStoredExecution(row.payload)));
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
    return {
      status: 422,
      body: {
        error: `Entradas ausentes: ${missingInputs.map((item) => item.input.label).join(", ")}.`,
      },
    };
  }

  const usedInputPorts = new Set<string>();
  const assignedInputs = resolvedInputs.map((item) => {
    const port = selectPluginInputPort(item.input, capability.inputPorts, usedInputPorts);
    if (port) usedInputPorts.add(port.key);
    return { resolved: item, port };
  });
  const unsupportedInputs = assignedInputs.filter((item) => !item.port);
  if (unsupportedInputs.length) {
    return {
      status: 422,
      body: {
        error: `O plugin não aceita: ${unsupportedInputs
          .map((item) => item.resolved.input.label)
          .join(", ")}.`,
      },
    };
  }
  const inputContract = assignedInputs.map(({ resolved: item }) => ({
    id: item.input.id,
    portKey: item.input.portKey!,
    label: item.input.label,
    shape: item.input.shape,
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
  if (block.type === "VALIDAR") {
    const validation = block.validation;
    const validationIndex = execution.methodSnapshot.blocks.findIndex(
      (candidate) => candidate.id === block.id,
    );
    const targetIndex = execution.methodSnapshot.blocks.findIndex(
      (candidate) => candidate.id === validation?.targetBlockId,
    );
    const targetBlock = execution.methodSnapshot.blocks[targetIndex];
    const targetExecution = execution.blocks.find(
      (candidate) => candidate.blockId === validation?.targetBlockId,
    );
    if (
      !validation?.targetBlockId ||
      targetIndex < 0 ||
      targetIndex >= validationIndex ||
      !targetBlock ||
      targetBlock.type === "VALIDAR" ||
      !targetExecution
    ) {
      return {
        status: 422,
        body: { error: "O bloco validado não está configurado no snapshot da execução." },
      };
    }
    const requiresTargetOutput = validation.mode !== "approval";
    if (requiresTargetOutput && !validation.targetOutputKey) {
      return {
        status: 422,
        body: { error: "A validação precisa declarar qual saída contém as opções." },
      };
    }
    const targetOutput = validation.targetOutputKey
      ? targetBlock.outputs?.find((field) => field.key === validation.targetOutputKey)
      : undefined;
    if (validation.targetOutputKey && !targetOutput) {
      return {
        status: 422,
        body: { error: "A saída configurada para a validação não existe no bloco validado." },
      };
    }
    if (!targetOutput && validation.targetPortKey) {
      return {
        status: 422,
        body: { error: "A porta do alvo exige uma saída explícita do bloco validado." },
      };
    }
    if (targetOutput) {
      const targetValue = targetExecution.values[targetOutput.key];
      const targetPort = validation.targetPortKey
        ? capability.inputPorts.find(
            (port) =>
              port.key === validation.targetPortKey &&
              areValueShapesCompatible(targetOutput.shape, port.shape),
          )
        : undefined;
      if (!targetPort || inputs[targetPort.key] !== undefined) {
        return {
          status: 422,
          body: { error: "Vincule explicitamente uma porta compatível ao alvo da validação." },
        };
      }
      if (targetValue === undefined) {
        return {
          status: 422,
          body: { error: "O resultado configurado para a validação ainda não está disponível." },
        };
      }
      inputs[targetPort.key] = targetValue;
      inputContract.push({
        id: `validation-${targetBlock.id}-${targetOutput.key}`,
        portKey: targetPort.key,
        label: targetOutput.label,
        shape: targetOutput.shape,
        presentation: targetOutput.presentation,
      });
      usedInputPorts.add(targetPort.key);
    }
  }
  // A plugin receives values only through bindings that are visible in the
  // Method. Outputs from previous blocks and processes must never be inferred
  // into an unbound port or serialized as hidden textual context.
  const selectedCollection =
    block.type === "ESCOLHER"
      ? collections.find((item) => item.id === block.collectionId)
      : undefined;
  const projectExecutionsForReservations =
    block.type === "ESCOLHER" ? storedLibraryExecutions() : [];
  const selectedCollectionItems = selectedCollection
    ? libraryItems.filter(
        (item) =>
          item.collectionId === selectedCollection.id &&
          !libraryReservation(item.id, projectExecutionsForReservations),
      )
    : [];
  if (block.type === "ESCOLHER" && (!selectedCollection || !selectedCollectionItems.length)) {
    return {
      status: 422,
      body: {
        error: selectedCollection
          ? "A coleção vinculada ao bloco não possui itens para escolher."
          : "O bloco Escolher precisa estar vinculado a uma coleção do canal.",
      },
    };
  }

  const validatedOutputs = validatePluginOutputContract(
    block.outputs ?? [],
    capability.outputPorts,
  );
  if (validatedOutputs.unsupportedFields.length) {
    return {
      status: 422,
      body: {
        error: `O plugin não consegue entregar: ${validatedOutputs.unsupportedFields
          .map((field) => field.label)
          .join(", ")}. Revise o vínculo da entrega no painel do plugin.`,
      },
    };
  }

  const outputContract: PluginFieldContract[] = validatedOutputs.outputContract;
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
      sourceKey: resolved.resolvedSourceKey ?? resolved.input.id,
      portKey: port!.key,
      value: resolved.value ?? null,
    })),
    parameters: executionParameters,
    collections: collections.map((collection) => ({
      name: collection.name,
      items: libraryItems
        .filter((item) => item.collectionId === collection.id)
        .map((item) => collectionItemValuesForPlugin(collection, item)),
    })),
  });
  if (resolvedInstruction.unresolved.length) {
    return {
      status: 422,
      body: {
        error: `Variáveis sem valor no prompt: ${resolvedInstruction.unresolved
          .map((variable) => `{{${variable}}}`)
          .join(", ")}. Revise as entradas conectadas ao bloco.`,
      },
    };
  }
  if (capability.instructionUsage === "required" && !resolvedInstruction.instruction) {
    return {
      status: 422,
      body: {
        error: `Defina o prompt do bloco “${block.name ?? block.type}” antes de executar.`,
      },
    };
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
    return {
      status: 422,
      body: {
        error: error instanceof Error ? error.message : "Não foi possível carregar a conexão.",
      },
    };
  }
  const pluginSecrets: Record<string, string> = { ...resolvedConnection.secrets };
  if (pluginConnectionRequired(plugin.manifest) && !Object.keys(pluginSecrets).length) {
    return {
      status: 422,
      body: { error: "Crie ou associe uma conta local válida a este bloco." },
    };
  }
  const requestConfiguration = {
    ...block.plugin.configuration,
    ...executionParameters,
  };
  if (resolvedProfileExecution) {
    delete requestConfiguration[resolvedProfileExecution.configurationKey];
    const fallbackConfigurationKey = plugin.manifest.profileSetup?.fallbackConfigurationKey;
    if (fallbackConfigurationKey) delete requestConfiguration[fallbackConfigurationKey];
  }
  const pluginRequest: PluginExecutionRequest = {
    executionId: execution.id,
    traceId: randomUUID(),
    blockId: block.id,
    capabilityId: capability.id,
    attempt: blockExecution.attempt ?? 1,
    invocation: { mode: "start" },
    configuration: requestConfiguration,
    settings: resolvedConnection.connectionId
      ? { connectionId: resolvedConnection.connectionId }
      : {},
    inputs,
    instructionContextInputs,
    inputContract,
    inputDeliveries: resolvedInputs.map((item) => ({
      inputId: item.input.id,
      portKey: item.input.portKey!,
      deliveryId: item.sourceDeliveryId,
      itemIds: item.sourceDeliveryItemIds ?? [],
      items: item.sourceDeliveryItems?.map((sourceItem) => ({
        id: sourceItem.id,
        value: structuredClone(sourceItem.value) as RuntimeValue,
        references: sourceItem.references,
      })),
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
    return { status: 404, body: { error: "Execução removida." } };
  }
  if (
    latestExecution.status === "cancelled" ||
    (latestExecution.revision ?? 0) !== (execution.revision ?? 0)
  ) {
    return {
      status: 202,
      body: {
        ok: true,
        execution: latestExecution,
        project: readPayload<Project>("projects", project.id),
      },
    };
  }
  const executionTimeoutMs = capability.execution.defaultTimeoutMs ?? 60_000;
  const previousExecutionItems = blockExecution.items;
  const materializedInputItems = materializeReceivedInputWorkUnits(
    pluginRequest,
    previousExecutionItems,
    workItemPolicy(capability, pluginRequest)?.inputPort,
  );
  const requestedRetryScope = blockExecution.itemRetryScope ?? "all";
  const itemCapability = capability;
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
    declaredItemOrchestration(itemCapability, pluginRequest, materializedInputItems);
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
    blockExecution.profileLaneProgress = undefined;
  }
  const resolvedFallback =
    resolvedProfileExecution?.mode === "fallback"
      ? {
          configurationKey: resolvedProfileExecution.configurationKey,
          candidates: resolvedProfileExecution.profiles.map((profile) => profile.alias),
          activeIndex: 0,
          history: [],
        }
      : undefined;
  const legacyFallback = resolvedProfileExecution
    ? undefined
    : orderedProfileCandidates(plugin.manifest, pluginRequest.configuration);
  const initialResolvedProfile = resolvedProfileExecution?.profiles[0];
  let pendingJob = createPersistentPluginJob({
    pluginId: plugin.id,
    pluginVersion: plugin.manifest.version,
    request: pluginRequest,
    timeoutMs: executionTimeoutMs,
    profileFallback: resolvedFallback ?? legacyFallback,
    browserProfile: initialResolvedProfile
      ? { profileId: initialResolvedProfile.profileId, alias: initialResolvedProfile.alias }
      : browserProfileSnapshot(
          plugin,
          legacyFallback?.candidates[0] ??
            (plugin.manifest.profileSetup?.configurationKey
              ? String(
                  pluginRequest.configuration[plugin.manifest.profileSetup.configurationKey] ?? "",
                ).trim() || undefined
              : undefined),
        ),
    profileExecution: resolvedProfileExecution,
    itemOrchestration,
    retryScope,
  });
  const profileLanePool = materializeProfileLanePool(pendingJob, capability);
  if (profileLanePool) pendingJob = { ...pendingJob, profileLanePool };
  if (selectedOrchestration) pendingJob.partialValues = structuredClone(blockExecution.values);
  const createdJob = commitPluginJobTransition(project.id, () => {
    const created = pluginJobs.create(pendingJob);
    blockExecution.status = "in_progress";
    blockExecution.traceId = pluginRequest.traceId;
    blockExecution.itemProgress = itemProgressForJob(created);
    blockExecution.profileLaneProgress = profileLaneProgressForJob(created);
    blockExecution.items = blockExecutionItemsForJob(created, materializedInputItems);
    blockExecution.itemRetryScope = undefined;
    blockExecution.itemRetryId = undefined;
    blockExecution.progress = itemOrchestration
      ? (blockExecution.itemProgress?.completed ?? 0) / itemOrchestration.items.length
      : 0;
    blockExecution.progressMessage = "Iniciando job…";
    execution.status = "running";
    persistPluginExecution(execution, project);
    return created;
  });

  if (capability.execution.mode === "async") {
    void processDuePluginJobs();
    return {
      status: 202,
      body: {
        ok: true,
        pending: true,
        job: publicPluginJob(createdJob),
        execution,
        project,
        values: {},
      },
    };
  }

  const job = await processPluginJob(createdJob.id, pluginSecrets);
  const currentExecution = executionById(execution.id) ?? execution;
  const currentProject = readPayload<Project>("projects", project.id) ?? project;
  if (!job || ["failed", "abandoned", "cancelled"].includes(job.status)) {
    return {
      status: job?.status === "cancelled" ? 409 : 422,
      body: {
        error: job?.error ?? job?.message ?? "O job do plugin não pôde ser iniciado.",
        job: job ? publicPluginJob(job) : undefined,
        execution: currentExecution,
        project: currentProject,
      },
    };
  }
  const pending = ["starting", "pending", "cancel_requested"].includes(job.status);
  return {
    status: pending ? 202 : 200,
    body: {
      ok: true,
      pending,
      job: publicPluginJob(job),
      execution: currentExecution,
      project: currentProject,
      values: job.partialValues,
    },
  };
}

app.post("/api/execute-block", async (request, response) => {
  const result = await executePluginBlockInternal(request.body as ExecutePluginBlockInput);
  response.status(result.status).json(result.body);
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
    const reservationExecutions = storedLibraryExecutions();
    const read = <T>(table: string, order: "ASC" | "DESC" = "DESC") =>
      (
        database.prepare(`SELECT payload FROM ${table} ORDER BY rowid ${order}`).all() as {
          payload: string;
        }[]
      ).map((row) => JSON.parse(row.payload) as T);
    return {
      revision: (
        database.prepare("SELECT revision FROM state_clock WHERE id = 1").get() as {
          revision: number;
        }
      ).revision,
      upgrade: userDataUpgrade.state(),
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
      executions: (
        database.prepare("SELECT payload FROM process_executions ORDER BY rowid DESC").all() as {
          payload: string;
        }[]
      ).map((row) => parseStoredExecution(row.payload)),
      orchestrators: read<ExecutionOrchestrator>("execution_orchestrators"),
      libraryItems: read<ChannelLibraryItem>("library_items", "ASC").map((item) => ({
        ...item,
        reservation: libraryReservation(item.id, reservationExecutions),
      })),
      libraryCollections: read<StrategicCollection>("library_collections"),
    };
  })();
}

app.get(
  "/api/state/events",
  stateEvents(
    () =>
      (
        database.prepare("SELECT revision FROM state_clock WHERE id = 1").get() as {
          revision: number;
        }
      ).revision,
  ),
);

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
      const engine = executionCommands({
        ...state,
        adaptMethod: (method) => {
          const parsed = processMethodV3Schema.safeParse(method);
          return parsed.success ? parsed.data : undefined;
        },
      });
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
          result = engine.acceptBlockDelivery(execution!.id, command.blockId ?? "", values);
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
          const channel = state.channels.find((item) => item.id === project.channelId);
          if (!channel) throw new Error("Canal não encontrado.");
          if (prior) database.prepare("DELETE FROM process_executions WHERE id = ?").run(prior.id);
          refreshProjectProcessStrategy(project, channel, command.processType);
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
        commitLibraryConsumption(updated);
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
            serializeStoredExecution(updated),
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
    if (monitorEnabled())
      for (const row of database.prepare("SELECT payload FROM process_executions").all() as {
        payload: string;
      }[])
        observeCommittedExecution(parseStoredExecution(row.payload));
    response.json({ result, state: stateSnapshot() });
    const projectId =
      command.projectId ??
      (command.executionId ? executionById(command.executionId)?.projectId : undefined);
    if (projectId) {
      for (const row of database
        .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
        .all(projectId) as { payload: string }[])
        scheduleAutomaticPluginBlock(parseStoredExecution(row.payload));
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
  if (!userDataUpgrade.backgroundAllowed()) return;
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
        (item) => executionOrchestratorIsActive(item) && item.projectIds.includes(project.id),
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
      !(channel.methods[next] ?? project.strategySnapshot?.methods[next])?.blocks.length
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

app.delete("/api/channels/:id/methods/:processType", (request, response) => {
  const channel = readPayload<Channel>("channels", String(request.params.id));
  const processType = request.params.processType as UniversalProcess;
  if (!channel) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  if (!PROCESS_ORDER.includes(processType)) {
    response.status(400).json({ error: "Método inválido." });
    return;
  }
  if (request.body?.definitionRevision !== (channel.definitionRevision ?? 0)) {
    response.status(409).json({
      error: "A definição do Canal mudou em outra aba. Recarregue antes de salvar o Método.",
    });
    return;
  }
  channel.methods[processType] = createEmptyMethods()[processType];
  const errors = validateProcessDependencies(effectiveProcessOrder(channel), channel.methods);
  if (errors.length) {
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  try {
    persistChannelDefinition(channel);
    response.json({
      method: channel.methods[processType],
      definitionRevision: channel.definitionRevision,
    });
  } catch (error) {
    response.status(409).json({
      error: error instanceof Error ? error.message : "Não foi possível apagar o Método.",
    });
  }
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
  const incomingMethod: ProcessMethod = {
    contractVersion: 3,
    name:
      typeof request.body?.name === "string" && request.body.name.trim()
        ? request.body.name.trim().slice(0, 200)
        : channel.methods[processType]?.name || `Método de ${PROCESS_META[processType].label}`,
    imageUrl: request.body?.imageUrl,
    processType,
    blocks: request.body.blocks,
  };
  const parsedMethod = processMethodV3Schema.safeParse(incomingMethod);
  if (!parsedMethod.success) {
    const errors = parsedMethod.error.issues.map((issue) => issue.message);
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  const localProfiles = persistLocalProfileExecution(
    normalizeMethodBlocks(parsedMethod.data.blocks, processType),
  );
  if (localProfiles.errors.length) {
    response.status(422).json({ error: localProfiles.errors[0], errors: localProfiles.errors });
    return;
  }
  const nextMethod: ProcessMethod = {
    contractVersion: 3,
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
    blocks: localProfiles.blocks,
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
  persistChannelDefinition(channel);
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
  const preparedEntries: Array<[UniversalProcess, ProcessMethod]> = [];
  for (const [processType, method] of entries) {
    const parsedMethod = processMethodV3Schema.safeParse(method);
    if (!parsedMethod.success) {
      const errors = parsedMethod.error.issues.map((issue) => issue.message);
      response.status(422).json({ error: errors[0], errors });
      return;
    }
    const localProfiles = persistLocalProfileExecution(
      normalizeMethodBlocks(parsedMethod.data.blocks, processType),
    );
    if (localProfiles.errors.length) {
      response.status(422).json({ error: localProfiles.errors[0], errors: localProfiles.errors });
      return;
    }
    preparedEntries.push([
      processType,
      {
        contractVersion: 3,
        name:
          typeof parsedMethod.data.name === "string" && parsedMethod.data.name.trim()
            ? parsedMethod.data.name.trim().slice(0, 200)
            : `Método de ${PROCESS_META[processType].label}`,
        imageUrl:
          typeof parsedMethod.data.imageUrl === "string" &&
          (/^data:image\/(webp|png|jpeg);base64,/.test(parsedMethod.data.imageUrl) ||
            /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(parsedMethod.data.imageUrl))
            ? parsedMethod.data.imageUrl.slice(0, 1_500_000)
            : undefined,
        processType,
        blocks: localProfiles.blocks,
      },
    ]);
  }
  for (const [processType, method] of preparedEntries) {
    channel.methods[processType] = {
      ...method,
    };
  }
  const errors = validateProcessDependencies(effectiveProcessOrder(channel), channel.methods);
  if (errors.length) {
    response.status(422).json({ error: errors[0], errors });
    return;
  }
  channel.definitionRevision = (channel.definitionRevision ?? 0) + 1;
  persistChannelDefinition(channel);
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
  persistChannelDefinition(channel);
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
    collections?: PortableCollection[];
    itemsIncluded?: boolean;
    items?: PortableLibraryItem[];
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

  const adaptedSelected: ProcessMethod[] = [];
  for (const method of selected) {
    const parsedMethod = processMethodV3Schema.safeParse(method);
    if (!parsedMethod.success) {
      const errors = parsedMethod.error.issues.map((issue) => issue.message);
      response.status(422).json({ error: errors[0], errors });
      return;
    }
    adaptedSelected.push(parsedMethod.data);
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

  let portableItems: PortableLibraryItem[] = [];
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
      usage: collection.usage ?? "fixed",
      fields: collection.fields.map((field) => {
        const fieldId = `field-${randomUUID()}`;
        fieldIds.set(`${collection.key}:${field.key}`, fieldId);
        return {
          id: fieldId,
          label: field.label,
          shape: field.shape,
          required: field.required,
        };
      }),
      createdAt,
    };
  });

  const localCopy = Boolean(body.sourceChannelId);
  const copied: ProcessMethod[] = copyImportedMethods(
    adaptedSelected,
    (prefix) => `${prefix}-${randomUUID()}`,
    {
      collectionIds,
      preserveLocalConnections: body.preserveLocalConnections === true,
      remapLocalProfileExecution: localCopy
        ? (pluginId, policy) => {
            const plugin = getRegisteredPlugin(pluginId);
            const validation = validateLocalProfileExecution({
              policy,
              profileSetup: plugin?.manifest.profileSetup,
              isBoundProfile: (profileId) =>
                Boolean(pluginProfileBindings.get(pluginId, profileId)),
            });
            return validation.policy;
          }
        : undefined,
    },
  );
  if (!localCopy) {
    for (const method of copied) {
      method.blocks = clearImportedProfileAssociations({
        blocks: method.blocks,
        profileSetupForPlugin: (pluginId) => getRegisteredPlugin(pluginId)?.manifest.profileSetup,
      });
    }
  } else {
    for (const method of copied) {
      const sourceMethod = adaptedSelected.find(
        (candidate) => candidate.processType === method.processType,
      );
      method.blocks = method.blocks.map((block, index) => {
        const sourceBlock = sourceMethod?.blocks[index];
        if (!sourceBlock?.plugin?.profileExecution || block.plugin?.profileExecution) return block;
        return clearImportedProfileAssociations({
          blocks: [block],
          profileSetupForPlugin: (pluginId) => getRegisteredPlugin(pluginId)?.manifest.profileSetup,
        })[0];
      });
    }
  }
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
      persistChannelDefinition(channel);
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
  const result = persistChannelDefinition(channel);
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
  const cancelledExecutions: string[] = [];
  const remove = database.transaction((channelId: string) => {
    const projects = database
      .prepare("SELECT id FROM projects WHERE channel_id = ?")
      .all(channelId) as { id: string }[];
    for (const project of projects) {
      for (const row of database
        .prepare("SELECT id FROM process_executions WHERE project_id = ?")
        .all(project.id) as { id: string }[]) {
        pluginJobs.requestCancellation(row.id);
        cancelledExecutions.push(row.id);
      }
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
  for (const executionId of cancelledExecutions) abortActivePluginInvocations(executionId);
  response.status(result.changes ? 204 : 404).end();
});

function executionOrchestratorState(orchestrator: ExecutionOrchestrator) {
  const projects = orchestrator.projectIds
    .map((id) => readPayload<Project>("projects", id))
    .filter((project): project is Project => !!project);
  const executions = orchestrator.projectIds.flatMap((projectId) =>
    (
      database
        .prepare(
          "SELECT payload FROM process_executions WHERE project_id = ? ORDER BY updated_at DESC",
        )
        .all(projectId) as { payload: string }[]
    ).map((row) => parseStoredExecution(row.payload)),
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
    (item) => item.id !== orchestrator.id && executionOrchestratorIsActive(item),
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

  if (orchestrator.strategyVersion === 5) {
    for (const projectId of orchestrator.projectIds) {
      const project = readPayload<Project>("projects", projectId);
      if (!project) continue;
      for (const row of database
        .prepare("SELECT payload FROM process_executions WHERE project_id = ?")
        .all(projectId) as { payload: string }[]) {
        const execution = parseStoredExecution(row.payload);
        if (execution.status === "completed" || execution.status === "cancelled") continue;
        cancelStoredProcessExecution(execution, project);
      }
    }
  } else if (orchestrator.currentProjectId && orchestrator.currentProcessType) {
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
    executionOrchestratorIsActive(orchestrator),
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
      executionOrchestratorIsActive(orchestrator),
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
      executionOrchestratorIsActive(orchestrator) &&
      orchestrator.projectIds.includes(request.params.id),
  );
  if (activeOrchestrator) {
    response.status(409).json({
      error: "Pare a fila do orquestrador antes de excluir um projeto vinculado a ela.",
    });
    return;
  }
  const cancelledExecutions: string[] = [];
  const remove = database.transaction((projectId: string) => {
    for (const row of database
      .prepare("SELECT id FROM process_executions WHERE project_id = ?")
      .all(projectId) as { id: string }[]) {
      pluginJobs.requestCancellation(row.id);
      cancelledExecutions.push(row.id);
    }
    database.prepare("DELETE FROM process_executions WHERE project_id = ?").run(projectId);
    return database.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  });
  const result = remove(request.params.id) as { changes: number };
  for (const executionId of cancelledExecutions) abortActivePluginInvocations(executionId);
  response.status(result.changes ? 204 : 404).end();
});

app.get("/api/projects/:id/deliveries", (request, response) => {
  const executions = (
    database
      .prepare(
        "SELECT payload FROM process_executions WHERE project_id = ? ORDER BY updated_at ASC",
      )
      .all(request.params.id) as { payload: string }[]
  ).map((row) => normalizeExecutionDeliveries(parseStoredExecution(row.payload)));
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
    const execution = parseStoredExecution(row.payload);
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
    const execution = parseStoredExecution(row.payload);
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

app.get("/api/executions/:id/browser-diagnostics", (request, response) => {
  const execution = executionById(request.params.id);
  if (!execution) {
    response.status(404).json({ error: "Execução não encontrada." });
    return;
  }
  response.json(exportBrowserDiagnostics(execution.id, pluginJobs.listForExecution(execution.id)));
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
  const cancellation = cancelStoredProcessExecution(execution, project);
  if (!cancellation.ok) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de continuar." });
    return;
  }
  response.status(202).json({ ok: true, execution, project });
});

app.post("/api/executions", (request, response) => {
  const parsed = parseCanonicalExecutionCreatePayload(request.body);
  if (!parsed.ok) {
    response.status(400).json({ error: "Execução inválida." });
    return;
  }
  const execution = parsed.execution;
  const project = readPayload<Project>("projects", execution.projectId);
  const channel = project && readPayload<Channel>("channels", project.channelId);
  if (!project || !channel || project.channelId !== execution.channelId) {
    response.status(400).json({ error: "Execução inválida." });
    return;
  }
  if (!project.strategySnapshot) {
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
  const existing = executionFor(execution.projectId, execution.processType);
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
      serializeStoredExecution(execution),
      execution.updatedAt,
    );
  scheduleAutomaticPluginBlock(execution);
  queueOrchestratorReconciliationForProject(execution.projectId);
  observeCommittedExecution(execution);
  response.status(201).json(execution);
});

app.patch("/api/executions/:id/blocks/:blockId/runtime-inputs", (request, response) => {
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
      .json({ error: "A execução mudou. Recarregue o estado antes de enviar as entradas." });
    return;
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === request.params.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === request.params.blockId);
  if (!block || !blockExecution) {
    response.status(404).json({ error: "Bloco da execução não encontrado." });
    return;
  }
  if (
    execution.status !== "blocked_executor" ||
    blockExecution.status !== "blocked_executor" ||
    !block.plugin
  ) {
    response.status(409).json({ error: "Este bloco não está aguardando entradas do plugin." });
    return;
  }
  if (!runtimeInputBindings(block.inputs).length) {
    response.status(400).json({ error: "Este bloco não declara entradas fornecidas na execução." });
    return;
  }
  const result = validateRuntimeInputValues(block.inputs, request.body?.values);
  if ("error" in result) {
    response.status(400).json({ error: result.error });
    return;
  }
  blockExecution.runtimeInputs = result.values;
  persistPluginExecution(execution, project);
  scheduleAutomaticPluginBlock(execution);
  response.json({ ok: true, execution, project });
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
    const issue = getPresentationRestrictionIssue(
      field.shape,
      field.presentation,
      values[field.key],
    );
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
  if (!job) {
    const oldIndexById = new Map(previousOrder.map((item, index) => [item.id, index]));
    for (const field of block.outputs ?? []) {
      const value = blockExecution.values[field.key];
      if (!Array.isArray(value) || value.length !== previousOrder.length) continue;
      blockExecution.values[field.key] = reordered.map(
        (item) => structuredClone(value[oldIndexById.get(item.id)!]) as RuntimeValue,
      ) as RuntimeValue;
    }
  }
  synchronizeExecutionItems(block, blockExecution, reordered, job, now);

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
  if (block.plugin && !declaredItemActionForBlock(block, "replace")) {
    response.status(403).json({ error: "Este plugin não declarou a ação de substituir itens." });
    return;
  }
  if (blockExecution.status === "in_progress") {
    response
      .status(409)
      .json({ error: "Aguarde a execução atual terminar antes de alterar o item." });
    return;
  }

  let normalizedOutput: BlockExecutionItemValue;
  try {
    normalizedOutput = normalizeItemReplacement(
      item.output,
      request.body?.output as BlockExecutionItemValue | undefined,
    );
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Não foi possível substituir o item.",
    });
    return;
  }
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
  if (!job) {
    const listOutput = (block.outputs ?? []).find((field) => {
      const value = blockExecution.values[field.key];
      return Array.isArray(value) && value.length === executionItems.length;
    });
    if (listOutput) {
      const values = [...(blockExecution.values[listOutput.key] as RuntimeValue[])];
      const normalizedSingle =
        Array.isArray(normalizedOutput) && normalizedOutput.length === 1
          ? normalizedOutput[0]
          : normalizedOutput;
      values[item.order] = structuredClone(normalizedSingle) as RuntimeValue;
      blockExecution.values[listOutput.key] = values as RuntimeValue;
    }
  }
  synchronizeExecutionItems(block, blockExecution, executionItems, job, now);

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

app.post(
  "/api/executions/:id/blocks/:blockId/items/:itemId/actions/:action",
  async (request, response) => {
    const execution = executionById(request.params.id);
    const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
    if (!execution || !project) {
      response.status(404).json({ error: "Execução não encontrada." });
      return;
    }
    const revision = Number(request.body?.revision);
    if (!Number.isInteger(revision) || revision !== (execution.revision ?? 0)) {
      response.status(409).json({ error: "A execução mudou. Recarregue antes de agir no item." });
      return;
    }
    const block = execution.methodSnapshot.blocks.find(
      (item) => item.id === request.params.blockId,
    );
    const blockExecution = execution.blocks.find((item) => item.blockId === request.params.blockId);
    const executionItems = blockExecution?.items;
    const item = executionItems?.find((candidate) => candidate.id === request.params.itemId);
    if (!block || !blockExecution || !executionItems || !item) {
      response.status(404).json({ error: "Item da execução não encontrado." });
      return;
    }
    if (blockExecution.status === "in_progress") {
      response.status(409).json({ error: "Aguarde a execução atual terminar." });
      return;
    }
    const action = request.params.action;
    const declared = declaredItemActionForBlock(block, action);
    if (!declared) {
      response.status(403).json({ error: "Esta ação não foi declarada pelo plugin." });
      return;
    }

    if (action === "select") {
      for (const candidate of executionItems) {
        if (belongsToSameItemActionGroup(item, candidate)) {
          candidate.selected = candidate.id === item.id;
        }
      }
      const now = new Date().toISOString();
      const job = pluginJobs.getByExecution(execution.id, block.id, blockExecution.attempt ?? 1);
      synchronizeExecutionItems(block, blockExecution, executionItems, job, now);
      persistPluginExecution(execution, project);
      response.json({ execution, project });
      return;
    }
    if (action !== "regenerate") {
      response.status(400).json({ error: "Esta ação é executada localmente pela interface." });
      return;
    }
    if (!declared.plugin.executable || !pluginConsentIsCurrent(declared.plugin)) {
      response.status(403).json({
        error: "Ative este plugin e confirme suas permissões na Central de Plugins.",
      });
      return;
    }

    const job = pluginJobs.getByExecution(execution.id, block.id, blockExecution.attempt ?? 1);
    if (!job) {
      response.status(409).json({ error: "O contexto original deste item não está disponível." });
      return;
    }
    const outputPort =
      item.pluginCorrelation?.outputPort ??
      job.itemOrchestration?.outputPort ??
      job.request.outputContract.find((field) => field.key === item.pluginCorrelation?.outputKey)
        ?.portKey;
    if (!outputPort) {
      response.status(422).json({ error: "Não foi possível resolver a saída original do item." });
      return;
    }

    try {
      const requestedConnectionId =
        typeof job.request.settings.connectionId === "string"
          ? job.request.settings.connectionId
          : undefined;
      const connection = await resolvePluginConnection(declared.plugin, requestedConnectionId);
      const itemAttempt =
        Math.max(item.attempt, ...item.attempts.map((entry) => entry.attempt)) + 1;
      const actionRequest = itemActionRequestForJob({
        job,
        item,
        outputPort,
        attempt: itemAttempt,
        traceId: randomUUID(),
      });
      const pluginResponse = await executeRegisteredPlugin(
        declared.plugin,
        actionRequest,
        declared.capability.execution.defaultTimeoutMs ?? 120_000,
        connection.secrets,
        {
          workspaceDirectory: executionWorkspaceForPlugin(declared.plugin),
          profileDirectory: browserProfileForJob(declared.plugin, job)?.profileDirectory,
          existingArtifacts: job.partialArtifacts,
        },
      );
      if (pluginResponse.status === "pending") {
        response
          .status(422)
          .json({ error: "A regeneração de item precisa concluir na mesma ação." });
        return;
      }
      if (pluginResponse.status === "error") {
        response.status(422).json({ error: pluginResponse.message, code: pluginResponse.code });
        return;
      }
      const rawOutput = pluginResponse.values[outputPort];
      const regenerated = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
      if (regenerated === undefined || regenerated === null) {
        response.status(422).json({ error: "O plugin não devolveu o item regenerado." });
        return;
      }
      const outputShape = job.request.outputContract.find(
        (field) => field.portKey === outputPort,
      )?.shape;
      if (!outputShape || !isCompatiblePluginItemValue(outputShape, regenerated)) {
        response.status(422).json({ error: "O plugin devolveu um tipo incompatível para o item." });
        return;
      }
      const latestExecution = executionById(execution.id);
      if (!latestExecution || (latestExecution.revision ?? 0) !== revision) {
        response.status(409).json({ error: "A execução mudou durante a regeneração do item." });
        return;
      }
      const normalizedOutput = Array.isArray(item.output)
        ? ([structuredClone(regenerated)] as BlockExecutionItemValue)
        : (structuredClone(regenerated) as BlockExecutionItemValue);
      const now = new Date().toISOString();
      item.output = normalizedOutput;
      item.status = "completed";
      item.attempt = itemAttempt;
      item.error = undefined;
      item.attempts.push({
        attempt: itemAttempt,
        status: "completed",
        input: structuredClone(item.input),
        output: structuredClone(normalizedOutput),
        startedAt: now,
        completedAt: now,
      });
      job.partialArtifacts = mergeStoredArtifacts(
        job.partialArtifacts,
        pluginResponse.storedArtifacts,
      );
      synchronizeExecutionItems(block, blockExecution, executionItems, job, now);
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
    } catch (error) {
      response.status(422).json({
        error: error instanceof Error ? error.message : "Não foi possível regenerar o item.",
      });
    }
  },
);

app.put("/api/executions/:id", (request, response) => {
  const execution = request.body as ProcessExecution;
  if (
    !execution?.id ||
    execution.id !== request.params.id ||
    !execution.updatedAt ||
    !Array.isArray(execution.blocks)
  ) {
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
    execution.blocks.some((block) => {
      const prior = current.blocks.find((candidate) => candidate.blockId === block.blockId);
      return (
        JSON.stringify(block.collectionSelection) !== JSON.stringify(prior?.collectionSelection) ||
        (prior?.collectionSelection && block.values.selectedItemId !== prior.values.selectedItemId)
      );
    }) ||
    (current.status === "cancelled" && execution.status !== "cancelled")
  ) {
    response
      .status(409)
      .json({ error: "A execução mudou. Recarregue o estado antes de continuar." });
    return;
  }
  execution.revision = (current.revision ?? 0) + 1;
  const result = database.transaction(() => {
    commitLibraryConsumption(execution);
    return database
      .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
      .run(serializeStoredExecution(execution), execution.updatedAt, execution.id);
  })();
  if (result.changes) {
    scheduleAutomaticPluginBlock(execution as unknown as ProcessExecution);
    if (execution.projectId) queueOrchestratorReconciliationForProject(execution.projectId);
  }
  response
    .status(result.changes ? 200 : 404)
    .json(result.changes ? execution : { error: "Execução não encontrada." });
});

app.delete("/api/executions/:id", (request, response) => {
  requestPluginExecutionCancellation(request.params.id);
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
    collection.fields.length === 0 ||
    (collection.usage !== undefined && !["fixed", "consumable"].includes(String(collection.usage)))
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
    collection.fields.length === 0 ||
    (collection.usage !== undefined && !["fixed", "consumable"].includes(String(collection.usage)))
  ) {
    response.status(400).json({ error: "Coleção estratégica inválida." });
    return;
  }
  if (
    channelLibraryItems(String(collection.channelId)).some(
      (item) => item.collectionId === collection.id && hasLibraryReservation(item.id),
    )
  ) {
    response.status(409).json({ error: "Esta coleção possui itens reservados." });
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
  if (
    stateSnapshot().libraryItems.some(
      (item) => item.collectionId === request.params.id && item.reservation,
    )
  ) {
    response.status(409).json({ error: "Esta coleção possui itens reservados." });
    return;
  }
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

const libraryBatchSchema = z.object({
  importId: z.string().uuid(),
  collectionId: z.string().min(1),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
});
app.post("/api/library/batch", (request, response) => {
  const parsed = libraryBatchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Lote inválido." });
    return;
  }
  const collection = readPayload<StrategicCollection>(
    "library_collections",
    parsed.data.collectionId,
  );
  if (!collection) {
    response.status(404).json({ error: "Coleção não encontrada." });
    return;
  }
  const rows = parsed.data.rows as ChannelLibraryItem["values"][];
  const invalid = rows
    .map((values, index) => ({ row: index + 1, fields: libraryValuesIssues(collection, values) }))
    .filter((row) => row.fields.length);
  if (invalid.length) {
    response.status(422).json({ error: "Revise os campos do lote antes de importar.", invalid });
    return;
  }
  try {
    const result = database.transaction(() => {
      const receiptId = `library-import:${parsed.data.importId}`;
      const receipt = readPayload<{
        rows: ChannelLibraryItem["values"][];
        collectionId: string;
        items: ChannelLibraryItem[];
      }>("execution_commands", receiptId);
      if (receipt) {
        if (
          receipt.collectionId !== collection.id ||
          JSON.stringify(receipt.rows) !== JSON.stringify(rows)
        )
          throw new Error("Lote inválido.");
        return receipt.items;
      }
      const now = new Date().toISOString();
      const items = rows.map(
        (values) =>
          ({
            id: randomUUID(),
            channelId: collection.channelId,
            collectionId: collection.id,
            values,
            createdAt: now,
          }) satisfies ChannelLibraryItem,
      );
      const insert = database.prepare(
        "INSERT INTO library_items (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
      );
      for (const item of items)
        insert.run(item.id, item.channelId, JSON.stringify(item), item.createdAt);
      database
        .prepare("INSERT INTO execution_commands (id, payload) VALUES (?, ?)")
        .run(receiptId, JSON.stringify({ collectionId: collection.id, rows, items }));
      return items;
    })();
    response.status(201).json({ items: result });
  } catch {
    response.status(409).json({ error: "Lote inválido." });
  }
});

app.put("/api/library/:id", (request, response) => {
  if (hasLibraryReservation(String(request.params.id))) {
    response.status(409).json({ error: "Este item está reservado por outra execução." });
    return;
  }
  const original = readPayload<ChannelLibraryItem>("library_items", String(request.params.id));
  if (!original) {
    response.status(404).json({ error: "Item não encontrado." });
    return;
  }
  const collection = readPayload<StrategicCollection>("library_collections", original.collectionId);
  const values = request.body?.values;
  if (
    !collection ||
    collection.channelId !== original.channelId ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  ) {
    response.status(400).json({ error: "Item de biblioteca inválido." });
    return;
  }
  const issues = libraryValuesIssues(collection, values);
  if (issues.length) {
    response
      .status(422)
      .json({ error: "Revise os campos do item antes de salvar.", fields: issues });
    return;
  }
  const item = { ...original, values };
  const result = database
    .prepare("UPDATE library_items SET payload = ? WHERE id = ?")
    .run(JSON.stringify(item), item.id);
  response
    .status(result.changes ? 200 : 404)
    .json(result.changes ? item : { error: "Item não encontrado." });
});

app.delete("/api/library/:id", (request, response) => {
  if (hasLibraryReservation(String(request.params.id))) {
    response.status(409).json({ error: "Este item está reservado por outra execução." });
    return;
  }
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
app.use(supportErrorDiagnostics);

app.listen(port, "127.0.0.1", () => {
  reportSupportEvent({ area: "api", code: "API_STARTED" });
  console.log(`ContentFlow API local pronta em http://127.0.0.1:${port}`);
  resumeExecutionOrchestrators();
});

setInterval(resumeExecutionOrchestrators, 2_000).unref();
setInterval(reconcileStandaloneProcesses, 1_000).unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    for (const invocation of activePluginInvocations.values()) invocation.controller.abort();
    void disposeCoreBrowserSessions().finally(() => process.exit(0));
  });
}

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
