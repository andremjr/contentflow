import {
  CheckCircle2,
  ExternalLink,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileVideo,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompositionPreview } from "@/components/composition-canvas";
import type { HumanFieldType, RuntimeValue, StoredFile, ThumbnailLayout } from "@/lib/domain";

export function RuntimeValueViewer({
  type,
  value,
  compact = false,
}: {
  type: HumanFieldType | "thumbnail_layout";
  value: RuntimeValue | undefined;
  compact?: boolean;
}) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-xs text-muted-foreground">Não informado</span>;
  }

  if (Array.isArray(value)) {
    const files = value.filter(isStoredFile);
    if (files.length) {
      return (
        <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 md:grid-cols-2"}>
          {files.map((file) => (
            <FileValue key={file.id} file={file} compact={compact} />
          ))}
        </div>
      );
    }
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <li key={`${item}-${index}`}>
            <Badge variant="secondary" className="whitespace-normal text-left text-[10px]">
              {String(item)}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }

  if (isStoredFile(value)) return <FileValue file={value} compact={compact} />;

  if (isThumbnailLayout(value)) return <CompositionPreview boxes={value.boxes} />;

  if (type === "approval") {
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

  if (typeof value === "boolean") {
    return <span className="text-sm">{value ? "Sim" : "Não"}</span>;
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

  if (type === "image" && typeof value === "string") {
    return (
      <img
        src={value}
        alt="Resultado produzido"
        className={
          compact
            ? "max-h-40 w-full rounded-lg border border-border/60 object-contain"
            : "max-h-[32rem] w-full rounded-xl border border-border/60 object-contain"
        }
      />
    );
  }

  if (type === "audio" && typeof value === "string") {
    return <audio controls src={value} className="w-full" />;
  }

  if (type === "video" && typeof value === "string") {
    return <video controls src={value} className="max-h-[32rem] w-full rounded-xl bg-black" />;
  }

  return (
    <p className={compact ? "whitespace-pre-wrap text-xs" : "whitespace-pre-wrap text-sm"}>
      {String(value)}
    </p>
  );
}

function FileValue({ file, compact }: { file: StoredFile; compact: boolean }) {
  if (file.mimeType.startsWith("image/")) {
    return (
      <figure className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
        <img
          src={file.url}
          alt={file.name}
          className={
            compact ? "max-h-44 w-full object-contain" : "max-h-[32rem] w-full object-contain"
          }
          loading="lazy"
        />
        <figcaption className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
          <FileImage className="size-3.5" /> <span className="truncate">{file.name}</span>
        </figcaption>
      </figure>
    );
  }
  if (file.mimeType.startsWith("audio/")) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <FileAudio className="size-4 text-brand-soft" />
          <span className="truncate">{file.name}</span>
        </div>
        <audio controls src={file.url} className="w-full" />
      </div>
    );
  }
  if (file.mimeType.startsWith("video/")) {
    return (
      <figure className="overflow-hidden rounded-lg border border-border/60 bg-black">
        <video
          controls
          src={file.url}
          className={compact ? "max-h-48 w-full" : "max-h-[32rem] w-full"}
        />
        <figcaption className="flex items-center gap-2 bg-card px-3 py-2 text-[10px] text-muted-foreground">
          <FileVideo className="size-3.5" /> <span className="truncate">{file.name}</span>
        </figcaption>
      </figure>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-xs transition hover:border-brand/40"
    >
      <FileIcon className="size-5 shrink-0 text-brand-soft" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
      </span>
      <ExternalLink className="size-3.5 text-muted-foreground" />
    </a>
  );
}

function isStoredFile(value: unknown): value is StoredFile {
  return Boolean(
    value && typeof value === "object" && "id" in value && "url" in value && "mimeType" in value,
  );
}

function isThumbnailLayout(value: unknown): value is ThumbnailLayout {
  return Boolean(
    value &&
    typeof value === "object" &&
    "aspectRatio" in value &&
    value.aspectRatio === "16:9" &&
    "boxes" in value &&
    Array.isArray(value.boxes),
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
