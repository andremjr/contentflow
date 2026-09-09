import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { desktopHumanTasksBridge } from "@/lib/desktop-updater";
import { PROCESS_META } from "@/lib/domain";
import { PROCESS_ROUTE_SEGMENT } from "@/lib/human-workflow";
import { useAppPreferences } from "@/lib/app-preferences";
import { useExecutionErrors, useHumanTasks } from "@/lib/store";

export function DesktopHumanTaskNotifications() {
  const navigate = useNavigate();
  const tasks = useHumanTasks();
  const errors = useExecutionErrors();
  const { ready, notificationSound, systemNotifications, t } = useAppPreferences();
  const notifications = useMemo(
    () => [
      ...errors.map((error) => ({
        id: `error:${error.execution.id}:${error.block.id}:${error.blockExecution.attempt ?? 1}`,
        title: `${t("Erro no bloco")} · ${error.project.title}`,
        body: `${error.channel.name} · ${PROCESS_META[error.execution.processType].label} · ${error.block.name ?? error.block.type}`,
        route: `/project/${error.project.id}/${PROCESS_ROUTE_SEGMENT[error.execution.processType]}`,
        severity: "error" as const,
      })),
      ...tasks.map((task) => ({
        id: `human:${task.execution.id}:${task.block.id}`,
        title: `${t("Validação pendente")} · ${task.project.title}`,
        body: `${task.channel.name} · ${PROCESS_META[task.execution.processType].label} · ${task.block.name ?? task.block.type}`,
        route: `/project/${task.project.id}/${PROCESS_ROUTE_SEGMENT[task.execution.processType]}`,
        severity: "warning" as const,
      })),
    ],
    [errors, t, tasks],
  );

  useEffect(() => {
    const bridge = desktopHumanTasksBridge();
    if (!bridge) return;
    return bridge.subscribeNavigation((route) => navigate({ to: route as never }));
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    desktopHumanTasksBridge()?.update({
      count: notifications.length,
      badgeTone: errors.length > 0 ? "error" : "warning",
      badgeDescription:
        errors.length > 0
          ? `${t("Erros de execução")}: ${errors.length} · ${t("Pendências humanas")}: ${tasks.length}`
          : t(`${tasks.length} tarefas humanas pendentes`),
      notificationSound,
      systemNotifications,
      tasks: notifications,
    });
  }, [
    errors.length,
    notificationSound,
    notifications,
    ready,
    systemNotifications,
    t,
    tasks.length,
  ]);

  return null;
}
