import { z } from "zod";
import type {
  ActionBlock,
  ProcessMethod,
  StrategicCollection,
  UniversalProcess,
} from "@/lib/domain";
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
    source: z.enum([
      "project",
      "previous_process",
      "previous_block",
      "channel_history",
      "channel_library",
      "static",
    ]),
    sourceKey: z.string().max(200).optional(),
    sourceProcessType: z
      .enum([
        "theme",
        "title",
        "thumbnail",
        "script",
        "narration",
        "assets",
        "editing",
        "publishing",
      ])
      .optional(),
    blockId: z.string().optional(),
    collection: z.string().max(200).optional(),
    staticValue: z.string().max(10_000).optional(),
    historyLimit: z.number().int().min(1).max(100).optional(),
    historyEligibility: z.enum(["completed", "published"]).optional(),
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
  retryMode: z.enum(["full", "conversation_feedback"]).optional(),
});

const sharedPluginBindingSchema = z.object({
  pluginId: z.string().min(1).max(160),
  pluginVersion: z.string().max(80).optional(),
  capabilityId: z.string().min(1).max(100),
  configuration: z.record(z.union([z.string(), z.number(), z.boolean()])),
  connectionRequired: z.boolean().optional(),
  conversation: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("new") }),
      z.object({
        mode: z.literal("reuse"),
        sourceProcessType: universalProcessSchema,
        sourceBlockId: z.string().min(1),
      }),
    ])
    .optional(),
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
  plugin: sharedPluginBindingSchema.optional(),
  parameters: z.array(parameterSchema).max(100),
  order: z.number().int().nonnegative(),
});

const collectionRequirementFieldSchema = z.object({
  label: z.string().max(200),
  key: z.string().max(200),
  type: z.enum(["text", "textarea", "number", "image", "url", "thumbnail_layout"]),
  required: z.boolean(),
});

const methodRequirementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("previous_process"),
    processType: universalProcessSchema,
    sourceKey: z.string().max(200).optional(),
    blockName: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("collection"),
    name: z.string().max(200),
    blockName: z.string().max(200).optional(),
    fields: z.array(collectionRequirementFieldSchema).max(100),
  }),
  z.object({
    kind: z.literal("plugin"),
    pluginId: z.string().min(1).max(160),
    capabilityId: z.string().min(1).max(100),
    connectionRequired: z.boolean(),
  }),
]);

const portableImageSchema = z
  .string()
  .max(1_500_000)
  .refine(
    (value) =>
      /^data:image\/(webp|png|jpeg);base64,/.test(value) ||
      /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(value),
    "Capa inválida.",
  );

const portableMethodSchema = z.object({
  name: z.string().max(200).optional(),
  imageUrl: portableImageSchema.optional(),
  processType: universalProcessSchema,
  blocks: z.array(actionBlockSchema).min(1).max(200),
});

const sharedMethodSchema = z.object({
  format: z.literal("contentflow-method"),
  version: z.literal(1),
  name: z.string().max(200),
  exportedAt: z.string(),
  requirements: z.array(methodRequirementSchema).max(300).optional(),
  method: portableMethodSchema,
});

const sharedMethodPackSchema = z
  .object({
    format: z.literal("contentflow-method-pack"),
    version: z.literal(1),
    name: z.string().min(1).max(200),
    channelName: z.string().min(1).max(200),
    channelImageUrl: portableImageSchema.optional(),
    exportedAt: z.string(),
    methods: z.array(portableMethodSchema).min(1).max(8),
    requirements: z.record(z.array(methodRequirementSchema).max(300)).optional(),
  })
  .superRefine((pack, context) => {
    const processTypes = pack.methods.map((method) => method.processType);
    if (new Set(processTypes).size !== processTypes.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Processos duplicados no pacote." });
    }
  });

export type MethodRequirement = z.infer<typeof methodRequirementSchema>;
export type SharedMethodFile = Omit<z.infer<typeof sharedMethodSchema>, "method"> & {
  method: ProcessMethod;
};
export type SharedMethodPackFile = Omit<z.infer<typeof sharedMethodPackSchema>, "methods"> & {
  methods: ProcessMethod[];
};
export type SharedMethodImport = SharedMethodFile | SharedMethodPackFile;

export function collectMethodRequirements(
  method: ProcessMethod,
  collections: StrategicCollection[] = [],
): MethodRequirement[] {
  const requirements: MethodRequirement[] = [];
  for (const block of method.blocks) {
    if (block.type === "ESCOLHER") {
      const collection = collections.find((item) => item.id === block.collectionId);
      requirements.push({
        kind: "collection",
        name: collection?.name ?? "Coleção estratégica não identificada",
        blockName: block.name ?? block.type,
        fields:
          collection?.fields.map(({ id, label, type, required }) => ({
            label,
            key: id,
            type,
            required,
          })) ?? [],
      });
    }
    for (const input of block.inputs ?? []) {
      if (input.source === "previous_process" && input.sourceProcessType) {
        requirements.push({
          kind: "previous_process",
          processType: input.sourceProcessType,
          sourceKey: input.sourceKey,
          blockName: block.name ?? block.type,
        });
      }
      if (input.source === "channel_library") {
        requirements.push({
          kind: "collection",
          name: input.collection?.trim() || "Coleção estratégica não identificada",
          blockName: block.name ?? block.type,
          fields: (input.recordFields ?? []).flatMap((field) =>
            ["text", "textarea", "number", "image", "url"].includes(field.type)
              ? [
                  {
                    label: field.label,
                    key: field.key,
                    type: field.type as "text" | "textarea" | "number" | "image" | "url",
                    required: field.required,
                  },
                ]
              : [],
          ),
        });
      }
    }
    if (block.plugin) {
      requirements.push({
        kind: "plugin",
        pluginId: block.plugin.pluginId,
        capabilityId: block.plugin.capabilityId,
        connectionRequired: block.plugin.connectionRequired ?? Boolean(block.plugin.connectionId),
      });
      const conversation = block.plugin.conversation;
      if (conversation?.mode === "reuse" && conversation.sourceProcessType !== method.processType) {
        requirements.push({
          kind: "previous_process",
          processType: conversation.sourceProcessType,
          blockName: block.name ?? block.type,
        });
      }
    }
  }
  return requirements.filter(
    (requirement, index, all) =>
      all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(requirement)) ===
      index,
  );
}

function createPortableMethod(method: ProcessMethod) {
  return {
    ...structuredClone(method),
    blocks: method.blocks.map((block) => ({
      ...structuredClone(block),
      collectionId: undefined,
      plugin: block.plugin
        ? {
            pluginId: block.plugin.pluginId,
            pluginVersion: block.plugin.pluginVersion,
            capabilityId: block.plugin.capabilityId,
            configuration: structuredClone(block.plugin.configuration),
            connectionRequired:
              block.plugin.connectionRequired ?? Boolean(block.plugin.connectionId),
            conversation: block.plugin.conversation,
          }
        : undefined,
    })),
  };
}

export function serializeMethodFile(
  name: string,
  method: ProcessMethod,
  collections: StrategicCollection[] = [],
) {
  const portableMethod = createPortableMethod({ ...method, name: method.name || name });
  const file = sharedMethodSchema.parse({
    format: "contentflow-method",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    requirements: collectMethodRequirements(method, collections),
    method: portableMethod,
  });
  return JSON.stringify(file, null, 2);
}

export function serializeMethodPackFile(
  name: string,
  channelName: string,
  methods: ProcessMethod[],
  collections: StrategicCollection[] = [],
  channelImageUrl?: string,
) {
  const included = methods.filter((method) => method.blocks.length > 0);
  const requirements = Object.fromEntries(
    included.map((method) => [method.processType, collectMethodRequirements(method, collections)]),
  );
  const file = sharedMethodPackSchema.parse({
    format: "contentflow-method-pack",
    version: 1,
    name,
    channelName,
    channelImageUrl,
    exportedAt: new Date().toISOString(),
    methods: included.map(createPortableMethod),
    requirements,
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
    throw new Error("Este não é um arquivo de método válido do ContentFlow.");
  }
  return {
    ...result.data,
    requirements:
      result.data.requirements ?? collectMethodRequirements(result.data.method as ProcessMethod),
    method: {
      ...result.data.method,
      name: result.data.method.name?.trim() || result.data.name,
    },
  } as SharedMethodFile;
}

export function parseMethodImportFile(contents: string): SharedMethodImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }
  if ((parsed as { format?: unknown })?.format === "contentflow-method") {
    return parseMethodFile(contents);
  }
  const result = sharedMethodPackSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Este não é um arquivo de Método ou pacote válido do ContentFlow.");
  }
  return {
    ...result.data,
    requirements: result.data.requirements ?? {},
    methods: result.data.methods.map((method) => ({
      ...method,
      name: method.name?.trim() || `Método de ${method.processType}`,
    })),
  } as SharedMethodPackFile;
}

export function copyImportedBlocks(
  processType: UniversalProcess,
  sourceBlocks: ActionBlock[],
  createId: (prefix: string) => string,
  options: { preserveLocalConnections?: boolean } = {},
) {
  const copied = structuredClone(sourceBlocks);
  const blockIds = new Map(
    copied.map((block) => [block.id, createId(`${processType}-${block.type.toLowerCase()}`)]),
  );
  return copyBlocksWithIds(processType, copied, blockIds, createId, options);
}

function copyBlocksWithIds(
  processType: UniversalProcess,
  copied: ActionBlock[],
  blockIds: Map<string, string>,
  createId: (prefix: string) => string,
  options: { preserveLocalConnections?: boolean },
) {
  return copied.map((block, order) => ({
    ...block,
    collectionId: undefined,
    id: blockIds.get(block.id)!,
    order,
    plugin: block.plugin
      ? {
          ...block.plugin,
          connectionId: options.preserveLocalConnections ? block.plugin.connectionId : undefined,
          conversation:
            block.plugin.conversation?.mode === "reuse"
              ? {
                  ...block.plugin.conversation,
                  sourceBlockId:
                    blockIds.get(block.plugin.conversation.sourceBlockId) ??
                    block.plugin.conversation.sourceBlockId,
                }
              : block.plugin.conversation,
        }
      : undefined,
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
      blockId:
        input.blockId && input.blockId !== "__process_output__"
          ? (blockIds.get(input.blockId) ?? input.blockId)
          : input.blockId,
    })),
    outputs: block.outputs?.map((output) => ({
      ...output,
      id: createId(`${processType}-output`),
      recordFields: output.recordFields?.map((field) => ({
        ...field,
        id: createId(`${processType}-record-field`),
      })),
      optionsSourceBlockId: output.optionsSourceBlockId
        ? (blockIds.get(output.optionsSourceBlockId) ?? output.optionsSourceBlockId)
        : undefined,
    })),
    validation: block.validation
      ? {
          ...block.validation,
          targetBlockId: block.validation.targetBlockId
            ? (blockIds.get(block.validation.targetBlockId) ?? block.validation.targetBlockId)
            : undefined,
        }
      : undefined,
  }));
}

export function copyImportedMethods(
  sourceMethods: ProcessMethod[],
  createId: (prefix: string) => string,
  options: { preserveLocalConnections?: boolean } = {},
) {
  const copied = structuredClone(sourceMethods);
  const blockIds = new Map<string, string>();
  for (const method of copied) {
    for (const block of method.blocks) {
      blockIds.set(block.id, createId(`${method.processType}-${block.type.toLowerCase()}`));
    }
  }
  return copied.map((method) => ({
    name: method.name,
    processType: method.processType,
    blocks: copyBlocksWithIds(method.processType, method.blocks, blockIds, createId, options),
  }));
}
