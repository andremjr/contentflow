import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob, isPluginJobTimedOut, PluginJobStore } from "./plugin-job-store";

const directory = await mkdtemp(path.join(tmpdir(), "contentflow-plugin-jobs-"));
const databasePath = path.join(directory, "jobs.sqlite");
let openDatabase: Database.Database | undefined;

function request(attempt = 1): PluginExecutionRequest {
  return {
    executionId: "execution-1",
    traceId: "trace-1",
    blockId: "block-1",
    capabilityId: "async-capability",
    attempt,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: {},
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel-1", name: "Canal", language: "pt-BR", niche: "test" },
      project: { id: "project-1", title: "Projeto" },
      processType: "theme",
      block: { type: "CRIAR", name: "Criar", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

try {
  const firstDatabase = new Database(databasePath);
  openDatabase = firstDatabase;
  const firstStore = new PluginJobStore(firstDatabase);
  const now = new Date("2026-08-10T12:00:00.000Z");
  const created = firstStore.create(
    createPersistentPluginJob({
      pluginId: "plugin.example",
      pluginVersion: "1.0.0",
      request: request(),
      timeoutMs: 60_000,
      now,
    }),
  );
  assert.equal(created.status, "starting");
  assert.equal(created.retryCount, 0);
  assert.equal(isPluginJobTimedOut(created, new Date(now.getTime() + 59_999)), false);
  assert.equal(isPluginJobTimedOut(created, new Date(now.getTime() + 60_000)), true);

  const duplicate = firstStore.create(
    createPersistentPluginJob({
      pluginId: "plugin.example",
      pluginVersion: "1.0.0",
      request: { ...request(), traceId: "trace-duplicate" },
      timeoutMs: 60_000,
      now,
    }),
  );
  assert.equal(duplicate.id, created.id, "start deve ser idempotente por execução/bloco/tentativa");

  const firstClaim = firstStore.claim(created.id, now);
  assert.ok(firstClaim);
  assert.equal(firstStore.claim(created.id, now), undefined, "um lease impede retomada simultânea");
  firstDatabase.close();
  openDatabase = undefined;

  const restartedDatabase = new Database(databasePath);
  openDatabase = restartedDatabase;
  const restartedStore = new PluginJobStore(restartedDatabase);
  assert.equal(restartedStore.get(created.id)?.traceId, "trace-1", "job persiste no reinício");
  assert.equal(restartedStore.recoverInterrupted(now), 1);
  const recoveredClaim = restartedStore.claim(created.id, now);
  assert.ok(recoveredClaim, "lease interrompido é recuperado no reinício");
  const pending = restartedStore.save(recoveredClaim, {
    ...recoveredClaim.job,
    status: "pending",
    jobId: "provider-job-1",
    progress: 0.4,
    message: "Gerando imagens",
    partialValues: { images: [] },
    retryCount: 1,
    nextPollAt: now.toISOString(),
  });
  assert.equal(pending.progress, 0.4);
  assert.equal(restartedStore.requestCancellation(pending.executionId, now), 1);
  assert.equal(restartedStore.get(pending.id)?.status, "cancel_requested");
  assert.equal(restartedStore.get(pending.id)?.cancelRequested, true);

  const cancelClaim = restartedStore.claim(pending.id, now);
  assert.ok(cancelClaim);
  restartedStore.save(cancelClaim, {
    ...cancelClaim.job,
    status: "cancelled",
    nextPollAt: new Date("9999-12-31T23:59:59.999Z").toISOString(),
  });

  const racing = restartedStore.create(
    createPersistentPluginJob({
      pluginId: "plugin.example",
      pluginVersion: "1.0.0",
      request: request(2),
      timeoutMs: 60_000,
      now,
    }),
  );
  const racingClaim = restartedStore.claim(racing.id, now);
  assert.ok(racingClaim);
  restartedStore.requestCancellation(racing.executionId, now);
  const cancellationWon = restartedStore.save(racingClaim, {
    ...racingClaim.job,
    status: "pending",
    jobId: "provider-job-race",
  });
  assert.equal(
    cancellationWon.status,
    "cancel_requested",
    "cancelamento não pode ser perdido por um resume concorrente",
  );
  const racingCancelClaim = restartedStore.claim(racing.id, now);
  assert.ok(racingCancelClaim);
  restartedStore.save(racingCancelClaim, {
    ...racingCancelClaim.job,
    status: "cancelled",
  });
  assert.equal(
    restartedStore.deleteTerminalBefore(new Date("9999-12-31T23:59:59.999Z")),
    2,
    "jobs terminais abandonados são limpos por retenção",
  );
  restartedDatabase.close();
  openDatabase = undefined;

  console.log(
    "Jobs persistentes: reinício, idempotência, lease, cancelamento, timeout e limpeza aprovados.",
  );
} finally {
  openDatabase?.close();
  await rm(directory, { recursive: true, force: true });
}
