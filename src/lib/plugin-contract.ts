import type {
  BlockFieldDefinition,
  BlockInputBinding,
  BlockType,
  BlockValidationConfig,
  HumanFieldType,
  ProcessOutput,
  RuntimeValue,
  UniversalProcess,
} from "@/lib/domain";

export const CONTENTFLOW_PLUGIN_API_VERSION = "1" as const;

export type PluginOperator = "IA" | "Código";
export type PluginPermission = "network" | "filesystem:read" | "filesystem:write" | "process";

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

export type PluginFieldContract = Pick<
  BlockFieldDefinition,
  "label" | "key" | "type" | "required" | "options" | "recordFields"
>;

export type PluginCapability = {
  id: string;
  operator: PluginOperator;
  blockTypes: BlockType[];
  processTypes?: UniversalProcess[];
  acceptedInputTypes?: PluginDataType[];
  producedOutputTypes?: PluginDataType[];
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

export type PluginExecutionRequest = {
  executionId: string;
  blockId: string;
  capabilityId: string;
  attempt: number;
  configuration: Record<string, unknown>;
  inputs: Record<string, RuntimeValue>;
  /** `inputs` is keyed by this contract's stable `id`. */
  inputContract: Array<Pick<BlockInputBinding, "id" | "label" | "type" | "recordFields">>;
  outputContract: PluginFieldContract[];
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  context: PluginExecutionContext;
};

export type PluginExecutionResponse =
  | {
      status: "success";
      values: Record<string, RuntimeValue>;
      logs?: string[];
    }
  | {
      status: "error";
      code: string;
      message: string;
      retryable: boolean;
      logs?: string[];
    };
