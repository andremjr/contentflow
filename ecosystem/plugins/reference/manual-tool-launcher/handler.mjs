import { spawn } from "node:child_process";
import path from "node:path";

function absolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} deve ser um caminho absoluto neste computador.`);
  }
  return value;
}

function httpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Informe uma URL HTTPS válida.");
  }
  if (parsed.protocol !== "https:")
    throw new Error("A ferramenta manual aceita somente URLs HTTPS.");
  return parsed.toString();
}

export async function execute(request) {
  const configuration = request.configuration ?? {};
  const browser = configuration.destinationType === "browser";
  const executable = absolutePath(
    browser ? configuration.browserExecutablePath : configuration.applicationExecutablePath,
    browser ? "O executável do navegador" : "O executável do aplicativo",
  );
  const profilePath = browser
    ? absolutePath(configuration.browserProfilePath, "A pasta do perfil")
    : undefined;
  const args = browser
    ? [
        `--user-data-dir=${path.dirname(profilePath)}`,
        `--profile-directory=${path.basename(profilePath)}`,
        "--new-window",
        httpsUrl(configuration.url),
      ]
    : [];
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return {
    status: "success",
    values: { opened: true },
    logs: ["Ferramenta manual aberta para o operador."],
  };
}
