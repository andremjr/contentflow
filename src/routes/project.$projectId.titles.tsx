import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  Type,
  Star,
  Copy,
  Ban,
  GitBranch,
  GitCompare,
  Check,
  ImageIcon,
  Pencil,
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  Youtube,
  MoreHorizontal,
  Scissors,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

export const Route = createFileRoute("/project/$projectId/titles")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Títulos — ${p.title} · ContentFlow OS`
            : "Títulos · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Ranqueamento e edição de títulos gerados com simulação em diferentes dispositivos.",
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
  component: TitlesView,
});

// ---------------- mock ----------------

type TitleStatus = "Rascunho" | "Em análise" | "Aprovado" | "Descartado";

type TitleItem = {
  id: string;
  text: string;
  structure: string;
  keywords: string[];
  clarity: number;
  curiosity: number;
  connection: number;
  status: TitleStatus;
  favorite: boolean;
  hue: number;
};

const RAW_TITLES: TitleItem[] = [
  {
    id: "t1",
    text: "O paradoxo do universo em expansão que nenhum físico consegue explicar",
    structure: "Gatilho de mistério + autoridade negada",
    keywords: ["paradoxo", "universo", "física"],
    clarity: 82,
    curiosity: 94,
    connection: 88,
    status: "Aprovado",
    favorite: true,
    hue: 220,
  },
  {
    id: "t2",
    text: "Por que o universo está fugindo de você (e da ciência)",
    structure: "Pergunta + subversão",
    keywords: ["universo", "ciência"],
    clarity: 76,
    curiosity: 90,
    connection: 84,
    status: "Em análise",
    favorite: true,
    hue: 260,
  },
  {
    id: "t3",
    text: "O erro de cálculo que mudou tudo o que sabemos sobre o cosmos",
    structure: "Revelação + escala",
    keywords: ["cosmos", "descoberta"],
    clarity: 84,
    curiosity: 88,
    connection: 79,
    status: "Em análise",
    favorite: false,
    hue: 200,
  },
  {
    id: "t4",
    text: "5 coisas absurdas que acontecem quando o universo se expande",
    structure: "Listicle + emoção",
    keywords: ["universo", "expansão"],
    clarity: 88,
    curiosity: 82,
    connection: 74,
    status: "Rascunho",
    favorite: false,
    hue: 30,
  },
  {
    id: "t5",
    text: "A verdade escondida sobre a expansão cósmica",
    structure: "Gatilho de segredo",
    keywords: ["expansão", "cósmica"],
    clarity: 74,
    curiosity: 80,
    connection: 70,
    status: "Rascunho",
    favorite: false,
    hue: 280,
  },
  {
    id: "t6",
    text: "Como a energia escura está devorando o cosmos silenciosamente",
    structure: "Antagonista + urgência",
    keywords: ["energia escura", "cosmos"],
    clarity: 78,
    curiosity: 92,
    connection: 82,
    status: "Em análise",
    favorite: true,
    hue: 340,
  },
  {
    id: "t7",
    text: "O universo tem prazo de validade? Cientistas discordam",
    structure: "Pergunta + polêmica",
    keywords: ["universo", "cientistas"],
    clarity: 80,
    curiosity: 86,
    connection: 78,
    status: "Rascunho",
    favorite: false,
    hue: 10,
  },
  {
    id: "t8",
    text: "Descoberta bombástica sobre o universo choca físicos",
    structure: "Clickbait clássico",
    keywords: ["universo", "descoberta"],
    clarity: 60,
    curiosity: 72,
    connection: 55,
    status: "Descartado",
    favorite: false,
    hue: 0,
  },
];

const STATUSES: TitleStatus[] = ["Rascunho", "Em análise", "Aprovado", "Descartado"];

const STATUS_STYLES: Record<TitleStatus, string> = {
  Rascunho: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  "Em análise": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Aprovado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  Descartado: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const YT_LIMITS = {
  desktop: 70,
  tablet: 55,
  mobile: 40,
} as const;

// ---------------- component ----------------

function TitlesView() {
  const { project, channel } = Route.useLoaderData();

  const [titles, setTitles] = useState<TitleItem[]>(RAW_TITLES);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(RAW_TITLES[0].id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TitleStatus | "all">("all");
  const [sortBy, setSortBy] = useState<
    "score" | "clarity" | "curiosity" | "connection" | "length"
  >("score");
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedWords, setBlockedWords] = useState<string[]>(["clickbait", "chocante"]);
  const [newBlocked, setNewBlocked] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const scored = useMemo(
    () =>
      titles.map((t) => ({
        ...t,
        score: Math.round((t.clarity + t.curiosity + t.connection) / 3),
      })),
    [titles],
  );

  const filtered = useMemo(() => {
    let arr = scored.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${t.text} ${t.keywords.join(" ")} ${t.structure}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
    switch (sortBy) {
      case "score":
        arr.sort((a, b) => b.score - a.score);
        break;
      case "clarity":
        arr.sort((a, b) => b.clarity - a.clarity);
        break;
      case "curiosity":
        arr.sort((a, b) => b.curiosity - a.curiosity);
        break;
      case "connection":
        arr.sort((a, b) => b.connection - a.connection);
        break;
      case "length":
        arr.sort((a, b) => a.text.length - b.text.length);
        break;
    }
    return arr;
  }, [scored, query, statusFilter, sortBy]);

  const previewTitle =
    scored.find((t) => t.id === previewId) ?? filtered[0] ?? scored[0];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (t: TitleItem) => {
    setEditingId(t.id);
    setEditingText(t.text);
  };
  const commitEdit = () => {
    if (!editingId) return;
    setTitles((prev) =>
      prev.map((t) => (t.id === editingId ? { ...t, text: editingText } : t)),
    );
    setEditingId(null);
  };

  const toggleFav = (id: string) =>
    setTitles((p) => p.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)));

  const setStatus = (id: string, status: TitleStatus) =>
    setTitles((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));

  const duplicate = (id: string) => {
    setTitles((p) => {
      const src = p.find((t) => t.id === id);
      if (!src) return p;
      const copy: TitleItem = {
        ...src,
        id: `${src.id}-c${Date.now().toString(36).slice(-3)}`,
        text: `${src.text} (cópia)`,
        status: "Rascunho",
        favorite: false,
      };
      const idx = p.findIndex((t) => t.id === id);
      const next = [...p];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const createVariation = (id: string) => {
    setTitles((p) => {
      const src = p.find((t) => t.id === id);
      if (!src) return p;
      const variation: TitleItem = {
        ...src,
        id: `${src.id}-v${Date.now().toString(36).slice(-3)}`,
        text: `Variação: ${src.text}`,
        structure: `${src.structure} · variação`,
        clarity: Math.max(40, src.clarity - 4),
        curiosity: Math.min(100, src.curiosity + 3),
        connection: Math.max(40, src.connection - 2),
        status: "Rascunho",
        favorite: false,
      };
      const idx = p.findIndex((t) => t.id === id);
      const next = [...p];
      next.splice(idx + 1, 0, variation);
      return next;
    });
  };

  const addBlocked = () => {
    const w = newBlocked.trim().toLowerCase();
    if (!w || blockedWords.includes(w)) return;
    setBlockedWords((p) => [...p, w]);
    setNewBlocked("");
  };

  return (
    <TooltipProvider delayDuration={100}>
      <AppShell>
        <TopBar title="Títulos" subtitle={`${project.title} · ${channel.name}`} />

        <div className="flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 gap-6 overflow-y-auto px-6 py-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
            {/* left: ranked list */}
            <div className="flex min-h-0 flex-col gap-4 xl:overflow-y-auto xl:pr-1">
              {/* header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                    <Type className="h-3.5 w-3.5" />
                    Processo · Títulos
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold text-slate-50">
                    Ranqueamento de títulos
                  </h1>
                  <p className="mt-1 max-w-xl text-sm text-slate-400">
                    {titles.length} títulos gerados · {selected.size} selecionados ·{" "}
                    {blockedWords.length} palavras bloqueadas.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                    onClick={() => setBlockedOpen(true)}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Palavras bloqueadas
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                    onClick={() => setCompareOpen(true)}
                    disabled={selected.size < 2}
                  >
                    <GitCompare className="mr-2 h-4 w-4" />
                    Comparar
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar mais
                  </Button>
                  <Button
                    disabled={selected.size === 0}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Enviar para thumbnail
                  </Button>
                </div>
              </div>

              {/* toolbar */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por título, palavra-chave ou estrutura…"
                    className="border-white/10 bg-white/[0.04] pl-9 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as TitleStatus | "all")}
                >
                  <SelectTrigger className="w-[170px] border-white/10 bg-white/[0.03] text-slate-200">
                    <Filter className="mr-2 h-4 w-4 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                    <SelectItem value="all">Todos os status</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v as typeof sortBy)}
                >
                  <SelectTrigger className="w-[200px] border-white/10 bg-white/[0.03] text-slate-200">
                    <ArrowUpDown className="mr-2 h-4 w-4 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                    <SelectItem value="score">Score geral</SelectItem>
                    <SelectItem value="clarity">Clareza</SelectItem>
                    <SelectItem value="curiosity">Curiosidade</SelectItem>
                    <SelectItem value="connection">Conexão</SelectItem>
                    <SelectItem value="length">Comprimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* list */}
              <ol className="flex flex-col gap-2">
                {filtered.map((t, idx) => {
                  const isSelected = selected.has(t.id);
                  const isPreview = previewTitle?.id === t.id;
                  const isEditing = editingId === t.id;
                  const hasBlocked = blockedWords.some((w) =>
                    t.text.toLowerCase().includes(w),
                  );
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border bg-white/[0.02] p-4 transition hover:border-white/20",
                        isPreview
                          ? "border-primary/50 ring-1 ring-primary/40"
                          : "border-white/5",
                      )}
                    >
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 w-1"
                        style={{
                          background: `hsl(${t.hue} 70% 55%)`,
                          opacity: isPreview ? 1 : 0.5,
                        }}
                      />
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(t.id)}
                          className="mt-1"
                        />
                        <div className="flex w-10 flex-col items-center pt-0.5">
                          <div className="text-lg font-bold tabular-nums text-slate-50">
                            {String(idx + 1).padStart(2, "0")}
                          </div>
                          <div className="mt-0.5 text-[10px] uppercase text-slate-500">
                            rank
                          </div>
                        </div>

                        <button
                          onClick={() => setPreviewId(t.id)}
                          className="flex min-w-0 flex-1 flex-col text-left"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge s={t.status} />
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">
                              {t.structure}
                            </span>
                            {hasBlocked && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                                <Ban className="h-3 w-3" />
                                Palavra bloqueada
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            <div
                              className="mt-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEdit();
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="border-white/10 bg-white/[0.04] text-slate-100"
                              />
                              <div className="mt-1.5 flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={commitEdit}
                                  className="h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                  Salvar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                  className="h-7 text-slate-400 hover:text-slate-100"
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1.5 text-[15px] font-medium leading-snug text-slate-50">
                              {highlightKeywords(t.text, t.keywords, blockedWords)}
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Type className="h-3 w-3" />
                              <span className={cn(
                                "tabular-nums",
                                t.text.length > YT_LIMITS.desktop && "text-amber-300",
                                t.text.length > 100 && "text-rose-300",
                              )}>
                                {t.text.length} caracteres
                              </span>
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              {t.keywords.map((k) => (
                                <span
                                  key={k}
                                  className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary-foreground"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-3">
                            <ScoreMini label="Clareza" value={t.clarity} tone="primary" />
                            <ScoreMini label="Curiosidade" value={t.curiosity} tone="amber" />
                            <ScoreMini label="Conexão" value={t.connection} tone="emerald" />
                          </div>
                        </button>

                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => toggleFav(t.id)}
                            className={cn(
                              "rounded-md p-1.5 transition hover:bg-white/10",
                              t.favorite ? "text-amber-300" : "text-slate-500",
                            )}
                          >
                            <Star
                              className={cn("h-4 w-4", t.favorite && "fill-amber-300")}
                            />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="border-white/10 bg-[#0F172A] text-slate-100"
                            >
                              <DropdownMenuItem onClick={() => startEdit(t)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar inline
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicate(t.id)}>
                                <Copy className="mr-2 h-4 w-4" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => createVariation(t.id)}>
                                <GitBranch className="mr-2 h-4 w-4" /> Criar variação
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setBlockedOpen(true)}>
                                <Ban className="mr-2 h-4 w-4" /> Bloquear palavras
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem
                                onClick={() => {
                                  toggleSelect(t.id);
                                  setCompareOpen(true);
                                }}
                              >
                                <GitCompare className="mr-2 h-4 w-4" /> Adicionar à comparação
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setStatus(t.id, "Aprovado")}
                              >
                                <Check className="mr-2 h-4 w-4" /> Aprovar
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <ImageIcon className="mr-2 h-4 w-4" /> Enviar para thumbnail
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                    <Type className="mx-auto h-8 w-8 text-slate-500" />
                    <h3 className="mt-3 text-sm font-medium text-slate-200">
                      Nenhum título corresponde aos filtros
                    </h3>
                  </div>
                )}
              </ol>
            </div>

            {/* right: preview */}
            <aside className="flex min-h-0 flex-col gap-4 xl:sticky xl:top-0 xl:overflow-y-auto">
              {previewTitle && (
                <TitlePreview
                  title={previewTitle}
                  onSetStatus={(s) => setStatus(previewTitle.id, s)}
                />
              )}
            </aside>
          </div>
        </div>

        {/* blocked words dialog */}
        <Dialog open={blockedOpen} onOpenChange={setBlockedOpen}>
          <DialogContent className="border-white/10 bg-[#0F172A] text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-rose-300" />
                Palavras bloqueadas
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Títulos que contenham essas palavras serão marcados. A geração
                automática evita usá-las.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newBlocked}
                  onChange={(e) => setNewBlocked(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBlocked()}
                  placeholder="Digite uma palavra e Enter"
                  className="border-white/10 bg-white/[0.04] text-slate-100"
                />
                <Button
                  onClick={addBlocked}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Adicionar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {blockedWords.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                  >
                    {w}
                    <button
                      onClick={() =>
                        setBlockedWords((p) => p.filter((x) => x !== w))
                      }
                      className="text-rose-300/70 hover:text-rose-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {blockedWords.length === 0 && (
                  <span className="text-xs text-slate-500">
                    Nenhuma palavra bloqueada.
                  </span>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* compare dialog */}
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-3xl border-white/10 bg-[#0F172A] text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Comparar títulos
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {selected.size} selecionados
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-2 text-left">Título</th>
                    <th className="px-2 text-right">Car.</th>
                    <th className="px-2 text-right">Clareza</th>
                    <th className="px-2 text-right">Curios.</th>
                    <th className="px-2 text-right">Conexão</th>
                    <th className="px-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {scored
                    .filter((t) => selected.has(t.id))
                    .map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-2 text-slate-100">{t.text}</td>
                        <td className="px-2 text-right tabular-nums text-slate-300">
                          {t.text.length}
                        </td>
                        <td className="px-2 text-right tabular-nums text-slate-300">
                          {t.clarity}
                        </td>
                        <td className="px-2 text-right tabular-nums text-slate-300">
                          {t.curiosity}
                        </td>
                        <td className="px-2 text-right tabular-nums text-slate-300">
                          {t.connection}
                        </td>
                        <td className="px-2 text-right tabular-nums font-semibold text-slate-50">
                          {t.score}
                        </td>
                      </tr>
                    ))}
                  {selected.size < 2 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-xs text-slate-500"
                      >
                        Selecione ao menos dois títulos para comparar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------------- helpers ----------------

function highlightKeywords(text: string, keywords: string[], blocked: string[]) {
  const parts: React.ReactNode[] = [];
  const pattern = [...keywords, ...blocked].filter(Boolean);
  if (pattern.length === 0) return text;
  const regex = new RegExp(`(${pattern.map(escapeRe).join("|")})`, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const w = m[0];
    const isBlocked = blocked.some((b) => b.toLowerCase() === w.toLowerCase());
    parts.push(
      <mark
        key={`h${k++}`}
        className={cn(
          "rounded px-1 font-medium",
          isBlocked
            ? "bg-rose-500/20 text-rose-100"
            : "bg-primary/20 text-primary-foreground",
        )}
      >
        {w}
      </mark>,
    );
    last = m.index + w.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function StatusBadge({ s }: { s: TitleStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border px-2 py-0.5 text-[11px]", STATUS_STYLES[s])}
    >
      {s}
    </Badge>
  );
}

function ScoreMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "amber" | "emerald";
}) {
  const toneMap = {
    primary: "bg-primary",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
  } as const;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full", toneMap[tone])}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ---------------- preview ----------------

function TitlePreview({
  title,
  onSetStatus,
}: {
  title: TitleItem & { score: number };
  onSetStatus: (s: TitleStatus) => void;
}) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const limit = YT_LIMITS[device];
  const truncated = title.text.length > limit;
  const visible = truncated ? title.text.slice(0, limit - 1).trimEnd() + "…" : title.text;
  const cutAt = truncated ? limit - 1 : title.text.length;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
          <Youtube className="h-3.5 w-3.5 text-rose-400" />
          Simulação no YouTube
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
          {(
            [
              { k: "desktop", i: Monitor },
              { k: "tablet", i: Tablet },
              { k: "mobile", i: Smartphone },
            ] as const
          ).map(({ k, i: Icon }) => (
            <button
              key={k}
              onClick={() => setDevice(k)}
              className={cn(
                "px-2.5 py-1.5 text-xs transition",
                device === k
                  ? "bg-primary text-primary-foreground"
                  : "text-slate-300 hover:bg-white/10",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* device frame */}
      <div className="rounded-xl border border-white/10 bg-[#0B111C] p-3">
        <div
          className={cn(
            "mx-auto overflow-hidden rounded-lg border border-white/10 bg-[#0F172A]",
            device === "desktop" && "w-full",
            device === "tablet" && "max-w-[320px]",
            device === "mobile" && "max-w-[220px]",
          )}
        >
          <div
            className="relative aspect-video w-full"
            style={{
              background: `linear-gradient(135deg, hsl(${title.hue} 70% 40%), hsl(${(title.hue + 40) % 360} 70% 25%))`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">
              thumbnail
            </div>
            <div className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 text-[9px] font-medium text-white">
              12:34
            </div>
          </div>
          <div className="p-2.5">
            <div
              className={cn(
                "line-clamp-2 font-semibold text-slate-50",
                device === "desktop" && "text-[13px]",
                device === "tablet" && "text-[12px]",
                device === "mobile" && "text-[11px] leading-tight",
              )}
            >
              {visible}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Canal · 45k visualizações · há 2 dias
            </div>
          </div>
        </div>
      </div>

      {/* cut indicator */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Scissors className="h-3 w-3" />
            Corte estimado em {device}
          </span>
          <span
            className={cn(
              "tabular-nums",
              truncated ? "text-rose-300" : "text-emerald-300",
            )}
          >
            {title.text.length} / {limit}
          </span>
        </div>
        <div className="relative rounded-lg border border-white/10 bg-white/[0.03] p-2 font-mono text-[11px] leading-relaxed text-slate-200">
          <span>{title.text.slice(0, cutAt)}</span>
          {truncated && (
            <>
              <span className="mx-0.5 inline-block h-3 w-px translate-y-0.5 bg-rose-400" />
              <span className="text-slate-500 line-through">
                {title.text.slice(cutAt)}
              </span>
            </>
          )}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          Desktop {YT_LIMITS.desktop} · Tablet {YT_LIMITS.tablet} · Mobile{" "}
          {YT_LIMITS.mobile} caracteres
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricPill label="Clareza" value={title.clarity} />
        <MetricPill label="Curiosidade" value={title.curiosity} />
        <MetricPill label="Conexão" value={title.connection} />
        <MetricPill label="Score" value={title.score} highlight />
      </div>

      {/* actions */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
            onClick={() => onSetStatus("Aprovado")}
          >
            <Check className="mr-2 h-4 w-4" />
            Aprovar
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
          >
            <GitBranch className="mr-2 h-4 w-4" />
            Variação
          </Button>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <ImageIcon className="mr-2 h-4 w-4" />
          Enviar para thumbnail
        </Button>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2",
        highlight && "border-primary/40 bg-primary/10",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-50">
        {value}
      </div>
    </div>
  );
}
