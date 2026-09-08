import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

const BRIDGE_FILES = [
  "content-script.js",
  "INSTALAR.md",
  "manifest.json",
  "README.md",
  "service-worker.js",
] as const;

export type BrowserBridgeProfileState = "installed" | "missing" | "unknown";

function jsonObject(filePath: string) {
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function markerMatches(profileDirectory: string, alias: string) {
  const marker = jsonObject(path.join(profileDirectory, ".contentflow-profile-ready.json"));
  return marker?.profile === alias;
}

function childDirectories(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

export function findBrowserProfileDirectory(workspaceDirectory: string, alias: string) {
  const workspace = path.resolve(workspaceDirectory);
  const directCandidates = [path.join(workspace, alias)];
  if (alias === "default") directCandidates.push(workspace);
  directCandidates.push(path.join(workspace, "browser-profiles", alias));

  const candidates = [
    ...directCandidates,
    ...childDirectories(workspace),
    ...childDirectories(workspace).flatMap(childDirectories),
  ];
  for (const candidate of [...new Set(candidates.map((value) => path.resolve(value)))]) {
    if (!candidate.startsWith(workspace) || !markerMatches(candidate, alias)) continue;
    return candidate;
  }
  return undefined;
}

export function browserBridgeProfileState(
  workspaceDirectory: string,
  alias: string,
): BrowserBridgeProfileState {
  const profileDirectory = findBrowserProfileDirectory(workspaceDirectory, alias);
  if (!profileDirectory) return "unknown";
  const securePreferencesPath = path.join(profileDirectory, "Default", "Secure Preferences");
  const securePreferences = jsonObject(securePreferencesPath);
  if (!securePreferences) return "unknown";
  const extensions = securePreferences.extensions;
  const settings =
    extensions && typeof extensions === "object" && !Array.isArray(extensions)
      ? (extensions as Record<string, unknown>).settings
      : undefined;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "missing";

  for (const extension of Object.values(settings as Record<string, unknown>)) {
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) continue;
    const extensionPath = (extension as Record<string, unknown>).path;
    const location = (extension as Record<string, unknown>).location;
    if (location !== 4 || typeof extensionPath !== "string" || !path.isAbsolute(extensionPath)) {
      continue;
    }
    const manifest = jsonObject(path.join(extensionPath, "manifest.json"));
    if (manifest?.name === "ContentFlow Browser Bridge") return "installed";
  }
  return "missing";
}

export function stageBrowserBridge(applicationRoot: string, dataDirectory: string) {
  const sourceCandidates = [
    path.join(applicationRoot, "browser-bridge"),
    path.join(applicationRoot, "ecosystem", "browser-bridge"),
  ];
  const source = sourceCandidates.find((candidate) =>
    existsSync(path.join(candidate, "manifest.json")),
  );
  if (!source) return undefined;

  const destination = path.join(dataDirectory, "browser-bridge");
  mkdirSync(destination, { recursive: true });
  for (const fileName of BRIDGE_FILES) {
    const sourceFile = path.join(source, fileName);
    if (existsSync(sourceFile) && statSync(sourceFile).isFile()) {
      cpSync(sourceFile, path.join(destination, fileName), { force: true });
    }
  }
  return realpathSync(destination);
}
