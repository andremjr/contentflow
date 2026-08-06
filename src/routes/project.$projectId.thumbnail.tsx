import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/thumbnail")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="thumbnail"
      description="Organiza a criação da thumbnail conforme o método salvo."
    />
  ),
});
