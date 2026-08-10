import { writeFileSync } from "node:fs";

export async function execute(_request, services) {
  const checkpoint = services.getWorkspacePath("checkpoints/etapa-001.txt");
  writeFileSync(checkpoint, "checkpoint persistente", "utf8");
  return { status: "success", values: { result: checkpoint } };
}
