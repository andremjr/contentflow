import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrateDatabase } from "../server/user-data-upgrade";
export {
  convertLegacyMethod,
  convertExecution,
  planDatabaseMigration,
  loadCurrentPluginCapabilities,
  migrateDatabase,
} from "../server/user-data-upgrade";
export type { MigrationContext, MigrationDiagnostic } from "../server/user-data-upgrade";

function defaultDataDirectory() {
  if (process.env.CONTENTFLOW_DATA_DIR) return path.resolve(process.env.CONTENTFLOW_DATA_DIR);
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "ContentFlow", "data");
  }
  return path.resolve("data");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const apply = process.argv.includes("--apply");
  const dataArgument = process.argv.find((arg) => arg.startsWith("--data-dir="));
  const dataDirectory = dataArgument
    ? path.resolve(dataArgument.slice("--data-dir=".length))
    : defaultDataDirectory();
  const result = await migrateDatabase(dataDirectory, apply);
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        dataDirectory,
        scanned: result.scanned,
        pendingUpdates: result.updates.length,
        diagnostics: result.context.diagnostics,
        applied: result.applied,
        backupPath: result.backupPath,
        currentPluginCapabilities: result.context.capabilities.size,
      },
      null,
      2,
    ),
  );
  if (result.context.diagnostics.length) process.exitCode = 2;
}
