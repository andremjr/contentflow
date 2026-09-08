import type { Archiver, ArchiverError } from "archiver";
import yauzl from "yauzl";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

const archiver = createRequire(import.meta.url)("archiver") as {
  create: (format: "zip", options: { zlib: { level: number } }) => Archiver;
};

const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const coverDataPattern = /^data:image\/(webp|png|jpeg);base64,([a-zA-Z0-9+/=]+)$/;

type PortableMethod = { processType?: string; imageUrl?: string };
type PortableManifest = {
  format?: string;
  method?: PortableMethod;
  methods?: PortableMethod[];
  channelImageUrl?: string;
};

async function extractCover(
  source: string | undefined,
  target: string,
  resolveLocalAsset?: (url: string) => Buffer | Promise<Buffer>,
) {
  if (!source) return undefined;
  const match = coverDataPattern.exec(source);
  const data = match
    ? Buffer.from(match[2], "base64")
    : source.startsWith("/api/files/") && resolveLocalAsset
      ? await resolveLocalAsset(source)
      : undefined;
  if (!data) throw new Error("A capa do pacote é inválida.");
  if (!data.length || data.length > 2 * 1024 * 1024) {
    throw new Error("A capa do pacote excede o limite permitido.");
  }
  const extension = match ? (match[1] === "jpeg" ? "jpg" : match[1]) : "webp";
  return { target: target.replace(/\.webp$/, `.${extension}`), data };
}

export async function createMethodPackage(
  manifestText: string,
  resolveLocalAsset?: (url: string) => Buffer | Promise<Buffer>,
) {
  const manifest = JSON.parse(manifestText) as PortableManifest;
  if (!["contentflow-method", "contentflow-method-pack"].includes(manifest.format ?? "")) {
    throw new Error("Manifesto de Métodos inválido.");
  }
  const assets: { target: string; data: Buffer }[] = [];
  if (manifest.method?.imageUrl) {
    const asset = await extractCover(
      manifest.method.imageUrl,
      `assets/method-${manifest.method.processType ?? "cover"}.webp`,
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      manifest.method.imageUrl = asset.target;
    }
  }
  for (const method of manifest.methods ?? []) {
    const asset = await extractCover(
      method.imageUrl,
      `assets/method-${method.processType ?? "cover"}.webp`,
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      method.imageUrl = asset.target;
    }
  }
  if (manifest.channelImageUrl) {
    const asset = await extractCover(
      manifest.channelImageUrl,
      "assets/channel-cover.webp",
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      manifest.channelImageUrl = asset.target;
    }
  }

  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
  });
  const archive = archiver.create("zip", { zlib: { level: 9 } });
  archive.on("error", (error: ArchiverError) => output.destroy(error));
  archive.pipe(output);
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  for (const asset of assets) archive.append(asset.data, { name: asset.target });
  await archive.finalize();
  return completed;
}

function readZipEntries(buffer: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("Pacote ZIP inválido."));
      const entries = new Map<string, Buffer>();
      let total = 0;
      zip.on("error", reject);
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        if (
          entry.fileName.includes("..") ||
          entry.fileName.includes("\\") ||
          (entry.fileName !== "manifest.json" &&
            !/^assets\/[a-z0-9-]+\.(webp|png|jpg)$/.test(entry.fileName))
        ) {
          zip.close();
          return reject(new Error("O pacote contém um caminho não permitido."));
        }
        if (entries.size >= 12 || entry.uncompressedSize > MAX_PACKAGE_BYTES) {
          zip.close();
          return reject(new Error("O pacote excede os limites permitidos."));
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(streamError ?? new Error("Entrada ZIP inválida."));
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_PACKAGE_BYTES) {
              stream.destroy(new Error("O pacote excede os limites permitidos."));
              return;
            }
            chunks.push(chunk);
          });
          stream.on("error", reject);
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.readEntry();
    });
  });
}

export async function readMethodPackage(
  buffer: Buffer,
  storeAsset?: (assetPath: string, data: Buffer) => string | Promise<string>,
) {
  const entries = await readZipEntries(buffer);
  const manifestBuffer = entries.get("manifest.json");
  if (!manifestBuffer) throw new Error("O pacote não contém manifest.json.");
  const manifest = JSON.parse(manifestBuffer.toString("utf8")) as PortableManifest;
  const restore = async (assetPath: string | undefined) => {
    if (!assetPath?.startsWith("assets/")) return assetPath;
    const asset = entries.get(assetPath);
    if (!asset) throw new Error(`A capa ${assetPath} não foi encontrada no pacote.`);
    const extension = assetPath.split(".").pop();
    const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return storeAsset
      ? await storeAsset(assetPath, asset)
      : `data:${mime};base64,${asset.toString("base64")}`;
  };
  if (manifest.method) manifest.method.imageUrl = await restore(manifest.method.imageUrl);
  for (const method of manifest.methods ?? []) method.imageUrl = await restore(method.imageUrl);
  manifest.channelImageUrl = await restore(manifest.channelImageUrl);
  return JSON.stringify(manifest);
}
