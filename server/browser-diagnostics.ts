import { sanitizePluginDiagnostic, type PersistentPluginJob } from "./plugin-job-store";
import { profileLaneProgressForJob } from "./profile-lane-progress";

export function exportBrowserDiagnostics(
  executionId: string,
  jobs: PersistentPluginJob[],
  now = new Date(),
) {
  return {
    schemaVersion: 1 as const,
    executionId,
    generatedAt: now.toISOString(),
    jobs: jobs.map((job) => ({
      jobId: job.id,
      pluginId: job.pluginId,
      capabilityId: job.capabilityId,
      blockId: job.blockId,
      attempt: job.attempt,
      status: job.status,
      profileLaneProgress: profileLaneProgressForJob(job),
      timeline: (job.diagnosticTimeline ?? []).flatMap((event) => {
        const safe = sanitizePluginDiagnostic(event);
        return safe ? [safe] : [];
      }),
    })),
  };
}
