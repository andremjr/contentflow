import {
  type BlockInputSourceBinding,
  type ProcessExecution,
  type Project,
  type RecordFieldDefinition,
  type RuntimeValue,
  type StoredFile,
  type StructuredRecord,
  type ValueShape,
} from "@/lib/domain";
import { normalizeExecutionDeliveries, processOutputDeliveryFor } from "@/lib/deliveries";
import { contentShape, controlShape } from "@/lib/data-shape";

export function createChannelHistoryRecordFields(
  valueShape: ValueShape,
): RecordFieldDefinition[] {
  const normalizedValueShape =
    valueShape.kind === "record"
      ? contentShape("text")
      : { ...structuredClone(valueShape), cardinality: "one" as const };
  return [
    {
      id: "channel-history-value",
      label: "Valor",
      key: "value",
      shape: normalizedValueShape,
      required: true,
    },
    {
      id: "channel-history-project-id",
      label: "ID do projeto",
      key: "project_id",
      shape: controlShape("identifier"),
      required: true,
    },
    {
      id: "channel-history-project-title",
      label: "Projeto",
      key: "project_title",
      shape: contentShape("text"),
      required: true,
    },
    {
      id: "channel-history-recorded-at",
      label: "Registrado em",
      key: "recorded_at",
      shape: controlShape("datetime"),
      required: true,
    },
  ];
}

export function resolveChannelHistory({
  binding,
  currentExecution,
  channelExecutions,
  channelProjects,
}: {
  binding: Extract<BlockInputSourceBinding, { kind: "channel_history" }>;
  currentExecution: ProcessExecution;
  channelExecutions: ProcessExecution[];
  channelProjects: Project[];
}): StructuredRecord[] | undefined {
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
  const limit = Math.min(100, Math.max(1, binding.limit));
  const eligibility = binding.eligibility;
  const sourceKey = binding.outputKey;

  return executions
    .filter(
      (execution) =>
        execution.processType === binding.processType &&
        (eligibility !== "published" || publishedProjectIds.has(execution.projectId)),
    )
    .flatMap((execution) => {
      const normalized = normalizeExecutionDeliveries(execution);
      const deliveries =
        binding.blockId === "__process_output__"
          ? [processOutputDeliveryFor(normalized, sourceKey)].filter(
              (delivery): delivery is NonNullable<typeof delivery> => Boolean(delivery),
            )
          : (normalized.deliveries ?? []);
      return deliveries
        .filter(
          (delivery) =>
            (binding.blockId === "__process_output__" || delivery.blockId === binding.blockId) &&
            (binding.blockId === "__process_output__" || delivery.outputKey === sourceKey) &&
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
        });
    })
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
