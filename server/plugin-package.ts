import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function discoverPluginDirectories(requestedPath: string) {
  const sourceRoot = path.resolve(requestedPath);
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
