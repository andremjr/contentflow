const { contextBridge, ipcRenderer } = require("electron");

const STATE_CHANNEL = "contentflow:updater-state";
const HUMAN_TASKS_UPDATE_CHANNEL = "contentflow:human-tasks-update";
const HUMAN_TASKS_NAVIGATE_CHANNEL = "contentflow:human-tasks-navigate";

contextBridge.exposeInMainWorld(
  "contentflowDesktop",
  Object.freeze({
    updater: Object.freeze({
      getState: () => ipcRenderer.invoke("contentflow:updater:get-state"),
      check: () => ipcRenderer.invoke("contentflow:updater:check"),
      download: () => ipcRenderer.invoke("contentflow:updater:download"),
      install: () => ipcRenderer.invoke("contentflow:updater:install"),
      openReleases: () => ipcRenderer.invoke("contentflow:updater:open-releases"),
      subscribe: (callback) => {
        if (typeof callback !== "function") return () => {};
        const listener = (_event, state) => callback(state);
        ipcRenderer.on(STATE_CHANNEL, listener);
        return () => ipcRenderer.removeListener(STATE_CHANNEL, listener);
      },
    }),
    humanTasks: Object.freeze({
      update: (input) => ipcRenderer.send(HUMAN_TASKS_UPDATE_CHANNEL, input),
      subscribeNavigation: (callback) => {
        if (typeof callback !== "function") return () => {};
        const listener = (_event, route) => callback(route);
        ipcRenderer.on(HUMAN_TASKS_NAVIGATE_CHANNEL, listener);
        return () => ipcRenderer.removeListener(HUMAN_TASKS_NAVIGATE_CHANNEL, listener);
      },
    }),
    diagnostics: Object.freeze({
      openFolder: () => ipcRenderer.invoke("contentflow:diagnostics:open"),
      export: () => ipcRenderer.invoke("contentflow:diagnostics:export"),
    }),
  }),
);

function reportInterfaceError(code, error, filename, line, column) {
  const source = String(filename ?? error?.stack ?? "")
    .slice(0, 8000)
    .match(/((?:assets|src)\/[a-zA-Z0-9_/-]+\.(?:js|tsx?))(?::(\d+):(\d+))?/);
  const message = String(error?.message ?? "").slice(0, 2000);
  const errorKind = /Cannot (?:read|set) properties of (?:undefined|null)/.test(message)
    ? "UNDEFINED_ACCESS"
    : /is not a function/.test(message)
      ? "NOT_CALLABLE"
      : /^(Failed to fetch|NetworkError when attempting to fetch resource\.)$/.test(message)
        ? "NETWORK_UNAVAILABLE"
        : message.startsWith("Este conteúdo precisa de migração antes de editar ou executar.")
          ? "MIGRATION_REQUIRED"
          : undefined;
  ipcRenderer.send("contentflow:diagnostics:record", {
    code,
    errorType: error?.name,
    errorKind,
    ...(source
      ? {
          location: source[1],
          line: line ?? Number(source[2]),
          column: column ?? Number(source[3]),
        }
      : {}),
  });
}
window.addEventListener("error", (event) =>
  reportInterfaceError("UI_ERROR", event.error, event.filename, event.lineno, event.colno),
);
window.addEventListener("unhandledrejection", (event) =>
  reportInterfaceError("UI_REJECTION", event.reason),
);
