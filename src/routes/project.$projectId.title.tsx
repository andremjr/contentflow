import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/title")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="title"
      description="Cria títulos conforme o método salvo do canal."
    />
  ),
});
