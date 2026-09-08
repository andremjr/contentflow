import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execute } from "./handler.mjs";

const workspace = await mkdtemp(path.join(tmpdir(), "contentflow-profile-fixture-"));
const services = { getWorkspacePath: (relativePath) => path.join(workspace, relativePath) };

const configured = await execute(
  {
    invocation: { mode: "configure", action: "prepare" },
    configuration: { accountProfile: "perfil-e2e" },
  },
  services,
);
assert.equal(configured.status, "success");
assert.equal(configured.values.ready, true);

const generated = await execute(
  {
    invocation: { mode: "start" },
    configuration: { accountProfile: "perfil-e2e" },
    resolvedInstruction: "resultado do teste",
  },
  services,
);
assert.deepEqual(generated, {
  status: "success",
  values: { result: "resultado do teste" },
});
await rm(workspace, { recursive: true, force: true });
