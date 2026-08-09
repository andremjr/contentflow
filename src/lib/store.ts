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
  type ProcessOutput,
  type ProcessState,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
  type StoredFile,
  type UniversalProcess,
} from "@/lib/domain";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeActionBlock,
  normalizeMethodBlocks,
} from "@/lib/human-workflow";
import { resolveBlockInputs } from "@/lib/runtime-contract";

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
  libraryItems: [] as ChannelLibraryItem[],
  libraryCollections: [] as StrategicCollection[],
  ready: false,
};
const listeners = new Set<() => void>();
const executionPersistenceQueues = new Map<string, Promise<void>>();
let version = 0;

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
  return {
    ...execution,
    blocks: execution.blocks.map((block) => ({ attempt: 1, ...block })),
    outputStatus:
      execution.outputStatus ?? (execution.status === "completed" ? "completed" : "pending"),
  };
}

async function hydrate() {
  if (typeof window === "undefined" || db.ready) return;
  try {
    const responses = await Promise.all([
      fetch("/api/channels"),
      fetch("/api/projects"),
      fetch("/api/executions"),
      fetch("/api/library"),
      fetch("/api/library/collections"),
    ]);
    if (responses.some((response) => !response.ok)) {
      throw new Error("Não foi possível conectar à API local.");
    }
    const [channels, projects, executions, libraryItems, libraryCollections] = (await Promise.all(
      responses.map((response) => response.json()),
    )) as [Channel[], Project[], ProcessExecution[], ChannelLibraryItem[], StrategicCollection[]];
    db.channels.splice(0, db.channels.length, ...channels.map(normalizeChannel));
    db.projects.splice(0, db.projects.length, ...projects);
    db.executions.splice(0, db.executions.length, ...executions.map(normalizeExecution));
    db.libraryItems.splice(0, db.libraryItems.length, ...libraryItems);
    db.libraryCollections.splice(0, db.libraryCollections.length, ...libraryCollections);
    for (const channel of db.channels) {
      for (const processType of PROCESS_ORDER) {
        synchronizeOpenExecutionsWithMethod(channel.id, processType, channel.methods[processType]);
      }
    }
    void syncAllChannelsFromYouTube();
  } catch (error) {
    console.error(error);
  } finally {
    db.ready = true;
    emit();
  }
}

void hydrate();

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

export function reorderChannels(channelIds: string[]) {
  if (
    channelIds.length !== db.channels.length ||
    new Set(channelIds).size !== channelIds.length ||
    channelIds.some((id) => !db.channels.some((channel) => channel.id === id))
  ) {
    return;
  }

  const channelsById = new Map(db.channels.map((channel) => [channel.id, channel]));
  db.channels.splice(
    0,
    db.channels.length,
    ...channelIds
      .map((id) => channelsById.get(id))
      .filter((channel): channel is Channel => !!channel),
  );
  emit();
  void request("/api/channels/order", "PUT", { channelIds });
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

export function createChannel(channel: Omit<Channel, "createdAt">) {
  const next: Channel = normalizeChannel({ ...channel, createdAt: new Date().toISOString() });
  db.channels.unshift(next);
  emit();
  void request("/api/channels", "POST", next);
  return next;
}

export function updateChannel(channel: Channel) {
  const index = db.channels.findIndex((item) => item.id === channel.id);
  if (index < 0) return;
  const updated = normalizeChannel(channel);
  db.channels[index] = updated;
  emit();
  void request(`/api/channels/${updated.id}`, "PUT", updated);
  return updated;
}

export async function resolveYouTubeChannel(handle: string): Promise<YouTubeChannelProfile> {
  const response = await fetch(`/api/youtube/channel?handle=${encodeURIComponent(handle)}`);
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<YouTubeChannelProfile>;
}

export async function syncChannelFromYouTube(channelId: string) {
  const response = await fetch(`/api/channels/${channelId}/sync-youtube`, { method: "POST" });
  if (!response.ok) throw new Error(await readApiError(response));
  const updated = normalizeChannel((await response.json()) as Channel);
  const index = db.channels.findIndex((channel) => channel.id === channelId);
  if (index >= 0) {
    db.channels[index] = updated;
    emit();
  }
  return updated;
}

async function syncAllChannelsFromYouTube() {
  const channelIds = db.channels.map((channel) => channel.id);
  for (let index = 0; index < channelIds.length; index += 3) {
    await Promise.allSettled(channelIds.slice(index, index + 3).map(syncChannelFromYouTube));
  }
}

export async function setChannelMethod(
  channelId: string,
  processType: UniversalProcess,
  method: ProcessMethod,
) {
  const channel = db.channels.find((item) => item.id === channelId);
  if (!channel) return;
  const normalizedMethod: ProcessMethod = {
    processType,
    blocks: normalizeMethodBlocks(method.blocks, processType),
  };
  channel.methods = {
    ...channel.methods,
    [processType]: normalizedMethod,
  };
  synchronizeOpenExecutionsWithMethod(channel.id, processType, normalizedMethod);
  emit();
  await request(`/api/channels/${channel.id}`, "PUT", channel);
}

function synchronizeOpenExecutionsWithMethod(
  channelId: string,
  processType: UniversalProcess,
  method: ProcessMethod,
) {
  const executions = db.executions.filter(
    (execution) =>
      execution.channelId === channelId &&
      execution.processType === processType &&
      execution.status !== "completed" &&
      execution.status !== "cancelled",
  );

  for (const execution of executions) {
    const previousExecutions = new Map(execution.blocks.map((block) => [block.blockId, block]));
    const previousBlocks = new Map(
      execution.methodSnapshot.blocks.map((block) => [block.id, block]),
    );
    const nextBlocks = structuredClone(method.blocks);
    let preservingCompletedPrefix = true;
    let activeAssigned = false;

    execution.methodSnapshot = { processType, blocks: nextBlocks };
    execution.blocks = nextBlocks.map((block) => {
      const previousExecution = previousExecutions.get(block.id);
      const previousBlock = previousBlocks.get(block.id);
      const collectionChanged = previousBlock?.collectionId !== block.collectionId;
      const values = structuredClone(previousExecution?.values ?? {});
      if (collectionChanged) delete values.selectedItemId;

      if (preservingCompletedPrefix && previousExecution?.status === "completed") {
        return { ...previousExecution, values };
      }
      preservingCompletedPrefix = false;

      if (!activeAssigned) {
        activeAssigned = true;
        return {
          blockId: block.id,
          status: block.operator === "Humano" ? "awaiting_human" : "blocked_executor",
          values,
          attempt: previousExecution?.attempt ?? 1,
          startedAt: previousExecution?.startedAt ?? new Date().toISOString(),
        };
      }

      return { blockId: block.id, status: "pending", values: {} };
    });

    const activeExecution = execution.blocks.find((block) => block.status !== "completed");
    if (!activeExecution) {
      execution.status =
        execution.outputStatus === "completed"
          ? "completed"
          : method.blocks.length
            ? "awaiting_output"
            : "cancelled";
    } else {
      execution.status =
        activeExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
    }

    const project = db.projects.find((item) => item.id === execution.projectId);
    if (project && activeExecution) {
      project.stages = {
        ...project.stages,
        [processType]:
          activeExecution.status === "awaiting_human" ? "awaiting_human" : "processing",
      };
      project.currentStage = processType;
      project.state = project.stages[processType];
      persistProject(project);
    }
    persistExecution(execution);
  }
}

export function removeChannel(id: string) {
  const projectIds = db.projects
    .filter((project) => project.channelId === id)
    .map((project) => project.id);
  db.channels.splice(0, db.channels.length, ...db.channels.filter((channel) => channel.id !== id));
  db.projects.splice(
    0,
    db.projects.length,
    ...db.projects.filter((project) => project.channelId !== id),
  );
  db.executions.splice(
    0,
    db.executions.length,
    ...db.executions.filter((execution) => !projectIds.includes(execution.projectId)),
  );
  db.libraryItems.splice(
    0,
    db.libraryItems.length,
    ...db.libraryItems.filter((item) => item.channelId !== id),
  );
  db.libraryCollections.splice(
    0,
    db.libraryCollections.length,
    ...db.libraryCollections.filter((collection) => collection.channelId !== id),
  );
  emit();
  void request(`/api/channels/${id}`, "DELETE");
}

export function removeProject(id: string) {
  const project = db.projects.find((item) => item.id === id);
  if (!project) return;
  db.projects.splice(db.projects.indexOf(project), 1);
  db.executions.splice(
    0,
    db.executions.length,
    ...db.executions.filter((execution) => execution.projectId !== id),
  );
  const channel = db.channels.find((item) => item.id === project.channelId);
  if (channel) {
    channel.activeProjects = Math.max(0, channel.activeProjects - 1);
    void request(`/api/channels/${channel.id}`, "PUT", channel);
  }
  emit();
  void request(`/api/projects/${id}`, "DELETE");
}

export type NewProjectInput = { title: string; channelId: string; deadline?: string };

export function createProject(input: NewProjectInput): Project {
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
  db.projects.unshift(project);
  const channel = db.channels.find((item) => item.id === input.channelId);
  if (channel) {
    channel.activeProjects += 1;
    void request(`/api/channels/${channel.id}`, "PUT", channel);
  }
  emit();
  void request("/api/projects", "POST", project);
  return project;
}

function persistProject(project: Project) {
  project.updatedAt = "Agora";
  void request(`/api/projects/${project.id}`, "PUT", project);
}

function persistExecution(execution: ProcessExecution, create = false) {
  execution.updatedAt = new Date().toISOString();
  const snapshot = structuredClone(execution);
  const previous = executionPersistenceQueues.get(execution.id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() =>
      request(
        create ? "/api/executions" : `/api/executions/${execution.id}`,
        create ? "POST" : "PUT",
        snapshot,
      ),
    );
  executionPersistenceQueues.set(execution.id, next);
  void next
    .catch((error) => console.error("Falha ao persistir execução", error))
    .finally(() => {
      if (executionPersistenceQueues.get(execution.id) === next) {
        executionPersistenceQueues.delete(execution.id);
      }
    });
}

function deletePersistedExecution(executionId: string) {
  const previous = executionPersistenceQueues.get(executionId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => request(`/api/executions/${executionId}`, "DELETE"));
  executionPersistenceQueues.set(executionId, next);
  void next
    .catch((error) => console.error("Falha ao remover execução", error))
    .finally(() => {
      if (executionPersistenceQueues.get(executionId) === next) {
        executionPersistenceQueues.delete(executionId);
      }
    });
}

function completeProjectStage(project: Project, stage: ProcessId) {
  project.stages = { ...project.stages, [stage]: "done" };
  const next = PROCESS_ORDER.find(
    (process) => project.stages[process] !== "done" && project.stages[process] !== "approved",
  );
  project.currentStage = next ?? "publishing";
  project.state = next ? project.stages[next] : "done";
  const completed = PROCESS_ORDER.filter(
    (process) => project.stages[process] === "done" || project.stages[process] === "approved",
  ).length;
  project.progress = Math.round((completed / PROCESS_ORDER.length) * 100);
  persistProject(project);
}

export function startProcessExecution(projectId: string, processType: ProcessId) {
  const existing = db.executions.find(
    (item) => item.projectId === projectId && item.processType === processType,
  );
  if (existing) return existing;
  const project = db.projects.find((item) => item.id === projectId);
  const channel = project ? db.channels.find((item) => item.id === project.channelId) : undefined;
  const method = channel?.methods[processType];
  const normalizedMethod = method
    ? { processType, blocks: normalizeMethodBlocks(method.blocks, processType) }
    : undefined;
  if (!project || !channel || !normalizedMethod || getMethodConfigurationIssue(normalizedMethod)) {
    return undefined;
  }
  const now = new Date().toISOString();
  const methodSnapshot: ProcessMethod = {
    processType,
    blocks: structuredClone(normalizedMethod.blocks),
  };
  const execution: ProcessExecution = {
    id: crypto.randomUUID(),
    projectId,
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
    status: methodSnapshot.blocks[0]?.operator === "Humano" ? "awaiting_human" : "blocked_executor",
    outputStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  db.executions.unshift(execution);
  project.stages = {
    ...project.stages,
    [processType]: execution.status === "awaiting_human" ? "awaiting_human" : "processing",
  };
  project.currentStage = processType;
  project.state = project.stages[processType];
  persistProject(project);
  persistExecution(execution, true);
  emit();
  return execution;
}

function deriveProcessOutput(execution: ProcessExecution): ProcessOutput | undefined {
  const [definition] = createProcessOutputFields(execution.processType);
  const legacyKey = `final_${execution.processType}`;
  for (let index = execution.methodSnapshot.blocks.length - 1; index >= 0; index -= 1) {
    const block = execution.methodSnapshot.blocks[index];
    const blockExecution = execution.blocks.find((item) => item.blockId === block.id);
    if (block.type === "VALIDAR") {
      if (block.validation?.mode === "approval") continue;
      const selectionKey =
        block.validation?.mode === "select_many" ? "selected_values" : "selected_value";
      const selectedValue = blockExecution?.values[selectionKey];
      if (selectedValue === undefined || isEmptyRuntimeValue(selectedValue)) continue;
      return {
        processType: execution.processType,
        values: { [definition.key]: structuredClone(selectedValue) },
        sourceBlockId: block.id,
        createdAt: new Date().toISOString(),
      };
    }
    if (block.type === "ESCOLHER") continue;
    const value = blockExecution?.values[definition.key] ?? blockExecution?.values[legacyKey];
    if (value === undefined || isEmptyRuntimeValue(value)) continue;
    return {
      processType: execution.processType,
      values: { [definition.key]: structuredClone(value) },
      sourceBlockId: block.id,
      createdAt: new Date().toISOString(),
    };
  }
  return undefined;
}

function finalizeOrRequestOutput(execution: ProcessExecution) {
  const project = db.projects.find((item) => item.id === execution.projectId);
  const output = deriveProcessOutput(execution);
  if (output) {
    execution.output = output;
    execution.outputStatus = "completed";
    execution.status = "completed";
    if (project) completeProjectStage(project, execution.processType);
  } else {
    execution.outputStatus = "awaiting_human";
    execution.status = "awaiting_output";
    if (project) {
      project.stages = { ...project.stages, [execution.processType]: "awaiting_human" };
      project.currentStage = execution.processType;
      project.state = "awaiting_human";
      persistProject(project);
    }
  }
  persistExecution(execution);
  emit();
  return execution;
}

function activateNextBlock(execution: ProcessExecution, completedIndex: number) {
  const nextExecution = execution.blocks[completedIndex + 1];
  const nextBlock = execution.methodSnapshot.blocks[completedIndex + 1];
  if (!nextExecution || !nextBlock) return finalizeOrRequestOutput(execution);

  const now = new Date().toISOString();
  nextExecution.startedAt = now;
  nextExecution.attempt = Math.max(1, nextExecution.attempt ?? 1);
  nextExecution.error = undefined;
  nextExecution.status = nextBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
  execution.status =
    nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) {
    project.stages = {
      ...project.stages,
      [execution.processType]:
        nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
    };
    project.currentStage = execution.processType;
    project.state = project.stages[execution.processType];
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return execution;
}

export function advanceProcessExecution(executionId: string) {
  const execution = db.executions.find((item) => item.id === executionId);
  if (!execution || execution.status === "completed" || execution.status === "cancelled") {
    return execution;
  }

  const activeExecution = execution.blocks.find((item) => item.status !== "completed");
  const activeBlock = activeExecution
    ? execution.methodSnapshot.blocks.find((item) => item.id === activeExecution.blockId)
    : undefined;
  if (!activeExecution || !activeBlock) return execution;

  const project = db.projects.find((item) => item.id === execution.projectId);
  const now = new Date().toISOString();

  if (activeBlock.operator === "Humano") {
    activeExecution.status = "awaiting_human";
    activeExecution.startedAt ??= now;
    execution.status = "awaiting_human";
    if (project) {
      project.stages = {
        ...project.stages,
        [execution.processType]:
          activeBlock.type === "VALIDAR" ? "awaiting_review" : "awaiting_human",
      };
      project.currentStage = execution.processType;
      project.state = project.stages[execution.processType];
      persistProject(project);
    }
    persistExecution(execution);
    emit();
    return execution;
  }
  activeExecution.status = "blocked_executor";
  activeExecution.startedAt ??= now;
  execution.status = "blocked_executor";
  if (project) {
    project.stages = { ...project.stages, [execution.processType]: "blocked" };
    project.currentStage = execution.processType;
    project.state = "blocked";
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return execution;
}

export function chooseCollectionItem(executionId: string, blockId: string, itemId: string) {
  const execution = db.executions.find((item) => item.id === executionId);
  const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  const item = db.libraryItems.find((candidate) => candidate.id === itemId);
  if (
    !execution ||
    !block ||
    !blockExecution ||
    blockExecution.status !== "awaiting_human" ||
    block.type !== "ESCOLHER" ||
    block.operator !== "Humano" ||
    !block.collectionId ||
    item?.collectionId !== block.collectionId
  ) {
    return false;
  }

  const now = new Date().toISOString();
  blockExecution.values = { selectedItemId: itemId };
  blockExecution.status = "completed";
  blockExecution.completedAt = now;
  activateNextBlock(execution, execution.blocks.indexOf(blockExecution));
  return true;
}

export function saveHumanBlockDraft(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
) {
  const execution = db.executions.find((item) => item.id === executionId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  if (!execution || !blockExecution) return false;
  blockExecution.values = structuredClone(values);
  blockExecution.status = "awaiting_human";
  execution.status = "awaiting_human";
  persistExecution(execution);
  emit();
  return true;
}

function retryValidatedBlock(
  execution: ProcessExecution,
  validationBlock: ActionBlock,
  validationValues: Record<string, RuntimeValue>,
) {
  const targetBlockId = validationBlock.validation?.targetBlockId;
  const targetIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === targetBlockId,
  );
  const validationIndex = execution.methodSnapshot.blocks.findIndex(
    (candidate) => candidate.id === validationBlock.id,
  );
  if (targetIndex < 0 || targetIndex >= validationIndex) {
    return {
      ok: false as const,
      message: "O bloco validado não está disponível para nova tentativa.",
    };
  }

  const targetBlock = execution.methodSnapshot.blocks[targetIndex];
  const targetExecution = execution.blocks[targetIndex];
  const maxAttempts = Math.max(1, validationBlock.validation?.maxAttempts ?? 3);
  if ((targetExecution.attempt ?? 1) >= maxAttempts) {
    return {
      ok: false as const,
      message: `O limite de ${maxAttempts} tentativas foi atingido. Revise o método ou aprove manualmente o resultado atual.`,
    };
  }

  const now = new Date().toISOString();
  for (let index = targetIndex; index < execution.blocks.length; index += 1) {
    const blockExecution = execution.blocks[index];
    blockExecution.values = {};
    blockExecution.error = undefined;
    blockExecution.logs = undefined;
    blockExecution.completedAt = undefined;
    blockExecution.retryFeedback = undefined;
    if (index === targetIndex) {
      blockExecution.attempt = (blockExecution.attempt ?? 1) + 1;
      blockExecution.startedAt = now;
      blockExecution.retryFeedback = structuredClone(validationValues);
      blockExecution.status =
        targetBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
    } else {
      blockExecution.startedAt = undefined;
      blockExecution.status = "pending";
    }
  }

  execution.output = undefined;
  execution.outputStatus = "pending";
  execution.error = undefined;
  execution.status =
    targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
  const project = db.projects.find((candidate) => candidate.id === execution.projectId);
  if (project) {
    project.stages = {
      ...project.stages,
      [execution.processType]:
        targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
    };
    project.currentStage = execution.processType;
    project.state = project.stages[execution.processType];
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return { ok: true as const, blockName: targetBlock.name ?? targetBlock.type };
}

export function completeHumanBlock(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
):
  | { ok: true; completedProcess: boolean; retriedBlock?: string; pausedValidation?: boolean }
  | { ok: false; missing: string[] } {
  const execution = db.executions.find((item) => item.id === executionId);
  const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  if (
    !execution ||
    !block ||
    !blockExecution ||
    block.operator !== "Humano" ||
    block.type === "ESCOLHER" ||
    blockExecution.status !== "awaiting_human"
  ) {
    return { ok: false, missing: ["Executor humano indisponível"] };
  }
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (!project) return { ok: false, missing: ["Projeto não encontrado"] };
  const unresolvedInputs = resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions: db.executions.filter((item) => item.projectId === execution.projectId),
    collections: db.libraryCollections.filter((item) => item.channelId === execution.channelId),
    libraryItems: db.libraryItems.filter((item) => item.channelId === execution.channelId),
  }).filter((item) => !item.resolved);
  if (unresolvedInputs.length) {
    return {
      ok: false,
      missing: unresolvedInputs.map((item) => `Entrada: ${item.input.label}`),
    };
  }
  const missing = (block.outputs ?? [])
    .filter((output) => output.required && isEmptyRuntimeValue(values[output.key]))
    .map((output) => output.label);
  for (const output of (block.outputs ?? []).filter((field) => field.type === "records")) {
    const storedRecords = values[output.key];
    const records = Array.isArray(storedRecords) ? storedRecords : [];
    records.forEach((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record) || "url" in record) return;
      for (const recordField of (output.recordFields ?? []).filter((field) => field.required)) {
        if (isEmptyRuntimeValue(record[recordField.key] as RuntimeValue | undefined)) {
          missing.push(`${output.label} · registro ${index + 1} · ${recordField.label}`);
        }
      }
    });
  }
  if (missing.length) return { ok: false, missing };
  const rejected = (block.outputs ?? []).some(
    (output) => output.type === "approval" && values[output.key] === "rejected",
  );
  if (rejected) {
    blockExecution.values = structuredClone(values);
    if (block.type === "VALIDAR" && block.validation?.onReject === "retry_target") {
      const retry = retryValidatedBlock(execution, block, values);
      if (!retry.ok) return { ok: false, missing: [retry.message] };
      return { ok: true, completedProcess: false, retriedBlock: retry.blockName };
    }
    persistExecution(execution);
    emit();
    return { ok: true, completedProcess: false, pausedValidation: true };
  }
  const now = new Date().toISOString();
  blockExecution.values = structuredClone(values);
  blockExecution.status = "completed";
  blockExecution.completedAt = now;
  const updated = activateNextBlock(execution, execution.blocks.indexOf(blockExecution));
  return { ok: true, completedProcess: updated.status === "completed" };
}

export function completeProcessOutput(
  executionId: string,
  values: Record<string, RuntimeValue>,
): { ok: true } | { ok: false; missing: string[] } {
  const execution = db.executions.find((item) => item.id === executionId);
  if (!execution || execution.status !== "awaiting_output") {
    return { ok: false, missing: ["Execução indisponível para receber o resultado final"] };
  }
  const missing = createProcessOutputFields(execution.processType)
    .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
    .map((field) => field.label);
  if (missing.length) return { ok: false, missing };

  execution.output = {
    processType: execution.processType,
    values: structuredClone(values),
    createdAt: new Date().toISOString(),
  };
  execution.outputStatus = "completed";
  execution.status = "completed";
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) completeProjectStage(project, execution.processType);
  persistExecution(execution);
  emit();
  return { ok: true };
}

export function cancelProcessExecution(executionId: string) {
  const execution = db.executions.find((item) => item.id === executionId);
  if (!execution || execution.status === "completed" || execution.status === "cancelled") {
    return false;
  }
  execution.status = "cancelled";
  execution.blocks = execution.blocks.map((block) =>
    block.status === "completed" ? block : { ...block, status: "cancelled" },
  );
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) {
    project.stages = { ...project.stages, [execution.processType]: "not_started" };
    project.currentStage = execution.processType;
    project.state = "not_started";
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return true;
}

export function failBlockExecution(executionId: string, blockId: string, message: string) {
  const execution = db.executions.find((item) => item.id === executionId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  if (!execution || !blockExecution || blockExecution.status === "completed") return false;
  blockExecution.status = "failed";
  blockExecution.error = message;
  blockExecution.logs = [...(blockExecution.logs ?? []), message];
  execution.status = "failed";
  execution.error = message;
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) {
    project.stages = { ...project.stages, [execution.processType]: "error" };
    project.currentStage = execution.processType;
    project.state = "error";
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return true;
}

export function retryBlockExecution(executionId: string, blockId: string) {
  const execution = db.executions.find((item) => item.id === executionId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
  if (!execution || !blockExecution || !block || blockExecution.status !== "failed") return false;
  blockExecution.attempt = (blockExecution.attempt ?? 1) + 1;
  blockExecution.error = undefined;
  blockExecution.status = block.operator === "Humano" ? "awaiting_human" : "blocked_executor";
  execution.error = undefined;
  execution.status =
    blockExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) {
    project.stages = {
      ...project.stages,
      [execution.processType]:
        blockExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
    };
    project.currentStage = execution.processType;
    project.state = project.stages[execution.processType];
    persistProject(project);
  }
  persistExecution(execution);
  emit();
  return true;
}

export async function executePluginBlock(input: {
  projectId: string;
  processType: UniversalProcess;
  blockId: string;
  pluginId: string;
  parameters: Record<string, unknown>;
}) {
  const response = await fetch("/api/execute-block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as {
    ok?: boolean;
    error?: string;
    execution?: ProcessExecution;
    project?: Project;
    values?: Record<string, RuntimeValue>;
    usage?: Record<string, unknown>;
  };
  if (body.execution) {
    const index = db.executions.findIndex((item) => item.id === body.execution?.id);
    if (index >= 0) db.executions[index] = normalizeExecution(body.execution);
  }
  if (body.project) {
    const index = db.projects.findIndex((item) => item.id === body.project?.id);
    if (index >= 0) db.projects[index] = body.project;
  }
  if (body.execution || body.project) emit();
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? "Não foi possível executar o plugin.");
  }
  return body;
}

export function resetStage(projectId: string, stage: ProcessId) {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return;
  const execution = db.executions.find(
    (item) => item.projectId === projectId && item.processType === stage,
  );
  if (execution) {
    db.executions.splice(db.executions.indexOf(execution), 1);
    deletePersistedExecution(execution.id);
  }
  project.stages = { ...project.stages, [stage]: "not_started" };
  project.currentStage = stage;
  project.state = "not_started";
  persistProject(project);
  emit();
}

export function createLibraryItem(
  input: Omit<ChannelLibraryItem, "id" | "createdAt">,
): ChannelLibraryItem {
  const item: ChannelLibraryItem = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.libraryItems.unshift(item);
  emit();
  void request("/api/library", "POST", item);
  return item;
}

export function createLibraryCollection(
  input: Omit<StrategicCollection, "id" | "createdAt">,
): StrategicCollection {
  const collection: StrategicCollection = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.libraryCollections.push(collection);
  emit();
  void request("/api/library/collections", "POST", collection);
  return collection;
}

export function updateLibraryCollection(collection: StrategicCollection) {
  const index = db.libraryCollections.findIndex((candidate) => candidate.id === collection.id);
  if (index < 0) return;
  db.libraryCollections[index] = collection;
  emit();
  void request(`/api/library/collections/${collection.id}`, "PUT", collection);
}

export function removeLibraryCollection(id: string) {
  db.libraryCollections.splice(
    0,
    db.libraryCollections.length,
    ...db.libraryCollections.filter((collection) => collection.id !== id),
  );
  db.libraryItems.splice(
    0,
    db.libraryItems.length,
    ...db.libraryItems.filter((item) => item.collectionId !== id),
  );
  emit();
  void request(`/api/library/collections/${id}`, "DELETE");
}

export function updateLibraryItem(item: ChannelLibraryItem) {
  const index = db.libraryItems.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return;
  db.libraryItems[index] = item;
  emit();
  void request(`/api/library/${item.id}`, "PUT", item);
}

export function removeLibraryItem(id: string) {
  db.libraryItems.splice(
    0,
    db.libraryItems.length,
    ...db.libraryItems.filter((item) => item.id !== id),
  );
  emit();
  void request(`/api/library/${id}`, "DELETE");
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
  if (!response.ok) throw new Error("A API local não conseguiu salvar os dados.");
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Não foi possível concluir a operação.";
  } catch {
    return "Não foi possível concluir a operação.";
  }
}
