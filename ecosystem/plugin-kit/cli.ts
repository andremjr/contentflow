import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { format } from "prettier";
import type { PluginExecutionRequest, PluginManifest } from "../../src/lib/plugin-contract";
import {
  PluginValidationError,
  validatePluginDirectory,
  validatePluginManifest,
} from "../../server/plugin-validation";

type TemplateId = "text-transform" | "hosted-api" | "file-artifact";
type DataType =
  PluginManifest["capabilities"][number]["inputPorts"][number]["acceptedTypes"][number];
export type Answers = {
  template: TemplateId;
  name: string;
  id: string;
  author: string;
  license: string;
  description: string;
  operator: "IA" | "Código";
  blockTypes: Array<"BUSCAR" | "ESCOLHER" | "CRIAR" | "VALIDAR">;
  input: { key: string; label: string; type: DataType };
  output: { key: string; label: string; type: DataType };
  permissions: PluginManifest["permissions"];
  networkHosts: string[];
  secretKeys: string[];
  sendsDataToThirdParties: boolean;
  providers: string[];
};
type TemplateDefaults = {
  id: TemplateId;
  label: string;
  description: string;
  permissions: PluginManifest["permissions"];
  networkHosts?: string[];
  secretKeys?: string[];
  input: Answers["input"];
  output: Answers["output"];
  deliveryTypes: PluginManifest["deliveryTypes"];
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const templatesRoot = path.join(root, "ecosystem", "plugin-kit", "templates");
const templateIds: TemplateId[] = ["text-transform", "hosted-api", "file-artifact"];
const permissions = [
  "network",
  "filesystem:read",
  "filesystem:write",
  "process",
  "worker",
  "native",
] as const;
const blockTypes = ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"] as const;
const dataTypes = [
  "text",
  "textarea",
  "number",
  "boolean",
  "list",
  "records",
  "select",
  "multiselect",
  "datetime",
  "url",
  "file",
  "files",
  "image",
  "audio",
  "video",
  "approval",
  "thumbnail_layout",
] as const;

function parseArgs(values: string[]) {
  const command = values[0] ?? "help";
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]!;
    if (!value.startsWith("--")) positionals.push(value);
    else {
      const [key, inline] = value.slice(2).split("=", 2);
      const following = values[index + 1];
      if (inline !== undefined) flags.set(key, inline);
      else if (following && !following.startsWith("--")) {
        flags.set(key, following);
        index += 1;
      } else flags.set(key, "true");
    }
  }
  return { command, positionals, flags };
}

async function loadTemplate(id: TemplateId): Promise<TemplateDefaults> {
  return JSON.parse(
    await readFile(path.join(templatesRoot, id, "template.json"), "utf8"),
  ) as TemplateDefaults;
}

function commaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireChoice<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T))
    throw new Error(`${label} inválido: ${value}. Opções: ${allowed.join(", ")}.`);
  return value as T;
}

function requireChoices<T extends string>(
  values: string[],
  allowed: readonly T[],
  label: string,
): T[] {
  const result = values.map((value) => requireChoice(value, allowed, label));
  if (!result.length) throw new Error(`${label} exige pelo menos um valor.`);
  return [...new Set(result)];
}

function optionalChoices<T extends string>(
  values: string[],
  allowed: readonly T[],
  label: string,
): T[] {
  return [...new Set(values.map((value) => requireChoice(value, allowed, label)))];
}

async function askAnswers(templateId: TemplateId): Promise<Answers> {
  const defaults = await loadTemplate(templateId);
  const rl = createInterface({ input, output });
  const ask = async (label: string, fallback: string) =>
    (await rl.question(`${label} [${fallback}]: `)).trim() || fallback;
  try {
    output.write("Informe apenas os nomes das credenciais; nunca cole tokens ou senhas.\n");
    const name = await ask("Nome", "Meu plugin ContentFlow");
    const id = await ask("Identificador reverso", "com.exemplo.meu-plugin");
    const operator = requireChoice(
      await ask("Operador (Código/IA)", "Código"),
      ["Código", "IA"] as const,
      "Operador",
    );
    const compatibleBlocks = requireChoices(
      commaList(await ask("Blocos compatíveis (separados por vírgula)", "CRIAR")),
      blockTypes,
      "Bloco",
    );
    const inputKey = await ask("Chave da entrada", defaults.input.key);
    const inputLabel = await ask("Rótulo da entrada", defaults.input.label);
    const inputType = requireChoice(
      await ask("Tipo da entrada", defaults.input.type),
      dataTypes,
      "Tipo de entrada",
    );
    const outputKey = await ask("Chave da saída", defaults.output.key);
    const outputLabel = await ask("Rótulo da saída", defaults.output.label);
    const outputType = requireChoice(
      await ask("Tipo da saída", defaults.output.type),
      dataTypes,
      "Tipo de saída",
    );
    const selectedPermissions = commaList(
      await ask("Permissões (vírgulas; vazio = nenhuma)", defaults.permissions.join(",")),
    );
    const selectedHosts = commaList(
      await ask("Hosts HTTPS permitidos", (defaults.networkHosts ?? []).join(",")),
    );
    const selectedSecrets = commaList(
      await ask("Nomes das credenciais", (defaults.secretKeys ?? []).join(",")),
    );
    const sendsData =
      (
        await ask("Envia dados a terceiros? (sim/não)", templateId === "hosted-api" ? "sim" : "não")
      ).toLowerCase() === "sim";
    const providers = commaList(
      await ask("Provedores que recebem dados", sendsData ? "API de exemplo" : "nenhum"),
    ).filter((item) => item !== "nenhum");
    return {
      template: templateId,
      name,
      id,
      author: await ask("Autor", "Seu nome"),
      license: await ask("Licença do plugin", "Proprietary"),
      description: await ask("Descrição", defaults.description),
      operator,
      blockTypes: compatibleBlocks,
      input: { key: inputKey, label: inputLabel, type: inputType },
      output: { key: outputKey, label: outputLabel, type: outputType },
      permissions: optionalChoices(selectedPermissions, permissions, "Permissão"),
      networkHosts: selectedHosts,
      secretKeys: selectedSecrets,
      sendsDataToThirdParties: sendsData,
      providers,
    };
  } finally {
    rl.close();
  }
}

async function answersFromFile(file: string): Promise<Answers> {
  const value = JSON.parse(await readFile(path.resolve(file), "utf8")) as Answers;
  const defaults = await loadTemplate(requireChoice(value.template, templateIds, "Template"));
  return {
    ...value,
    description: value.description || defaults.description,
    permissions: optionalChoices(
      value.permissions ?? defaults.permissions,
      permissions,
      "Permissão",
    ),
    blockTypes: requireChoices(value.blockTypes, blockTypes, "Bloco"),
    input: { ...value.input, type: requireChoice(value.input.type, dataTypes, "Tipo de entrada") },
    output: { ...value.output, type: requireChoice(value.output.type, dataTypes, "Tipo de saída") },
    networkHosts: value.networkHosts ?? defaults.networkHosts ?? [],
    secretKeys: value.secretKeys ?? defaults.secretKeys ?? [],
    providers: value.providers ?? [],
  };
}

function buildManifest(answers: Answers, defaults: TemplateDefaults): PluginManifest {
  const capabilityId = answers.id.split(/[.-]/).at(-1) ?? "execute";
  const sends = answers.sendsDataToThirdParties;
  return {
    $schema:
      "https://raw.githubusercontent.com/andremjr/contentflow/main/ecosystem/docs/schemas/contentflow-plugin-v1.schema.json",
    apiVersion: "1",
    id: answers.id,
    name: answers.name,
    version: "0.1.0",
    description: answers.description,
    author: answers.author,
    license: answers.license,
    runtime: { kind: "node", version: ">=26 <27", module: "esm" },
    entrypoint: "handler.mjs",
    permissions: answers.permissions,
    ...(answers.permissions.includes("network") && answers.networkHosts.length
      ? { networkHosts: answers.networkHosts }
      : {}),
    ...(answers.secretKeys.length ? { secretKeys: answers.secretKeys } : {}),
    deliveryTypes: defaults.deliveryTypes,
    capabilities: [
      {
        id: capabilityId,
        operator: answers.operator,
        blockTypes: answers.blockTypes,
        inputPorts: [
          {
            key: answers.input.key,
            label: answers.input.label,
            acceptedTypes: [answers.input.type],
            required: true,
          },
        ],
        outputPorts: [
          {
            key: answers.output.key,
            label: answers.output.label,
            producedTypes: [answers.output.type],
            required: true,
          },
        ],
        acceptedInputTypes: [answers.input.type],
        producedOutputTypes: [answers.output.type],
        execution: { mode: "immediate", defaultTimeoutMs: 30_000 },
        sideEffects:
          answers.template === "hosted-api"
            ? ["external_read"]
            : answers.template === "file-artifact"
              ? ["local_artifact"]
              : [],
        cost: {
          model: answers.template === "hosted-api" ? "unknown" : "free",
          estimateSupported: false,
        },
        dataPolicy: {
          sendsDataToThirdParties: sends,
          ...(sends ? { providers: answers.providers } : {}),
        },
        blockConfigSchema: { type: "object", additionalProperties: true },
        outputSchema: {
          type: "object",
          properties: {
            [answers.output.key]: { type: answers.output.type === "file" ? "object" : "string" },
          },
          required: [answers.output.key],
        },
      },
    ],
  };
}

function validateAnswers(answers: Answers, defaults: TemplateDefaults) {
  const missingPermissions = defaults.permissions.filter(
    (permission) => !answers.permissions.includes(permission),
  );
  if (missingPermissions.length) {
    throw new Error(
      `O template ${answers.template} exige: ${missingPermissions.join(", ")}. Escolha outro template para usar menos permissões.`,
    );
  }
  if (answers.template === "hosted-api") {
    if (!answers.networkHosts.length)
      throw new Error("O template hosted-api exige ao menos um host.");
    if (answers.networkHosts[0]!.startsWith("*.")) {
      throw new Error("O primeiro host do template hosted-api precisa ser exato, não wildcard.");
    }
    if (!answers.secretKeys.length)
      throw new Error("O template hosted-api exige o nome de uma credencial.");
    if (!answers.sendsDataToThirdParties || !answers.providers.length) {
      throw new Error("O template hosted-api precisa declarar o provedor que recebe os dados.");
    }
  }
}

function executionFixture(manifest: PluginManifest, answers: Answers) {
  const capability = manifest.capabilities[0]!;
  const fileValue = {
    id: "fixture-file",
    name: "entrada.txt",
    mimeType: "text/plain",
    size: 20,
    url: "/api/files/fixture-input.txt",
  };
  return {
    executionId: "kit-execution",
    traceId: "kit-trace",
    blockId: "kit-block",
    capabilityId: capability.id,
    attempt: 1,
    invocation: { mode: "start" },
    configuration:
      answers.template === "hosted-api" ? { mockResponse: "Resposta fictícia da API" } : {},
    settings: {},
    inputs: {
      [answers.input.key]:
        answers.template === "file-artifact" ? fileValue : "Texto fictício para validar o plugin.",
    },
    inputContract: [
      {
        id: "kit-input",
        portKey: answers.input.key,
        label: answers.input.label,
        type: answers.input.type,
      },
    ],
    outputContract: [
      {
        portKey: answers.output.key,
        label: answers.output.label,
        key: answers.output.key,
        type: answers.output.type,
        required: true,
      },
    ],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "kit-channel", name: "Canal fictício", language: "pt-BR", niche: "Testes" },
      project: { id: "kit-project", title: "Projeto fictício" },
      processType: "script",
      block: {
        type: answers.blockTypes[0],
        name: "Bloco de teste",
        instructions: "Execute o contrato.",
      },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  } satisfies PluginExecutionRequest;
}

function generatedReadme(answers: Answers) {
  return `# ${answers.name}\n\nPlugin gerado pelo kit oficial do ContentFlow usando a API pública v1.\n\n## Desenvolvimento\n\nNa raiz do ContentFlow, substitua \`<pasta-do-plugin>\` pela pasta deste plugin:\n\n\`\`\`powershell\nnpm run plugin:kit -- validate <pasta-do-plugin>\nnpm run plugin:kit -- test-contract <pasta-do-plugin>\nnpm run plugin:kit -- test-sandbox <pasta-do-plugin>\nnpm run plugin:kit -- report <pasta-do-plugin>\n\`\`\`\n\nCredenciais declaradas: ${answers.secretKeys.length ? answers.secretKeys.map((key) => `\`${key}\``).join(", ") : "nenhuma"}. Não grave valores secretos no manifesto.\n\nPolítica de dados: ${answers.sendsDataToThirdParties ? `envia dados para ${answers.providers.join(", ")}` : "não envia dados a terceiros"}.\n`;
}

async function generatedTest(answers: Answers) {
  const inputValue =
    answers.template === "file-artifact"
      ? `{ id: "fixture", name: "entrada.txt", mimeType: "text/plain", size: 5, url: "/api/files/fixture-input.txt" }`
      : `"  olá plugin  "`;
  return format(
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { mkdtemp, mkdir, writeFile } from "node:fs/promises";\nimport os from "node:os";\nimport path from "node:path";\nimport { execute } from "./handler.mjs";\n\ntest("respeita o contrato mínimo", async () => {\n  const temp = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-test-"));\n  const source = path.join(temp, "entrada.txt");\n  const output = path.join(temp, "output");\n  await mkdir(output); await writeFile(source, "teste");\n  const response = await execute({ inputs: { "${answers.input.key}": ${inputValue} }, configuration: ${answers.template === "hosted-api" ? `{ mockResponse: "resposta" }` : `{}`} }, {\n    signal: AbortSignal.timeout(5000), getSecret: async () => "test-only", resolveInputFile: async () => source,\n    getOutputPath: (name) => path.join(output, name), getWorkspacePath: (name) => path.join(temp, name),\n  });\n  assert.equal(response.status, "success");\n  assert.ok(Object.hasOwn(response.values, "${answers.output.key}"));\n});\n`,
    { parser: "babel" },
  );
}

export async function createPlugin(target: string, answers: Answers) {
  const targetDirectory = path.resolve(target);
  if (existsSync(targetDirectory) && (await readdir(targetDirectory)).length)
    throw new Error(`A pasta de destino não está vazia: ${targetDirectory}`);
  const defaults = await loadTemplate(answers.template);
  validateAnswers(answers, defaults);
  const manifest = buildManifest(answers, defaults);
  validatePluginManifest(manifest);
  const template = await readFile(
    path.join(templatesRoot, answers.template, "handler.mjs.template"),
    "utf8",
  );
  const handler = await format(
    template
      .replaceAll("{{INPUT_KEY}}", answers.input.key)
      .replaceAll("{{OUTPUT_KEY}}", answers.output.key)
      .replaceAll("{{SECRET_KEY}}", answers.secretKeys[0] ?? "API_TOKEN")
      .replaceAll("{{NETWORK_HOST}}", answers.networkHosts[0] ?? "api.example.com"),
    { parser: "babel" },
  );
  await mkdir(path.join(targetDirectory, "fixtures"), { recursive: true });
  await writeFile(
    path.join(targetDirectory, "contentflow.plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(path.join(targetDirectory, "handler.mjs"), handler);
  await writeFile(path.join(targetDirectory, "README.md"), generatedReadme(answers));
  await writeFile(path.join(targetDirectory, "test.mjs"), await generatedTest(answers));
  await writeFile(
    path.join(targetDirectory, "fixtures", "execution.json"),
    `${JSON.stringify(executionFixture(manifest, answers), null, 2)}\n`,
  );
  if (answers.template === "file-artifact")
    await writeFile(
      path.join(targetDirectory, "fixtures", "input.txt"),
      "Arquivo fictício do Plugin Kit.\n",
    );
  validatePluginDirectory(targetDirectory);
  return targetDirectory;
}

async function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}.`)),
    );
  });
}

export async function validateCommand(directory: string) {
  const result = validatePluginDirectory(directory);
  output.write(
    `✓ Manifesto API v${result.manifest.apiVersion}: ${result.manifest.id}@${result.manifest.version}\n✓ Entrypoint: ${path.relative(result.absoluteDirectory, result.entrypoint)}\n✓ Arquivos e links simbólicos: seguros\n`,
  );
  return result;
}

export async function contractCommand(directory: string) {
  const result = await validateCommand(directory);
  const testPath = path.join(result.absoluteDirectory, "test.mjs");
  if (!existsSync(testPath))
    throw new Error("test.mjs não foi encontrado; erros de contrato não serão ignorados.");
  await run(process.execPath, ["--test", testPath], result.absoluteDirectory);
  output.write("✓ Testes mínimos de contrato passaram.\n");
}

export async function fixtureCommand(directory: string, destination?: string) {
  const result = validatePluginDirectory(directory);
  const capability = result.manifest.capabilities[0]!;
  const inputPort = capability.inputPorts[0];
  const outputPort = capability.outputPorts[0]!;
  const firstInputType = inputPort?.acceptedTypes[0] ?? "text";
  const inferredTemplate: TemplateId =
    firstInputType === "file" || firstInputType === "files"
      ? "file-artifact"
      : result.manifest.permissions.includes("network")
        ? "hosted-api"
        : "text-transform";
  const answers = {
    template: inferredTemplate,
    input: {
      key: inputPort?.key ?? "input",
      label: inputPort?.label ?? "Entrada",
      type: firstInputType,
    },
    output: { key: outputPort.key, label: outputPort.label, type: outputPort.producedTypes[0] },
    blockTypes: capability.blockTypes,
  } as Answers;
  const target = path.resolve(
    destination ?? path.join(result.absoluteDirectory, "fixtures", "execution.generated.json"),
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify(executionFixture(result.manifest, answers), null, 2)}\n`,
  );
  if (inferredTemplate === "file-artifact") {
    const inputPath = path.join(path.dirname(target), "input.txt");
    if (!existsSync(inputPath)) await writeFile(inputPath, "Arquivo fictício do Plugin Kit.\n");
  }
  output.write(`✓ Dados fictícios: ${target}\n`);
  return target;
}

export async function sandboxCommand(directory: string) {
  if (Number(process.versions.node.split(".")[0]) !== 26)
    throw new Error(`O sandbox oficial exige Node 26; versão atual: ${process.version}.`);
  const result = validatePluginDirectory(directory);
  const fixturePath = path.join(result.absoluteDirectory, "fixtures", "execution.json");
  if (!existsSync(fixturePath)) throw new Error("fixtures/execution.json não foi encontrado.");
  const request = JSON.parse(await readFile(fixturePath, "utf8")) as PluginExecutionRequest;
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-kit-"));
  try {
    const uploads = path.join(dataDirectory, "uploads");
    await mkdir(uploads, { recursive: true });
    const fixtureInput = path.join(result.absoluteDirectory, "fixtures", "input.txt");
    if (existsSync(fixtureInput))
      await copyFile(fixtureInput, path.join(uploads, "fixture-input.txt"));
    process.env.CONTENTFLOW_DATA_DIR = dataDirectory;
    process.env.CONTENTFLOW_APP_ROOT = root;
    process.env.CONTENTFLOW_PLUGIN_WORKER_DIR = path.join(root, "server");
    const { executeRegisteredPlugin } = await import("../../server/plugin-runner");
    const response = await executeRegisteredPlugin(
      {
        id: result.manifest.id,
        source: "local",
        directory: result.absoluteDirectory,
        absoluteDirectory: result.absoluteDirectory,
        entrypoint: result.entrypoint,
        manifest: result.manifest,
        executable: true,
      },
      request,
      30_000,
      {},
    );
    if (
      response.status === "error" &&
      (!response.code || !response.message || typeof response.retryable !== "boolean")
    )
      throw new Error("O plugin devolveu um erro fora do contrato da API v1.");
    if (
      response.status === "pending" &&
      (!response.jobId || !Number.isFinite(response.pollAfterMs))
    )
      throw new Error("O plugin devolveu uma pendência fora do contrato da API v1.");
    output.write(
      `✓ Execução real encerrada no sandbox do ContentFlow (${response.status}).\n✓ Permissões concedidas somente conforme manifesto: ${result.manifest.permissions.join(", ") || "nenhuma"}.\n`,
    );
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

export async function compatibilityReport(directory: string) {
  const lines = ["RELATÓRIO DE COMPATIBILIDADE — CONTENTFLOW PLUGIN API v1", ""];
  let compatible = true;
  try {
    const result = validatePluginDirectory(directory);
    const manifest = result.manifest;
    lines.push(
      `Plugin: ${manifest.name} (${manifest.id}@${manifest.version})`,
      "Manifesto e arquivos: COMPATÍVEIS",
      `Runtime declarado: ${manifest.runtime.version}`,
      `Node atual: ${process.version} (${Number(process.versions.node.split(".")[0]) === 26 ? "compatível" : "incompatível; use Node 26"})`,
      `Permissões: ${manifest.permissions.join(", ") || "nenhuma"}`,
    );
    if (Number(process.versions.node.split(".")[0]) !== 26) compatible = false;
    if (manifest.permissions.includes("network") && !manifest.networkHosts?.length)
      lines.push("AVISO: acesso irrestrito à rede; declare networkHosts sempre que possível.");
    if (manifest.networkHosts?.length)
      lines.push(`Hosts declarados: ${manifest.networkHosts.join(", ")}`);
    if (manifest.capabilities.some((item) => item.dataPolicy.sendsDataToThirdParties))
      lines.push(
        `Dados de terceiros: SIM (${manifest.capabilities.flatMap((item) => item.dataPolicy.providers ?? []).join(", ")})`,
      );
    else lines.push("Dados de terceiros: NÃO");
    const packagePath = path.join(result.absoluteDirectory, "package.json");
    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (
        packageJson.scripts &&
        Object.keys(packageJson.scripts).some((key) => /^(pre|post)?install$/.test(key))
      )
        lines.push("AVISO: scripts de instalação existem, mas o Plugin Kit nunca os executa.");
    }
  } catch (error) {
    compatible = false;
    lines.push(
      "Manifesto e arquivos: INCOMPATÍVEIS",
      error instanceof Error ? error.message : String(error),
    );
  }
  lines.push("", `Resultado: ${compatible ? "COMPATÍVEL" : "INCOMPATÍVEL"}`);
  const report = lines.join("\n");
  output.write(`${report}\n`);
  return { compatible, report };
}

function help() {
  output.write(
    `ContentFlow Plugin Kit\n\nComandos:\n  create <pasta> [--template text-transform|hosted-api|file-artifact] [--answers respostas.json]\n  validate <pasta>\n  test-contract <pasta>\n  test-sandbox <pasta>\n  fixture <pasta> [--output arquivo.json]\n  report <pasta>\n  check <pasta>\n\nO kit não instala dependências nem executa scripts de instalação de terceiros.\n`,
  );
}

async function main() {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));
  const directory = positionals[0];
  if (command === "help" || command === "--help") return help();
  if (!directory) throw new Error(`O comando ${command} exige uma pasta.`);
  if (command === "create") {
    const answers = flags.has("answers")
      ? await answersFromFile(flags.get("answers")!)
      : await askAnswers(
          requireChoice(flags.get("template") ?? "text-transform", templateIds, "Template"),
        );
    output.write(`✓ Plugin criado em ${await createPlugin(directory, answers)}\n`);
  } else if (command === "validate") await validateCommand(directory);
  else if (command === "test-contract") await contractCommand(directory);
  else if (command === "test-sandbox") await sandboxCommand(directory);
  else if (command === "fixture") await fixtureCommand(directory, flags.get("output"));
  else if (command === "report") {
    const report = await compatibilityReport(directory);
    if (!report.compatible) process.exitCode = 1;
  } else if (command === "check") {
    await contractCommand(directory);
    await sandboxCommand(directory);
    const report = await compatibilityReport(directory);
    if (!report.compatible) process.exitCode = 1;
  } else throw new Error(`Comando desconhecido: ${command}.`);
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked)
  void main().catch((error) => {
    if (error instanceof PluginValidationError)
      output.write(
        `✗ Manifesto inválido:\n${error.issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join("\n")}\n`,
      );
    else output.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
