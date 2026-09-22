import {
  PROCESS_ORDER,
  type Channel,
  type HumanFieldType,
  type ProcessMethod,
  type ProcessState,
  type Project,
  type UniversalProcess,
} from "./domain";
import { createProcessOutputFields } from "./human-workflow";

export function isProcessOrder(value: unknown): value is UniversalProcess[] {
  return (
    Array.isArray(value) &&
    value.length === PROCESS_ORDER.length &&
    new Set(value).size === PROCESS_ORDER.length &&
    value.every((item) => PROCESS_ORDER.includes(item))
  );
}

/** Legacy channels are interpreted at read time; they are never migrated on load. */
export function effectiveProcessOrder(channel: Pick<Channel, "processOrder">): UniversalProcess[] {
  if (channel.processOrder === undefined) return [...PROCESS_ORDER];
  if (!isProcessOrder(channel.processOrder)) throw new Error("Ordem dos Processos inválida.");
  return [...channel.processOrder];
}

export function usesHistoricalProcessOrder(channel: Pick<Channel, "processOrder">): boolean {
  return effectiveProcessOrder(channel).every((id, index) => id === PROCESS_ORDER[index]);
}

/** An old started project keeps its original order. An unstarted project follows its Channel. */
export function projectProcessOrder(
  project: Pick<Project, "strategySnapshot" | "stages">,
  channel?: Pick<Channel, "processOrder">,
): UniversalProcess[] {
  if (project.strategySnapshot) return [...project.strategySnapshot.processOrder];
  if (channel && PROCESS_ORDER.every((id) => project.stages[id] === "not_started"))
    return effectiveProcessOrder(channel);
  return [...PROCESS_ORDER];
}

export function nextExecutableProcess(
  order: readonly UniversalProcess[],
  stages: Record<UniversalProcess, ProcessState>,
  runFrom?: UniversalProcess,
  runThrough?: UniversalProcess,
): UniversalProcess | undefined {
  const first = runFrom ? order.indexOf(runFrom) : 0;
  const last = runThrough ? order.indexOf(runThrough) : order.length - 1;
  if (first < 0 || last < first) return undefined;
  return order.slice(first, last + 1).find((id) => !["done", "approved"].includes(stages[id]));
}

export function completedProcessProgress(stages: Record<UniversalProcess, ProcessState>) {
  return Math.round(
    (PROCESS_ORDER.filter((id) => ["done", "approved"].includes(stages[id])).length /
      PROCESS_ORDER.length) *
      100,
  );
}

export function captureProjectStrategy(project: Project, channel: Channel, hasExecution: boolean) {
  if (project.strategySnapshot || hasExecution) return;
  project.strategySnapshot = {
    processOrder: effectiveProcessOrder(channel),
    methods: structuredClone(channel.methods),
    definitionRevision: channel.definitionRevision ?? 0,
    capturedAt: new Date().toISOString(),
  };
}

function compatible(source: HumanFieldType, target: HumanFieldType) {
  return source === target || (source === "text" && target === "textarea");
}

/** Inspect only the final channel definition; never mutate an old reference. */
export function validateProcessDependencies(
  order: readonly UniversalProcess[],
  methods: Partial<Record<UniversalProcess, ProcessMethod>>,
  targets: readonly UniversalProcess[] = order,
): string[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  const errors: string[] = [];
  for (const processType of targets) {
    const blocks = methods[processType]?.blocks ?? [];
    for (const [index, block] of blocks.entries()) {
      const label = `${processType}/${block.name ?? block.type}`;
      for (const input of block.inputs ?? []) {
        if (input.source !== "previous_process") continue;
        const source = input.sourceProcessType;
        if (!source || (positions.get(source) ?? Infinity) >= (positions.get(processType) ?? -1)) {
          errors.push(`${label}: processo anterior inválido na entrada “${input.label}”.`);
          continue;
        }
        const output =
          input.blockId === "__process_output__"
            ? createProcessOutputFields(source).find((field) => field.key === input.sourceKey)
            : methods[source]?.blocks
                .find((candidate) => candidate.id === input.blockId)
                ?.outputs?.find((field) => field.key === input.sourceKey);
        if (!output) errors.push(`${label}: saída anterior não encontrada para “${input.label}”.`);
        else if (!compatible(output.type, input.type))
          errors.push(`${label}: tipo incompatível na entrada “${input.label}”.`);
      }
      const reuse = block.plugin?.conversation;
      if (reuse?.mode !== "reuse") continue;
      const sourceIndex = positions.get(reuse.sourceProcessType) ?? Infinity;
      const sourceBlockIndex =
        methods[reuse.sourceProcessType]?.blocks.findIndex(
          (candidate) => candidate.id === reuse.sourceBlockId,
        ) ?? -1;
      const earlier =
        sourceIndex < (positions.get(processType) ?? -1) ||
        (reuse.sourceProcessType === processType &&
          sourceBlockIndex >= 0 &&
          sourceBlockIndex < index);
      const sourceBlock = methods[reuse.sourceProcessType]?.blocks[sourceBlockIndex];
      if (
        !earlier ||
        !sourceBlock ||
        sourceBlock.plugin?.pluginId !== block.plugin?.pluginId ||
        sourceBlock.plugin?.connectionId !== block.plugin?.connectionId
      ) {
        errors.push(`${label}: conversa de origem ausente, posterior ou de outro plugin/conexão.`);
      }
    }
  }
  return [...new Set(errors)];
}

export function resolveProcessOrderForMethods(
  preferredOrder: readonly UniversalProcess[],
  methods: Partial<Record<UniversalProcess, ProcessMethod>>,
): UniversalProcess[] | undefined {
  const base = isProcessOrder(preferredOrder) ? [...preferredOrder] : [...PROCESS_ORDER];
  const priority = new Map(base.map((processType, index) => [processType, index]));
  const outgoing = new Map(
    PROCESS_ORDER.map((processType) => [processType, new Set<UniversalProcess>()]),
  );
  const incoming = new Map(PROCESS_ORDER.map((processType) => [processType, 0]));

  const addEdge = (source: UniversalProcess | undefined, target: UniversalProcess) => {
    if (!source || source === target) return;
    const targets = outgoing.get(source)!;
    if (targets.has(target)) return;
    targets.add(target);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  };

  for (const processType of PROCESS_ORDER) {
    for (const block of methods[processType]?.blocks ?? []) {
      for (const input of block.inputs ?? []) {
        if (input.source === "previous_process") addEdge(input.sourceProcessType, processType);
      }
      const conversation = block.plugin?.conversation;
      if (conversation?.mode === "reuse") addEdge(conversation.sourceProcessType, processType);
    }
  }

  const available = PROCESS_ORDER.filter((processType) => incoming.get(processType) === 0).sort(
    (a, b) => (priority.get(a) ?? 0) - (priority.get(b) ?? 0),
  );
  const result: UniversalProcess[] = [];
  while (available.length) {
    const processType = available.shift()!;
    result.push(processType);
    for (const target of outgoing.get(processType) ?? []) {
      const next = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, next);
      if (next === 0) {
        available.push(target);
        available.sort((a, b) => (priority.get(a) ?? 0) - (priority.get(b) ?? 0));
      }
    }
  }
  return result.length === PROCESS_ORDER.length ? result : undefined;
}
