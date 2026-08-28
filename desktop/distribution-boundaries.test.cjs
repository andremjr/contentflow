const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const desktopMain = readFileSync(path.join(__dirname, "main.cjs"), "utf8");

test("a distribuição do núcleo não incorpora plugins de referência", () => {
  const packagedSources = [
    ...(packageJson.build.files ?? []),
    ...(packageJson.build.extraResources ?? []),
  ].map((entry) => (typeof entry === "string" ? entry : entry.from));

  assert.equal(
    packagedSources.some((source) => /ecosystem[\\/]plugins|plugins[\\/]reference/i.test(source)),
    false,
  );
  assert.match(
    desktopMain,
    /CONTENTFLOW_INSTALLED_PLUGINS_DIR\s*=\s*path\.join\(dataRoot,\s*"plugins",\s*"installed"\)/,
  );
});

test("atualizações preservam plugins, mas o instalador não os fornece", () => {
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(packageJson.build.files.includes("ecosystem/plugins/reference/**/*"), false);
});
