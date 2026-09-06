import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { desktopHumanTasksBridge } from "@/lib/desktop-updater";
import { PROCESS_META } from "@/lib/domain";
import { PROCESS_ROUTE_SEGMENT } from "@/lib/human-workflow";
import { useAppPreferences } from "@/lib/app-preferences";
import { useHumanTasks } from "@/lib/store";

export function DesktopHumanTaskNotifications() {
  const navigate = useNavigate();
  const tasks = useHumanTasks();
  const { ready, notificationSound, systemNotifications } = useAppPreferences();
  const notifications = useMemo(
    () =>
      tasks.map((task) => ({
        id: `${task.execution.id}:${task.block.id}`,
        title: `Validação pendente · ${task.project.title}`,
        body: `${task.channel.name} · ${PROCESS_META[task.execution.processType].label} · ${task.block.name ?? task.block.type}`,
        route: `/project/${task.project.id}/${PROCESS_ROUTE_SEGMENT[task.execution.processType]}`,
      })),
    [tasks],
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
      notificationSound,
      systemNotifications,
      tasks: notifications,
    });
  }, [notificationSound, notifications, ready, systemNotifications]);

  return null;
}
