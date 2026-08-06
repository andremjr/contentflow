import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Type,
  Image as ImageIcon,
  FileText,
  Mic,
  Layers,
  Scissors,
  Upload,
} from "lucide-react";

export const PROCESS_ORDER = [
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
] as const;

export type UniversalProcess = (typeof PROCESS_ORDER)[number];
export type ProcessId = UniversalProcess;

export type ProcessState =
  | "not_started"
  | "configuring"
  | "processing"
  | "awaiting_review"
  | "approved"
  | "done"
  | "error"
  | "blocked";

export type BlockOperator = "IA" | "Humano" | "Código";
export type BlockType = "BUSCAR" | "ESCOLHER" | "CRIAR" | "VALIDAR";
export type BlockParameterType = "text" | "number" | "select" | "boolean" | "textarea";

export type BlockParameter = {
  id: string;
  label: string;
  key: string;
  type: BlockParameterType;
  value: string | number | boolean;
  placeholder?: string;
  options?: string[];
};

export type ActionBlock = {
  id: string;
  type: BlockType;
  operator: BlockOperator;
  parameters: BlockParameter[];
  order: number;
};

export type ProcessMethod = {
  processType: UniversalProcess;
  blocks: ActionBlock[];
};

export type Channel = {
  id: string;
  youtubeChannelId?: string;
  name: string;
  handle: string;
  color: string;
  subscribers: string;
  avatarUrl?: string;
  bannerUrl?: string;
  lastSyncedAt?: string;
  description?: string;
  niche: string;
  language: string;
  activeProjects: number;
  frequency: string;
  nextPublish: string;
  currentProjectProgress: number;
  status: "healthy" | "attention" | "paused";
  trend: number[];
  methods: Record<UniversalProcess, ProcessMethod>;
  createdAt: string;
};

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
  createdAt: string;
};

export const PROCESS_META: Record<ProcessId, { label: string; icon: LucideIcon }> = {
  theme: { label: "Tema", icon: Sparkles },
  title: { label: "Título", icon: Type },
  thumbnail: { label: "Thumbnail", icon: ImageIcon },
  script: { label: "Roteiro", icon: FileText },
  narration: { label: "Narração e Áudio", icon: Mic },
  assets: { label: "Assets Visuais", icon: Layers },
  editing: { label: "Edição", icon: Scissors },
  publishing: { label: "Publicação", icon: Upload },
};

export const STATE_META: Record<
  ProcessState,
  {
    label: string;
    tone: "muted" | "info" | "brand" | "warning" | "success" | "done" | "error" | "blocked";
  }
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

export function createEmptyMethods(): Record<UniversalProcess, ProcessMethod> {
  return Object.fromEntries(
    PROCESS_ORDER.map((processType) => [processType, { processType, blocks: [] }]),
  ) as unknown as Record<UniversalProcess, ProcessMethod>;
}
