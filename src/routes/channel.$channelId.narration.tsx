import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Mic,
  FileAudio,
  Sliders,
  BookOpen,
  Volume2,
  Play,
  Pause,
  Star,
  Search,
  Filter,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  X,
  Waves,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/narration")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    return {
      meta: [
        {
          title: ch
            ? `Narração — ${ch.name} · ContentFlow OS`
            : "Narração — ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Formato de arquivo, seleção de voz, ajustes finos e pronúncias personalizadas.",
        },
      ],
    };
  },
  loader: ({ params }) => {
    const channel = channels.find((c) => c.id === params.channelId);
    if (!channel) throw notFound();
    return { channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Canal não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: NarrationScreen,
});

// ---------- mocks ----------

type FormatId = "mp3" | "wav" | "flac" | "aac";

const FORMATS: {
  id: FormatId;
  label: string;
  description: string;
  quality: "lossy" | "lossless";
}[] = [
  { id: "mp3", label: "MP3", description: "Menor tamanho, compatível", quality: "lossy" },
  { id: "wav", label: "WAV", description: "Sem compressão, máxima qualidade", quality: "lossless" },
  { id: "flac", label: "FLAC", description: "Compressão sem perdas", quality: "lossless" },
  { id: "aac", label: "AAC", description: "Balanço tamanho / qualidade", quality: "lossy" },
];

const BITRATES: Record<FormatId, string[]> = {
  mp3: ["128 kbps", "192 kbps", "256 kbps", "320 kbps"],
  wav: ["1411 kbps (16-bit)", "2304 kbps (24-bit)"],
  flac: ["Compressão 0 (rápida)", "Compressão 5 (equilibrada)", "Compressão 8 (máxima)"],
  aac: ["96 kbps", "128 kbps", "192 kbps", "256 kbps"],
};

const SAMPLE_RATES = ["22.05 kHz", "44.1 kHz", "48 kHz", "96 kHz"];

const QUALITY_LEVELS: Record<FormatId, string[]> = {
  mp3: ["Padrão", "Alta", "Studio"],
  wav: ["16-bit", "24-bit", "32-bit float"],
  flac: ["Padrão", "Alta", "Arquival"],
  aac: ["Padrão", "Alta", "HE-AAC v2"],
};

type Voice = {
  id: string;
  name: string;
  language: string;
  region: string;
  style: string;
  gender: "F" | "M" | "N";
  speed: "lenta" | "média" | "rápida";
  favorite: boolean;
  gradient: string;
};

const INITIAL_VOICES: Voice[] = [
  { id: "v1", name: "Marina", language: "Português", region: "Brasil (SP)", style: "Narradora didática", gender: "F", speed: "média", favorite: true, gradient: "from-primary to-blue-800" },
  { id: "v2", name: "Rafael", language: "Português", region: "Brasil (RJ)", style: "Conversacional", gender: "M", speed: "média", favorite: false, gradient: "from-emerald-500 to-teal-700" },
  { id: "v3", name: "Sofia", language: "Português", region: "Portugal", style: "Formal", gender: "F", speed: "lenta", favorite: false, gradient: "from-purple-500 to-fuchsia-700" },
  { id: "v4", name: "Diego", language: "Espanhol", region: "México", style: "Enérgico", gender: "M", speed: "rápida", favorite: true, gradient: "from-amber-500 to-orange-700" },
  { id: "v5", name: "Aria", language: "Inglês", region: "EUA", style: "Documentário", gender: "F", speed: "média", favorite: false, gradient: "from-rose-500 to-red-700" },
  { id: "v6", name: "Neo", language: "Multilíngue", region: "Neutro", style: "IA neutra", gender: "N", speed: "média", favorite: false, gradient: "from-slate-500 to-slate-800" },
];

type Pronunciation = {
  id: string;
  term: string;
  phonetic: string;
  method: "ipa" | "spelling" | "audio";
  notes: string;
};

const INITIAL_PRONUNCIATIONS: Pronunciation[] = [
  { id: "p1", term: "SaaS", phonetic: "sé-és", method: "spelling", notes: "Sempre soletrado" },
  { id: "p2", term: "Kubernetes", phonetic: "ku-ber-né-tis", method: "spelling", notes: "" },
  { id: "p3", term: "GIF", phonetic: "/ʤɪf/", method: "ipa", notes: "Com J suave" },
];

const PRONUNCIATION_METHODS = [
  { value: "spelling", label: "Soletração" },
  { value: "ipa", label: "IPA fonético" },
  { value: "audio", label: "Áudio de referência" },
];

// ---------- component ----------

function NarrationScreen() {
  const { channel } = Route.useLoaderData();

  // Format
  const [format, setFormat] = useState<FormatId>("mp3");
  const [bitrate, setBitrate] = useState(BITRATES.mp3[2]);
  const [sampleRate, setSampleRate] = useState("48 kHz");
  const [quality, setQuality] = useState(QUALITY_LEVELS.mp3[1]);

  const handleFormat = (id: FormatId) => {
    setFormat(id);
    setBitrate(BITRATES[id][Math.min(2, BITRATES[id].length - 1)]);
    setQuality(QUALITY_LEVELS[id][1]);
  };

  // Voices
  const [voices, setVoices] = useState<Voice[]>(INITIAL_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState("v1");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceLangFilter, setVoiceLangFilter] = useState("all");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filteredVoices = useMemo(
    () =>
      voices.filter((v) => {
        if (voiceLangFilter !== "all" && v.language !== voiceLangFilter)
          return false;
        if (voiceGenderFilter !== "all" && v.gender !== voiceGenderFilter)
          return false;
        if (voiceSearch) {
          const q = voiceSearch.toLowerCase();
          const hay = `${v.name} ${v.style} ${v.region}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [voices, voiceSearch, voiceLangFilter, voiceGenderFilter],
  );

  const activeVoice = voices.find((v) => v.id === selectedVoiceId);
  const languages = ["all", ...new Set(voices.map((v) => v.language))];

  const toggleFavorite = (id: string) =>
    setVoices((prev) =>
      prev.map((v) => (v.id === id ? { ...v, favorite: !v.favorite } : v)),
    );

  const togglePlay = (id: string) =>
    setPlayingId((prev) => (prev === id ? null : id));

  // Voice adjustments
  const [speed, setSpeed] = useState<[number]>([100]);
  const [stability, setStability] = useState<[number]>([65]);
  const [expressiveness, setExpressiveness] = useState<[number]>([55]);
  const [pauses, setPauses] = useState<[number]>([50]);
  const [emphasis, setEmphasis] = useState<[number]>([60]);
  const [volume, setVolume] = useState<[number]>([80]);

  // Pronunciations
  const [pronounceInstructions, setPronounceInstructions] = useState(
    "Termos técnicos em inglês devem manter a pronúncia original. Nomes próprios em português seguem a fonética brasileira.",
  );
  const [pronunciations, setPronunciations] = useState<Pronunciation[]>(
    INITIAL_PRONUNCIATIONS,
  );

  const addPronunciation = () =>
    setPronunciations((prev) => [
      ...prev,
      {
        id: `p${Date.now()}`,
        term: "",
        phonetic: "",
        method: "spelling",
        notes: "",
      },
    ]);
  const patchPronunciation = (id: string, patch: Partial<Pronunciation>) =>
    setPronunciations((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  const removePronunciation = (id: string) =>
    setPronunciations((prev) => prev.filter((p) => p.id !== id));

  // Preview
  const [previewText, setPreviewText] = useState(
    "Olá! Este é um teste de narração com as configurações atuais deste canal.",
  );
  const [previewPlaying, setPreviewPlaying] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Narração"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Narração" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <ChannelAvatar channel={channel} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Mic className="h-3.5 w-3.5" />
                  Narração · Etapa 6 do pipeline
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Direção de voz e áudio
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure formato do arquivo, voz e nuances da entrega vocal.
                </p>
              </div>
              <Button size="sm">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Gerar narração
              </Button>
            </div>

            {/* Arquivo de saída */}
            <Section
              icon={<FileAudio className="h-4 w-4" />}
              title="Arquivo de saída"
              description="Formato de exportação e parâmetros técnicos."
            >
              <FieldWrap label="Formato do arquivo">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/30 p-1 sm:grid-cols-4">
                  {FORMATS.map((f) => {
                    const active = format === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFormat(f.id)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                        )}
                      >
                        <span className="text-sm font-semibold">{f.label}</span>
                        <span className={cn("text-[10px]", active ? "text-primary-foreground/80" : "")}>
                          {f.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FieldWrap>

              <div className="grid gap-4 md:grid-cols-3">
                <FieldWrap label="Bitrate">
                  <Select value={bitrate} onValueChange={setBitrate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BITRATES[format].map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
                <FieldWrap label="Sample rate">
                  <Select value={sampleRate} onValueChange={setSampleRate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLE_RATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
                <FieldWrap label="Qualidade">
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALITY_LEVELS[format].map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">
                  Saída estimada:
                </span>
                <span className="font-semibold text-foreground">
                  {format.toUpperCase()} · {bitrate} · {sampleRate} · {quality}
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-auto text-[10px]",
                    FORMATS.find((f) => f.id === format)?.quality === "lossless"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400",
                  )}
                >
                  {FORMATS.find((f) => f.id === format)?.quality === "lossless"
                    ? "Sem perdas"
                    : "Com compressão"}
                </Badge>
              </div>
            </Section>

            {/* Seleção de voz */}
            <Section
              icon={<Volume2 className="h-4 w-4" />}
              title="Seleção de voz"
              description="Biblioteca de vozes disponíveis para narração."
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="Buscar por nome, estilo ou região..."
                    className="pl-8"
                  />
                </div>
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={voiceLangFilter} onValueChange={setVoiceLangFilter}>
                  <SelectTrigger className="h-9 w-auto min-w-[150px]">
                    <span className="text-xs text-muted-foreground">Idioma:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l === "all" ? "Todos" : l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={voiceGenderFilter} onValueChange={setVoiceGenderFilter}>
                  <SelectTrigger className="h-9 w-auto min-w-[140px]">
                    <span className="text-xs text-muted-foreground">Gênero:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="N">Neutro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredVoices.map((v) => (
                  <VoiceCard
                    key={v.id}
                    voice={v}
                    selected={selectedVoiceId === v.id}
                    playing={playingId === v.id}
                    onSelect={() => setSelectedVoiceId(v.id)}
                    onPlay={() => togglePlay(v.id)}
                    onFav={() => toggleFavorite(v.id)}
                  />
                ))}
                {filteredVoices.length === 0 && (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhuma voz encontrada com esses filtros.
                  </div>
                )}
              </div>
            </Section>

            {/* Ajustes da voz */}
            <Section
              icon={<Sliders className="h-4 w-4" />}
              title="Ajustes da voz"
              description={
                activeVoice
                  ? `Ajustes finos para ${activeVoice.name}.`
                  : "Selecione uma voz para ajustar."
              }
            >
              {activeVoice ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <VoiceSlider
                    label="Velocidade"
                    tip="Ritmo geral da fala."
                    value={speed}
                    onChange={setSpeed}
                    min={50}
                    max={200}
                    step={5}
                    suffix="%"
                    markers={["Lenta", "Normal", "Rápida"]}
                  />
                  <VoiceSlider
                    label="Estabilidade"
                    tip="Consistência do timbre entre frases."
                    value={stability}
                    onChange={setStability}
                    markers={["Variável", "Balanceada", "Estável"]}
                  />
                  <VoiceSlider
                    label="Expressividade"
                    tip="Intensidade emocional e entonação."
                    value={expressiveness}
                    onChange={setExpressiveness}
                    markers={["Sóbria", "Natural", "Dramática"]}
                  />
                  <VoiceSlider
                    label="Pausas"
                    tip="Duração das pausas entre frases."
                    value={pauses}
                    onChange={setPauses}
                    markers={["Curtas", "Naturais", "Longas"]}
                  />
                  <VoiceSlider
                    label="Ênfase"
                    tip="Destaque em palavras-chave."
                    value={emphasis}
                    onChange={setEmphasis}
                    markers={["Suave", "Média", "Forte"]}
                  />
                  <VoiceSlider
                    label="Volume"
                    tip="Nível relativo de saída."
                    value={volume}
                    onChange={setVolume}
                    suffix="%"
                    markers={["Baixo", "Padrão", "Alto"]}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nenhuma voz selecionada.
                </div>
              )}
            </Section>

            {/* Pronúncias */}
            <Section
              icon={<BookOpen className="h-4 w-4" />}
              title="Pronúncias"
              description="Regras e casos específicos para termos difíceis."
            >
              <FieldWrap
                label="Instruções gerais de pronúncia"
                description="Aplicadas a todo o roteiro."
              >
                <Textarea
                  value={pronounceInstructions}
                  onChange={(e) => setPronounceInstructions(e.target.value)}
                  className="min-h-[90px]"
                />
              </FieldWrap>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">
                      Pronúncias personalizadas
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Termos específicos e como devem ser falados.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addPronunciation}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Nova pronúncia
                  </Button>
                </div>

                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1.4fr_auto] gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Termo</span>
                    <span>Pronúncia</span>
                    <span>Método</span>
                    <span>Notas</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border">
                    {pronunciations.map((p) => (
                      <div
                        key={p.id}
                        className="grid grid-cols-[1.2fr_1.4fr_1fr_1.4fr_auto] items-center gap-2 px-3 py-2"
                      >
                        <Input
                          value={p.term}
                          onChange={(e) =>
                            patchPronunciation(p.id, { term: e.target.value })
                          }
                          placeholder="Ex.: SaaS"
                          className="h-8"
                        />
                        <Input
                          value={p.phonetic}
                          onChange={(e) =>
                            patchPronunciation(p.id, { phonetic: e.target.value })
                          }
                          placeholder="Ex.: sé-és"
                          className="h-8 font-mono text-xs"
                        />
                        <Select
                          value={p.method}
                          onValueChange={(v) =>
                            patchPronunciation(p.id, {
                              method: v as Pronunciation["method"],
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRONUNCIATION_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={p.notes}
                          onChange={(e) =>
                            patchPronunciation(p.id, { notes: e.target.value })
                          }
                          placeholder="Contexto opcional"
                          className="h-8"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removePronunciation(p.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remover</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                    {pronunciations.length === 0 && (
                      <div className="p-6 text-center text-xs text-muted-foreground">
                        Nenhuma pronúncia personalizada.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* Prévia */}
            <Section
              icon={<Sparkles className="h-4 w-4" />}
              title="Prévia simulada"
              description="Ouça um trecho com todas as configurações aplicadas."
            >
              <FieldWrap label="Texto de teste">
                <Textarea
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="min-h-[90px]"
                />
              </FieldWrap>

              <div className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background p-5">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setPreviewPlaying((v) => !v)}
                    className={cn(
                      "flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all",
                      previewPlaying
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40"
                        : "bg-primary/15 text-primary hover:bg-primary/25",
                    )}
                    aria-label={previewPlaying ? "Pausar" : "Reproduzir"}
                  >
                    {previewPlaying ? (
                      <Pause className="h-5 w-5" fill="currentColor" />
                    ) : (
                      <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{activeVoice?.name ?? "—"}</span>
                      <span>·</span>
                      <span>{activeVoice?.language}</span>
                      <span>·</span>
                      <span>{format.toUpperCase()} · {sampleRate}</span>
                    </div>
                    <Waveform playing={previewPlaying} />
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>00:00</span>
                      <span>00:14</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-6">
                  <PreviewChip label="Velocidade" value={`${speed[0]}%`} />
                  <PreviewChip label="Estabilidade" value={`${stability[0]}`} />
                  <PreviewChip label="Expressividade" value={`${expressiveness[0]}`} />
                  <PreviewChip label="Pausas" value={`${pauses[0]}`} />
                  <PreviewChip label="Ênfase" value={`${emphasis[0]}`} />
                  <PreviewChip label="Volume" value={`${volume[0]}%`} />
                </div>
              </div>
            </Section>

            <Separator />
            <div className="flex items-center justify-between gap-3 pb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                As alterações se aplicam à próxima narração gerada.
              </div>
              <div className="flex gap-2">
                <Button variant="ghost">Cancelar</Button>
                <Button variant="secondary">
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar como modelo
                </Button>
                <Button>Salvar alterações</Button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------- helpers ----------

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function FieldWrap({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

function VoiceCard({
  voice,
  selected,
  playing,
  onSelect,
  onPlay,
  onFav,
}: {
  voice: Voice;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onFav: () => void;
}) {
  const genderLabel =
    voice.gender === "F" ? "Feminina" : voice.gender === "M" ? "Masculina" : "Neutra";

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-lg border transition-all",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/40"
          : "border-border bg-secondary/30 hover:border-border/80",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <div
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white shadow-inner",
            voice.gradient,
          )}
        >
          {voice.name[0]}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFav();
            }}
            aria-label="Favoritar"
            className={cn(
              "absolute -right-1 -top-1 rounded-full bg-background p-1 shadow transition-colors",
              voice.favorite
                ? "text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className="h-3 w-3" fill={voice.favorite ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{voice.name}</span>
            {selected && (
              <Badge variant="secondary" className="bg-primary/15 text-[9px] text-primary">
                Selecionada
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {voice.language} · {voice.region}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary" className="bg-secondary/70 text-[9px] text-muted-foreground">
              {voice.style}
            </Badge>
            {voice.gender !== "N" && (
              <Badge variant="secondary" className="bg-secondary/70 text-[9px] text-muted-foreground">
                {genderLabel}
              </Badge>
            )}
            <Badge variant="secondary" className="bg-secondary/70 text-[9px] text-muted-foreground">
              {voice.speed}
            </Badge>
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onPlay}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            playing
              ? "bg-primary text-primary-foreground"
              : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
          aria-label={playing ? "Pausar prévia" : "Ouvir prévia"}
        >
          {playing ? (
            <Pause className="h-3 w-3" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-3 w-3" fill="currentColor" />
          )}
        </button>
        <Waveform playing={playing} compact />
        <span className="text-[10px] text-muted-foreground">0:08</span>
      </div>
    </div>
  );
}

function VoiceSlider({
  label,
  tip,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  markers,
}: {
  label: string;
  tip?: string;
  value: [number];
  onChange: (v: [number]) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  markers?: [string, string, string];
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">{label}</Label>
          {tip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{tip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
          {value[0]}
          {suffix ?? ""}
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange([v[0]] as [number])}
      />
      {markers && (
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          {markers.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Waveform({
  playing,
  compact,
}: {
  playing: boolean;
  compact?: boolean;
}) {
  const bars = compact ? 24 : 48;
  const heights = useMemo(
    () =>
      Array.from({ length: bars }, (_, i) =>
        20 + Math.abs(Math.sin(i * 0.6) * 60) + Math.abs(Math.cos(i * 1.3) * 20),
      ),
    [bars],
  );
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-0.5",
        compact ? "h-5" : "h-10 mt-3",
      )}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-full transition-all",
            playing ? "bg-primary" : "bg-primary/30",
          )}
          style={{
            height: `${Math.min(100, h)}%`,
            animation: playing
              ? `wave 1.1s ease-in-out ${(i % 8) * 0.08}s infinite alternate`
              : undefined,
          }}
        />
      ))}
      <style>{`@keyframes wave { from { transform: scaleY(0.4);} to { transform: scaleY(1);} }`}</style>
    </div>
  );
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-secondary/50 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}

