import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function installationMarker(services, alias) {
  return services.getWorkspacePath(path.join(alias, "extension-installed.txt"));
}

export async function execute(request, services) {
  if (request.invocation?.mode === "configure") {
    const marker = installationMarker(services, request.configuration.accountProfile);
    if (request.invocation.action === "prepare") {
      await mkdir(path.dirname(marker), { recursive: true });
      await writeFile(marker, "installed", "utf8");
    }
    const ready = await readFile(marker, "utf8").then(
      (value) => value === "installed",
      () => false,
    );
    return {
      status: "success",
      values: {
        ready,
        message: `${request.configuration.accountProfile} pronto para o teste.`,
      },
    };
  }
  const installed = await readFile(
    installationMarker(services, request.configuration.accountProfile),
    "utf8",
  ).then(
    (value) => value === "installed",
    () => false,
  );
  if (!installed) {
    return {
      status: "error",
      code: "EXTENSION_MISSING",
      message: "A execução não reutilizou a instalação preparada.",
      retryable: false,
    };
  }
  return { status: "success", values: { result: request.resolvedInstruction || "resultado" } };
}
