const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { createServer, request: httpRequest } = require("node:http");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, statSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { configureDesktopUpdater } = require("./updater.cjs");

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow;
let webServer;
let apiProcess;
let quitting = false;

app.setName("ContentFlow");
app.setAppUserModelId("com.contentflow.app");

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
    stdio: ["ignore", "pipe", "pipe"],
  });
  let apiError = "";
  apiProcess.stderr.on("data", (chunk) => {
    apiError = `${apiError}${chunk.toString("utf8")}`.slice(-12_000);
  });
  apiProcess.once("exit", (code) => {
    if (code && !quitting) {
      dialog.showErrorBox("A API local foi encerrada", apiError || `Código de saída: ${code}`);
      app.quit();
    }
  });
  await waitForApi(apiPort);

  const webPort = await startWebServer(appRoot, apiPort);
  const windowIcon = path.join(appRoot, "build", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    title: "ContentFlow",
    icon: windowIcon,
    backgroundColor: "#08111f",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  const appOrigin = `http://127.0.0.1:${webPort}`;
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
  await mainWindow.loadURL(`${appOrigin}/dashboard`);
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
        outgoing.end(readFileSync(staticPath));
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

async function waitForApi(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
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
