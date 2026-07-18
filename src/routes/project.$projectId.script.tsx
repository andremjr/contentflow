import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FileText,
  Save,
  GitCompare,
  Download,
  Check,
  BookOpen,
  Pencil,
  MessageCircle,
  Clock,
  Type,
  Layers,
  Megaphone,
  ArrowRightLeft,
  Sparkles,
  Flag,
  Play,
  ChevronRight,
  History,
  MoreHorizontal,
  Hash,
  AlignLeft,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/script")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Roteiro — ${p.title} · ContentFlow OS`
            : "Roteiro · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Editor de roteiro com blocos, outline, versionamento e modo de leitura.",
        },
      ],
    };
  },
  loader: ({ params }) => {
    const project = projects.find((x) => x.id === params.projectId);
    if (!project) throw notFound();
    const channel = channels.find((c) => c.id === project.channelId);
    if (!channel) throw notFound();
    return { project, channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Projeto não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ScriptView,
});

// ---------------- mock ----------------

type BlockType =
  | "Introdução"
  | "Desenvolvimento"
  | "CTA"
  | "Transição"
  | "Conclusão";

type BlockStatus = "Rascunho" | "Revisar" | "Aprovado";

type ScriptBlock = {
  id: string;
  name: string;
  type: BlockType;
  content: string;
  status: BlockStatus;
  comments: number;
  hasCTA: boolean;
};

const BLOCKS: ScriptBlock[] = [
  {
    id: "b1",
    name: "Gancho de abertura",
    type: "Introdução",
    content:
      "Existe uma pergunta que a física moderna não consegue responder — e ela pode reescrever tudo o que sabemos sobre o universo. Nos próximos minutos, você vai entender por que os maiores cientistas do mundo estão perdendo o sono com um único paradoxo.",
    status: "Aprovado",
    comments: 2,
    hasCTA: false,
  },
  {
    id: "b2",
    name: "Contexto histórico",
    type: "Desenvolvimento",
    content:
      "Em 1998, dois grupos independentes de astrônomos descobriram algo aparentemente impossível: o universo não estava apenas se expandindo, ele estava acelerando. Essa descoberta ganhou o Nobel de Física em 2011 e abriu um buraco enorme na nossa compreensão da realidade.",
    status: "Aprovado",
    comments: 0,
    hasCTA: false,
  },
  {
    id: "b3",
    name: "CTA — Inscreva-se",
    type: "CTA",
    content:
      "Antes de continuarmos, se você gosta desse tipo de conteúdo, deixa aquele like e se inscreve no canal. Isso ajuda muito o algoritmo a mostrar o vídeo pra mais gente curiosa como você.",
    status: "Revisar",
    comments: 3,
    hasCTA: true,
  },
  {
    id: "b4",
    name: "Ponte para a segunda parte",
    type: "Transição",
    content:
      "Mas o que exatamente está causando essa aceleração? A resposta oficial tem um nome misterioso — e uma consequência ainda mais estranha.",
    status: "Aprovado",
    comments: 0,
    hasCTA: false,
  },
  {
    id: "b5",
    name: "Energia escura explicada",
    type: "Desenvolvimento",
    content:
      "A energia escura representa cerca de 68% de tudo o que existe no cosmos. E o mais perturbador: ninguém sabe o que ela é. Ela não emite luz, não interage com matéria comum e só se manifesta pela forma como empurra o universo para longe de si mesmo.",
    status: "Rascunho",
    comments: 5,
    hasCTA: false,
  },
  {
    id: "b6",
    name: "Teorias competidoras",
    type: "Desenvolvimento",
    content:
      "Existem hoje três grandes hipóteses tentando explicar esse fenômeno: a constante cosmológica reformulada, a quintessência dinâmica e as modificações da gravidade em larga escala. Vamos analisar cada uma delas.",
    status: "Rascunho",
    comments: 1,
    hasCTA: false,
  },
  {
    id: "b7",
    name: "CTA meio — Comentários",
    type: "CTA",
    content:
      "Aqui eu quero saber a sua opinião: qual dessas teorias faz mais sentido pra você? Deixa nos comentários — vou ler todos e destacar os melhores no próximo vídeo.",
    status: "Rascunho",
    comments: 2,
    hasCTA: true,
  },
  {
    id: "b8",
    name: "Consequência filosófica",
    type: "Desenvolvimento",
    content:
      "Se a energia escura continuar dominando, o universo caminha para um destino frio e vazio conhecido como Big Rip. Mas essa possibilidade também nos força a repensar o que significa existir dentro de um cosmos que, um dia, deixará de nos permitir observá-lo.",
    status: "Revisar",
    comments: 4,
    hasCTA: false,
  },
  {
    id: "b9",
    name: "Fechamento e reflexão",
    type: "Conclusão",
    content:
      "No fim das contas, esse paradoxo do universo em expansão não é só sobre física — é sobre a nossa própria posição diante do desconhecido. E talvez a resposta mais honesta que a ciência pode dar hoje seja: ainda não sabemos. E isso é lindo.",
    status: "Rascunho",
    comments: 0,
    hasCTA: false,
  },
  {
    id: "b10",
    name: "CTA final — Próximo vídeo",
    type: "CTA",
    content:
      "Se você chegou até aqui, provavelmente vai amar o próximo vídeo que já está aparecendo aí na tela. Ele explica por que o tempo pode não ser exatamente o que você imagina. Até lá.",
    status: "Rascunho",
    comments: 1,
    hasCTA: true,
  },
];

const TYPE_META: Record<
  BlockType,
  { icon: React.ComponentType<{ className?: string }>; className: string; accent: string }
> = {
  Introdução: {
    icon: Sparkles,
    className: "border-sky-400/40 bg-sky-500/10 text-sky-200",
    accent: "bg-sky-400",
  },
  Desenvolvimento: {
    icon: AlignLeft,
    className: "border-primary/40 bg-primary/10 text-primary-foreground",
    accent: "bg-primary",
  },
  CTA: {
    icon: Megaphone,
    className: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    accent: "bg-amber-400",
  },
  Transição: {
    icon: ArrowRightLeft,
    className: "border-violet-400/40 bg-violet-500/10 text-violet-200",
    accent: "bg-violet-400",
  },
  Conclusão: {
    icon: Flag,
    className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    accent: "bg-emerald-400",
  },
};

const STATUS_STYLES: Record<BlockStatus, string> = {
  Rascunho: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  Revisar: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Aprovado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

// average narrator: ~15 chars/sec (roughly 155 wpm)
const CHARS_PER_SECOND = 15;

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------- component ----------------

function ScriptView() {
  const { project, channel } = Route.useLoaderData();
  const [blocks] = useState<ScriptBlock[]>(BLOCKS);
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [version, setVersion] = useState("v4");
  const [activeId, setActiveId] = useState<string>(BLOCKS[0].id);

  const totals = useMemo(() => {
    const chars = blocks.reduce((sum, b) => sum + b.content.length, 0);
    const words = blocks.reduce((sum, b) => sum + wordCount(b.content), 0);
    const seconds = chars / CHARS_PER_SECOND;
    return { chars, words, seconds, blocks: blocks.length };
  }, [blocks]);

  return (
    <TooltipProvider delayDuration={100}>
      <AppShell>
        <TopBar title="Roteiro" subtitle={`${project.title} · ${channel.name}`} />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* editor toolbar */}
          <div className="border-b border-white/5 bg-[#0B111C]/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-3 px-6 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-slate-100">
                  Roteiro
                </span>
                <Separator orientation="vertical" className="mx-1 h-5 bg-white/10" />
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger className="h-8 w-[110px] border-white/10 bg-white/[0.04] text-xs text-slate-200">
                    <History className="mr-1.5 h-3 w-3 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                    <SelectItem value="v4">v4 — atual</SelectItem>
                    <SelectItem value="v3">v3 — ontem</SelectItem>
                    <SelectItem value="v2">v2 — há 3 dias</SelectItem>
                    <SelectItem value="v1">v1 — inicial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator orientation="vertical" className="mx-1 h-6 bg-white/10" />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <Metric icon={Hash} label="Palavras" value={totals.words.toLocaleString("pt-BR")} />
                <Metric icon={Type} label="Caracteres" value={totals.chars.toLocaleString("pt-BR")} />
                <Metric icon={Clock} label="Duração" value={formatDuration(totals.seconds)} />
                <Metric icon={Layers} label="Blocos" value={String(totals.blocks)} />
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                  <ModeButton
                    active={mode === "edit"}
                    onClick={() => setMode("edit")}
                    icon={Pencil}
                    label="Edição"
                  />
                  <ModeButton
                    active={mode === "read"}
                    onClick={() => setMode("read")}
                    icon={BookOpen}
                    label="Leitura"
                  />
                </div>
                <Separator orientation="vertical" className="mx-1 h-6 bg-white/10" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                >
                  <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                  Comparar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Exportar TXT
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Aprovar
                </Button>
              </div>
            </div>

            {/* legend */}
            <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-3 border-t border-white/5 px-6 py-2 text-[11px] text-slate-400">
              <span className="text-slate-500">Destaques:</span>
              {(["Introdução", "Desenvolvimento", "CTA", "Transição", "Conclusão"] as BlockType[]).map(
                (t) => {
                  const meta = TYPE_META[t];
                  const Icon = meta.icon;
                  return (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", meta.accent)} />
                      <Icon className="h-3 w-3" />
                      {t}
                    </span>
                  );
                },
              )}
            </div>
          </div>

          {/* body */}
          <div className="flex-1 overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-[1500px] gap-6 px-6 py-6">
              {/* outline */}
              <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">
                <div className="sticky top-0">
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                    <span>Outline</span>
                    <span className="text-slate-500">{blocks.length} blocos</span>
                  </div>
                  <ol className="space-y-1">
                    {blocks.map((b, idx) => {
                      const meta = TYPE_META[b.type];
                      const Icon = meta.icon;
                      const active = activeId === b.id;
                      return (
                        <li key={b.id}>
                          <a
                            href={`#block-${b.id}`}
                            onClick={() => setActiveId(b.id)}
                            className={cn(
                              "group flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                              active
                                ? "border-primary/50 bg-primary/10 text-slate-50"
                                : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.03]",
                            )}
                          >
                            <div className="flex flex-col items-center pt-0.5">
                              <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              <span
                                className={cn("mt-1 h-6 w-0.5 rounded-full", meta.accent)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <Icon className="h-3 w-3 opacity-70" />
                                <span className="truncate font-medium">{b.name}</span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                                <span>{formatDuration(b.content.length / CHARS_PER_SECOND)}</span>
                                {b.comments > 0 && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <MessageCircle className="h-2.5 w-2.5" />
                                    {b.comments}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 opacity-0 transition group-hover:opacity-60",
                                active && "opacity-100",
                              )}
                            />
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </aside>

              {/* document */}
              <main className="min-w-0 flex-1 overflow-y-auto">
                <div
                  className={cn(
                    "mx-auto rounded-2xl border border-white/5 bg-white/[0.02] shadow-2xl transition",
                    mode === "read" ? "max-w-3xl bg-[#0C1524]" : "max-w-4xl",
                  )}
                >
                  {/* document header */}
                  <div className="border-b border-white/5 p-6">
                    <div className="text-[11px] uppercase tracking-widest text-slate-500">
                      {channel.name} · {version}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold text-slate-50">
                      {project.title}
                    </h1>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{totals.words.toLocaleString("pt-BR")} palavras</span>
                      <span>·</span>
                      <span>{totals.chars.toLocaleString("pt-BR")} caracteres</span>
                      <span>·</span>
                      <span>{formatDuration(totals.seconds)} estimado</span>
                      <span>·</span>
                      <span>{blocks.length} blocos</span>
                    </div>
                  </div>

                  {/* blocks */}
                  <div className={cn("p-6", mode === "read" && "px-8 py-8")}>
                    <div className="flex flex-col gap-5">
                      {blocks.map((b, idx) => (
                        <BlockView
                          key={b.id}
                          block={b}
                          index={idx}
                          mode={mode}
                          active={activeId === b.id}
                          onFocus={() => setActiveId(b.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* footer */}
                  <div className="flex items-center justify-between border-t border-white/5 px-6 py-3 text-[11px] text-slate-500">
                    <span>Fim do roteiro · {formatDuration(totals.seconds)} de leitura</span>
                    <span>Salvo automaticamente há 12s</span>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------------- pieces ----------------

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium tabular-nums text-slate-100">{value}</span>
    </span>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-primary text-primary-foreground"
          : "text-slate-300 hover:bg-white/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function BlockView({
  block,
  index,
  mode,
  active,
  onFocus,
}: {
  block: ScriptBlock;
  index: number;
  mode: "edit" | "read";
  active: boolean;
  onFocus: () => void;
}) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;
  const seconds = block.content.length / CHARS_PER_SECOND;

  if (mode === "read") {
    return (
      <section id={`block-${block.id}`} className="scroll-mt-24">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-400">
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.accent)} />
          <Icon className="h-3 w-3" />
          {block.type}
          {block.hasCTA && (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-200">
              CTA
            </span>
          )}
        </div>
        <h3 className="text-lg font-semibold text-slate-50">{block.name}</h3>
        <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-slate-200">
          {block.content}
        </p>
      </section>
    );
  }

  return (
    <section
      id={`block-${block.id}`}
      onClick={onFocus}
      className={cn(
        "group relative scroll-mt-24 rounded-xl border bg-white/[0.02] p-4 transition",
        active
          ? "border-primary/50 ring-1 ring-primary/40"
          : "border-white/5 hover:border-white/15",
      )}
    >
      {/* left accent */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-3 left-0 w-1 rounded-full",
          meta.accent,
        )}
      />

      {/* header row */}
      <div className="flex flex-wrap items-start justify-between gap-2 pl-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                meta.className,
              )}
            >
              <Icon className="h-3 w-3" />
              {block.type}
            </span>
            <StatusBadge s={block.status} />
            {block.hasCTA && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                <Megaphone className="h-3 w-3" />
                CTA presente
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Bloco {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-slate-100">
            {block.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[10px] text-slate-400">
                <MessageCircle className="h-3 w-3" />
                {block.comments}
              </span>
            </TooltipTrigger>
            <TooltipContent>{block.comments} comentários</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-white/10 bg-[#0F172A] text-slate-100"
            >
              <DropdownMenuItem>
                <Pencil className="mr-2 h-4 w-4" /> Editar bloco
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Play className="mr-2 h-4 w-4" /> Testar narração
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Check className="mr-2 h-4 w-4" /> Marcar como aprovado
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* content (simulated editable area) */}
      <div
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="mt-3 rounded-lg border border-white/5 bg-[#0B111C]/60 px-3 py-2 font-serif text-[15px] leading-relaxed text-slate-100 outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
      >
        {block.content}
      </div>

      {/* metrics row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Type className="h-3 w-3 text-slate-500" />
          <span className="tabular-nums text-slate-200">
            {block.content.length}
          </span>{" "}
          caracteres
        </span>
        <span className="inline-flex items-center gap-1">
          <Hash className="h-3 w-3 text-slate-500" />
          <span className="tabular-nums text-slate-200">
            {wordCount(block.content)}
          </span>{" "}
          palavras
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-500" />
          <span className="tabular-nums text-slate-200">
            {formatDuration(seconds)}
          </span>{" "}
          estimado
        </span>
      </div>
    </section>
  );
}

function StatusBadge({ s }: { s: BlockStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border px-2 py-0.5 text-[10px]", STATUS_STYLES[s])}
    >
      {s}
    </Badge>
  );
}
