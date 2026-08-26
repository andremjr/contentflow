import express, { type ErrorRequestHandler } from "express";
import Database from "better-sqlite3";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ActionBlock,
  BlockExecution,
  Channel,
  ChannelLibraryItem,
  HumanFieldType,
  ProcessExecution,
  Project,
  RuntimeValue,
  StoredFile,
  StrategicCollection,
  UniversalProcess,
} from "../src/lib/domain";
import { PROCESS_META, PROCESS_ORDER } from "../src/lib/domain";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeMethodBlocks,
} from "../src/lib/human-workflow";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  buildOrchestratorSteps,
  type ExecutionOrchestrator,
  type ExecutionOrchestratorMode,
  type ExecutionOrchestratorStatus,
} from "../src/lib/execution-orchestrator";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
} from "../src/lib/presentation";
import type { PluginExecutionRequest, PluginFieldContract } from "../src/lib/plugin-contract";
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
} from "./plugin-runner";
import { normalizeNetworkHostPattern } from "./remote-artifact-downloader";
import { composePluginPortValue, selectPluginInputPort } from "./plugin-input-values";
import {
  createPersistentPluginJob,
  isPluginJobTimedOut,
  type ClaimedPluginJob,
  type PersistentPluginJob,
  PluginJobStore,
} from "./plugin-job-store";
import {
  connectOpenAI,
  disconnectOpenAI,
  getOpenAIApiKey,
  getOpenAIConnection,
  refreshOpenAIModels,
} from "./openai-connection";
import {
  connectAnthropic,
  disconnectAnthropic,
  getAnthropicApiKey,
  getAnthropicConnection,
  refreshAnthropicModels,
} from "./anthropic-connection";
import { deletePluginSecret, getPluginSecret, setPluginSecret } from "./credential-vault";
import { fetchYouTubeChannel } from "./youtube";
import { canAdvanceProfileFallback, orderedProfileCandidates } from "./plugin-account-fallback";
import {
  appendOrchestratedOutput,
  declaredItemOrchestration,
  invocationRequestForJob,
} from "./plugin-item-orchestration";

const port = Number(process.env.CONTENTFLOW_API_PORT ?? 8787);
const applicationRoot = path.resolve(process.env.CONTENTFLOW_APP_ROOT ?? process.cwd());
const defaultDataDirectory =
  process.platform === "win32" && process.env.APPDATA
    ? path.join(process.env.APPDATA, "ContentFlow OS", "data")
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

const databasePath = path.join(dataDirectory, "contentflow-os.sqlite");
const legacyDataDirectory = path.join(applicationRoot, "data");
const legacyDatabasePath = path.join(legacyDataDirectory, "contentflow-os.sqlite");
const shouldMigrateLegacyData =
  databasePath !== legacyDatabasePath &&
  !existsSync(databasePath) &&
  existsSync(legacyDatabasePath);

if (shouldMigrateLegacyData) {
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

const database = new Database(databasePath);
database.pragma("busy_timeout = 5000");
database.pragma("journal_mode = WAL");
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
`);

const pluginConsentColumns = database.prepare("PRAGMA table_info(plugin_consents)").all() as Array<{
  name: string;
}>;
if (!pluginConsentColumns.some((column) => column.name === "network_hosts")) {
  database.exec("ALTER TABLE plugin_consents ADD COLUMN network_hosts TEXT NOT NULL DEFAULT '[]'");
}
const pluginJobs = new PluginJobStore(database);
pluginJobs.recoverInterrupted();

type AppPreferences = {
  theme: "light" | "dark";
  language: "pt-BR" | "en" | "es";
};

const defaultPreferences: AppPreferences = { theme: "dark", language: "pt-BR" };

function readPreferences(): AppPreferences {
  const row = database
    .prepare("SELECT theme, language FROM app_preferences WHERE id = 'global'")
    .get() as AppPreferences | undefined;
  return row ?? defaultPreferences;
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
  if (plugin.source === "bundled") return true;
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

function valuesForPluginResponse(
  block: ActionBlock,
  responseValues: Record<string, RuntimeValue>,
  outputContract: PluginFieldContract[],
) {
  const values: Record<string, RuntimeValue> = {};
  for (const field of block.outputs ?? []) {
    const contract = outputContract.find((item) => item.key === field.key);
    const value =
      responseValues[field.key] ??
      (contract ? responseValues[contract.portKey] : undefined) ??
      responseValues.result;
    if (value !== undefined) values[field.key] = value;
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
    const completed = PROCESS_ORDER.filter(
      (process) => project.stages[process] === "done" || project.stages[process] === "approved",
    ).length;
    project.progress = Math.round((completed / PROCESS_ORDER.length) * 100);
    const next = PROCESS_ORDER.find(
      (process) => project.stages[process] !== "done" && project.stages[process] !== "approved",
    );
    project.currentStage = next ?? "publishing";
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
        for (let index = targetIndex; index < execution.blocks.length; index += 1) {
          const item = execution.blocks[index];
          item.attempt = attemptAfterRetryInvalidation(item);
          item.values = {};
          item.error = undefined;
          item.logs = undefined;
          item.completedAt = undefined;
          item.jobId = undefined;
          item.progress = undefined;
          item.progressMessage = undefined;
          item.retryFeedback = undefined;
          item.status = "pending";
        }
        targetExecution.retryFeedback = structuredClone(values);
        targetExecution.startedAt = now;
        targetExecution.status =
          targetBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
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
    nextExecution.status = nextBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
    nextExecution.startedAt = now;
    execution.status =
      nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
  } else {
    const [finalField] = createProcessOutputFields(execution.processType);
    let finalValue: RuntimeValue | undefined;
    let sourceBlockId: string | undefined;
    for (let index = execution.methodSnapshot.blocks.length - 1; index >= 0; index -= 1) {
      const candidate = execution.methodSnapshot.blocks[index];
      if (candidate.type === "VALIDAR" || candidate.type === "ESCOLHER") continue;
      const candidateOutput = candidate.outputs?.find(
        (output) => output.key === finalField.key && output.type === finalField.type,
      );
      if (!candidateOutput) continue;
      const candidateExecution = execution.blocks.find((item) => item.blockId === candidate.id);
      const value = candidateExecution?.values[finalField.key];
      if (!isEmptyRuntimeValue(value)) {
        finalValue = value;
        sourceBlockId = candidate.id;
        break;
      }
    }
    if (finalValue !== undefined) {
      execution.output = {
        processType: execution.processType,
        values: { [finalField.key]: finalValue },
        sourceBlockId,
        createdAt: now,
      };
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
  execution.updatedAt = new Date().toISOString();
  updateProjectAfterPluginBlock(project, execution);
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

function scheduleAutomaticPluginBlock(execution: ProcessExecution) {
  if (execution.status !== "blocked_executor") return;
  const blockExecution = execution.blocks.find((item) => item.status !== "completed");
  const block = blockExecution
    ? execution.methodSnapshot.blocks.find((item) => item.id === blockExecution.blockId)
    : undefined;
  if (
    !blockExecution ||
    blockExecution.status !== "blocked_executor" ||
    !block ||
    block.operator === "Humano" ||
    !block.plugin
  ) {
    return;
  }

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

function startOrchestratedProcess(
  project: Project,
  channel: Channel,
  processType: UniversalProcess,
) {
  const existing = executionFor(project.id, processType);
  if (existing) return { execution: existing };

  const savedMethod = channel.methods?.[processType];
  const method = savedMethod
    ? { processType, blocks: normalizeMethodBlocks(savedMethod.blocks ?? [], processType) }
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
          ? block.operator === "Humano"
            ? "awaiting_human"
            : "blocked_executor"
          : "pending",
      values: {},
      attempt: 1,
      startedAt: index === 0 ? now : undefined,
    })),
    status: methodSnapshot.blocks[0].operator === "Humano" ? "awaiting_human" : "blocked_executor",
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

    const steps = buildOrchestratorSteps(orchestrator.projectIds, orchestrator.mode);
    while (orchestrator.currentStep < steps.length) {
      const step = steps[orchestrator.currentStep];
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
            : execution.status === "blocked_executor" && !activeBlock?.plugin
              ? "blocked"
              : "running";
      setExecutionOrchestratorState(orchestrator, {
        status,
        currentProjectId: step.projectId,
        currentProcessType: step.processType,
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
  return pluginJobs.save(
    claim,
    {
      ...claim.job,
      status,
      error: message,
      message,
      nextPollAt: new Date(8_640_000_000_000_000).toISOString(),
    },
    (saved) => {
      if (saved.status === "cancel_requested" || !execution || !project) return;
      const blockExecution = execution.blocks.find((item) => item.blockId === saved.blockId);
      if (blockExecution && blockExecution.status !== "cancelled") {
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

async function pluginSecretsForJob(pluginId: string, secretKeys: string[]) {
  const secrets: Record<string, string> = {};
  for (const key of secretKeys) {
    const value = await getPluginSecret(pluginId, key);
    if (value) secrets[key] = value;
  }
  return secrets;
}

async function processPluginJob(
  jobId: string,
  transientSecrets: Record<string, string> = {},
  existingClaim?: ClaimedPluginJob,
) {
  const claim = existingClaim ?? pluginJobs.claim(jobId);
  if (!claim) return pluginJobs.get(jobId);
  const { job } = claim;
  const execution = executionById(job.executionId);
  const project = execution ? readPayload<Project>("projects", execution.projectId) : undefined;
  if (!execution || !project) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "A execução associada ao job não existe mais.",
      "abandoned",
    );
  }
  const block = execution.methodSnapshot.blocks.find((item) => item.id === job.blockId);
  const blockExecution = execution.blocks.find((item) => item.blockId === job.blockId);
  if (!block || !blockExecution || (blockExecution.attempt ?? 1) !== job.attempt) {
    return markPluginJobFailed(
      claim,
      execution,
      project,
      "O bloco ou a tentativa associada ao job não existe mais.",
      "abandoned",
    );
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
  const storedSecrets = await pluginSecretsForJob(plugin.id, plugin.manifest.secretKeys ?? []);
  const secrets = { ...storedSecrets, ...transientSecrets };
  const workspaceDirectory = executionWorkspaceForPlugin(plugin);
  // Browser-driven capabilities legitimately need more than two minutes for
  // page loading, model generation and UI transitions. Honor the capability's
  // declared bound while never exceeding the persistent job deadline.
  const invocationTimeout = Math.max(
    1_000,
    Math.min(remainingMs, capability.execution.defaultTimeoutMs ?? 120_000),
  );

  try {
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
    const pluginResponse = await executeRegisteredPlugin(
      plugin,
      invocationRequestForJob(job, invocation),
      invocationTimeout,
      secrets,
      { workspaceDirectory, existingArtifacts: job.partialArtifacts },
    );

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
          message: `Falha técnica em ${currentProfile}; continuando com ${nextProfile}.`,
          nextPollAt: new Date().toISOString(),
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution.status = "in_progress";
        blockExecution.values = structuredClone(partialValues);
        blockExecution.progressMessage = saved.message;
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
        blockExecution.progressMessage = saved.message;
        blockExecution.logs = pluginResponse.logs;
        execution.status = "running";
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
      const outputKey =
        job.request.outputContract.find((field) => field.portKey === itemOrchestration.outputPort)
          ?.key ?? itemOrchestration.outputPort;
      const accumulated = appendOrchestratedOutput(
        job.partialValues,
        mappedPluginValues(block, pluginResponse.values, job.request.outputContract),
        outputKey,
      );
      if (itemOrchestration.currentIndex + 1 < itemOrchestration.items.length) {
        const nextIndex = itemOrchestration.currentIndex + 1;
        const saved = pluginJobs.save(claim, {
          ...job,
          status: "starting",
          nextPollAt: new Date().toISOString(),
          retryCount: 0,
          partialValues: accumulated,
          partialArtifacts: mergeStoredArtifacts(
            job.partialArtifacts,
            pluginResponse.storedArtifacts,
          ),
          itemOrchestration: { ...itemOrchestration, currentIndex: nextIndex },
          progress: nextIndex / itemOrchestration.items.length,
          message: `Item ${nextIndex} de ${itemOrchestration.items.length} concluído.`,
          error: undefined,
        });
        if (saved.status === "cancel_requested") return saved;
        blockExecution.status = "in_progress";
        blockExecution.values = structuredClone(accumulated);
        blockExecution.progress = saved.progress;
        blockExecution.progressMessage = saved.message;
        blockExecution.logs = pluginResponse.logs;
        execution.status = "running";
        recordBlockDeliveries(execution, block, accumulated, "partial");
        persistPluginExecution(execution, project);
        return saved;
      }
      Object.assign(values, accumulated);
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
        finishPluginBlock(execution, block, blockExecution, values);
        blockExecution.logs = pluginResponse.logs;
        blockExecution.progress = 1;
        blockExecution.progressMessage = undefined;
        persistPluginExecution(execution, project);
      },
    );
    scheduleAutomaticPluginBlock(execution);
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível executar o plugin.";
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
      execution.status = "running";
      persistPluginExecution(execution, project);
      return saved;
    }
    return markPluginJobFailed(claim, execution, project, message);
  }
}

let pluginJobSchedulerRunning = false;
async function processDuePluginJobs() {
  if (pluginJobSchedulerRunning) return;
  pluginJobSchedulerRunning = true;
  try {
    const dueJobs: ClaimedPluginJob[] = [];
    for (let index = 0; index < 4; index += 1) {
      const claim = pluginJobs.claimNext();
      if (!claim) break;
      dueJobs.push(claim);
    }
    await Promise.allSettled(dueJobs.map((claim) => processPluginJob(claim.job.id, {}, claim)));
  } finally {
    pluginJobSchedulerRunning = false;
  }
}

initializePluginRunner();
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

type PluginSource = "bundled" | "installed";

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
        ["IA", "Código"].includes(String(capability.operator)) &&
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
            ))) &&
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

function discoverPlugins(root: string, source: PluginSource, relativeRoot: string) {
  if (!existsSync(root)) return { plugins: [], issues: [] };
  const plugins: Array<{
    id: string;
    source: PluginSource;
    directory: string;
    manifest: Record<string, unknown>;
  }> = [];
  const issues: Array<{ directory: string; message: string }> = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "contentflow.plugin.json");
    if (!existsSync(manifestPath)) continue;
    const directory = `${relativeRoot}/${entry.name}`;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      if (!isPluginManifest(manifest)) {
        throw new Error("Manifesto incompleto ou incompatível.");
      }
      const pluginDirectory = path.resolve(root, entry.name);
      const entrypointPath = path.resolve(pluginDirectory, String(manifest.entrypoint));
      if (
        !entrypointPath.startsWith(`${pluginDirectory}${path.sep}`) ||
        !existsSync(entrypointPath)
      ) {
        throw new Error("O entrypoint declarado não existe dentro da pasta do plugin.");
      }
      plugins.push({ id: String(manifest.id), source, directory, manifest });
    } catch (error) {
      issues.push({
        directory,
        message: error instanceof Error ? error.message : "Manifesto inválido.",
      });
    }
  }
  return { plugins, issues };
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
app.use(express.json({ limit: "10mb" }));
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

app.get("/api/preferences", (_request, response) => {
  response.json(readPreferences());
});

app.put("/api/preferences", (request, response) => {
  const theme = request.body?.theme;
  const language = request.body?.language;
  if (
    !(["light", "dark"] as const).includes(theme) ||
    !(["pt-BR", "en", "es"] as const).includes(language)
  ) {
    response.status(400).json({ error: "Preferências inválidas." });
    return;
  }
  database
    .prepare(
      `INSERT INTO app_preferences (id, theme, language, updated_at)
       VALUES ('global', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         theme = excluded.theme,
         language = excluded.language,
         updated_at = excluded.updated_at`,
    )
    .run(theme, language, new Date().toISOString());
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
      sandboxed: plugin.source !== "bundled",
      networkIsolation: communitySandboxAvailable,
    };
  });
  response.json({
    plugins,
    issues: registry.issues,
    examplesDirectory: process.env.CONTENTFLOW_EXAMPLES_DIR,
  });
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
  const capability = plugin.manifest.capabilities.find(
    (candidate) => candidate.blockConfigSchema.properties?.[profileKey],
  );
  if (!capability) {
    response.status(422).json({ error: "O perfil não pertence à configuração deste plugin." });
    return;
  }

  try {
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
      invocation: { mode: "configure", action: action as "status" | "prepare" },
      configuration: { [profileKey]: profileName.trim() },
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
    const timeoutMs =
      action === "prepare" ? (plugin.manifest.profileSetup.prepareTimeoutMs ?? 600_000) : 30_000;
    const result = await executeRegisteredPlugin(plugin, pluginRequest, timeoutMs, pluginSecrets, {
      workspaceDirectory: executionWorkspaceForPlugin(plugin),
    });
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
  const requestedPath = typeof request.body?.path === "string" ? request.body.path.trim() : "";
  if (!requestedPath) {
    response.status(400).json({ error: "Informe a pasta criada pelo autor ou pela IA." });
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
  let temporaryDestination: string | undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    if (!isPluginManifest(manifest)) throw new Error("O manifesto do plugin é inválido.");
    const pluginId = String(manifest.id);
    if (!/^[a-z0-9.-]+$/.test(pluginId)) throw new Error("O id do plugin é inválido.");
    const destination = path.resolve(installedPluginsDirectory, pluginId);
    if (!destination.startsWith(`${path.resolve(installedPluginsDirectory)}${path.sep}`)) {
      throw new Error("O destino calculado para o plugin é inválido.");
    }
    if (existsSync(destination)) {
      response.status(409).json({ error: "Esta versão já possui uma pasta instalada." });
      return;
    }
    mkdirSync(installedPluginsDirectory, { recursive: true });
    temporaryDestination = path.join(installedPluginsDirectory, `.install-${randomUUID()}`);
    cpSync(sourceDirectory, temporaryDestination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    const registry = initializePluginRunner();
    const installed = registry.plugins.find(
      (plugin) => plugin.id === pluginId && plugin.source === "installed",
    );
    if (!installed) {
      const issue = registry.issues.find((item) => item.directory.includes(pluginId));
      throw new Error(issue?.message ?? "O pacote não passou pela validação automática.");
    }
    renameSync(temporaryDestination, destination);
    temporaryDestination = undefined;
    initializePluginRunner();
    response.status(201).json({ id: pluginId, installed: true });
  } catch (error) {
    if (temporaryDestination) rmSync(temporaryDestination, { recursive: true, force: true });
    initializePluginRunner();
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível instalar o plugin.",
    });
  }
});

app.post("/api/plugins/link-development-folder", (request, response) => {
  const requestedPath = typeof request.body?.path === "string" ? request.body.path.trim() : "";
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

app.delete("/api/plugins/:pluginId", async (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  if (plugin.source === "bundled") {
    response.status(403).json({ error: "Plugins incluídos fazem parte do ContentFlow OS." });
    return;
  }
  try {
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
    for (const secretKey of plugin.manifest.secretKeys ?? []) {
      await deletePluginSecret(plugin.id, secretKey);
    }
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
  if (plugin.source === "bundled") {
    response.json({ enabled: true });
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
  if (!plugin || plugin.source === "bundled") {
    response.status(404).json({ error: "Plugin comunitário não encontrado." });
    return;
  }
  response.json({ path: readPluginWorkspace(plugin.id) ?? "" });
});

app.put("/api/plugins/:pluginId/workspace", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  const requestedPath = typeof request.body?.path === "string" ? request.body.path.trim() : "";
  if (!plugin || plugin.source === "bundled") {
    response.status(404).json({ error: "Plugin comunitário não encontrado." });
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

app.get("/api/plugins/official-openai-gpt/connection", async (_request, response) => {
  response.json(await getOpenAIConnection());
});

app.post("/api/plugins/official-openai-gpt/connection", async (request, response) => {
  const apiKey = typeof request.body?.apiKey === "string" ? request.body.apiKey : "";
  try {
    response.json(await connectOpenAI(apiKey));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível conectar à OpenAI.",
    });
  }
});

app.post("/api/plugins/official-openai-gpt/models/refresh", async (_request, response) => {
  try {
    response.json(await refreshOpenAIModels());
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar os modelos.",
    });
  }
});

app.delete("/api/plugins/official-openai-gpt/connection", async (_request, response) => {
  await disconnectOpenAI();
  response.json(await getOpenAIConnection());
});

app.get("/api/plugins/official-anthropic-claude/connection", async (_request, response) => {
  response.json(await getAnthropicConnection());
});

app.post("/api/plugins/official-anthropic-claude/connection", async (request, response) => {
  const apiKey = typeof request.body?.apiKey === "string" ? request.body.apiKey : "";
  try {
    response.json(await connectAnthropic(apiKey));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível conectar à Anthropic.",
    });
  }
});

app.post("/api/plugins/official-anthropic-claude/models/refresh", async (_request, response) => {
  try {
    response.json(await refreshAnthropicModels());
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar os modelos.",
    });
  }
});

app.delete("/api/plugins/official-anthropic-claude/connection", async (_request, response) => {
  await disconnectAnthropic();
  response.json(await getAnthropicConnection());
});

app.get("/api/plugins/:pluginId/source", (request, response) => {
  initializePluginRunner();
  const plugin = getRegisteredPlugin(request.params.pluginId);
  if (!plugin) {
    response.status(404).json({ error: "Plugin não encontrado." });
    return;
  }
  if (plugin.source !== "bundled") {
    response.status(403).json({ error: "O código de plugins externos não é exposto pela API." });
    return;
  }
  const allowedExtensions = new Set([".ts", ".js", ".json", ".md"]);
  const files = readdirSync(plugin.absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name)))
    .map((entry) => {
      const absolutePath = path.join(plugin.absoluteDirectory, entry.name);
      const content = readFileSync(absolutePath, "utf8");
      return {
        path: entry.name,
        content: content.length > 200_000 ? `${content.slice(0, 200_000)}\n…` : content,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  response.json({ root: plugin.directory, files });
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
  if (
    block.operator === "Humano" ||
    blockExecution.status !== "blocked_executor" ||
    block.plugin?.pluginId !== plugin.id
  ) {
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
  // The builder intentionally allows a block without declared inputs while
  // still advertising prior deliveries as available context. Materialize that
  // context for plugins so browser automations receive the actual values, not
  // only instructions that refer to them.
  const currentBlockIndex = execution.blocks.indexOf(blockExecution);
  const contextValues = execution.methodSnapshot.blocks
    .slice(0, Math.max(0, currentBlockIndex))
    .flatMap((previousBlock) =>
      (previousBlock.outputs ?? []).flatMap((field) => {
        const previousExecution = execution.blocks.find(
          (item) => item.blockId === previousBlock.id,
        );
        const value = previousExecution?.values[field.key];
        return value === undefined || isEmptyRuntimeValue(value) ? [] : [{ field, value }];
      }),
    );
  for (const { field, value } of contextValues) {
    if (!["image", "audio", "video", "file", "files"].includes(field.type)) continue;
    const port = capability.inputPorts.find(
      (candidate) =>
        inputs[candidate.key] === undefined && candidate.acceptedTypes.includes(field.type),
    );
    if (!port) continue;
    inputs[port.key] = value;
    inputContract.push({
      id: `context-${field.id}`,
      portKey: port.key,
      label: field.label,
      type: field.type,
      recordFields: field.recordFields,
      presentation: field.presentation,
    });
  }
  const textPort = capability.inputPorts.find(
    (candidate) =>
      inputs[candidate.key] === undefined &&
      (candidate.acceptedTypes.includes("text") || candidate.acceptedTypes.includes("textarea")),
  );
  const previousProcessContextText = projectExecutions
    .filter(
      (candidate) =>
        candidate.outputStatus === "completed" &&
        PROCESS_ORDER.indexOf(candidate.processType) < PROCESS_ORDER.indexOf(execution.processType),
    )
    .flatMap((candidate) =>
      Object.entries(candidate.output?.values ?? {}).map(
        ([key, value]) =>
          `${candidate.processType}.${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      ),
    )
    .join("\n\n");
  if (textPort && (contextValues.length || previousProcessContextText)) {
    const currentProcessContextText = contextValues
      .filter(({ field }) => !["image", "audio", "video", "file", "files"].includes(field.type))
      .map(
        ({ field, value }) =>
          `${field.label}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      )
      .join("\n\n");
    const contextText = [previousProcessContextText, currentProcessContextText]
      .filter(Boolean)
      .join("\n\n");
    if (contextText) {
      inputs[textPort.key] = contextText;
      inputContract.push({
        id: "previous-block-context",
        portKey: textPort.key,
        label: "Contexto dos blocos anteriores",
        type: "textarea",
        recordFields: undefined,
        presentation: undefined,
      });
    }
  }
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
            capability.outputPorts.find((port) => port.producedTypes.includes(field.type))?.key ??
            capability.outputPorts[0]?.key ??
            field.key,
        }));
  const methodParameterValues = Object.fromEntries(
    (block.parameters ?? []).map((parameter) => [parameter.key, parameter.value]),
  );
  const { api_key: transientApiKey, ...providedExecutionParameters } = body.parameters;
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
      sourceKey: resolved.input.sourceKey,
      portKey: port?.key,
      value: resolved.value ?? null,
    })),
    parameters: executionParameters,
  });
  if (capability.instructionUsage === "required" && !resolvedInstruction.instruction) {
    response.status(422).json({
      error: `Defina o prompt do bloco “${block.name ?? block.type}” antes de executar.`,
    });
    return;
  }
  const secretKey =
    plugin.id === "official-openai-gpt"
      ? "OPENAI_API_KEY"
      : plugin.id === "official-anthropic-claude"
        ? "ANTHROPIC_API_KEY"
        : undefined;
  const providedApiKey = typeof transientApiKey === "string" ? transientApiKey.trim() : "";
  const storedApiKey =
    !providedApiKey && plugin.id === "official-openai-gpt"
      ? await getOpenAIApiKey()
      : !providedApiKey && plugin.id === "official-anthropic-claude"
        ? await getAnthropicApiKey()
        : undefined;
  const apiKey = providedApiKey || storedApiKey;
  const pluginSecrets: Record<string, string> = {};
  for (const declaredSecret of plugin.manifest.secretKeys ?? []) {
    const storedSecret = await getPluginSecret(plugin.id, declaredSecret);
    if (storedSecret) pluginSecrets[declaredSecret] = storedSecret;
  }
  if (secretKey && apiKey) pluginSecrets[secretKey] = apiKey;
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
    settings: {},
    inputs,
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
    resolvedInstruction: resolvedInstruction.instruction,
    unresolvedInstructionVariables: resolvedInstruction.unresolved,
    context: {
      locale: channel.language || "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: {
        id: channel.id,
        name: channel.name,
        language: channel.language,
        niche: channel.niche,
      },
      project: { id: project.id, title: project.title },
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
              values: item.values,
            })),
          }
        : undefined,
      previousProcessOutputs: projectExecutions
        .filter(
          (item) => item.outputStatus === "completed" && item.processType !== body.processType,
        )
        .map((item) => item.output!)
        .filter(Boolean),
      previousBlockOutputs: execution.blocks
        .filter((item) => item.status === "completed")
        .map((item) => ({ blockId: item.blockId, values: item.values })),
      previousDeliveries: activeProjectDeliveries(projectExecutions).filter(
        (delivery) =>
          PROCESS_ORDER.indexOf(delivery.processType) <
            PROCESS_ORDER.indexOf(execution.processType) ||
          (delivery.processType === execution.processType && delivery.blockId !== block.id),
      ),
    },
  };

  const executionTimeoutMs = capability.execution.defaultTimeoutMs ?? 60_000;
  const createdJob = pluginJobs.create(
    createPersistentPluginJob({
      pluginId: plugin.id,
      pluginVersion: plugin.manifest.version,
      request: pluginRequest,
      timeoutMs: executionTimeoutMs,
      profileFallback: orderedProfileCandidates(plugin.manifest, pluginRequest.configuration),
      itemOrchestration: declaredItemOrchestration(capability, pluginRequest),
    }),
  );
  blockExecution.status = "in_progress";
  blockExecution.traceId = pluginRequest.traceId;
  blockExecution.progress = 0;
  blockExecution.progressMessage = "Iniciando job…";
  execution.status = "running";
  persistPluginExecution(execution, project);

  if (capability.execution.mode === "async") {
    if (providedApiKey && !storedApiKey) {
      const claim = pluginJobs.claim(createdJob.id);
      const failed = claim
        ? markPluginJobFailed(
            claim,
            execution,
            project,
            "Jobs persistentes exigem que a credencial seja salva na Central de Plugins.",
          )
        : createdJob;
      response.status(422).json({
        error: failed.error,
        job: publicPluginJob(failed),
        execution: executionById(execution.id) ?? execution,
        project: readPayload<Project>("projects", project.id) ?? project,
      });
      return;
    }
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
  const channel = request.body as StoredPayload;
  if (!channel?.id || !channel.createdAt) {
    response.status(400).json({ error: "Canal inválido." });
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

app.put("/api/channels/:id", (request, response) => {
  const channel = request.body as StoredPayload;
  if (!channel?.id || channel.id !== request.params.id) {
    response.status(400).json({ error: "Canal inválido." });
    return;
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
    const updated = { ...channel, ...profile };
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

  const now = new Date().toISOString();
  const projectPrefix = body.projectPrefix?.trim() || "Produção orquestrada";
  const projects = Array.from({ length: quantity }, (_, index) =>
    createOrchestratedProject(channel.id, `${projectPrefix} ${index + 1}`, index),
  );
  const steps = buildOrchestratorSteps(
    projects.map((project) => project.id),
    body.mode,
  );
  const orchestrator: ExecutionOrchestrator = {
    id: randomUUID(),
    channelId: channel.id,
    mode: body.mode,
    quantity,
    projectPrefix,
    projectIds: projects.map((project) => project.id),
    currentStep: 0,
    totalSteps: steps.length,
    status: "running",
    message: "Preparando a primeira execução.",
    createdAt: now,
    updatedAt: now,
  };
  channel.activeProjects += quantity;

  database.transaction(() => {
    const insertProject = database.prepare(
      "INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const project of projects) {
      insertProject.run(project.id, project.channelId, JSON.stringify(project), project.createdAt);
    }
    database
      .prepare("UPDATE channels SET payload = ? WHERE id = ?")
      .run(JSON.stringify(channel), channel.id);
    persistExecutionOrchestrator(orchestrator, true);
  })();
  reconcileExecutionOrchestrator(orchestrator.id);
  response
    .status(201)
    .json(executionOrchestratorState(executionOrchestratorById(orchestrator.id)!));
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
  const project = request.body as StoredPayload;
  if (!project?.id || !project.channelId || !project.createdAt) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
  database
    .prepare("INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(project.id, project.channelId, JSON.stringify(project), project.createdAt);
  response.status(201).json(project);
});

app.put("/api/projects/:id", (request, response) => {
  const project = request.body as StoredPayload;
  if (!project?.id || project.id !== request.params.id || !project.channelId) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
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
  const execution = executionById(request.params.id);
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
  database
    .prepare(
      `INSERT INTO process_executions (id, project_id, process_type, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, process_type) DO UPDATE SET
         id = excluded.id, payload = excluded.payload, updated_at = excluded.updated_at`,
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

app.put("/api/executions/:id", (request, response) => {
  const execution = request.body as StoredPayload;
  if (!execution?.id || execution.id !== request.params.id || !execution.updatedAt) {
    response.status(400).json({ error: "Execução inválida." });
    return;
  }
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
  console.log(`ContentFlow OS API local pronta em http://127.0.0.1:${port}`);
  resumeExecutionOrchestrators();
});

setInterval(resumeExecutionOrchestrators, 2_000).unref();

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
  return readdirSync(uploadsDirectory, { withFileTypes: true }).reduce((total, entry) => {
    if (!entry.isFile()) return total;
    try {
      return total + statSync(path.join(uploadsDirectory, entry.name)).size;
    } catch {
      return total;
    }
  }, 0);
}
