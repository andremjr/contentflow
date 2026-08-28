import { writeFileSync } from "node:fs";
import { join } from "node:path";

export async function execute(_request, services) {
  const workspaceRoot = services.getWorkspacePath(".");
  const checkpoint = services.getWorkspacePath("checkpoints/etapa-001.txt");
  writeFileSync(checkpoint, "checkpoint persistente", "utf8");
  return {
    status: "success",
    values: { result: checkpoint, workspaceRoot, marker: join(workspaceRoot, ".marker") },
  };
}
