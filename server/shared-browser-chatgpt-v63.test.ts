import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSharedBrowserProfileFixture } from "./test-support/shared-browser-profile-contract-v61";

const chatGptHandlerModule = "../ecosystem/plugins/reference/chatgpt-browser-studio/handler.mjs";

test("pacote 6.3 usa o perfil global do ChatGPT e mantém readiness no workspace privado", async () => {
  const fixture = await createSharedBrowserProfileFixture();
  const peerWorkspace = await mkdtemp(path.join(os.tmpdir(), "contentflow-chatgpt-v63-peer-"));
  try {
    const { __test } = await import(chatGptHandlerModule);
    const runtime = __test.resolveProfileRuntime(
      { configuration: { accountProfile: "shared" }, settings: {} },
      {
        getProfilePath: (relativePath: string) =>
          path.resolve(fixture.profileDirectory, relativePath),
        getWorkspacePath: (relativePath: string) =>
          path.resolve(fixture.workspaceDirectory, relativePath),
      },
    );
    const peerRuntime = __test.resolveProfileRuntime(
      { configuration: { accountProfile: "shared" }, settings: {} },
      {
        getProfilePath: (relativePath: string) =>
          path.resolve(fixture.profileDirectory, relativePath),
        getWorkspacePath: (relativePath: string) => path.resolve(peerWorkspace, relativePath),
      },
    );

    assert.equal(path.resolve(runtime.profilePath), path.resolve(fixture.profileDirectory));
    assert.equal(path.resolve(peerRuntime.profilePath), path.resolve(fixture.profileDirectory));
    assert.ok(
      path.resolve(runtime.readinessPath).startsWith(path.resolve(fixture.workspaceDirectory)),
    );
    assert.ok(path.resolve(peerRuntime.readinessPath).startsWith(path.resolve(peerWorkspace)));
    assert.notEqual(path.resolve(runtime.readinessPath), path.resolve(peerRuntime.readinessPath));

    await __test.markProfilePrepared(runtime, "shared");
    assert.equal(await __test.profileIsPrepared(runtime, "shared"), true);
    assert.equal(await __test.profileIsPrepared(peerRuntime, "shared"), false);
  } finally {
    await fixture.cleanup();
    await rm(peerWorkspace, { recursive: true, force: true });
  }
});
