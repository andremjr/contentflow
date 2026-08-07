import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/narration")({
  component: NarrationProcessRoute,
});

function NarrationProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="narration"
      description="Organiza narração e áudio conforme o método salvo."
    />
  );
}
