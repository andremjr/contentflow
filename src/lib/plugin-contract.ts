import type {
  BlockFieldDefinition,
  BlockInputBinding,
  BlockType,
  BlockValidationConfig,
  HumanFieldType,
  ProcessOutput,
  RuntimeValue,
  StoredFile,
  UniversalProcess,
} from "@/lib/domain";

export const CONTENTFLOW_PLUGIN_API_VERSION = "1" as const;

export type PluginOperator = "IA" | "Código";
export type PluginPermission = "network" | "filesystem:read" | "filesystem:write" | "process";

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
  items?: JsonSchema;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  const?: unknown;
  anyOf?: JsonSchema[];
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
};

export type PluginOutputPort = {
  key: string;
  label: string;
  description?: string;
  producedTypes: PluginDataType[];
  required: boolean;
};

export type PluginExecutionPolicy = {
  mode: "immediate" | "async";
  defaultTimeoutMs?: number;
  supportsCancellation?: boolean;
};

export type PluginFieldContract = Pick<
  BlockFieldDefinition,
  "label" | "key" | "type" | "required" | "options" | "recordFields"
> & {
  portKey: string;
};

export type PluginCapability = {
  id: string;
  operator: PluginOperator;
  blockTypes: BlockType[];
  processTypes?: UniversalProcess[];
  inputPorts: PluginInputPort[];
  outputPorts: PluginOutputPort[];
  acceptedInputTypes?: PluginDataType[];
  producedOutputTypes?: PluginDataType[];
  execution: PluginExecutionPolicy;
  blockConfigSchema: JsonSchema;
  outputSchema: JsonSchema;
};

export type PluginManifest = {
  apiVersion: typeof CONTENTFLOW_PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  runtime: PluginRuntime;
  minCoreVersion?: string;
  entrypoint: string;
  permissions: PluginPermission[];
  settingsSchema?: JsonSchema;
  secretKeys?: string[];
  capabilities: PluginCapability[];
};

export type PluginExecutionContext = {
  channel: { id: string; name: string; language: string; niche: string };
  project: { id: string; title: string };
  processType: UniversalProcess;
  previousProcessOutputs: ProcessOutput[];
  previousBlockOutputs: Array<{ blockId: string; values: Record<string, RuntimeValue> }>;
  selectedCollection?: {
    collectionId: string;
    items: Array<{
      id: string;
      values: Record<string, RuntimeValue>;
    }>;
  };
};

export type PluginInvocation =
  { mode: "start" } | { mode: "resume"; jobId: string } | { mode: "cancel"; jobId: string };

export type PluginInputContract = Pick<
  BlockInputBinding,
  "id" | "label" | "type" | "recordFields"
> & {
  portKey: string;
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
  blockId: string;
  capabilityId: string;
  attempt: number;
  invocation: PluginInvocation;
  configuration: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** `inputs` is keyed by the semantic `portKey` declared in `inputContract`. */
  inputs: Record<string, RuntimeValue>;
  inputContract: PluginInputContract[];
  outputContract: PluginFieldContract[];
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  context: PluginExecutionContext;
};

export type PluginExecutionResponse =
  | {
      status: "success";
      values: Record<string, RuntimeValue>;
      artifacts?: PluginArtifact[];
      usage?: PluginUsage;
      logs?: string[];
    }
  | {
      status: "pending";
      jobId: string;
      pollAfterMs: number;
      progress?: number;
      message?: string;
      usage?: PluginUsage;
      logs?: string[];
    }
  | {
      status: "error";
      code: string;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
      usage?: PluginUsage;
      logs?: string[];
    };

export type PluginExecutionServices = {
  signal: AbortSignal;
  getSecret: (key: string) => Promise<string | undefined>;
  resolveInputFile: (file: StoredFile) => Promise<string>;
  getOutputPath: (relativePath: string) => string;
};

export type PluginEntrypoint = {
  execute: (
    request: PluginExecutionRequest,
    services: PluginExecutionServices,
  ) => Promise<PluginExecutionResponse>;
};
