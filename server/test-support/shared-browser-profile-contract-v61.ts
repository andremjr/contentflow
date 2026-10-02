import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import Database from "better-sqlite3";
import type { PluginExecutionRequest, PluginManifest } from "../../src/lib/plugin-contract";
import {
  BrowserProfileStore,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
} from "../browser-profiles";
import { executeRegisteredPlugin, type RegisteredPlugin } from "../plugin-runner";
import { runSchemaMigrations } from "../schema-migrations";

export type SharedBrowserProfileFixture = {
  root: string;
  database: Database.Database;
  plugin: RegisteredPlugin;
  request: PluginExecutionRequest;
  profileId: string;
  pluginId: string;
  peerPluginId: string;
  profileDirectory: string;
  workspaceDirectory: string;
  profiles: BrowserProfileStore;
  bindings: PluginProfileBindingStore;
  readiness: PluginProfileReadinessStore;
  cleanup: () => Promise<void>;
};

export async function createSharedBrowserProfileFixture(): Promise<SharedBrowserProfileFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-profile-contract-v61-"));
  const database = new Database(path.join(root, "contentflow.sqlite"));
  database.pragma("foreign_keys = ON");
  await runSchemaMigrations(database, undefined, {
    backupDirectory: path.join(root, "migration-backups"),
  });

  const pluginId = "fixture.contentflow.browser-profile-contract";
  const peerPluginId = "fixture.contentflow.browser-profile-peer";
  const profileId = "profile-contract-v61";
  const profileDirectory = path.join(root, "browser-profiles", profileId);
  const workspaceDirectory = path.join(root, "plugin-workspaces", pluginId);
  await mkdir(profileDirectory, { recursive: true });
  await mkdir(workspaceDirectory, { recursive: true });

  const profiles = new BrowserProfileStore(database);
  const bindings = new PluginProfileBindingStore(database);
  const readiness = new PluginProfileReadinessStore(database);
  profiles.create({
    id: profileId,
    name: "Perfil compartilhado de contrato",
    alias: "shared",
    storageKind: "managed",
    storageKey: `browser-profiles/${profileId}`,
  });
  bindings.link(pluginId, profileId);
  bindings.link(peerPluginId, profileId);

  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    `import { readFile, writeFile } from "node:fs/promises";
export async function execute(request, services) {
  if (request.inputs?.waitForCancel === true) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 30_000);
      services.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("cancelled");
        error.code = "CANCELLED";
        reject(error);
      }, { once: true });
    });
  }
  const workspacePath = services.getWorkspacePath("private/state.txt");
  await writeFile(workspacePath, "workspace-private", "utf8");
  const profilePath = services.getProfilePath?.("shared/session.txt");
  if (!profilePath) return { status: "error", code: "PROFILE_REQUIRED", message: "profile required", retryable: false };
  await writeFile(profilePath, "global-profile", "utf8");
  return {
    status: "success",
    values: {
      workspacePath,
      profilePath,
      workspaceValue: await readFile(workspacePath, "utf8"),
      profileValue: await readFile(profilePath, "utf8")
    }
  };
}`,
    "utf8",
  );
  const manifest = {
    apiVersion: "2",
    id: pluginId,
    version: "1.0.0",
    permissions: ["filesystem:read", "filesystem:write"],
    capabilities: [],
  } as unknown as PluginManifest;
  const plugin: RegisteredPlugin = {
    id: pluginId,
    source: "local",
    directory: root,
    absoluteDirectory: root,
    entrypoint,
    manifest,
    executable: true,
  };
  const request = {
    pluginId,
    capabilityId: "profile-contract",
    executionId: "execution-v61",
    blockId: "block-v61",
    attempt: 1,
    traceId: "trace-v61",
    invocation: { mode: "start" },
    inputs: {},
    configuration: { accountProfile: "shared" },
    settings: {},
    inputContract: [],
    outputContract: [],
    context: {
      project: { id: "project-v61", title: "Profile contract" },
      processType: "assets",
      blockType: "CRIAR",
      operator: "IA",
    },
  } as unknown as PluginExecutionRequest;

  return {
    root,
    database,
    plugin,
    request,
    profileId,
    pluginId,
    peerPluginId,
    profileDirectory,
    workspaceDirectory,
    profiles,
    bindings,
    readiness,
    cleanup: async () => {
      database.close();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await rm(root, { recursive: true, force: true });
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempt === 19) throw error;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    },
  };
}

export async function assertGlobalProfileAndPrivateWorkspace(fixture: SharedBrowserProfileFixture) {
  const response = await executeRegisteredPlugin(
    fixture.plugin,
    fixture.request,
    10_000,
    {},
    {
      workspaceDirectory: fixture.workspaceDirectory,
      profileDirectory: fixture.profileDirectory,
      artifactDirectory: path.join(fixture.root, "artifacts"),
    },
  );
  assert.equal(response.status, "success");
  if (response.status !== "success") return;
  assert.equal(response.values.workspaceValue, "workspace-private");
  assert.equal(response.values.profileValue, "global-profile");
  const workspacePath = path.resolve(String(response.values.workspacePath));
  const profilePath = path.resolve(String(response.values.profilePath));
  assert.ok(workspacePath.startsWith(path.resolve(fixture.workspaceDirectory) + path.sep));
  assert.ok(profilePath.startsWith(path.resolve(fixture.profileDirectory) + path.sep));
  assert.equal(workspacePath.startsWith(path.resolve(fixture.profileDirectory) + path.sep), false);
  assert.equal(profilePath.startsWith(path.resolve(fixture.workspaceDirectory) + path.sep), false);
}

export function assertReadinessIsolation(fixture: SharedBrowserProfileFixture) {
  fixture.readiness.set({
    pluginId: fixture.pluginId,
    profileId: fixture.profileId,
    state: "ready",
    metadata: { bridge: "ready" },
  });
  fixture.readiness.set({
    pluginId: fixture.peerPluginId,
    profileId: fixture.profileId,
    state: "needs_auth",
    metadata: { bridge: "ready" },
  });
  assert.equal(fixture.readiness.get(fixture.pluginId, fixture.profileId)?.state, "ready");
  assert.equal(fixture.readiness.get(fixture.peerPluginId, fixture.profileId)?.state, "needs_auth");
  fixture.bindings.unlink(fixture.pluginId, fixture.profileId);
  assert.equal(fixture.readiness.get(fixture.pluginId, fixture.profileId), undefined);
  assert.equal(fixture.readiness.get(fixture.peerPluginId, fixture.profileId)?.state, "needs_auth");
  assert.ok(fixture.profiles.get(fixture.profileId));
}

export async function assertCancellationStopsInvocation(fixture: SharedBrowserProfileFixture) {
  const controller = new AbortController();
  const execution = executeRegisteredPlugin(
    fixture.plugin,
    { ...fixture.request, inputs: { waitForCancel: true } },
    10_000,
    {},
    {
      workspaceDirectory: fixture.workspaceDirectory,
      profileDirectory: fixture.profileDirectory,
      artifactDirectory: path.join(fixture.root, "artifacts-cancel"),
      signal: controller.signal,
    },
  );
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(execution, /cancelada/i);
}

export type BridgeAttach = (input: Record<string, unknown>) => Promise<{
  dispatch: (
    type: string,
    payload?: Record<string, unknown>,
    commandId?: string,
  ) => Promise<unknown>;
  dispose: () => void;
}>;

export async function assertBridgeNegotiationAndCancellation(attachBridge: BridgeAttach) {
  let activeToken: string | undefined;
  let dispatchCalls = 0;
  const identity = {
    bridgeId: "com.contentflow.browser-bridge",
    protocolVersion: 2,
    protocol: { min: 2, max: 2 },
    capabilities: [
      "idempotent-replay.v1",
      "lifecycle-events.v1",
      "snapshot.v1",
      "condition-observer.v1",
      "reload.v1",
    ],
    bridgeVersion: "0.4.0",
    extensionVersion: "0.4.0",
  };
  const context = vm.createContext({
    setTimeout,
    contentFlowBridge: {
      identity,
      connect(handshake: { sessionToken: string }) {
        activeToken = handshake.sessionToken;
        return { ok: true, protocolVersion: 2, capabilities: identity.capabilities };
      },
      dispatch(command: { sessionToken: string; type: string }) {
        if (command.sessionToken !== activeToken) return { ok: false, code: "SESSION_MISMATCH" };
        dispatchCalls += 1;
        return { ok: true, ...identity };
      },
      events: () => ({ ok: true, events: [], lastSequence: 0, snapshotRequired: false }),
      snapshot: () => ({ ok: true, sequence: 0, snapshot: { state: "connected" } }),
    },
  });
  const client = {
    async send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
      if (method === "Target.getTargets") {
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://fixture/service-worker.js",
            },
          ],
        };
      }
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.enable" || method === "Target.detachFromTarget") return {};
      if (method === "Runtime.evaluate") {
        const value =
          sessionId === "page-session"
            ? { url: "https://example.test/app", origin: "https://example.test" }
            : await vm.runInContext(String(params.expression), context);
        return { result: { value } };
      }
      return {};
    },
  };
  const controller = new AbortController();
  const bridge = await attachBridge({
    client,
    pageSessionId: "page-session",
    pluginId: "fixture.contentflow.browser-profile-contract",
    profileId: "shared",
    request: { executionId: "bridge-v61" },
    signal: controller.signal,
    allowedOrigins: ["https://example.test"],
  });
  await bridge.dispatch("inspect", {}, "inspect-v61");
  const callsBeforeCancel = dispatchCalls;
  assert.ok(callsBeforeCancel >= 1);
  controller.abort();
  await assert.rejects(
    bridge.dispatch("inspect", {}, "inspect-after-cancel-v61"),
    (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && error.code === "CANCELLED"),
  );
  assert.equal(dispatchCalls, callsBeforeCancel);
  bridge.dispose();
}
