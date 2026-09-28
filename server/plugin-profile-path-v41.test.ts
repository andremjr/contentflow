import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";

function request(pluginId: string): PluginExecutionRequest {
  return {
    pluginId,
    capabilityId: "test",
    executionId: "execution",
    blockId: "block",
    attempt: 1,
    traceId: "trace",
    invocation: { mode: "start" },
    inputs: {},
    configuration: {},
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

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-profile-path-v41-"));
  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    `import { writeFile } from "node:fs/promises";
    export async function execute(_request, services) {
      const hasProfilePath = typeof services.getProfilePath === "function";
      const workspacePath = services.getWorkspacePath("workspace-marker.txt");
      await writeFile(workspacePath, "workspace", "utf8");
      let profilePath;
      if (hasProfilePath) {
        profilePath = services.getProfilePath("state/profile-marker.txt");
        await writeFile(profilePath, "profile", "utf8");
      }
      return {
        status: "success",
        values: {
          hasProfilePath,
          workspacePath,
          profilePath: profilePath ?? ""
        }
      };
    }`,
    "utf8",
  );
  const manifest = {
    id: "profile-path-v41",
    version: "1.0.0",
    permissions: ["filesystem:read", "filesystem:write"],
    capabilities: [],
  } as unknown as PluginManifest;
  const plugin: RegisteredPlugin = {
    id: manifest.id,
    source: "local",
    directory: root,
    absoluteDirectory: root,
    entrypoint,
    manifest,
    executable: true,
  };
  return { root, plugin };
}

test("pacote 4.1 injeta getProfilePath somente quando a invocação recebeu perfil resolvido", async () => {
  const { root, plugin } = await fixture();
  const workspaceDirectory = path.join(root, "workspace");
  const profileDirectory = path.join(root, "global-profile");
  try {
    const withProfile = await executeRegisteredPlugin(
      plugin,
      request(plugin.id),
      10_000,
      {},
      {
        workspaceDirectory,
        profileDirectory,
        artifactDirectory: path.join(root, "artifacts-a"),
      },
    );
    assert.equal(withProfile.status, "success");
    if (withProfile.status !== "success") return;
    assert.equal(withProfile.values.hasProfilePath, true);
    assert.equal(
      path.resolve(String(withProfile.values.workspacePath)),
      path.resolve(workspaceDirectory, "workspace-marker.txt"),
    );
    assert.equal(
      path.resolve(String(withProfile.values.profilePath)),
      path.resolve(profileDirectory, "state", "profile-marker.txt"),
    );
    assert.notEqual(
      path.dirname(path.resolve(String(withProfile.values.workspacePath))),
      path.dirname(path.resolve(String(withProfile.values.profilePath))),
    );
    assert.equal(
      await readFile(path.join(profileDirectory, "state", "profile-marker.txt"), "utf8"),
      "profile",
    );

    const withoutProfile = await executeRegisteredPlugin(
      plugin,
      request(plugin.id),
      10_000,
      {},
      {
        workspaceDirectory: path.join(root, "workspace-without-profile"),
        artifactDirectory: path.join(root, "artifacts-b"),
      },
    );
    assert.equal(withoutProfile.status, "success");
    if (withoutProfile.status !== "success") return;
    assert.equal(withoutProfile.values.hasProfilePath, false);
    assert.equal(withoutProfile.values.profilePath, "");
    assert.equal(
      existsSync(path.join(root, "workspace-without-profile", "workspace-marker.txt")),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
