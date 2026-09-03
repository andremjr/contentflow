import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function normalizeUserProvidedPath(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (trimmed.length >= 2 && (quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function discoverPluginDirectories(requestedPath: string) {
  const sourceRoot = path.resolve(normalizeUserProvidedPath(requestedPath));
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory())
    throw new Error("A pasta informada não existe.");

  if (existsSync(path.join(sourceRoot, "contentflow.plugin.json"))) return [sourceRoot];

  const pluginDirectories = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(sourceRoot, entry.name))
    .filter((directory) => existsSync(path.join(directory, "contentflow.plugin.json")))
    .sort((left, right) => left.localeCompare(right));

  if (!pluginDirectories.length)
    throw new Error("A pasta não contém um plugin nem um pacote com subpastas de plugins.");
  return pluginDirectories;
}
