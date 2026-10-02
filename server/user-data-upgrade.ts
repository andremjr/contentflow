import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { Express } from "express";
import { valueShapeSchema } from "../src/lib/value-shape-schema";
import type { PluginJobStore, PersistentPluginJob } from "./plugin-job-store";
import path from "node:path";
import { processMethodV3Schema, workspaceMethodV3Schema } from "../src/lib/method-contract-v3";
import { areValueShapesCompatible, validateValueShape } from "../src/lib/data-shape";
import type { ValueShape } from "../src/lib/domain";
import { createChannelHistoryRecordFields } from "../src/lib/channel-history";
import { runtimeValueMatchesShape } from "../src/lib/runtime-value-validation";

type JsonObject = Record<string, ReturnType<typeof JSON.parse>>;

type PluginPort = {
  key: string;
  shape: ValueShape;
};

type PluginCapability = {
  pluginId: string;
  pluginVersion: string;
  capabilityId: string;
  inputPorts: PluginPort[];
  outputPorts: PluginPort[];
};

export type MigrationDiagnostic = {
  path: string;
  message: string;
};

export type MigrationContext = {
  capabilities: Map<string, PluginCapability>;
  collections: Map<string, JsonObject>;
  diagnostics: MigrationDiagnostic[];
};

const PROCESS_TYPES = [
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
] as const;

const LEGACY_FIELD_KEYS = [
  "type",
  "source",
  "sourceKey",
  "sourceProcessType",
  "blockId",
  "collection",
  "staticValue",
  "historyLimit",
  "historyEligibility",
  "recordFields",
  "options",
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function diagnostic(context: MigrationContext, pathValue: string, message: string) {
  context.diagnostics.push({ path: pathValue, message });
}

function cleanPresentation(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object") return undefined;
  const renderer = (value as JsonObject).renderer;
  return typeof renderer === "string" ? { renderer } : undefined;
}

function contentShape(
  family: "text" | "image" | "audio" | "video",
  cardinality: "one" | "many" = "one",
  representation: "inline" | "artifact" | "either" = family === "text" ? "inline" : "artifact",
  mimeTypes?: string[],
): ValueShape {
  return {
    kind: "content",
    family,
    cardinality,
    representation,
    ...(mimeTypes?.length ? { formats: { mimeTypes: [...new Set(mimeTypes)] } } : {}),
  };
}

function controlShape(
  control:
    | "identifier"
    | "number"
    | "boolean"
    | "selection"
    | "datetime"
    | "url"
    | "approval"
    | "thumbnail_layout",
  cardinality: "one" | "many" = "one",
  options?: string[],
): ValueShape {
  return {
    kind: "control",
    control,
    cardinality,
    ...(control === "selection" && options?.length ? { options: [...options] } : {}),
  };
}

function historyShape(valueShape: ValueShape): ValueShape {
  return {
    kind: "record",
    cardinality: "many",
    fields: createChannelHistoryRecordFields(valueShape),
  };
}

function familyFromMimeTypes(mimeTypes: string[]) {
  if (!mimeTypes.length) return undefined;
  if (mimeTypes.every((mime) => mime.toLowerCase().startsWith("image/"))) return "image" as const;
  if (mimeTypes.every((mime) => mime.toLowerCase().startsWith("audio/"))) return "audio" as const;
  if (mimeTypes.every((mime) => mime.toLowerCase().startsWith("video/"))) return "video" as const;
  const textLike = mimeTypes.every((mime) => {
    const value = mime.toLowerCase();
    return (
      value.startsWith("text/") ||
      [
        "application/json",
        "application/ld+json",
        "application/xml",
        "application/x-subrip",
        "application/srt",
      ].includes(value)
    );
  });
  return textLike ? ("text" as const) : undefined;
}

function legacyRecordFieldShape(field: JsonObject, fieldPath: string, context: MigrationContext) {
  const shape = legacyShape(field, fieldPath, context, false);
  if (shape?.kind === "record") {
    diagnostic(context, fieldPath, "Campo interno de record não pode ser outro record.");
    return undefined;
  }
  return shape;
}

function legacyShape(
  field: JsonObject,
  fieldPath: string,
  context: MigrationContext,
  allowRecord = true,
): ValueShape | undefined {
  if (field.shape && typeof field.shape === "object") {
    const existing = clone(field.shape) as ValueShape;
    const issues = validateValueShape(existing);
    if (!issues.length) return existing;
    diagnostic(context, `${fieldPath}.shape`, issues.map((issue) => issue.message).join("; "));
    return undefined;
  }

  const type = typeof field.type === "string" ? field.type : "";
  const presentation =
    field.presentation && typeof field.presentation === "object" ? field.presentation : {};
  const acceptedMimeTypes = Array.isArray(presentation.acceptedMimeTypes)
    ? presentation.acceptedMimeTypes.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  switch (type) {
    case "text":
    case "textarea":
      return contentShape("text");
    case "list":
      return contentShape("text", "many");
    case "number":
      return controlShape("number");
    case "boolean":
      return controlShape("boolean");
    case "select":
      return controlShape(
        "selection",
        "one",
        Array.isArray(field.options)
          ? field.options.filter((value: unknown) => typeof value === "string")
          : undefined,
      );
    case "multiselect":
      return controlShape(
        "selection",
        "many",
        Array.isArray(field.options)
          ? field.options.filter((value: unknown) => typeof value === "string")
          : undefined,
      );
    case "datetime":
      return controlShape("datetime");
    case "url":
      return controlShape("url");
    case "approval":
      return controlShape("approval");
    case "thumbnail_layout":
      return controlShape("thumbnail_layout");
    case "image":
      return contentShape("image", "one", "artifact", acceptedMimeTypes);
    case "audio":
      return contentShape("audio", "one", "artifact", acceptedMimeTypes);
    case "video":
      return contentShape("video", "one", "artifact", acceptedMimeTypes);
    case "records": {
      if (!allowRecord) return undefined;
      const fields = Array.isArray(field.recordFields) ? field.recordFields : [];
      if (!fields.length) {
        diagnostic(
          context,
          fieldPath,
          "records legado sem recordFields não pode ser convertido com segurança.",
        );
        return undefined;
      }
      const converted = fields.flatMap((recordField: unknown, index: number) => {
        if (!recordField || typeof recordField !== "object") return [];
        const entry = recordField as JsonObject;
        const shape = legacyRecordFieldShape(entry, `${fieldPath}.recordFields.${index}`, context);
        if (!shape) return [];
        return [
          {
            id: String(entry.id ?? `field-${index}`),
            label: String(entry.label ?? entry.key ?? `Campo ${index + 1}`),
            key: String(entry.key ?? ""),
            shape,
            required: Boolean(entry.required),
          },
        ];
      });
      if (converted.length !== fields.length) return undefined;
      return { kind: "record", cardinality: "many", fields: converted };
    }
    case "file":
    case "files": {
      const cardinality = type === "files" ? "many" : "one";
      const itemType = presentation.itemType;
      if (itemType === "image" || itemType === "audio" || itemType === "video") {
        return contentShape(itemType, cardinality, "artifact", acceptedMimeTypes);
      }
      const family = familyFromMimeTypes(acceptedMimeTypes);
      if (family) return contentShape(family, cardinality, "artifact", acceptedMimeTypes);
      diagnostic(
        context,
        fieldPath,
        `${type} legado sem família material comprovável; é necessário resolver pela porta do plugin ou MIME.`,
      );
      return undefined;
    }
    default:
      diagnostic(context, fieldPath, `Tipo legado desconhecido: ${type || "(ausente)"}.`);
      return undefined;
  }
}

function legacyCompatibleWithShape(field: JsonObject, shape: ValueShape) {
  const type = field.type;
  if (!type) return true;
  if (type === "file")
    return (
      shape.kind === "content" && shape.cardinality === "one" && shape.representation !== "inline"
    );
  if (type === "files")
    return (
      shape.kind === "content" && shape.cardinality === "many" && shape.representation !== "inline"
    );
  if (type === "text" || type === "textarea")
    return shape.kind === "content" && shape.family === "text" && shape.cardinality === "one";
  if (type === "list")
    return shape.kind === "content" && shape.family === "text" && shape.cardinality === "many";
  if (type === "image" || type === "audio" || type === "video") {
    return shape.kind === "content" && shape.family === type && shape.cardinality === "one";
  }
  if (type === "records") return shape.kind === "record" && shape.cardinality === "many";
  if (type === "number") return shape.kind === "control" && shape.control === "number";
  if (type === "boolean") return shape.kind === "control" && shape.control === "boolean";
  if (type === "select")
    return shape.kind === "control" && shape.control === "selection" && shape.cardinality === "one";
  if (type === "multiselect")
    return (
      shape.kind === "control" && shape.control === "selection" && shape.cardinality === "many"
    );
  if (type === "datetime" || type === "url" || type === "approval" || type === "thumbnail_layout") {
    return shape.kind === "control" && shape.control === type;
  }
  return false;
}

function capabilityKey(pluginId: string, capabilityId: string) {
  return `${pluginId}\u0000${capabilityId}`;
}

function migrationPortCompatible(source: ValueShape, target: ValueShape) {
  if (areValueShapesCompatible(source, target)) return true;
  if (
    source.kind === "content" &&
    target.kind === "content" &&
    source.family === target.family &&
    source.cardinality === target.cardinality &&
    source.representation === target.representation &&
    !source.formats &&
    Boolean(target.formats)
  ) {
    return true;
  }
  return false;
}

function resolvePortShape(
  block: JsonObject,
  field: JsonObject,
  direction: "input" | "output",
  desiredShape: ValueShape | undefined,
  fieldPath: string,
  context: MigrationContext,
  usedPorts: ReadonlySet<string> = new Set(),
) {
  const plugin = block.plugin;
  if (!plugin?.pluginId || !plugin?.capabilityId) return undefined;
  const capability = context.capabilities.get(capabilityKey(plugin.pluginId, plugin.capabilityId));
  if (!capability) {
    diagnostic(
      context,
      `${fieldPath}.portKey`,
      `Plugin/capability atual não encontrado: ${plugin.pluginId}/${plugin.capabilityId}.`,
    );
    return undefined;
  }
  const ports = direction === "input" ? capability.inputPorts : capability.outputPorts;
  if (field.portKey) {
    const port = ports.find((candidate) => candidate.key === field.portKey);
    if (
      port &&
      !usedPorts.has(port.key) &&
      (!desiredShape || migrationPortCompatible(desiredShape, port.shape))
    ) {
      return clone(port.shape);
    }
  }

  const candidates = ports.filter(
    (port) =>
      !usedPorts.has(port.key) &&
      (desiredShape
        ? migrationPortCompatible(desiredShape, port.shape)
        : legacyCompatibleWithShape(field, port.shape)),
  );
  if (candidates.length === 1) {
    field.portKey = candidates[0].key;
    return clone(candidates[0].shape);
  }
  if (candidates.length > 1) {
    diagnostic(
      context,
      `${fieldPath}.portKey`,
      "Mais de uma porta atual é compatível com o campo legado.",
    );
  } else {
    diagnostic(
      context,
      `${fieldPath}.portKey`,
      `Nenhuma porta atual é compatível com o campo legado (${plugin.pluginId}/${plugin.capabilityId}; shape=${JSON.stringify(desiredShape ?? null)}; portas=${JSON.stringify(ports.map((port) => ({ key: port.key, shape: port.shape })))}).`,
    );
  }
  return undefined;
}

function exactCurrentPortShape(
  block: JsonObject,
  field: JsonObject,
  direction: "input" | "output",
  context: MigrationContext,
) {
  const plugin = block.plugin;
  if (!plugin?.pluginId || !plugin?.capabilityId || !field.portKey) return undefined;
  const capability = context.capabilities.get(capabilityKey(plugin.pluginId, plugin.capabilityId));
  if (!capability) return undefined;
  const ports = direction === "input" ? capability.inputPorts : capability.outputPorts;
  const port = ports.find((candidate) => candidate.key === field.portKey);
  return port ? clone(port.shape) : undefined;
}

function exactVersionedPortShape(
  block: JsonObject,
  field: JsonObject,
  direction: "input" | "output",
  context: MigrationContext,
) {
  const plugin = block.plugin;
  if (!plugin?.pluginId || !plugin?.capabilityId || !plugin?.pluginVersion || !field.portKey) {
    return undefined;
  }
  const capability = context.capabilities.get(capabilityKey(plugin.pluginId, plugin.capabilityId));
  if (!capability || capability.pluginVersion !== plugin.pluginVersion) return undefined;
  const ports = direction === "input" ? capability.inputPorts : capability.outputPorts;
  const port = ports.find((candidate) => candidate.key === field.portKey);
  return port ? clone(port.shape) : undefined;
}

function applyTerminalOutputShapeEvidence(
  method: JsonObject,
  execution: JsonObject,
  context: MigrationContext,
) {
  const next = clone(method);
  const blockExecutions = new Map(
    (Array.isArray(execution.blocks) ? execution.blocks : []).map((block: JsonObject) => [
      block.blockId,
      block,
    ]),
  );
  for (const block of Array.isArray(next.blocks) ? next.blocks : []) {
    if (!block.plugin) continue;
    const blockExecution = blockExecutions.get(block.id);
    if (!blockExecution?.values || typeof blockExecution.values !== "object") continue;
    for (const output of Array.isArray(block.outputs) ? block.outputs : []) {
      const exactShape = exactVersionedPortShape(block, output, "output", context);
      const value = blockExecution.values[output.key];
      if (!exactShape || value === undefined || !runtimeValueMatchesShape(exactShape, value))
        continue;
      output.shape = exactShape;
    }
  }
  return next;
}

const PROCESS_OUTPUT_KEYS: Record<(typeof PROCESS_TYPES)[number], string> = {
  theme: "theme",
  title: "title",
  thumbnail: "thumbnail",
  script: "script",
  narration: "audio",
  assets: "assets",
  editing: "video",
  publishing: "url",
};

function soleBlockOutputKey(method: JsonObject, blockId: string) {
  const block = Array.isArray(method.blocks)
    ? method.blocks.find((candidate: JsonObject) => candidate.id === blockId)
    : undefined;
  const outputs = Array.isArray(block?.outputs) ? block.outputs : [];
  return outputs.length === 1 && typeof outputs[0]?.key === "string" ? outputs[0].key : undefined;
}

function publishingInputFallback(input: JsonObject) {
  const label = String(input.label ?? "").toLowerCase();
  if (label.includes("título") || label.includes("titulo")) {
    return { kind: "previous_process", processType: "title", outputKey: "title" };
  }
  if (label.includes("thumbnail")) {
    return { kind: "previous_process", processType: "thumbnail", outputKey: "thumbnail" };
  }
  if (label.includes("vídeo") || label.includes("video") || label.includes("editado")) {
    return { kind: "previous_process", processType: "editing", outputKey: "video" };
  }
  return undefined;
}

function canonicalBinding(
  method: JsonObject,
  input: JsonObject,
  inputPath: string,
  context: MigrationContext,
) {
  if (input.binding && typeof input.binding === "object") return clone(input.binding);
  const nonEmpty = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : undefined;
  switch (input.source) {
    case "project":
      if (input.sourceKey === "title" || input.sourceKey === "deadline") {
        return { kind: "project", key: input.sourceKey };
      }
      break;
    case "previous_process": {
      const processType = nonEmpty(input.sourceProcessType);
      const outputKey =
        nonEmpty(input.sourceKey) ??
        (processType && PROCESS_TYPES.includes(processType as (typeof PROCESS_TYPES)[number])
          ? PROCESS_OUTPUT_KEYS[processType as (typeof PROCESS_TYPES)[number]]
          : undefined);
      if (
        outputKey &&
        processType &&
        PROCESS_TYPES.includes(processType as (typeof PROCESS_TYPES)[number])
      ) {
        const blockId = nonEmpty(input.blockId);
        return {
          kind: "previous_process",
          processType,
          outputKey,
          ...(blockId && blockId !== "__process_output__" ? { blockId } : {}),
        };
      }
      break;
    }
    case "previous_block": {
      const blockId = nonEmpty(input.blockId);
      const outputKey =
        nonEmpty(input.sourceKey) ?? (blockId ? soleBlockOutputKey(method, blockId) : undefined);
      if (blockId && outputKey) return { kind: "previous_block", blockId, outputKey };
      const fallback = publishingInputFallback(input);
      if (fallback) return fallback;
      break;
    }
    case "channel_history": {
      const blockId = nonEmpty(input.blockId);
      const outputKey = nonEmpty(input.sourceKey);
      const processType = nonEmpty(input.sourceProcessType);
      if (
        blockId &&
        outputKey &&
        processType &&
        PROCESS_TYPES.includes(processType as (typeof PROCESS_TYPES)[number])
      ) {
        return {
          kind: "channel_history",
          processType,
          blockId,
          outputKey,
          limit: Math.min(100, Math.max(1, Number(input.historyLimit ?? 10))),
          eligibility: input.historyEligibility === "published" ? "published" : "completed",
        };
      }
      break;
    }
    case "channel_library": {
      const collectionId = nonEmpty(input.collection ?? input.collectionId);
      const fieldId = nonEmpty(input.sourceKey ?? input.fieldId);
      if (collectionId && fieldId) return { kind: "channel_library", collectionId, fieldId };
      break;
    }
    case "runtime":
      return { kind: "runtime" };
    case "static":
      if (typeof input.staticValue === "string")
        return { kind: "static", value: input.staticValue };
      break;
  }
  diagnostic(
    context,
    `${inputPath}.binding`,
    "Origem legada do input não pode ser materializada sem ambiguidade.",
  );
  return undefined;
}

function sourceSelectionBlock(method: JsonObject, input: JsonObject) {
  if (input.source !== "previous_block" || input.sourceKey || !input.blockId) return undefined;
  const sourceBlock = (method.blocks ?? []).find(
    (candidate: JsonObject) => candidate.id === input.blockId,
  );
  return sourceBlock?.type === "ESCOLHER" && sourceBlock.collectionId ? sourceBlock : undefined;
}

function collectionFieldShape(
  collectionId: string,
  field: JsonObject,
  fieldPath: string,
  context: MigrationContext,
) {
  if (
    field.shape &&
    typeof field.shape === "object" &&
    !validateValueShape(field.shape as ValueShape).length
  ) {
    return clone(field.shape) as ValueShape;
  }
  return legacyShape(
    field,
    `${fieldPath}.collection.${collectionId}.${field.id ?? "field"}`,
    context,
    false,
  );
}

function expandLegacySelectionInputs(
  method: JsonObject,
  inputs: JsonObject[],
  blockPath: string,
  context: MigrationContext,
) {
  return inputs.flatMap((input, inputIndex) => {
    const sourceBlock = sourceSelectionBlock(method, input);
    if (!sourceBlock) return [input];
    const collection = context.collections.get(sourceBlock.collectionId);
    const fields = Array.isArray(collection?.fields) ? collection.fields : [];
    if (!fields.length) {
      diagnostic(
        context,
        `${blockPath}.inputs.${inputIndex}.binding`,
        `ESCOLHER legado aponta para coleção ausente ou sem campos: ${sourceBlock.collectionId}.`,
      );
      return [input];
    }
    return fields.flatMap((field: JsonObject, fieldIndex: number) => {
      const shape = collectionFieldShape(
        sourceBlock.collectionId,
        field,
        `${blockPath}.inputs.${inputIndex}`,
        context,
      );
      if (!shape) return [];
      return [
        {
          ...clone(input),
          id: `${input.id}:collection-field:${field.id}`,
          label: String(field.label ?? input.label ?? `Campo ${fieldIndex + 1}`),
          sourceKey: String(field.id),
          shape,
          ...(fieldIndex === 0 && input.portKey
            ? { portKey: input.portKey }
            : { portKey: undefined }),
        },
      ];
    });
  });
}

function shapeWithCardinality(shape: ValueShape, cardinality: "one" | "many"): ValueShape {
  return { ...clone(shape), cardinality } as ValueShape;
}

function shapeFromBinding(
  method: JsonObject,
  binding: JsonObject | undefined,
  context: MigrationContext,
  fieldPath: string,
) {
  if (!binding) return undefined;
  if (binding.kind === "previous_block") {
    const declared = methodOutputShape(method, binding.blockId, binding.outputKey);
    if (declared) return declared;
    const sourceBlock = (method.blocks ?? []).find(
      (candidate: JsonObject) => candidate.id === binding.blockId,
    );
    if (sourceBlock?.type === "ESCOLHER" && sourceBlock.collectionId) {
      const collection = context.collections.get(sourceBlock.collectionId);
      const field = collection?.fields?.find(
        (candidate: JsonObject) => candidate.id === binding.outputKey,
      );
      if (field) return collectionFieldShape(sourceBlock.collectionId, field, fieldPath, context);
    }
    return undefined;
  }
  if (binding.kind === "previous_process") {
    return processOutputShape(binding.processType, binding.outputKey);
  }
  if (binding.kind === "channel_history") {
    const valueShape =
      binding.outputKey === "selectedItemId"
        ? controlShape("identifier")
        : processOutputShape(binding.processType, binding.outputKey);
    return valueShape ? historyShape(valueShape) : undefined;
  }
  if (binding.kind === "project") {
    return binding.key === "deadline" ? controlShape("datetime") : contentShape("text");
  }
  if (binding.kind === "static") return contentShape("text");
  return undefined;
}

function inferManualFileShape(method: JsonObject, block: JsonObject, field: JsonObject) {
  if (field.type !== "files") return undefined;
  const evidence =
    `${method.processType ?? ""} ${block.name ?? ""} ${block.instructions ?? ""} ${field.key ?? ""} ${field.label ?? ""}`.toLowerCase();
  if (/gravação de tela|gravacao de tela|vídeo|video/.test(evidence)) {
    return contentShape("video", "many", "artifact");
  }
  if (/imagem|image|thumbnail/.test(evidence)) {
    return contentShape("image", "many", "artifact");
  }
  return undefined;
}

function normalizePluginConfiguration(block: JsonObject) {
  if (!block.plugin?.configuration || typeof block.plugin.configuration !== "object") return;
  const configuration = block.plugin.configuration as JsonObject;
  if (Array.isArray(configuration.fallbackAccountProfiles)) {
    configuration.fallbackAccountProfiles = configuration.fallbackAccountProfiles
      .filter((value: unknown): value is string => typeof value === "string")
      .join("\n");
  }
}

function stripLegacyFieldKeys(field: JsonObject) {
  for (const key of LEGACY_FIELD_KEYS) delete field[key];
  if (field.presentation) field.presentation = cleanPresentation(field.presentation);
  if (!field.presentation) delete field.presentation;
}

function methodOutputShape(method: JsonObject, blockId: string, outputKey: string) {
  const block = Array.isArray(method.blocks)
    ? method.blocks.find((candidate: JsonObject) => candidate.id === blockId)
    : undefined;
  const output = block?.outputs?.find((candidate: JsonObject) => candidate.key === outputKey);
  return output?.shape as ValueShape | undefined;
}

export function convertLegacyMethod(
  source: JsonObject,
  methodPath: string,
  context: MigrationContext,
  options: { enforceCurrentPluginPorts?: boolean } = {},
) {
  // Current contracts already declare their semantics. Legacy inference must
  // never reinterpret a valid v3 draft or a frozen execution snapshot.
  if (workspaceMethodV3Schema.safeParse(source).success) return clone(source);
  const method = clone(source);
  const enforceCurrentPluginPorts =
    options.enforceCurrentPluginPorts !== false && source.contractVersion !== 3;
  const blocks = Array.isArray(method.blocks) ? method.blocks : [];
  method.blocks = blocks;
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = `${methodPath}.blocks.${blockIndex}`;
    block.parameters = Array.isArray(block.parameters) ? block.parameters : [];
    block.order = blockIndex;
    block.name = typeof block.name === "string" && block.name.trim() ? block.name : block.type;
    block.instructions = typeof block.instructions === "string" ? block.instructions : "";
    normalizePluginConfiguration(block);
    const outputs = Array.isArray(block.outputs) ? block.outputs : [];
    block.outputs = outputs;
    for (const [index, output] of outputs.entries()) {
      const outputPath = `${blockPath}.outputs.${index}`;
      const exactOutputPortShape =
        block.plugin && enforceCurrentPluginPorts
          ? exactCurrentPortShape(block, output, "output", context)
          : undefined;
      const existingPortShape =
        exactOutputPortShape &&
        (output.shape
          ? migrationPortCompatible(output.shape as ValueShape, exactOutputPortShape)
          : legacyCompatibleWithShape(output, exactOutputPortShape) ||
            (["file", "files"].includes(String(output.type ?? "")) &&
              exactOutputPortShape.kind === "record"))
          ? exactOutputPortShape
          : undefined;
      const legacyOutputShape =
        existingPortShape ??
        inferManualFileShape(method, block, output) ??
        legacyShape(output, outputPath, context);
      const portShape =
        block.plugin && enforceCurrentPluginPorts
          ? resolvePortShape(block, output, "output", legacyOutputShape, outputPath, context)
          : undefined;
      const shape = portShape ?? legacyOutputShape;
      if (shape) output.shape = shape;
      stripLegacyFieldKeys(output);
    }

    const inputs = expandLegacySelectionInputs(
      method,
      Array.isArray(block.inputs) ? block.inputs : [],
      blockPath,
      context,
    );
    block.inputs = inputs;
    const usedInputPorts = new Set<string>();
    for (const [index, input] of inputs.entries()) {
      const inputPath = `${blockPath}.inputs.${index}`;
      const binding = canonicalBinding(method, input, inputPath, context);
      if (binding) input.binding = binding;
      const boundShape = shapeFromBinding(method, binding, context, inputPath);
      const existingPortShape =
        block.plugin && enforceCurrentPluginPorts
          ? exactCurrentPortShape(block, input, "input", context)
          : undefined;
      const legacyInputShape =
        boundShape || existingPortShape ? undefined : legacyShape(input, inputPath, context);
      let shape = boundShape ?? legacyInputShape;
      if (block.plugin && enforceCurrentPluginPorts) {
        const portShape = resolvePortShape(
          block,
          input,
          "input",
          shape,
          inputPath,
          context,
          usedInputPorts,
        );
        if (portShape) {
          shape = portShape;
          if (input.portKey) usedInputPorts.add(input.portKey);
        }
      }
      if (shape) input.shape = clone(shape);
      stripLegacyFieldKeys(input);
    }

    if (block.type === "VALIDAR" && block.validation) {
      const validation = block.validation;
      if (!validation.targetBlockId) {
        const target = [...blocks.slice(0, blockIndex)]
          .reverse()
          .find((candidate) => candidate.type !== "VALIDAR");
        if (target) validation.targetBlockId = target.id;
        else
          diagnostic(
            context,
            `${blockPath}.validation.targetBlockId`,
            "VALIDAR sem alvo histórico recuperável.",
          );
      }
      if (validation.mode !== "approval" && !validation.targetOutputKey) {
        const target = blocks
          .slice(0, blockIndex)
          .find((candidate) => candidate.id === validation.targetBlockId);
        const candidates = (target?.outputs ?? []).filter(
          (output: JsonObject) => output.shape?.cardinality === "many",
        );
        if (candidates.length === 1) validation.targetOutputKey = candidates[0].key;
        else {
          diagnostic(
            context,
            `${blockPath}.validation.targetOutputKey`,
            "Seleção histórica sem uma única saída colecionável comprovável.",
          );
        }
      }
    }
  }

  method.contractVersion = 3;
  if (!method.name) method.name = `Método de ${method.processType ?? "processo"}`;

  if (blocks.length) {
    const parsed = processMethodV3Schema.safeParse(method);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostic(context, `${methodPath}.${issue.path.join(".")}`, issue.message);
      }
    }
  }
  return method;
}

function convertMethodRecord(methods: unknown, basePath: string, context: MigrationContext) {
  if (!methods || typeof methods !== "object") return methods;
  const result = clone(methods as JsonObject);
  for (const processType of PROCESS_TYPES) {
    const method = result[processType];
    if (!method || typeof method !== "object") continue;
    result[processType] = convertLegacyMethod(method, `${basePath}.${processType}`, context);
  }
  return result;
}

function convertChannel(channel: JsonObject, rowPath: string, context: MigrationContext) {
  const next = clone(channel);
  next.methods = convertMethodRecord(next.methods, `${rowPath}.methods`, context);
  return next;
}

function convertProject(project: JsonObject, rowPath: string, context: MigrationContext) {
  const next = clone(project);
  if (next.strategySnapshot?.methods) {
    next.strategySnapshot.methods = convertMethodRecord(
      next.strategySnapshot.methods,
      `${rowPath}.strategySnapshot.methods`,
      context,
    );
  }
  return next;
}

function processOutputShape(processType: string, key: string): ValueShape | undefined {
  if (processType === "theme" || processType === "title" || processType === "script")
    return contentShape("text");
  if (processType === "thumbnail") return contentShape("image");
  if (processType === "narration") return contentShape("audio");
  if (processType === "editing") return contentShape("video");
  if (processType === "publishing") return controlShape("url");
  if (processType === "assets") {
    if (/video/i.test(key)) return contentShape("video", "many");
    if (/image|asset/i.test(key)) return contentShape("image", "many");
  }
  return undefined;
}

function convertDelivery(
  delivery: JsonObject,
  execution: JsonObject,
  deliveryPath: string,
  context: MigrationContext,
) {
  const next = clone(delivery);
  let shape = methodOutputShape(execution.methodSnapshot ?? {}, next.blockId, next.outputKey);
  if (shape && Array.isArray(next.items) && next.items.length) {
    const materializedValue =
      shape.cardinality === "many"
        ? next.items.map((item: JsonObject) => item.value)
        : next.items[0]?.value;
    if (runtimeValueMatchesShape(shape, materializedValue)) {
      next.shape = clone(shape);
    }
  }
  if (!next.shape) {
    shape ??= processOutputShape(execution.processType, next.outputKey);
    if (!shape && next.type) {
      shape = legacyShape(
        { type: next.type === "files" && next.cardinality === "one" ? "file" : next.type },
        deliveryPath,
        context,
      );
    }
    if (shape) next.shape = clone(shape);
  }
  delete next.type;
  delete next.cardinality;
  return next;
}

export function convertExecution(
  execution: JsonObject,
  rowPath: string,
  context: MigrationContext,
) {
  const next = clone(execution);
  if (next.methodSnapshot) {
    const terminal = next.status === "completed" || next.status === "cancelled";
    const snapshot = terminal
      ? applyTerminalOutputShapeEvidence(next.methodSnapshot, next, context)
      : next.methodSnapshot;
    next.methodSnapshot = convertLegacyMethod(snapshot, `${rowPath}.methodSnapshot`, context, {
      enforceCurrentPluginPorts: next.status !== "completed" && next.status !== "cancelled",
    });
  }
  if (Array.isArray(next.deliveries)) {
    next.deliveries = next.deliveries.map((delivery: JsonObject, index: number) =>
      convertDelivery(delivery, next, `${rowPath}.deliveries.${index}`, context),
    );
  }
  return next;
}

function convertCollection(collection: JsonObject, rowPath: string, context: MigrationContext) {
  const next = clone(collection);
  if (Array.isArray(next.fields)) {
    next.fields = next.fields.map((field: JsonObject, index: number) => {
      const converted = clone(field);
      if (!converted.shape) {
        const shape = legacyShape(converted, `${rowPath}.fields.${index}`, context, false);
        if (shape) converted.shape = shape;
      }
      delete converted.type;
      delete converted.options;
      return converted;
    });
  }
  return next;
}

function parseJson(raw: string, rowPath: string, context: MigrationContext) {
  try {
    return JSON.parse(raw) as JsonObject;
  } catch {
    diagnostic(context, rowPath, "Payload JSON inválido.");
    return undefined;
  }
}

function readLinkDirectory(directory: string) {
  if (!existsSync(directory)) return [] as string[];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const parsed = JSON.parse(readFileSync(path.join(directory, name), "utf8"));
        return typeof parsed.path === "string" ? [parsed.path] : [];
      } catch {
        return [];
      }
    });
}

function readInstalledDirectories(directory: string) {
  if (!existsSync(directory)) return [] as string[];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name));
}

export function loadCurrentPluginCapabilities(dataDirectory: string) {
  const roots = [
    ...readLinkDirectory(path.join(dataDirectory, "plugins", "development")),
    ...readInstalledDirectories(path.join(dataDirectory, "plugins", "installed")),
  ];
  const capabilities = new Map<string, PluginCapability>();
  for (const root of roots) {
    const manifestPath = path.join(root, "contentflow.plugin.json");
    if (!existsSync(manifestPath)) continue;
    let manifest: JsonObject;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (manifest.apiVersion !== "2" || typeof manifest.id !== "string") continue;
    for (const capability of Array.isArray(manifest.capabilities) ? manifest.capabilities : []) {
      if (!capability || typeof capability !== "object" || typeof capability.id !== "string")
        continue;
      capabilities.set(capabilityKey(manifest.id, capability.id), {
        pluginId: manifest.id,
        pluginVersion: String(manifest.version ?? ""),
        capabilityId: capability.id,
        inputPorts: Array.isArray(capability.inputPorts) ? clone(capability.inputPorts) : [],
        outputPorts: Array.isArray(capability.outputPorts) ? clone(capability.outputPorts) : [],
      });
    }
  }
  return capabilities;
}

type TableConversion = {
  table: string;
  convert: (payload: JsonObject, pathValue: string, context: MigrationContext) => JsonObject;
};

const TABLE_CONVERSIONS: TableConversion[] = [
  { table: "channels", convert: convertChannel },
  { table: "projects", convert: convertProject },
  { table: "process_executions", convert: convertExecution },
  { table: "library_collections", convert: convertCollection },
];

function tableExists(database: Database.Database, table: string) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

// A logical snapshot covers operational tables too, without exposing private payloads.
function databaseFingerprint(database: Database.Database) {
  const hash = createHash("sha256");
  const tables = database
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string; sql: string }>;
  for (const table of tables) {
    hash.update(JSON.stringify(table));
    const name = table.name.replaceAll('"', '""');
    const rows = database
      .prepare(`SELECT * FROM "${name}"`)
      .all()
      .map((row) => JSON.stringify(row))
      .sort();
    for (const row of rows) hash.update(row);
  }
  return hash.digest("hex");
}

export class UpgradeError extends Error {
  constructor(
    public code: string,
    public backupPath?: string,
  ) {
    super(code);
  }
}

export function planDatabaseMigration(database: Database.Database, dataDirectory: string) {
  const collections = new Map<string, JsonObject>();
  if (tableExists(database, "library_collections")) {
    for (const row of database
      .prepare('SELECT id, payload FROM "library_collections" ORDER BY id')
      .all() as Array<{ id: string; payload: string }>) {
      try {
        collections.set(row.id, JSON.parse(row.payload) as JsonObject);
      } catch {
        // The normal table scan records the precise invalid-payload diagnostic.
      }
    }
  }
  const context: MigrationContext = {
    capabilities: loadCurrentPluginCapabilities(dataDirectory),
    collections,
    diagnostics: [],
  };
  const updates: Array<{ table: string; id: string; before: string; after: string }> = [];
  const scanned: Record<string, number> = {};

  for (const definition of TABLE_CONVERSIONS) {
    if (!tableExists(database, definition.table)) continue;
    const rows = database
      .prepare(`SELECT id, payload FROM "${definition.table}" ORDER BY id`)
      .all() as Array<{ id: string; payload: string }>;
    scanned[definition.table] = rows.length;
    for (const row of rows) {
      const rowPath = `${definition.table}.${row.id}`;
      const payload = parseJson(row.payload, rowPath, context);
      if (!payload) continue;
      const converted = definition.convert(payload, rowPath, context);
      const after = JSON.stringify(converted);
      if (after !== JSON.stringify(payload))
        updates.push({ table: definition.table, id: row.id, before: row.payload, after });
    }
  }
  return { context, updates, scanned };
}

export async function verifiedUserDataBackup(database: Database.Database, dataDirectory: string) {
  const backupDirectory = path.join(dataDirectory, "migration-backups");
  mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupDirectory,
    `contentflow-before-user-data-v3-${stamp}-${randomUUID()}.sqlite`,
  );
  await database.backup(backupPath);
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma("integrity_check", { simple: true }) !== "ok")
      throw new UpgradeError("BACKUP_INVALID");
    if (databaseFingerprint(backup) !== databaseFingerprint(database))
      throw new UpgradeError("PLAN_CHANGED");
  } finally {
    backup.close();
  }
  const sha256 = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
  writeFileSync(
    `${backupPath}.json`,
    JSON.stringify(
      {
        formatVersion: 1,
        migration: "user-data-v3",
        createdAt: new Date().toISOString(),
        sha256,
        backupFile: path.basename(backupPath),
        recovery:
          "Stop ContentFlow. Verify SHA-256. Preserve current data directory. Restore this SQLite backup into a separate copy of that directory without copying -wal/-shm files. Keep uploads, plugins, profiles and workspaces unchanged. Open the copy with the matching application/plugin versions.",
      },
      null,
      2,
    ),
    "utf8",
  );
  return backupPath;
}

function commitMigration(
  database: Database.Database,
  dataDirectory: string,
  plan: ReturnType<typeof planDatabaseMigration>,
) {
  database
    .transaction(() => {
      for (const update of plan.updates) {
        const result = database
          .prepare(`UPDATE "${update.table}" SET payload = ? WHERE id = ? AND payload = ?`)
          .run(update.after, update.id, update.before);
        if (result.changes !== 1) throw new UpgradeError("PLAN_CHANGED");
      }
      const afterPlan = planDatabaseMigration(database, dataDirectory);
      if (afterPlan.context.diagnostics.length || afterPlan.updates.length)
        throw new UpgradeError("POST_VALIDATION_FAILED");
      if (tableExists(database, "state_clock"))
        database.prepare("UPDATE state_clock SET revision = revision + 1 WHERE id = 1").run();
    })
    .immediate();
}

export async function migrateDatabase(dataDirectory: string, apply: boolean) {
  const databasePath = path.join(dataDirectory, "contentflow.sqlite");
  if (!existsSync(databasePath)) throw new Error(`Banco não encontrado: ${databasePath}`);
  const database = new Database(databasePath);
  database.pragma("busy_timeout = 5000");
  try {
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Banco atual falhou no integrity_check: ${integrity}`);
    const plan = planDatabaseMigration(database, dataDirectory);
    if (plan.context.diagnostics.length) {
      return { applied: false, backupPath: undefined, ...plan };
    }
    if (!apply || !plan.updates.length) {
      return { applied: false, backupPath: undefined, ...plan };
    }

    const fingerprint = databaseFingerprint(database);
    const backupPath = await verifiedUserDataBackup(database, dataDirectory);
    if (databaseFingerprint(database) !== fingerprint) throw new UpgradeError("PLAN_CHANGED");
    commitMigration(database, dataDirectory, plan);
    const afterPlan = planDatabaseMigration(database, dataDirectory);
    return { applied: true, backupPath, ...plan, afterPlan };
  } finally {
    database.close();
  }
}

export function jobHasCurrentContract(job: PersistentPluginJob) {
  const request = job.request;
  return Boolean(
    request &&
    Array.isArray(request.inputContract) &&
    Array.isArray(request.outputContract) &&
    [...request.inputContract, ...request.outputContract].every(
      (field) =>
        field &&
        typeof field.portKey === "string" &&
        valueShapeSchema.safeParse(field.shape).success,
    ),
  );
}

export class UserDataUpgrade {
  applying = false;
  private revision = -1;
  private required = true;
  private readonly inspectedPlans = new Set<string>();
  constructor(
    private database: Database.Database,
    private dataDirectory: string,
    private isIdle: () => boolean = () => true,
  ) {
    this.plan();
  }

  private currentRevision() {
    return (this.database.prepare("SELECT total_changes() AS changes").get() as { changes: number })
      .changes;
  }
  state() {
    if (this.currentRevision() !== this.revision && !this.applying) this.plan();
    return { required: this.required, applying: this.applying };
  }
  backgroundAllowed() {
    const state = this.state();
    return !state.required && !state.applying;
  }
  hasHistoricalJobs() {
    if (!tableExists(this.database, "plugin_jobs")) return false;
    return (
      this.database.prepare("SELECT payload FROM plugin_jobs").all() as Array<{ payload: string }>
    ).some((row) => {
      try {
        return !jobHasCurrentContract(JSON.parse(row.payload));
      } catch {
        return true;
      }
    });
  }
  executionHasHistoricalJobs(executionId: string) {
    if (!tableExists(this.database, "plugin_jobs")) return false;
    return (
      this.database
        .prepare("SELECT payload FROM plugin_jobs WHERE execution_id = ?")
        .all(executionId) as Array<{ payload: string }>
    ).some((row) => {
      try {
        return !jobHasCurrentContract(JSON.parse(row.payload));
      } catch {
        return true;
      }
    });
  }
  claimCompatibleJob(store: PluginJobStore) {
    if (!this.backgroundAllowed()) return undefined;
    const now = new Date();
    const rows = this.database
      .prepare(
        `SELECT id, payload FROM plugin_jobs
      WHERE status IN ('starting','pending','cancel_requested') AND next_poll_at <= ?
      AND (lease_until IS NULL OR lease_until <= ?) ORDER BY next_poll_at, created_at`,
      )
      .all(now.toISOString(), now.toISOString()) as Array<{ id: string; payload: string }>;
    for (const row of rows) {
      let job: PersistentPluginJob;
      try {
        job = JSON.parse(row.payload);
      } catch {
        continue;
      }
      if (!jobHasCurrentContract(job)) continue;
      const claim = store.claim(row.id, now);
      if (claim) return claim;
    }
    return undefined;
  }
  plan() {
    const plan = planDatabaseMigration(this.database, this.dataDirectory);
    const planId = createHash("sha256")
      .update(databaseFingerprint(this.database))
      .update(JSON.stringify([...plan.context.capabilities]))
      .update(JSON.stringify(plan.context.diagnostics))
      .update(JSON.stringify(plan.updates))
      .digest("hex");
    this.required = Boolean(plan.updates.length || plan.context.diagnostics.length);
    this.revision = this.currentRevision();
    this.inspectedPlans.add(planId);
    if (this.inspectedPlans.size > 32)
      this.inspectedPlans.delete(this.inspectedPlans.values().next().value!);
    return {
      planId,
      required: this.required,
      canApply: Boolean(plan.updates.length && !plan.context.diagnostics.length),
      pendingUpdates: plan.updates.length,
      scanned: plan.scanned,
      diagnostics: plan.context.diagnostics,
      currentPluginCapabilities: plan.context.capabilities.size,
      historicalJobsPreserved: this.hasHistoricalJobs(),
      guideUrl: "https://github.com/andremjr/contentflow/blob/v1.3.1/docs/UPGRADE_GUIDE_1_3_1.md",
      skillUrl:
        "https://github.com/andremjr/contentflow/blob/v1.3.1/ecosystem/skills/contentflow-method-development/SKILL.md",
    };
  }
  async apply(planId: string, confirmBackup: boolean) {
    if (!confirmBackup) throw new UpgradeError("BACKUP_CONFIRMATION_REQUIRED");
    if (this.applying || !this.isIdle()) throw new UpgradeError("UPGRADE_BUSY");
    if (!this.inspectedPlans.has(planId)) throw new UpgradeError("PLAN_CHANGED");
    const current = this.plan();
    if (current.planId !== planId) throw new UpgradeError("PLAN_CHANGED");
    if (!current.canApply) throw new UpgradeError("UPGRADE_AMBIGUOUS");
    this.applying = true;
    let backupPath: string | undefined;
    try {
      const plan = planDatabaseMigration(this.database, this.dataDirectory);
      backupPath = await verifiedUserDataBackup(this.database, this.dataDirectory);
      if (this.plan().planId !== planId) throw new UpgradeError("PLAN_CHANGED");
      commitMigration(this.database, this.dataDirectory, plan);
      return { applied: true, backupPath, plan: this.plan() };
    } catch (error) {
      throw new UpgradeError(
        error instanceof UpgradeError ? error.code : "UPGRADE_FAILED",
        backupPath,
      );
    } finally {
      this.applying = false;
    }
  }
}

export function registerUserDataUpgradeRoutes(app: Express, upgrade: UserDataUpgrade) {
  app.get("/api/upgrade/status", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(upgrade.state());
  });
  app.get("/api/upgrade/plan", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(upgrade.plan());
  });
  app.post("/api/upgrade/apply", async (request, response) => {
    try {
      response.json(
        await upgrade.apply(request.body?.planId, request.body?.confirmBackup === true),
      );
    } catch (error) {
      const failure = error instanceof UpgradeError ? error : new UpgradeError("UPGRADE_FAILED");
      response
        .status(409)
        .json({ code: failure.code, error: failure.code, backupPath: failure.backupPath });
    }
  });
  // Plugin administration remains available to install the current capability needed by a plan.
  app.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !request.path.startsWith("/api/"))
      return next();
    if (
      !upgrade.backgroundAllowed() &&
      !/^\/api\/channels\/(order|[^/]+\/preferences)$/.test(request.path)
    ) {
      response
        .status(409)
        .json({ code: "USER_DATA_UPGRADE_REQUIRED", error: "USER_DATA_UPGRADE_REQUIRED" });
      return;
    }
    next();
  });
}
