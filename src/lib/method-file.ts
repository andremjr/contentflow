import { z } from "zod";
import type { ActionBlock, ProcessMethod, UniversalProcess } from "@/lib/domain";

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

const inputSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  source: z.enum(["project", "previous_block", "channel_library", "static"]),
  sourceKey: z.string().max(200).optional(),
  blockId: z.string().optional(),
  collection: z.string().max(200).optional(),
  staticValue: z.string().max(10_000).optional(),
});

const outputSchema = z.object({
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
    "url",
    "file",
    "image",
    "audio",
    "video",
    "approval",
  ]),
  required: z.boolean(),
  placeholder: z.string().max(500).optional(),
  helpText: z.string().max(2_000).optional(),
  options: z.array(z.string().max(500)).max(100).optional(),
  libraryCollection: z.string().max(200).optional(),
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
  const file: SharedMethodFile = {
    format: "contentflow-method",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    method,
  };
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
  return structuredClone(sourceBlocks).map((block, order) => ({
    ...block,
    collectionId: undefined,
    id: createId(`${processType}-${block.type.toLowerCase()}`),
    order,
    parameters: block.parameters.map((parameter) => ({
      ...parameter,
      id: createId(`${processType}-parameter`),
    })),
    inputs: block.inputs?.map((input) => ({
      ...input,
      id: createId(`${processType}-input`),
    })),
    outputs: block.outputs?.map((output) => ({
      ...output,
      id: createId(`${processType}-output`),
    })),
  }));
}
