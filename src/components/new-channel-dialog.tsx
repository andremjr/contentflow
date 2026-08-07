import { useEffect, useState } from "react";
import { Check, LoaderCircle, Plus, Youtube } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createEmptyMethods, type Channel } from "@/lib/domain";
import { createChannel, resolveYouTubeChannel, updateChannel } from "@/lib/store";

const COLOR_PRESETS = [
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#EF4444",
];

const LANGUAGES = ["PT-BR", "EN", "ES", "FR", "DE"];
const FREQUENCIES = ["1x / semana", "2x / semana", "3x / semana", "Diário", "Quinzenal"];

export function NewChannelDialog({
  trigger,
  onCreate,
  channel,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  onCreate?: (channel: Channel) => void;
  channel?: Channel;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("PT-BR");
  const [frequency, setFrequency] = useState("1x / semana");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isEditing = Boolean(channel);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const canSubmit = handle.trim().length >= 3 && !isLoading;

  function reset() {
    setHandle(channel?.handle ?? "");
    setNiche(channel?.niche ?? "");
    setLanguage(channel?.language ?? "PT-BR");
    setFrequency(channel?.frequency ?? "1x / semana");
    setColor(channel?.color ?? COLOR_PRESETS[0]);
    setDescription(channel?.description ?? "");
    setIsLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    setHandle(channel?.handle ?? "");
    setNiche(channel?.niche ?? "");
    setLanguage(channel?.language ?? "PT-BR");
    setFrequency(channel?.frequency ?? "1x / semana");
    setColor(channel?.color ?? COLOR_PRESETS[0]);
    setDescription(channel?.description ?? "");
    setIsLoading(false);
  }, [open, channel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (channel) {
      const updated = updateChannel({
        ...channel,
        niche: niche.trim(),
        language,
        frequency,
        color,
        description: description.trim(),
      });
      if (updated) toast.success("Canal atualizado");
      setOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const youtube = await resolveYouTubeChannel(handle);
      const newChannel: Omit<Channel, "createdAt"> = {
        id: `ch-${crypto.randomUUID()}`,
        ...youtube,
        color,
        description: description.trim(),
        niche: niche.trim(),
        language,
        activeProjects: 0,
        frequency,
        nextPublish: "",
        currentProjectProgress: 0,
        status: "healthy",
        trend: [],
        methods: createEmptyMethods(),
      };

      const persistedChannel = createChannel(newChannel);
      onCreate?.(persistedChannel);
      toast.success("Canal conectado", {
        description: `${newChannel.name} foi identificado pelo YouTube.`,
      });
      reset();
      setOpen(false);
    } catch (error) {
      toast.error("Não foi possível conectar o canal", {
        description: error instanceof Error ? error.message : "Confira o @ e tente novamente.",
      });
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              size="sm"
              className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]"
            >
              <Plus className="size-4" />
              Novo canal
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-xl border border-border/60"
              style={{ background: `${color}20`, borderColor: `${color}66` }}
            >
              <Youtube className="size-5" style={{ color }} />
            </div>
            <div>
              <DialogTitle>{isEditing ? "Editar canal" : "Novo canal"}</DialogTitle>
              <DialogDescription>
                Informe o @. Nome, inscritos e imagens serão buscados automaticamente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-handle">@ do canal *</Label>
              <Input
                id="ch-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@meucanal"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                disabled={isEditing}
              />
              <p className="text-[11px] text-muted-foreground">
                Você também pode colar a URL completa do canal.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-niche">Nicho</Label>
              <Input
                id="ch-niche"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Ex.: Ciência"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-lang">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="ch-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-freq">Frequência de publicação</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="ch-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cor de destaque</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "relative size-8 rounded-lg border border-border/60 transition",
                      color === c && "ring-2 ring-offset-2 ring-offset-background",
                    )}
                    style={{
                      background: c,
                      ...(color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}),
                    }}
                    aria-label={`Cor ${c}`}
                  >
                    {color === c && <Check className="absolute inset-0 m-auto size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-desc">Descrição (opcional)</Label>
              <Textarea
                id="ch-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sobre o que é esse canal, público-alvo, tom de voz…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="gap-1.5 gradient-brand text-white"
            >
              {isLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {isLoading
                ? "Buscando no YouTube..."
                : isEditing
                  ? "Salvar alterações"
                  : "Conectar canal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
