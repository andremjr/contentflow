import { useState } from "react";
import { Plus, Radio, Check } from "lucide-react";
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
import type { Channel } from "@/lib/mock-data";
import { createChannel } from "@/lib/store";

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
const FREQUENCIES = [
  "1x / semana",
  "2x / semana",
  "3x / semana",
  "Diário",
  "Quinzenal",
];

export type NewChannelInput = Omit<Channel, "id" | "trend" | "currentProjectProgress" | "activeProjects" | "nextPublish"> & {
  description?: string;
};

export function NewChannelDialog({
  trigger,
  onCreate,
}: {
  trigger?: React.ReactNode;
  onCreate?: (channel: Channel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("PT-BR");
  const [frequency, setFrequency] = useState("1x / semana");
  const [subscribers, setSubscribers] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [description, setDescription] = useState("");

  const canSubmit = name.trim().length > 0 && handle.trim().length > 0;

  function reset() {
    setName("");
    setHandle("");
    setNiche("");
    setLanguage("PT-BR");
    setFrequency("1x / semana");
    setSubscribers("");
    setColor(COLOR_PRESETS[0]);
    setDescription("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const normalizedHandle = handle.startsWith("@") ? handle : `@${handle}`;
    const newChannel: Channel = {
      id: `ch-new-${Date.now()}`,
      name: name.trim(),
      handle: normalizedHandle,
      color,
      subscribers: subscribers.trim() || "—",
      niche: niche.trim() || "Geral",
      language,
      activeProjects: 0,
      frequency,
      nextPublish: "—",
      currentProjectProgress: 0,
      status: "healthy",
      trend: Array.from({ length: 12 }, () => Math.round(20 + Math.random() * 40)),
    };

    createChannel(newChannel);
    onCreate?.(newChannel);
    toast.success("Canal criado", {
      description: `${newChannel.name} adicionado ao workspace.`,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-xl border border-border/60"
              style={{ background: `${color}20`, borderColor: `${color}66` }}
            >
              <Radio className="size-5" style={{ color }} />
            </div>
            <div>
              <DialogTitle>Novo canal</DialogTitle>
              <DialogDescription>
                Cadastre um canal do YouTube para começar a produção.
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
                placeholder="Ex.: Deep Space Docs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-handle">Handle *</Label>
              <Input
                id="ch-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@meucanal"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-subs">Inscritos</Label>
              <Input
                id="ch-subs"
                value={subscribers}
                onChange={(e) => setSubscribers(e.target.value)}
                placeholder="Ex.: 120K"
              />
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
                    {color === c && (
                      <Check className="absolute inset-0 m-auto size-4 text-white" />
                    )}
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
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="gap-1.5 gradient-brand text-white"
            >
              <Plus className="size-4" />
              Criar canal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
