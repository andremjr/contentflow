const { contextBridge, ipcRenderer } = require("electron");

const STATE_CHANNEL = "contentflow:updater-state";

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
  }),
);
