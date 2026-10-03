import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseMethodImportFile, serializeMethodFile } from "../src/lib/method-file";
import type { Channel, StrategicCollection } from "../src/lib/domain";
import archiver from "archiver";
import { PassThrough } from "node:stream";

const root = process.cwd();
const pluginsRepo = path.resolve(root, "../plugins-contentflow");
const methodsRepo = path.resolve(root, "../methods-contentflow");
const pluginPaths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "ecosystem/plugins/reference"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const source of pluginPaths) {
  if (source.includes("/vendor/") && /\.(exe|dll|pyd|pyc|whl|zip)$/i.test(source)) continue;
  const relative = source.slice("ecosystem/plugins/reference/".length);
  const target = path.join(pluginsRepo, "plugins", relative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(root, source), target);
}
const pluginCatalog = JSON.parse(
  readFileSync("release/ecosystem/ContentFlow-Plugin-Catalog.json", "utf8"),
);
writeFileSync(
  path.join(pluginsRepo, "catalog.json"),
  JSON.stringify(pluginCatalog, null, 2) + "\n",
);

// Export only the Channel and Process explicitly selected by the creator.
const stateResponse = await fetch("http://127.0.0.1:8080/api/state");
if (!stateResponse.ok) throw new Error("A API local não respondeu.");
const state = (await stateResponse.json()) as {
  channels: Channel[];
  libraryCollections?: StrategicCollection[];
  collections?: StrategicCollection[];
};
const channels = state.channels.filter((channel) => channel.name === "Gerar Imagens Flow");
if (channels.length !== 1) throw new Error("O Canal Gerar Imagens Flow deve ser único.");
const channel = channels[0];
const method = channel.methods.assets;
const collections = (state.libraryCollections ?? state.collections ?? []).filter(
  (collection) => collection.channelId === channel.id,
);
const manifest = serializeMethodFile("Gerar Imagens Flow — Assets Visuais", method, collections);
const parsed = parseMethodImportFile(manifest);
mkdirSync(path.join(methodsRepo, "methods"), { recursive: true });
const asset = "gerar-imagens-flow-assets.contentflow-method.json";
writeFileSync(path.join(methodsRepo, "methods", asset), manifest + "\n");
mkdirSync("release/methods-1.3.3", { recursive: true });
const stream = new PassThrough();
const chunks: Buffer[] = [];
stream.on("data", (chunk: Buffer) => chunks.push(chunk));
const completed = new Promise<Buffer>((resolve, reject) => {
  stream.on("end", () => resolve(Buffer.concat(chunks)));
  stream.on("error", reject);
});
const zip = archiver("zip", { zlib: { level: 9 } });
zip.on("error", (error) => stream.destroy(error));
zip.pipe(stream);
zip.append(manifest, { name: "manifest.json" });
zip.append(readFileSync(path.join(methodsRepo, "LICENSE")), { name: "LICENSE" });
await zip.finalize();
const archive = await completed;
const zipName = "gerar-imagens-flow-assets.contentflow-method.zip";
writeFileSync(path.join("release/methods-1.3.3", zipName), archive);
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  methods: [
    {
      id: "gerar-imagens-flow-assets",
      name: parsed.name,
      version: "1.0.0",
      contractVersion: 3,
      minCoreVersion: "1.3.3",
      license: "MIT",
      asset: zipName,
      description:
        "Transforma roteiro em personagens, referências, cenas consistentes e animações no Google Flow, com sete Blocos de Assets Visuais.",
      downloadUrl: `https://github.com/andremjr/methods-contentflow/releases/download/gerar-imagens-flow-assets-v1.0.0/${zipName}`,
      sha256: createHash("sha256").update(archive).digest("hex"),
      size: archive.length,
    },
  ],
};
writeFileSync(path.join(methodsRepo, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
writeFileSync(
  path.join("release/methods-1.3.3", "ContentFlow-Method-Catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    plugins: pluginCatalog.plugins.length,
    methods: catalog.methods.length,
    methodBlocks: method.blocks.length,
    repositories: [pluginsRepo, methodsRepo],
  }),
);
