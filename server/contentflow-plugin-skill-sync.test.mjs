import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("a cópia local da skill deriva da fonte canônica do ecossistema", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/sync-contentflow-plugin-skill.mjs", "--check"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
