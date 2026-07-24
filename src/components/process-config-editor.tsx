/**
 * Compact, per-process configuration editor rendered inline on the
 * project run page. Whatever the user tweaks here is persisted at the
 * channel level (via the store) and immediately flows into the next
 * command sent to the engine.
 */
import { useState } from "react";
import { Sliders, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProcessId } from "@/lib/mock-data";
import { useProcessConfig, setProcessConfig } from "@/lib/store";
import type {
  ResearchConfig,
  IdeasConfig,
  TitlesConfig,
  ThumbnailConfig,
  ScriptConfig,
  NarrationConfig,
  AssetsConfig,
  EditingConfig,
  PublishingConfig,
} from "@/engines/types";

export function ProcessConfigEditor({
  channelId,
  processId,
}: {
  channelId: string;
  processId: ProcessId;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {processId === "research" && (
        <ResearchFields channelId={channelId} />
      )}
      {processId === "ideas" && <IdeasFields channelId={channelId} />}
      {processId === "titles" && <TitlesFields channelId={channelId} />}
      {processId === "thumbnail" && (
        <ThumbnailFields channelId={channelId} />
      )}
      {processId === "script" && <ScriptFields channelId={channelId} />}
      {processId === "narration" && (
        <NarrationFields channelId={channelId} />
      )}
      {processId === "assets" && <AssetsFields channelId={channelId} />}
      {processId === "editing" && <EditingFields channelId={channelId} />}
      {processId === "publishing" && (
        <PublishingFields channelId={channelId} />
      )}
    </div>
  );
}

// ---------- shared field wrappers ----------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground/80">{hint}</p>
      )}
    </div>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand-soft"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remover ${v}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "Adicionar…"}
          className="flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground/60"
        />
        {draft && (
          <button
            type="button"
            onClick={add}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Adicionar"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- per-process editors ----------

function ResearchFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "research");
  const set = (patch: Partial<ResearchConfig>) =>
    setProcessConfig(channelId, "research", patch);
  return (
    <>
      <Field label="Palavras-chave" hint="Enter para adicionar.">
        <TagInput
          values={cfg.keywords}
          onChange={(v) => set({ keywords: v })}
          placeholder="ex.: inflação"
        />
      </Field>
      <Field label="Palavras negativas">
        <TagInput
          values={cfg.negativeKeywords}
          onChange={(v) => set({ negativeKeywords: v })}
          placeholder="ex.: shorts"
        />
      </Field>
      <Field label="Idioma">
        <Select
          value={cfg.language}
          onValueChange={(v) => set({ language: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pt-BR">Português (BR)</SelectItem>
            <SelectItem value="en-US">Inglês (EUA)</SelectItem>
            <SelectItem value="es-ES">Espanhol</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={`Views mínimas: ${cfg.minViews?.toLocaleString() ?? "—"}`}>
        <Input
          type="number"
          value={cfg.minViews ?? 0}
          onChange={(e) =>
            set({ minViews: Number(e.target.value) || null })
          }
          className="h-8 text-xs"
        />
      </Field>
    </>
  );
}

function IdeasFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "ideas");
  const set = (patch: Partial<IdeasConfig>) =>
    setProcessConfig(channelId, "ideas", patch);
  return (
    <>
      <Field label={`Quantidade: ${cfg.count}`}>
        <Slider
          value={[cfg.count]}
          min={1}
          max={20}
          step={1}
          onValueChange={(v) => set({ count: v[0] })}
        />
      </Field>
      <Field label="Tom">
        <Select
          value={cfg.tone}
          onValueChange={(v) => set({ tone: v as IdeasConfig["tone"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="informative">Informativo</SelectItem>
            <SelectItem value="provocative">Provocativo</SelectItem>
            <SelectItem value="curious">Curioso</SelectItem>
            <SelectItem value="practical">Prático</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Formato">
        <Select
          value={cfg.format}
          onValueChange={(v) =>
            set({ format: v as IdeasConfig["format"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listicle">Listicle</SelectItem>
            <SelectItem value="documentary">Documentário</SelectItem>
            <SelectItem value="explainer">Explicativo</SelectItem>
            <SelectItem value="story">Narrativa</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Usar referências">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.useReferences}
            onCheckedChange={(v) => set({ useReferences: v })}
          />
        </div>
      </Field>
    </>
  );
}

function TitlesFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "titles");
  const set = (patch: Partial<TitlesConfig>) =>
    setProcessConfig(channelId, "titles", patch);
  return (
    <>
      <Field label={`Variantes: ${cfg.variantsPerIdea}`}>
        <Slider
          value={[cfg.variantsPerIdea]}
          min={1}
          max={15}
          step={1}
          onValueChange={(v) => set({ variantsPerIdea: v[0] })}
        />
      </Field>
      <Field label={`Máx. caracteres: ${cfg.maxLength}`}>
        <Slider
          value={[cfg.maxLength]}
          min={30}
          max={100}
          step={1}
          onValueChange={(v) => set({ maxLength: v[0] })}
        />
      </Field>
      <Field label="Estilo">
        <Select
          value={cfg.style}
          onValueChange={(v) =>
            set({ style: v as TitlesConfig["style"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="curiosity">Curiosidade</SelectItem>
            <SelectItem value="authority">Autoridade</SelectItem>
            <SelectItem value="controversial">Controverso</SelectItem>
            <SelectItem value="how-to">Como fazer</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Números & emoji">
        <div className="flex h-8 items-center gap-4">
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={cfg.includeNumbers}
              onCheckedChange={(v) => set({ includeNumbers: v })}
            />
            Nº
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={cfg.includeEmoji}
              onCheckedChange={(v) => set({ includeEmoji: v })}
            />
            😀
          </label>
        </div>
      </Field>
    </>
  );
}

function ThumbnailFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "thumbnail");
  const set = (patch: Partial<ThumbnailConfig>) =>
    setProcessConfig(channelId, "thumbnail", patch);
  return (
    <>
      <Field label={`Variantes: ${cfg.variants}`}>
        <Slider
          value={[cfg.variants]}
          min={1}
          max={8}
          step={1}
          onValueChange={(v) => set({ variants: v[0] })}
        />
      </Field>
      <Field label="Estilo">
        <Select
          value={cfg.style}
          onValueChange={(v) =>
            set({ style: v as ThumbnailConfig["style"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cinematic">Cinematográfico</SelectItem>
            <SelectItem value="bold">Impactante</SelectItem>
            <SelectItem value="minimal">Minimalista</SelectItem>
            <SelectItem value="editorial">Editorial</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Incluir rosto">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.includeFace}
            onCheckedChange={(v) => set({ includeFace: v })}
          />
        </div>
      </Field>
      <Field label="Incluir texto">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.includeText}
            onCheckedChange={(v) => set({ includeText: v })}
          />
        </div>
      </Field>
    </>
  );
}

function ScriptFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "script");
  const set = (patch: Partial<ScriptConfig>) =>
    setProcessConfig(channelId, "script", patch);
  return (
    <>
      <Field label={`Duração alvo: ${cfg.targetDurationMinutes} min`}>
        <Slider
          value={[cfg.targetDurationMinutes]}
          min={1}
          max={60}
          step={1}
          onValueChange={(v) => set({ targetDurationMinutes: v[0] })}
        />
      </Field>
      <Field label={`Palavras/minuto: ${cfg.wordsPerMinute}`}>
        <Slider
          value={[cfg.wordsPerMinute]}
          min={100}
          max={200}
          step={5}
          onValueChange={(v) => set({ wordsPerMinute: v[0] })}
        />
      </Field>
      <Field label="Estrutura">
        <Select
          value={cfg.structure}
          onValueChange={(v) =>
            set({ structure: v as ScriptConfig["structure"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hook-body-cta">Gancho · Corpo · CTA</SelectItem>
            <SelectItem value="problem-solution">Problema · Solução</SelectItem>
            <SelectItem value="story-arc">Arco narrativo</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Tom / gancho">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={cfg.tone}
            onValueChange={(v) => set({ tone: v as ScriptConfig["tone"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="professional">Profissional</SelectItem>
              <SelectItem value="documentary">Documentário</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={cfg.hookStyle}
            onValueChange={(v) =>
              set({ hookStyle: v as ScriptConfig["hookStyle"] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="question">Pergunta</SelectItem>
              <SelectItem value="statement">Afirmação</SelectItem>
              <SelectItem value="shock">Impacto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Field>
    </>
  );
}

function NarrationFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "narration");
  const set = (patch: Partial<NarrationConfig>) =>
    setProcessConfig(channelId, "narration", patch);
  return (
    <>
      <Field label="Voz">
        <Select
          value={cfg.voiceId}
          onValueChange={(v) => set({ voiceId: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pt-BR-neural-01">Marcus (PT-BR)</SelectItem>
            <SelectItem value="pt-BR-neural-02">Luísa (PT-BR)</SelectItem>
            <SelectItem value="en-US-neural-01">Ethan (EN-US)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={`Velocidade: ${cfg.speedPct}%`}>
        <Slider
          value={[cfg.speedPct]}
          min={70}
          max={130}
          step={5}
          onValueChange={(v) => set({ speedPct: v[0] })}
        />
      </Field>
      <Field label={`Pitch: ${cfg.pitchPct}%`}>
        <Slider
          value={[cfg.pitchPct]}
          min={-20}
          max={20}
          step={1}
          onValueChange={(v) => set({ pitchPct: v[0] })}
        />
      </Field>
      <Field label="Formato">
        <Select
          value={cfg.format}
          onValueChange={(v) =>
            set({ format: v as NarrationConfig["format"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mp3">MP3</SelectItem>
            <SelectItem value="wav">WAV</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function AssetsFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "assets");
  const set = (patch: Partial<AssetsConfig>) =>
    setProcessConfig(channelId, "assets", patch);
  return (
    <>
      <Field label={`Imagens / min: ${cfg.imagesPerMinute}`}>
        <Slider
          value={[cfg.imagesPerMinute]}
          min={1}
          max={20}
          step={1}
          onValueChange={(v) => set({ imagesPerMinute: v[0] })}
        />
      </Field>
      <Field label={`Clipes / min: ${cfg.videoClipsPerMinute}`}>
        <Slider
          value={[cfg.videoClipsPerMinute]}
          min={0}
          max={10}
          step={1}
          onValueChange={(v) => set({ videoClipsPerMinute: v[0] })}
        />
      </Field>
      <Field label="Provedor">
        <Select
          value={cfg.provider}
          onValueChange={(v) =>
            set({ provider: v as AssetsConfig["provider"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stock">Stock</SelectItem>
            <SelectItem value="generated">Gerado por IA</SelectItem>
            <SelectItem value="mixed">Misto</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Resolução mínima">
        <Select
          value={cfg.minResolution}
          onValueChange={(v) =>
            set({ minResolution: v as AssetsConfig["minResolution"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080p">1080p</SelectItem>
            <SelectItem value="4k">4K</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function EditingFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "editing");
  const set = (patch: Partial<EditingConfig>) =>
    setProcessConfig(channelId, "editing", patch);
  return (
    <>
      <Field label="Template">
        <Select
          value={cfg.template}
          onValueChange={(v) =>
            set({ template: v as EditingConfig["template"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Padrão</SelectItem>
            <SelectItem value="fast-cut">Fast-cut</SelectItem>
            <SelectItem value="documentary">Documentário</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Resolução de saída">
        <Select
          value={cfg.outputResolution}
          onValueChange={(v) =>
            set({ outputResolution: v as EditingConfig["outputResolution"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080p">1080p</SelectItem>
            <SelectItem value="4k">4K</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Legendas">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.captions}
            onCheckedChange={(v) => set({ captions: v })}
          />
        </div>
      </Field>
      <Field label={`Volume BGM: ${cfg.bgMusicVolumeDb} dB`}>
        <Slider
          value={[cfg.bgMusicVolumeDb]}
          min={-40}
          max={0}
          step={1}
          onValueChange={(v) => set({ bgMusicVolumeDb: v[0] })}
        />
      </Field>
    </>
  );
}

function PublishingFields({ channelId }: { channelId: string }) {
  const cfg = useProcessConfig(channelId, "publishing");
  const set = (patch: Partial<PublishingConfig>) =>
    setProcessConfig(channelId, "publishing", patch);
  return (
    <>
      <Field label="Visibilidade">
        <Select
          value={cfg.visibility}
          onValueChange={(v) =>
            set({ visibility: v as PublishingConfig["visibility"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Público</SelectItem>
            <SelectItem value="unlisted">Não listado</SelectItem>
            <SelectItem value="private">Privado</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Tags">
        <TagInput
          values={cfg.tags}
          onChange={(v) => set({ tags: v })}
          placeholder="ex.: macroeconomia"
        />
      </Field>
      <Field label="Feito para crianças">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.madeForKids}
            onCheckedChange={(v) => set({ madeForKids: v })}
          />
        </div>
      </Field>
      <Field label="Notificar inscritos">
        <div className="flex h-8 items-center">
          <Switch
            checked={cfg.notifySubscribers}
            onCheckedChange={(v) => set({ notifySubscribers: v })}
          />
        </div>
      </Field>
    </>
  );
}

// silence unused-imports for `Sliders` (kept for potential icon use)
void Sliders;
