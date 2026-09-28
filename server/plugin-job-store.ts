import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  BlockExecutionItem,
  BlockItemRetryScope,
  RuntimeValue,
  StoredFile,
} from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import type { ResolvedProfileExecutionSnapshot } from "./profile-execution-policy";
import {
  cancelProfileLanePool,
  recoverProfileLanePool,
  type ProfileLanePoolSnapshot,
} from "./profile-lane-pool";

export type PluginJobStatus =
  "starting" | "pending" | "cancel_requested" | "completed" | "failed" | "cancelled" | "abandoned";

export type PluginDiagnosticEvent = {
  at: string;
  code:
    | "JOB_CREATED"
    | "PLUGIN_RETRY_SCHEDULED"
    | "PROFILE_SWITCH"
    | "JOB_COMPLETED"
    | "JOB_FAILED"
    | "JOB_CANCELLED"
    | "BRIDGE_CONTROLLED_RELOAD"
    | "BRIDGE_WORKER_RESTART";
  reasonCode?: string;
  profileId?: string;
  previousProfileId?: string;
  attempt?: number;
};

const SAFE_DIAGNOSTIC_REASON = /^[A-Z0-9_]{1,96}$/;
const SAFE_DIAGNOSTIC_ID = /^[A-Za-z0-9._:-]{1,160}$/;

/**
 * Diagnostics are persisted with a job and can later be exposed through the
 * execution diagnostic endpoint. Keep the persisted representation allowlisted
 * too; export-time redaction alone would leave sensitive values in SQLite and
 * in the regular job-state response.
 */
export function sanitizePluginDiagnostic(
  event: PluginDiagnosticEvent,
): PluginDiagnosticEvent | undefined {
  if (!Number.isFinite(Date.parse(event.at))) return undefined;
  if (event.reasonCode && !SAFE_DIAGNOSTIC_REASON.test(event.reasonCode)) return undefined;
  if (event.profileId && !SAFE_DIAGNOSTIC_ID.test(event.profileId)) return undefined;
  if (event.previousProfileId && !SAFE_DIAGNOSTIC_ID.test(event.previousProfileId))
    return undefined;
  if (event.attempt !== undefined && (!Number.isInteger(event.attempt) || event.attempt < 1)) {
    return undefined;
  }
  return {
    at: event.at,
    code: event.code,
    ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
    ...(event.profileId ? { profileId: event.profileId } : {}),
    ...(event.previousProfileId ? { previousProfileId: event.previousProfileId } : {}),
    ...(event.attempt !== undefined ? { attempt: event.attempt } : {}),
  };
}

export type PersistentPluginJob = {
  id: string;
  pluginId: string;
  pluginVersion: string;
  capabilityId: string;
  executionId: string;
  blockId: string;
  attempt: number;
  traceId: string;
  jobId?: string;
  request: PluginExecutionRequest;
  status: PluginJobStatus;
  nextPollAt: string;
  deadlineAt: string;
  progress?: number;
  message?: string;
  partialValues: Record<string, RuntimeValue>;
  partialArtifacts: StoredFile[];
  cancelRequested: boolean;
  error?: string;
  retryCount: number;
  diagnosticTimeline?: PluginDiagnosticEvent[];
  /** Identidade física local fixada para a etapa ativa do job. Nunca é enviada ao plugin. */
  browserProfile?: {
    profileId: string;
    alias: string;
  };
  /** Snapshot local e imutável da política de perfis resolvida antes da criação do job. */
  profileExecution?: ResolvedProfileExecutionSnapshot;
  /** Pool multiperfil congelado para esta tentativa. Tokens de lease nunca são persistidos aqui. */
  profileLanePool?: ProfileLanePoolSnapshot;
  /** Define se uma nova tentativa editorial reaproveita o prefixo concluído ou recomeça o lote. */
  retryScope?: BlockItemRetryScope;
  profileFallback?: {
    configurationKey: string;
    candidates: string[];
    activeIndex: number;
    history: Array<{ profile: string; code: string; message: string }>;
  };
  /** Slots incrementais publicados pelo plugin durante esta tentativa. */
  incrementalItems?: BlockExecutionItem[];
  /** Filhos registrados pelo plugin antes de qualquer efeito externo. */
  registeredItems?: BlockExecutionItem[];
  itemOrchestration?: {
    inputPort: string;
    outputPort: string;
    combinedOutputPort?: string;
    separator?: string;
    items: RuntimeValue[];
    itemIds: string[];
    /** Modelo operacional persistente. Campos legados acima permanecem para compatibilidade. */
    workItems?: BlockExecutionItem[];
    /** Concessões transitórias de uma invocação contínua. Nunca são expostas ao plugin. */
    claims?: Array<{
      itemId: string;
      invocationId: string;
      profileId?: string;
      claimedAt: string;
      expiresAt: string;
    }>;
    currentIndex: number;
    accumulatedItems?: RuntimeValue[];
    /**
     * Present only when item identities were reconstructed after an aggregate
     * legacy handler returned. These identities did not exist as an
     * incremental correlation channel while the handler was running.
     */
    compatibility?: {
      mode: "aggregate_completion";
      lateUpdates: false;
      realtimeUpdates: false;
      profileParallelism: false;
    };
  };
  createdAt: string;
  updatedAt: string;
};

type JobRow = {
  payload: string;
  lease_token: string | null;
};

export type ClaimedPluginJob = {
  job: PersistentPluginJob;
  leaseToken: string;
};

export type AtomicPluginJobMutation<T> = {
  job: PersistentPluginJob;
  value: T;
};

export class PluginJobStore {
  constructor(private readonly database: Database.Database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS plugin_jobs (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        next_poll_at TEXT NOT NULL,
        lease_token TEXT,
        lease_until TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(execution_id, block_id, attempt)
      );
      CREATE INDEX IF NOT EXISTS plugin_jobs_due
        ON plugin_jobs(status, next_poll_at, lease_until);
      CREATE INDEX IF NOT EXISTS plugin_jobs_execution
        ON plugin_jobs(execution_id, updated_at);
    `);
  }

  create(job: PersistentPluginJob) {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO plugin_jobs
          (id, execution_id, block_id, attempt, status, next_poll_at, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.executionId,
        job.blockId,
        job.attempt,
        job.status,
        job.nextPollAt,
        JSON.stringify(job),
        job.createdAt,
        job.updatedAt,
      );
    return this.getByExecution(job.executionId, job.blockId, job.attempt)!;
  }

  get(id: string) {
    const row = this.database.prepare("SELECT payload FROM plugin_jobs WHERE id = ?").get(id) as
      { payload: string } | undefined;
    return row ? parseJob(row.payload) : undefined;
  }

  getByExecution(executionId: string, blockId: string, attempt: number) {
    const row = this.database
      .prepare(
        "SELECT payload FROM plugin_jobs WHERE execution_id = ? AND block_id = ? AND attempt = ?",
      )
      .get(executionId, blockId, attempt) as { payload: string } | undefined;
    return row ? parseJob(row.payload) : undefined;
  }

  listForExecution(executionId: string) {
    return (
      this.database
        .prepare("SELECT payload FROM plugin_jobs WHERE execution_id = ? ORDER BY created_at")
        .all(executionId) as Array<{ payload: string }>
    ).map((row) => parseJob(row.payload));
  }

  claim(id: string, now = new Date(), leaseMs = 60 * 60 * 1_000): ClaimedPluginJob | undefined {
    return this.claimRow("id = ?", [id], now, leaseMs);
  }

  claimNext(now = new Date(), leaseMs = 60 * 60 * 1_000): ClaimedPluginJob | undefined {
    return this.claimRow("next_poll_at <= ?", [now.toISOString()], now, leaseMs);
  }

  save(
    claim: ClaimedPluginJob,
    job: PersistentPluginJob,
    onSaved?: (saved: PersistentPluginJob) => void,
  ) {
    const persist = this.database.transaction(() => {
      const current = this.database
        .prepare("SELECT status, next_poll_at FROM plugin_jobs WHERE id = ? AND lease_token = ?")
        .get(job.id, claim.leaseToken) as
        { status: PluginJobStatus; next_poll_at: string } | undefined;
      if (!current) throw new Error("O lease do job expirou antes da persistência.");
      const cancellationWon =
        current.status === "cancel_requested" &&
        !["cancel_requested", "cancelled", "abandoned"].includes(job.status);
      const updatedAt = new Date().toISOString();
      const saved: PersistentPluginJob = cancellationWon
        ? {
            ...job,
            status: "cancel_requested",
            cancelRequested: true,
            nextPollAt: current.next_poll_at,
            updatedAt,
          }
        : { ...job, updatedAt };
      this.database
        .prepare(
          `UPDATE plugin_jobs
           SET status = ?, next_poll_at = ?, lease_token = NULL, lease_until = NULL,
               payload = ?, updated_at = ?
           WHERE id = ? AND lease_token = ?`,
        )
        .run(
          saved.status,
          saved.nextPollAt,
          JSON.stringify(saved),
          updatedAt,
          saved.id,
          claim.leaseToken,
        );
      onSaved?.(saved);
      return saved;
    });
    return persist.immediate();
  }

  /** Persists an incremental snapshot without releasing the active worker lease. */
  updateClaimed(claim: ClaimedPluginJob, job: PersistentPluginJob) {
    const updatedAt = new Date().toISOString();
    const current = this.database
      .prepare("SELECT status FROM plugin_jobs WHERE id = ? AND lease_token = ?")
      .get(job.id, claim.leaseToken) as { status: PluginJobStatus } | undefined;
    if (!current) throw new Error("O lease do job expirou antes da entrega parcial.");
    const saved: PersistentPluginJob = {
      ...job,
      status: current.status,
      cancelRequested: current.status === "cancel_requested" || job.cancelRequested,
      updatedAt,
    };
    const result = this.database
      .prepare(
        `UPDATE plugin_jobs SET payload = ?, updated_at = ?
         WHERE id = ? AND lease_token = ?`,
      )
      .run(JSON.stringify(saved), updatedAt, saved.id, claim.leaseToken);
    if (!result.changes) throw new Error("O lease do job expirou antes da entrega parcial.");
    return saved;
  }

  /**
   * Serializa uma mutação pequena no snapshot persistido do job sem tocar no
   * lease do worker. É usada pelo scheduler multiperfil para conceder/confirmar
   * unidades enquanto várias lanes compartilham a mesma tentativa lógica.
   */
  mutateActiveJobAtomically<T>(
    id: string,
    mutate: (job: PersistentPluginJob) => AtomicPluginJobMutation<T> | undefined,
  ) {
    const transaction = this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT status, payload FROM plugin_jobs
           WHERE id = ? AND status IN ('starting', 'pending', 'cancel_requested')`,
        )
        .get(id) as { status: PluginJobStatus; payload: string } | undefined;
      if (!row) return undefined;
      const current = parseJob(row.payload);
      const mutation = mutate(current);
      if (!mutation) return undefined;
      const updatedAt = new Date().toISOString();
      const saved: PersistentPluginJob = {
        ...mutation.job,
        status: row.status,
        cancelRequested: row.status === "cancel_requested" || mutation.job.cancelRequested,
        updatedAt,
      };
      const result = this.database
        .prepare(
          `UPDATE plugin_jobs SET payload = ?, updated_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(JSON.stringify(saved), updatedAt, id, row.status);
      if (!result.changes) return undefined;
      return { job: saved, value: mutation.value } satisfies AtomicPluginJobMutation<T>;
    });
    return transaction.immediate() as AtomicPluginJobMutation<T> | undefined;
  }

  requestCancellation(executionId: string, now = new Date()) {
    const jobs = this.listForExecution(executionId).filter((job) =>
      ["starting", "pending", "cancel_requested"].includes(job.status),
    );
    const update = this.database.prepare(
      `UPDATE plugin_jobs
       SET status = 'cancel_requested', next_poll_at = ?, payload = ?, updated_at = ?
       WHERE id = ? AND status IN ('starting', 'pending', 'cancel_requested')`,
    );
    const timestamp = now.toISOString();
    return this.database.transaction(() => {
      let changed = 0;
      for (const job of jobs) {
        const next = cancelProfileLanePool({
          ...job,
          status: "cancel_requested" as const,
          cancelRequested: true,
          nextPollAt: timestamp,
          updatedAt: timestamp,
        });
        changed += update.run(timestamp, JSON.stringify(next), timestamp, job.id).changes;
      }
      return changed;
    })();
  }

  recoverInterrupted(now = new Date()) {
    const timestamp = now.toISOString();
    const rows = this.database
      .prepare(
        `SELECT id, status, next_poll_at, payload FROM plugin_jobs
         WHERE status IN ('starting', 'pending', 'cancel_requested')`,
      )
      .all() as Array<{
      id: string;
      status: PluginJobStatus;
      next_poll_at: string;
      payload: string;
    }>;
    const update = this.database.prepare(
      `UPDATE plugin_jobs
       SET lease_token = NULL, lease_until = NULL, next_poll_at = ?, payload = ?, updated_at = ?
       WHERE id = ?`,
    );
    return this.database.transaction(() => {
      let changed = 0;
      for (const row of rows) {
        const recovered = recoverProfileLanePool(parseJob(row.payload), now);
        const nextPollAt = row.next_poll_at > timestamp ? row.next_poll_at : timestamp;
        const next = {
          ...recovered,
          status: row.status,
          cancelRequested: row.status === "cancel_requested" || recovered.cancelRequested,
          nextPollAt,
          updatedAt: timestamp,
        } satisfies PersistentPluginJob;
        changed += update.run(nextPollAt, JSON.stringify(next), timestamp, row.id).changes;
      }
      return changed;
    })();
  }

  defer(claim: ClaimedPluginJob, nextPollAt: Date) {
    const timestamp = new Date().toISOString();
    const next = { ...claim.job, nextPollAt: nextPollAt.toISOString(), updatedAt: timestamp };
    const result = this.database
      .prepare(
        `UPDATE plugin_jobs
         SET next_poll_at = ?, lease_token = NULL, lease_until = NULL, payload = ?, updated_at = ?
         WHERE id = ? AND lease_token = ?`,
      )
      .run(next.nextPollAt, JSON.stringify(next), timestamp, next.id, claim.leaseToken);
    if (!result.changes) throw new Error("O lease do job expirou antes do reagendamento.");
    return next;
  }

  deleteTerminalBefore(cutoff: Date) {
    return this.database
      .prepare(
        `DELETE FROM plugin_jobs
         WHERE status IN ('completed', 'failed', 'cancelled', 'abandoned') AND updated_at < ?`,
      )
      .run(cutoff.toISOString()).changes;
  }

  terminalBefore(cutoff: Date) {
    return (
      this.database
        .prepare(
          `SELECT payload FROM plugin_jobs
           WHERE status IN ('completed', 'failed', 'cancelled', 'abandoned') AND updated_at < ?`,
        )
        .all(cutoff.toISOString()) as Array<{ payload: string }>
    ).map((row) => parseJob(row.payload));
  }

  private claimRow(where: string, parameters: unknown[], now: Date, leaseMs: number) {
    const claim = this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT payload, lease_token FROM plugin_jobs
           WHERE ${where}
             AND status IN ('starting', 'pending', 'cancel_requested')
             AND (lease_until IS NULL OR lease_until <= ?)
           ORDER BY next_poll_at, created_at
           LIMIT 1`,
        )
        .get(...parameters, now.toISOString()) as JobRow | undefined;
      if (!row) return undefined;
      const job = parseJob(row.payload);
      const leaseToken = randomUUID();
      const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      const result = this.database
        .prepare(
          `UPDATE plugin_jobs SET lease_token = ?, lease_until = ?
           WHERE id = ? AND (lease_until IS NULL OR lease_until <= ?)`,
        )
        .run(leaseToken, leaseUntil, job.id, now.toISOString());
      return result.changes ? { job, leaseToken } : undefined;
    });
    return claim.immediate() as ClaimedPluginJob | undefined;
  }
}

export function createPersistentPluginJob(input: {
  pluginId: string;
  pluginVersion: string;
  request: PluginExecutionRequest;
  timeoutMs: number;
  profileFallback?: PersistentPluginJob["profileFallback"];
  browserProfile?: PersistentPluginJob["browserProfile"];
  profileExecution?: PersistentPluginJob["profileExecution"];
  profileLanePool?: PersistentPluginJob["profileLanePool"];
  itemOrchestration?: PersistentPluginJob["itemOrchestration"];
  retryScope?: BlockItemRetryScope;
  now?: Date;
}): PersistentPluginJob {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    pluginId: input.pluginId,
    pluginVersion: input.pluginVersion,
    capabilityId: input.request.capabilityId,
    executionId: input.request.executionId,
    blockId: input.request.blockId,
    attempt: input.request.attempt,
    traceId: input.request.traceId,
    request: structuredClone(input.request),
    status: "starting",
    nextPollAt: timestamp,
    deadlineAt: new Date(now.getTime() + input.timeoutMs).toISOString(),
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    diagnosticTimeline: [
      {
        at: timestamp,
        code: "JOB_CREATED",
        ...(input.browserProfile?.profileId ? { profileId: input.browserProfile.profileId } : {}),
        attempt: input.request.attempt,
      },
    ],
    browserProfile: structuredClone(input.browserProfile),
    profileExecution: structuredClone(input.profileExecution),
    profileLanePool: structuredClone(input.profileLanePool),
    retryScope: input.retryScope,
    profileFallback: structuredClone(input.profileFallback),
    itemOrchestration: structuredClone(input.itemOrchestration),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendPluginDiagnostic(
  job: PersistentPluginJob,
  event: Omit<PluginDiagnosticEvent, "at"> & { at?: string },
) {
  const sanitized = sanitizePluginDiagnostic({
    ...event,
    at: event.at ?? new Date().toISOString(),
  });
  return {
    ...job,
    diagnosticTimeline: [
      ...(job.diagnosticTimeline ?? []),
      ...(sanitized ? [sanitized] : []),
    ].slice(-256),
  } satisfies PersistentPluginJob;
}

export function isPluginJobTimedOut(job: PersistentPluginJob, now = new Date()) {
  return now.getTime() >= new Date(job.deadlineAt).getTime();
}

function parseJob(payload: string) {
  return JSON.parse(payload) as PersistentPluginJob;
}
