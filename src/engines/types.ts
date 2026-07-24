/**
 * Engine layer — shared types.
 *
 * The engine layer is a pure logic layer that sits between the UI and the
 * (future) real processing engines. It knows how to:
 *   1. Hold the per-process configuration (channel-level defaults).
 *   2. Assemble an EngineCommand from a project + config + optional inputs.
 *   3. Hand the command to a runner that today is mocked, tomorrow calls
 *      real APIs / edge functions.
 *
 * Every process (research, ideas, titles, ...) implements the same
 * contract, described by `ProcessEngine<C, I, R>`.
 */
import type { ProcessId } from "@/lib/mock-data";

/** Everything a command needs to know about the project it belongs to. */
export type ProjectContext = {
  projectId: string;
  channelId: string;
  title: string;
  language?: string;
  niche?: string;
};

/**
 * A serializable command envelope. This is the payload we would send to a
 * real backend / worker. Keep it JSON-serializable so it can also be
 * logged, replayed, and diffed.
 */
export type EngineCommand<C = unknown, I = unknown> = {
  processId: ProcessId;
  /** Stable id for correlating logs / retries. */
  commandId: string;
  createdAt: string;
  project: ProjectContext;
  /** Frozen snapshot of the channel-level configuration at build time. */
  config: C;
  /** Optional per-run inputs coming from previous stages or the user. */
  input?: I;
};

export type EngineResult<R = unknown> = {
  commandId: string;
  processId: ProcessId;
  finishedAt: string;
  durationMs: number;
  data: R;
};

/**
 * Contract every process must implement. Kept generic so each process can
 * strongly type its own configuration, inputs and results.
 */
export type ProcessEngine<C, I, R> = {
  processId: ProcessId;
  /** Default channel-level configuration for this process. */
  defaults: C;
  /** Assemble the command payload — pure, no I/O. */
  buildCommand: (args: {
    project: ProjectContext;
    config: C;
    input?: I;
  }) => EngineCommand<C, I>;
  /** Mock execution — will be swapped for a real transport later. */
  runMock: (command: EngineCommand<C, I>) => Promise<EngineResult<R>>;
};

// ---------- Per-process configuration types ----------

export type ResearchSearchEngine = "youtube" | "google" | "web" | "tiktok";

export type ResearchConfig = {
  processEnabled: boolean;
  searchEngine: ResearchSearchEngine;
  keywordsEnabled: boolean;
  keywords: string[];
  negativesEnabled: boolean;
  negativeKeywords: string[];
  languageEnabled: boolean;
  language: string;
  durationEnabled: boolean;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  publishedEnabled: boolean;
  publishedInLastDays: number | null;
  viewsEnabled: boolean;
  minViews: number | null;
  maxViews: number | null;
  commentsEnabled: boolean;
  minComments: number | null;
  maxComments: number | null;
  referenceChannelsEnabled: boolean;
  referenceChannels: string[];
};

export type IdeasConfig = {
  count: number;
  tone: "informative" | "provocative" | "curious" | "practical";
  format: "listicle" | "documentary" | "explainer" | "story";
  useReferences: boolean;
};

export type TitlesConfig = {
  variantsPerIdea: number;
  maxLength: number;
  style: "curiosity" | "authority" | "controversial" | "how-to";
  includeNumbers: boolean;
  includeEmoji: boolean;
};

export type ThumbnailConfig = {
  variants: number;
  aspectRatio: "16:9";
  style: "cinematic" | "bold" | "minimal" | "editorial";
  palette: string[];
  includeFace: boolean;
  includeText: boolean;
};

export type ScriptConfig = {
  targetDurationMinutes: number;
  wordsPerMinute: number;
  structure: "hook-body-cta" | "problem-solution" | "story-arc";
  tone: "casual" | "professional" | "documentary";
  hookStyle: "question" | "statement" | "shock";
};

export type NarrationConfig = {
  voiceId: string;
  language: string;
  speedPct: number;
  pitchPct: number;
  format: "mp3" | "wav";
};

export type AssetsConfig = {
  imagesPerMinute: number;
  videoClipsPerMinute: number;
  provider: "stock" | "generated" | "mixed";
  orientation: "landscape";
  minResolution: "1080p" | "4k";
};

export type EditingConfig = {
  template: "standard" | "fast-cut" | "documentary";
  captions: boolean;
  bgMusicVolumeDb: number;
  outputResolution: "1080p" | "4k";
};

export type PublishingConfig = {
  visibility: "public" | "unlisted" | "private" | "scheduled";
  scheduledFor?: string;
  categoryId?: string;
  tags: string[];
  madeForKids: boolean;
  notifySubscribers: boolean;
};

/** Union that maps a ProcessId to its configuration shape. */
export type ProcessConfigMap = {
  research: ResearchConfig;
  ideas: IdeasConfig;
  titles: TitlesConfig;
  thumbnail: ThumbnailConfig;
  script: ScriptConfig;
  narration: NarrationConfig;
  assets: AssetsConfig;
  editing: EditingConfig;
  publishing: PublishingConfig;
};

export type ProcessConfig<P extends ProcessId> = ProcessConfigMap[P];

// ---------- Per-process result shapes ----------

export type ResearchResultItem = {
  title: string;
  channel: string;
  views: string;
  publishedAt: string;
  url: string;
};

export type IdeaItem = {
  id: string;
  title: string;
  angle: string;
  score: number;
};

export type ResultDataMap = {
  research: {
    items: ResearchResultItem[];
    meta: { language: string; minViews: number | null; totalMatched: number };
  };
  ideas: { ideas: IdeaItem[] };
  titles: { variants: string[] };
  thumbnail: { images: string[]; palette: string[] };
  script: {
    text: string;
    wordCount: number;
    sections: { heading: string; body: string }[];
  };
  narration: { audioUrl: string; durationSeconds: number; voiceId: string };
  assets: { images: string[]; clips: string[] };
  editing: {
    videoUrl: string;
    durationSeconds: number;
    resolution: string;
    template: string;
    captions: boolean;
  };
  publishing: {
    videoId: string;
    url: string;
    visibility: string;
    scheduledFor?: string;
    tags: string[];
  };
};

export type ResultData<P extends ProcessId> = ResultDataMap[P];
