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
  | "awaiting_human"
  | "awaiting_review"
  | "approved"
  | "done"
  | "error"
  | "blocked";

export type BlockOperator = "IA" | "Humano" | "Código";
export type BlockType = "BUSCAR" | "ESCOLHER" | "CRIAR" | "VALIDAR";
export type BlockParameterType = "text" | "number" | "select" | "boolean" | "textarea";

export type HumanFieldType =
  | BlockParameterType
  | "multiselect"
  | "list"
  | "records"
  | "datetime"
  | "url"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "files"
  | "approval"
  | "thumbnail_layout";

export const PRESENTATION_RENDERER_IDS = [
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

export type PresentationRendererId = (typeof PRESENTATION_RENDERER_IDS)[number];

export type PresentationItemType = "text" | "record" | "file" | "image" | "audio" | "video";

export type FieldPresentation = {
  renderer: PresentationRendererId;
  itemType?: PresentationItemType;
  acceptedMimeTypes?: string[];
};

export type RecordFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "datetime"
  | "url"
  | "file"
  | "image"
  | "audio"
  | "video";

export type RecordFieldDefinition = {
  id: string;
  label: string;
  key: string;
  type: RecordFieldType;
  required: boolean;
  options?: string[];
};

export type BlockInputSource =
  | "project"
  | "previous_process"
  | "previous_block"
  | "channel_history"
  | "channel_library"
  | "static";

export type ChannelHistoryEligibility = "completed" | "published";

export type BlockInputBinding = {
  id: string;
  label: string;
  type: HumanFieldType;
  source: BlockInputSource;
  sourceKey?: string;
  sourceProcessType?: UniversalProcess;
  blockId?: string;
  collection?: string;
  staticValue?: string;
  historyLimit?: number;
  historyEligibility?: ChannelHistoryEligibility;
  recordFields?: RecordFieldDefinition[];
  presentation?: FieldPresentation;
};

export type BlockFieldDefinition = {
  id: string;
  label: string;
  key: string;
  type: HumanFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  optionsSourceBlockId?: string;
  optionsSourceKey?: string;
  recordFields?: RecordFieldDefinition[];
  presentation?: FieldPresentation;
};

export type BlockParameter = {
  id: string;
  label: string;
  key: string;
  type: BlockParameterType;
  value: string | number | boolean;
  placeholder?: string;
  options?: string[];
};

export type ValidationMode = "approval" | "select_one" | "select_many";

export type BlockValidationConfig = {
  targetBlockId?: string;
  targetOutputKey?: string;
  mode: ValidationMode;
  onReject: "retry_target" | "pause";
  maxAttempts: number;
};

export type BlockPluginBinding = {
  pluginId: string;
  capabilityId: string;
  configuration: Record<string, string | number | boolean>;
};

export type ActionBlock = {
  id: string;
  type: BlockType;
  operator: BlockOperator;
  collectionId?: string;
  name?: string;
  instructions?: string;
  inputs?: BlockInputBinding[];
  outputs?: BlockFieldDefinition[];
  validation?: BlockValidationConfig;
  plugin?: BlockPluginBinding;
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

export type StoredFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  sha256?: string;
};

export type DeliveryStatus = "partial" | "completed" | "invalidated";

export type DeliveryItemReference = {
  itemId: string;
  role?: string;
};

export type DeliveryItem = {
  /** Identidade universal gerada pelo núcleo para este item da entrega. */
  id: string;
  order: number;
  value: RuntimeValue | StructuredRecord;
  externalKey?: string;
  references?: DeliveryItemReference[];
};

export type ProjectDelivery = {
  /** Identidade universal da saída materializada de um bloco. */
  id: string;
  projectId: string;
  channelId: string;
  processType: UniversalProcess;
  executionId: string;
  blockId: string;
  outputKey: string;
  label: string;
  type: HumanFieldType;
  cardinality: "one" | "many";
  attempt: number;
  status: DeliveryStatus;
  items: DeliveryItem[];
  createdAt: string;
  updatedAt: string;
};

export type ThumbnailLayoutBox = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ThumbnailLayout = {
  aspectRatio: "16:9";
  boxes: ThumbnailLayoutBox[];
};

export type StructuredRecord = Record<string, string | number | boolean | StoredFile | null>;

export type RuntimeValue =
  | string
  | number
  | boolean
  | string[]
  | StoredFile
  | StoredFile[]
  | StructuredRecord[]
  | ThumbnailLayout
  | null;

export type BlockExecutionStatus =
  | "pending"
  | "awaiting_human"
  | "in_progress"
  | "completed"
  | "blocked_executor"
  | "failed"
  | "cancelled";

export type BlockExecution = {
  blockId: string;
  status: BlockExecutionStatus;
  values: Record<string, RuntimeValue>;
  attempt?: number;
  retryFeedback?: Record<string, RuntimeValue>;
  error?: string;
  logs?: string[];
  jobId?: string;
  traceId?: string;
  progress?: number;
  progressMessage?: string;
  startedAt?: string;
  completedAt?: string;
};

export type ProcessExecutionStatus =
  | "not_started"
  | "running"
  | "awaiting_human"
  | "awaiting_output"
  | "blocked_executor"
  | "failed"
  | "completed"
  | "cancelled";

export type ProcessOutput = {
  processType: UniversalProcess;
  values: Record<string, RuntimeValue>;
  sourceBlockId?: string;
  createdAt: string;
};

export type ProcessExecution = {
  id: string;
  projectId: string;
  channelId: string;
  processType: UniversalProcess;
  methodSnapshot: ProcessMethod;
  blocks: BlockExecution[];
  /** Registro derivado e persistido de todas as entregas produzidas pela execução. */
  deliveries?: ProjectDelivery[];
  status: ProcessExecutionStatus;
  outputStatus: "pending" | "awaiting_human" | "completed";
  output?: ProcessOutput;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategicCollectionField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "image" | "url" | "thumbnail_layout";
  required: boolean;
};

export type StrategicCollection = {
  id: string;
  channelId: string;
  name: string;
  fields: StrategicCollectionField[];
  createdAt: string;
};

export type ChannelLibraryItem = {
  id: string;
  channelId: string;
  collectionId: string;
  values: Record<string, string | number | StoredFile | ThumbnailLayout>;
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
  awaiting_human: { label: "Aguardando humano", tone: "warning" },
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
