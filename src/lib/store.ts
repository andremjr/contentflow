import { useSyncExternalStore } from "react";
import {
  createEmptyMethods,
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
  type StoredFile,
  type UniversalProcess,
} from "@/lib/domain";
import { isEmptyRuntimeValue, normalizeActionBlock } from "@/lib/human-workflow";

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
  ready: false,
};
const listeners = new Set<() => void>();
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

async function hydrate() {
  if (typeof window === "undefined" || db.ready) return;
  try {
    const responses = await Promise.all([
      fetch("/api/channels"),
      fetch("/api/projects"),
      fetch("/api/executions"),
      fetch("/api/library"),
    ]);
    if (responses.some((response) => !response.ok)) {
      throw new Error("Não foi possível conectar à API local.");
    }
    const [channels, projects, executions, libraryItems] = (await Promise.all(
      responses.map((response) => response.json()),
    )) as [Channel[], Project[], ProcessExecution[], ChannelLibraryItem[]];
    db.channels.splice(0, db.channels.length, ...channels.map(normalizeChannel));
    db.projects.splice(0, db.projects.length, ...projects);
    db.executions.splice(0, db.executions.length, ...executions);
    db.libraryItems.splice(0, db.libraryItems.length, ...libraryItems);
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
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.ready;
}

export function useChannels(): Channel[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.channels;
}

export function useChannel(id: string): Channel | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.channels.find((channel) => channel.id === id);
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
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return channelId ? db.projects.filter((project) => project.channelId === channelId) : db.projects;
}

export function useProject(id: string): Project | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.projects.find((project) => project.id === id);
}

export function useProcessExecution(projectId: string, processType: ProcessId) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.executions.find(
    (execution) => execution.projectId === projectId && execution.processType === processType,
  );
}

export function useLibraryItems(channelId?: string) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return channelId
    ? db.libraryItems.filter((item) => item.channelId === channelId)
    : db.libraryItems;
}

export type HumanTask = {
  execution: ProcessExecution;
  block: ActionBlock;
  blockExecution: BlockExecution;
  project: Project;
  channel: Channel;
};

export function useHumanTasks(): HumanTask[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.executions
    .flatMap<HumanTask>((execution) => {
      const project = db.projects.find((item) => item.id === execution.projectId);
      const channel = db.channels.find((item) => item.id === execution.channelId);
      if (!project || !channel) return [];
      return execution.blocks.flatMap((blockExecution) => {
        if (!["awaiting_human", "in_progress"].includes(blockExecution.status)) return [];
        const block = execution.methodSnapshot.blocks.find(
          (item) => item.id === blockExecution.blockId,
        );
        return block ? [{ execution, block, blockExecution, project, channel }] : [];
      });
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

export function setChannelMethod(
  channelId: string,
  processType: UniversalProcess,
  method: ProcessMethod,
) {
  const channel = db.channels.find((item) => item.id === channelId);
  if (!channel) return;
  channel.methods = {
    ...channel.methods,
    [processType]: {
      processType,
      blocks: method.blocks.map((block, order) => ({
        ...normalizeActionBlock(block, processType),
        order,
      })),
    },
  };
  emit();
  void request(`/api/channels/${channel.id}`, "PUT", channel);
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
  void request(
    create ? "/api/executions" : `/api/executions/${execution.id}`,
    create ? "POST" : "PUT",
    execution,
  );
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
  if (!project || !channel || !method?.blocks.length) return undefined;
  const now = new Date().toISOString();
  const methodSnapshot: ProcessMethod = {
    processType,
    blocks: method.blocks.map((block, order) => ({
      ...structuredClone(normalizeActionBlock(block, processType)),
      order,
    })),
  };
  const firstBlock = methodSnapshot.blocks[0];
  const firstStatus = firstBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
  const execution: ProcessExecution = {
    id: crypto.randomUUID(),
    projectId,
    channelId: channel.id,
    processType,
    methodSnapshot,
    blocks: methodSnapshot.blocks.map((block, index) => ({
      blockId: block.id,
      status: index === 0 ? firstStatus : "pending",
      values: {},
      startedAt: index === 0 ? now : undefined,
    })),
    status: firstStatus === "awaiting_human" ? "awaiting_human" : "blocked_executor",
    createdAt: now,
    updatedAt: now,
  };
  db.executions.unshift(execution);
  project.stages = {
    ...project.stages,
    [processType]: firstStatus === "awaiting_human" ? "awaiting_human" : "blocked",
  };
  project.currentStage = processType;
  project.state = project.stages[processType];
  persistProject(project);
  persistExecution(execution, true);
  emit();
  return execution;
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
  blockExecution.status = "in_progress";
  execution.status = "awaiting_human";
  persistExecution(execution);
  emit();
  return true;
}

export function completeHumanBlock(
  executionId: string,
  blockId: string,
  values: Record<string, RuntimeValue>,
): { ok: true; completedProcess: boolean } | { ok: false; missing: string[] } {
  const execution = db.executions.find((item) => item.id === executionId);
  const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
  const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
  if (!execution || !block || !blockExecution || block.operator !== "Humano") {
    return { ok: false, missing: ["Executor humano indisponível"] };
  }
  const missing = (block.outputs ?? [])
    .filter((output) => output.required && isEmptyRuntimeValue(values[output.key]))
    .map((output) => output.label);
  if (missing.length) return { ok: false, missing };
  const now = new Date().toISOString();
  blockExecution.values = structuredClone(values);
  blockExecution.status = "completed";
  blockExecution.completedAt = now;
  const index = execution.blocks.indexOf(blockExecution);
  const nextExecution = execution.blocks[index + 1];
  const nextBlock = nextExecution
    ? execution.methodSnapshot.blocks.find((item) => item.id === nextExecution.blockId)
    : undefined;
  if (nextExecution && nextBlock) {
    nextExecution.startedAt = now;
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
      project.state = project.stages[execution.processType];
      persistProject(project);
    }
    persistExecution(execution);
    emit();
    return { ok: true, completedProcess: false };
  }
  execution.status = "completed";
  const project = db.projects.find((item) => item.id === execution.projectId);
  if (project) completeProjectStage(project, execution.processType);
  persistExecution(execution);
  emit();
  return { ok: true, completedProcess: true };
}

export function resetStage(projectId: string, stage: ProcessId) {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return;
  const execution = db.executions.find(
    (item) => item.projectId === projectId && item.processType === stage,
  );
  if (execution) {
    db.executions.splice(db.executions.indexOf(execution), 1);
    void request(`/api/executions/${execution.id}`, "DELETE");
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

export { createEmptyMethods };

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
