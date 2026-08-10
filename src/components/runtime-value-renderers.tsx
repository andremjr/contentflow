import type { ComponentType } from "react";
import {
  CheckCircle2,
  ExternalLink,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileVideo,
  GalleryHorizontal,
  LayoutGrid,
  List,
  ListTree,
  Rows3,
  Table2,
  Tags,
  Text,
  TextQuote,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  FieldPresentation,
  HumanFieldType,
  PresentationRendererId,
  RuntimeValue,
  StoredFile,
  StructuredRecord,
} from "@/lib/domain";

export type PresentationRendererProps = {
  type: HumanFieldType;
  value: RuntimeValue | StructuredRecord | undefined;
  compact: boolean;
  presentation?: FieldPresentation;
};

export type PresentationRendererDefinition = {
  id: PresentationRendererId;
  label: string;
  description: string;
  group: "Automático" | "Texto e listas" | "Dados estruturados" | "Mídia" | "Decisão";
  icon: typeof Text;
  Renderer: ComponentType<PresentationRendererProps>;
  preview: { type: HumanFieldType; value: RuntimeValue | StructuredRecord };
};

const previewImage = (name: string, color: string): StoredFile => ({
  id: name,
  name: `${name}.png`,
  mimeType: "image/png",
  size: 245_000,
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="100%" height="100%" fill="${color}"/><circle cx="240" cy="115" r="54" fill="white" fill-opacity=".18"/><text x="240" y="210" fill="white" text-anchor="middle" font-family="sans-serif" font-size="22">${name}</text></svg>`)}`,
});

const PREVIEW_FILES: StoredFile[] = [
  previewImage("Cena 01", "#6d5bd0"),
  previewImage("Cena 02", "#147d92"),
  {
    id: "roteiro",
    name: "roteiro-final.pdf",
    mimeType: "application/pdf",
    size: 86_400,
    url: "#",
  },
];

const PREVIEW_RECORDS: StructuredRecord[] = [
  { cena: "Abertura", status: "Pronta", duração: "00:08" },
  { cena: "Contexto", status: "Revisar", duração: "00:24" },
];

const definitions: PresentationRendererDefinition[] = [
  {
    id: "auto",
    label: "Automático",
    description: "O núcleo escolhe a apresentação mais adequada ao tipo técnico.",
    group: "Automático",
    icon: LayoutGrid,
    Renderer: TextShortRenderer,
    preview: { type: "text", value: "A apresentação acompanha automaticamente o tipo do dado." },
  },
  {
    id: "text-short",
    label: "Texto curto",
    description: "Uma linha compacta para títulos, números, datas e links.",
    group: "Texto e listas",
    icon: Text,
    Renderer: TextShortRenderer,
    preview: { type: "text", value: "Como criar uma rotina editorial sustentável" },
  },
  {
    id: "text-long",
    label: "Texto longo",
    description: "Bloco de leitura com quebras de linha preservadas.",
    group: "Texto e listas",
    icon: TextQuote,
    Renderer: TextLongRenderer,
    preview: {
      type: "textarea",
      value:
        "Abertura com a promessa principal.\n\nEm seguida, apresente o contexto e desenvolva o argumento.",
    },
  },
  {
    id: "list",
    label: "Lista",
    description: "Itens em linhas, ideal quando a ordem importa.",
    group: "Texto e listas",
    icon: List,
    Renderer: ListRenderer,
    preview: { type: "list", value: ["Pesquisar referências", "Escrever roteiro", "Revisar"] },
  },
  {
    id: "tags",
    label: "Etiquetas",
    description: "Itens compactos e sem hierarquia visual.",
    group: "Texto e listas",
    icon: Tags,
    Renderer: TagsRenderer,
    preview: { type: "list", value: ["educação", "produtividade", "criadores"] },
  },
  {
    id: "table",
    label: "Tabela",
    description: "Registros comparáveis organizados em colunas.",
    group: "Dados estruturados",
    icon: Table2,
    Renderer: TableRenderer,
    preview: { type: "records", value: PREVIEW_RECORDS },
  },
  {
    id: "cards",
    label: "Cartões",
    description: "Um cartão por registro para leitura mais narrativa.",
    group: "Dados estruturados",
    icon: Rows3,
    Renderer: CardsRenderer,
    preview: { type: "records", value: PREVIEW_RECORDS },
  },
  {
    id: "file-list",
    label: "Lista de arquivos",
    description: "Nome, formato e tamanho de cada arquivo.",
    group: "Mídia",
    icon: ListTree,
    Renderer: FileListRenderer,
    preview: { type: "files", value: PREVIEW_FILES },
  },
  {
    id: "image-gallery",
    label: "Galeria de imagens",
    description: "Grade visual para imagens, inclusive dentro do tipo files.",
    group: "Mídia",
    icon: GalleryHorizontal,
    Renderer: ImageGalleryRenderer,
    preview: { type: "files", value: PREVIEW_FILES.slice(0, 2) },
  },
  {
    id: "audio-player",
    label: "Player de áudio",
    description: "Player nativo para um ou mais arquivos de áudio.",
    group: "Mídia",
    icon: FileAudio,
    Renderer: AudioRenderer,
    preview: {
      type: "audio",
      value: {
        id: "audio",
        name: "narração-final.mp3",
        mimeType: "audio/mpeg",
        size: 1200000,
        url: "",
      },
    },
  },
  {
    id: "video-player",
    label: "Player de vídeo",
    description: "Player nativo para uma ou mais entregas em vídeo.",
    group: "Mídia",
    icon: FileVideo,
    Renderer: VideoRenderer,
    preview: {
      type: "video",
      value: {
        id: "video",
        name: "corte-final.mp4",
        mimeType: "video/mp4",
        size: 8400000,
        url: "",
      },
    },
  },
  {
    id: "decision",
    label: "Decisão / aprovação",
    description: "Estado explícito de aprovação ou reprovação.",
    group: "Decisão",
    icon: CheckCircle2,
    Renderer: DecisionRenderer,
    preview: { type: "approval", value: "approved" },
  },
];

export const PRESENTATION_RENDERERS = definitions;
export const PRESENTATION_RENDERER_REGISTRY = Object.fromEntries(
  definitions.map((definition) => [definition.id, definition]),
) as Record<PresentationRendererId, PresentationRendererDefinition>;

function TextShortRenderer({ type, value, compact }: PresentationRendererProps) {
  if (typeof value === "boolean") return <span className="text-sm">{value ? "Sim" : "Não"}</span>;
  if (type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    return (
      <time dateTime={value} className={compact ? "text-xs" : "text-sm"}>
        {Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR")}
      </time>
    );
  }
  if (type === "url" && typeof value === "string") {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 break-all text-sm text-brand-soft hover:underline"
      >
        {value} <ExternalLink className="size-3.5 shrink-0" />
      </a>
    );
  }
  return <p className={compact ? "truncate text-xs" : "text-sm"}>{String(value)}</p>;
}

function TextLongRenderer({ value, compact }: PresentationRendererProps) {
  return (
    <p
      className={
        compact ? "whitespace-pre-wrap text-xs" : "whitespace-pre-wrap text-sm leading-relaxed"
      }
    >
      {String(value)}
    </p>
  );
}

function ListRenderer({ value, compact }: PresentationRendererProps) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <ul className={compact ? "space-y-1 text-xs" : "space-y-1.5 text-sm"}>
      {values.map((item, index) => (
        <li key={valueKey(item, index)} className="flex gap-2">
          <span className="text-muted-foreground">•</span>
          <span className="min-w-0 break-words">{displayScalar(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function TagsRenderer({ value }: PresentationRendererProps) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {values.map((item, index) => (
        <li key={valueKey(item, index)}>
          <Badge variant="secondary" className="whitespace-normal text-left text-[10px]">
            {displayScalar(item)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function TableRenderer({ value, compact }: PresentationRendererProps) {
  const records = asRecords(value);
  if (!records.length)
    return <span className="text-xs text-muted-foreground">Nenhum registro</span>;
  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border/60">
      <table className={compact ? "min-w-full text-[10px]" : "min-w-full text-xs"}>
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index} className="border-t border-border/60 align-top">
              {columns.map((column) => (
                <td key={column} className="max-w-72 px-3 py-2">
                  {displayScalar(record[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsRenderer({ value, compact }: PresentationRendererProps) {
  const records = asRecords(value);
  return (
    <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 md:grid-cols-2"}>
      {records.map((record, index) => (
        <dl key={index} className="rounded-lg border border-border/60 bg-background/30 p-3">
          {Object.entries(record).map(([key, item]) => (
            <div key={key} className="mb-2 last:mb-0">
              <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {key}
              </dt>
              <dd className="mt-0.5 break-words text-xs">{displayScalar(item)}</dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}

function FileListRenderer({ value }: PresentationRendererProps) {
  const files = asFiles(value);
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.url || undefined}
          target={file.url ? "_blank" : undefined}
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-xs transition hover:border-brand/40"
        >
          <FileTypeIcon file={file} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{file.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {file.mimeType} · {formatBytes(file.size)}
            </span>
          </span>
          {file.url && <ExternalLink className="size-3.5 text-muted-foreground" />}
        </a>
      ))}
    </div>
  );
}

function ImageGalleryRenderer({ value, compact }: PresentationRendererProps) {
  const files = asFiles(value).filter((file) => file.mimeType.startsWith("image/"));
  const stringValues =
    typeof value === "string"
      ? [{ id: value, name: "Imagem", mimeType: "image/*", size: 0, url: value }]
      : [];
  const images = files.length ? files : stringValues;
  return (
    <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 md:grid-cols-2"}>
      {images.map((file) => (
        <figure
          key={file.id}
          className="overflow-hidden rounded-lg border border-border/60 bg-background/40"
        >
          <img
            src={file.url}
            alt={file.name}
            className={
              compact ? "max-h-44 w-full object-contain" : "max-h-[32rem] w-full object-contain"
            }
            loading="lazy"
          />
          <figcaption className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
            <FileImage className="size-3.5" />
            <span className="truncate">{file.name}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function AudioRenderer({ value }: PresentationRendererProps) {
  const files = mediaFiles(value, "audio/");
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <FileAudio className="size-4 text-brand-soft" />
            <span className="truncate">{file.name}</span>
          </div>
          <audio controls src={file.url || undefined} className="w-full" />
        </div>
      ))}
    </div>
  );
}

function VideoRenderer({ value, compact }: PresentationRendererProps) {
  const files = mediaFiles(value, "video/");
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <figure
          key={file.id}
          className="overflow-hidden rounded-lg border border-border/60 bg-black"
        >
          <video
            controls
            src={file.url || undefined}
            className={compact ? "max-h-48 w-full" : "max-h-[32rem] w-full"}
          />
          <figcaption className="flex items-center gap-2 bg-card px-3 py-2 text-[10px] text-muted-foreground">
            <FileVideo className="size-3.5" />
            <span className="truncate">{file.name}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function DecisionRenderer({ value }: PresentationRendererProps) {
  const approved = value === "approved" || value === true;
  return (
    <Badge
      variant="outline"
      className={
        approved
          ? "gap-1.5 border-success/40 bg-success/10 text-success"
          : "gap-1.5 border-destructive/40 bg-destructive/10 text-destructive"
      }
    >
      {approved ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {approved ? "Aprovado" : "Reprovado"}
    </Badge>
  );
}

function FileTypeIcon({ file }: { file: StoredFile }) {
  const Icon = file.mimeType.startsWith("image/")
    ? FileImage
    : file.mimeType.startsWith("audio/")
      ? FileAudio
      : file.mimeType.startsWith("video/")
        ? FileVideo
        : FileIcon;
  return <Icon className="size-5 shrink-0 text-brand-soft" />;
}

function asFiles(value: unknown): StoredFile[] {
  if (isStoredFile(value)) return [value];
  return Array.isArray(value) ? value.filter(isStoredFile) : [];
}

function mediaFiles(value: unknown, mimePrefix: string) {
  const files = asFiles(value).filter((file) => file.mimeType.startsWith(mimePrefix));
  if (files.length) return files;
  return typeof value === "string"
    ? [
        {
          id: value,
          name: mimePrefix === "audio/" ? "Áudio" : "Vídeo",
          mimeType: `${mimePrefix}*`,
          size: 0,
          url: value,
        },
      ]
    : [];
}

function asRecords(value: unknown): StructuredRecord[] {
  if (Array.isArray(value)) return value.filter(isStructuredRecord);
  return isStructuredRecord(value) ? [value] : [];
}

function displayScalar(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (isStoredFile(value)) return value.name;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function valueKey(value: unknown, index: number) {
  return isStoredFile(value) ? value.id : `${displayScalar(value)}-${index}`;
}

function isStoredFile(value: unknown): value is StoredFile {
  return Boolean(
    value && typeof value === "object" && "id" in value && "url" in value && "mimeType" in value,
  );
}

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && !isStoredFile(value),
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
