import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/title")({
  component: TitleProcessRoute,
});

function TitleProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="title"
      description="Cria títulos conforme o método salvo do canal."
    />
  );
}
