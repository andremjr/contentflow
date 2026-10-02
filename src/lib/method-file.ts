import { z } from "zod";
import type {
  ActionBlock,
  ChannelLibraryItem,
  ProfileExecutionPolicy,
  ProcessMethod,
  StoredFile,
  StrategicCollection,
  ThumbnailLayout,
  UniversalProcess,
} from "@/lib/domain";
import { instructionCollectionKey, instructionVariables } from "@/lib/instruction-template";
import { parseProcessMethodV3, processMethodV3Schema } from "@/lib/method-contract-v3";
import { valueShapeSchema } from "@/lib/value-shape-schema";

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

const collectionRequirementFieldSchema = z.object({
  label: z.string().max(200),
  key: z.string().max(200),
  shape: valueShapeSchema,
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

const portableMethodSchema = processMethodV3Schema;

const sharedMethodSchema = z.object({
  format: z.literal("contentflow-method"),
  version: z.literal(3),
  name: z.string().max(200),
  exportedAt: z.string(),
  requirements: z.array(methodRequirementSchema).max(300).optional(),
  method: portableMethodSchema,
});

const sharedMethodPackSchema = z
  .object({
    format: z.literal("contentflow-method-pack"),
    version: z.literal(3),
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

const portableLibraryAtomicValueSchema = z.union([
  z.string().max(2_000_000),
  z.number(),
  z.boolean(),
  z.null(),
  portableStoredFileSchema,
  portableThumbnailLayoutSchema,
]);

const portableLibraryRecordSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null(), portableStoredFileSchema]),
);

const portableLibraryValueSchema = z.union([
  portableLibraryAtomicValueSchema,
  z.array(z.string()),
  z.array(portableStoredFileSchema),
  portableLibraryRecordSchema,
  z.array(portableLibraryRecordSchema),
]);

const portableLibraryItemSchema = z.object({
  key: z.string().min(1).max(200),
  collectionKey: z.string().min(1).max(160),
  values: z.record(portableLibraryValueSchema),
  createdAt: z.string().optional(),
});

const portableCollectionSchema = z.object({
  key: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  usage: z.enum(["fixed", "consumable"]).optional(),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(160),
        label: z.string().max(200),
        shape: valueShapeSchema,
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

const portableMethodEntrySchema = z.object({
  role: portableMethodRoleSchema,
  method: portableMethodSchema,
  requirements: z.array(methodRequirementSchema).max(300),
});

const portableMethodBundleSchema = z
  .object({
    format: z.enum(["contentflow-method", "contentflow-method-pack"]),
    version: z.literal(3),
    name: z.string().min(1).max(200),
    channelName: z.string().min(1).max(200).optional(),
    channelImageUrl: portableImageSchema.optional(),
    exportedAt: z.string(),
    primaryProcessType: universalProcessSchema.optional(),
    processOrder: z.array(universalProcessSchema).length(8),
    methods: z.array(portableMethodEntrySchema).min(1).max(8),
    collections: z.array(portableCollectionSchema).max(100),
    itemsIncluded: z.boolean(),
    items: z.array(portableLibraryItemSchema).max(500).optional(),
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
export type SharedMethodImport = SharedMethodFile | SharedMethodPackFile | PortableMethodBundle;
export type PortableMethodRole = z.infer<typeof portableMethodRoleSchema>;
export type PortableCollection = z.infer<typeof portableCollectionSchema>;
export type PortableLibraryItem = z.infer<typeof portableLibraryItemSchema>;
export type PortableMethodBundle = Omit<z.infer<typeof portableMethodBundleSchema>, "methods"> & {
  methods: Array<{
    role: PortableMethodRole;
    method: ProcessMethod;
    requirements: MethodRequirement[];
  }>;
};

export function parsePortableLibraryItems(input: unknown): PortableLibraryItem[] {
  return z.array(portableLibraryItemSchema).max(500).parse(input);
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
  collections: PortableCollection[];
  itemsIncluded: boolean;
  items: PortableLibraryItem[];
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
        fields: collection.fields.map(({ id, label, shape, required }) => ({
          label,
          key: id,
          shape,
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
          collection?.fields.map(({ id, label, shape, required }) => ({
            label,
            key: id,
            shape,
            required,
          })) ?? [],
      });
    }
    for (const input of block.inputs ?? []) {
      const binding = input.binding;
      const sourceKind = binding?.kind;
      const sourceProcessType =
        binding?.kind === "previous_process" ? binding.processType : undefined;
      const sourceKey = binding?.kind === "previous_process" ? binding.outputKey : undefined;
      if (sourceKind === "previous_process" && sourceProcessType) {
        requirements.push({
          kind: "previous_process",
          processType: sourceProcessType,
          sourceKey,
          blockName: block.name ?? block.type,
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

function createPortableImportedMethod(
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
              profileExecution: options.preserveLocalConnections
                ? structuredClone(block.plugin.profileExecution)
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
          shape:
            input.shape.kind === "record"
              ? {
                  ...input.shape,
                  fields: input.shape.fields.map((field, fieldIndex) => ({
                    ...field,
                    id: `${blockKey}:input:${inputIndex + 1}:field:${fieldIndex + 1}`,
                  })),
                }
              : input.shape,
          binding:
            input.binding?.kind === "previous_block"
              ? {
                  ...input.binding,
                  blockId: mapBlockReference(input.binding.blockId) ?? input.binding.blockId,
                }
              : input.binding?.kind === "previous_process"
                ? {
                    ...input.binding,
                    blockId:
                      mapBlockReference(input.binding.blockId, input.binding.processType) ??
                      input.binding.blockId,
                  }
                : input.binding?.kind === "channel_history"
                  ? {
                      ...input.binding,
                      blockId:
                        mapBlockReference(input.binding.blockId, input.binding.processType) ??
                        input.binding.blockId,
                    }
                  : input.binding,
        })),
        outputs: block.outputs?.map((output, outputIndex) => ({
          ...output,
          id: `${blockKey}:output:${outputIndex + 1}`,
          optionsSourceBlockId: mapBlockReference(output.optionsSourceBlockId),
          shape:
            output.shape.kind === "record"
              ? {
                  ...output.shape,
                  fields: output.shape.fields.map((field, fieldIndex) => ({
                    ...field,
                    id: `${blockKey}:output:${outputIndex + 1}:field:${fieldIndex + 1}`,
                  })),
                }
              : output.shape,
        })),
        validation: block.validation
          ? {
              ...block.validation,
              targetBlockId:
                mapBlockReference(block.validation.targetBlockId) ?? block.validation.targetBlockId,
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
  const adaptedSourceMethods = input.sourceMethods
    .filter((method) => method.blocks.length > 0)
    .map((method) => parseProcessMethodV3(method));
  const byProcess = new Map(adaptedSourceMethods.map((method) => [method.processType, method]));
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
    method: createPortableImportedMethod(method, blockIds, collectionKeys, {
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
      usage: collection.usage ?? "fixed",
      fields: collection.fields.map((field, index) => ({
        key:
          portableCollectionFields.get(`${collection.id}:${field.id}`) ??
          `field:${portableSlug(field.label, "value")}:${index + 1}`,
        label: field.label,
        shape: field.shape,
        required: field.required,
      })),
      referencedBy,
    };
  });

  const portableItems: PortableLibraryItem[] = input.includeItems
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
  const file = portableMethodBundleSchema.parse({
    ...plan,
    version: 3,
    exportedAt: new Date().toISOString(),
  });
  return JSON.stringify(file, null, 2);
}

function parsePortableMethodBundle(parsed: unknown): PortableMethodBundle {
  const result = portableMethodBundleSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Este não é um pacote portátil válido do ContentFlow.");
  }
  return {
    ...result.data,
    items: result.data.items ?? [],
    methods: result.data.methods.map((entry) => {
      const method = parseProcessMethodV3({
        ...entry.method,
        name: entry.method.name?.trim() || `Método de ${entry.method.processType}`,
      });
      return { ...entry, method };
    }),
  } as PortableMethodBundle;
}

function isPortableMethodBundle(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return false;
  const methods = (parsed as { methods?: unknown }).methods;
  return (
    (parsed as { version?: unknown }).version === 3 &&
    Array.isArray(methods) &&
    methods.length > 0 &&
    methods.every((entry) => Boolean(entry && typeof entry === "object" && "method" in entry))
  );
}

function canonicalMethodForExport(method: ProcessMethod) {
  return parseProcessMethodV3({
    ...structuredClone(method),
    blocks: method.blocks.map((block) => ({
      ...structuredClone(block),
      plugin: block.plugin
        ? {
            pluginId: block.plugin.pluginId,
            pluginVersion: block.plugin.pluginVersion,
            capabilityId: block.plugin.capabilityId,
            configuration: structuredClone(block.plugin.configuration),
            connectionId: block.plugin.connectionId,
            connectionRequired: block.plugin.connectionRequired,
            conversation: block.plugin.conversation,
          }
        : undefined,
    })),
  });
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
  const portableMethod = createPortableMethod(
    canonicalMethodForExport({ ...method, name: method.name || name }),
  );
  const file = sharedMethodSchema.parse({
    format: "contentflow-method",
    version: 3,
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
    version: 3,
    name,
    channelName,
    channelImageUrl,
    exportedAt: new Date().toISOString(),
    methods: included.map((method) => createPortableMethod(canonicalMethodForExport(method))),
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

  if (isPortableMethodBundle(parsed)) {
    const bundle = parsePortableMethodBundle(parsed);
    if (bundle.format !== "contentflow-method" || !bundle.primaryProcessType) {
      throw new Error("Este não é um arquivo de método válido do ContentFlow.");
    }
    const primary = bundle.methods.find(
      (entry) => entry.method.processType === bundle.primaryProcessType,
    );
    if (!primary) throw new Error("O Método principal não foi encontrado no pacote.");
    return {
      format: "contentflow-method",
      version: 3,
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
    method: parseProcessMethodV3({
      ...result.data.method,
      name: result.data.method.name?.trim() || result.data.name,
    }),
  } as SharedMethodFile;
}

export function parseMethodImportFile(contents: string): SharedMethodImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }
  if (isPortableMethodBundle(parsed)) {
    return parsePortableMethodBundle(parsed);
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
    methods: result.data.methods.map((method) =>
      parseProcessMethodV3({
        ...method,
        name: method.name?.trim() || `Método de ${method.processType}`,
      }),
    ),
  } as SharedMethodPackFile;
}

export function copyImportedBlocks(
  processType: UniversalProcess,
  sourceBlocks: ActionBlock[],
  createId: (prefix: string) => string,
  options: {
    preserveLocalConnections?: boolean;
    remapLocalProfileExecution?: (
      pluginId: string,
      policy: ProfileExecutionPolicy,
    ) => ProfileExecutionPolicy | undefined;
  } = {},
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
    remapLocalProfileExecution?: (
      pluginId: string,
      policy: ProfileExecutionPolicy,
    ) => ProfileExecutionPolicy | undefined;
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
          profileExecution:
            block.plugin.profileExecution && options.remapLocalProfileExecution
              ? options.remapLocalProfileExecution(
                  block.plugin.pluginId,
                  block.plugin.profileExecution,
                )
              : undefined,
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
      shape:
        input.shape.kind === "record"
          ? {
              ...input.shape,
              fields: input.shape.fields.map((field) => ({
                ...field,
                id: createId(`${processType}-record-field`),
              })),
            }
          : input.shape,
      binding:
        input.binding?.kind === "previous_block"
          ? {
              ...input.binding,
              blockId: blockIds.get(input.binding.blockId) ?? input.binding.blockId,
            }
          : input.binding?.kind === "previous_process"
            ? {
                ...input.binding,
                blockId: input.binding.blockId
                  ? input.binding.blockId === "__process_output__"
                    ? input.binding.blockId
                    : (blockIds.get(input.binding.blockId) ?? input.binding.blockId)
                  : undefined,
              }
            : input.binding?.kind === "channel_history"
              ? {
                  ...input.binding,
                  blockId:
                    input.binding.blockId === "__process_output__"
                      ? input.binding.blockId
                      : (blockIds.get(input.binding.blockId) ?? input.binding.blockId),
                }
              : input.binding,
    })),
    outputs: block.outputs?.map((output) => ({
      ...output,
      id: createId(`${processType}-output`),
      shape:
        output.shape.kind === "record"
          ? {
              ...output.shape,
              fields: output.shape.fields.map((field) => ({
                ...field,
                id: createId(`${processType}-record-field`),
              })),
            }
          : output.shape,
      optionsSourceBlockId: output.optionsSourceBlockId
        ? (blockIds.get(output.optionsSourceBlockId) ?? output.optionsSourceBlockId)
        : undefined,
    })),
    validation: block.validation
      ? {
          ...block.validation,
          targetBlockId:
            blockIds.get(block.validation.targetBlockId) ?? block.validation.targetBlockId,
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
    remapLocalProfileExecution?: (
      pluginId: string,
      policy: ProfileExecutionPolicy,
    ) => ProfileExecutionPolicy | undefined;
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
    contractVersion: 3 as const,
    name: method.name,
    imageUrl: method.imageUrl,
    processType: method.processType,
    blocks: copyBlocksWithIds(method.processType, method.blocks, blockIds, createId, options),
  }));
}
