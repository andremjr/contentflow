import { z } from "zod";
import { parseMethodImportFile } from "../src/lib/method-file";
import { readMethodPackage } from "./method-package";
import { isSafePluginVersion, comparePluginVersions, currentCoreVersion } from "./plugin-catalog";
import { catalogDownloadUrl, readCatalogBytes, readCatalogPackage } from "./catalog-download";

const entrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  version: z.string().refine(isSafePluginVersion),
  contractVersion: z.literal(3),
  minCoreVersion: z.string().refine(isSafePluginVersion),
  downloadUrl: z.string().url(),
  asset: z.string().regex(/^[A-Za-z0-9._-]+\.(json|zip)$/),
  size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  license: z.string().min(1),
});
const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  methods: z.array(entrySchema).max(2000),
});
export type MethodCatalogEntry = z.infer<typeof entrySchema>;

export async function fetchMethodCatalog(url: string) {
  const catalog = catalogSchema.parse(
    JSON.parse((await readCatalogBytes(new URL(url), 2 * 1024 * 1024)).toString("utf8")),
  );
  if (new Set(catalog.methods.map((entry) => entry.id)).size !== catalog.methods.length)
    throw new Error("CATALOG_DUPLICATE_ID");
  for (const entry of catalog.methods) catalogDownloadUrl(url, entry.downloadUrl);
  return catalog;
}

export function methodCatalogCompatible(entry: MethodCatalogEntry) {
  return comparePluginVersions(currentCoreVersion(), entry.minCoreVersion) >= 0;
}

export async function readCatalogMethod(url: string, entry: MethodCatalogEntry) {
  if (!methodCatalogCompatible(entry)) throw new Error("CATALOG_INCOMPATIBLE");
  const bytes = await readCatalogPackage(url, entry, 20 * 1024 * 1024);
  const manifest = entry.asset.endsWith(".zip")
    ? await readMethodPackage(bytes)
    : bytes.toString("utf8");
  parseMethodImportFile(manifest);
  return manifest;
}
