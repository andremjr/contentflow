import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { RuntimeValue, StoredFile } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";

export type PluginJobStatus =
  "starting" | "pending" | "cancel_requested" | "completed" | "failed" | "cancelled" | "abandoned";

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
  profileFallback?: {
    configurationKey: string;
    candidates: string[];
    activeIndex: number;
    history: Array<{ profile: string; code: string; message: string }>;
  };
  itemOrchestration?: {
    inputPort: string;
    outputPort: string;
    items: RuntimeValue[];
    itemIds: string[];
    currentIndex: number;
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
        const next = {
          ...job,
          status: "cancel_requested" as const,
          cancelRequested: true,
          nextPollAt: timestamp,
          updatedAt: timestamp,
        };
        changed += update.run(timestamp, JSON.stringify(next), timestamp, job.id).changes;
      }
      return changed;
    })();
  }

  recoverInterrupted(now = new Date()) {
    return this.database
      .prepare(
        `UPDATE plugin_jobs
         SET lease_token = NULL, lease_until = NULL,
             next_poll_at = CASE WHEN next_poll_at > ? THEN next_poll_at ELSE ? END
         WHERE status IN ('starting', 'pending', 'cancel_requested')`,
      )
      .run(now.toISOString(), now.toISOString()).changes;
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
  itemOrchestration?: PersistentPluginJob["itemOrchestration"];
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
    profileFallback: structuredClone(input.profileFallback),
    itemOrchestration: structuredClone(input.itemOrchestration),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isPluginJobTimedOut(job: PersistentPluginJob, now = new Date()) {
  return now.getTime() >= new Date(job.deadlineAt).getTime();
}

function parseJob(payload: string) {
  return JSON.parse(payload) as PersistentPluginJob;
}
