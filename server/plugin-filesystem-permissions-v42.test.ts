import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import {
  BrowserProfileStore,
  LegacyBrowserProfileResolutionError,
  resolveLegacyBrowserProfile,
} from "./browser-profiles";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";
import { runSchemaMigrations } from "./schema-migrations";

function request(pluginId: string, action: string): PluginExecutionRequest {
  return {
    pluginId,
    capabilityId: "test",
    executionId: "execution",
    blockId: "block",
    attempt: 1,
    traceId: `${action}-trace`,
    invocation: { mode: "start" },
    inputs: {},
    configuration: { action },
    settings: {},
    inputContract: [],
    outputContract: [],
    context: {
      project: { id: "project", title: "Project" },
      processType: "script",
      blockType: "CRIAR",
      operator: "IA",
    },
  } as unknown as PluginExecutionRequest;
}

async function pluginFixture(permissions: PluginManifest["permissions"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-fs-v42-plugin-"));
  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    `import { readFile, symlink, writeFile } from "node:fs/promises";
     import path from "node:path";
     export async function execute(request, services) {
       const action = request.configuration.action;
       if (action === "read") {
         const workspace = await readFile(services.getWorkspacePath("existing.txt"), "utf8");
         const profile = await readFile(services.getProfilePath("state/existing.txt"), "utf8");
         return { status: "success", values: { workspace, profile } };
       }
       if (action === "write") {
         await writeFile(services.getWorkspacePath("created.txt"), "workspace", "utf8");
         await writeFile(services.getProfilePath("state/created.txt"), "profile", "utf8");
         return { status: "success", values: { ok: true } };
       }
       if (action === "traversal") services.getWorkspacePath("../neighbor/secret.txt");
       if (action === "profileTraversal") services.getProfilePath("../neighbor/secret.txt");
       if (action === "workspaceSymlink") services.getWorkspacePath("external-link/secret.txt");
       if (action === "profileSymlink") services.getProfilePath("external-link/secret.txt");
       if (action === "workspaceSymlinkWrite") {
         await writeFile(services.getWorkspacePath("external-link/created.txt"), "blocked", "utf8");
       }
       if (action === "profileSymlinkWrite") {
         await writeFile(services.getProfilePath("external-link/created.txt"), "blocked", "utf8");
       }
       if (action === "createSymlink") {
         const workspaceRoot = services.getWorkspacePath(".");
         await symlink(
           path.resolve(workspaceRoot, "..", "escape-target"),
           services.getWorkspacePath("created-link"),
           process.platform === "win32" ? "junction" : "dir"
         );
       }
       return { status: "success", values: { ok: true } };
     }`,
    "utf8",
  );
  const manifest = {
    apiVersion: "2",
    id: `filesystem-v42-${permissions.join("-") || "none"}`,
    version: "1.0.0",
    permissions,
    capabilities: [],
  } as unknown as PluginManifest;
  return {
    root,
    plugin: {
      id: manifest.id,
      source: "local",
      directory: root,
      absoluteDirectory: root,
      entrypoint,
      manifest,
      executable: true,
    } satisfies RegisteredPlugin,
  };
}

async function execute(
  plugin: RegisteredPlugin,
  action: string,
  workspaceDirectory: string,
  profileDirectory: string,
) {
  return executeRegisteredPlugin(
    plugin,
    request(plugin.id, action),
    10_000,
    {},
    {
      workspaceDirectory,
      profileDirectory,
      artifactDirectory: path.join(workspaceDirectory, "artifacts"),
    },
  );
}

test("pacote 4.2 respeita filesystem:read e filesystem:write no workspace e perfil selecionado", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-fs-v42-"));
  const workspace = path.join(root, "workspace");
  const profile = path.join(root, "profile");
  await mkdir(path.join(profile, "state"), { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "existing.txt"), "workspace-read", "utf8");
  await writeFile(path.join(profile, "state", "existing.txt"), "profile-read", "utf8");
  const readOnly = await pluginFixture(["filesystem:read"]);
  const writeOnly = await pluginFixture(["filesystem:write"]);
  try {
    const readResult = await execute(readOnly.plugin, "read", workspace, profile);
    assert.equal(readResult.status, "success");
    if (readResult.status === "success") {
      assert.equal(readResult.values.workspace, "workspace-read");
      assert.equal(readResult.values.profile, "profile-read");
    }
    assert.equal((await execute(readOnly.plugin, "write", workspace, profile)).status, "error");

    const writeResult = await execute(writeOnly.plugin, "write", workspace, profile);
    assert.equal(writeResult.status, "success", JSON.stringify(writeResult));
    assert.equal(await readFile(path.join(workspace, "created.txt"), "utf8"), "workspace");
    assert.equal(await readFile(path.join(profile, "state", "created.txt"), "utf8"), "profile");
    assert.equal((await execute(writeOnly.plugin, "read", workspace, profile)).status, "error");
    assert.equal(
      (await execute(writeOnly.plugin, "createSymlink", workspace, profile)).status,
      "error",
    );

    const external = path.join(root, "external-write-only");
    await mkdir(external, { recursive: true });
    await symlink(
      external,
      path.join(workspace, "external-link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await symlink(
      external,
      path.join(profile, "external-link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      () => execute(writeOnly.plugin, "workspaceSymlinkWrite", workspace, profile),
      /link simbólico para fora da raiz permitida/,
    );
    await assert.rejects(
      () => execute(writeOnly.plugin, "profileSymlinkWrite", workspace, profile),
      /link simbólico para fora da raiz permitida/,
    );
    assert.equal(
      await readFile(path.join(external, "created.txt"), "utf8").catch(() => undefined),
      undefined,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(readOnly.root, { recursive: true, force: true });
    await rm(writeOnly.root, { recursive: true, force: true });
  }
});

test("pacote 4.2 rejeita traversal, raiz vizinha e symlink externo", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-fs-v42-escape-"));
  const workspace = path.join(root, "workspace");
  const profile = path.join(root, "profile");
  const external = path.join(root, "external");
  await mkdir(workspace, { recursive: true });
  await mkdir(profile, { recursive: true });
  await mkdir(external, { recursive: true });
  await writeFile(path.join(external, "secret.txt"), "secret", "utf8");
  await symlink(
    external,
    path.join(workspace, "external-link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await symlink(
    external,
    path.join(profile, "external-link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const fixture = await pluginFixture(["filesystem:read", "filesystem:write"]);
  try {
    for (const action of ["traversal", "profileTraversal", "workspaceSymlink", "profileSymlink"]) {
      const result = await execute(fixture.plugin, action, workspace, profile);
      assert.equal(result.status, "error", `${action} deveria ser rejeitado`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("pacote 4.2 rejeita perfil global não vinculado ao plugin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-fs-v42-binding-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  try {
    await runSchemaMigrations(database, undefined, { backupDirectory: path.join(root, "backups") });
    const profiles = new BrowserProfileStore(database);
    profiles.create({
      id: "unlinked-profile",
      name: "Sem vínculo",
      alias: "principal",
      storageKind: "managed",
      storageKey: "browser-profiles/unlinked-profile",
    });
    assert.throws(
      () =>
        resolveLegacyBrowserProfile(database, {
          pluginId: "plugin.alpha",
          alias: "principal",
          dataDirectory: root,
        }),
      (error) => error instanceof LegacyBrowserProfileResolutionError && error.code === "not_found",
    );
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
