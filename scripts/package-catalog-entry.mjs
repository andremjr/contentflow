// SPDX-License-Identifier: MIT
// Copyright (c) 2026 André Carlos Lima Marinho Junior.
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import archiver from "archiver";

const root = process.cwd();
const repository = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name;
const plugin = repository === "plugins-contentflow";
if (!plugin && repository !== "methods-contentflow")
  throw new Error("Execute na raiz do repositório de plugins ou Métodos.");
const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Informe o slug do pacote.");
const source = path.join(
  root,
  plugin ? "plugins" : "methods",
  plugin ? slug : `${slug}.contentflow-method.json`,
);
const manifest = JSON.parse(
  readFileSync(plugin ? path.join(source, "contentflow.plugin.json") : source, "utf8"),
);
const version = plugin ? manifest.version : process.argv[3];
if (!/^\d+\.\d+\.\d+$/.test(version ?? ""))
  throw new Error("Métodos exigem uma versão editorial X.Y.Z como segundo argumento.");
if (plugin && (manifest.apiVersion !== "2" || !manifest.minCoreVersion))
  throw new Error("Declare apiVersion 2 e minCoreVersion.");
if (!plugin && manifest.version !== 3) throw new Error("O Método deve usar envelope v3.");
const catalogPath = path.join(root, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const list = catalog[plugin ? "plugins" : "methods"];
const id = plugin ? manifest.id : slug;
const previous = list.find((entry) => entry.id === id);
if (previous?.version === version)
  throw new Error("Incremente a versão; pacotes publicados são imutáveis.");
const asset = plugin ? `ContentFlow-Plugin-${slug}.zip` : `${slug}.contentflow-method.zip`;
const output = path.join(root, "release", `${slug}-v${version}`);
mkdirSync(output, { recursive: true });
const destination = path.join(output, asset);
if (plugin) {
  function appendDirectory(archive, directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        [".git", "node_modules", "profiles", "sessions", "credentials", "__pycache__"].includes(
          entry.name,
        ) ||
        entry.name.startsWith(".env") ||
        entry.name === "captured-flow-session.json" ||
        /\.(log|pyc)$/i.test(entry.name)
      )
        continue;
      if (entry.isSymbolicLink()) throw new Error("Links simbólicos não são distribuíveis.");
      const file = path.join(directory, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) appendDirectory(archive, file, name);
      else archive.file(file, { name });
    }
  }
  if (!existsSync(path.join(source, manifest.entrypoint))) throw new Error("Handler ausente.");
  await new Promise((resolve, reject) => {
    const outputStream = createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    outputStream.on("error", reject);
    outputStream.on("close", resolve);
    archive.pipe(outputStream);
    appendDirectory(archive, source, slug);
    void archive.finalize();
  });
} else {
  if (manifest.method?.imageUrl?.startsWith("/api/"))
    throw new Error("Exporte um Método portátil com a capa incorporada.");
  await new Promise((resolve, reject) => {
    const outputStream = createWriteStream(destination);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    outputStream.on("error", reject);
    outputStream.on("close", resolve);
    archive.pipe(outputStream);
    archive.append(readFileSync(source), { name: "manifest.json" });
    archive.append(readFileSync(path.join(root, "LICENSE")), { name: "LICENSE" });
    void archive.finalize();
  });
}
const bytes = readFileSync(destination);
const entry = {
  ...(previous ?? {}),
  id,
  name: manifest.name,
  version,
  ...(plugin
    ? {
        apiVersion: manifest.apiVersion,
        minCoreVersion: manifest.minCoreVersion,
        description: manifest.description,
      }
    : {
        contractVersion: 3,
        minCoreVersion: previous?.minCoreVersion ?? "1.3.3",
        description: previous?.description ?? manifest.name,
        license: "MIT",
      }),
  asset,
  downloadUrl: `https://github.com/andremjr/${repository}/releases/download/${slug}-v${version}/${asset}`,
  size: statSync(destination).size,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
catalog[plugin ? "plugins" : "methods"] = [...list.filter((item) => item.id !== id), entry].sort(
  (a, b) => a.id.localeCompare(b.id),
);
catalog.generatedAt = new Date().toISOString();
// Prepare the new catalogue separately. Publish the release assets first, then commit this file as catalog.json.
writeFileSync(path.join(output, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `Pacote: ${destination}\nTag: ${slug}-v${version}\nCatálogo preparado: ${path.join(output, "catalog.json")}`,
);
