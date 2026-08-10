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
  StrategicCollection,
  UniversalProcess,
} from "../src/lib/domain";
import { PROCESS_ORDER } from "../src/lib/domain";
import { createProcessOutputFields, isEmptyRuntimeValue } from "../src/lib/human-workflow";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
} from "../src/lib/presentation";
import type { PluginExecutionRequest, PluginFieldContract } from "../src/lib/plugin-contract";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import {
  executeRegisteredPlugin,
  getRegisteredPlugin,
  initializePluginRunner,
} from "./plugin-runner";
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
  CREATE TABLE IF NOT EXISTS plugin_consents (
    plugin_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    permissions TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plugin_workspaces (
    plugin_id TEXT PRIMARY KEY,
    directory TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

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
  enabled: boolean;
};

function readPluginConsent(pluginId: string): PluginConsent | undefined {
  const row = database
    .prepare("SELECT version, permissions, enabled FROM plugin_consents WHERE plugin_id = ?")
    .get(pluginId) as { version: string; permissions: string; enabled: number } | undefined;
  if (!row) return undefined;
  return {
    version: row.version,
    permissions: JSON.parse(row.permissions) as string[],
    enabled: row.enabled === 1,
  };
}

function pluginConsentIsCurrent(plugin: {
  id: string;
  source: string;
  manifest: { version: string; permissions: string[] };
}) {
  if (plugin.source === "bundled") return true;
  if (!communitySandboxAvailable) return false;
  const consent = readPluginConsent(plugin.id);
  return (
    consent?.enabled === true &&
    consent.version === plugin.manifest.version &&
    JSON.stringify(consent.permissions) === JSON.stringify(plugin.manifest.permissions)
  );
}

function readPluginWorkspace(pluginId: string) {
  const row = database
    .prepare("SELECT directory FROM plugin_workspaces WHERE plugin_id = ?")
    .get(pluginId) as { directory: string } | undefined;
  return row?.directory;
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
    execution.status === "awaiting_human"
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
  const completedIndex = execution.blocks.indexOf(blockExecution);
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
      execution.outputStatus = "completed";
      execution.status = "completed";
    } else {
      execution.outputStatus = "awaiting_human";
      execution.status = "awaiting_output";
    }
  }
  execution.updatedAt = now;
}

initializePluginRunner();

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
    response.status(400).json({ error: "PreferÃªncias invÃ¡lidas." });
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
      `INSERT INTO plugin_consents (plugin_id, version, permissions, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id) DO UPDATE SET
         version = excluded.version,
         permissions = excluded.permissions,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
    .run(
      plugin.id,
      plugin.manifest.version,
      JSON.stringify(plugin.manifest.permissions),
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
  ).map((row) => JSON.parse(row.payload) as ProcessExecution);
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

  const contextPort = capability.inputPorts[0];
  const inputContract = resolvedInputs.map((item) => ({
    id: item.input.id,
    portKey: contextPort?.key ?? item.input.id,
    label: item.input.label,
    type: item.input.type,
    recordFields: item.input.recordFields,
    presentation: item.input.presentation,
  }));
  const serializedContext = resolvedInputs
    .map((item) => `${item.input.label}: ${JSON.stringify(item.value)}`)
    .join("\n");
  const inputs: Record<string, RuntimeValue> = contextPort
    ? { [contextPort.key]: serializedContext }
    : {};
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
  const { api_key: transientApiKey, ...executionParameters } = body.parameters;
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
  const pluginWorkspaceDirectory = readPluginWorkspace(plugin.id);

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
    outputContract,
    validation: block.validation,
    retryFeedback: blockExecution.retryFeedback,
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
    },
  };

  blockExecution.status = "in_progress";
  execution.status = "running";
  execution.updatedAt = new Date().toISOString();
  database
    .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(execution), execution.updatedAt, execution.id);

  try {
    const executionTimeoutMs = capability.execution.defaultTimeoutMs ?? 60_000;
    const executionDeadline = Date.now() + executionTimeoutMs;
    let pluginResponse = await executeRegisteredPlugin(
      plugin,
      pluginRequest,
      executionTimeoutMs,
      pluginSecrets,
      { workspaceDirectory: pluginWorkspaceDirectory },
    );
    while (pluginResponse.status === "pending") {
      if (Date.now() >= executionDeadline) {
        throw new Error("O job do plugin excedeu o tempo máximo declarado.");
      }
      const pollAfterMs = Math.max(500, Math.min(pluginResponse.pollAfterMs, 30_000));
      await new Promise((resolve) => setTimeout(resolve, pollAfterMs));
      pluginRequest.invocation = { mode: "resume", jobId: pluginResponse.jobId };
      pluginResponse = await executeRegisteredPlugin(
        plugin,
        pluginRequest,
        Math.max(1_000, executionDeadline - Date.now()),
        pluginSecrets,
        { workspaceDirectory: pluginWorkspaceDirectory },
      );
    }
    if (pluginResponse.status !== "success") {
      const message =
        pluginResponse.status === "error"
          ? pluginResponse.message
          : "O plugin não concluiu a execução.";
      blockExecution.status = "failed";
      blockExecution.error = message;
      blockExecution.logs = pluginResponse.logs;
      execution.status = "failed";
      execution.error = message;
      execution.updatedAt = new Date().toISOString();
      updateProjectAfterPluginBlock(project, execution);
      database.transaction(() => {
        database
          .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(execution), execution.updatedAt, execution.id);
        database
          .prepare("UPDATE projects SET payload = ? WHERE id = ?")
          .run(JSON.stringify(project), project.id);
      })();
      response.status(422).json({ error: message, execution, project });
      return;
    }

    const values =
      block.type === "ESCOLHER"
        ? {
            selectedItemId: pluginResponse.values.selectedItemId ?? pluginResponse.values.result,
          }
        : valuesForPluginResponse(block, pluginResponse.values, outputContract);
    if (
      block.type === "ESCOLHER" &&
      !selectedCollectionItems.some((item) => item.id === values.selectedItemId)
    ) {
      throw new Error("O plugin não escolheu um item válido da coleção vinculada.");
    }
    const missingOutputs = (block.outputs ?? [])
      .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
      .map((field) => field.label);
    if (missingOutputs.length) {
      throw new Error(`O plugin não entregou: ${missingOutputs.join(", ")}.`);
    }
    const restrictionIssues = (block.outputs ?? []).flatMap((field) => {
      const issue = getPresentationRestrictionIssue(field.presentation, values[field.key]);
      return issue ? [`${field.label}: ${issue}`] : [];
    });
    if (restrictionIssues.length) {
      throw new Error(`O plugin entregou valores incompatíveis: ${restrictionIssues.join("; ")}.`);
    }
    finishPluginBlock(execution, block, blockExecution, values);
    blockExecution.logs = pluginResponse.logs;
    updateProjectAfterPluginBlock(project, execution);
    database.transaction(() => {
      database
        .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(execution), execution.updatedAt, execution.id);
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
    })();
    response.json({ ok: true, execution, project, values, usage: pluginResponse.usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível executar o plugin.";
    blockExecution.status = "failed";
    blockExecution.error = message;
    execution.status = "failed";
    execution.error = message;
    execution.updatedAt = new Date().toISOString();
    updateProjectAfterPluginBlock(project, execution);
    database.transaction(() => {
      database
        .prepare("UPDATE process_executions SET payload = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(execution), execution.updatedAt, execution.id);
      database
        .prepare("UPDATE projects SET payload = ? WHERE id = ?")
        .run(JSON.stringify(project), project.id);
    })();
    response.status(500).json({ error: message, execution, project });
  }
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
    database.prepare("DELETE FROM channel_order WHERE channel_id = ?").run(channelId);
    return database.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
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
  const remove = database.transaction((projectId: string) => {
    database.prepare("DELETE FROM process_executions WHERE project_id = ?").run(projectId);
    return database.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
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
});

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
