import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAppPreferences } from "@/lib/app-preferences";
import { refreshState, useProjects, useUpgradeState } from "@/lib/store";
import {
  applyUpgradePlan,
  loadUpgradePlan,
  UpgradeApiError,
  type UpgradePlan,
} from "@/lib/user-data-upgrade";
import { upgradeText } from "@/lib/upgrade-translations";
import { Button } from "@/components/ui/button";

function errorKey(
  error: unknown,
  fallback: keyof ReturnType<typeof upgradeText>,
): keyof ReturnType<typeof upgradeText> {
  return error instanceof UpgradeApiError && error.code in upgradeText("pt-BR")
    ? (error.code as keyof ReturnType<typeof upgradeText>)
    : fallback;
}

export function UserDataUpgradePanel() {
  const upgrade = useUpgradeState();
  const projectCount = useProjects().length;
  const { language } = useAppPreferences();
  const text = upgradeText(language);
  const [plan, setPlan] = useState<UpgradePlan>();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<keyof typeof text>();
  const [applied, setApplied] = useState(false);
  const [backupPath, setBackupPath] = useState<string>();
  const requestId = useRef(0);
  const busy = loading || applying || upgrade.applying;

  useEffect(() => {
    if (!upgrade.required) return;
    let active = true;
    const id = ++requestId.current;
    setLoading(true);
    setConfirmed(false);
    setPlan(undefined);
    setError(undefined);
    void loadUpgradePlan()
      .then((next) => {
        if (active && id === requestId.current) setPlan(next);
      })
      .catch((error) => {
        if (active) setError(errorKey(error, "planError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [upgrade.required, projectCount]);

  async function refresh() {
    const id = ++requestId.current;
    setLoading(true);
    setConfirmed(false);
    setPlan(undefined);
    setError(undefined);
    try {
      const next = await loadUpgradePlan();
      if (id === requestId.current) setPlan(next);
      await refreshState(true);
    } catch (error) {
      setError(errorKey(error, "planError"));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (busy || !confirmed || !plan?.canApply || !plan.required) return;
    setApplying(true);
    setError(undefined);
    setConfirmed(false);
    try {
      const result = await applyUpgradePlan(plan.planId);
      setPlan(result.plan);
      if (!result.applied) {
        setError("applyError");
        return;
      }
      setApplied(true);
      setBackupPath(result.backupPath);
      try {
        await refreshState(true);
      } catch {
        setError("refreshError");
      }
    } catch (error) {
      setPlan((current) => (current ? { ...current, canApply: false } : undefined));
      if (error instanceof UpgradeApiError && error.backupPath) setBackupPath(error.backupPath);
      setError(errorKey(error, "applyError"));
      // A lost response may follow a successful transaction. Reconcile, never retry apply.
      await refreshState(true).catch(() => undefined);
    } finally {
      setApplying(false);
    }
  }

  if (!upgrade.required && !upgrade.applying && !backupPath && !error) return null;
  return (
    <section
      data-i18n-ignore
      data-testid="user-data-upgrade"
      aria-labelledby="upgrade-title"
      className="relative z-40 border-b border-warning/50 bg-card px-4 py-4 text-sm"
    >
      <div className="mx-auto max-w-5xl space-y-3">
        <h2 id="upgrade-title" className="font-semibold">
          {text.title}
        </h2>
        {upgrade.required && <p>{text.description}</p>}
        {backupPath && (
          <p role="status">
            {applied ? text.success : text.backup} <code>{backupPath}</code>
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {text[error]}
          </p>
        )}
        {busy && <p role="status">{applying || upgrade.applying ? text.applying : text.loading}</p>}
        {plan && upgrade.required && (
          <>
            {!plan.required ? <p>{text.ready}</p> : !plan.canApply && <p>{text.blocked}</p>}
            {plan.historicalJobsPreserved && <p>{text.historical}</p>}
            {Boolean(plan.proposedMethods?.length) && <p role="status">{text.proposed}</p>}
            {plan.diagnostics.length > 0 && (
              <details>
                <summary>
                  {text.diagnostics} ({plan.diagnostics.length})
                </summary>
                <ul className="max-h-52 space-y-2 overflow-auto py-2">
                  {plan.diagnostics.map((diagnostic, index) => (
                    <li key={index}>
                      <code>{diagnostic.path}</code>: {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-4">
              {plan.guideUrl && (
                <a href={plan.guideUrl} target="_blank" rel="noreferrer" className="underline">
                  {text.guide}
                </a>
              )}
              {plan.skillUrl && (
                <a href={plan.skillUrl} target="_blank" rel="noreferrer" className="underline">
                  {text.skill}
                </a>
              )}
              <Link to="/plugins" className="underline">
                {text.plugins}
              </Link>
            </div>
            {plan.required && plan.canApply && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {text.confirm}
              </label>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {(upgrade.required || error) && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
              {text.refresh}
            </Button>
          )}
          {upgrade.required && (
            <Button
              size="sm"
              disabled={busy || !confirmed || !plan?.required || !plan.canApply}
              onClick={() => void apply()}
            >
              {text.apply}
            </Button>
          )}
          {!upgrade.required && backupPath && !error && (
            <Button variant="ghost" size="sm" onClick={() => setBackupPath(undefined)}>
              {text.close}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export function IncompatibleDataNotice({ value }: { value: unknown }) {
  const { language } = useAppPreferences();
  const text = upgradeText(language);
  return (
    <section data-i18n-ignore className="m-4 space-y-3 rounded-lg border border-warning/50 p-4">
      <p role="status">{text.incompatible}</p>
      <details>
        <summary>{text.raw}</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    </section>
  );
}
