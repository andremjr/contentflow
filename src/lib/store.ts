import { useSyncExternalStore } from "react";
import {
  createEmptyMethods,
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockExecution,
  type Channel,
  type ChannelLibraryItem,
  type ProcessExecution,
  type ProcessId,
  type ProcessMethod,
  type ProcessState,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
  type StoredFile,
  type UniversalProcess,
} from "@/lib/domain";
import {
  createProcessOutputFields,
  normalizeActionBlock,
  normalizeMethodBlocks,
} from "@/lib/human-workflow";
import { normalizeExecutionDeliveries } from "@/lib/deliveries";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  type ExecutionOrchestrator,
  type ExecutionOrchestratorMode,
} from "@/lib/execution-orchestrator";

export type YouTubeChannelProfile = Pick<
  Channel,
  | "youtubeChannelId"
  | "name"
  | "handle"
  | "subscribers"
  | "avatarUrl"
  | "bannerUrl"
  | "lastSyncedAt"
>;

const db = {
  channels: [] as Channel[],
  projects: [] as Project[],
  executions: [] as ProcessExecution[],
  orchestrators: [] as ExecutionOrchestrator[],
  libraryItems: [] as ChannelLibraryItem[],
  libraryCollections: [] as StrategicCollection[],
  ready: false,
};
const listeners = new Set<() => void>();
const orchestratorStateRequests = new Map<string, Promise<boolean>>();
let version = 0;
let connectionError: string | undefined;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

function getServerVersion() {
  return -1;
}

function useClientStoreVersion() {
  return useSyncExternalStore(subscribe, getVersion, getServerVersion);
}

function normalizeChannel(channel: Channel): Channel {
  const emptyMethods = createEmptyMethods();
  const methods = Object.fromEntries(
    PROCESS_ORDER.map((processType) => {
      const saved = channel.methods?.[processType] ?? emptyMethods[processType];
      return [
        processType,
        {
          processType,
          blocks: (saved.blocks ?? []).map((block, order) => ({
            ...normalizeActionBlock(block, processType),
            order,
          })),
        },
      ];
    }),
  ) as Record<UniversalProcess, ProcessMethod>;
  return { ...channel, methods };
}

function normalizeExecution(execution: ProcessExecution): ProcessExecution {
  return normalizeExecutionDeliveries({
    ...execution,
    blocks: execution.blocks.map((block) => ({ attempt: 1, ...block })),
    outputStatus:
      execution.outputStatus ?? (execution.status === "completed" ? "completed" : "pending"),
  });
}

type ServerState = Omit<typeof db, "ready"> & { revision: number };
let serverRevision = -1;
let stateRequest: Promise<boolean> | undefined;
function reconcileEntities<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const prior = new Map(current.map((item) => [item.id, item]));
  return incoming.map((item) => {
    const previous = prior.get(item.id);
    return previous && JSON.stringify(previous) === JSON.stringify(item) ? previous : item;
  });
}
function applyState(state: ServerState) {
  if (state.revision < serverRevision) return;
  serverRevision = state.revision;
  db.channels = reconcileEntities(db.channels, state.channels.map(normalizeChannel));
  db.projects = reconcileEntities(db.projects, state.projects);
  db.executions = reconcileEntities(db.executions, state.executions.map(normalizeExecution));
  db.orchestrators = reconcileEntities(db.orchestrators, state.orchestrators);
  db.libraryItems = reconcileEntities(db.libraryItems, state.libraryItems);
  db.libraryCollections = reconcileEntities(db.libraryCollections, state.libraryCollections);
  db.ready = true;
  emit();
}
export async function refreshState(force = false): Promise<boolean> {
  if (stateRequest) {
    await stateRequest;
    if (!force) return true;
  }
  const pending = (async () => {
    const response = await fetch(`/api/state?since=${force ? -1 : serverRevision}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (connectionError && response.ok) {
      connectionError = undefined;
      emit();
    }
    if (response.status === 204) return true;
    if (!response.ok) throw new Error(await readApiError(response));
    applyState((await response.json()) as ServerState);
    return true;
  })();
  stateRequest = pending;
  try {
    return await pending;
  } catch (error) {
    const message =
      "Sem conexão com o serviço local. Seus dados salvos estão preservados; tentando reconectar…";
    if (connectionError !== message) {
      connectionError = message;
      emit();
    }
    throw error;
  } finally {
    if (stateRequest === pending) stateRequest = undefined;
  }
}
if (typeof window !== "undefined") {
  const refresh = () =>
    void refreshState().catch((error) => console.error("Conexão com a API local:", error));
  refresh();
  const interval = window.setInterval(refresh, 1_000);
  if (import.meta.hot) import.meta.hot.dispose(() => window.clearInterval(interval));
}

export function useDatabaseConnectionError() {
  useClientStoreVersion();
  return connectionError;
}

export function useDatabaseReady() {
  const storeVersion = useClientStoreVersion();
  return storeVersion >= 0 && db.ready;
}

export function useChannels(): Channel[] {
  const storeVersion = useClientStoreVersion();
  return storeVersion >= 0 ? db.channels : [];
}

export function useChannel(id: string): Channel | undefined {
  const storeVersion = useClientStoreVersion();
  return storeVersion >= 0 ? db.channels.find((channel) => channel.id === id) : undefined;
}

export async function reorderChannels(channelIds: string[]) {
  await request("/api/channels/order", "PUT", { channelIds });
  await refreshState(true);
}

export function useProjects(channelId?: string): Project[] {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return channelId ? db.projects.filter((project) => project.channelId === channelId) : db.projects;
}

export function useProject(id: string): Project | undefined {
  const storeVersion = useClientStoreVersion();
  return storeVersion >= 0 ? db.projects.find((project) => project.id === id) : undefined;
}

export function useProcessExecution(projectId: string, processType: ProcessId) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return undefined;
  return db.executions.find(
    (execution) => execution.projectId === projectId && execution.processType === processType,
  );
}

export function useProjectExecutions(projectId: string) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return db.executions.filter((execution) => execution.projectId === projectId);
}

export function useChannelExecutions(channelId: string) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return db.executions.filter((execution) => execution.channelId === channelId);
}

export function useChannelExecutionOrchestrator(channelId: string) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return undefined;
  const orchestrators = db.orchestrators.filter((item) => item.channelId === channelId);
  return (
    orchestrators.find((item) => ACTIVE_ORCHESTRATOR_STATUSES.has(item.status)) ?? orchestrators[0]
  );
}

type ExecutionOrchestratorState = {
  orchestrator: ExecutionOrchestrator;
  channel?: Channel;
  projects: Project[];
  executions: ProcessExecution[];
};

export async function startExecutionOrchestrator(input: {
  channelId: string;
  mode: ExecutionOrchestratorMode;
  quantity: number;
  projectPrefix?: string;
}) {
  const response = await fetch("/api/orchestrators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as ExecutionOrchestratorState & { error?: string };
  if (!response.ok || !body.orchestrator) {
    throw new Error(body.error ?? "Não foi possível iniciar a orquestração.");
  }
  await refreshState(true);
  return body.orchestrator;
}

export async function refreshExecutionOrchestrator(orchestratorId: string) {
  const currentRequest = orchestratorStateRequests.get(orchestratorId);
  if (currentRequest) return currentRequest;
  const nextRequest = (async () => {
    const response = await fetch(`/api/orchestrators/${orchestratorId}/state`);
    if (!response.ok) return false;
    await refreshState(true);
    return true;
  })();
  orchestratorStateRequests.set(orchestratorId, nextRequest);
  try {
    return await nextRequest;
  } finally {
    if (orchestratorStateRequests.get(orchestratorId) === nextRequest) {
      orchestratorStateRequests.delete(orchestratorId);
    }
  }
}

export async function stopExecutionOrchestrator(orchestratorId: string) {
  const response = await fetch(`/api/orchestrators/${orchestratorId}/stop`, { method: "POST" });
  const body = (await response.json()) as ExecutionOrchestratorState & { error?: string };
  if (!response.ok || !body.orchestrator) {
    throw new Error(body.error ?? "Não foi possível parar a orquestração.");
  }
  await refreshState(true);
  return body.orchestrator;
}

export async function resumeExecutionOrchestrator(orchestratorId: string) {
  const response = await fetch(`/api/orchestrators/${orchestratorId}/resume`, { method: "POST" });
  const body = (await response.json()) as ExecutionOrchestratorState & { error?: string };
  if (!response.ok || !body.orchestrator) {
    throw new Error(body.error ?? "Não foi possível retomar a orquestração.");
  }
  await refreshState(true);
  return body.orchestrator;
}

export function useLibraryItems(channelId?: string) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return channelId
    ? db.libraryItems.filter((item) => item.channelId === channelId)
    : db.libraryItems;
}

export function useLibraryCollections(channelId?: string) {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return channelId
    ? db.libraryCollections.filter((collection) => collection.channelId === channelId)
    : db.libraryCollections;
}

export type HumanTask = {
  execution: ProcessExecution;
  block: ActionBlock;
  blockExecution: BlockExecution;
  project: Project;
  channel: Channel;
};

export function useHumanTasks(): HumanTask[] {
  const storeVersion = useClientStoreVersion();
  if (storeVersion < 0) return [];
  return db.executions
    .flatMap<HumanTask>((execution) => {
      const project = db.projects.find((item) => item.id === execution.projectId);
      const channel = db.channels.find((item) => item.id === execution.channelId);
      if (!project || !channel) return [];
      const tasks = execution.blocks.flatMap<HumanTask>((blockExecution) => {
        if (blockExecution.status !== "awaiting_human") return [];
        const block = execution.methodSnapshot.blocks.find(
          (item) => item.id === blockExecution.blockId,
        );
        return block?.operator === "Humano"
          ? [{ execution, block, blockExecution, project, channel }]
          : [];
      });
      if (execution.status === "awaiting_output") {
        const outputBlock: ActionBlock = {
          id: `${execution.id}-process-output`,
          type: "CRIAR",
          operator: "Humano",
          name: `Entregar resultado final de ${PROCESS_META[execution.processType].label}`,
          instructions: "Registre o resultado universal deste processo para concluir a etapa.",
          inputs: [],
          outputs: createProcessOutputFields(execution.processType),
          parameters: [],
          order: execution.blocks.length,
        };
        tasks.push({
          execution,
          block: outputBlock,
          blockExecution: {
            blockId: outputBlock.id,
            status: "awaiting_human",
            values: execution.output?.values ?? {},
            startedAt: execution.updatedAt,
          },
          project,
          channel,
        });
      }
      return tasks;
    })
    .sort(
      (a, b) =>
        new Date(a.blockExecution.startedAt ?? a.execution.updatedAt).getTime() -
        new Date(b.blockExecution.startedAt ?? b.execution.updatedAt).getTime(),
    );
}

export async function createChannel(channel: Omit<Channel, "createdAt">) {
  const next = normalizeChannel({ ...channel, createdAt: new Date().toISOString() });
  await request("/api/channels", "POST", next);
  await refreshState(true);
  return next;
}
export async function updateChannel(channel: Channel) {
  await request(`/api/channels/${channel.id}`, "PUT", normalizeChannel(channel));
  await refreshState(true);
  return db.channels.find((item) => item.id === channel.id);
}

export async function resolveYouTubeChannel(handle: string): Promise<YouTubeChannelProfile> {
  const response = await fetch(`/api/youtube/channel?handle=${encodeURIComponent(handle)}`);
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<YouTubeChannelProfile>;
}

export async function syncChannelFromYouTube(channelId: string) {
  const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/sync-youtube`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const updated = normalizeChannel((await response.json()) as Channel);
  const index = db.channels.findIndex((channel) => channel.id === channelId);
  if (index >= 0) {
    db.channels[index] = updated;
    emit();
  }
  return updated;
}

const methodQueues = new Map<string, Promise<void>>();
const methodTimers = new Map<string, ReturnType<typeof setTimeout>>();
const methodDraftKey = (channelId: string, processType: UniversalProcess) =>
  `contentflow:method-draft:${channelId}:${processType}`;
export function readMethodDraft(
  channelId: string,
  processType: UniversalProcess,
): ProcessMethod | undefined {
  try {
    return (
      JSON.parse(localStorage.getItem(methodDraftKey(channelId, processType)) ?? "null") ??
      undefined
    );
  } catch {
    return undefined;
  }
}
export function rememberMethodDraft(
  channelId: string,
  processType: UniversalProcess,
  method: ProcessMethod,
  onError: (error: Error) => void,
) {
  const key = methodDraftKey(channelId, processType);
  localStorage.setItem(key, JSON.stringify(method));
  clearTimeout(methodTimers.get(key));
  methodTimers.set(
    key,
    setTimeout(() => {
      methodTimers.delete(key);
      void setChannelMethod(channelId, processType, method).catch(onError);
    }, 700),
  );
}
export async function setChannelMethod(
  channelId: string,
  processType: UniversalProcess,
  method: ProcessMethod,
) {
  const key = methodDraftKey(channelId, processType);
  const snapshot = JSON.stringify(method);
  const pending = (methodQueues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      await request(`/api/channels/${channelId}/methods/${processType}`, "PUT", {
        processType,
        blocks: normalizeMethodBlocks(method.blocks, processType),
      });
      if (localStorage.getItem(key) === snapshot) localStorage.removeItem(key);
      await refreshState(true);
    });
  methodQueues.set(key, pending);
  try {
    await pending;
  } finally {
    if (methodQueues.get(key) === pending) methodQueues.delete(key);
  }
}

export async function removeChannel(id: string) {
  await request(`/api/channels/${id}`, "DELETE");
  await refreshState(true);
}
export async function removeProject(id: string) {
  await request(`/api/projects/${id}`, "DELETE");
  await refreshState(true);
}

export type NewProjectInput = { title: string; channelId: string; deadline?: string };

export async function createProject(input: NewProjectInput): Promise<Project> {
  const stages = Object.fromEntries(
    PROCESS_ORDER.map((process) => [process, "not_started"]),
  ) as Record<ProcessId, ProcessState>;
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    channelId: input.channelId,
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: input.deadline?.trim() || "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    createdAt: now,
    stages,
    assignee: { name: "Não atribuído", initials: "—" },
    thumbHue: Math.round(Math.random() * 360),
  };
  await request("/api/projects", "POST", project);
  await refreshState(true);
  return project;
}

const commandQueues = new Map<string, Promise<unknown>>();
async function command<T>(action: string, input: Record<string, unknown>): Promise<T> {
  const id = crypto.randomUUID();
  const key = String(input.executionId ?? input.projectId);
  const execution = db.executions.find((item) => item.id === input.executionId);
  const attempt = execution?.blocks.find((item) => item.blockId === input.blockId)?.attempt ?? 1;
  const previous = commandQueues.get(key) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, attempt, ...input }),
      });
      if (!response.ok) {
        await refreshState(true);
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { result: T; state: ServerState };
      applyState(body.state);
      return body.result;
    });
  commandQueues.set(key, pending);
  try {
    return await pending;
  } finally {
    if (commandQueues.get(key) === pending) commandQueues.delete(key);
  }
}

export function startProcessExecution(projectId: string, processType: ProcessId) {
  return command<ProcessExecution>("start", { projectId, processType });
}
export function chooseCollectionItem(executionId: string, blockId: string, itemId: string) {
  return command<boolean>("choose", { executionId, blockId, itemId });
}
export function saveHumanBlockDraft(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
) {
  return saveRuntimeDraft(executionId, blockId, values);
}
function runtimeDraftKey(executionId: string, blockId: string) {
  const attempt =
    db.executions
      .find((item) => item.id === executionId)
      ?.blocks.find((item) => item.blockId === blockId)?.attempt ?? 1;
  return `contentflow:runtime-draft:${executionId}:${blockId}:${attempt}`;
}
export function readRuntimeDraft(
  executionId: string,
  blockId: string,
): Record<string, RuntimeValue> | undefined {
  try {
    return (
      JSON.parse(localStorage.getItem(runtimeDraftKey(executionId, blockId)) ?? "null") ?? undefined
    );
  } catch {
    return undefined;
  }
}
const runtimeDraftSaves = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout>;
    resolve: Array<(saved: boolean) => void>;
    reject: Array<(error: unknown) => void>;
  }
>();
function saveRuntimeDraft(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
) {
  const key = runtimeDraftKey(executionId, blockId);
  const attempt =
    db.executions
      .find((item) => item.id === executionId)
      ?.blocks.find((item) => item.blockId === blockId)?.attempt ?? 1;
  const snapshot = JSON.stringify(values);
  localStorage.setItem(key, snapshot);
  const previous = runtimeDraftSaves.get(key);
  if (previous) clearTimeout(previous.timer);
  return new Promise<boolean>((resolve, reject) => {
    const pending = {
      resolve: [...(previous?.resolve ?? []), resolve],
      reject: [...(previous?.reject ?? []), reject],
      timer: setTimeout(() => {
        runtimeDraftSaves.delete(key);
        void command<boolean>(blockId === "__output__" ? "outputDraft" : "draft", {
          executionId,
          ...(blockId === "__output__" ? {} : { blockId, attempt }),
          values,
        })
          .then((saved) => {
            if (saved && localStorage.getItem(key) === snapshot) localStorage.removeItem(key);
            pending.resolve.forEach((callback) => callback(saved));
          })
          .catch((error) => pending.reject.forEach((callback) => callback(error)));
      }, 300),
    };
    runtimeDraftSaves.set(key, pending);
  });
}
export function saveProcessOutputDraft(executionId: string, values: Record<string, RuntimeValue>) {
  return saveRuntimeDraft(executionId, "__output__", values);
}
type HumanResult =
  | { ok: true; completedProcess: boolean; retriedBlock?: string; pausedValidation?: boolean }
  | { ok: false; missing: string[] };
export function completeHumanBlock(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
) {
  return command<HumanResult>("completeHuman", { executionId, blockId, values });
}
export function completeProcessOutput(executionId: string, values: Record<string, RuntimeValue>) {
  return command<{ ok: true } | { ok: false; missing: string[] }>("completeOutput", {
    executionId,
    values,
  });
}
export function retryBlockExecution(executionId: string, blockId: string) {
  return command<boolean>("retry", { executionId, blockId });
}
export function resetStage(projectId: string, stage: ProcessId) {
  return command<boolean>("reset", { projectId, processType: stage });
}
export async function cancelProcessExecution(executionId: string) {
  await request(`/api/executions/${executionId}/cancel`, "POST");
  await refreshState(true);
  return true;
}
export async function refreshProcessExecution(
  _executionId: string,
  _projectId?: string,
  _processType?: ProcessId,
) {
  return refreshState();
}

export async function createLibraryItem(
  input: Omit<ChannelLibraryItem, "id" | "createdAt">,
): Promise<ChannelLibraryItem> {
  const item: ChannelLibraryItem = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await request("/api/library", "POST", item);
  await refreshState(true);
  return item;
}

export async function createLibraryCollection(
  input: Omit<StrategicCollection, "id" | "createdAt">,
): Promise<StrategicCollection> {
  const collection: StrategicCollection = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await request("/api/library/collections", "POST", collection);
  await refreshState(true);
  return collection;
}

export async function updateLibraryCollection(collection: StrategicCollection) {
  await request(`/api/library/collections/${collection.id}`, "PUT", collection);
  await refreshState(true);
}

export async function removeLibraryCollection(id: string) {
  await request(`/api/library/collections/${id}`, "DELETE");
  await refreshState(true);
}

export async function updateLibraryItem(item: ChannelLibraryItem) {
  await request(`/api/library/${item.id}`, "PUT", item);
  await refreshState(true);
}

export async function removeLibraryItem(id: string) {
  await request(`/api/library/${id}`, "DELETE");
  await refreshState(true);
}

export async function uploadLocalFile(file: File): Promise<StoredFile> {
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<StoredFile>;
}

async function request(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Não foi possível concluir a operação.";
  } catch {
    return "Não foi possível concluir a operação.";
  }
}
