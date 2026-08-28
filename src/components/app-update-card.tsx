import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { desktopUpdaterBridge, type DesktopUpdaterState } from "@/lib/desktop-updater";

export function AppUpdateControl() {
  const [state, setState] = useState<DesktopUpdaterState>();
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const bridge = desktopUpdaterBridge();
    if (!bridge) return;
    let active = true;
    void bridge
      .getState()
      .then((next) => active && setState(next))
      .catch(() => undefined);
    const unsubscribe = bridge.subscribe((next) => active && setState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!state || state.distribution === "development") return null;

  const busy = acting || ["checking", "downloading", "installing"].includes(state.status);
  const Icon =
    state.status === "error"
      ? AlertTriangle
      : state.status === "downloaded"
        ? CheckCircle2
        : state.status === "available" || state.distribution === "portable"
          ? Download
          : state.status === "checking" || state.status === "downloading"
            ? LoaderCircle
            : PackageOpen;

  async function act() {
    const bridge = desktopUpdaterBridge();
    if (!bridge || busy || !state) return;
    setActing(true);
    try {
      const next =
        state.distribution === "portable"
          ? await bridge.openReleases()
          : state.status === "available"
            ? await bridge.download()
            : state.status === "downloaded"
              ? await bridge.install()
              : await bridge.check();
      setState(next);
    } catch {
      toast.error("Não foi possível iniciar essa ação de atualização.");
    } finally {
      setActing(false);
    }
  }

  const actionLabel =
    state.distribution === "portable"
      ? "Abrir versão mais recente"
      : state.status === "available"
        ? "Baixar atualização"
        : state.status === "downloaded"
          ? "Reiniciar e atualizar"
          : state.status === "checking"
            ? "Verificando…"
            : state.status === "downloading"
              ? `Baixando ${Math.round(state.progress ?? 0)}%`
              : state.status === "installing"
                ? "Reiniciando…"
                : state.status === "error"
                  ? "Tentar novamente"
                  : state.status === "up-to-date"
                    ? "Verificar novamente"
                    : "Verificar atualização";

  const versionLabel = state.availableVersion
    ? `v${state.currentVersion} → v${state.availableVersion}`
    : `ContentFlow v${state.currentVersion}`;

  return (
    <Button
      type="button"
      size="sm"
      variant={state.status === "downloaded" ? "default" : "outline"}
      className="relative h-11 w-11 shrink-0 justify-start overflow-hidden px-0 sm:w-56 sm:px-3"
      disabled={busy}
      title={state.message}
      aria-label={`${actionLabel}. ${state.message}`}
      onClick={() => void act()}
    >
      <span className="grid size-9 shrink-0 place-items-center sm:size-7">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : state.status === "up-to-date" ? (
          <RefreshCw className="size-4" />
        ) : state.status === "downloaded" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="hidden min-w-0 flex-1 text-left sm:block">
        <span className="block truncate text-xs font-semibold">{actionLabel}</span>
        <span className="block truncate text-[10px] font-normal text-muted-foreground">
          {versionLabel}
        </span>
      </span>
      {["downloading", "downloaded"].includes(state.status) && (
        <Progress
          value={state.progress ?? 0}
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-none"
        />
      )}
    </Button>
  );
}
