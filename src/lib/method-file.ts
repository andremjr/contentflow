import { z } from "zod";
import type {
  ActionBlock,
  ChannelLibraryItem,
  ProcessMethod,
  StoredFile,
  StrategicCollection,
  ThumbnailLayout,
  UniversalProcess,
} from "@/lib/domain";
import { normalizeFieldPresentation } from "@/lib/presentation";
import { instructionCollectionKey, instructionVariables } from "@/lib/instruction-template";

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
    portKey: z.string().min(1).max(100).optional(),
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
    portKey: z.string().min(1).max(100).optional(),
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

const portableMethodRoleSchema = z.enum(["primary", "dependency", "set"]);

const portableStoredFileSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(256 * 1024 * 1024),
  url: z.string().min(1).max(30_000_000),
  sha256: z.string().max(128).optional(),
});

const portableThumbnailLayoutSchema = z.object({
  aspectRatio: z.literal("16:9"),
  boxes: z
    .array(
      z.object({
        id: z.string().max(200),
        label: z.string().max(500),
        color: z.string().max(100),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      }),
    )
    .max(200),
});

const portableLibraryValueSchema = z.union([
  z.string().max(2_000_000),
  z.number(),
  portableStoredFileSchema,
  portableThumbnailLayoutSchema,
]);

const portableLibraryItemV2Schema = z.object({
  key: z.string().min(1).max(200),
  collectionKey: z.string().min(1).max(160),
  values: z.record(portableLibraryValueSchema),
  createdAt: z.string().optional(),
});

const portableCollectionV2Schema = z.object({
  key: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(160),
        label: z.string().max(200),
        type: z.enum(["text", "textarea", "number", "image", "url", "thumbnail_layout"]),
        required: z.boolean(),
      }),
    )
    .max(100),
  referencedBy: z
    .array(
      z.object({
        processType: universalProcessSchema,
        blockKey: z.string().min(1).max(200),
      }),
    )
    .max(200),
});

const portableMethodEntryV2Schema = z.object({
  role: portableMethodRoleSchema,
  method: portableMethodSchema,
  requirements: z.array(methodRequirementSchema).max(300),
});

const sharedMethodBundleV2Schema = z
  .object({
    format: z.enum(["contentflow-method", "contentflow-method-pack"]),
    version: z.literal(2),
    name: z.string().min(1).max(200),
    channelName: z.string().min(1).max(200).optional(),
    channelImageUrl: portableImageSchema.optional(),
    exportedAt: z.string(),
    primaryProcessType: universalProcessSchema.optional(),
    processOrder: z.array(universalProcessSchema).length(8),
    methods: z.array(portableMethodEntryV2Schema).min(1).max(8),
    collections: z.array(portableCollectionV2Schema).max(100),
    itemsIncluded: z.boolean(),
    items: z.array(portableLibraryItemV2Schema).max(500).optional(),
  })
  .superRefine((bundle, context) => {
    const order = bundle.processOrder;
    if (new Set(order).size !== order.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Ordem de Processos inválida." });
    }
    const processTypes = bundle.methods.map((entry) => entry.method.processType);
    if (new Set(processTypes).size !== processTypes.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Processos duplicados no pacote." });
    }
    if (
      bundle.format === "contentflow-method" &&
      (!bundle.primaryProcessType || !processTypes.includes(bundle.primaryProcessType))
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Método principal ausente." });
    }
  });

export type MethodRequirement = z.infer<typeof methodRequirementSchema>;
export type SharedMethodFile = Omit<z.infer<typeof sharedMethodSchema>, "method"> & {
  method: ProcessMethod;
};
export type SharedMethodPackFile = Omit<z.infer<typeof sharedMethodPackSchema>, "methods"> & {
  methods: ProcessMethod[];
};
export type SharedMethodImport = SharedMethodFile | SharedMethodPackFile | SharedMethodBundleV2;
export type PortableMethodRole = z.infer<typeof portableMethodRoleSchema>;
export type PortableCollectionV2 = z.infer<typeof portableCollectionV2Schema>;
export type PortableLibraryItemV2 = z.infer<typeof portableLibraryItemV2Schema>;
export type SharedMethodBundleV2 = Omit<z.infer<typeof sharedMethodBundleV2Schema>, "methods"> & {
  methods: Array<{
    role: PortableMethodRole;
    method: ProcessMethod;
    requirements: MethodRequirement[];
  }>;
};

export function parsePortableLibraryItems(input: unknown): PortableLibraryItemV2[] {
  return z.array(portableLibraryItemV2Schema).max(500).parse(input);
}

export type PortableTransferPlan = {
  format: "contentflow-method" | "contentflow-method-pack";
  name: string;
  channelName?: string;
  channelImageUrl?: string;
  primaryProcessType?: UniversalProcess;
  processOrder: UniversalProcess[];
  methods: Array<{
    role: PortableMethodRole;
    method: ProcessMethod;
    requirements: MethodRequirement[];
  }>;
  collections: PortableCollectionV2[];
  itemsIncluded: boolean;
  items: PortableLibraryItemV2[];
};

export function collectMethodRequirements(
  method: ProcessMethod,
  collections: StrategicCollection[] = [],
): MethodRequirement[] {
  const requirements: MethodRequirement[] = [];
  for (const block of method.blocks) {
    const referencedCollections = new Set(
      instructionVariables(block.instructions ?? "")
        .filter((variable) => variable.startsWith("collections."))
        .map((variable) => variable.slice("collections.".length)),
    );
    for (const collection of collections) {
      if (!referencedCollections.has(instructionCollectionKey(collection))) continue;
      requirements.push({
        kind: "collection",
        name: collection.name,
        blockName: block.name ?? block.type,
        fields: collection.fields.map(({ id, label, type, required }) => ({
          label,
          key: id,
          type,
          required,
        })),
      });
    }
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

function portableSlug(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function buildPortableBlockIds(methods: ProcessMethod[]) {
  const result = new Map<string, string>();
  for (const method of methods) {
    method.blocks.forEach((block, index) => {
      result.set(`${method.processType}:${block.id}`, `${method.processType}:block:${index + 1}`);
    });
  }
  return result;
}

function createPortableMethodV2(
  method: ProcessMethod,
  blockIds: Map<string, string>,
  collectionKeys: Map<string, string>,
  options: { preserveLocalConnections?: boolean } = {},
) {
  const copied = structuredClone(method);
  return {
    ...copied,
    blocks: copied.blocks.map((block, index) => {
      const blockKey =
        blockIds.get(`${method.processType}:${block.id}`) ??
        `${method.processType}:block:${index + 1}`;
      const mapBlockReference = (blockId: string | undefined, processType = method.processType) =>
        blockId && blockId !== "__process_output__"
          ? (blockIds.get(`${processType}:${blockId}`) ?? blockId)
          : blockId;
      return {
        ...block,
        id: blockKey,
        collectionId: block.collectionId ? collectionKeys.get(block.collectionId) : undefined,
        plugin: block.plugin
          ? {
              pluginId: block.plugin.pluginId,
              pluginVersion: block.plugin.pluginVersion,
              capabilityId: block.plugin.capabilityId,
              configuration: structuredClone(block.plugin.configuration),
              connectionId: options.preserveLocalConnections
                ? block.plugin.connectionId
                : undefined,
              connectionRequired:
                block.plugin.connectionRequired ?? Boolean(block.plugin.connectionId),
              conversation:
                block.plugin.conversation?.mode === "reuse"
                  ? {
                      ...block.plugin.conversation,
                      sourceBlockId:
                        mapBlockReference(
                          block.plugin.conversation.sourceBlockId,
                          block.plugin.conversation.sourceProcessType,
                        ) ?? block.plugin.conversation.sourceBlockId,
                    }
                  : block.plugin.conversation,
            }
          : undefined,
        parameters: block.parameters.map((parameter, parameterIndex) => ({
          ...parameter,
          id: `${blockKey}:parameter:${parameterIndex + 1}`,
        })),
        inputs: block.inputs?.map((input, inputIndex) => ({
          ...input,
          id: `${blockKey}:input:${inputIndex + 1}`,
          blockId: mapBlockReference(input.blockId, input.sourceProcessType ?? method.processType),
          recordFields: input.recordFields?.map((field, fieldIndex) => ({
            ...field,
            id: `${blockKey}:input:${inputIndex + 1}:field:${fieldIndex + 1}`,
          })),
        })),
        outputs: block.outputs?.map((output, outputIndex) => ({
          ...output,
          id: `${blockKey}:output:${outputIndex + 1}`,
          optionsSourceBlockId: mapBlockReference(output.optionsSourceBlockId),
          recordFields: output.recordFields?.map((field, fieldIndex) => ({
            ...field,
            id: `${blockKey}:output:${outputIndex + 1}:field:${fieldIndex + 1}`,
          })),
        })),
        validation: block.validation
          ? {
              ...block.validation,
              targetBlockId: mapBlockReference(block.validation.targetBlockId),
            }
          : undefined,
      };
    }),
  } satisfies ProcessMethod;
}

function referencedCollectionIds(methods: ProcessMethod[]) {
  return new Set(
    methods.flatMap((method) =>
      method.blocks.flatMap((block) => (block.collectionId ? [block.collectionId] : [])),
    ),
  );
}

export function planPortableMethodTransfer(input: {
  name: string;
  channelName?: string;
  channelImageUrl?: string;
  sourceMethods: ProcessMethod[];
  collections?: StrategicCollection[];
  items?: ChannelLibraryItem[];
  includeItems?: boolean;
  preserveLocalConnections?: boolean;
  processOrder: UniversalProcess[];
  primaryProcessTypes?: UniversalProcess[];
  includeAllMethods?: boolean;
}): PortableTransferPlan {
  const collections = input.collections ?? [];
  const sourceItems = input.items ?? [];
  const byProcess = new Map(input.sourceMethods.map((method) => [method.processType, method]));
  const primary = new Set(input.primaryProcessTypes ?? []);
  const included = new Set<UniversalProcess>();

  if (input.includeAllMethods) {
    for (const processType of input.processOrder) {
      if (byProcess.get(processType)?.blocks.length) included.add(processType);
    }
  } else {
    const pending = [...primary];
    while (pending.length) {
      const processType = pending.shift()!;
      if (included.has(processType)) continue;
      const method = byProcess.get(processType);
      if (!method?.blocks.length) continue;
      included.add(processType);
      for (const requirement of collectMethodRequirements(method, collections)) {
        if (
          requirement.kind === "previous_process" &&
          !included.has(requirement.processType) &&
          byProcess.get(requirement.processType)?.blocks.length
        ) {
          pending.push(requirement.processType);
        }
      }
    }
  }

  const orderedMethods = input.processOrder.flatMap((processType) => {
    const method = byProcess.get(processType);
    return method && included.has(processType) ? [method] : [];
  });
  if (!orderedMethods.length) throw new Error("Nenhum Método configurado foi selecionado.");

  const relevantCollectionIds = input.includeAllMethods
    ? new Set(collections.map((collection) => collection.id))
    : referencedCollectionIds(orderedMethods);
  const selectedCollections = collections.filter((collection) =>
    relevantCollectionIds.has(collection.id),
  );
  const collectionKeys = new Map(
    selectedCollections.map((collection, index) => [
      collection.id,
      `collection:${portableSlug(collection.name, "strategic")}:${index + 1}`,
    ]),
  );
  const blockIds = buildPortableBlockIds(orderedMethods);

  const portableCollectionFields = new Map(
    selectedCollections.flatMap((collection) =>
      collection.fields.map(
        (field, index) =>
          [
            `${collection.id}:${field.id}`,
            `field:${portableSlug(field.label, "value")}:${index + 1}`,
          ] as const,
      ),
    ),
  );

  const portableRequirements = (method: ProcessMethod) =>
    collectMethodRequirements(method, collections).map((requirement) => {
      if (requirement.kind !== "collection") return requirement;
      const collection = selectedCollections.find((item) => item.name === requirement.name);
      if (!collection) return requirement;
      return {
        ...requirement,
        fields: requirement.fields.map((field, index) => ({
          ...field,
          key:
            portableCollectionFields.get(`${collection.id}:${field.key}`) ??
            `field:${portableSlug(field.label, "value")}:${index + 1}`,
        })),
      };
    });

  const portableMethods = orderedMethods.map((method) => ({
    role: input.includeAllMethods
      ? ("set" as const)
      : primary.has(method.processType)
        ? ("primary" as const)
        : ("dependency" as const),
    method: createPortableMethodV2(method, blockIds, collectionKeys, {
      preserveLocalConnections: input.preserveLocalConnections,
    }),
    requirements: portableRequirements(method),
  }));

  const portableCollections = selectedCollections.map((collection) => {
    const key = collectionKeys.get(collection.id)!;
    const referencedBy = orderedMethods.flatMap((method) =>
      method.blocks.flatMap((block) =>
        block.collectionId === collection.id
          ? [
              {
                processType: method.processType,
                blockKey:
                  blockIds.get(`${method.processType}:${block.id}`) ??
                  `${method.processType}:block:1`,
              },
            ]
          : [],
      ),
    );
    return {
      key,
      name: collection.name,
      fields: collection.fields.map((field, index) => ({
        key:
          portableCollectionFields.get(`${collection.id}:${field.id}`) ??
          `field:${portableSlug(field.label, "value")}:${index + 1}`,
        label: field.label,
        type: field.type,
        required: field.required,
      })),
      referencedBy,
    };
  });

  const portableItems: PortableLibraryItemV2[] = input.includeItems
    ? sourceItems.flatMap((item, itemIndex) => {
        const collection = selectedCollections.find(
          (candidate) => candidate.id === item.collectionId,
        );
        if (!collection) return [];
        const collectionKey = collectionKeys.get(collection.id);
        if (!collectionKey) return [];
        const values = Object.fromEntries(
          Object.entries(item.values).flatMap(([fieldId, value]) => {
            const field = collection.fields.find((candidate) => candidate.id === fieldId);
            if (!field) return [];
            const portableKey = portableCollectionFields.get(`${collection.id}:${field.id}`);
            return portableKey ? [[portableKey, structuredClone(value)]] : [];
          }),
        ) as Record<string, string | number | StoredFile | ThumbnailLayout>;
        return [
          {
            key: `item:${portableSlug(collection.name, "strategic")}:${itemIndex + 1}`,
            collectionKey,
            values,
            createdAt: item.createdAt,
          },
        ];
      })
    : [];

  const single = !input.includeAllMethods && primary.size === 1;
  return {
    format: single ? "contentflow-method" : "contentflow-method-pack",
    name: input.name,
    channelName: input.channelName,
    channelImageUrl: input.channelImageUrl,
    primaryProcessType: single ? [...primary][0] : undefined,
    processOrder: [...input.processOrder],
    methods: portableMethods,
    collections: portableCollections,
    itemsIncluded: input.includeItems === true,
    items: portableItems,
  };
}

export function serializePortableMethodTransfer(plan: PortableTransferPlan) {
  const file = sharedMethodBundleV2Schema.parse({
    ...plan,
    version: 2,
    exportedAt: new Date().toISOString(),
  });
  return JSON.stringify(file, null, 2);
}

function parseMethodBundleV2(parsed: unknown): SharedMethodBundleV2 {
  const result = sharedMethodBundleV2Schema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Este não é um pacote portátil válido do ContentFlow.");
  }
  return {
    ...result.data,
    items: result.data.items ?? [],
    methods: result.data.methods.map((entry) => ({
      ...entry,
      method: {
        ...entry.method,
        name: entry.method.name?.trim() || `Método de ${entry.method.processType}`,
      },
    })),
  } as SharedMethodBundleV2;
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

  if ((parsed as { version?: unknown })?.version === 2) {
    const bundle = parseMethodBundleV2(parsed);
    if (bundle.format !== "contentflow-method" || !bundle.primaryProcessType) {
      throw new Error("Este não é um arquivo de método válido do ContentFlow.");
    }
    const primary = bundle.methods.find(
      (entry) => entry.method.processType === bundle.primaryProcessType,
    );
    if (!primary) throw new Error("O Método principal não foi encontrado no pacote.");
    return {
      format: "contentflow-method",
      version: 1,
      name: bundle.name,
      exportedAt: bundle.exportedAt,
      requirements: primary.requirements,
      method: primary.method,
    };
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
  if ((parsed as { version?: unknown })?.version === 2) {
    return parseMethodBundleV2(parsed);
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
  options: {
    preserveLocalConnections?: boolean;
    collectionIds?: ReadonlyMap<string, string>;
  },
) {
  return copied.map((block, order) => ({
    ...block,
    collectionId: block.collectionId ? options.collectionIds?.get(block.collectionId) : undefined,
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
  options: {
    preserveLocalConnections?: boolean;
    collectionIds?: ReadonlyMap<string, string>;
  } = {},
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
    imageUrl: method.imageUrl,
    processType: method.processType,
    blocks: copyBlocksWithIds(method.processType, method.blocks, blockIds, createId, options),
  }));
}
