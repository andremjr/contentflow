import type { PluginExecutionResponse, PluginRecoveryFacts } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";

export const DEFAULT_MAX_TECHNICAL_RETRIES = 2;
export const MIN_RECOVERY_DELAY_MS = 1_000;
export const MAX_RECOVERY_DELAY_MS = 30_000;
export const RATE_LIMIT_MAX_RETRIES = 8;
export const RATE_LIMIT_WITH_PROGRESS_DELAY_MS = 60_000;
export const RATE_LIMIT_WITHOUT_PROGRESS_DELAY_MS = 5 * 60_000;
export const RATE_LIMIT_MAX_DELAY_MS = 30 * 60_000;

export type RecoveryDecision =
  | { action: "cancel"; reasonCode: string }
  | { action: "reconcile"; reasonCode: string; receipt?: string }
  | {
      action: "intervene";
      reasonCode: string;
      intervention: NonNullable<PluginRecoveryFacts["intervention"]>;
    }
  | { action: "switch_profile"; reasonCode: string }
  | { action: "retry"; reasonCode: string; delayMs: number }
  | { action: "fail"; reasonCode: string };

type RecoveryFailure = {
  code?: string;
  message?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  recovery?: PluginRecoveryFacts;
};

const INTERVENTION_BY_CODE: Record<string, NonNullable<PluginRecoveryFacts["intervention"]>> = {
  AUTHENTICATION_FAILED: "authentication",
  CAPTCHA_REQUIRED: "captcha",
  PERMISSION_DENIED: "permission",
  QUOTA_EXCEEDED: "quota",
  UPGRADE_REQUIRED: "upgrade",
  ACCOUNT_BLOCKED: "account_blocked",
  DOM_INCOMPATIBLE: "provider_ui_changed",
};

const SAFE_TECHNICAL_RETRY_CODES = new Set([
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "JOB_FAILED",
  "RATE_LIMIT",
  "OUTPUT_VALIDATION_FAILED",
  "BRIDGE_DISCONNECTED",
  "BROWSER_SESSION_CLOSED",
  "PROFILE_BUSY",
]);

const PROFILE_SCOPED_CODES = new Set([
  ...SAFE_TECHNICAL_RETRY_CODES,
  "AUTHENTICATION_FAILED",
  "CAPTCHA_REQUIRED",
  "PERMISSION_DENIED",
  "QUOTA_EXCEEDED",
  "UPGRADE_REQUIRED",
  "ACCOUNT_BLOCKED",
]);

export function hasAnotherFallbackProfile(job: PersistentPluginJob) {
  const fallback = job.profileFallback;
  return Boolean(fallback && fallback.activeIndex + 1 < fallback.candidates.length);
}

export function hasUncertainExternalEffect(failure: RecoveryFailure) {
  const facts = failure.recovery;
  return Boolean(
    facts?.externalReceipt ||
    facts?.externalEffect === "possible" ||
    facts?.stage === "effect_submitted" ||
    facts?.stage === "awaiting_result",
  );
}

function technicalRetryDelay(failure: RecoveryFailure, nextRetryCount: number) {
  const requested = failure.retryAfterMs ?? MIN_RECOVERY_DELAY_MS * 2 ** nextRetryCount;
  return Math.max(MIN_RECOVERY_DELAY_MS, Math.min(MAX_RECOVERY_DELAY_MS, requested));
}

function hasPersistedProgress(job: PersistentPluginJob) {
  if (job.incrementalItems?.some((item) => item.status === "completed")) return true;
  if (job.itemOrchestration?.workItems?.some((item) => item.status === "completed")) return true;
  return Object.keys(job.partialValues).length > 0 || job.partialArtifacts.length > 0;
}

function rateLimitRetryDelay(failure: RecoveryFailure, job: PersistentPluginJob) {
  if (failure.retryAfterMs !== undefined) {
    return Math.max(MIN_RECOVERY_DELAY_MS, Math.min(RATE_LIMIT_MAX_DELAY_MS, failure.retryAfterMs));
  }
  const initialDelay = hasPersistedProgress(job)
    ? RATE_LIMIT_WITH_PROGRESS_DELAY_MS
    : RATE_LIMIT_WITHOUT_PROGRESS_DELAY_MS;
  return Math.min(RATE_LIMIT_MAX_DELAY_MS, initialDelay * 3 ** job.retryCount);
}

export function decideExecutionRecovery(input: {
  job: PersistentPluginJob;
  failure: RecoveryFailure;
  nowMs?: number;
  maxTechnicalRetries?: number;
}): RecoveryDecision {
  const { job, failure } = input;
  const code = failure.code || "JOB_FAILED";
  if (job.cancelRequested || code === "CANCELLED") return { action: "cancel", reasonCode: code };

  if (hasUncertainExternalEffect(failure)) {
    return {
      action: "reconcile",
      reasonCode: code,
      receipt: failure.recovery?.externalReceipt,
    };
  }

  const intervention = failure.recovery?.intervention ?? INTERVENTION_BY_CODE[code];
  const maySwitchProfile =
    hasAnotherFallbackProfile(job) &&
    PROFILE_SCOPED_CODES.has(code) &&
    failure.recovery?.externalEffect !== "confirmed";
  if (maySwitchProfile) return { action: "switch_profile", reasonCode: code };
  if (intervention) return { action: "intervene", reasonCode: code, intervention };

  const nowMs = input.nowMs ?? Date.now();
  if (code === "PROFILE_BUSY") {
    const delayMs = technicalRetryDelay(failure, job.retryCount + 1);
    if (nowMs + delayMs < new Date(job.deadlineAt).getTime()) {
      return { action: "retry", reasonCode: code, delayMs };
    }
    return { action: "fail", reasonCode: code };
  }

  if (code === "RATE_LIMIT") {
    const delayMs = rateLimitRetryDelay(failure, job);
    const deadlineAllowsRetry = nowMs + delayMs < new Date(job.deadlineAt).getTime();
    if (job.retryCount < RATE_LIMIT_MAX_RETRIES && deadlineAllowsRetry) {
      return { action: "retry", reasonCode: code, delayMs };
    }
    return { action: "fail", reasonCode: code };
  }

  const maxRetries = input.maxTechnicalRetries ?? DEFAULT_MAX_TECHNICAL_RETRIES;
  const delayMs = technicalRetryDelay(failure, job.retryCount + 1);
  const deadlineAllowsRetry = nowMs + delayMs < new Date(job.deadlineAt).getTime();
  const isKnownSafeRetry = SAFE_TECHNICAL_RETRY_CODES.has(code);
  const legacySafeRetry = failure.retryable === true && failure.recovery?.externalEffect === "none";
  if (job.retryCount < maxRetries && deadlineAllowsRetry && (isKnownSafeRetry || legacySafeRetry)) {
    return { action: "retry", reasonCode: code, delayMs };
  }
  return { action: "fail", reasonCode: code };
}

export function recoveryProductMessage(input: {
  decision: RecoveryDecision;
  failureMessage: string;
  currentProfile?: string;
  nextProfile?: string;
  preservedCount?: number;
}) {
  const preserved = input.preservedCount
    ? `${input.preservedCount} item(ns) já concluído(s) foram preservados.`
    : "Tudo o que já foi concluído foi preservado.";
  switch (input.decision.action) {
    case "switch_profile":
      return `${input.failureMessage} ${preserved} O ContentFlow continuará com ${input.nextProfile ?? "outro perfil preparado"}.`;
    case "retry":
      return `${input.failureMessage} ${preserved} O ContentFlow tentará novamente com segurança.`;
    case "reconcile":
      return `${input.failureMessage} ${preserved} O ContentFlow precisa confirmar o resultado externo antes de repetir este trabalho.`;
    case "intervene":
      return `${input.failureMessage} ${preserved} É necessária uma ação na conta ${input.currentProfile ?? "selecionada"} antes de continuar.`;
    case "cancel":
      return `A execução foi cancelada. ${preserved}`;
    default:
      return `${input.failureMessage} ${preserved} Não foi possível continuar automaticamente.`;
  }
}

export type PluginErrorResponse = Extract<PluginExecutionResponse, { status: "error" }>;
