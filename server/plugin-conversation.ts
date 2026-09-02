import type {
  ActionBlock,
  BlockExecution,
  ProcessExecution,
  UniversalProcess,
} from "../src/lib/domain";
import { PROCESS_ORDER } from "../src/lib/domain";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import { retryFeedbackText } from "../src/lib/retry-feedback";
import { pluginConversationFallbackContext } from "../src/lib/conversation-context";

export function resolvePluginConversation(input: {
  block: ActionBlock;
  blockExecution: BlockExecution;
  execution: ProcessExecution;
  projectExecutions: ProcessExecution[];
  pluginId: string;
  supportsContinuation: boolean;
  profileSetup?: PluginManifest["profileSetup"];
}): PluginExecutionRequest["conversation"] {
  const continuationMessage =
    input.blockExecution.retryMode === "conversation_feedback"
      ? retryFeedbackText(input.blockExecution.retryFeedback)
      : undefined;
  if (input.blockExecution.retryMode === "conversation_feedback" && input.supportsContinuation) {
    const ownConversation = input.blockExecution.pluginConversation;
    const fallbackContext =
      input.blockExecution.retryConversationContext ?? ownConversation?.fallbackContext;
    if (!ownConversation?.id) return { mode: "new", fallbackContext, continuationMessage };
    return conversationForProfile({
      block: input.block,
      profileSetup: input.profileSetup,
      conversation: ownConversation,
      fallbackContext,
      continuationMessage,
    });
  }

  const reuse = input.block.plugin?.conversation;
  if (!reuse || reuse.mode === "new") return { mode: "new" };
  if (!input.supportsContinuation)
    throw new Error("Esta capacidade não permite continuar outra conversa.");

  const sourceExecution = [...input.projectExecutions]
    .filter((item) => item.processType === reuse.sourceProcessType)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((item) => item.id === input.execution.id || item.outputStatus === "completed");
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
  const fallbackContext =
    sourceConversation.fallbackContext ??
    pluginConversationFallbackContext(sourceBlock, sourceBlockExecution?.values ?? {});
  return conversationForProfile({
    block: input.block,
    profileSetup: input.profileSetup,
    conversation: sourceConversation,
    fallbackContext,
  });
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

function conversationForProfile(input: {
  block: ActionBlock;
  profileSetup?: PluginManifest["profileSetup"];
  conversation: NonNullable<BlockExecution["pluginConversation"]>;
  fallbackContext?: string;
  continuationMessage?: string;
}): PluginExecutionRequest["conversation"] {
  const configurationKey = input.profileSetup?.configurationKey;
  const requestedProfile = configurationKey
    ? String(input.block.plugin?.configuration[configurationKey] ?? "").trim()
    : "";
  if (
    input.conversation.profile &&
    requestedProfile &&
    input.conversation.profile !== requestedProfile
  ) {
    return {
      mode: "new",
      fallbackContext: input.fallbackContext,
      continuationMessage: input.continuationMessage,
    };
  }
  return {
    mode: "reuse",
    id: input.conversation.id,
    sourceProfile: input.conversation.profile,
    fallbackContext: input.fallbackContext,
    continuationMessage: input.continuationMessage,
  };
}
