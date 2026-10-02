import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsOnly = process.argv.includes("--skills-only");
const outputDirectory = path.resolve(
  repositoryRoot,
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? "release/ecosystem",
);
// A saída é descartável; nunca permita apagar checkout/fontes por erro no argumento.
const releaseDirectory = path.join(repositoryRoot, "release");
const outputRelative = path.relative(releaseDirectory, outputDirectory);
if (!outputRelative || outputRelative.startsWith("..") || path.isAbsolute(outputRelative))
  throw new Error("Use uma subpasta dedicada de release/ para empacotar o ecossistema.");
const documentationVersion =
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--docs-version="))
    ?.slice("--docs-version=".length) ??
  JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(documentationVersion))
  throw new Error("Versão documental inválida; use --docs-version=X.Y.Z.");
const documentationRef = `v${documentationVersion}`;
const documentationFiles = [
  "AGENTS.md",
  "LICENSE",
  "AI_USAGE_POLICY.md",
  ...[
    "ARCHITECTURE.md",
    "CONTENT_CONTRACT.md",
    "PLUGIN_INTERFACE.md",
    "CURRENT_STATE.md",
    "DEVELOPMENT.md",
    "DEV_MONITOR.md",
    "UPGRADE_GUIDE_1_3_1.md",
  ].map((file) => `docs/${file}`),
  ...[
    "README.md",
    "protocol.md",
    "development.md",
    "quickstart.md",
    "tutorial.md",
    "ai-development.md",
    "security.md",
    "distribution.md",
    "browser-automation.md",
    "automation-media-conventions.md",
  ].map((file) => `docs/ecosystem/${file}`),
  "docs/ecosystem/schemas/contentflow-plugin-v2.schema.json",
  ...readdirSync(path.join(repositoryRoot, "docs/ecosystem/examples"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => `docs/ecosystem/examples/${file}`),
].sort();
// Falta de documentação obrigatória é erro, nunca ZIP incompleto com warning ignorado.
const documentationContents = documentationFiles.map((file) => ({
  path: file,
  bytes: readFileSync(path.join(repositoryRoot, file)),
}));
const guardrailDirectory = "ecosystem/skills/development-contentflow";
const guardrailContents = [
  "SKILL.md",
  "references/architecture-map.md",
  "references/collaboration-protocol.md",
  "references/workflow-translation.md",
].map((file) => ({
  path: `guardrails/development-contentflow/${file}`,
  sourcePath: `${guardrailDirectory}/${file}`,
  bytes: readFileSync(path.join(repositoryRoot, guardrailDirectory, file)),
}));
const recordedCoreVersion =
  documentationContents
    .find((file) => file.path === "docs/CURRENT_STATE.md")
    .bytes.toString("utf8")
    .match(/Versão declarada em `package\.json`: `([^`]+)`/)?.[1] ?? null;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const documentationChanges = execFileSync(
  "git",
  ["status", "--porcelain", "--", ...documentationFiles, guardrailDirectory],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
).trim();

function addSkillDocumentation(archive, skill) {
  const files = documentationContents.map(({ path: sourcePath, bytes }) => {
    // Links para histórico/código não incluído continuam acessíveis no ref da versão.
    const packaged = sourcePath.endsWith(".md")
      ? Buffer.from(
          bytes.toString("utf8").replace(/\]\(([^\s)]+)\)/g, (match, target) => {
            if (/^(?:[a-z]+:|#|\/)/i.test(target)) return match;
            const [relative, anchor] = target.split("#");
            const resolved = path.posix.normalize(
              path.posix.join(path.posix.dirname(sourcePath), relative),
            );
            if (documentationFiles.includes(resolved)) return match;
            return `](https://github.com/andremjr/contentflow/blob/${documentationRef}/${resolved}${anchor ? `#${anchor}` : ""})`;
          }),
          "utf8",
        )
      : bytes;
    archive.append(packaged, { name: `${skill}/${sourcePath}` });
    return {
      path: sourcePath,
      role: sourcePath === "docs/CURRENT_STATE.md" ? "observational" : "normative",
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      sha256: createHash("sha256").update(packaged).digest("hex"),
    };
  });
  for (const { path: guardrailPath, sourcePath, bytes } of guardrailContents) {
    archive.append(bytes, { name: `${skill}/${guardrailPath}` });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    files.push({
      path: guardrailPath,
      sourcePath,
      role: "guardrail",
      sourceSha256: sha256,
      sha256,
    });
  }
  archive.append(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        documentationVersion,
        documentationRef,
        sourceCommit,
        sourceHasLocalChanges: Boolean(documentationChanges),
        recordedCoreVersion,
        warnings:
          recordedCoreVersion !== documentationVersion
            ? [
                "CURRENT_STATE.md é observacional e registra versão diferente do alvo; não comprova estado/validação da release.",
              ]
            : [],
        methodContractVersion: 3,
        pluginApiVersion: "2",
        note: "Snapshot documental preparado; não comprova publicação nem validação da release. Links externos dependem da publicação do ref.",
        files,
      },
      null,
      2,
    )}\n`,
    { name: `${skill}/DOCUMENTATION.json` },
  );
}
const googleFlowLocalFiles = [
  "captured-flow-session.json",
  "iniciar-captura.bat",
  "iniciar-chrome.bat",
  "scripts/analyze-captured-session.mjs",
  "scripts/capture-flow-session.mjs",
  "scripts/extract-generations.mjs",
  "scripts/find-prompt-rpcs.mjs",
  "scripts/generation-rpcs.json",
  "scripts/print-ui-actions.mjs",
  "scripts/rpc-analysis.json",
  "windows-enterprise-install/artifacts/**",
];
const referencePluginReleaseIgnore = googleFlowLocalFiles.map(
  (fileName) => `google-flow-browser-images/${fileName}`,
);

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

async function createArchive(fileName, addContents) {
  const destination = path.join(outputDirectory, fileName);
  rmSync(destination, { force: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("warning", (error) => {
      if (error.code === "ENOENT") return;
      reject(error);
    });
    archive.on("error", reject);
    archive.pipe(output);
    addContents(archive);
    void archive.finalize();
  });

  return destination;
}

if (!skillsOnly) {
  const pluginsArchive = await createArchive("ContentFlow-Plugins.zip", (archive) => {
    archive.glob("**/*", {
      cwd: path.join(repositoryRoot, "ecosystem", "plugins", "reference"),
      dot: true,
      ignore: referencePluginReleaseIgnore,
    });
    archive.append(
      [
        "PLUGINS PARA CONTENTFLOW",
        "",
        "Cada subpasta deste pacote e um plugin independente.",
        "Para instalar todos de uma vez, extraia o ZIP e, no ContentFlow, abra",
        "Plugins > Instalar plugin > Instalar uma copia e selecione a pasta raiz extraida.",
        "Para instalar apenas um, selecione a subpasta que contem contentflow.plugin.json.",
        "Revise as permissoes apresentadas antes de ativar os plugins.",
        "",
        "Todos os plugins, independentemente do autor, usam exatamente o mesmo fluxo.",
      ].join("\r\n"),
      { name: "COMO-INSTALAR.txt" },
    );
  });

  const referencePluginsDirectory = path.join(repositoryRoot, "ecosystem", "plugins", "reference");
  const catalogPlugins = [];
  for (const directoryEntry of readdirSync(referencePluginsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const pluginDirectory = path.join(referencePluginsDirectory, directoryEntry.name);
    const manifestPath = path.join(pluginDirectory, "contentflow.plugin.json");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const asset = `ContentFlow-Plugin-${directoryEntry.name}.zip`;
    const archivePath = await createArchive(asset, (archive) => {
      archive.glob(
        "**/*",
        {
          cwd: pluginDirectory,
          dot: true,
          ignore: directoryEntry.name === "google-flow-browser-images" ? googleFlowLocalFiles : [],
        },
        { prefix: directoryEntry.name },
      );
    });
    const bytes = readFileSync(archivePath);
    catalogPlugins.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      asset,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: statSync(archivePath).size,
    });
  }
  const pluginCatalogPath = path.join(outputDirectory, "ContentFlow-Plugin-Catalog.json");
  writeFileSync(
    pluginCatalogPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        plugins: catalogPlugins.sort((left, right) => left.id.localeCompare(right.id)),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const bridgeArchive = await createArchive("ContentFlow-Browser-Bridge.zip", (archive) => {
    const bridgeRoot = path.join(repositoryRoot, "ecosystem", "browser-bridge");
    for (const fileName of [
      "manifest.json",
      "service-worker.js",
      "content-script.js",
      "README.md",
      "INSTALAR.md",
    ]) {
      archive.file(path.join(bridgeRoot, fileName), {
        name: path.posix.join("contentflow-browser-bridge", fileName),
      });
    }
  });
  console.log(`Pacote de plugins: ${pluginsArchive}`);
  console.log(`Catálogo de plugins: ${pluginCatalogPath}`);
  console.log(`Pacotes individuais: ${catalogPlugins.length}`);
  console.log(`Browser Bridge: ${bridgeArchive}`);
}

const pluginSkillArchive = await createArchive(
  "ContentFlow-Skill-Plugin-Development.zip",
  (archive) => {
    archive.directory(
      path.join(repositoryRoot, "ecosystem", "skills", "contentflow-plugin-development"),
      "contentflow-plugin-development",
    );
    addSkillDocumentation(archive, "contentflow-plugin-development");
  },
);

const methodSkillArchive = await createArchive(
  "ContentFlow-Skill-Method-Development.zip",
  (archive) => {
    archive.directory(
      path.join(repositoryRoot, "ecosystem", "skills", "contentflow-method-development"),
      "contentflow-method-development",
    );
    addSkillDocumentation(archive, "contentflow-method-development");
  },
);

console.log(`Skill de plugins: ${pluginSkillArchive}`);
console.log(`Skill de Métodos: ${methodSkillArchive}`);
