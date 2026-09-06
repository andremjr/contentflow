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
  }),
);
