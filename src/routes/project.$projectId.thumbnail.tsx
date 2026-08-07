import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/thumbnail")({
  component: ThumbnailProcessRoute,
});

function ThumbnailProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="thumbnail"
      description="Organiza a criação da thumbnail conforme o método salvo."
    />
  );
}
