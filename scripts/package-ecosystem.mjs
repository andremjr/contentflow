import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.resolve(repositoryRoot, process.argv[2] ?? "release/ecosystem");

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

const pluginsArchive = await createArchive("ContentFlow-Plugins.zip", (archive) => {
  archive.directory(path.join(repositoryRoot, "ecosystem", "plugins", "reference"), false);
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

const pluginSkillArchive = await createArchive(
  "ContentFlow-Skill-Plugin-Development.zip",
  (archive) => {
    archive.directory(
      path.join(repositoryRoot, "ecosystem", "skills", "contentflow-plugin-development"),
      "contentflow-plugin-development",
    );
  },
);

const methodSkillArchive = await createArchive(
  "ContentFlow-Skill-Method-Development.zip",
  (archive) => {
    archive.directory(
      path.join(repositoryRoot, "ecosystem", "skills", "contentflow-method-development"),
      "contentflow-method-development",
    );
  },
);

console.log(`Pacote de plugins: ${pluginsArchive}`);
console.log(`Browser Bridge: ${bridgeArchive}`);
console.log(`Skill de plugins: ${pluginSkillArchive}`);
console.log(`Skill de Métodos: ${methodSkillArchive}`);
