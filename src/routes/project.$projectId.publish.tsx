import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/publish")({
  component: PublishingProcessRoute,
});

function PublishingProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="publishing"
      description="Organiza a publicação conforme o método salvo."
    />
  );
}
