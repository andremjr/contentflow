import type {
  BlockFieldDefinition,
  BlockInputBinding,
  BlockExecutionItemValue,
  BlockType,
  BlockValidationConfig,
  FieldPresentation,
  ProcessOutput,
  ProjectDelivery,
  RuntimeValue,
  StoredFile,
  UniversalProcess,
  ValueShape,
} from "@/lib/domain";

export const CONTENTFLOW_PLUGIN_API_VERSION = "2" as const;

export type PluginOperator = "Humano" | "IA" | "Código";
export type PluginPermission =
  "network" | "filesystem:read" | "filesystem:write" | "process" | "worker" | "native";

export type PluginRuntime = {
  kind: "node";
  version: string;
  module: "esm";
};

export type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number | boolean>;
  examples?: unknown[];
  items?: JsonSchema;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  const?: unknown;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  /** Declarative UI hint: only renders a field when another configuration value matches. */
  visibleWhen?: {
    property: string;
    values: Array<string | number | boolean>;
  };
  /** Declarative presentation hints interpreted by the core-owned configuration renderer. */
  ui?: {
    section?: "primary" | "advanced";
    order?: number;
    width?: "half" | "full";
  };
};

export type PluginInputPort = {
  key: string;
  label: string;
  description?: string;
  shape: ValueShape;
  required: boolean;
  /** Optional request for a renderer owned and validated by the core. */
  presentation?: FieldPresentation;
};

export type PluginOutputPort = {
  key: string;
  label: string;
  description?: string;
  shape: ValueShape;
  required: boolean;
  /** Optional request for a renderer owned and validated by the core. */
  presentation?: FieldPresentation;
};

export type PluginExecutionPolicy = {
  mode: "immediate" | "async";
  defaultTimeoutMs?: number;
  supportsCancellation?: boolean;
  maxConcurrency?: number;
  /** Optional core-owned sequential expansion of one list input into atomic plugin calls. */
  itemOrchestration?: {
    inputPort: string;
    outputPort: string;
    mode: "sequential";
    /** Optional text output rebuilt from the accumulated list after each item. */
    combinedOutputPort?: string;
    separator?: string;
    /** Optional API v2 strategies for core-owned item orchestration. */
    strategies?: Array<"continuous_session" | "per_item">;
    /** Must reference one of `strategies` when present. */
    preferredStrategy?: "continuous_session" | "per_item";
    /** Declares future eligibility for core-owned distribution across distinct physical profiles. */
    profileParallelism?: {
      supported: boolean;
      maxProfiles?: number;
    };
    /** Additional structurally valid input/output pairs selectable by Method configuration. */
    collectionAssociations?: Array<{
      key: string;
      inputPort: string;
      outputPort: string;
      combinedOutputPort?: string;
      separator?: string;
    }>;
  };
};

export type PluginConfigurationOptionsProvider = {
  /** Campo de primeiro nível de blockConfigSchema.properties preenchido dinamicamente. */
  property: string;
  /** Identificador estável enviado ao plugin em invocation.mode=configure/action=options. */
  providerId: string;
  /** Campos de configuração cuja alteração invalida as opções em cache. */
  dependsOn?: string[];
  /** Tempo máximo sugerido para reutilizar opções já resolvidas. */
  cacheTtlMs?: number;
};

export type PluginItemAction = "regenerate" | "replace" | "select" | "download";

export type PluginItemActionDeclaration = {
  action: PluginItemAction;
  /** Rótulo opcional do plugin; quando ausente o núcleo usa seu texto padrão traduzido. */
  label?: string;
};

/** Declares whether a capability consumes the Method block instruction. */
export type PluginInstructionUsage = "required" | "optional" | "not_applicable";

/** Declarative, secret-free shape of the textual message sent by a capability. */
export type PluginPromptPreview = {
  /** Supports {{BLOCK_INSTRUCTIONS}}, {{CONTENT}}, {{CONTEXT_INPUTS}} and {{INPUT:portKey}}. */
  template: string;
  /** Uses a non-secret block configuration string as the template when it is set. */
  templateConfigurationKey?: string;
};

export type PluginSideEffect =
  "external_read" | "external_write" | "public_publish" | "local_artifact" | "subprocess";

export type PluginCostPolicy = {
  model: "free" | "metered" | "unknown";
  estimateSupported: boolean;
};

export type PluginDataPolicy = {
  sendsDataToThirdParties: boolean;
  providers?: string[];
  retentionPolicyUrl?: string;
  trainingPolicyUrl?: string;
};

export type PluginFieldContract = Pick<
  BlockFieldDefinition,
  "label" | "key" | "shape" | "required" | "presentation"
> & {
  portKey: string;
};

export type PluginCapability = {
  id: string;
  /** Friendly, user-facing capability name. The stable `id` remains internal to the contract. */
  name?: string;
  /** Short user-facing explanation of what this capability accomplishes. */
  description?: string;
  operator: PluginOperator;
  /** Omitted means `optional`. */
  instructionUsage?: PluginInstructionUsage;
  /** Exact structural prompt shape declared by the plugin; it never includes secrets. */
  promptPreview?: PluginPromptPreview;
  blockTypes: BlockType[];
  processTypes?: UniversalProcess[];
  inputPorts: PluginInputPort[];
  outputPorts: PluginOutputPort[];
  execution: PluginExecutionPolicy;
  sideEffects: PluginSideEffect[];
  cost: PluginCostPolicy;
  dataPolicy: PluginDataPolicy;
  blockConfigSchema: JsonSchema;
  /** Campos cujas opções são resolvidas pelo plugin usando a configuração/perfil local atual. */
  configurationOptions?: PluginConfigurationOptionsProvider[];
  /** Ações que a interface pode oferecer para cada item produzido por esta capability. */
  itemActions?: PluginItemActionDeclaration[];
  outputSchema: JsonSchema;
};

export type PluginProfileSetup = {
  configurationKey: string;
  /** Ordered aliases used only after retryable technical failures. */
  fallbackConfigurationKey?: string;
  label: string;
  description?: string;
  prepareTimeoutMs?: number;
};

export type PluginBranding = {
  /** Relative PNG/WebP path inside the plugin package. The core validates and serves the asset. */
  iconPath: string;
};

export type PluginLocalizedText = {
  name?: string;
  description?: string;
  label?: string;
  title?: string;
};

export type PluginLocalizedOption = {
  value: string | number | boolean;
  label: string;
};

export type PluginLocalizedSchemaProperty = {
  title?: string;
  description?: string;
  options?: PluginLocalizedOption[];
};

export type PluginCapabilityLocalization = {
  name?: string;
  description?: string;
  inputPorts?: Record<string, { label?: string; description?: string }>;
  outputPorts?: Record<string, { label?: string; description?: string }>;
  itemActions?: Partial<Record<PluginItemAction, { label?: string }>>;
  blockConfigSchema?: {
    properties?: Record<string, PluginLocalizedSchemaProperty>;
  };
};

export type PluginManifestLocalization = {
  name?: string;
  description?: string;
  profileSetup?: { label?: string; description?: string };
  capabilities?: Record<string, PluginCapabilityLocalization>;
};

export type PluginManifest = {
  $schema?: string;
  apiVersion: typeof CONTENTFLOW_PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  branding?: PluginBranding;
  /** Optional locale overlays for user-facing plugin text. Technical IDs and values are never translated. */
  localizations?: Record<string, PluginManifestLocalization>;
  runtime: PluginRuntime;
  minCoreVersion?: string;
  entrypoint: string;
  permissions: PluginPermission[];
  /** Intended remote hosts. Core-managed downloads enforce this list; Node's network permission is currently all-or-nothing. */
  networkHosts?: string[];
  settingsSchema?: JsonSchema;
  secretKeys?: string[];
  /** Declared secrets that unlock optional functionality but are not required to execute the plugin. */
  optionalSecretKeys?: string[];
  /** Optional interactive preparation for a dedicated browser profile referenced by block configuration. */
  profileSetup?: PluginProfileSetup;
  /** Core opens and closes the physical browser; the plugin only controls the authorized page. */
  browserRuntime?: { lifecycle: "core" };
  /** O pacote pode retomar entre capabilities uma conversa opaca produzida por um bloco anterior. */
  supportsConversationContinuation?: boolean;
  capabilities: PluginCapability[];
};

export function pluginConnectionRequired(
  manifest: Pick<PluginManifest, "secretKeys" | "optionalSecretKeys">,
) {
  const optional = new Set(manifest.optionalSecretKeys ?? []);
  return (manifest.secretKeys ?? []).some((secretKey) => !optional.has(secretKey));
}

export type PluginExecutionContext = {
  locale: string;
  timeZone: string;
  channel: { id: string; name: string; language: string; niche: string };
  project: { id: string; title: string };
  processType: UniversalProcess;
  block: { type: BlockType; name: string; instructions: string };
  /** @deprecated Na API v2, o núcleo não popula histórico implícito. Use bindings em `inputs`. */
  previousProcessOutputs?: ProcessOutput[];
  /** @deprecated Na API v2, o núcleo não popula histórico implícito. Use bindings em `inputs`. */
  previousBlockOutputs?: Array<{ blockId: string; values: Record<string, RuntimeValue> }>;
  /** @deprecated Na API v2, o núcleo não popula histórico implícito. Use `inputDeliveries`. */
  previousDeliveries?: ProjectDelivery[];
  selectedCollection?: {
    collectionId: string;
    items: Array<{
      id: string;
      values: Record<string, RuntimeValue>;
    }>;
  };
};

export type PluginInvocation =
  | { mode: "start" }
  | { mode: "resume"; jobId: string }
  | { mode: "cancel"; jobId: string }
  | { mode: "configure"; action: "status" | "prepare" }
  | {
      mode: "configure";
      action: "options";
      providerId: string;
      property: string;
    }
  | {
      mode: "item_action";
      action: PluginItemAction;
      itemId: string;
      outputPort: string;
    };

export type PluginInputContract = Pick<
  BlockInputBinding,
  "id" | "label" | "shape" | "presentation"
> & {
  portKey: string;
};

export type PluginInputDelivery = {
  inputId: string;
  portKey: string;
  deliveryId?: string;
  itemIds: string[];
  items?: Array<{
    id: string;
    value: RuntimeValue;
    references?: Array<{ itemId: string; role?: string }>;
  }>;
};

export type PluginArtifact = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  source: { kind: "path"; path: string } | { kind: "url"; url: string };
};

export type PluginUsage = {
  provider?: string;
  model?: string;
  inputUnits?: number;
  outputUnits?: number;
  totalUnits?: number;
  unit?: string;
  estimatedCost?: number;
  currency?: string;
};

export type PluginExecutionRequest = {
  executionId: string;
  traceId: string;
  blockId: string;
  capabilityId: string;
  attempt: number;
  invocation: PluginInvocation;
  configuration: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** `inputs` is keyed by the semantic `portKey` declared in `inputContract`. */
  inputs: Record<string, RuntimeValue>;
  /** Inputs not already interpolated into `resolvedInstruction`, for prompt context composition. */
  instructionContextInputs?: Record<string, RuntimeValue>;
  inputContract: PluginInputContract[];
  /** Metadados paralelos aos valores para plugins que precisam rastrear a proveniência dos `inputs`. */
  inputDeliveries?: PluginInputDelivery[];
  outputContract: PluginFieldContract[];
  /** Core-owned durable partial outputs available to a later retry of the same block. */
  resume?: {
    values: Record<string, RuntimeValue>;
    artifacts: StoredFile[];
  };
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  /** Recovery action chosen by the Core from facts reported by the previous invocation. */
  recoveryDirective?: { action: "reload_page"; reasonCode: string };
  /** Core-resolved block instruction. Updated plugins should prefer this over the raw template. */
  resolvedInstruction?: string;
  /** Variables left intact because no declared runtime source could resolve them. */
  unresolvedInstructionVariables?: string[];
  conversation?:
    | {
        mode: "new";
        /** Contexto textual seguro usado quando a conversa anterior não pode ser aberta. */
        fallbackContext?: string;
        /** Turno curto que substitui o prompt completo, por exemplo após reprovação editorial. */
        continuationMessage?: string;
        /** Imagens anteriores que o plugin anexa somente ao realmente abrir outra conversa. */
        fallbackAttachments?: StoredFile[];
      }
    | {
        mode: "reuse";
        id: string;
        /** Alias não secreto do perfil que criou a conversa. */
        sourceProfile?: string;
        fallbackContext?: string;
        continuationMessage?: string;
        fallbackAttachments?: StoredFile[];
      };
  /** Core-owned position when a declared list input is executed item by item. */
  batch?: { itemId: string; sourceItemId?: string; index: number; total: number };
  /** Contexto imutável do item quando invocation.mode=item_action. */
  itemAction?: {
    key?: string;
    /** Variante local correlacionada ao item universal que o núcleo selecionou. */
    variantKey?: string;
    input: BlockExecutionItemValue;
    output?: BlockExecutionItemValue;
    attempt: number;
  };
  context: PluginExecutionContext;
};

export type PluginExecutionResponse =
  | {
      status: "success";
      /** Values keyed exclusively by the technical `portKey` in `outputContract`. */
      values: Record<string, RuntimeValue>;
      artifacts?: PluginArtifact[];
      /** Preenchido pelo núcleo após importar artifacts; plugins não devem definir este campo. */
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
      /** Eventos estruturais e redigidos da Browser Bridge, sem conteúdo da página. */
      bridgeDiagnostics?: Array<{ code: "BRIDGE_CONTROLLED_RELOAD" | "BRIDGE_WORKER_RESTART" }>;
      conversation?: { id: string };
    }
  | {
      status: "pending";
      jobId: string;
      pollAfterMs: number;
      progress?: number;
      message?: string;
      /** Snapshot keyed exclusively by output `portKey`; each present key replaces that port. */
      partialValues?: Record<string, RuntimeValue>;
      /** Artifacts referenciados por partialValues; passam pelo mesmo importador dos finais. */
      partialArtifacts?: PluginArtifact[];
      /** Preenchido pelo núcleo após importar partialArtifacts. */
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
      bridgeDiagnostics?: Array<{ code: "BRIDGE_CONTROLLED_RELOAD" | "BRIDGE_WORKER_RESTART" }>;
    }
  | {
      status: "error";
      code: string;
      message: string;
      /**
       * Operational facts observed by the adapter. They are evidence for the
       * core recovery policy, never an instruction to retry or switch profile.
       */
      recovery?: PluginRecoveryFacts;
      retryable: boolean;
      retryAfterMs?: number;
      /** Completed outputs keyed by output `portKey` remain durable when a later item fails. */
      partialValues?: Record<string, RuntimeValue>;
      partialArtifacts?: PluginArtifact[];
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
      bridgeDiagnostics?: Array<{ code: "BRIDGE_CONTROLLED_RELOAD" | "BRIDGE_WORKER_RESTART" }>;
    };

export type PluginRecoveryFacts = {
  /** Last externally relevant stage reached by this invocation. */
  stage?: "before_effect" | "effect_submitted" | "awaiting_result" | "effect_confirmed";
  /** Whether the invocation can prove that an external side effect did or did not happen. */
  externalEffect?: "none" | "possible" | "confirmed";
  /** Opaque provider receipt used only to reconcile the same operation. */
  externalReceipt?: string;
  /** Human condition observed by the adapter, without choosing the recovery action. */
  intervention?:
    | "authentication"
    | "captcha"
    | "permission"
    | "quota"
    | "upgrade"
    | "account_blocked"
    | "provider_security_challenge"
    | "provider_ui_changed"
    | "plugin_setup";
};

export type PluginConfigurationOption = {
  value: string | number | boolean;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type PluginIncrementalItemUpdate = {
  /** Chave estável apenas dentro da tentativa; o núcleo continua dono do itemId universal. */
  key: string;
  /**
   * Chave local da variante dentro do mesmo item de lote. Quando ausente,
   * `key` preserva a correlação local de plugins que ainda não declaram variantes.
   */
  variantKey?: string;
  outputPort: string;
  state: "created" | "running" | "completed" | "failed";
  /** Entrada editorial que originou o slot e será reutilizada em ações posteriores. */
  input?: BlockExecutionItemValue;
  value?: BlockExecutionItemValue;
  message?: string;
  errorCode?: string;
  retryable?: boolean;
};

/** Incremental snapshot emitted while an immediate plugin invocation is still running. */
export type PluginPartialUpdate = {
  values: Record<string, RuntimeValue>;
  artifacts?: PluginArtifact[];
  /** Eventos incrementais de itens; o núcleo mapeia `key` para IDs universais persistentes. */
  itemUpdates?: PluginIncrementalItemUpdate[];
  progress?: number;
  message?: string;
  logs?: string[];
};

export type PluginWorkItemStatus =
  | "planned"
  | "pending"
  | "leased"
  | "submitted"
  | "awaiting_result"
  | "completed"
  | "failed"
  | "awaiting_human"
  | "cancelled";

export type PluginPlannedWorkItem = {
  /** Correlation key supplied by the plugin only for this derived-item plan. */
  key: string;
  order: number;
  input: BlockExecutionItemValue;
};

export type PluginClaimedWorkItem = {
  itemId: string;
  index: number;
  total: number;
  order: number;
  attempt: number;
  revision: number;
  /** Durable state observed before this invocation claimed the item. */
  state: PluginWorkItemStatus;
  input: BlockExecutionItemValue;
  sourceDeliveryId?: string;
  sourceItemId?: string;
  parentItemId?: string;
};

export type PluginWorkItemUpdate = {
  itemId: string;
  expectedRevision: number;
  state: Exclude<PluginWorkItemStatus, "planned" | "pending" | "leased">;
  outputPort?: string;
  value?: BlockExecutionItemValue;
  artifacts?: PluginArtifact[];
  externalReceipt?: string;
  message?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type PluginWorkItemUpdateReceipt = {
  itemId: string;
  revision: number;
};

export type PluginExecutionServices = {
  signal: AbortSignal;
  getSecret: (key: string) => Promise<string | undefined>;
  resolveInputFile: (file: StoredFile) => Promise<string>;
  getOutputPath: (relativePath: string) => string;
  getWorkspacePath: (relativePath: string) => string;
  /** Serviço opcional da API v2 para o perfil global selecionado pelo núcleo. */
  getProfilePath?: (relativePath: string) => string;
  /** Makes completed intermediate work durable before execute() returns. */
  publishPartial: (update: PluginPartialUpdate) => Promise<void>;
  /** Serviço opcional da API v2; o suporte do runtime é negociado antes do uso. */
  registerItems?: (
    parentItemId: string,
    plannedItems: PluginPlannedWorkItem[],
  ) => Promise<PluginClaimedWorkItem[]>;
  /** Serviço opcional da API v2 para sessões contínuas. */
  claimItems?: (limit: number) => Promise<PluginClaimedWorkItem[]>;
  /** Resolves only after the core durably persists the material state transition. */
  publishItemUpdate?: (update: PluginWorkItemUpdate) => Promise<PluginWorkItemUpdateReceipt>;
};

export type PluginEntrypoint = {
  execute: (
    request: PluginExecutionRequest,
    services: PluginExecutionServices,
  ) => Promise<PluginExecutionResponse>;
};
