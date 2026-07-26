import type { LucideIcon } from "lucide-react";
import {
  Search,
  Lightbulb,
  Type,
  Image as ImageIcon,
  FileText,
  Mic,
  Layers,
  Scissors,
  Upload,
} from "lucide-react";

export type ProcessId =
  | "research"
  | "ideas"
  | "titles"
  | "thumbnail"
  | "script"
  | "narration"
  | "assets"
  | "editing"
  | "publishing";

export type ProcessState =
  | "not_started"
  | "configuring"
  | "processing"
  | "awaiting_review"
  | "approved"
  | "done"
  | "error"
  | "blocked";

export const PROCESS_META: Record<
  ProcessId,
  { label: string; icon: LucideIcon }
> = {
  research: { label: "Pesquisa de conteúdo", icon: Search },
  ideas: { label: "Ideias", icon: Lightbulb },
  titles: { label: "Títulos", icon: Type },
  thumbnail: { label: "Thumbnail", icon: ImageIcon },
  script: { label: "Roteiro", icon: FileText },
  narration: { label: "Narração", icon: Mic },
  assets: { label: "Assets", icon: Layers },
  editing: { label: "Edição", icon: Scissors },
  publishing: { label: "Publicação", icon: Upload },
};

export const PROCESS_ORDER: ProcessId[] = [
  "ideas",
  "titles",
  "thumbnail",
  "research",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
];

export const STATE_META: Record<
  ProcessState,
  { label: string; tone: "muted" | "info" | "brand" | "warning" | "success" | "done" | "error" | "blocked" }
> = {
  not_started: { label: "Não iniciado", tone: "muted" },
  configuring: { label: "Configurando", tone: "info" },
  processing: { label: "Em processamento", tone: "brand" },
  awaiting_review: { label: "Aguardando revisão", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  done: { label: "Concluído", tone: "done" },
  error: { label: "Erro", tone: "error" },
  blocked: { label: "Bloqueado", tone: "blocked" },
};

export type Channel = {
  id: string;
  name: string;
  handle: string;
  color: string;
  subscribers: string;
  niche: string;
  language: string;
  activeProjects: number;
  frequency: string;
  nextPublish: string;
  currentProjectProgress: number;
  status: "healthy" | "attention" | "paused";
  trend: number[];
};

export const channels: Channel[] = [
  {
    id: "ch-1",
    name: "Deep Space Docs",
    handle: "@deepspace",
    color: "#2563EB",
    subscribers: "482K",
    niche: "Ciência",
    language: "PT-BR",
    activeProjects: 6,
    frequency: "2x / semana",
    nextPublish: "22 nov · 18h",
    currentProjectProgress: 72,
    status: "healthy",
    trend: [12, 18, 15, 22, 20, 28, 34, 30, 38, 42, 40, 48],
  },
  {
    id: "ch-2",
    name: "Cortex Finance",
    handle: "@cortex",
    color: "#3B82F6",
    subscribers: "1.2M",
    niche: "Finanças",
    language: "PT-BR",
    activeProjects: 9,
    frequency: "3x / semana",
    nextPublish: "24 nov · 09h",
    currentProjectProgress: 54,
    status: "attention",
    trend: [40, 42, 45, 43, 50, 55, 52, 60, 58, 65, 70, 68],
  },
  {
    id: "ch-3",
    name: "Studio Noir",
    handle: "@studionoir",
    color: "#60A5FA",
    subscribers: "218K",
    niche: "Cinema",
    language: "EN",
    activeProjects: 4,
    frequency: "1x / semana",
    nextPublish: "27 nov · 20h",
    currentProjectProgress: 28,
    status: "healthy",
    trend: [8, 10, 12, 11, 14, 16, 18, 17, 20, 22, 24, 26],
  },
  {
    id: "ch-4",
    name: "Zen Productivity",
    handle: "@zenprod",
    color: "#22c55e",
    subscribers: "94K",
    niche: "Produtividade",
    language: "PT-BR",
    activeProjects: 5,
    frequency: "2x / semana",
    nextPublish: "30 nov · 07h",
    currentProjectProgress: 100,
    status: "paused",
    trend: [30, 28, 32, 30, 34, 33, 36, 35, 34, 38, 36, 40],
  },
];

export type Project = {
  id: string;
  title: string;
  channelId: string;
  currentStage: ProcessId;
  state: ProcessState;
  progress: number;
  deadline: string;
  duration: string;
  updatedAt: string;
  stages: Record<ProcessId, ProcessState>;
  assignee: { name: string; initials: string };
  isLate?: boolean;
  thumbHue: number;
};

function stagesUpTo(current: ProcessId, currentState: ProcessState) {
  const idx = PROCESS_ORDER.indexOf(current);
  const map = {} as Record<ProcessId, ProcessState>;
  PROCESS_ORDER.forEach((p, i) => {
    if (i < idx) map[p] = "done";
    else if (i === idx) map[p] = currentState;
    else map[p] = "not_started";
  });
  return map;
}

type ProjectSeed = {
  id: string;
  title: string;
  channelId: string;
  progressLevel: "empty" | "mid" | "done";
  deadline: string;
  duration: string;
  updatedAt: string;
  assignee: { name: string; initials: string };
  thumbHue: number;
  isLate?: boolean;
};

const PROGRESS_PRESETS = {
  empty: {
    currentStage: "research" as ProcessId,
    state: "not_started" as ProcessState,
    progress: 0,
  },
  mid: {
    currentStage: "script" as ProcessId,
    state: "awaiting_review" as ProcessState,
    progress: 55,
  },
  done: {
    currentStage: "publishing" as ProcessId,
    state: "done" as ProcessState,
    progress: 100,
  },
};

const projectSeeds: ProjectSeed[] = [
  // Deep Space Docs (ch-1) — Ciência
  { id: "p-1-a", title: "A anatomia de uma supernova", channelId: "ch-1", progressLevel: "empty", deadline: "05 dez", duration: "—", updatedAt: "há 5 min", assignee: { name: "Marina Costa", initials: "MC" }, thumbHue: 220 },
  { id: "p-1-b", title: "Por que Marte perdeu sua atmosfera", channelId: "ch-1", progressLevel: "mid", deadline: "28 nov", duration: "16:20", updatedAt: "há 1 h", assignee: { name: "Bruno Reis", initials: "BR" }, thumbHue: 12 },
  { id: "p-1-c", title: "O paradoxo dos buracos negros supermassivos", channelId: "ch-1", progressLevel: "done", deadline: "publicado", duration: "18:24", updatedAt: "ontem", assignee: { name: "Marina Costa", initials: "MC" }, thumbHue: 260 },

  // Cortex Finance (ch-2) — Finanças
  { id: "p-2-a", title: "O colapso silencioso dos títulos longos", channelId: "ch-2", progressLevel: "empty", deadline: "08 dez", duration: "—", updatedAt: "há 20 min", assignee: { name: "Rafael Lima", initials: "RL" }, thumbHue: 200 },
  { id: "p-2-b", title: "Por que os bancos centrais estão perdendo o controle", channelId: "ch-2", progressLevel: "mid", deadline: "24 nov", duration: "22:10", updatedAt: "há 42 min", assignee: { name: "Rafael Lima", initials: "RL" }, thumbHue: 265 },
  { id: "p-2-c", title: "Como a Nvidia ganhou a guerra da IA", channelId: "ch-2", progressLevel: "done", deadline: "publicado", duration: "26:30", updatedAt: "há 2 dias", assignee: { name: "Carla Nunes", initials: "CN" }, thumbHue: 280 },

  // Studio Noir (ch-3) — Cinema
  { id: "p-3-a", title: "A luz de Roger Deakins", channelId: "ch-3", progressLevel: "empty", deadline: "12 dez", duration: "—", updatedAt: "há 1 h", assignee: { name: "Ana Prado", initials: "AP" }, thumbHue: 30 },
  { id: "p-3-b", title: "A gramática visual de Denis Villeneuve", channelId: "ch-3", progressLevel: "mid", deadline: "27 nov", duration: "14:02", updatedAt: "há 2 h", assignee: { name: "Ana Prado", initials: "AP" }, thumbHue: 210 },
  { id: "p-3-c", title: "Kubrick e a simetria como narrativa", channelId: "ch-3", progressLevel: "done", deadline: "publicado", duration: "19:45", updatedAt: "há 3 dias", assignee: { name: "Ana Prado", initials: "AP" }, thumbHue: 340 },

  // Zen Productivity (ch-4) — Produtividade
  { id: "p-4-a", title: "O mito da força de vontade", channelId: "ch-4", progressLevel: "empty", deadline: "15 dez", duration: "—", updatedAt: "há 30 min", assignee: { name: "Lucas Andrade", initials: "LU" }, thumbHue: 145 },
  { id: "p-4-b", title: "Como construir uma rotina que se sustenta", channelId: "ch-4", progressLevel: "mid", deadline: "02 dez", duration: "11:30", updatedAt: "há 3 h", assignee: { name: "Lucas Andrade", initials: "LU" }, thumbHue: 170 },
  { id: "p-4-c", title: "Rotina matinal de 5 CEOs de startups", channelId: "ch-4", progressLevel: "done", deadline: "publicado", duration: "09:48", updatedAt: "ontem", assignee: { name: "Lucas Andrade", initials: "LU" }, thumbHue: 150 },
];

export const projects: Project[] = projectSeeds.map((s) => {
  const preset = PROGRESS_PRESETS[s.progressLevel];
  return {
    id: s.id,
    title: s.title,
    channelId: s.channelId,
    currentStage: preset.currentStage,
    state: preset.state,
    progress: preset.progress,
    deadline: s.deadline,
    duration: s.duration,
    updatedAt: s.updatedAt,
    stages: stagesUpTo(preset.currentStage, preset.state),
    assignee: s.assignee,
    isLate: s.isLate,
    thumbHue: s.thumbHue,
  };
});

