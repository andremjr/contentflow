/**
 * Default channel-level configuration for each process. These are used as
 * seed values in the store the first time a channel opens a process page,
 * and as the fallback anywhere a config is expected but missing.
 */
import type { ProcessConfigMap } from "./types";

export const DEFAULT_CONFIGS: ProcessConfigMap = {
  research: {
    keywords: [],
    negativeKeywords: ["shorts"],
    language: "pt-BR",
    durationMinMinutes: 5,
    durationMaxMinutes: 20,
    publishedInLastDays: 30,
    minViews: 100_000,
    maxViews: null,
    minComments: 50,
    referenceChannels: [],
  },
  ideas: {
    count: 10,
    tone: "curious",
    format: "explainer",
    useReferences: true,
  },
  titles: {
    variantsPerIdea: 5,
    maxLength: 70,
    style: "curiosity",
    includeNumbers: true,
    includeEmoji: false,
  },
  thumbnail: {
    variants: 3,
    aspectRatio: "16:9",
    style: "cinematic",
    palette: ["#2563EB", "#0F172A", "#F8FAFC"],
    includeFace: false,
    includeText: true,
  },
  script: {
    targetDurationMinutes: 12,
    wordsPerMinute: 150,
    structure: "hook-body-cta",
    tone: "documentary",
    hookStyle: "question",
  },
  narration: {
    voiceId: "pt-BR-neural-01",
    language: "pt-BR",
    speedPct: 100,
    pitchPct: 0,
    format: "mp3",
  },
  assets: {
    imagesPerMinute: 6,
    videoClipsPerMinute: 2,
    provider: "mixed",
    orientation: "landscape",
    minResolution: "1080p",
  },
  editing: {
    template: "documentary",
    captions: true,
    bgMusicVolumeDb: -18,
    outputResolution: "1080p",
  },
  publishing: {
    visibility: "private",
    tags: [],
    madeForKids: false,
    notifySubscribers: true,
  },
};
