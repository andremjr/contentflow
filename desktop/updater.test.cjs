const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  RELEASES_URL,
  configureDesktopUpdater,
  createInitialState,
  safeErrorMessage,
  updaterDistribution,
} = require("./updater.cjs");

const app = { isPackaged: true, getVersion: () => "0.4.2" };

test("diferencia instalador, portátil e desenvolvimento", () => {
  assert.equal(updaterDistribution(app, {}), "installer");
  assert.equal(updaterDistribution(app, { PORTABLE_EXECUTABLE_DIR: "C:\\Portable" }), "portable");
  assert.equal(updaterDistribution({ ...app, isPackaged: false }, {}), "development");
});

test("estado inicial do instalador permite verificação manual", () => {
  assert.deepEqual(createInitialState(app, "installer"), {
    status: "idle",
    distribution: "installer",
    currentVersion: "0.4.2",
    availableVersion: null,
    progress: null,
    message: "Verifique se existe uma nova versão estável.",
  });
});

test("erros técnicos são apresentados sem URL ou caminho interno", () => {
  assert.match(safeErrorMessage(new Error("GET latest.yml returned 404")), /release estável/);
  assert.match(safeErrorMessage(new Error("sha512 checksum mismatch C:\\secret")), /integridade/);
  assert.match(safeErrorMessage(new Error("ENOTFOUND github.com")), /conexão/);
  assert.doesNotMatch(safeErrorMessage(new Error("C:\\Users\\aluno\\arquivo")), /Users/);

  const latestReleaseError = Object.assign(
    new Error("HttpError 404; response header x-cache-signature was present"),
    { code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" },
  );
  assert.match(safeErrorMessage(latestReleaseError), /release estável/);
  assert.doesNotMatch(safeErrorMessage(latestReleaseError), /assinatura/);

  const signatureError = Object.assign(
    new Error("New version is not signed by the application owner"),
    {
      code: "ERR_UPDATER_INVALID_SIGNATURE",
    },
  );
  assert.match(safeErrorMessage(signatureError), /assinatura/);
});

test("percorre o fluxo IPC de verificar, baixar e instalar", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const updater = new EventEmitter();
  let checks = 0;
  let downloads = 0;
  let installs = 0;
  updater.checkForUpdates = async () => {
    checks += 1;
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.5.0" });
  };
  updater.downloadUpdate = async () => {
    downloads += 1;
    updater.emit("download-progress", { percent: 48.36 });
    updater.emit("update-downloaded", { version: "0.5.0" });
  };
  updater.quitAndInstall = () => {
    installs += 1;
  };
  const log = {
    transports: { file: {}, console: {} },
    info() {},
    error() {},
  };
  const opened = [];
  const shell = {
    async openExternal(url) {
      opened.push(url);
    },
  };
  const sent = [];
  const getWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: (...args) => sent.push(args) },
  });

  const controller = configureDesktopUpdater({
    app,
    ipcMain,
    shell,
    getWindow,
    updater,
    logger: log,
  });

  await handlers.get("contentflow:updater:check")();
  assert.equal(checks, 1);
  assert.equal(controller.getState().status, "available");
  assert.equal(controller.getState().availableVersion, "0.5.0");

  await handlers.get("contentflow:updater:download")();
  assert.equal(downloads, 1);
  assert.equal(controller.getState().status, "downloaded");
  assert.equal(controller.getState().progress, 100);
  assert.ok(sent.some(([, state]) => state.status === "downloading" && state.progress === 48.4));

  handlers.get("contentflow:updater:install")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(installs, 1);
  assert.equal(controller.getState().status, "installing");

  await handlers.get("contentflow:updater:open-releases")();
  assert.deepEqual(opened, [RELEASES_URL]);
});
