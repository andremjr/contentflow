import { writeFile } from "node:fs/promises";

export async function execute(request, services) {
  const content = request.inputs.content;
  if (typeof content !== "string") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "A entrada content precisa ser texto.",
      retryable: false,
    };
  }
  const outputPath = services.getOutputPath("resultado.txt");
  await writeFile(outputPath, content, "utf8");
  return {
    status: "success",
    values: {
      result: {
        id: "result-file",
        name: "resultado.txt",
        mimeType: "text/plain",
        size: Buffer.byteLength(content),
        url: "artifact://result-file",
      },
    },
    artifacts: [
      {
        id: "result-file",
        name: "resultado.txt",
        mimeType: "text/plain",
        size: Buffer.byteLength(content),
        source: { kind: "path", path: "resultado.txt" },
      },
    ],
  };
}
