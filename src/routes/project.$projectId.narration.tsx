import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/narration")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="narration"
      description="Organiza narração e áudio conforme o método salvo."
    />
  ),
});
