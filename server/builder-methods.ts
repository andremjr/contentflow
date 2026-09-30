import { z } from "zod";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type Channel,
  type HumanFieldType,
  type ProcessMethod,
  type StrategicCollection,
  type UniversalProcess,
} from "../src/lib/domain";
import { getMethodConfigurationIssue, normalizeMethodBlocks } from "../src/lib/human-workflow";
import { legacyTypeListAccepts } from "../src/lib/data-shape";
import { effectiveProcessOrder, validateProcessDependencies } from "../src/lib/process-order";
import type { RegisteredPlugin } from "./plugin-runner";
import { pluginConnectionRequired } from "../src/lib/plugin-contract";
import { validateLocalProfileExecution } from "./profile-execution-policy";
import { adaptLegacyMethod } from "../src/lib/legacy-method-adapter";

const processSchema = z.enum(PROCESS_ORDER);
const fieldTypeSchema = z.enum([
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
]);
const recordFieldSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    key: z.string().min(1),
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
    options: z.array(z.string()).optional(),
  })
  .passthrough();
const presentationSchema = z
  .object({
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
    acceptedMimeTypes: z.array(z.string()).optional(),
  })
  .passthrough();
const inputSourceBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), key: z.enum(["title", "deadline"]) }).strict(),
  z
    .object({
      kind: z.literal("previous_process"),
      processType: processSchema,
      outputKey: z.string().min(1),
      blockId: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("previous_block"),
      blockId: z.string().min(1),
      outputKey: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("channel_history"),
      processType: processSchema,
      blockId: z.string().min(1),
      outputKey: z.string().min(1),
      limit: z.number().int().min(1).max(100),
      eligibility: z.enum(["completed", "published"]),
    })
    .strict(),
  z.object({ kind: z.literal("runtime") }).strict(),
  z.object({ kind: z.literal("static"), value: z.string() }).strict(),
]);
const inputSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: fieldTypeSchema,
    binding: inputSourceBindingSchema.optional(),
    source: z.enum([
      "project",
      "previous_process",
      "previous_block",
      "channel_history",
      "channel_library",
      "runtime",
      "static",
    ]),
    sourceKey: z.string().optional(),
    sourceProcessType: processSchema.optional(),
    blockId: z.string().optional(),
    collection: z.string().optional(),
    staticValue: z.string().optional(),
    historyLimit: z.number().int().min(1).max(100).optional(),
    historyEligibility: z.enum(["completed", "published"]).optional(),
    recordFields: z.array(recordFieldSchema).optional(),
    presentation: presentationSchema.optional(),
    portKey: z.string().optional(),
  })
  .passthrough();
const outputSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    key: z.string().min(1),
    type: fieldTypeSchema,
    required: z.boolean(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    options: z.array(z.string()).optional(),
    optionsSourceBlockId: z.string().optional(),
    optionsSourceKey: z.string().optional(),
    recordFields: z.array(recordFieldSchema).optional(),
    presentation: presentationSchema.optional(),
    portKey: z.string().optional(),
  })
  .passthrough();
const parameterSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    key: z.string().min(1),
    type: z.enum(["text", "number", "select", "boolean", "textarea"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional(),
  })
  .passthrough();
const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]),
    operator: z.enum(["IA", "Humano", "Código"]),
    collectionId: z.string().optional(),
    name: z.string().optional(),
    instructions: z.string().optional(),
    inputs: z.array(inputSchema).optional(),
    outputs: z.array(outputSchema).optional(),
    validation: z
      .object({
        targetBlockId: z.string().min(1).optional(),
        targetOutputKey: z.string().optional(),
        targetPortKey: z.string().min(1).optional(),
        mode: z.enum(["approval", "select_one", "select_many"]),
        onReject: z.enum(["retry_target", "pause"]),
        maxAttempts: z.number().int().min(1).max(20),
        retryMode: z.enum(["full", "conversation_feedback"]).optional(),
      })
      .passthrough()
      .optional(),
    plugin: z
      .object({
        pluginId: z.string().min(1),
        pluginVersion: z.string().optional(),
        capabilityId: z.string().min(1),
        configuration: z.record(z.union([z.string(), z.number(), z.boolean()])),
        connectionId: z.string().optional(),
        connectionRequired: z.boolean().optional(),
        conversation: z
          .union([
            z.object({ mode: z.literal("new") }),
            z.object({
              mode: z.literal("reuse"),
              sourceProcessType: processSchema,
              sourceBlockId: z.string().min(1),
            }),
          ])
          .optional(),
      })
      .passthrough()
      .optional(),
    parameters: z.array(parameterSchema),
    order: z.number().int().min(0),
  })
  .passthrough();
const methodSchema = z
  .object({
    contractVersion: z.literal(2).optional(),
    name: z.string().min(1).max(200),
    imageUrl: z.string().optional(),
    processType: processSchema,
    blocks: z.array(blockSchema).min(1).max(200),
  })
  .passthrough();

export const BUILDER_METHOD_CONTRACT = {
  universalProcesses: PROCESS_ORDER.map((id) => ({ id, label: PROCESS_META[id].label })),
  blockTypes: ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"],
  operators: ["IA", "Humano", "Código"],
  processOutputs: {
    theme: { key: "theme", type: "textarea" },
    title: { key: "title", type: "text" },
    thumbnail: { key: "thumbnail", type: "image" },
    script: { key: "script", type: "textarea" },
    narration: { key: "audio", type: "audio" },
    assets: { key: "assets", type: "files" },
    editing: { key: "video", type: "video" },
    publishing: { key: "url", type: "url" },
  },
  rules: [
    "Use somente os oito processos, quatro tipos de bloco e três operadores declarados.",
    "Referências previous_block devem apontar para um bloco anterior do mesmo Método.",
    "Referências previous_process devem apontar para um processo universal anterior.",
    "Nunca inclua segredos, tokens, IDs de execução, projeto, entrega ou item no Método.",
    "connectionId é uma associação local e nunca deve entrar em um pacote portátil.",
  ],
} as const;

export type BuilderConnection = { id: string; name: string; connected: boolean };
export type BuilderPluginContext = {
  plugin: RegisteredPlugin;
  enabled: boolean;
  connections: BuilderConnection[];
  profiles: Array<{ id: string; name: string; alias: string }>;
};

export type BuilderValidationResult = {
  ok: boolean;
  methods?: Partial<Record<UniversalProcess, ProcessMethod>>;
  errors: string[];
  warnings: string[];
};

function compatibleType(source: HumanFieldType, target: HumanFieldType) {
  return source === target || (source === "text" && target === "textarea");
}

function validatePluginConfiguration(
  blockLabel: string,
  block: ProcessMethod["blocks"][number],
  validationTarget: ProcessMethod["blocks"][number] | undefined,
  plugins: BuilderPluginContext[],
  errors: string[],
  warnings: string[],
) {
  if (!block.plugin) return;
  const entry = plugins.find((candidate) => candidate.plugin.id === block.plugin?.pluginId);
  if (!entry) {
    errors.push(`${blockLabel}: plugin “${block.plugin.pluginId}” não está instalado.`);
    return;
  }
  const capability = entry.plugin.manifest.capabilities.find(
    (candidate) => candidate.id === block.plugin?.capabilityId,
  );
  if (!capability) {
    errors.push(`${blockLabel}: capacidade “${block.plugin.capabilityId}” não existe no plugin.`);
    return;
  }
  if (capability.operator !== block.operator)
    errors.push(`${blockLabel}: operador incompatível com o plugin.`);
  if (!capability.blockTypes.includes(block.type))
    errors.push(`${blockLabel}: tipo de bloco incompatível com o plugin.`);
  if (
    capability.processTypes &&
    !capability.processTypes.includes(blockLabel.split("/")[0] as UniversalProcess)
  ) {
    errors.push(`${blockLabel}: processo incompatível com o plugin.`);
  }
  const requiresConnection = pluginConnectionRequired(entry.plugin.manifest);
  block.plugin.connectionRequired = requiresConnection;
  if (requiresConnection) {
    const connection = entry.connections.find((item) => item.id === block.plugin?.connectionId);
    if (!connection?.connected)
      errors.push(`${blockLabel}: selecione uma conexão local ativa para o plugin.`);
  }
  if (!entry.enabled || !entry.plugin.executable)
    warnings.push(`${blockLabel}: plugin instalado, mas indisponível para execução no momento.`);

  const profileValidation = validateLocalProfileExecution({
    policy: block.plugin.profileExecution,
    profileSetup: entry.plugin.manifest.profileSetup,
    isBoundProfile: (profileId) => entry.profiles.some((profile) => profile.id === profileId),
  });
  if (profileValidation.error) errors.push(`${blockLabel}: ${profileValidation.error}`);
  else if (profileValidation.policy) block.plugin.profileExecution = profileValidation.policy;

  const occupiedInputPorts = new Set<string>();
  const assignedInputPorts = new Set<string>();
  for (const input of block.inputs ?? []) {
    const compatible = capability.inputPorts.filter((port) =>
      legacyTypeListAccepts(port.acceptedTypes, input.type),
    );
    if (input.portKey) {
      const selected = compatible.find((port) => port.key === input.portKey);
      if (!selected)
        errors.push(`${blockLabel}: porta da entrada “${input.label}” é incompatível.`);
      else if (!selected.multiple && occupiedInputPorts.has(selected.key))
        errors.push(`${blockLabel}: a porta da entrada “${input.label}” já está ocupada.`);
      else {
        assignedInputPorts.add(selected.key);
        if (!selected.multiple) occupiedInputPorts.add(selected.key);
      }
    } else {
      const candidates = compatible.filter(
        (port) => port.multiple || !occupiedInputPorts.has(port.key),
      );
      if (candidates.length === 1) {
        const selected = candidates[0];
        input.portKey = selected.key;
        assignedInputPorts.add(selected.key);
        if (!selected.multiple) occupiedInputPorts.add(selected.key);
      } else if (candidates.length === 0)
        errors.push(`${blockLabel}: nenhuma porta aceita a entrada “${input.label}”.`);
      else errors.push(`${blockLabel}: informe portKey para a entrada ambígua “${input.label}”.`);
    }
  }
  if (block.type === "VALIDAR") {
    const targetOutput = validationTarget?.outputs?.find(
      (output) => output.key === block.validation?.targetOutputKey,
    );
    if (targetOutput) {
      const candidates = capability.inputPorts.filter(
        (port) =>
          legacyTypeListAccepts(port.acceptedTypes, targetOutput.type) &&
          !assignedInputPorts.has(port.key),
      );
      if (block.validation?.targetPortKey) {
        const selected = candidates.find((port) => port.key === block.validation?.targetPortKey);
        if (!selected)
          errors.push(`${blockLabel}: porta do alvo de validação é incompatível ou está ocupada.`);
        else {
          assignedInputPorts.add(selected.key);
          if (!selected.multiple) occupiedInputPorts.add(selected.key);
        }
      } else if (candidates.length === 1) {
        block.validation!.targetPortKey = candidates[0].key;
        assignedInputPorts.add(candidates[0].key);
        if (!candidates[0].multiple) occupiedInputPorts.add(candidates[0].key);
      } else if (candidates.length === 0) {
        errors.push(`${blockLabel}: nenhuma porta aceita o alvo de validação.`);
      } else {
        errors.push(`${blockLabel}: informe targetPortKey para o alvo de validação ambíguo.`);
      }
    } else if (block.validation?.targetPortKey) {
      errors.push(`${blockLabel}: targetPortKey exige targetOutputKey válido.`);
    }
  }
  for (const output of block.outputs ?? []) {
    const candidates = capability.outputPorts.filter((port) =>
      legacyTypeListAccepts(port.producedTypes, output.type),
    );
    if (output.portKey) {
      if (!candidates.some((port) => port.key === output.portKey))
        errors.push(`${blockLabel}: porta da saída “${output.label}” é incompatível.`);
    } else if (candidates.length === 1) output.portKey = candidates[0].key;
    else if (candidates.length === 0)
      errors.push(`${blockLabel}: nenhuma porta produz a saída “${output.label}”.`);
    else errors.push(`${blockLabel}: informe portKey para a saída ambígua “${output.label}”.`);
  }
  for (const port of capability.inputPorts.filter((item) => item.required)) {
    if (!assignedInputPorts.has(port.key))
      errors.push(`${blockLabel}: falta a entrada obrigatória do plugin “${port.label}”.`);
  }
  for (const port of capability.outputPorts.filter((item) => item.required)) {
    if (!(block.outputs ?? []).some((output) => output.portKey === port.key))
      errors.push(`${blockLabel}: falta a saída obrigatória do plugin “${port.label}”.`);
  }
  const configSchema = capability.blockConfigSchema;
  for (const key of configSchema.required ?? []) {
    if (block.plugin.configuration[key] === undefined || block.plugin.configuration[key] === "") {
      errors.push(`${blockLabel}: falta a configuração obrigatória do plugin “${key}”.`);
    }
  }
}

export function validateBuilderMethods(input: {
  channel: Channel;
  methods: unknown;
  plugins: BuilderPluginContext[];
  collections: StrategicCollection[];
}): BuilderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const record = z.record(methodSchema).safeParse(input.methods);
  if (!record.success) {
    return {
      ok: false,
      errors: record.error.issues.map(
        (issue) => `${issue.path.join(".") || "methods"}: ${issue.message}`,
      ),
      warnings,
    };
  }
  const entries = Object.entries(record.data);
  if (!entries.length) return { ok: false, errors: ["Informe pelo menos um Método."], warnings };
  const methods: Partial<Record<UniversalProcess, ProcessMethod>> = {};
  const order = effectiveProcessOrder(input.channel);
  for (const [key, rawMethod] of entries) {
    if (!PROCESS_ORDER.includes(key as UniversalProcess)) {
      errors.push(`Processo universal desconhecido: “${key}”.`);
      continue;
    }
    const processType = key as UniversalProcess;
    if (rawMethod.processType !== processType) {
      errors.push(`${processType}: processType deve ser “${processType}”.`);
      continue;
    }
    const adapted = adaptLegacyMethod({ ...rawMethod, processType } as ProcessMethod, {
      source: "builder",
      recoverHistoricalValidationTarget: false,
      resolveCapability: (pluginId, capabilityId) => {
        const entry = input.plugins.find((candidate) => candidate.plugin.id === pluginId);
        const capability = entry?.plugin.manifest.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );
        return capability
          ? { pluginVersion: entry?.plugin.manifest.version, capability }
          : undefined;
      },
    });
    if (!adapted.ok || !adapted.complete) {
      if (!adapted.ok)
        errors.push(...adapted.diagnostics.map((item) => `${processType}: ${item.message}`));
      else errors.push(`${processType}: o contrato do Método não pôde ser materializado.`);
      continue;
    }
    const blocks = normalizeMethodBlocks(adapted.method.blocks, processType);
    const method: ProcessMethod = { ...adapted.method, processType, blocks };
    methods[processType] = method;
    const ids = new Set<string>();
    for (const [index, block] of blocks.entries()) {
      const label = `${processType}/${block.name ?? block.type}`;
      if (ids.has(block.id)) errors.push(`${label}: id de bloco duplicado.`);
      ids.add(block.id);
      if (block.order !== index) errors.push(`${label}: order deve ser ${index}.`);
      if (
        block.type === "ESCOLHER" &&
        block.collectionId &&
        !input.collections.some((item) => item.id === block.collectionId)
      ) {
        errors.push(`${label}: coleção estratégica não encontrada.`);
      }
      for (const binding of block.inputs ?? []) {
        const source = binding.binding;
        const sourceKind = source?.kind;
        if (
          sourceKind === "static" &&
          (source?.kind === "static" ? !source.value.trim() : !binding.staticValue?.trim())
        )
          errors.push(`${label}: a entrada estática “${binding.label}” não possui valor.`);
        if (sourceKind === "previous_block") {
          const sourceBlockId = source?.kind === "previous_block" ? source.blockId : undefined;
          const sourceOutputKey = source?.kind === "previous_block" ? source.outputKey : undefined;
          const sourceIndex = blocks.findIndex((candidate) => candidate.id === sourceBlockId);
          const sourceOutput = blocks[sourceIndex]?.outputs?.find(
            (item) => item.key === sourceOutputKey,
          );
          if (sourceIndex < 0 || sourceIndex >= index || !sourceOutput)
            errors.push(`${label}: referência inválida na entrada “${binding.label}”.`);
          else if (!compatibleType(sourceOutput.type, binding.type))
            errors.push(`${label}: tipo incompatível na entrada “${binding.label}”.`);
        }
      }
      const validationTarget =
        block.type === "VALIDAR"
          ? blocks.find((candidate) => candidate.id === block.validation?.targetBlockId)
          : undefined;
      validatePluginConfiguration(label, block, validationTarget, input.plugins, errors, warnings);
    }
    const issue = getMethodConfigurationIssue(method);
    if (issue) errors.push(`${processType}: ${issue}`);
    const finalOutput = BUILDER_METHOD_CONTRACT.processOutputs[processType];
    if (
      !blocks.some((block) =>
        block.outputs?.some(
          (output) => output.key === finalOutput.key && output.type === finalOutput.type,
        ),
      )
    ) {
      warnings.push(
        `${processType}: nenhum bloco entrega diretamente ${finalOutput.key} (${finalOutput.type}); a saída final dependerá do preenchimento humano.`,
      );
    }
  }
  errors.push(...validateProcessDependencies(order, { ...input.channel.methods, ...methods }));
  return {
    ok: errors.length === 0,
    methods,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
