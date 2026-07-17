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
  research: { label: "Pesquisa", icon: Search },
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
  "research",
  "ideas",
  "titles",
  "thumbnail",
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

export const projects: Project[] = [
  {
    id: "p-1",
    title: "O paradoxo dos buracos negros supermassivos",
    channelId: "ch-1",
    currentStage: "editing",
    state: "processing",
    progress: 72,
    deadline: "22 nov",
    duration: "18:24",
    updatedAt: "há 8 min",
    stages: stagesUpTo("editing", "processing"),
    assignee: { name: "Marina Costa", initials: "MC" },
    thumbHue: 220,
  },
  {
    id: "p-2",
    title: "Por que os bancos centrais estão perdendo o controle",
    channelId: "ch-2",
    currentStage: "narration",
    state: "awaiting_review",
    progress: 54,
    deadline: "24 nov",
    duration: "22:10",
    updatedAt: "há 42 min",
    stages: stagesUpTo("narration", "awaiting_review"),
    assignee: { name: "Rafael Lima", initials: "RL" },
    thumbHue: 260,
  },
  {
    id: "p-3",
    title: "A gramática visual de Denis Villeneuve",
    channelId: "ch-3",
    currentStage: "thumbnail",
    state: "configuring",
    progress: 28,
    deadline: "27 nov",
    duration: "14:02",
    updatedAt: "há 2 h",
    stages: stagesUpTo("thumbnail", "configuring"),
    assignee: { name: "Ana Prado", initials: "AP" },
    thumbHue: 200,
  },
  {
    id: "p-4",
    title: "Rotina matinal de 5 CEOs de startups",
    channelId: "ch-4",
    currentStage: "publishing",
    state: "done",
    progress: 100,
    deadline: "publicado",
    duration: "09:48",
    updatedAt: "ontem",
    stages: stagesUpTo("publishing", "done"),
    assignee: { name: "Lucas Andrade", initials: "LU" },
    thumbHue: 150,
  },
  {
    id: "p-5",
    title: "A física impossível de Interstellar",
    channelId: "ch-1",
    currentStage: "script",
    state: "error",
    progress: 41,
    deadline: "29 nov",
    duration: "—",
    updatedAt: "há 1 h",
    stages: stagesUpTo("script", "error"),
    assignee: { name: "Bruno Reis", initials: "BR" },
    isLate: true,
    thumbHue: 10,
  },
  {
    id: "p-6",
    title: "Como a Nvidia ganhou a guerra da IA",
    channelId: "ch-2",
    currentStage: "assets",
    state: "processing",
    progress: 63,
    deadline: "30 nov",
    duration: "26:30",
    updatedAt: "há 15 min",
    stages: stagesUpTo("assets", "processing"),
    assignee: { name: "Carla Nunes", initials: "CN" },
    thumbHue: 280,
  },
];

export type ActionItem = {
  id: string;
  title: string;
  kind: "approve_titles" | "review_script" | "select_thumb" | "fix_narration" | "confirm_publish";
  priority: "high" | "medium" | "low";
  channelId: string;
  projectTitle: string;
  deadline: string;
};

export const actionItems: ActionItem[] = [
  {
    id: "act-1",
    title: "Aprovar títulos",
    kind: "approve_titles",
    priority: "high",
    channelId: "ch-2",
    projectTitle: "Como a Nvidia ganhou a guerra da IA",
    deadline: "hoje · 18h",
  },
  {
    id: "act-2",
    title: "Revisar roteiro",
    kind: "review_script",
    priority: "high",
    channelId: "ch-1",
    projectTitle: "A física impossível de Interstellar",
    deadline: "atrasado 2h",
  },
  {
    id: "act-3",
    title: "Selecionar thumbnail",
    kind: "select_thumb",
    priority: "medium",
    channelId: "ch-3",
    projectTitle: "A gramática visual de Denis Villeneuve",
    deadline: "amanhã",
  },
  {
    id: "act-4",
    title: "Corrigir erro de narração",
    kind: "fix_narration",
    priority: "high",
    channelId: "ch-2",
    projectTitle: "Por que os bancos centrais estão perdendo o controle",
    deadline: "hoje",
  },
  {
    id: "act-5",
    title: "Confirmar publicação",
    kind: "confirm_publish",
    priority: "low",
    channelId: "ch-4",
    projectTitle: "Rotina matinal de 5 CEOs de startups",
    deadline: "30 nov · 07h",
  },
];

export const activityFeed = [
  {
    id: "a1",
    project: "O paradoxo dos buracos negros supermassivos",
    action: "Edição avançada em 72%",
    time: "há 8 min",
    tone: "brand" as const,
  },
  {
    id: "a2",
    project: "Por que os bancos centrais estão perdendo o controle",
    action: "Narração aguardando revisão",
    time: "há 42 min",
    tone: "warning" as const,
  },
  {
    id: "a3",
    project: "A física impossível de Interstellar",
    action: "Erro no gerador de roteiro",
    time: "há 1 h",
    tone: "error" as const,
  },
  {
    id: "a4",
    project: "Rotina matinal de 5 CEOs de startups",
    action: "Publicado no canal Zen Productivity",
    time: "ontem",
    tone: "success" as const,
  },
  {
    id: "a5",
    project: "Como a Nvidia ganhou a guerra da IA",
    action: "Assets renderizados",
    time: "há 15 min",
    tone: "brand" as const,
  },
];

export const metrics = [
  {
    id: "m1",
    label: "Projetos ativos",
    value: "24",
    delta: "+3 esta semana",
    trend: "up" as const,
  },
  {
    id: "m2",
    label: "Aguardando revisão",
    value: "07",
    delta: "2 há mais de 24h",
    trend: "warning" as const,
  },
  {
    id: "m3",
    label: "Publicados no mês",
    value: "18",
    delta: "+22% vs. mês passado",
    trend: "up" as const,
  },
  {
    id: "m4",
    label: "Tempo médio de pipeline",
    value: "3d 4h",
    delta: "−11h vs. média",
    trend: "up" as const,
  },
];
