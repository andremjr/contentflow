const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const desktopMain = readFileSync(path.join(__dirname, "main.cjs"), "utf8");
const desktopPreload = readFileSync(path.join(__dirname, "preload.cjs"), "utf8");

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

test("o Electron inicia fechado, isolado e sem bloquear no stdout da API", () => {
  assert.match(desktopMain, /show:\s*false/);
  assert.match(desktopMain, /contextIsolation:\s*true/);
  assert.match(desktopMain, /nodeIntegration:\s*false/);
  assert.match(desktopMain, /sandbox:\s*true/);
  assert.match(desktopMain, /stdio:\s*\["ignore",\s*"ignore",\s*"pipe"\]/);
  assert.match(desktopMain, /ready-to-show/);
});

test("a API inesperadamente encerrada também fecha o Electron quando retorna código zero", () => {
  assert.match(desktopMain, /if\s*\(!quitting\s*&&\s*apiReady\)/);
  assert.doesNotMatch(desktopMain, /if\s*\(code\s*&&\s*!quitting\)/);
});

test("pendências humanas atualizam badge e notificações pelo preload isolado", () => {
  assert.match(desktopMain, /setOverlayIcon/);
  assert.match(desktopMain, /new Notification/);
  assert.match(desktopMain, /notification\.on\("click"/);
  assert.match(desktopPreload, /humanTasks:\s*Object\.freeze/);
  assert.match(desktopPreload, /ipcRenderer\.send\(HUMAN_TASKS_UPDATE_CHANNEL/);
  assert.doesNotMatch(desktopPreload, /contextBridge\.exposeInMainWorld\([^)]*ipcRenderer/s);
});
