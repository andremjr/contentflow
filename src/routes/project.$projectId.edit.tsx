import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/edit")({
  component: EditingProcessRoute,
});

function EditingProcessRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectProcessPage
      projectId={projectId}
      processId="editing"
      description="Organiza a edição conforme o método salvo."
    />
  );
}
