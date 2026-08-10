import { z } from "zod";
import type { ActionBlock, ProcessMethod, UniversalProcess } from "@/lib/domain";
import { normalizeFieldPresentation } from "@/lib/presentation";

const universalProcessSchema = z.enum([
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
]);

const parameterSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  key: z.string().max(200),
  type: z.enum(["text", "number", "select", "boolean", "textarea"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
  placeholder: z.string().max(500).optional(),
  options: z.array(z.string().max(500)).max(100).optional(),
});

const recordFieldSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  key: z.string().max(200),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "boolean",
    "select",
    "datetime",
    "url",
    "file",
    "image",
    "audio",
    "video",
  ]),
  required: z.boolean(),
  options: z.array(z.string().max(500)).max(100).optional(),
});

const presentationSchema = z.object({
  renderer: z.enum([
    "auto",
    "text-short",
    "text-long",
    "list",
    "tags",
    "table",
    "cards",
    "file-list",
    "image-gallery",
    "audio-player",
    "video-player",
    "decision",
  ]),
  itemType: z.enum(["text", "record", "file", "image", "audio", "video"]).optional(),
  acceptedMimeTypes: z.array(z.string().max(200)).max(50).optional(),
});

const inputSchema = z
  .object({
    id: z.string(),
    label: z.string().max(200),
    type: z
      .enum([
        "text",
        "number",
        "select",
        "boolean",
        "textarea",
        "multiselect",
        "list",
        "records",
        "datetime",
        "url",
        "file",
        "image",
        "audio",
        "video",
        "files",
        "approval",
        "thumbnail_layout",
      ])
      .default("text"),
    source: z.enum(["project", "previous_process", "previous_block", "channel_library", "static"]),
    sourceKey: z.string().max(200).optional(),
    blockId: z.string().optional(),
    collection: z.string().max(200).optional(),
    staticValue: z.string().max(10_000).optional(),
    recordFields: z.array(recordFieldSchema).max(100).optional(),
    presentation: presentationSchema.optional(),
  })
  .transform((input) => ({
    ...input,
    presentation: normalizeFieldPresentation(input.type, input.presentation),
  }));

const outputSchema = z
  .object({
    id: z.string(),
    label: z.string().max(200),
    key: z.string().max(200),
    type: z.enum([
      "text",
      "number",
      "select",
      "boolean",
      "textarea",
      "multiselect",
      "list",
      "records",
      "datetime",
      "url",
      "file",
      "image",
      "audio",
      "video",
      "files",
      "approval",
      "thumbnail_layout",
    ]),
    required: z.boolean(),
    placeholder: z.string().max(500).optional(),
    helpText: z.string().max(2_000).optional(),
    options: z.array(z.string().max(500)).max(100).optional(),
    optionsSourceBlockId: z.string().optional(),
    optionsSourceKey: z.string().max(200).optional(),
    recordFields: z.array(recordFieldSchema).max(100).optional(),
    presentation: presentationSchema.optional(),
  })
  .transform((output) => ({
    ...output,
    presentation: normalizeFieldPresentation(output.type, output.presentation),
  }));

const validationSchema = z.object({
  targetBlockId: z.string().optional(),
  targetOutputKey: z.string().max(200).optional(),
  mode: z.enum(["approval", "select_one", "select_many"]),
  onReject: z.enum(["retry_target", "pause"]),
  maxAttempts: z.number().int().min(1).max(20),
});

const actionBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]),
  operator: z.enum(["IA", "Humano", "Código"]),
  collectionId: z.string().optional(),
  name: z.string().max(200).optional(),
  instructions: z.string().max(20_000).optional(),
  inputs: z.array(inputSchema).max(100).optional(),
  outputs: z.array(outputSchema).max(100).optional(),
  validation: validationSchema.optional(),
  parameters: z.array(parameterSchema).max(100),
  order: z.number().int().nonnegative(),
});

const sharedMethodSchema = z.object({
  format: z.literal("contentflow-method"),
  version: z.literal(1),
  name: z.string().max(200),
  exportedAt: z.string(),
  method: z.object({
    processType: universalProcessSchema,
    blocks: z.array(actionBlockSchema).min(1).max(200),
  }),
});

export type SharedMethodFile = z.infer<typeof sharedMethodSchema>;

export function serializeMethodFile(name: string, method: ProcessMethod) {
  const file = sharedMethodSchema.parse({
    format: "contentflow-method",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    method,
  });
  return JSON.stringify(file, null, 2);
}

export function parseMethodFile(contents: string): SharedMethodFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }

  const result = sharedMethodSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Este não é um arquivo de método válido do ContentFlow OS.");
  }
  return result.data;
}

export function copyImportedBlocks(
  processType: UniversalProcess,
  sourceBlocks: ActionBlock[],
  createId: (prefix: string) => string,
) {
  const copied = structuredClone(sourceBlocks);
  const blockIds = new Map(
    copied.map((block) => [block.id, createId(`${processType}-${block.type.toLowerCase()}`)]),
  );
  return copied.map((block, order) => ({
    ...block,
    collectionId: undefined,
    id: blockIds.get(block.id)!,
    order,
    parameters: block.parameters.map((parameter) => ({
      ...parameter,
      id: createId(`${processType}-parameter`),
    })),
    inputs: block.inputs?.map((input) => ({
      ...input,
      id: createId(`${processType}-input`),
      recordFields: input.recordFields?.map((field) => ({
        ...field,
        id: createId(`${processType}-record-field`),
      })),
      blockId: input.blockId ? blockIds.get(input.blockId) : undefined,
    })),
    outputs: block.outputs?.map((output) => ({
      ...output,
      id: createId(`${processType}-output`),
      recordFields: output.recordFields?.map((field) => ({
        ...field,
        id: createId(`${processType}-record-field`),
      })),
      optionsSourceBlockId: output.optionsSourceBlockId
        ? blockIds.get(output.optionsSourceBlockId)
        : undefined,
    })),
    validation: block.validation
      ? {
          ...block.validation,
          targetBlockId: block.validation.targetBlockId
            ? blockIds.get(block.validation.targetBlockId)
            : undefined,
        }
      : undefined,
  }));
}
