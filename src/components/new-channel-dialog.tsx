import { useEffect, useState } from "react";
import { Check, Layers3, Plus } from "lucide-react";
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
import { createChannel, updateChannel } from "@/lib/store";

const COLOR_PRESETS = ["#2563EB", "#4F6B8F", "#60727A", "#6B7080"];

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
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("PT-BR");
  const [frequency, setFrequency] = useState("1x / semana");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [description, setDescription] = useState("");

  const isEditing = Boolean(channel);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const canSubmit = name.trim().length >= 2;

  function reset() {
    setName(channel?.name ?? "");
    setHandle(channel?.handle ?? "");
    setNiche(channel?.niche ?? "");
    setLanguage(channel?.language ?? "PT-BR");
    setFrequency(channel?.frequency ?? "1x / semana");
    setColor(channel?.color ?? COLOR_PRESETS[0]);
    setDescription(channel?.description ?? "");
  }

  useEffect(() => {
    if (!open) return;
    setName(channel?.name ?? "");
    setHandle(channel?.handle ?? "");
    setNiche(channel?.niche ?? "");
    setLanguage(channel?.language ?? "PT-BR");
    setFrequency(channel?.frequency ?? "1x / semana");
    setColor(channel?.color ?? COLOR_PRESETS[0]);
    setDescription(channel?.description ?? "");
  }, [open, channel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (channel) {
      const updated = updateChannel({
        ...channel,
        name: name.trim(),
        handle: handle.trim(),
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

    const newChannel: Omit<Channel, "createdAt"> = {
      id: `ch-${crypto.randomUUID()}`,
      name: name.trim(),
      handle: handle.trim(),
      color,
      subscribers: "—",
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
    toast.success("Canal criado", {
      description: "Agora você pode organizar Métodos, Projetos e a Biblioteca Estratégica.",
    });
    reset();
    setOpen(false);
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
              className="h-9 gap-1.5 px-2.5 text-white sm:px-3"
              aria-label="Novo canal"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Novo canal</span>
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-secondary">
              <Layers3 className="size-5" style={{ color }} />
            </div>
            <div>
              <DialogTitle>{isEditing ? "Editar canal" : "Novo canal"}</DialogTitle>
              <DialogDescription>
                O Canal organiza Métodos, Projetos e referências sem depender de serviços externos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-name">Nome do canal *</Label>
              <Input
                id="ch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Meu canal de ciência"
                autoFocus
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-handle">Identificador ou @ (opcional)</Label>
              <Input
                id="ch-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@meucanal"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Serve como referência local do canal.
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
                      "relative size-8 rounded-md border border-white/10 transition hover:border-white/30",
                      color === c && "ring-2 ring-brand ring-offset-2 ring-offset-popover",
                    )}
                    style={{
                      background: c,
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="gap-1.5 gradient-brand text-white"
            >
              <Plus className="size-4" />
              {isEditing ? "Salvar alterações" : "Criar canal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
