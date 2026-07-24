/**
 * Simulated "backend" — an in-memory + localStorage-backed store that
 * mirrors what a real API would expose. Keeps all UI state persistent
 * across reloads so you can test create/update flows end-to-end
 * without wiring a real backend.
 */
import { useSyncExternalStore } from "react";
import {
  channels as seedChannels,
  projects as seedProjects,
  PROCESS_ORDER,
  type Channel,
  type Project,
  type ProcessId,
  type ProcessState,
} from "@/lib/mock-data";
import { DEFAULT_CONFIGS } from "@/engines/defaults";
import type { ProcessConfigMap } from "@/engines/types";

const STORAGE_KEY = "contentflow-db-v2";

/** Per-channel overrides for each process configuration. */
type ProcessConfigStore = Record<
  string,
  Partial<{ [P in ProcessId]: Partial<ProcessConfigMap[P]> }>
>;

type DbShape = {
  channels: Channel[];
  projects: Project[];
  processConfigs: ProcessConfigStore;
};

// Live arrays — we mutate the same references exported from mock-data so
// any code path that reads them (route loaders, memoized selectors)
// always sees the current state.
const db: DbShape = {
  channels: seedChannels,
  projects: seedProjects,
  processConfigs: {},
};

const listeners = new Set<() => void>();
let version = 0;

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      persist();
      return;
    }
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    if (Array.isArray(parsed.channels)) {
      db.channels.splice(0, db.channels.length, ...parsed.channels);
    }
    if (Array.isArray(parsed.projects)) {
      db.projects.splice(0, db.projects.length, ...parsed.projects);
    }
    if (parsed.processConfigs && typeof parsed.processConfigs === "object") {
      db.processConfigs = parsed.processConfigs as ProcessConfigStore;
    }
  } catch {
    // ignore corrupted state
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        channels: db.channels,
        projects: db.projects,
        processConfigs: db.processConfigs,
      }),
    );
  } catch {
    // ignore quota errors
  }
}

function emit() {
  version += 1;
  persist();
  listeners.forEach((l) => l());
}

// Hydrate on module load (client only).
hydrate();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getVersion() {
  return version;
}

// ---------- Hooks ----------

export function useChannels(): Channel[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.channels;
}

export function useChannel(id: string): Channel | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.channels.find((c) => c.id === id);
}

export function useProjects(channelId?: string): Project[] {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return channelId
    ? db.projects.filter((p) => p.channelId === channelId)
    : db.projects;
}

export function useProject(id: string): Project | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db.projects.find((p) => p.id === id);
}

// ---------- Mutations ----------

export function createChannel(channel: Channel) {
  db.channels.unshift(channel);
  emit();
}


export function removeChannel(id: string) {
  const i = db.channels.findIndex((c) => c.id === id);
  if (i !== -1) db.channels.splice(i, 1);
  // cascade: drop projects of that channel
  for (let j = db.projects.length - 1; j >= 0; j--) {
    if (db.projects[j].channelId === id) db.projects.splice(j, 1);
  }
  emit();
}

export function removeProject(id: string) {
  const i = db.projects.findIndex((p) => p.id === id);
  if (i === -1) return;
  const channelId = db.projects[i].channelId;
  db.projects.splice(i, 1);
  const ch = db.channels.find((c) => c.id === channelId);
  if (ch && ch.activeProjects) ch.activeProjects = Math.max(0, ch.activeProjects - 1);
  emit();
}

/**
 * Clear a single stage's result — sets it back to not_started and
 * recomputes progress / current stage pointer.
 */
export function resetStage(projectId: string, stage: ProcessId) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return;
  p.stages = { ...p.stages, [stage]: "not_started" };
  const nextIdx = PROCESS_ORDER.findIndex(
    (s) => p.stages[s] !== "done" && p.stages[s] !== "approved",
  );
  p.currentStage = nextIdx === -1 ? "publishing" : PROCESS_ORDER[nextIdx];
  p.state = p.stages[p.currentStage] ?? "not_started";
  const doneCount = PROCESS_ORDER.filter(
    (s) => p.stages[s] === "done" || p.stages[s] === "approved",
  ).length;
  p.progress = Math.round((doneCount / PROCESS_ORDER.length) * 100);
  p.updatedAt = "agora";
  emit();
}

export type NewProjectInput = {
  title: string;
  channelId: string;
  deadline?: string;
  assignee?: { name: string; initials: string };
};

export function createProject(input: NewProjectInput): Project {
  const stages = {} as Record<ProcessId, ProcessState>;
  PROCESS_ORDER.forEach((p) => (stages[p] = "not_started"));
  const project: Project = {
    id: `p-new-${Date.now()}`,
    title: input.title.trim(),
    channelId: input.channelId,
    currentStage: "research",
    state: "not_started",
    progress: 0,
    deadline: input.deadline?.trim() || "—",
    duration: "—",
    updatedAt: "agora",
    stages,
    assignee: input.assignee ?? { name: "Você", initials: "VC" },
    thumbHue: Math.round(Math.random() * 360),
  };
  db.projects.unshift(project);
  // bump channel's active projects counter
  const ch = db.channels.find((c) => c.id === input.channelId);
  if (ch) ch.activeProjects = (ch.activeProjects ?? 0) + 1;
  emit();
  return project;
}

/**
 * Mark a project's stage as complete and advance the pointer to the
 * next incomplete stage. Recomputes progress as (# done / total).
 */
export function completeStage(projectId: string, stage: ProcessId) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return;
  p.stages = { ...p.stages, [stage]: "done" };

  // find next not-done stage
  const nextIdx = PROCESS_ORDER.findIndex(
    (s) => p.stages[s] !== "done" && p.stages[s] !== "approved",
  );
  if (nextIdx === -1) {
    p.currentStage = "publishing";
    p.state = "done";
  } else {
    p.currentStage = PROCESS_ORDER[nextIdx];
    p.state = p.stages[p.currentStage] ?? "not_started";
  }

  const doneCount = PROCESS_ORDER.filter(
    (s) => p.stages[s] === "done" || p.stages[s] === "approved",
  ).length;
  p.progress = Math.round((doneCount / PROCESS_ORDER.length) * 100);
  p.updatedAt = "agora";
  emit();
}
