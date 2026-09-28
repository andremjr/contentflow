import { randomUUID } from "node:crypto";
import type {
  PluginCapability,
  PluginClaimedWorkItem,
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginWorkItemUpdate,
  PluginWorkItemUpdateReceipt,
} from "../src/lib/plugin-contract";
import type { RuntimeValue, StoredFile } from "../src/lib/domain";
import type { BrowserProfileLeaseStore } from "./browser-profile-leases";
import type { PersistentPluginJob, PluginJobStore } from "./plugin-job-store";
import {
  consolidatedOrchestratedOutputs,
  continuousInvocationRequestForJob,
} from "./plugin-item-orchestration";
import {
  claimNextProfileLaneItem,
  commitProfileLaneItemUpdate,
  completeProfileLaneInvocation,
  failProfileLane,
} from "./profile-lane-distribution";
import type { ProfileLaneSnapshot } from "./profile-lane-pool";
import type { RegisteredPlugin } from "./plugin-runner";

type PluginExecutionOptions = {
  workspaceDirectory?: string;
  profileDirectory?: string;
  existingArtifacts?: StoredFile[];
  onClaimItems?: (limit: number) => Promise<PluginClaimedWorkItem[]>;
  onPublishItemUpdate?: (
    update: PluginWorkItemUpdate,
    storedArtifacts: StoredFile[],
  ) => Promise<PluginWorkItemUpdateReceipt>;
};

export type ParallelProfileExecutorDependencies = {
  pluginJobs: PluginJobStore;
  browserProfileLeases: BrowserProfileLeaseStore;
  resolveProfile: (
    pluginId: string,
    profileId: string,
  ) => { profile: { alias: string }; profileDirectory: string };
  executePlugin: (
    plugin: RegisteredPlugin,
    request: PluginExecutionRequest,
    timeoutMs: number | undefined,
    secrets: Record<string, string>,
    options?: PluginExecutionOptions,
  ) => Promise<PluginExecutionResponse>;
  leaseTtlMs: number;
  leaseHeartbeatMs: number;
  createInvocationId?: () => string;
};

function safeLaneReasonCode(value: unknown, fallback = "JOB_FAILED") {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9_]{1,96}$/.test(normalized) ? normalized : fallback;
}

export async function executeParallelProfileLanes(input: {
  plugin: RegisteredPlugin;
  capability: PluginCapability;
  job: PersistentPluginJob;
  timeoutMs: number;
  secrets: Record<string, string>;
  workspaceDirectory?: string;
  dependencies: ParallelProfileExecutorDependencies;
}): Promise<{ job: PersistentPluginJob; response: PluginExecutionResponse }> {
  const { dependencies } = input;
  const configurationKey = input.plugin.manifest.profileSetup?.configurationKey;
  if (!configurationKey || !input.job.profileLanePool || !input.job.itemOrchestration) {
    throw new Error("O pool multiperfil não possui contrato de perfil e itens completo.");
  }
  const maximumRounds =
    (input.job.itemOrchestration.workItems?.length ?? input.job.itemOrchestration.items.length) +
    input.job.profileLanePool.lanes.length +
    2;

  for (let round = 0; round < maximumRounds; round += 1) {
    const beforeRound = dependencies.pluginJobs.get(input.job.id);
    if (!beforeRound) throw new Error("O job multiperfil não existe mais.");
    const reconciliation = beforeRound.profileLanePool?.lanes.some(
      (lane) => (lane.reconciliationItemIds?.length ?? 0) > 0,
    );
    if (reconciliation) {
      return {
        job: beforeRound,
        response: {
          status: "error",
          code: "RECONCILIATION_REQUIRED",
          message:
            "Uma conta perdeu conexão depois de enviar um item. É preciso confirmar esse resultado antes de repetir.",
          retryable: false,
          recovery: { externalEffect: "possible", stage: "effect_submitted" },
        },
      };
    }
    const consolidationBefore = consolidatedOrchestratedOutputs(beforeRound);
    if (consolidationBefore.complete) {
      const orchestration = beforeRound.itemOrchestration!;
      const values: Record<string, RuntimeValue> = {
        [orchestration.outputPort]: consolidationBefore.outputs as RuntimeValue,
      };
      if (orchestration.combinedOutputPort) {
        values[orchestration.combinedOutputPort] = consolidationBefore.outputs
          .filter((value): value is string => typeof value === "string")
          .join(orchestration.separator ?? "\n\n");
      }
      return { job: beforeRound, response: { status: "success", values } };
    }

    const planned = (beforeRound.profileLanePool?.lanes ?? []).filter(
      (lane) => lane.state === "planned" && lane.itemIds.length > 0,
    );
    if (!planned.length) {
      return {
        job: beforeRound,
        response: {
          status: "error",
          code: "JOB_FAILED",
          message: "Nenhum perfil preparado permaneceu disponível para os itens pendentes.",
          retryable: false,
          recovery: { externalEffect: "none", stage: "before_effect" },
        },
      };
    }

    let acquiredAny = false;
    await Promise.all(
      planned.map(async (lane: ProfileLaneSnapshot) => {
        const ownerId = `${lane.laneId}:round:${round + 1}`;
        const acquired = dependencies.browserProfileLeases.acquire({
          profileId: lane.profileId,
          ownerType: "invocation",
          ownerId,
          pluginId: input.plugin.id,
          ttlMs: dependencies.leaseTtlMs,
        });
        if (!acquired.acquired) return;
        acquiredAny = true;
        const heartbeat = setInterval(() => {
          dependencies.browserProfileLeases.heartbeat(
            lane.profileId,
            acquired.lease.leaseToken,
            new Date(),
            dependencies.leaseTtlMs,
          );
        }, dependencies.leaseHeartbeatMs);
        heartbeat.unref();
        const invocationId = dependencies.createInvocationId?.() ?? randomUUID();
        try {
          const latest = dependencies.pluginJobs.get(input.job.id);
          if (!latest) throw new Error("O job multiperfil não existe mais.");
          const resolved = dependencies.resolveProfile(input.plugin.id, lane.profileId);
          if (resolved.profile.alias !== lane.alias) {
            throw Object.assign(new Error("O alias do perfil mudou durante a execução."), {
              code: "PROFILE_CHANGED",
            });
          }
          const request = continuousInvocationRequestForJob(latest, { mode: "start" });
          request.configuration = { ...request.configuration, [configurationKey]: lane.alias };
          const response = await dependencies.executePlugin(
            input.plugin,
            request,
            input.timeoutMs,
            input.secrets,
            {
              workspaceDirectory: input.workspaceDirectory,
              profileDirectory: resolved.profileDirectory,
              existingArtifacts: latest.partialArtifacts,
              onClaimItems: async (limit) =>
                claimNextProfileLaneItem({
                  store: dependencies.pluginJobs,
                  jobId: latest.id,
                  laneId: lane.laneId,
                  invocationId,
                  limit,
                  expiresAt: latest.deadlineAt,
                })?.value ?? [],
              onPublishItemUpdate: async (update, storedArtifacts) => {
                const committed = commitProfileLaneItemUpdate({
                  store: dependencies.pluginJobs,
                  jobId: latest.id,
                  laneId: lane.laneId,
                  invocationId,
                  update,
                  storedArtifacts,
                });
                if (!committed) throw new Error("A unidade não pôde ser persistida pelo núcleo.");
                return committed.value;
              },
            },
          );
          if (response.status !== "success") {
            failProfileLane({
              store: dependencies.pluginJobs,
              jobId: latest.id,
              laneId: lane.laneId,
              invocationId,
              reasonCode: safeLaneReasonCode(
                response.status === "error" ? response.code : "ASYNC_LANE_UNSUPPORTED",
              ),
            });
            return;
          }
          const completed = completeProfileLaneInvocation({
            store: dependencies.pluginJobs,
            jobId: latest.id,
            laneId: lane.laneId,
            invocationId,
          });
          if (completed?.value.activeClaim) {
            failProfileLane({
              store: dependencies.pluginJobs,
              jobId: latest.id,
              laneId: lane.laneId,
              invocationId,
              reasonCode: "INCOMPLETE_LANE",
            });
          }
        } catch (error) {
          failProfileLane({
            store: dependencies.pluginJobs,
            jobId: input.job.id,
            laneId: lane.laneId,
            invocationId,
            reasonCode: safeLaneReasonCode((error as { code?: string })?.code),
          });
        } finally {
          clearInterval(heartbeat);
          dependencies.browserProfileLeases.release(lane.profileId, acquired.lease.leaseToken);
        }
      }),
    );

    if (!acquiredAny) {
      const latest = dependencies.pluginJobs.get(input.job.id) ?? beforeRound;
      return {
        job: latest,
        response: {
          status: "error",
          code: "PROFILE_BUSY",
          message: "Os perfis selecionados estão sendo usados por outra execução.",
          retryable: true,
          recovery: { externalEffect: "none", stage: "before_effect" },
        },
      };
    }
  }

  const latest = dependencies.pluginJobs.get(input.job.id) ?? input.job;
  return {
    job: latest,
    response: {
      status: "error",
      code: "JOB_FAILED",
      message: "A distribuição multiperfil não conseguiu concluir todos os itens.",
      retryable: false,
      recovery: { externalEffect: "none" },
    },
  };
}
