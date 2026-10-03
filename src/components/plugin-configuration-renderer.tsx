import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  encodePluginConfigurationOptionValue,
  findPluginConfigurationOption,
  pluginConfigurationDependencySignature,
  toPluginConfigurationRequest,
  withSavedPluginConfigurationOption,
} from "@/lib/plugin-configuration-ui";
import { buildPluginConfigurationRendererModel } from "@/lib/plugin-configuration-renderer";
import type {
  JsonSchema,
  PluginCapability,
  PluginConfigurationOption,
  PluginProfileSetup,
} from "@/lib/plugin-contract";

export function PluginConfigurationRenderer({
  pluginId,
  capability,
  connectionId,
  configuration,
  profileSetup,
  connectionSection,
  profileSection,
  conversationSection,
  dataSection,
  onConfigurationChange,
}: {
  pluginId: string;
  capability: PluginCapability;
  connectionId?: string;
  configuration: Record<string, string | number | boolean>;
  profileSetup?: PluginProfileSetup;
  connectionSection?: ReactNode;
  profileSection?: ReactNode;
  conversationSection?: ReactNode;
  dataSection?: ReactNode;
  onConfigurationChange: (configuration: Record<string, string | number | boolean>) => void;
}) {
  const { t } = useAppPreferences();
  const model = buildPluginConfigurationRendererModel({ capability, configuration, profileSetup });
  const isCompactConfigurationField = ([, schema]: [string, JsonSchema]) =>
    schema.ui?.width !== "full" &&
    (schema.ui?.width === "half" ||
      schema.type === "integer" ||
      schema.type === "number" ||
      schema.type === "boolean");
  const renderConfigurationField = ([key, schema]: [string, JsonSchema]) => (
    <PluginConfigurationField
      key={key}
      configurationOptionsProvider={capability.configurationOptions?.find(
        (provider) => provider.property === key,
      )}
      pluginId={pluginId}
      capabilityId={capability.id}
      connectionId={connectionId}
      configuration={configuration}
      profileConfigurationKey={profileSetup?.configurationKey}
      propertyKey={key}
      schema={schema}
      value={
        configuration[key] ??
        (typeof schema.default === "string" ||
        typeof schema.default === "number" ||
        typeof schema.default === "boolean"
          ? schema.default
          : undefined)
      }
      onChange={(value) => onConfigurationChange({ ...configuration, [key]: value })}
    />
  );

  return (
    <div className="space-y-4">
      <section
        className="space-y-3 rounded-lg border border-brand/25 bg-brand/5 p-3"
        data-testid="plugin-capability-interface"
      >
        <div>
          <p className="text-xs font-semibold">{t("Interface do plugin")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("Defina como esta capacidade deve trabalhar neste bloco.")}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {model.capabilityEntries.map((entry) => (
            <div
              key={entry[0]}
              className={isCompactConfigurationField(entry) ? undefined : "md:col-span-2"}
            >
              {renderConfigurationField(entry)}
            </div>
          ))}
        </div>
        {dataSection}
        {model.advancedEntries.length > 0 && (
          <details className="rounded-md border border-border/70 bg-background/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t("Opções avançadas")}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {model.advancedEntries.map((entry) => (
                <div
                  key={entry[0]}
                  className={isCompactConfigurationField(entry) ? undefined : "md:col-span-2"}
                >
                  {renderConfigurationField(entry)}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
      {connectionSection}
      {profileSection}
      {conversationSection}
    </div>
  );
}

function PluginConfigurationField({
  configurationOptionsProvider,
  pluginId,
  capabilityId,
  connectionId,
  configuration,
  profileConfigurationKey,
  propertyKey,
  schema,
  value,
  options,
  onChange,
}: {
  configurationOptionsProvider?: {
    property: string;
    providerId: string;
    dependsOn?: string[];
  };
  pluginId?: string;
  capabilityId?: string;
  connectionId?: string;
  configuration?: Record<string, unknown>;
  profileConfigurationKey?: string;
  propertyKey: string;
  schema: JsonSchema;
  value: string | number | boolean | undefined;
  options?: Array<{ value: string; label: string }>;
  onChange: (value: string | number | boolean) => void;
}) {
  const { t } = useAppPreferences();
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  const optionsRequestIdRef = useRef(0);
  const [dynamicOptions, setDynamicOptions] = useState<PluginConfigurationOption[] | undefined>();
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState(false);
  const label =
    propertyKey === "startMinimized" ? t("Iniciar minimizado") : (schema.title ?? propertyKey);
  const dependencySignature = configurationOptionsProvider
    ? pluginConfigurationDependencySignature(configuration, [
        ...(configurationOptionsProvider.dependsOn ?? []),
        ...(profileConfigurationKey ? [profileConfigurationKey] : []),
      ])
    : "";
  const loadDynamicOptions = useCallback(
    async (refresh = false) => {
      if (!configurationOptionsProvider || !pluginId || !capabilityId) return;
      const requestId = ++optionsRequestIdRef.current;
      setOptionsLoading(true);
      setOptionsError(false);
      try {
        const response = await fetch(
          `/api/plugins/${encodeURIComponent(pluginId)}/capabilities/${encodeURIComponent(capabilityId)}/configuration-options/${encodeURIComponent(propertyKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              configuration: toPluginConfigurationRequest(configurationRef.current),
              ...(connectionId ? { connectionId } : {}),
              ...(refresh ? { refresh: true } : {}),
            }),
          },
        );
        if (!response.ok)
          throw new Error(`configuration options request failed: ${response.status}`);
        const payload = (await response.json()) as { options?: PluginConfigurationOption[] };
        if (requestId === optionsRequestIdRef.current) {
          setDynamicOptions(Array.isArray(payload.options) ? payload.options : []);
        }
      } catch {
        if (requestId === optionsRequestIdRef.current) setOptionsError(true);
      } finally {
        if (requestId === optionsRequestIdRef.current) setOptionsLoading(false);
      }
    },
    [capabilityId, configurationOptionsProvider, connectionId, pluginId, propertyKey],
  );

  useEffect(() => {
    if (!configurationOptionsProvider) {
      optionsRequestIdRef.current += 1;
      setDynamicOptions(undefined);
      setOptionsError(false);
      setOptionsLoading(false);
      return;
    }
    void loadDynamicOptions();
  }, [configurationOptionsProvider, dependencySignature, loadDynamicOptions]);

  const staticChoices: PluginConfigurationOption[] = options
    ? options.map((option) => ({ ...option }))
    : (schema.oneOf ?? []).flatMap((option) =>
        typeof option.const === "string" ||
        typeof option.const === "number" ||
        typeof option.const === "boolean"
          ? [{ value: option.const, label: option.title ?? String(option.const) }]
          : [],
      );
  if (!staticChoices.length && schema.enum?.length) {
    staticChoices.push(...schema.enum.map((option) => ({ value: option, label: String(option) })));
  }
  const choices = dynamicOptions ?? staticChoices;
  const renderedChoices = withSavedPluginConfigurationOption(
    choices,
    value,
    t("Opção salva indisponível"),
    choices.length > 0 || Boolean(configurationOptionsProvider),
  );

  if (!configurationOptionsProvider && !options && schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        {label}
      </label>
    );
  }
  if (renderedChoices.length || configurationOptionsProvider) {
    const selectedValue = value === undefined ? "" : encodePluginConfigurationOptionValue(value);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>{label}</Label>
          {configurationOptionsProvider && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={optionsLoading}
              onClick={() => void loadDynamicOptions(true)}
            >
              {t("Atualizar opções")}
            </Button>
          )}
        </div>
        <Select
          value={selectedValue}
          onValueChange={(encodedValue) => {
            const option = findPluginConfigurationOption(renderedChoices, encodedValue);
            if (option) onChange(option.value);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("Selecione uma opção")} />
          </SelectTrigger>
          <SelectContent>
            {renderedChoices.map((option) => (
              <SelectItem
                key={encodePluginConfigurationOptionValue(option.value)}
                value={encodePluginConfigurationOptionValue(option.value)}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {optionsLoading && (
          <p className="text-[11px] text-muted-foreground">{t("Carregando opções…")}</p>
        )}
        {!optionsLoading && dynamicOptions?.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{t("Nenhuma opção disponível.")}</p>
        )}
        {optionsError && (
          <p className="text-[11px] text-destructive">
            {t("Não foi possível carregar as opções.")}
          </p>
        )}
        {schema.description && (
          <p className="text-[11px] text-muted-foreground">{schema.description}</p>
        )}
      </div>
    );
  }
  if (schema.format === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Textarea
          value={String(value ?? "")}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {schema.type === "number" || schema.type === "integer" ? (
        <NumberInput
          value={typeof value === "number" ? value : null}
          integer={schema.type === "integer"}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.type === "number" ? "0.1" : undefined}
          onValueChange={(nextValue) => {
            if (nextValue !== null) onChange(nextValue);
          }}
        />
      ) : (
        <Input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
      )}
      {schema.description && (
        <p className="text-[11px] text-muted-foreground">{schema.description}</p>
      )}
    </div>
  );
}
