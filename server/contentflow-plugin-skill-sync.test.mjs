import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const skills = [
  "development-contentflow",
  "contentflow-method-development",
  "contentflow-plugin-development",
];

test("as skills oficiais existem, têm metadata e apontam para contratos vivos", async () => {
  for (const skill of skills) {
    const canonical = `ecosystem/skills/${skill}/SKILL.md`;
    const local = `.agents/skills/${skill}/SKILL.md`;
    const boundaries = `ecosystem/skills/${skill}/references/${skill === "development-contentflow" ? "architecture-map.md" : "layer-boundaries.md"}`;
    await access(canonical);
    await access(local);
    await access(boundaries);
    const contents = await readFile(canonical, "utf8");
    assert.match(contents, new RegExp(`name: ${skill}`));
    assert.match(contents, /docs\/ARCHITECTURE\.md/);
    if (skill === "contentflow-method-development") {
      assert.match(contents, /Desenho estratégico e granularidade dos Blocos/);
      assert.match(contents, /gerar imagens e depois animá-las/i);
    }
  }
});

test("as cópias locais derivam das fontes canônicas", () => {
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
