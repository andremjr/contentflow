/**
 * Command builders — one per process.
 *
 * Each builder is a PURE function: given a project context, a frozen
 * config snapshot and optional inputs, it produces an `EngineCommand`
 * envelope ready to hand to a runner. No side effects, no I/O.
 *
 * These functions are the single source of truth for "what the engine
 * receives". Swapping the mock runner for a real HTTP transport later
 * requires zero changes here.
 */
import type {
  EngineCommand,
  ProjectContext,
  ResearchConfig,
  IdeasConfig,
  TitlesConfig,
  ThumbnailConfig,
  ScriptConfig,
  NarrationConfig,
  AssetsConfig,
  EditingConfig,
  PublishingConfig,
} from "./types";
import type { ProcessId } from "@/lib/mock-data";

// ---------- utils ----------

function makeCommandId(processId: ProcessId, projectId: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cmd_${processId}_${projectId}_${Date.now()}_${rand}`;
}

function envelope<C, I>(
  processId: ProcessId,
  project: ProjectContext,
  config: C,
  input?: I,
): EngineCommand<C, I> {
  return {
    processId,
    commandId: makeCommandId(processId, project.projectId),
    createdAt: new Date().toISOString(),
    project,
    // freeze so downstream code can't mutate the snapshot
    config: Object.freeze({ ...config }) as C,
    input,
  };
}

// ---------- builders ----------

export type ResearchInput = { extraKeywords?: string[] };
export function buildResearchCommand(args: {
  project: ProjectContext;
  config: ResearchConfig;
  input?: ResearchInput;
}) {
  const merged: ResearchConfig = {
    ...args.config,
    keywords: [
      ...args.config.keywords,
      ...(args.input?.extraKeywords ?? []),
    ].filter(Boolean),
  };
  return envelope<ResearchConfig, ResearchInput>(
    "research",
    args.project,
    merged,
    args.input,
  );
}

export type IdeasInput = { researchSummary?: string };
export function buildIdeasCommand(args: {
  project: ProjectContext;
  config: IdeasConfig;
  input?: IdeasInput;
}) {
  return envelope<IdeasConfig, IdeasInput>(
    "ideas",
    args.project,
    args.config,
    args.input,
  );
}

export type TitlesInput = { idea: string };
export function buildTitlesCommand(args: {
  project: ProjectContext;
  config: TitlesConfig;
  input: TitlesInput;
}) {
  return envelope<TitlesConfig, TitlesInput>(
    "titles",
    args.project,
    args.config,
    args.input,
  );
}

export type ThumbnailInput = { title: string; brief?: string };
export function buildThumbnailCommand(args: {
  project: ProjectContext;
  config: ThumbnailConfig;
  input: ThumbnailInput;
}) {
  return envelope<ThumbnailConfig, ThumbnailInput>(
    "thumbnail",
    args.project,
    args.config,
    args.input,
  );
}

export type ScriptInput = { title: string; outline?: string };
export function buildScriptCommand(args: {
  project: ProjectContext;
  config: ScriptConfig;
  input: ScriptInput;
}) {
  const targetWords =
    args.config.targetDurationMinutes * args.config.wordsPerMinute;
  return envelope<ScriptConfig & { targetWords: number }, ScriptInput>(
    "script",
    args.project,
    { ...args.config, targetWords },
    args.input,
  );
}

export type NarrationInput = { scriptText: string };
export function buildNarrationCommand(args: {
  project: ProjectContext;
  config: NarrationConfig;
  input: NarrationInput;
}) {
  return envelope<NarrationConfig, NarrationInput>(
    "narration",
    args.project,
    args.config,
    args.input,
  );
}

export type AssetsInput = { scriptText: string; durationMinutes: number };
export function buildAssetsCommand(args: {
  project: ProjectContext;
  config: AssetsConfig;
  input: AssetsInput;
}) {
  const totalImages = Math.ceil(
    args.config.imagesPerMinute * args.input.durationMinutes,
  );
  const totalClips = Math.ceil(
    args.config.videoClipsPerMinute * args.input.durationMinutes,
  );
  return envelope<AssetsConfig & { totalImages: number; totalClips: number }, AssetsInput>(
    "assets",
    args.project,
    { ...args.config, totalImages, totalClips },
    args.input,
  );
}

export type EditingInput = {
  narrationUrl: string;
  assetUrls: string[];
};
export function buildEditingCommand(args: {
  project: ProjectContext;
  config: EditingConfig;
  input: EditingInput;
}) {
  return envelope<EditingConfig, EditingInput>(
    "editing",
    args.project,
    args.config,
    args.input,
  );
}

export type PublishingInput = {
  videoUrl: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
};
export function buildPublishingCommand(args: {
  project: ProjectContext;
  config: PublishingConfig;
  input: PublishingInput;
}) {
  return envelope<PublishingConfig, PublishingInput>(
    "publishing",
    args.project,
    args.config,
    args.input,
  );
}
