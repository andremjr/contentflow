import type { ProcessExecution, RuntimeValue, StoredFile } from "@/lib/domain";

function isImageFile(value: unknown): value is StoredFile {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as StoredFile).url === "string" &&
    (value as StoredFile).mimeType?.startsWith("image/"),
  );
}

function firstImage(value: RuntimeValue | undefined): StoredFile | undefined {
  if (isImageFile(value)) return value;
  if (Array.isArray(value)) return value.find(isImageFile);
  return undefined;
}

export function projectThumbnail(
  executions: ProcessExecution[],
  projectId: string,
): StoredFile | undefined {
  const thumbnailExecution = executions.find(
    (execution) =>
      execution.projectId === projectId &&
      execution.processType === "thumbnail" &&
      execution.status === "completed" &&
      execution.outputStatus === "completed",
  );
  if (!thumbnailExecution?.output) return undefined;

  return (
    firstImage(thumbnailExecution.output.values.thumbnail) ??
    Object.values(thumbnailExecution.output.values).map(firstImage).find(Boolean)
  );
}
