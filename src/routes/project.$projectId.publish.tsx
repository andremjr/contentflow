import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/publish")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="publishing"
      description="Organiza a publicação conforme o método salvo."
    />
  ),
});
