import type { ActionBlock, ProcessExecution, UniversalProcess } from "../src/lib/domain";
import { PROCESS_ORDER } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";

export function resolvePluginConversation(input: {
  block: ActionBlock;
  execution: ProcessExecution;
  projectExecutions: ProcessExecution[];
  pluginId: string;
  supportsContinuation: boolean;
}): PluginExecutionRequest["conversation"] {
  const reuse = input.block.plugin?.conversation;
  if (!reuse || reuse.mode === "new") return { mode: "new" };
  if (!input.supportsContinuation)
    throw new Error("Esta capacidade não permite continuar outra conversa.");

  const sourceExecution = input.projectExecutions.find(
    (item) => item.processType === reuse.sourceProcessType,
  );
  const sourceBlock = sourceExecution?.methodSnapshot.blocks.find(
    (item) => item.id === reuse.sourceBlockId,
  );
  const sourceBlockExecution = sourceExecution?.blocks.find(
    (item) => item.blockId === reuse.sourceBlockId,
  );
  const sourceConversation = sourceBlockExecution?.pluginConversation;
  const sourcePrecedesCurrent = sourceExecution
    ? precedes(
        sourceExecution.processType,
        sourceExecution.methodSnapshot.blocks.findIndex((item) => item.id === sourceBlock?.id),
        input.execution.processType,
        input.execution.methodSnapshot.blocks.findIndex((item) => item.id === input.block.id),
      )
    : false;
  if (
    !sourcePrecedesCurrent ||
    sourceBlock?.plugin?.pluginId !== input.pluginId ||
    sourceConversation?.pluginId !== input.pluginId ||
    sourceConversation.connectionId !== input.block.plugin?.connectionId ||
    !sourceConversation.id
  )
    throw new Error(
      "A conversa escolhida ainda não existe ou pertence a outro plugin, conta ou bloco posterior.",
    );
  return { mode: "reuse", id: sourceConversation.id };
}

export function normalizePluginConversationId(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 4_096 ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("O plugin devolveu uma referência de conversa inválida.");
  return value;
}

function precedes(
  sourceProcess: UniversalProcess,
  sourceBlockIndex: number,
  targetProcess: UniversalProcess,
  targetBlockIndex: number,
) {
  const sourceProcessIndex = PROCESS_ORDER.indexOf(sourceProcess);
  const targetProcessIndex = PROCESS_ORDER.indexOf(targetProcess);
  return (
    sourceProcessIndex < targetProcessIndex ||
    (sourceProcessIndex === targetProcessIndex &&
      sourceBlockIndex >= 0 &&
      sourceBlockIndex < targetBlockIndex)
  );
}
