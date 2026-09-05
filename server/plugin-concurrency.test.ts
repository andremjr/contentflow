import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";
import type { RegisteredPlugin } from "./plugin-runner";
import { pluginConcurrencySlot } from "./plugin-concurrency";

function plugin(capabilityIds: string[], withProfiles = true): RegisteredPlugin {
  return {
    id: "local.browser",
    source: "local",
    directory: "browser",
    absoluteDirectory: "C:\\browser",
    entrypoint: "handler.mjs",
    executable: true,
    manifest: {
      apiVersion: "1",
      id: "local.browser",
      name: "Browser",
      version: "1.0.0",
      description: "test",
      author: "test",
      license: "test",
      runtime: { kind: "node", version: ">=26 <27", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      profileSetup: withProfiles
        ? { configurationKey: "accountProfile", label: "Conta" }
        : undefined,
      capabilities: capabilityIds.map((id) => ({
        id,
        operator: "Código",
        blockTypes: ["CRIAR"],
        inputPorts: [],
        outputPorts: [],
        execution: { mode: "immediate", maxConcurrency: id === "wide" ? 3 : 1 },
        sideEffects: [],
        cost: { model: "free", estimateSupported: false },
        dataPolicy: { sendsDataToThirdParties: false },
        blockConfigSchema: { type: "object" },
        outputSchema: { type: "object" },
      })),
    } satisfies PluginManifest,
  };
}

function job(capabilityId: string, profile = "principal"): PersistentPluginJob {
  return {
    id: `${capabilityId}-${profile}`,
    pluginId: "local.browser",
    pluginVersion: "1.0.0",
    capabilityId,
    executionId: "execution",
    blockId: "block",
    attempt: 1,
    traceId: "trace",
    request: {
      executionId: "execution",
      traceId: "trace",
      blockId: "block",
      capabilityId,
      attempt: 1,
      invocation: { mode: "start" },
      configuration: { accountProfile: profile },
      settings: {},
      inputs: {},
      inputContract: [],
      inputDeliveries: [],
      outputContract: [],
      unresolvedInstructionVariables: [],
      context: {
        locale: "pt-BR",
        timeZone: "America/Sao_Paulo",
        channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "test" },
        project: { id: "project", title: "Projeto" },
        processType: "theme",
        block: { type: "CRIAR", name: "Criar", instructions: "" },
        previousProcessOutputs: [],
        previousBlockOutputs: [],
      },
    },
    status: "starting",
    nextPollAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("serializa capabilities diferentes que usam o mesmo perfil de navegador", () => {
  const registered = plugin(["text", "image"]);
  assert.deepEqual(pluginConcurrencySlot(registered, job("text")), {
    key: "local.browser:profile:principal",
    limit: 1,
  });
  assert.deepEqual(pluginConcurrencySlot(registered, job("image")), {
    key: "local.browser:profile:principal",
    limit: 1,
  });
});

test("isola a concorrência de perfis dedicados diferentes", () => {
  const registered = plugin(["text"]);
  assert.notEqual(
    pluginConcurrencySlot(registered, job("text", "principal")).key,
    pluginConcurrencySlot(registered, job("text", "secundaria")).key,
  );
});

test("usa o perfil ativo do fallback e respeita maxConcurrency declarado", () => {
  const current = job("wide");
  current.profileFallback = {
    configurationKey: "accountProfile",
    candidates: ["principal", "reserva"],
    activeIndex: 1,
    history: [],
  };
  assert.deepEqual(pluginConcurrencySlot(plugin(["wide"]), current), {
    key: "local.browser:profile:reserva",
    limit: 3,
  });
});

test("capability sem perfil recebe isolamento próprio e limite seguro por padrão", () => {
  const registered = plugin(["text"], false);
  registered.manifest.capabilities[0].execution.maxConcurrency = undefined;
  assert.deepEqual(pluginConcurrencySlot(registered, job("text")), {
    key: "local.browser:capability:text",
    limit: 1,
  });
});
