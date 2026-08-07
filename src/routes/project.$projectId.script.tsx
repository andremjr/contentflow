import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/script")({
  component: ScriptProcessRoute,
});

function ScriptProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="script"
      description="Organiza a produção do roteiro conforme o método salvo."
    />
  );
}
