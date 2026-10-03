import { createHash } from "node:crypto";

// A configured catalogue grants access only to its own origin/repository.
export function catalogDownloadUrl(catalogUrl: string, downloadUrl: string) {
  const catalog = new URL(catalogUrl);
  const asset = new URL(downloadUrl, catalog);
  const local = ["localhost", "127.0.0.1"].includes(catalog.hostname);
  if (asset.username || asset.password || asset.hash || (!local && asset.protocol !== "https:"))
    throw new Error("CATALOG_INVALID_URL");
  if (asset.origin === catalog.origin && asset.protocol === catalog.protocol) return asset;
  if (catalog.hostname === "raw.githubusercontent.com" && asset.hostname === "github.com") {
    const [owner, repository] = catalog.pathname.split("/").filter(Boolean);
    if (asset.pathname.startsWith(`/${owner}/${repository}/releases/download/`)) return asset;
  }
  throw new Error("CATALOG_INVALID_ORIGIN");
}

export async function readCatalogBytes(url: URL, maxBytes: number, timeoutMs = 15_000) {
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("CATALOG_INVALID_URL");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json, application/zip" },
    redirect: "follow",
  });
  if (!response.ok || !response.body) throw new Error(`CATALOG_HTTP_${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("CATALOG_SIZE_LIMIT");
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("CATALOG_SIZE_LIMIT");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export async function readCatalogPackage(
  catalogUrl: string,
  entry: { downloadUrl: string; size: number; sha256: string },
  maxBytes: number,
) {
  const bytes = await readCatalogBytes(
    catalogDownloadUrl(catalogUrl, entry.downloadUrl),
    Math.min(entry.size, maxBytes),
    60_000,
  );
  if (
    bytes.length !== entry.size ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256.toLowerCase()
  )
    throw new Error("CATALOG_INTEGRITY_FAILED");
  return bytes;
}
