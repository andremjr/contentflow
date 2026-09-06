const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  shell,
} = require("electron");
const { createServer, request: httpRequest } = require("node:http");
const { spawn } = require("node:child_process");
const { existsSync, statSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { configureDesktopUpdater } = require("./updater.cjs");

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow;
let webServer;
let apiProcess;
let appOrigin;
let notificationIcon;
let quitting = false;
const staticAssetCache = new Map();
const notifiedHumanTasks = new Set();
const HUMAN_TASKS_UPDATE_CHANNEL = "contentflow:human-tasks-update";
const HUMAN_TASKS_NAVIGATE_CHANNEL = "contentflow:human-tasks-navigate";
const HUMAN_TASK_ROUTE =
  /^\/project\/[^/]+\/(theme|title|thumbnail|script|narration|assets|edit|publish)$/;

app.setName("ContentFlow");
app.setAppUserModelId("com.contentflow.app");
if (process.env.CONTENTFLOW_ELECTRON_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.CONTENTFLOW_ELECTRON_USER_DATA_DIR));
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app
  .whenReady()
  .then(startDesktop)
  .catch((error) => {
    dialog.showErrorBox(
      "O ContentFlow não conseguiu iniciar",
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  webServer?.close();
  webServer?.closeAllConnections?.();
  apiProcess?.kill();
});

async function startDesktop() {
  const appRoot = app.getAppPath();
  const resourcesRoot = app.isPackaged ? process.resourcesPath : path.resolve(appRoot);
  const runtimeRoot = app.isPackaged
    ? path.join(resourcesRoot, "runtime")
    : path.join(appRoot, "desktop-runtime");
  const dataRoot = path.join(app.getPath("userData"), "data");
  const apiPort = await reservePort();

  process.env.CONTENTFLOW_API_PORT = String(apiPort);
  process.env.CONTENTFLOW_APP_ROOT = resourcesRoot;
  process.env.CONTENTFLOW_DATA_DIR = dataRoot;
  process.env.CONTENTFLOW_LOCAL_PLUGINS_DIR = path.join(dataRoot, "plugins", "local");
  process.env.CONTENTFLOW_INSTALLED_PLUGINS_DIR = path.join(dataRoot, "plugins", "installed");
  process.env.CONTENTFLOW_DEVELOPMENT_LINKS_DIR = path.join(dataRoot, "plugins", "development");
  process.env.CONTENTFLOW_PLUGIN_WORKER_DIR = app.isPackaged
    ? path.join(runtimeRoot, "workers")
    : path.join(appRoot, "server");
  process.env.CONTENTFLOW_PLUGIN_NODE_EXECUTABLE = path.join(runtimeRoot, "node.exe");
  process.env.CONTENTFLOW_PLUGIN_NODE_MAJOR = "26";
  process.env.NODE_ENV = "production";

  const apiEntry = path.join(appRoot, "desktop-dist", "api.mjs");
  apiProcess = spawn(process.env.CONTENTFLOW_PLUGIN_NODE_EXECUTABLE, [apiEntry], {
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let apiError = "";
  let apiLaunchError;
  let apiReady = false;
  apiProcess.stderr.on("data", (chunk) => {
    apiError = `${apiError}${chunk.toString("utf8")}`.slice(-12_000);
  });
  apiProcess.once("error", (error) => {
    apiLaunchError = error;
  });
  apiProcess.once("exit", (code) => {
    if (!quitting && apiReady) {
      dialog.showErrorBox(
        "A API local foi encerrada",
        apiError || `Código de saída: ${code ?? "desconhecido"}`,
      );
      app.quit();
    }
  });
  await waitForApi(
    apiPort,
    () => apiLaunchError,
    () => apiProcess?.exitCode,
    () => apiError,
  );
  apiReady = true;

  const webPort = await startWebServer(appRoot, apiPort);
  const windowIcon = path.join(appRoot, "build", "icon.png");
  notificationIcon = windowIcon;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    title: "ContentFlow",
    icon: windowIcon,
    backgroundColor: "#08111f",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  appOrigin = `http://127.0.0.1:${webPort}`;
  configureHumanTaskNotifications();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === appOrigin || url.startsWith(`${appOrigin}/`)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });
  configureDesktopUpdater({ app, ipcMain, shell, getWindow: () => mainWindow });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(`${appOrigin}/dashboard`);
  if (!mainWindow.isVisible()) mainWindow.show();
}

function configureHumanTaskNotifications() {
  ipcMain.on(HUMAN_TASKS_UPDATE_CHANNEL, (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    const tasks = Array.isArray(input?.tasks)
      ? input.tasks.map(validHumanTask).filter(Boolean)
      : [];
    const count = Math.min(999, tasks.length);
    const currentIds = new Set(tasks.map((task) => task.id));

    for (const id of notifiedHumanTasks) {
      if (!currentIds.has(id)) notifiedHumanTasks.delete(id);
    }
    setHumanTaskBadge(count);

    for (const task of tasks) {
      if (notifiedHumanTasks.has(task.id)) continue;
      notifiedHumanTasks.add(task.id);
      notifyHumanTask(task, {
        sound: input?.notificationSound === true,
        system: input?.systemNotifications === true,
      });
    }
  });
}

function validHumanTask(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.route !== "string" ||
    !HUMAN_TASK_ROUTE.test(value.route)
  ) {
    return undefined;
  }
  return {
    id: value.id.slice(0, 200),
    title: value.title.slice(0, 120),
    body: value.body.slice(0, 300),
    route: value.route,
  };
}

function setHumanTaskBadge(count) {
  if (!mainWindow) return;
  const description =
    count === 0
      ? "Nenhuma validação pendente"
      : `${count} ${count === 1 ? "validação pendente" : "validações pendentes"}`;
  if (process.platform === "win32") {
    mainWindow.setOverlayIcon(count > 0 ? createBadgeIcon(count) : null, description);
    return;
  }
  app.setBadgeCount(count);
}

function createBadgeIcon(count) {
  const label = count > 99 ? "99+" : String(count);
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    bitmap[offset] = color[2];
    bitmap[offset + 1] = color[1];
    bitmap[offset + 2] = color[0];
    bitmap[offset + 3] = color[3];
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - 15.5, y - 15.5);
      if (distance <= 15) setPixel(x, y, [17, 24, 39, 255]);
      if (distance <= 13) setPixel(x, y, [245, 158, 11, 255]);
    }
  }

  const glyphs = {
    0: ["111", "101", "101", "101", "111"],
    1: ["010", "110", "010", "010", "111"],
    2: ["111", "001", "111", "100", "111"],
    3: ["111", "001", "111", "001", "111"],
    4: ["101", "101", "111", "001", "001"],
    5: ["111", "100", "111", "001", "111"],
    6: ["111", "100", "111", "101", "111"],
    7: ["111", "001", "010", "010", "010"],
    8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "111"],
    "+": ["000", "010", "111", "010", "000"],
  };
  const scale = label.length === 1 ? 4 : label.length === 2 ? 3 : 2;
  const glyphWidth = 3 * scale;
  const spacing = scale;
  const textWidth = label.length * glyphWidth + (label.length - 1) * spacing;
  const startX = Math.floor((size - textWidth) / 2);
  const startY = Math.floor((size - 5 * scale) / 2);
  [...label].forEach((character, characterIndex) => {
    glyphs[character].forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel !== "1") return;
        for (let offsetY = 0; offsetY < scale; offsetY += 1) {
          for (let offsetX = 0; offsetX < scale; offsetX += 1) {
            setPixel(
              startX + characterIndex * (glyphWidth + spacing) + columnIndex * scale + offsetX,
              startY + rowIndex * scale + offsetY,
              [17, 24, 39, 255],
            );
          }
        }
      });
    });
  });
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 2 });
}

function notifyHumanTask(task, preferences) {
  if (!preferences.system) {
    if (preferences.sound) shell.beep();
    return;
  }
  if (!Notification.isSupported()) {
    if (preferences.sound) shell.beep();
    return;
  }
  const notification = new Notification({
    title: task.title,
    body: task.body,
    icon: notificationIcon,
    silent: !preferences.sound,
  });
  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send(HUMAN_TASKS_NAVIGATE_CHANNEL, task.route);
  });
  notification.show();
}

async function startWebServer(appRoot, apiPort) {
  const clientRoot = path.join(appRoot, "dist", "client");
  const serverEntry = await import(
    pathToFileURL(path.join(appRoot, "dist", "server", "server.js")).href
  );
  webServer = createServer(async (incoming, outgoing) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname.startsWith("/api/")) {
        proxyApi(incoming, outgoing, apiPort);
        return;
      }
      const staticPath = safeStaticPath(clientRoot, requestUrl.pathname);
      if (staticPath) {
        outgoing.statusCode = 200;
        outgoing.setHeader("content-type", mimeType(staticPath));
        let body = staticAssetCache.get(staticPath);
        if (!body) {
          body = await readFile(staticPath);
          staticAssetCache.set(staticPath, body);
        }
        outgoing.end(body);
        return;
      }
      const body = await readRequestBody(incoming);
      const response = await serverEntry.default.fetch(
        new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
          method: incoming.method,
          headers: incoming.headers,
          body: body.length ? body : undefined,
        }),
        {},
        {},
      );
      outgoing.statusCode = response.status;
      for (const [key, value] of response.headers) outgoing.setHeader(key, value);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    webServer.once("error", reject);
    webServer.listen(0, "127.0.0.1", resolve);
  });
  const address = webServer.address();
  if (!address || typeof address === "string") throw new Error("Porta visual indisponível.");
  return address.port;
}

function proxyApi(incoming, outgoing, apiPort) {
  const proxied = httpRequest(
    {
      hostname: "127.0.0.1",
      port: apiPort,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    },
    (apiResponse) => {
      outgoing.writeHead(apiResponse.statusCode ?? 502, apiResponse.headers);
      apiResponse.pipe(outgoing);
    },
  );
  proxied.on("error", (error) => {
    outgoing.statusCode = 502;
    outgoing.end(error.message);
  });
  incoming.pipe(proxied);
}

function safeStaticPath(clientRoot, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative || relative.includes("..")) return undefined;
  const candidate = path.resolve(clientRoot, relative);
  if (!candidate.startsWith(`${path.resolve(clientRoot)}${path.sep}`)) return undefined;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return undefined;
  return candidate;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".woff2": "font/woff2",
    }[extension] ?? "application/octet-stream"
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Não foi possível reservar uma porta local."));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForApi(port, getLaunchError, getExitCode, getStderr) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const launchError = getLaunchError?.();
    if (launchError) throw launchError;
    const exitCode = getExitCode?.();
    if (exitCode !== null && exitCode !== undefined) {
      throw new Error(getStderr?.() || `A API local encerrou com código ${exitCode}.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/preferences`);
      if (response.ok) return;
    } catch {
      // A importação da API ainda está inicializando o banco e os módulos nativos.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API local não iniciou dentro do prazo esperado.");
}
