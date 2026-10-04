import { PROCESS_ORDER, type Channel, type ProcessMethod } from "./domain";
import { workspaceMethodV3Schema } from "./method-contract-v3";

export type UpgradeState = { required: boolean; applying: boolean };
export type UpgradePlan = {
  planId: string;
  required: boolean;
  canApply: boolean;
  pendingUpdates: unknown;
  scanned: unknown;
  diagnostics: Array<{ path: string; message: string }>;
  currentPluginCapabilities: unknown;
  guideUrl: string;
  skillUrl: string;
  historicalJobsPreserved?: boolean;
  proposedMethods?: Array<{ channelId: string; processes: string[] }>;
};

export function methodNeedsUpgrade(method: unknown): boolean {
  return !workspaceMethodV3Schema.safeParse(method).success;
}
export function channelNeedsUpgrade(channel: Channel): boolean {
  return PROCESS_ORDER.some(
    (process) =>
      methodNeedsUpgrade(channel.methods?.[process]) ||
      channel.methods?.[process]?.processType !== process,
  );
}
export function methodsNeedUpgrade(methods: Partial<Record<string, ProcessMethod>>): boolean {
  return Object.values(methods).some(methodNeedsUpgrade);
}

// Keep the original objects: presentation is never a migration or a runtime adapter.
export function preserveChannelForPresentation(channel: Channel): Channel {
  return channel;
}

export async function loadUpgradePlan(): Promise<UpgradePlan> {
  const response = await fetch("/api/upgrade/plan", { cache: "no-store" });
  if (!response.ok) throw await upgradeApiError(response);
  return response.json();
}
export async function applyUpgradePlan(planId: string) {
  const response = await fetch("/api/upgrade/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, confirmBackup: true }),
  });
  if (!response.ok) throw await upgradeApiError(response);
  return response.json() as Promise<{
    applied: boolean;
    backupPath: string;
    plan: UpgradePlan;
  }>;
}

export class UpgradeApiError extends Error {
  constructor(
    public code: string,
    public backupPath?: string,
  ) {
    super(code);
  }
}
async function upgradeApiError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { code?: string; backupPath?: string };
  return new UpgradeApiError(body.code ?? "UPGRADE_FAILED", body.backupPath);
}
