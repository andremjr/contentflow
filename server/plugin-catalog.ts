import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import yauzl, { type Entry, type ZipFile } from "yauzl";

const CATALOG_SCHEMA_VERSION = 1;
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 25_000;

export type PluginCatalogEntry = {
  id: string;
  name: string;
  version: string;
  apiVersion?: string;
  minCoreVersion?: string;
  asset: string;
  sha256: string;
  size: number;
};

export const pluginVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isSafePluginVersion(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  const match = pluginVersionPattern.exec(value);
  return Boolean(match && (!match[4] || match[4].split(".").every((part) => !/^0\d+$/.test(part))));
}

/** SemVer precedence, including numeric prereleases; build metadata has no precedence. */
export function comparePluginVersions(left: string, right: string): number {
  if (!isSafePluginVersion(left) || !isSafePluginVersion(right))
    throw new Error("A versão do plugin é inválida.");
  const a = pluginVersionPattern.exec(left)!;
  const b = pluginVersionPattern.exec(right)!;
  for (let index = 1; index <= 3; index++) {
    if (BigInt(a[index]) !== BigInt(b[index])) return BigInt(a[index]) > BigInt(b[index]) ? 1 : -1;
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  const next = a[4].split(".");
  const previous = b[4].split(".");
  for (let index = 0; index < Math.max(next.length, previous.length); index++) {
    if (next[index] === undefined) return -1;
    if (previous[index] === undefined) return 1;
    if (next[index] === previous[index]) continue;
    const numericA = /^\d+$/.test(next[index]);
    const numericB = /^\d+$/.test(previous[index]);
    if (numericA && numericB) return BigInt(next[index]) > BigInt(previous[index]) ? 1 : -1;
    if (numericA !== numericB) return numericA ? -1 : 1;
    return next[index] > previous[index] ? 1 : -1;
  }
  return 0;
}

export function currentCoreVersion() {
  const root = path.resolve(process.env.CONTENTFLOW_APP_ROOT ?? process.cwd());
  const versionPath = [
    path.join(root, "package.json"),
    path.join(root, "app", "package.json"),
    path.join(root, "app", "desktop-dist", "build-info.json"),
    path.join(root, "desktop-dist", "build-info.json"),
  ].find(existsSync);
  if (!versionPath) throw new Error("A versão do ContentFlow não foi encontrada.");
  const version: unknown = JSON.parse(readFileSync(versionPath, "utf8")).version;
  if (!isSafePluginVersion(version)) throw new Error("A versão do ContentFlow é inválida.");
  return version;
}

export type PluginCompatibility = {
  status: "compatible" | "incompatible";
  reason?: "unsupported_api" | "core_version" | "invalid_manifest" | "missing_metadata";
};

export function pluginCatalogCompatibility(
  entry: { apiVersion?: string; minCoreVersion?: string },
  coreVersion = currentCoreVersion(),
): PluginCompatibility {
  if (!entry.apiVersion) return { status: "incompatible", reason: "missing_metadata" };
  if (entry.apiVersion !== "2") return { status: "incompatible", reason: "unsupported_api" };
  if (
    entry.minCoreVersion &&
    (!isSafePluginVersion(entry.minCoreVersion) ||
      comparePluginVersions(coreVersion, entry.minCoreVersion) < 0)
  )
    return { status: "incompatible", reason: "core_version" };
  return { status: "compatible" };
}

export type PluginCatalog = {
  schemaVersion: 1;
  generatedAt: string;
  plugins: PluginCatalogEntry[];
};

function isCatalogEntry(value: unknown): value is PluginCatalogEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(entry.id) &&
    typeof entry.name === "string" &&
    entry.name.trim().length > 0 &&
    isSafePluginVersion(entry.version) &&
    (entry.apiVersion === undefined ||
      (typeof entry.apiVersion === "string" && /^[0-9]+$/.test(entry.apiVersion))) &&
    (entry.minCoreVersion === undefined || isSafePluginVersion(entry.minCoreVersion)) &&
    typeof entry.asset === "string" &&
    /^ContentFlow-Plugin-[A-Za-z0-9._-]+\.zip$/.test(entry.asset) &&
    typeof entry.sha256 === "string" &&
    /^[A-Fa-f0-9]{64}$/.test(entry.sha256) &&
    Number.isSafeInteger(entry.size) &&
    Number(entry.size) > 0 &&
    Number(entry.size) <= MAX_ARCHIVE_BYTES
  );
}

export function parsePluginCatalog(value: unknown): PluginCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("O catálogo de plugins é inválido.");
  const catalog = value as Record<string, unknown>;
  if (
    catalog.schemaVersion !== CATALOG_SCHEMA_VERSION ||
    typeof catalog.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(catalog.generatedAt)) ||
    !Array.isArray(catalog.plugins) ||
    !catalog.plugins.every(isCatalogEntry)
  ) {
    throw new Error("O catálogo de plugins é incompatível.");
  }
  const plugins = catalog.plugins as PluginCatalogEntry[];
  if (new Set(plugins.map((plugin) => plugin.id)).size !== plugins.length)
    throw new Error("O catálogo contém plugins duplicados.");
  return {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    plugins,
  };
}

async function fetchWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "application/json, application/zip" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPluginCatalog(catalogUrl: string): Promise<PluginCatalog> {
  const url = new URL(catalogUrl);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    throw new Error("O catálogo precisa usar HTTPS.");
  const response = await fetchWithTimeout(url, 15_000);
  if (!response.ok) throw new Error(`O catálogo respondeu HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_CATALOG_BYTES) throw new Error("O catálogo excede o limite permitido.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_CATALOG_BYTES)
    throw new Error("O catálogo excede o limite permitido.");
  return parsePluginCatalog(JSON.parse(text));
}

export function pluginAssetUrl(catalogUrl: string, entry: PluginCatalogEntry) {
  const catalog = new URL(catalogUrl);
  const asset = new URL(entry.asset, catalog);
  if (asset.origin !== catalog.origin) throw new Error("A origem do pacote é inválida.");
  return asset;
}

export async function downloadCatalogPlugin(
  catalogUrl: string,
  entry: PluginCatalogEntry,
  destination: string,
) {
  const response = await fetchWithTimeout(pluginAssetUrl(catalogUrl, entry), 60_000);
  if (!response.ok || !response.body)
    throw new Error(`O pacote do plugin respondeu HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_ARCHIVE_BYTES || declaredLength > entry.size)
    throw new Error("O pacote excede o tamanho publicado no catálogo.");

  const reader = response.body.getReader();
  const output = createWriteStream(destination, { flags: "wx" });
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_ARCHIVE_BYTES || received > entry.size) {
        await reader.cancel();
        throw new Error("O pacote excede o tamanho publicado no catálogo.");
      }
      if (!output.write(value))
        await new Promise<void>((resolve) => output.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) =>
      output.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    output.destroy();
    throw error;
  }
  if (received !== entry.size) throw new Error("O tamanho do pacote não corresponde ao catálogo.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  if (hash.digest("hex").toLowerCase() !== entry.sha256.toLowerCase())
    throw new Error("O hash SHA-256 do pacote não corresponde ao catálogo.");
}

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error("ZIP inválido."));
      else resolve(zipFile);
    });
  });
}

function openEntry(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("Entrada ZIP inválida."));
      else resolve(stream);
    });
  });
}

function safeArchivePath(root: string, fileName: string) {
  if (
    !fileName ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    path.posix.isAbsolute(fileName)
  )
    throw new Error("O pacote contém um caminho inválido.");
  const segments = fileName.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === ".."))
    throw new Error("O pacote contém traversal de diretório.");
  const destination = path.resolve(root, ...segments);
  if (!destination.startsWith(`${path.resolve(root)}${path.sep}`))
    throw new Error("O pacote tentou gravar fora da pasta temporária.");
  return destination;
}

export async function extractPluginArchive(archivePath: string, destinationRoot: string) {
  mkdirSync(destinationRoot, { recursive: true });
  const zipFile = await openZip(archivePath);
  let entries = 0;
  let extractedBytes = 0;
  return await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      if (error) reject(error);
      else resolve();
    };
    zipFile.on("error", finish);
    zipFile.on("end", () => finish());
    zipFile.on("entry", (entry: Entry) => {
      void (async () => {
        entries += 1;
        extractedBytes += entry.uncompressedSize;
        if (entries > MAX_ARCHIVE_ENTRIES || extractedBytes > MAX_EXTRACTED_BYTES)
          throw new Error("O conteúdo extraído excede os limites permitidos.");
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((mode & 0o170000) === 0o120000)
          throw new Error("Plugins distribuídos não podem conter links simbólicos.");
        const destination = safeArchivePath(destinationRoot, entry.fileName);
        if (entry.fileName.endsWith("/")) {
          mkdirSync(destination, { recursive: true });
        } else {
          mkdirSync(path.dirname(destination), { recursive: true });
          const input = await openEntry(zipFile, entry);
          await pipeline(input, createWriteStream(destination, { flags: "wx" }));
        }
        zipFile.readEntry();
      })().catch(finish);
    });
    zipFile.readEntry();
  });
}
