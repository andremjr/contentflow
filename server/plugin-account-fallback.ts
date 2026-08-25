import type { PluginExecutionResponse, PluginManifest } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";

export const AUTOMATIC_PROFILE_FALLBACK_CODES = new Set([
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "JOB_FAILED",
]);

const PROFILE_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;

export function orderedProfileCandidates(
  manifest: Pick<PluginManifest, "profileSetup">,
  configuration: Record<string, unknown>,
) {
  const setup = manifest.profileSetup;
  if (!setup?.fallbackConfigurationKey) return undefined;
  const primary = String(configuration[setup.configurationKey] ?? "").trim();
  const rawFallbacks = String(configuration[setup.fallbackConfigurationKey] ?? "");
  const candidates = [primary, ...rawFallbacks.split(/[\n,;]+/)]
    .map((value) => value.trim())
    .filter((value, index, values) => PROFILE_ALIAS.test(value) && values.indexOf(value) === index);
  if (candidates.length < 2) return undefined;
  return {
    configurationKey: setup.configurationKey,
    candidates,
    activeIndex: 0,
    history: [],
  } satisfies NonNullable<PersistentPluginJob["profileFallback"]>;
}

export function canAdvanceProfileFallback(
  job: PersistentPluginJob,
  response: Extract<PluginExecutionResponse, { status: "error" }>,
) {
  const fallback = job.profileFallback;
  return Boolean(
    response.retryable &&
    !job.jobId &&
    fallback &&
    AUTOMATIC_PROFILE_FALLBACK_CODES.has(response.code) &&
    fallback.activeIndex + 1 < fallback.candidates.length,
  );
}
