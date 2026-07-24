/**
 * Mock engine runners — config-driven.
 *
 * Each runner reads the frozen `config` inside its EngineCommand and
 * produces a result whose SHAPE reflects the shipped configuration.
 * This lets the UI validate end-to-end that changes made on the
 * process settings pages actually reach the engine and change the
 * generated output.
 */
import type {
  EngineCommand,
  EngineResult,
  ResearchConfig,
  IdeasConfig,
  TitlesConfig,
  ThumbnailConfig,
  ScriptConfig,
  NarrationConfig,
  AssetsConfig,
  EditingConfig,
  PublishingConfig,
  ResultDataMap,
} from "./types";
import type { ProcessId } from "@/lib/mock-data";

// ---------- utils ----------

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

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ---------- research ----------

export function runMockResearch(command: EngineCommand) {
  const cfg = command.config as ResearchConfig;
  return wrap<ResultDataMap["research"]>(command, 700, () => {
    const kws = cfg.keywords.length ? cfg.keywords : ["tema geral"];
    const baseViews = cfg.minViews ?? 100_000;
    const raw = kws.flatMap((kw, i) => [
      {
        title: `Como "${kw}" está mudando em 2025`,
        channel: cfg.referenceChannels[0] ?? "Cortex Insights",
        views: fmtCompact(Math.round(baseViews * (1 + i * 0.6))),
        publishedAt: `há ${(i % 4) + 1} dias`,
        url: `https://youtu.be/${slug(kw)}-a${i}`,
      },
      {
        title: `${kw}: guia definitivo em ${cfg.language}`,
        channel: cfg.referenceChannels[1] ?? "Deep Dive",
        views: fmtCompact(Math.round(baseViews * (2 + i * 0.4))),
        publishedAt: `há ${(i % 3) + 2} semanas`,
        url: `https://youtu.be/${slug(kw)}-b${i}`,
      },
    ]);
    const filtered = raw.filter(
      (it) =>
        !cfg.negativeKeywords.some(
          (n) => n && it.title.toLowerCase().includes(n.toLowerCase()),
        ),
    );
    return {
      items: filtered.slice(0, Math.max(4, kws.length * 2)),
      meta: {
        language: cfg.language,
        minViews: cfg.minViews,
        totalMatched: filtered.length,
      },
    };
  });
}

// ---------- ideas ----------

export function runMockIdeas(command: EngineCommand) {
  const cfg = command.config as IdeasConfig;
  return wrap<ResultDataMap["ideas"]>(command, 700, () => {
    const toneHooks: Record<IdeasConfig["tone"], string[]> = {
      informative: ["Entenda", "Como funciona", "Um panorama sobre"],
      provocative: ["A verdade sobre", "Por que ninguém fala de", "O erro fatal em"],
      curious: ["E se", "Você já imaginou", "O mistério de"],
      practical: ["3 passos para", "Guia rápido de", "Checklist essencial:"],
    };
    const formatSuffix: Record<IdeasConfig["format"], string> = {
      listicle: "(top 5)",
      documentary: "— um documentário",
      explainer: "explicado em 10 minutos",
      story: "— a história completa",
    };
    const project = command.project;
    const hooks = toneHooks[cfg.tone];
    const count = Math.max(1, Math.min(20, cfg.count));
    const ideas = Array.from({ length: count }, (_, i) => {
      const hook = hooks[i % hooks.length];
      return {
        id: `i${i + 1}`,
        title: `${hook} ${project.title} ${formatSuffix[cfg.format]}`,
        angle: `${cfg.tone} · ${cfg.format}`,
        score: 70 + ((i * 7 + cfg.count) % 30),
      };
    });
    return { ideas };
  });
}

// ---------- titles ----------

export function runMockTitles(command: EngineCommand) {
  const cfg = command.config as TitlesConfig;
  const idea =
    (command.input as { idea?: string } | undefined)?.idea ??
    command.project.title;
  return wrap<ResultDataMap["titles"]>(command, 500, () => {
    const styleBank: Record<TitlesConfig["style"], string[]> = {
      curiosity: [
        `O que ninguém te contou sobre ${idea}`,
        `A verdade escondida em ${idea}`,
        `${idea}: o segredo por trás do fenômeno`,
        `Por que ${idea} está mudando tudo`,
        `${idea}: eu não acreditei até ver isso`,
      ],
      authority: [
        `Análise completa: ${idea}`,
        `${idea}: o guia definitivo`,
        `Tudo sobre ${idea} em um vídeo`,
        `${idea} — masterclass em 12 minutos`,
        `${idea}: o que os especialistas dizem`,
      ],
      controversial: [
        `${idea} é uma fraude?`,
        `Chega de mentiras sobre ${idea}`,
        `O lado sujo de ${idea}`,
        `${idea}: a bomba que ninguém quer explodir`,
        `Por que ${idea} está errado`,
      ],
      "how-to": [
        `Como dominar ${idea} em 7 dias`,
        `Passo a passo: ${idea}`,
        `Como começar com ${idea} do zero`,
        `${idea}: um método simples que funciona`,
        `Como transformar ${idea} em resultado`,
      ],
    };
    const base = styleBank[cfg.style];
    const count = Math.max(1, Math.min(20, cfg.variantsPerIdea));
    const variants = Array.from({ length: count }, (_, i) => {
      let t = base[i % base.length];
      if (cfg.includeNumbers) t = `${i + 1}. ${t}`;
      if (cfg.includeEmoji) t = `${t} 🔥`;
      if (t.length > cfg.maxLength) t = `${t.slice(0, cfg.maxLength - 1).trim()}…`;
      return t;
    });
    return { variants };
  });
}

// ---------- thumbnail ----------

export function runMockThumbnail(command: EngineCommand) {
  const cfg = command.config as ThumbnailConfig;
  const title =
    (command.input as { title?: string } | undefined)?.title ??
    command.project.title;
  return wrap<ResultDataMap["thumbnail"]>(command, 900, () => {
    const count = Math.max(1, Math.min(8, cfg.variants));
    const seedBase = `${cfg.style}-${slug(title)}-${cfg.includeFace ? "face" : "nofa"}-${cfg.includeText ? "text" : "notx"}`;
    const images = Array.from(
      { length: count },
      (_, i) => `https://picsum.photos/seed/${seedBase}-${i}/1280/720`,
    );
    return { images, palette: cfg.palette };
  });
}

// ---------- script ----------

export function runMockScript(command: EngineCommand) {
  const cfg = command.config as ScriptConfig & { targetWords?: number };
  const title = command.project.title;
  return wrap<ResultDataMap["script"]>(command, 1100, () => {
    const targetWords =
      cfg.targetWords ?? cfg.targetDurationMinutes * cfg.wordsPerMinute;
    const hookByStyle: Record<ScriptConfig["hookStyle"], string> = {
      question: `Você já parou pra pensar por que "${title}" é maior do que parece?`,
      statement: `"${title}" mudou tudo — e a maioria das pessoas ainda não percebeu.`,
      shock: `A verdade sobre "${title}" é que quase ninguém conta o que realmente acontece.`,
    };
    const toneAdj: Record<ScriptConfig["tone"], string> = {
      casual: "de um jeito bem direto",
      professional: "com rigor e evidências",
      documentary: "com uma narrativa envolvente",
    };
    const structureSections: Record<
      ScriptConfig["structure"],
      { heading: string; template: (t: string) => string }[]
    > = {
      "hook-body-cta": [
        { heading: "Gancho", template: (t) => t },
        {
          heading: "Desenvolvimento",
          template: () =>
            `Nesta parte vamos desenrolar o assunto ${toneAdj[cfg.tone]}, cobrindo os três pilares principais e mostrando exemplos concretos.`,
        },
        {
          heading: "CTA",
          template: () =>
            `Se esse tipo de análise te ajuda, se inscreva no canal e ative o sininho para o próximo vídeo.`,
        },
      ],
      "problem-solution": [
        { heading: "O problema", template: (t) => `${t} — mas por que isso é um problema?` },
        {
          heading: "A solução",
          template: () =>
            `A resposta passa por três decisões práticas explicadas ${toneAdj[cfg.tone]}.`,
        },
        {
          heading: "Aplicação",
          template: () => `Aqui está como aplicar isso já na próxima semana.`,
        },
      ],
      "story-arc": [
        { heading: "Cenário", template: (t) => t },
        {
          heading: "Conflito",
          template: () =>
            `A tensão cresce quando descobrimos que os incentivos estavam invertidos desde o início.`,
        },
        {
          heading: "Desfecho",
          template: () =>
            `A resolução surpreende — e muda como você vai olhar para esse tema.`,
        },
      ],
    };
    const sections = structureSections[cfg.structure].map((s) => ({
      heading: s.heading,
      body: s.template(hookByStyle[cfg.hookStyle]),
    }));
    const text = sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n");
    return {
      text,
      wordCount: targetWords,
      sections,
    };
  });
}

// ---------- narration ----------

export function runMockNarration(command: EngineCommand) {
  const cfg = command.config as NarrationConfig;
  const scriptText =
    (command.input as { scriptText?: string } | undefined)?.scriptText ?? "";
  return wrap<ResultDataMap["narration"]>(command, 900, () => {
    const words = scriptText ? scriptText.split(/\s+/).length : 1800;
    const wpm = 150 * ((cfg.speedPct || 100) / 100);
    const durationSeconds = Math.round((words / wpm) * 60);
    const catalog: Record<string, string> = {
      "pt-BR-neural-01":
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      "pt-BR-neural-02":
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      "en-US-neural-01":
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    };
    return {
      audioUrl:
        catalog[cfg.voiceId] ??
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      durationSeconds,
      voiceId: cfg.voiceId,
    };
  });
}

// ---------- assets ----------

export function runMockAssets(command: EngineCommand) {
  const cfg = command.config as AssetsConfig & {
    totalImages?: number;
    totalClips?: number;
  };
  return wrap<ResultDataMap["assets"]>(command, 800, () => {
    const totalImages = cfg.totalImages ?? cfg.imagesPerMinute * 5;
    const totalClips = cfg.totalClips ?? cfg.videoClipsPerMinute * 5;
    const seed = `${cfg.provider}-${cfg.orientation}-${cfg.minResolution}`;
    return {
      images: Array.from(
        { length: Math.max(1, Math.min(24, totalImages)) },
        (_, i) => `https://picsum.photos/seed/${seed}-img-${i}/1280/720`,
      ),
      clips: Array.from(
        { length: Math.max(1, Math.min(12, totalClips)) },
        () =>
          "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      ),
    };
  });
}

// ---------- editing ----------

export function runMockEditing(command: EngineCommand) {
  const cfg = command.config as EditingConfig;
  return wrap<ResultDataMap["editing"]>(command, 1400, () => ({
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    durationSeconds: 596,
    resolution: cfg.outputResolution,
    template: cfg.template,
    captions: cfg.captions,
  }));
}

// ---------- publishing ----------

export function runMockPublishing(command: EngineCommand) {
  const cfg = command.config as PublishingConfig;
  return wrap<ResultDataMap["publishing"]>(command, 900, () => ({
    videoId: "yt_" + Math.random().toString(36).slice(2, 10),
    url: "https://youtu.be/dQw4w9WgXcQ",
    visibility: cfg.visibility,
    scheduledFor: cfg.scheduledFor,
    tags: cfg.tags,
  }));
}
