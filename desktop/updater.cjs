const RELEASES_URL = "https://github.com/andremjr/contentflow/releases/latest";
const STATE_CHANNEL = "contentflow:updater-state";

function updaterDistribution(app, environment = process.env) {
  if (!app.isPackaged) return "development";
  return environment.PORTABLE_EXECUTABLE_DIR ? "portable" : "installer";
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code).toUpperCase() : "";

  if (
    code === "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" ||
    normalized.includes("latest.yml") ||
    normalized.includes("latest version on github") ||
    normalized.includes("404")
  ) {
    return "Nenhuma release estável de atualização está disponível no momento.";
  }
  if (
    code === "ERR_CHECKSUM_MISMATCH" ||
    normalized.includes("sha512") ||
    normalized.includes("checksum")
  ) {
    return "O arquivo recebido não passou na verificação de integridade.";
  }
  if (
    code === "ERR_UPDATER_INVALID_SIGNATURE" ||
    normalized.includes("not signed by the application owner") ||
    normalized.includes("sign verification failed")
  ) {
    return "A assinatura da atualização não pôde ser verificada.";
  }
  if (
    normalized.includes("enotfound") ||
    normalized.includes("econn") ||
    normalized.includes("network") ||
    normalized.includes("internet")
  ) {
    return "Não foi possível acessar o servidor de atualizações. Verifique sua conexão.";
  }
  return "Não foi possível concluir a atualização. Tente novamente mais tarde.";
}

function createInitialState(app, distribution) {
  if (distribution === "portable") {
    return {
      status: "unsupported",
      distribution,
      currentVersion: app.getVersion(),
      availableVersion: null,
      progress: null,
      message: "A versão portátil é atualizada baixando o instalador mais recente.",
    };
  }
  if (distribution === "development") {
    return {
      status: "unsupported",
      distribution,
      currentVersion: app.getVersion(),
      availableVersion: null,
      progress: null,
      message: "A verificação de atualizações funciona somente no aplicativo instalado.",
    };
  }
  return {
    status: "idle",
    distribution,
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    message: "Verifique se existe uma nova versão estável.",
  };
}

function configureDesktopUpdater({ app, ipcMain, shell, getWindow, updater, logger }) {
  const distribution = updaterDistribution(app);
  let state = createInitialState(app, distribution);
  let autoUpdater;
  let log;

  function broadcast() {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(STATE_CHANNEL, state);
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    broadcast();
    return state;
  }

  if (distribution === "installer") {
    autoUpdater = updater ?? require("electron-updater").autoUpdater;
    log = logger ?? require("electron-log/main");
    log.transports.file.fileName = "updates.log";
    log.transports.file.level = "info";
    log.transports.console.level = false;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on("checking-for-update", () => {
      log.info("Verificando release estável", { currentVersion: app.getVersion() });
      updateState({
        status: "checking",
        progress: null,
        message: "Procurando a versão estável mais recente…",
      });
    });
    autoUpdater.on("update-available", (info) => {
      log.info("Release estável disponível", { version: info.version });
      updateState({
        status: "available",
        availableVersion: info.version,
        progress: null,
        message: `A versão ${info.version} está disponível.`,
      });
    });
    autoUpdater.on("update-not-available", () => {
      log.info("Aplicativo já está atualizado", { currentVersion: app.getVersion() });
      updateState({
        status: "up-to-date",
        availableVersion: null,
        progress: null,
        message: "Você já está usando a versão estável mais recente.",
      });
    });
    autoUpdater.on("download-progress", (progress) => {
      updateState({
        status: "downloading",
        progress: Math.max(0, Math.min(100, Number(progress.percent.toFixed(1)))),
        message: "Baixando a atualização com verificação de integridade…",
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      log.info("Release baixada e verificada", { version: info.version });
      updateState({
        status: "downloaded",
        availableVersion: info.version,
        progress: 100,
        message: "Atualização pronta. Reinicie para concluir a instalação.",
      });
    });
    autoUpdater.on("error", (error) => {
      log.error("Falha no updater", { message: safeErrorMessage(error) });
      updateState({
        status: "error",
        progress: null,
        message: safeErrorMessage(error),
      });
    });
  }

  ipcMain.handle("contentflow:updater:get-state", () => state);
  ipcMain.handle("contentflow:updater:check", async () => {
    if (!autoUpdater) return state;
    if (["checking", "downloading", "downloaded"].includes(state.status)) return state;
    try {
      updateState({ status: "checking", progress: null, message: "Verificando atualização…" });
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log?.error("Verificação de atualização falhou", { message: safeErrorMessage(error) });
      updateState({ status: "error", progress: null, message: safeErrorMessage(error) });
    }
    return state;
  });
  ipcMain.handle("contentflow:updater:download", async () => {
    if (!autoUpdater || state.status !== "available") return state;
    try {
      updateState({ status: "downloading", progress: 0, message: "Iniciando download…" });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log?.error("Download de atualização falhou", { message: safeErrorMessage(error) });
      updateState({ status: "error", progress: null, message: safeErrorMessage(error) });
    }
    return state;
  });
  ipcMain.handle("contentflow:updater:install", () => {
    if (!autoUpdater || state.status !== "downloaded") return state;
    updateState({ status: "installing", message: "Reiniciando para instalar a atualização…" });
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return state;
  });
  ipcMain.handle("contentflow:updater:open-releases", async () => {
    await shell.openExternal(RELEASES_URL);
    return state;
  });

  return { getState: () => state };
}

module.exports = {
  RELEASES_URL,
  STATE_CHANNEL,
  configureDesktopUpdater,
  createInitialState,
  safeErrorMessage,
  updaterDistribution,
};
