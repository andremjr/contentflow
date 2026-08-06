import { createFileRoute } from "@tanstack/react-router";
import { ProjectProcessPage } from "@/components/project-process-page";
export const Route = createFileRoute("/project/$projectId/theme")({
  component: () => (
    <ProjectProcessPage
      projectId={Route.useParams().projectId}
      processId="theme"
      description="Define o tema do vídeo a partir do método salvo."
    />
  ),
});
