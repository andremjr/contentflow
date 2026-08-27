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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { desktopUpdaterBridge, type DesktopUpdaterState } from "@/lib/desktop-updater";

export function AppUpdateCard() {
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

  return (
    <section className="mx-auto mb-6 max-w-[1500px] overflow-hidden rounded-2xl border border-brand/25 bg-card/70 shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-soft">
            <Icon
              className={`size-5 ${["checking", "downloading"].includes(state.status) ? "animate-spin" : ""}`}
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Atualização do ContentFlow OS</h2>
              <Badge variant="outline" className="text-[10px]">
                v{state.currentVersion}
              </Badge>
              {state.availableVersion && state.availableVersion !== state.currentVersion && (
                <Badge variant="secondary" className="text-[10px]">
                  v{state.availableVersion} disponível
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.message}</p>
            {state.distribution === "portable" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Seus Projetos e plugins ficam na área de dados e não são removidos pelo instalador.
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant={state.status === "downloaded" ? "default" : "outline"}
          className="shrink-0 gap-1.5"
          disabled={busy}
          onClick={() => void act()}
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : state.status === "up-to-date" ? (
            <RefreshCw className="size-3.5" />
          ) : state.status === "downloaded" ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <Download className="size-3.5" />
          )}
          {actionLabel}
        </Button>
      </div>

      {["downloading", "downloaded"].includes(state.status) && (
        <Progress value={state.progress ?? 0} className="h-1 rounded-none" />
      )}
    </section>
  );
}
