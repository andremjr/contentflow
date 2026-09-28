import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("clientes e diagnósticos compartilhados da Browser Bridge derivam da fonte canônica", () => {
  const result = spawnSync(process.execPath, ["scripts/sync-browser-bridge-sdk.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
