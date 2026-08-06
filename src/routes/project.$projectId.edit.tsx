import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/edit")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="editing"
      description="Organiza a edição conforme o método salvo."
    />
  ),
});
