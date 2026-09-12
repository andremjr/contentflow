import { CompositionPreview } from "@/components/composition-canvas";
import { OutputCharacterCount } from "@/components/output-character-count";
import { PRESENTATION_RENDERER_REGISTRY } from "@/components/runtime-value-renderers";
import type {
  FieldPresentation,
  HumanFieldType,
  RuntimeValue,
  StructuredRecord,
  ThumbnailLayout,
} from "@/lib/domain";
import { resolvePresentationRenderer } from "@/lib/presentation";

export function RuntimeValueViewer({
  type,
  value,
  presentation,
  compact = false,
  showCharacterCount = false,
}: {
  type: HumanFieldType;
  value: RuntimeValue | StructuredRecord | undefined;
  presentation?: FieldPresentation;
  compact?: boolean;
  showCharacterCount?: boolean;
}) {
  if (isEmptyPresentationValue(value)) {
    return <span className="text-xs text-muted-foreground">Não informado</span>;
  }

  if (type === "thumbnail_layout" && isThumbnailLayout(value)) {
    return <CompositionPreview boxes={value.boxes} className={compact ? "max-w-72" : undefined} />;
  }

  const renderer =
    PRESENTATION_RENDERER_REGISTRY[resolvePresentationRenderer(type, presentation, value)];
  if (!renderer) {
    return <span className="text-xs text-muted-foreground">Visualização indisponível</span>;
  }
  const Renderer = renderer.Renderer;
  const content = (
    <Renderer type={type} value={value} compact={compact} presentation={presentation} />
  );

  if (showCharacterCount && (type === "text" || type === "textarea") && typeof value === "string") {
    return (
      <div className="relative pb-5">
        {content}
        <OutputCharacterCount value={value} className="absolute bottom-0 right-0" />
      </div>
    );
  }

  return content;
}

function isEmptyPresentationValue(value: unknown) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
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
