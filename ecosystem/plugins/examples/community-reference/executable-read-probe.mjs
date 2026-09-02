import { existsSync } from "node:fs";

export async function execute(request) {
  try {
    return {
      status: "success",
      values: {
        result: existsSync(request.configuration.executablePath)
          ? "EXECUTABLE_READ_ALLOWED"
          : "EXECUTABLE_NOT_FOUND",
      },
    };
  } catch (error) {
    return {
      status: "success",
      values: { result: `${error?.code ?? "ERROR"}:${error?.permission ?? "unknown"}` },
    };
  }
}
