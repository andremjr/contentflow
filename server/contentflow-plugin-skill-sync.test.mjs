import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const skills = ["contentflow-method-development", "contentflow-plugin-development"];

test("as duas skills oficiais existem, têm metadata e apontam para contratos vivos", async () => {
  for (const skill of skills) {
    const canonical = `ecosystem/skills/${skill}/SKILL.md`;
    const local = `.agents/skills/${skill}/SKILL.md`;
    await access(canonical);
    await access(local);
    const contents = await readFile(canonical, "utf8");
    assert.match(contents, new RegExp(`name: ${skill}`));
    assert.match(contents, /docs\/ARCHITECTURE\.md/);
  }
});

test("as cópias locais derivam das duas fontes canônicas", () => {
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
