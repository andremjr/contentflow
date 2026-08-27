const PLUGIN_ID = "local.contentflow.google-flow-batch-images";
const PROTOCOL_VERSION = 2;
const FLOW_ORIGIN = "https://labs.google";
const COMMAND_CACHE_KEY = "contentflowCommandCacheV2";
const MAX_COMMAND_CACHE = 500;
const ALLOWED_ACTIONS = new Set(["ping", "inspect", "setPrompt", "clickGenerate"]);
const inFlight = new Map();
let activeSession = null;

function bridgeError(code, message) {
  return { ok: false, code, message };
}

function identity() {
  return {
    pluginId: PLUGIN_ID,
    protocolVersion: PROTOCOL_VERSION,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}

function selectFlowTab(tabs, expectedUrl) {
  const expected = new URL(expectedUrl);
  if (expected.origin !== FLOW_ORIGIN) return null;
  const candidates = tabs.filter((tab) => {
    try {
      const url = new URL(tab.url || "");
      return url.origin === FLOW_ORIGIN && url.pathname.includes("/tools/flow");
    } catch {
      return false;
    }
  });
  return (
    candidates.find((tab) => tab.url === expectedUrl) ||
    candidates.find((tab) => {
      try {
        return new URL(tab.url || "").pathname === expected.pathname;
      } catch {
        return false;
      }
    }) ||
    null
  );
}

async function readCommandCache() {
  const stored = await chrome.storage.session.get(COMMAND_CACHE_KEY);
  const cache = stored?.[COMMAND_CACHE_KEY];
  return cache && typeof cache === "object" ? cache : {};
}

async function cacheResponse(command, response) {
  const cache = await readCommandCache();
  const now = Date.now();
  const entries = Object.entries(cache)
    .filter(([, value]) => Number(value?.expiresAt) > now)
    .sort((a, b) => Number(a[1]?.storedAt) - Number(b[1]?.storedAt));
  while (entries.length >= MAX_COMMAND_CACHE) entries.shift();
  const entry = {
    executionKey: command.executionKey,
    response,
    storedAt: now,
    expiresAt: now + 12 * 60 * 60 * 1000,
  };
  entries.push([command.commandId, entry]);
  await chrome.storage.session.set({ [COMMAND_CACHE_KEY]: Object.fromEntries(entries) });
}

function validateSession(command) {
  if (!activeSession || command?.sessionToken !== activeSession.sessionToken) {
    return bridgeError(
      "SESSION_MISMATCH",
      "A sessão efêmera da extensão não corresponde à execução.",
    );
  }
  if (command.pluginId !== PLUGIN_ID || command.protocolVersion !== PROTOCOL_VERSION) {
    return bridgeError("PROTOCOL_MISMATCH", "Plugin ou versão de protocolo incompatível.");
  }
  if (command.profileId !== activeSession.profileId) {
    return bridgeError("PROFILE_MISMATCH", "O comando pertence a outro perfil dedicado.");
  }
  if (typeof command.executionKey !== "string" || command.executionKey.length < 16) {
    return bridgeError("INVALID_COMMAND", "executionKey ausente ou inválida.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(command.commandId || ""))) {
    return bridgeError("INVALID_COMMAND", "commandId ausente ou inválido.");
  }
  if (!ALLOWED_ACTIONS.has(command.action)) {
    return bridgeError("UNKNOWN_ACTION", `Ação não suportada: ${String(command.action)}`);
  }
  const now = Date.now();
  if (!Number.isFinite(command.issuedAt) || !Number.isFinite(command.expiresAt)) {
    return bridgeError("INVALID_COMMAND", "Janela temporal do comando ausente.");
  }
  if (
    command.issuedAt > now + 5000 ||
    command.expiresAt <= now ||
    command.expiresAt - now > 120000
  ) {
    return bridgeError("COMMAND_EXPIRED", "O comando expirou antes de chegar à extensão.");
  }
  return null;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => resolve(bridgeError("COMMAND_TIMEOUT", "A página não respondeu ao comando.")),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function dispatchToPage(command) {
  let expectedUrl;
  try {
    expectedUrl = new URL(command.expectedUrl);
  } catch {
    return bridgeError("INVALID_COMMAND", "expectedUrl inválida.");
  }
  if (expectedUrl.origin !== FLOW_ORIGIN) {
    return bridgeError("ORIGIN_NOT_ALLOWED", "A extensão aceita somente páginas do Google Flow.");
  }

  const cache = await readCommandCache();
  const cached = cache[command.commandId];
  if (
    cached?.executionKey === command.executionKey &&
    Number(cached.expiresAt) > Date.now() &&
    cached.response
  ) {
    return { ...cached.response, replayed: true };
  }

  const tabs = await chrome.tabs.query({ url: `${FLOW_ORIGIN}/*` });
  const tab = selectFlowTab(tabs, expectedUrl.toString());
  if (!Number.isInteger(tab?.id)) {
    return bridgeError(
      "FLOW_TAB_NOT_FOUND",
      "A aba exata do Google Flow não foi encontrada no perfil dedicado.",
    );
  }

  const timeoutMs = Math.max(1000, Math.min(30000, command.expiresAt - Date.now()));
  try {
    const response = await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        source: "contentflow-os",
        pluginId: PLUGIN_ID,
        protocolVersion: PROTOCOL_VERSION,
        profileId: command.profileId,
        executionKey: command.executionKey,
        commandId: command.commandId,
        action: command.action,
        payload: command.payload || {},
      }),
      timeoutMs,
    );
    const normalized =
      response && typeof response === "object"
        ? response
        : bridgeError("INVALID_RESPONSE", "A página retornou uma resposta inválida.");
    if (normalized.code !== "COMMAND_TIMEOUT") await cacheResponse(command, normalized);
    return normalized;
  } catch (error) {
    return bridgeError(
      "CONTENT_SCRIPT_UNAVAILABLE",
      `A ponte da página não respondeu: ${error?.message || String(error)}`,
    );
  }
}

globalThis.contentFlowBridge = Object.freeze({
  identity: identity(),
  connect(handshake) {
    if (
      handshake?.pluginId !== PLUGIN_ID ||
      handshake?.protocolVersion !== PROTOCOL_VERSION ||
      typeof handshake?.profileId !== "string" ||
      !/^[a-f0-9-]{32,64}$/i.test(String(handshake?.sessionToken || ""))
    ) {
      return bridgeError("HANDSHAKE_REJECTED", "Handshake da extensão inválido.");
    }
    activeSession = {
      profileId: handshake.profileId,
      sessionToken: handshake.sessionToken,
      connectedAt: Date.now(),
    };
    return { ok: true, ...identity() };
  },
  async dispatch(command) {
    const invalid = validateSession(command);
    if (invalid) return invalid;
    if (inFlight.has(command.commandId)) return await inFlight.get(command.commandId);
    const operation = dispatchToPage(command).finally(() => inFlight.delete(command.commandId));
    inFlight.set(command.commandId, operation);
    return await operation;
  },
  async cancel(request) {
    if (
      !activeSession ||
      request?.sessionToken !== activeSession.sessionToken ||
      request?.profileId !== activeSession.profileId ||
      typeof request?.executionKey !== "string"
    ) {
      return bridgeError("SESSION_MISMATCH", "Cancelamento recusado pela extensão.");
    }
    const tabs = await chrome.tabs.query({ url: `${FLOW_ORIGIN}/*` });
    await Promise.allSettled(
      tabs
        .filter((tab) => Number.isInteger(tab.id))
        .map((tab) =>
          chrome.tabs.sendMessage(tab.id, {
            source: "contentflow-os",
            pluginId: PLUGIN_ID,
            protocolVersion: PROTOCOL_VERSION,
            profileId: request.profileId,
            executionKey: request.executionKey,
            commandId: request.commandId,
            action: "cancel",
            payload: {},
          }),
        ),
    );
    return { ok: true };
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.source === "contentflow-flow-page" && message?.action === "wake") {
    sendResponse({ ok: true, ...identity() });
  }
  return false;
});
