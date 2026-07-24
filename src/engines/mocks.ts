/**
 * Mock engine runners — simulate the "real" processing motors.
 *
 * Each runner accepts the exact EngineCommand its builder produces and
 * returns a typed EngineResult after a small artificial delay. Swap any
 * of these for a real transport (fetch / server function / edge worker)
 * without touching builders or UI.
 */
import type { EngineCommand, EngineResult } from "./types";
import type { ProcessId } from "@/lib/mock-data";

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function wrap<R>(
  command: EngineCommand,
  ms: number,
  produce: () => R,
): Promise<EngineResult<R>> {
  const started = Date.now();
  await delay(ms);
  return {
    commandId: command.commandId,
    processId: command.processId as ProcessId,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    data: produce(),
  };
}

// ---------- research ----------

export type ResearchResultItem = {
  title: string;
  channel: string;
  views: string;
  publishedAt: string;
  url: string;
};

export function runMockResearch(command: EngineCommand) {
  return wrap<{ items: ResearchResultItem[] }>(command, 900, () => ({
    items: [
      { title: "O verdadeiro custo da dívida americana", channel: "Money Explained", views: "1,2M", publishedAt: "há 3 dias", url: "https://example.com/1" },
      { title: "Por que juros altos travam a economia", channel: "Economia Diária", views: "820k", publishedAt: "há 1 semana", url: "https://example.com/2" },
      { title: "A crise silenciosa dos bancos regionais", channel: "Cortex Finance", views: "450k", publishedAt: "há 2 semanas", url: "https://example.com/3" },
      { title: "O que ninguém te contou sobre inflação", channel: "Finance Simplified", views: "2,1M", publishedAt: "há 1 mês", url: "https://example.com/4" },
    ],
  }));
}

// ---------- ideas ----------

export type IdeaItem = { id: string; title: string; angle: string; score: number };

export function runMockIdeas(command: EngineCommand) {
  return wrap<{ ideas: IdeaItem[] }>(command, 800, () => ({
    ideas: [
      { id: "i1", title: "A anatomia de uma bolha financeira", angle: "explainer", score: 87 },
      { id: "i2", title: "Por que os bancos centrais estão perdendo o controle", angle: "provocative", score: 92 },
      { id: "i3", title: "O colapso silencioso dos títulos longos", angle: "documentary", score: 78 },
      { id: "i4", title: "Como a Nvidia ganhou a guerra da IA", angle: "story", score: 95 },
    ],
  }));
}

// ---------- titles ----------

export function runMockTitles(command: EngineCommand) {
  return wrap<{ variants: string[] }>(command, 500, () => ({
    variants: [
      "O ERRO que fez os bancos centrais perderem o controle",
      "Por que os juros altos não estão funcionando (dessa vez)",
      "A verdade sobre a nova crise silenciosa dos bancos",
      "O que Wall Street esconde sobre a próxima recessão",
      "5 sinais de que a bolha finalmente vai estourar",
    ],
  }));
}

// ---------- thumbnail ----------

export function runMockThumbnail(command: EngineCommand) {
  return wrap<{ images: string[] }>(command, 1200, () => ({
    images: [
      "https://picsum.photos/seed/thumb1/1280/720",
      "https://picsum.photos/seed/thumb2/1280/720",
      "https://picsum.photos/seed/thumb3/1280/720",
    ],
  }));
}

// ---------- script ----------

export function runMockScript(command: EngineCommand) {
  return wrap<{ text: string; wordCount: number }>(command, 1400, () => {
    const text =
      "Você já parou pra pensar que a maior crise financeira das últimas décadas pode estar acontecendo agora, silenciosamente, longe das manchetes? Neste episódio, vamos abrir a caixa-preta dos bancos regionais...";
    return { text, wordCount: text.split(/\s+/).length };
  });
}

// ---------- narration ----------

export function runMockNarration(command: EngineCommand) {
  return wrap<{ audioUrl: string; durationSeconds: number }>(command, 1000, () => ({
    audioUrl:
      "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3",
    durationSeconds: 187,
  }));
}

// ---------- assets ----------

export function runMockAssets(command: EngineCommand) {
  return wrap<{ images: string[]; clips: string[] }>(command, 900, () => ({
    images: Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/asset${i}/1280/720`),
    clips: [
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    ],
  }));
}

// ---------- editing ----------

export function runMockEditing(command: EngineCommand) {
  return wrap<{ videoUrl: string; durationSeconds: number }>(command, 1600, () => ({
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    durationSeconds: 596,
  }));
}

// ---------- publishing ----------

export function runMockPublishing(command: EngineCommand) {
  return wrap<{ videoId: string; url: string }>(command, 1100, () => ({
    videoId: "yt_" + Math.random().toString(36).slice(2, 10),
    url: "https://youtu.be/dQw4w9WgXcQ",
  }));
}
