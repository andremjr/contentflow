import {
  Bell,
  Check,
  Languages,
  Moon,
  Settings2,
  Sun,
  Volume2,
  Download,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import "@/lib/desktop-updater";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppPreferences, type AppLanguage, type AppTheme } from "@/lib/app-preferences";
import { cn } from "@/lib/utils";

const THEMES: Array<{ value: AppTheme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

const LANGUAGES: Array<{ value: AppLanguage; label: string; detail: string }> = [
  { value: "pt-BR", label: "Português", detail: "Brasil" },
  { value: "en", label: "English", detail: "English" },
  { value: "es", label: "Español", detail: "Español" },
];

export function AppPreferencesDialog() {
  const {
    theme,
    language,
    notificationSound,
    systemNotifications,
    setTheme,
    setLanguage,
    setNotificationSound,
    setSystemNotifications,
    t,
  } = useAppPreferences();
  const [supportBusy, setSupportBusy] = useState(false);
  const diagnostics =
    typeof window === "undefined" ? undefined : window.contentflowDesktop?.diagnostics;
  async function supportAction(action: "export" | "openFolder") {
    if (!diagnostics || supportBusy) return;
    setSupportBusy(true);
    try {
      const result = await diagnostics[action]();
      if (result.status === "error")
        toast.error(t("Não foi possível acessar o diagnóstico. Tente novamente."));
      if (result.status === "exported")
        toast.success(t("Diagnóstico exportado. Você pode enviar o ZIP ao suporte."));
    } catch {
      toast.error(t("Não foi possível acessar o diagnóstico. Tente novamente."));
    } finally {
      setSupportBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-center gap-2 px-2 py-2.5 text-muted-foreground hover:text-foreground sm:justify-start sm:px-3"
          aria-label="Preferências"
        >
          <Settings2 className="size-4 shrink-0" />
          <span className="hidden text-xs font-medium sm:block">Preferências</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Preferências do aplicativo")}</DialogTitle>
          <DialogDescription>
            Estas preferências são globais e ficam salvas neste dispositivo.
          </DialogDescription>
        </DialogHeader>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Sun className="size-3.5" />
            Aparência
          </div>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((option) => {
              const Icon = option.icon;
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition-colors",
                    selected
                      ? "border-brand bg-brand/8 text-foreground"
                      : "border-border bg-surface-1 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                  )}
                  aria-pressed={selected}
                >
                  <Icon className={cn("size-4", selected && "text-brand")} />
                  {option.label}
                  {selected && <Check className="ml-auto size-4 text-brand" />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Languages className="size-3.5" />
            Idioma
          </div>
          <div className="divide-y divide-border border-y border-border">
            {LANGUAGES.map((option) => {
              const selected = language === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLanguage(option.value)}
                  className="flex min-h-12 w-full items-center gap-3 px-2 text-left transition-colors hover:bg-secondary/50"
                  aria-pressed={selected}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{option.detail}</span>
                  </span>
                  {selected && <Check className="size-4 text-brand" />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Bell className="size-3.5" />
            Notificações
          </div>
          <div className="divide-y divide-border border-y border-border">
            <div className="flex min-h-14 items-center gap-3 px-2 py-2.5">
              <Bell className="size-4 shrink-0 text-brand-soft" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  Pendências e erros na barra de tarefas
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  A contagem de validações pendentes aparece sempre no ícone do aplicativo.
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-brand/15 px-2 py-1 text-[10px] font-semibold text-brand-soft">
                Sempre ativo
              </span>
            </div>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-2 py-2.5 hover:bg-secondary/50">
              <Volume2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Som de alerta</span>
                <span className="block text-[11px] text-muted-foreground">
                  Reproduzir um som quando uma nova pendência ou erro precisar de atenção.
                </span>
              </span>
              <Checkbox
                aria-label="Som de alerta"
                checked={notificationSound}
                onCheckedChange={(checked) => setNotificationSound(checked === true)}
              />
            </label>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-2 py-2.5 hover:bg-secondary/50">
              <Bell className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Notificações do Windows</span>
                <span className="block text-[11px] text-muted-foreground">
                  Exibir alertas na central de notificações do Windows.
                </span>
              </span>
              <Checkbox
                aria-label="Notificações do Windows"
                checked={systemNotifications}
                onCheckedChange={(checked) => setSystemNotifications(checked === true)}
              />
            </label>
          </div>
        </section>
        <section className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold text-muted-foreground">
            {t("Suporte e diagnóstico")}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Inclui códigos de erro, etapas, horários e versões técnicas do aplicativo e dos plugins.",
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Registros locais por até 24 horas, com limite de 4 MB. Sem prompts, conteúdo, senhas ou cookies.",
            )}
          </p>
          {diagnostics ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={supportBusy}
                onClick={() => void supportAction("export")}
              >
                <Download className="size-3.5" />
                {t(supportBusy ? "Aguarde…" : "Exportar diagnóstico")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={supportBusy}
                onClick={() => void supportAction("openFolder")}
              >
                <FolderOpen className="size-3.5" />
                {t("Abrir pasta de logs")}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Disponível no aplicativo instalado ou portátil.")}
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
