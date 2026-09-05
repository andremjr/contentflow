import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Never reuse the user's database, credentials, plugins or running API.
const directory = await mkdtemp(path.join(tmpdir(), "contentflow-e2e-"));
const localPluginsDirectory = path.join(directory, "plugins", "local");
await mkdir(localPluginsDirectory, { recursive: true });
await cp(
  path.resolve("ecosystem/plugins/examples/kit-generated-text-transform"),
  path.join(localPluginsDirectory, "kit-generated-text-transform"),
  { recursive: true },
);
const env = { ...process.env, CONTENTFLOW_DATA_DIR: directory, CONTENTFLOW_API_PORT: "8895" };
const children = [
  spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "8095", "--strictPort"],
    { env, stdio: "inherit", windowsHide: true },
  ),
];
for (const child of children)
  child.on("exit", (code) => {
    for (const other of children) if (other !== child) other.kill();
    process.exitCode = code ?? 1;
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => children.forEach((child) => child.kill()));
