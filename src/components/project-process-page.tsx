import { ProcessRunner } from "@/components/process-runner";
import { type ProcessId } from "@/lib/domain";
import { useProject } from "@/lib/store";

export function ProjectProcessPage({
  projectId,
  processId,
  description,
}: {
  projectId: string;
  processId: ProcessId;
  description: string;
}) {
  const project = useProject(projectId);
  return <ProcessRunner project={project} processId={processId} description={description} />;
}
