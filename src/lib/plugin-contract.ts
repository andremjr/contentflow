import type {
  BlockFieldDefinition,
  BlockInputBinding,
  BlockType,
  BlockValidationConfig,
  HumanFieldType,
  FieldPresentation,
  ProcessOutput,
  ProjectDelivery,
  RuntimeValue,
  StoredFile,
  UniversalProcess,
} from "@/lib/domain";

export const CONTENTFLOW_PLUGIN_API_VERSION = "1" as const;

export type PluginOperator = "IA" | "Código";
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
};

export type PluginDataType = HumanFieldType;

export type PluginInputPort = {
  key: string;
  label: string;
  description?: string;
  acceptedTypes: PluginDataType[];
  required: boolean;
  multiple?: boolean;
  /** Optional request for a renderer owned and validated by the core. */
  presentation?: FieldPresentation;
};

export type PluginOutputPort = {
  key: string;
  label: string;
  description?: string;
  producedTypes: PluginDataType[];
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
  };
};

/** Declares whether a capability consumes the Method block instruction. */
export type PluginInstructionUsage = "required" | "optional" | "not_applicable";

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
  "label" | "key" | "type" | "required" | "options" | "recordFields" | "presentation"
> & {
  portKey: string;
};

export type PluginCapability = {
  id: string;
  operator: PluginOperator;
  /** Optional in API v1 for backwards compatibility; omitted means `optional`. */
  instructionUsage?: PluginInstructionUsage;
  blockTypes: BlockType[];
  processTypes?: UniversalProcess[];
  inputPorts: PluginInputPort[];
  outputPorts: PluginOutputPort[];
  acceptedInputTypes?: PluginDataType[];
  producedOutputTypes?: PluginDataType[];
  execution: PluginExecutionPolicy;
  sideEffects: PluginSideEffect[];
  cost: PluginCostPolicy;
  dataPolicy: PluginDataPolicy;
  blockConfigSchema: JsonSchema;
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

export type PluginDeliveryType = "text" | "image" | "audio" | "video" | "processing";

export type PluginBranding = {
  /** Relative PNG/WebP path inside the plugin package. The core validates and serves the asset. */
  iconPath: string;
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
  runtime: PluginRuntime;
  minCoreVersion?: string;
  entrypoint: string;
  permissions: PluginPermission[];
  /** Intended remote hosts. Core-managed downloads enforce this list; Node's network permission is currently all-or-nothing. */
  networkHosts?: string[];
  settingsSchema?: JsonSchema;
  secretKeys?: string[];
  deliveryTypes?: PluginDeliveryType[];
  /** Optional interactive preparation for a dedicated browser profile referenced by block configuration. */
  profileSetup?: PluginProfileSetup;
  /** O pacote pode retomar entre capabilities uma conversa opaca produzida por um bloco anterior. */
  supportsConversationContinuation?: boolean;
  capabilities: PluginCapability[];
};

export type PluginExecutionContext = {
  locale: string;
  timeZone: string;
  channel: { id: string; name: string; language: string; niche: string };
  project: { id: string; title: string };
  processType: UniversalProcess;
  block: { type: BlockType; name: string; instructions: string };
  previousProcessOutputs: ProcessOutput[];
  previousBlockOutputs: Array<{ blockId: string; values: Record<string, RuntimeValue> }>;
  /** Entregas anteriores com identidade universal, ordem e proveniência. */
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
  | { mode: "configure"; action: "status" | "prepare" };

export type PluginInputContract = Pick<
  BlockInputBinding,
  "id" | "label" | "type" | "recordFields" | "presentation"
> & {
  portKey: string;
};

export type PluginInputDelivery = {
  inputId: string;
  portKey: string;
  deliveryId?: string;
  itemIds: string[];
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
  /** Metadados paralelos aos valores, sem quebrar plugins v1 que leem apenas `inputs`. */
  inputDeliveries?: PluginInputDelivery[];
  outputContract: PluginFieldContract[];
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  /** Core-resolved block instruction. Updated plugins should prefer this over the raw template. */
  resolvedInstruction?: string;
  /** Variables left intact because no declared runtime source could resolve them. */
  unresolvedInstructionVariables?: string[];
  conversation?: { mode: "new" } | { mode: "reuse"; id: string };
  /** Core-owned position when a declared list input is executed item by item. */
  batch?: { itemId: string; index: number; total: number };
  context: PluginExecutionContext;
};

export type PluginExecutionResponse =
  | {
      status: "success";
      values: Record<string, RuntimeValue>;
      artifacts?: PluginArtifact[];
      /** Preenchido pelo núcleo após importar artifacts; plugins não devem definir este campo. */
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
      conversation?: { id: string };
    }
  | {
      status: "pending";
      jobId: string;
      pollAfterMs: number;
      progress?: number;
      message?: string;
      /** Snapshot parcial por campo. Cada chave substitui o snapshot anterior da mesma chave. */
      partialValues?: Record<string, RuntimeValue>;
      /** Artifacts referenciados por partialValues; passam pelo mesmo importador dos finais. */
      partialArtifacts?: PluginArtifact[];
      /** Preenchido pelo núcleo após importar partialArtifacts. */
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
    }
  | {
      status: "error";
      code: string;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
      /** Completed outputs remain durable when a later item fails. */
      partialValues?: Record<string, RuntimeValue>;
      partialArtifacts?: PluginArtifact[];
      storedArtifacts?: StoredFile[];
      usage?: PluginUsage;
      logs?: string[];
    };

export type PluginExecutionServices = {
  signal: AbortSignal;
  getSecret: (key: string) => Promise<string | undefined>;
  resolveInputFile: (file: StoredFile) => Promise<string>;
  getOutputPath: (relativePath: string) => string;
  getWorkspacePath: (relativePath: string) => string;
};

export type PluginEntrypoint = {
  execute: (
    request: PluginExecutionRequest,
    services: PluginExecutionServices,
  ) => Promise<PluginExecutionResponse>;
};
