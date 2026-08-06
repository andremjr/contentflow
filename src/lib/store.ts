import { useSyncExternalStore } from "react";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type ProcessId,
  type ProcessMethod,
  type ProcessState,
  type Project,
  type UniversalProcess,
} from "@/lib/domain";

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

const db = { channels: [] as Channel[], projects: [] as Project[], ready: false };
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

async function hydrate() {
  if (typeof window === "undefined" || db.ready) return;
  try {
    const [channelsResponse, projectsResponse] = await Promise.all([
      fetch("/api/channels"),
      fetch("/api/projects"),
    ]);
    if (!channelsResponse.ok || !projectsResponse.ok) {
      throw new Error("Não foi possível conectar à API local.");
    }
    const [channels, projects] = (await Promise.all([
      channelsResponse.json(),
      projectsResponse.json(),
    ])) as [Channel[], Project[]];
    db.channels.splice(0, db.channels.length, ...channels);
    db.projects.splice(0, db.projects.length, ...projects);
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

export function useProjects(channelId?: string): Project[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return channelId ? db.projects.filter((project) => project.channelId === channelId) : db.projects;
}

export function useProject(id: string): Project | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.projects.find((project) => project.id === id);
}

export function createChannel(channel: Omit<Channel, "createdAt">) {
  const next: Channel = { ...channel, createdAt: new Date().toISOString() };
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
  const updated = (await response.json()) as Channel;
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
      blocks: method.blocks.map((block, order) => ({ ...block, order })),
    },
  };
  emit();
  void request(`/api/channels/${channel.id}`, "PUT", channel);
}

export function removeChannel(id: string) {
  db.channels.splice(0, db.channels.length, ...db.channels.filter((channel) => channel.id !== id));
  db.projects.splice(
    0,
    db.projects.length,
    ...db.projects.filter((project) => project.channelId !== id),
  );
  emit();
  void request(`/api/channels/${id}`, "DELETE");
}

export function removeProject(id: string) {
  const project = db.projects.find((item) => item.id === id);
  if (!project) return;
  db.projects.splice(db.projects.indexOf(project), 1);
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

export function completeStage(projectId: string, stage: ProcessId) {
  const project = db.projects.find((item) => item.id === projectId);
  const channel = project ? db.channels.find((item) => item.id === project.channelId) : undefined;
  if (!project || !channel?.methods[stage]?.blocks.length) return false;
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
  project.updatedAt = "Agora";
  emit();
  void request(`/api/projects/${project.id}`, "PUT", project);
  return true;
}

export function resetStage(projectId: string, stage: ProcessId) {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return;
  project.stages = { ...project.stages, [stage]: "not_started" };
  project.currentStage = stage;
  project.state = "not_started";
  project.updatedAt = "Agora";
  emit();
  void request(`/api/projects/${project.id}`, "PUT", project);
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
