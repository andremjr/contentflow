const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync, readdirSync, rmSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("a release do aplicativo fornece todos os downloads da interface sem republicar plugins", () => {
  const relative = `release/test-app-assets-${process.pid}`;
  const output = path.resolve(root, relative);
  assert.equal(path.dirname(output), path.join(root, "release"));
  try {
    const packaged = spawnSync(
      process.execPath,
      ["scripts/package-ecosystem.mjs", relative, "--app-only"],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(packaged.status, 0, packaged.stderr);
    const names = readdirSync(output).sort();
    assert.deepEqual(names, [
      "ContentFlow-Browser-Bridge.zip",
      "ContentFlow-Skill-Method-Development.zip",
      "ContentFlow-Skill-Plugin-Development.zip",
    ]);
    const links = readFileSync(path.join(root, "src/lib/ecosystem-downloads.ts"), "utf8");
    for (const name of names) assert.ok(links.includes(name), name);
    const verified = spawnSync("python", ["scripts/verify-release-assets-test.py", output], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(verified.status, 0, verified.stderr);
  } finally {
    rmSync(output, { recursive: true, force: true, maxRetries: 3 });
  }
});
