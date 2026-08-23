import {
  type BlockInputBinding,
  type HumanFieldType,
  type ProcessExecution,
  type Project,
  type RecordFieldDefinition,
  type RecordFieldType,
  type RuntimeValue,
  type StoredFile,
  type StructuredRecord,
} from "@/lib/domain";
import { normalizeExecutionDeliveries } from "@/lib/deliveries";

const HISTORY_VALUE_TYPES = new Set<HumanFieldType>([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "datetime",
  "url",
  "file",
  "image",
  "audio",
  "video",
]);

export function isChannelHistoryValueType(type: HumanFieldType): type is RecordFieldType {
  return HISTORY_VALUE_TYPES.has(type);
}

export function createChannelHistoryRecordFields(
  valueType: HumanFieldType,
): RecordFieldDefinition[] {
  const normalizedValueType: RecordFieldType = isChannelHistoryValueType(valueType)
    ? valueType
    : "text";
  return [
    {
      id: "channel-history-value",
      label: "Valor",
      key: "value",
      type: normalizedValueType,
      required: true,
    },
    {
      id: "channel-history-project-id",
      label: "ID do projeto",
      key: "project_id",
      type: "text",
      required: true,
    },
    {
      id: "channel-history-project-title",
      label: "Projeto",
      key: "project_title",
      type: "text",
      required: true,
    },
    {
      id: "channel-history-recorded-at",
      label: "Registrado em",
      key: "recorded_at",
      type: "datetime",
      required: true,
    },
  ];
}

export function resolveChannelHistory({
  input,
  currentExecution,
  channelExecutions,
  channelProjects,
}: {
  input: BlockInputBinding;
  currentExecution: ProcessExecution;
  channelExecutions: ProcessExecution[];
  channelProjects: Project[];
}): StructuredRecord[] | undefined {
  if (
    input.source !== "channel_history" ||
    !input.sourceProcessType ||
    !input.blockId ||
    !input.sourceKey
  ) {
    return undefined;
  }

  const projects = new Map(
    channelProjects
      .filter((project) => project.channelId === currentExecution.channelId)
      .map((project) => [project.id, project] as const),
  );
  const executions = channelExecutions.filter(
    (execution) =>
      execution.channelId === currentExecution.channelId &&
      execution.projectId !== currentExecution.projectId &&
      projects.has(execution.projectId) &&
      execution.status !== "cancelled",
  );
  const publishedProjectIds = new Set(
    executions
      .filter(
        (execution) =>
          execution.processType === "publishing" &&
          execution.outputStatus === "completed" &&
          execution.status === "completed",
      )
      .map((execution) => execution.projectId),
  );
  const limit = Math.min(100, Math.max(1, input.historyLimit ?? 10));
  const eligibility = input.historyEligibility ?? "completed";

  return executions
    .filter(
      (execution) =>
        execution.processType === input.sourceProcessType &&
        (eligibility !== "published" || publishedProjectIds.has(execution.projectId)),
    )
    .flatMap((execution) =>
      (normalizeExecutionDeliveries(execution).deliveries ?? [])
        .filter(
          (delivery) =>
            delivery.blockId === input.blockId &&
            delivery.outputKey === input.sourceKey &&
            delivery.status === "completed",
        )
        .flatMap((delivery) => {
          const project = projects.get(execution.projectId);
          if (!project) return [];
          return delivery.items.flatMap((item) => {
            if (!isChannelHistoryValue(item.value)) return [];
            return [
              {
                value: structuredClone(item.value),
                project_id: project.id,
                project_title: project.title,
                recorded_at: delivery.updatedAt,
              } satisfies StructuredRecord,
            ];
          });
        }),
    )
    .sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)))
    .slice(0, limit);
}

function isChannelHistoryValue(
  value: RuntimeValue | StructuredRecord,
): value is string | number | boolean | StoredFile {
  if (["string", "number", "boolean"].includes(typeof value)) return true;
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "id" in value &&
    "name" in value &&
    "mimeType" in value &&
    "url" in value
  );
}
