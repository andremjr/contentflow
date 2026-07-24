/**
 * Process registry + orchestrator.
 *
 * The registry maps every ProcessId to its builder + mock runner + defaults.
 * `runProcess` is the single call site the UI should use:
 *
 *   const result = await runProcess("research", { project, config, input });
 *
 * Under the hood it builds the command envelope, hands it to the runner
 * (mock today, real transport later), and returns a typed result.
 */
import type { ProcessId } from "@/lib/mock-data";
import { DEFAULT_CONFIGS } from "./defaults";
import * as builders from "./builders";
import * as mocks from "./mocks";
import type {
  EngineCommand,
  EngineResult,
  ProcessConfigMap,
  ProjectContext,
} from "./types";

type RegistryEntry<P extends ProcessId> = {
  processId: P;
  defaults: ProcessConfigMap[P];
  build: (args: {
    project: ProjectContext;
    config: ProcessConfigMap[P];
    input?: unknown;
  }) => EngineCommand;
  run: (command: EngineCommand) => Promise<EngineResult>;
};

export const REGISTRY: { [P in ProcessId]: RegistryEntry<P> } = {
  research: {
    processId: "research",
    defaults: DEFAULT_CONFIGS.research,
    build: (a) =>
      builders.buildResearchCommand({
        project: a.project,
        config: a.config,
        input: a.input as builders.ResearchInput | undefined,
      }),
    run: (c) => mocks.runMockResearch(c),
  },
  ideas: {
    processId: "ideas",
    defaults: DEFAULT_CONFIGS.ideas,
    build: (a) =>
      builders.buildIdeasCommand({
        project: a.project,
        config: a.config,
        input: a.input as builders.IdeasInput | undefined,
      }),
    run: (c) => mocks.runMockIdeas(c),
  },
  titles: {
    processId: "titles",
    defaults: DEFAULT_CONFIGS.titles,
    build: (a) =>
      builders.buildTitlesCommand({
        project: a.project,
        config: a.config,
        input: (a.input as builders.TitlesInput) ?? { idea: a.project.title },
      }),
    run: (c) => mocks.runMockTitles(c),
  },
  thumbnail: {
    processId: "thumbnail",
    defaults: DEFAULT_CONFIGS.thumbnail,
    build: (a) =>
      builders.buildThumbnailCommand({
        project: a.project,
        config: a.config,
        input:
          (a.input as builders.ThumbnailInput) ?? { title: a.project.title },
      }),
    run: (c) => mocks.runMockThumbnail(c),
  },
  script: {
    processId: "script",
    defaults: DEFAULT_CONFIGS.script,
    build: (a) =>
      builders.buildScriptCommand({
        project: a.project,
        config: a.config,
        input: (a.input as builders.ScriptInput) ?? { title: a.project.title },
      }),
    run: (c) => mocks.runMockScript(c),
  },
  narration: {
    processId: "narration",
    defaults: DEFAULT_CONFIGS.narration,
    build: (a) =>
      builders.buildNarrationCommand({
        project: a.project,
        config: a.config,
        input:
          (a.input as builders.NarrationInput) ?? { scriptText: "" },
      }),
    run: (c) => mocks.runMockNarration(c),
  },
  assets: {
    processId: "assets",
    defaults: DEFAULT_CONFIGS.assets,
    build: (a) =>
      builders.buildAssetsCommand({
        project: a.project,
        config: a.config,
        input:
          (a.input as builders.AssetsInput) ?? {
            scriptText: "",
            durationMinutes: a.config.imagesPerMinute > 0 ? 10 : 5,
          },
      }),
    run: (c) => mocks.runMockAssets(c),
  },
  editing: {
    processId: "editing",
    defaults: DEFAULT_CONFIGS.editing,
    build: (a) =>
      builders.buildEditingCommand({
        project: a.project,
        config: a.config,
        input:
          (a.input as builders.EditingInput) ?? {
            narrationUrl: "",
            assetUrls: [],
          },
      }),
    run: (c) => mocks.runMockEditing(c),
  },
  publishing: {
    processId: "publishing",
    defaults: DEFAULT_CONFIGS.publishing,
    build: (a) =>
      builders.buildPublishingCommand({
        project: a.project,
        config: a.config,
        input:
          (a.input as builders.PublishingInput) ?? {
            videoUrl: "",
            title: a.project.title,
            description: "",
          },
      }),
    run: (c) => mocks.runMockPublishing(c),
  },
};

/**
 * High-level entry point. Builds a command and runs it against the current
 * (mock) engine. Returns the command envelope alongside the result so the
 * UI can log / persist both.
 */
export async function runProcess<P extends ProcessId>(
  processId: P,
  args: {
    project: ProjectContext;
    config: ProcessConfigMap[P];
    input?: unknown;
  },
): Promise<{ command: EngineCommand; result: EngineResult }> {
  const entry = REGISTRY[processId] as RegistryEntry<P>;
  const command = entry.build(args);
  const result = await entry.run(command);
  return { command, result };
}

/** Convenience: pure command builder without running. */
export function buildCommand<P extends ProcessId>(
  processId: P,
  args: {
    project: ProjectContext;
    config: ProcessConfigMap[P];
    input?: unknown;
  },
): EngineCommand {
  return (REGISTRY[processId] as RegistryEntry<P>).build(args);
}
