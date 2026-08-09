import { pathToFileURL } from "node:url";
import type {
  PluginEntrypoint,
  PluginExecutionRequest,
  PluginExecutionResponse,
} from "../src/lib/plugin-contract";

type WorkerEnvelope = {
  entrypoint: string;
  request: PluginExecutionRequest;
};

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const envelope = JSON.parse(await readStdin()) as WorkerEnvelope;
  const moduleUrl = pathToFileURL(envelope.entrypoint).href;
  const loaded = (await import(moduleUrl)) as Partial<PluginEntrypoint> & {
    default?: PluginEntrypoint["execute"];
  };
  const execute = loaded.execute ?? loaded.default;
  if (typeof execute !== "function") {
    throw new Error("O entrypoint do plugin não exporta a função execute().");
  }

  const controller = new AbortController();
  const response = await execute(envelope.request, {
    signal: controller.signal,
    getSecret: async () => undefined,
    resolveInputFile: async () => {
      throw new Error("Leitura de arquivos ainda não está disponível neste executor.");
    },
    getOutputPath: () => {
      throw new Error("Geração de artifacts ainda não está disponível neste executor.");
    },
  });
  process.stdout.write(JSON.stringify(response satisfies PluginExecutionResponse));
}

void main().catch((error) => {
  const response: PluginExecutionResponse = {
    status: "error",
    code: "PLUGIN_WORKER_ERROR",
    message: error instanceof Error ? error.message : "O plugin falhou durante a execução.",
    retryable: false,
  };
  process.stdout.write(JSON.stringify(response));
  process.exitCode = 1;
});
