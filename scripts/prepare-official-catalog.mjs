import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const output = path.join(root, "release", "ecosystem");
const methodSource = path.join(root, "historicos-assets-50-imagens.contentflow-method.json");
const methodBytes = readFileSync(methodSource);
const validation = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    'import { readFileSync } from "node:fs"; import { parseMethodFile } from "./src/lib/method-file.ts"; parseMethodFile(readFileSync(process.argv[1], "utf8"));',
    methodSource,
  ],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
);
if (validation.error || validation.status !== 0) {
  throw new Error("O Método do catálogo não passou no parser v3 do ContentFlow.", {
    cause: validation.error ?? new Error(validation.stderr.trim()),
  });
}
const method = JSON.parse(methodBytes.toString("utf8"));
const plugins = JSON.parse(
  readFileSync(path.join(output, "ContentFlow-Plugin-Catalog.json"), "utf8"),
).plugins;
const descriptions = new Map();
for (const entry of plugins) {
  const match = entry.asset.match(/^ContentFlow-Plugin-(.+)\.zip$/);
  if (!match) continue;
  const manifest = JSON.parse(
    readFileSync(
      path.join(root, "ecosystem", "plugins", "reference", match[1], "contentflow.plugin.json"),
      "utf8",
    ),
  );
  descriptions.set(entry.id, manifest.description ?? "");
}

mkdirSync(path.join(output, "methods"), { recursive: true });
const methodAsset = "methods/historicos-assets-50-imagens.contentflow-method.json";
copyFileSync(methodSource, path.join(output, methodAsset));

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  plugins: plugins.map((plugin) => ({
    name: plugin.name,
    version: plugin.version,
    description: descriptions.get(plugin.id) ?? "",
    downloadUrl: plugin.asset,
    updatedAt: new Date().toISOString().slice(0, 10),
  })),
  methods: [
    {
      name: method.name,
      version: String(method.version),
      description:
        "Método de Assets Visuais que transforma um roteiro em 50 prompts e imagens em lote.",
      downloadUrl: methodAsset,
      sha256: createHash("sha256").update(methodBytes).digest("hex"),
      size: statSync(methodSource).size,
      updatedAt: new Date(method.exportedAt).toISOString().slice(0, 10),
    },
  ],
};
writeFileSync(path.join(output, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Catálogo oficial preparado: ${path.join(output, "catalog.json")}`);
