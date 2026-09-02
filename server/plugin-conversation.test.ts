import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessExecution } from "../src/lib/domain";
import { normalizePluginConversationId, resolvePluginConversation } from "./plugin-conversation";

const source: ActionBlock = {
  id: "create-1",
  type: "CRIAR",
  operator: "IA",
  name: "Criar",
  parameters: [],
  order: 0,
  plugin: { pluginId: "browser", capabilityId: "text", configuration: {}, connectionId: "account" },
};
const target: ActionBlock = {
  ...source,
  id: "validate-2",
  type: "VALIDAR",
  order: 1,
  plugin: {
    ...source.plugin!,
    conversation: { mode: "reuse", sourceProcessType: "script", sourceBlockId: source.id },
  },
};
const execution: ProcessExecution = {
  id: "execution",
  projectId: "project",
  channelId: "channel",
  processType: "script",
  methodSnapshot: { processType: "script", blocks: [source, target] },
  blocks: [
    {
      blockId: source.id,
      status: "completed",
      values: {},
      pluginConversation: {
        pluginId: "browser",
        connectionId: "account",
        id: "https://provider.test/c/123",
      },
    },
    { blockId: target.id, status: "blocked_executor", values: {} },
  ],
  status: "blocked_executor",
  outputStatus: "pending",
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

test("reutiliza somente conversa opaca de bloco anterior compatível", () => {
  assert.deepEqual(
    resolvePluginConversation({
      block: target,
      blockExecution: execution.blocks[1],
      execution,
      projectExecutions: [execution],
      pluginId: "browser",
      supportsContinuation: true,
    }),
    {
      mode: "reuse",
      id: "https://provider.test/c/123",
      sourceProfile: undefined,
      fallbackContext: "CONTEXTO DA CONVERSA ANTERIOR — Criar",
      continuationMessage: undefined,
    },
  );
});

test("bloqueia troca de conta e referência futura", () => {
  const wrongAccount = structuredClone(target);
  wrongAccount.plugin!.connectionId = "other";
  assert.throws(
    () =>
      resolvePluginConversation({
        block: wrongAccount,
        blockExecution: execution.blocks[1],
        execution,
        projectExecutions: [execution],
        pluginId: "browser",
        supportsContinuation: true,
      }),
    /outro plugin, conta/,
  );
  const future = structuredClone(source);
  future.plugin!.conversation = {
    mode: "reuse",
    sourceProcessType: "script",
    sourceBlockId: target.id,
  };
  assert.throws(
    () =>
      resolvePluginConversation({
        block: future,
        blockExecution: execution.blocks[0],
        execution,
        projectExecutions: [execution],
        pluginId: "browser",
        supportsContinuation: true,
      }),
    /bloco posterior/,
  );
});

test("abre conversa nova com contexto quando o perfil mudou", () => {
  const profiledSource = structuredClone(source);
  profiledSource.plugin!.configuration.accountProfile = "principal";
  const profiledTarget = structuredClone(target);
  profiledTarget.plugin!.configuration.accountProfile = "reserva";
  const profiledExecution = structuredClone(execution);
  profiledExecution.methodSnapshot.blocks = [profiledSource, profiledTarget];
  profiledExecution.blocks[0].pluginConversation = {
    ...profiledExecution.blocks[0].pluginConversation!,
    profile: "principal",
    fallbackContext: "Título: Como começar",
  };
  assert.deepEqual(
    resolvePluginConversation({
      block: profiledTarget,
      blockExecution: profiledExecution.blocks[1],
      execution: profiledExecution,
      projectExecutions: [profiledExecution],
      pluginId: "browser",
      supportsContinuation: true,
      profileSetup: { configurationKey: "accountProfile", label: "Perfil" },
    }),
    { mode: "new", fallbackContext: "Título: Como começar", continuationMessage: undefined },
  );
});

test("repete no mesmo chat enviando somente as observações", () => {
  const retryExecution = structuredClone(execution);
  const retryBlock = retryExecution.blocks[0];
  retryBlock.retryMode = "conversation_feedback";
  retryBlock.retryFeedback = { decision: "rejected", feedback: "Deixe a promessa específica." };
  retryBlock.retryConversationContext = "Resultado anterior: título genérico";
  assert.deepEqual(
    resolvePluginConversation({
      block: source,
      blockExecution: retryBlock,
      execution: retryExecution,
      projectExecutions: [retryExecution],
      pluginId: "browser",
      supportsContinuation: true,
    }),
    {
      mode: "reuse",
      id: "https://provider.test/c/123",
      sourceProfile: undefined,
      fallbackContext: "Resultado anterior: título genérico",
      continuationMessage: "Deixe a promessa específica.",
    },
  );
});

test("rejeita referências vazias, enormes ou com controles", () => {
  assert.equal(normalizePluginConversationId("opaque-conversation"), "opaque-conversation");
  assert.throws(() => normalizePluginConversationId(""), /inválida/);
  assert.throws(() => normalizePluginConversationId("a".repeat(4_097)), /inválida/);
  assert.throws(() => normalizePluginConversationId("bad\nvalue"), /inválida/);
});
