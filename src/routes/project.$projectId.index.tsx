import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { projectProcessOrder } from "@/lib/process-order";
import { useChannel, useDatabaseReady, useProject } from "@/lib/store";

export const Route = createFileRoute("/project/$projectId/")({
  component: ProjectIndexRedirect,
});

const processSlug = (process: string) =>
  process === "editing" ? "edit" : process === "publishing" ? "publish" : process;

function ProjectIndexRedirect() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const channel = useChannel(project?.channelId ?? "");
  const databaseReady = useDatabaseReady();
  const navigate = useNavigate();

  useEffect(() => {
    if (!databaseReady || !project || !channel) return;
    const first = projectProcessOrder(project, channel)[0];
    void navigate({
      to: `/project/${project.id}/${processSlug(first)}` as never,
      replace: true,
    });
  }, [channel, databaseReady, navigate, project]);

  return null;
}
