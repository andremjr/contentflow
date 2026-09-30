import { z } from "zod";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type Channel,
  type ProcessMethod,
  type StrategicCollection,
  type UniversalProcess,
} from "../src/lib/domain";
import { getMethodConfigurationIssue, normalizeMethodBlocks } from "../src/lib/human-workflow";
import { areValueShapesCompatible } from "../src/lib/data-shape";
import { processMethodV3Schema } from "../src/lib/method-contract-v3";
import { effectiveProcessOrder, validateProcessDependencies } from "../src/lib/process-order";
import type { RegisteredPlugin } from "./plugin-runner";
import { pluginConnectionRequired } from "../src/lib/plugin-contract";
import { validateLocalProfileExecution } from "./profile-execution-policy";
const methodSchema = processMethodV3Schema.refine((method) => method.blocks.length > 0, {
  message: "O Método precisa ter pelo menos um bloco.",
  path: ["blocks"],
});

export const BUILDER_METHOD_CONTRACT = {
  universalProcesses: PROCESS_ORDER.map((id) => ({ id, label: PROCESS_META[id].label })),
  blockTypes: ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"],
  operators: ["IA", "Humano", "Código"],
  processOutputs: {
    theme: { key: "theme", shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" } },
    title: { key: "title", shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" } },
    thumbnail: { key: "thumbnail", shape: { kind: "content", family: "image", cardinality: "one", representation: "artifact" } },
    script: { key: "script", shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" } },
    narration: { key: "audio", shape: { kind: "content", family: "audio", cardinality: "one", representation: "artifact" } },
    assets: { key: "assets", shape: { kind: "content", family: "image", cardinality: "many", representation: "artifact" } },
    editing: { key: "video", shape: { kind: "content", family: "video", cardinality: "one", representation: "artifact" } },
    publishing: { key: "url", shape: { kind: "control", control: "url", cardinality: "one" } },
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
      areValueShapesCompatible(input.shape, port.shape),
    );
    if (input.portKey) {
      const selected = compatible.find((port) => port.key === input.portKey);
      if (!selected)
        errors.push(`${blockLabel}: porta da entrada “${input.label}” é incompatível.`);
      else if (occupiedInputPorts.has(selected.key))
        errors.push(`${blockLabel}: a porta da entrada “${input.label}” já está ocupada.`);
      else {
        assignedInputPorts.add(selected.key);
        occupiedInputPorts.add(selected.key);
      }
    } else {
      const candidates = compatible.filter(
        (port) => !occupiedInputPorts.has(port.key),
      );
      if (candidates.length === 1) {
        const selected = candidates[0];
        input.portKey = selected.key;
        assignedInputPorts.add(selected.key);
        occupiedInputPorts.add(selected.key);
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
          areValueShapesCompatible(targetOutput.shape, port.shape) &&
          !assignedInputPorts.has(port.key),
      );
      if (block.validation?.targetPortKey) {
        const selected = candidates.find((port) => port.key === block.validation?.targetPortKey);
        if (!selected)
          errors.push(`${blockLabel}: porta do alvo de validação é incompatível ou está ocupada.`);
        else {
          assignedInputPorts.add(selected.key);
          occupiedInputPorts.add(selected.key);
        }
      } else if (candidates.length === 1) {
        block.validation!.targetPortKey = candidates[0].key;
        assignedInputPorts.add(candidates[0].key);
        occupiedInputPorts.add(candidates[0].key);
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
      areValueShapesCompatible(port.shape, output.shape),
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
    const blocks = normalizeMethodBlocks(rawMethod.blocks, processType);
    const method: ProcessMethod = { ...rawMethod, processType, blocks };
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
          !source.value.trim()
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
          else if (!areValueShapesCompatible(sourceOutput.shape, binding.shape))
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
          (output) =>
            output.key === finalOutput.key &&
            areValueShapesCompatible(output.shape, finalOutput.shape),
        ),
      )
    ) {
      warnings.push(
        `${processType}: nenhum bloco entrega diretamente ${finalOutput.key} no shape canônico; a saída final dependerá do preenchimento humano.`,
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
