import { readFile } from "node:fs/promises";

export async function execute(request) {
  try {
    await readFile(request.configuration.forbiddenPath, "utf8");
    return { status: "success", values: { result: "UNEXPECTED_ACCESS" } };
  } catch (error) {
    return {
      status: "success",
      values: { result: `${error?.code ?? "ERROR"}:${error?.permission ?? "unknown"}` },
    };
  }
}
