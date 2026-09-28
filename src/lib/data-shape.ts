import type { FieldPresentation, HumanFieldType } from "@/lib/domain";

export type DataValueKind = "text" | "number" | "boolean" | "record" | "artifact";
export type DataCardinality = "one" | "many";
export type DataVisualFamily = "text" | "image" | "audio" | "video" | "file";

export type DataShape = {
  kind: DataValueKind;
  cardinality: DataCardinality;
  visualFamily: DataVisualFamily;
  inputControl?: HumanFieldType;
  acceptedMimeTypes?: string[];
};

const MANY_TYPES = new Set<HumanFieldType>(["list", "multiselect", "records", "files"]);

export function normalizeDataShape(
  type: HumanFieldType,
  presentation?: FieldPresentation,
): DataShape {
  const cardinality: DataCardinality = MANY_TYPES.has(type) ? "many" : "one";
  if (type === "number")
    return { kind: "number", cardinality, visualFamily: "text", inputControl: type };
  if (type === "boolean" || type === "approval")
    return { kind: "boolean", cardinality, visualFamily: "text", inputControl: type };
  if (type === "records" || type === "thumbnail_layout")
    return { kind: "record", cardinality, visualFamily: "text", inputControl: type };
  if (["file", "files", "image", "audio", "video"].includes(type)) {
    const presentationFamily =
      presentation?.itemType === "image" ||
      presentation?.itemType === "audio" ||
      presentation?.itemType === "video"
        ? presentation.itemType
        : undefined;
    const visualFamily: DataVisualFamily =
      presentationFamily ??
      (type === "image" || type === "audio" || type === "video" ? type : "file");
    return {
      kind: "artifact",
      cardinality,
      visualFamily,
      inputControl: type,
      ...(presentation?.acceptedMimeTypes?.length
        ? { acceptedMimeTypes: [...presentation.acceptedMimeTypes] }
        : {}),
    };
  }
  return { kind: "text", cardinality, visualFamily: "text", inputControl: type };
}

export function areDataShapesCompatible(source: DataShape, target: DataShape) {
  if (source.cardinality !== target.cardinality || source.kind !== target.kind) return false;
  if (source.kind !== "artifact") return true;
  if (target.visualFamily !== "file" && source.visualFamily !== target.visualFamily) return false;
  if (!target.acceptedMimeTypes?.length || !source.acceptedMimeTypes?.length) return true;
  return source.acceptedMimeTypes.some((sourceMime) =>
    target.acceptedMimeTypes!.some((targetMime) => mimePatternsOverlap(sourceMime, targetMime)),
  );
}

function mimePatternsOverlap(left: string, right: string) {
  if (left === right || left === "*/*" || right === "*/*") return true;
  const [leftType, leftSubtype] = left.split("/");
  const [rightType, rightSubtype] = right.split("/");
  if (!leftType || !leftSubtype || !rightType || !rightSubtype || leftType !== rightType)
    return false;
  return leftSubtype === "*" || rightSubtype === "*";
}

export function areHumanFieldTypesCompatible(
  source: HumanFieldType,
  target: HumanFieldType,
  sourcePresentation?: FieldPresentation,
  targetPresentation?: FieldPresentation,
) {
  return areDataShapesCompatible(
    normalizeDataShape(source, sourcePresentation),
    normalizeDataShape(target, targetPresentation),
  );
}

export function legacyTypeListAccepts(
  declaredTypes: readonly HumanFieldType[],
  fieldType: HumanFieldType,
) {
  return declaredTypes.some((declared) => areHumanFieldTypesCompatible(fieldType, declared));
}
