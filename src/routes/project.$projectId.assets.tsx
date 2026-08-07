import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/assets")({
  component: AssetsProcessRoute,
});

function AssetsProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="assets"
      description="Organiza os assets visuais conforme o método salvo."
    />
  );
}
