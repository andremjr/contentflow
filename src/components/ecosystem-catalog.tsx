import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useAppPreferences } from "@/lib/app-preferences";
import { ecosystemCatalogText } from "@/lib/ecosystem-catalog-localization";
import { ECOSYSTEM_DOWNLOADS } from "@/lib/ecosystem-downloads";

type Entry = {
  id: string;
  name: string;
  description?: string;
  version: string;
  installed?: boolean;
  compatible: boolean;
};

export function EcosystemCatalog({
  kind,
  onSelect,
}: {
  kind: "plugins" | "methods";
  onSelect: (id: string) => Promise<void>;
}) {
  const { language } = useAppPreferences();
  const t = (key: Parameters<typeof ecosystemCatalogText>[0]) =>
    ecosystemCatalogText(key, language);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/${kind}/catalog`, { cache: "no-store" });
      if (!response.ok) throw new Error("catalog");
      const payload = await response.json();
      setEntries(payload[kind]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  async function select(id: string) {
    setBusy(id);
    try {
      await onSelect(id);
      await load();
    } catch {
      toast.error(ecosystemCatalogText("failed", language));
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section className="mb-5 rounded-xl border border-border bg-card/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t(kind)}
        </Button>
        <a
          className="flex items-center gap-1 text-xs text-brand-soft"
          href={ECOSYSTEM_DOWNLOADS[kind]}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="size-3.5" />
          {t("explore")}
        </a>
      </div>
      {open && (
        <>
          <p className="my-3 text-xs text-muted-foreground">
            {t(kind === "plugins" ? "permissions" : "importHint")}
          </p>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={loading ? "mr-2 size-3.5 animate-spin" : "mr-2 size-3.5"} />
            {t("refresh")}
          </Button>
          {loading ? (
            <p className="mt-3 text-sm">{t("loading")}</p>
          ) : error ? (
            <p role="alert" className="mt-3 text-sm">
              {t("unavailable")}
            </p>
          ) : !entries.length ? (
            <p className="mt-3 text-sm">{t("empty")}</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-border p-3">
                  <h3 data-i18n-ignore className="text-sm font-semibold">
                    {entry.name}
                  </h3>
                  <p data-i18n-ignore className="mt-1 text-xs text-muted-foreground">
                    v{entry.version} · {entry.description}
                  </p>
                  {!entry.compatible && (
                    <p className="mt-2 text-xs text-warning">{t("incompatible")}</p>
                  )}
                  <Button
                    className="mt-3 gap-2"
                    size="sm"
                    disabled={!!busy || !entry.compatible || entry.installed}
                    onClick={() => void select(entry.id)}
                  >
                    <Download className="size-3.5" />
                    {t(entry.installed ? "installed" : kind === "plugins" ? "install" : "import")}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
