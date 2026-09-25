const BRIDGE_ID = "com.contentflow.browser-bridge";
const FLOW_PLUGIN_ID = "local.contentflow.google-flow-batch-images";
const VIBES_PLUGIN_ID = "local.contentflow.vibes-browser-studio";
const PROTOCOL_VERSION = 2;
const COMMAND_CACHE_KEY = "contentflowCommandCacheV2";
const CANCELLED_EXECUTIONS_KEY = "contentflowCancelledExecutionsV2";
const LEASES_KEY = "contentflowLeasesV1";
const LEASE_ALARM = "contentflow-lease-cleanup";
const MAX_COMMAND_CACHE = 500;
const CDP_VERSION = "1.3";
const DEFAULT_LEASE_TTL_MS = 60_000;
const MAX_LEASE_TTL_MS = 5 * 60_000;
const MAX_UPLOAD_FILES = 8;
const MAX_UPLOAD_PATH_LENGTH = 1024;
const COMMON_ACTIONS = new Set(["ping", "inspect", "setText", "pressEnter", "click"]);
const policy = (origins, tabPatterns, options = {}) =>
  Object.freeze({
    origins: new Set(origins),
    tabPatterns,
    requiredPath: options.requiredPath || "",
    pathPattern: options.pathPattern || null,
    actions: new Set([...(options.actions || []), ...COMMON_ACTIONS]),
  });
const PLUGIN_POLICIES = Object.freeze({
  "local.contentflow.chatgpt-browser-studio": policy(
    ["https://chatgpt.com"],
    ["https://chatgpt.com/*"],
  ),
  "local.contentflow.claude-browser-text": policy(["https://claude.ai"], ["https://claude.ai/*"]),
  "local.contentflow.gemini-browser-studio": policy(
    ["https://gemini.google.com"],
    ["https://gemini.google.com/*"],
  ),
  [FLOW_PLUGIN_ID]: policy(
    ["https://flow.google.com", "https://labs.google"],
    ["https://flow.google.com/*", "https://labs.google/*"],
    {
      requiredPath: "/",
      actions: ["setPrompt", "clickGenerate"],
    },
  ),
  "local.contentflow.grok-browser-studio": policy(["https://grok.com"], ["https://grok.com/*"]),
  "local.contentflow.meta-ai-browser-studio": policy(
    ["https://meta.ai", "https://www.meta.ai"],
    ["https://meta.ai/*", "https://www.meta.ai/*"],
  ),
  "local.contentflow.mai-playground-browser": policy(
    ["https://playground.microsoft.ai"],
    ["https://playground.microsoft.ai/*"],
  ),
  [VIBES_PLUGIN_ID]: policy(["https://vibes.ai"], ["https://vibes.ai/*"], {
    pathPattern: /^\/projects\/[A-Za-z0-9_-]+\/?$/,
    actions: ["setFiles", "leaseAcquire", "leaseRenew", "leaseRelease"],
  }),
});
const inFlight = new Map();
const tabQueues = new Map();
const activeSessions = new Map();
const debuggerSessionsByTab = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 128;

function bridgeError(code, message) {
  return { ok: false, code, message };
}

function identity() {
  return {
    bridgeId: BRIDGE_ID,
    protocolVersion: PROTOCOL_VERSION,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}

function policyForPlugin(pluginId) {
  return PLUGIN_POLICIES[pluginId] || null;
}

function pathAllowed(url, pluginPolicy) {
  return (
    pluginPolicy.origins.has(url.origin) &&
    url.pathname.includes(pluginPolicy.requiredPath) &&
    (!pluginPolicy.pathPattern || pluginPolicy.pathPattern.test(url.pathname))
  );
}

function selectPluginTab(tabs, expectedUrl, policy) {
  const expected = new URL(expectedUrl);
  if (!policy.origins.has(expected.origin)) return null;
  const candidates = tabs.filter((tab) => {
    try {
      const url = new URL(tab.url || "");
      return pathAllowed(url, policy);
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
    pluginId: command.pluginId,
    profileId: command.profileId,
    executionKey: command.executionKey,
    response,
    storedAt: now,
    expiresAt: now + 12 * 60 * 60 * 1000,
  };
  entries.push([command.commandId, entry]);
  await chrome.storage.session.set({ [COMMAND_CACHE_KEY]: Object.fromEntries(entries) });
}

function cancellationKey(pluginId, profileId, executionKey) {
  return `${pluginId}:${profileId}:${executionKey}`;
}

async function markExecutionCancelled(session, executionKey) {
  const stored = await chrome.storage.session.get(CANCELLED_EXECUTIONS_KEY);
  const now = Date.now();
  const cancellations = Object.fromEntries(
    Object.entries(stored?.[CANCELLED_EXECUTIONS_KEY] || {}).filter(
      ([, expiresAt]) => Number(expiresAt) > now,
    ),
  );
  cancellations[cancellationKey(session.pluginId, session.profileId, executionKey)] =
    now + 12 * 60 * 60 * 1000;
  await chrome.storage.session.set({ [CANCELLED_EXECUTIONS_KEY]: cancellations });
}

async function isExecutionCancelled(command) {
  const stored = await chrome.storage.session.get(CANCELLED_EXECUTIONS_KEY);
  return (
    Number(
      stored?.[CANCELLED_EXECUTIONS_KEY]?.[
        cancellationKey(command.pluginId, command.profileId, command.executionKey)
      ],
    ) > Date.now()
  );
}

async function readLeases() {
  const stored = await chrome.storage.session.get(LEASES_KEY);
  const leases = stored?.[LEASES_KEY];
  return leases && typeof leases === "object" ? leases : {};
}

async function writeLeases(leases) {
  await chrome.storage.session.set({ [LEASES_KEY]: leases });
}

function leaseIdFor(session, executionKey) {
  return `${session.pluginId}:${session.profileId}:${executionKey}`;
}

async function setTabDiscardable(tabId, autoDiscardable) {
  try {
    await chrome.tabs.update(tabId, { autoDiscardable });
  } catch {
    // A aba pode ter sido fechada durante a liberação.
  }
}

async function releasePowerIfIdle(leases) {
  if (Object.keys(leases).length === 0) chrome.power.releaseKeepAwake();
}

async function cleanupLeases({ tabId, sessionToken, executionKey, forceExpired = false } = {}) {
  const leases = await readLeases();
  const now = Date.now();
  const releasedTabs = new Set();
  let changed = false;
  for (const [leaseId, lease] of Object.entries(leases)) {
    const expired = Number(lease?.expiresAt) <= now;
    const matches =
      (Number.isInteger(tabId) && lease?.tabId === tabId) ||
      (sessionToken && lease?.sessionToken === sessionToken) ||
      (executionKey && lease?.executionKey === executionKey);
    if ((forceExpired && expired) || matches) {
      if (Number.isInteger(lease?.tabId)) releasedTabs.add(lease.tabId);
      delete leases[leaseId];
      changed = true;
    }
  }
  if (!changed) return false;
  await writeLeases(leases);
  for (const releasedTabId of releasedTabs) {
    const stillLeased = Object.values(leases).some((lease) => lease?.tabId === releasedTabId);
    if (!stillLeased) await setTabDiscardable(releasedTabId, true);
  }
  await releasePowerIfIdle(leases);
  return true;
}

async function manageLease(tab, command, pluginPolicy) {
  const session = activeSessions.get(command.sessionToken);
  if (!session) return bridgeError("SESSION_MISMATCH", "A sessão da lease não existe.");
  const tabUrl = new URL(tab.url || "");
  if (!pathAllowed(tabUrl, pluginPolicy)) {
    await cleanupLeases({ sessionToken: session.sessionToken });
    return bridgeError("ORIGIN_NOT_ALLOWED", "A aba deixou a origem autorizada.");
  }
  const leaseId = leaseIdFor(session, command.executionKey);
  const leases = await readLeases();
  if (command.action === "leaseRelease") {
    const current = leases[leaseId];
    if (current) {
      delete leases[leaseId];
      await writeLeases(leases);
      if (!Object.values(leases).some((lease) => lease?.tabId === current.tabId)) {
        await setTabDiscardable(current.tabId, true);
      }
      await releasePowerIfIdle(leases);
    }
    return { ok: true, released: Boolean(current) };
  }

  const ttlMs = Math.max(
    20_000,
    Math.min(MAX_LEASE_TTL_MS, Number(command.payload?.ttlMs) || DEFAULT_LEASE_TTL_MS),
  );
  const current = leases[leaseId];
  if (command.action === "leaseRenew") {
    if (
      !current ||
      current.sessionToken !== session.sessionToken ||
      current.tabId !== tab.id ||
      current.origin !== tabUrl.origin ||
      Number(current.expiresAt) <= Date.now()
    ) {
      if (current) {
        delete leases[leaseId];
        await setTabDiscardable(current.tabId, true);
      }
      await writeLeases(leases);
      await releasePowerIfIdle(leases);
      return bridgeError("LEASE_NOT_FOUND", "A lease expirou ou não pertence a esta sessão.");
    }
  }

  if (current && current.tabId !== tab.id) await setTabDiscardable(current.tabId, true);

  try {
    chrome.power.requestKeepAwake("display");
    await chrome.tabs.update(tab.id, { autoDiscardable: false });
  } catch {
    delete leases[leaseId];
    await writeLeases(leases);
    await setTabDiscardable(tab.id, true);
    await releasePowerIfIdle(leases);
    return bridgeError("LEASE_UNAVAILABLE", "O Chrome não concedeu a lease solicitada.");
  }
  const expiresAt = Date.now() + ttlMs;
  leases[leaseId] = {
    pluginId: session.pluginId,
    profileId: session.profileId,
    sessionToken: session.sessionToken,
    executionKey: command.executionKey,
    tabId: tab.id,
    origin: tabUrl.origin,
    pathname: tabUrl.pathname,
    expiresAt,
  };
  await writeLeases(leases);
  return { ok: true, leaseId, expiresAt, ttlMs };
}

function validateSession(command) {
  const session = activeSessions.get(command?.sessionToken);
  const now = Date.now();
  if (!session || now - session.lastSeenAt > SESSION_TTL_MS) {
    if (session) activeSessions.delete(command.sessionToken);
    return bridgeError(
      "SESSION_MISMATCH",
      "A sessão efêmera da extensão não corresponde à execução.",
    );
  }
  if (
    command.pluginId !== session.pluginId ||
    !policyForPlugin(command.pluginId) ||
    command.protocolVersion !== PROTOCOL_VERSION
  ) {
    return bridgeError("PROTOCOL_MISMATCH", "Plugin ou versão de protocolo incompatível.");
  }
  session.lastSeenAt = now;
  if (command.profileId !== session.profileId) {
    return bridgeError("PROFILE_MISMATCH", "O comando pertence a outro perfil dedicado.");
  }
  if (typeof command.executionKey !== "string" || command.executionKey.length < 16) {
    return bridgeError("INVALID_COMMAND", "executionKey ausente ou inválida.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(command.commandId || ""))) {
    return bridgeError("INVALID_COMMAND", "commandId ausente ou inválido.");
  }
  if (!policyForPlugin(command.pluginId).actions.has(command.action)) {
    return bridgeError("UNKNOWN_ACTION", `Ação não suportada: ${String(command.action)}`);
  }
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

function enqueueTabCommand(tabId, operation) {
  const previous = tabQueues.get(tabId) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  tabQueues.set(tabId, queued);
  return queued.finally(() => {
    if (tabQueues.get(tabId) === queued) tabQueues.delete(tabId);
  });
}

function resolvePageTarget(payload, mode, shouldScroll) {
  const visible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 8 &&
      rect.height > 8
    );
  };
  const allDeep = (selector, root = document) => {
    const output = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      for (const element of node.querySelectorAll(selector)) output.push(element);
      for (const element of node.querySelectorAll("*")) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return [...new Set(output)];
  };
  const normalize = (value, fallback) => {
    const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const normalized = candidates
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 20);
    return normalized.length ? normalized : fallback;
  };
  const elementsFor = (selectors) => {
    const output = [];
    for (const selector of selectors) {
      try {
        output.push(...allDeep(selector));
      } catch {
        // Um seletor inválido nunca amplia a origem ou escolhe um alvo alternativo.
      }
    }
    return [...new Set(output)];
  };
  const textOf = (element) =>
    [
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("placeholder"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test-id"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const isEditable = (element) => {
    if (!visible(element) || element.disabled || element.readOnly) return false;
    const contenteditable = (element.getAttribute("contenteditable") || "").toLowerCase();
    return (
      element.getAttribute("data-slate-editor") === "true" ||
      contenteditable === "true" ||
      contenteditable === "plaintext-only" ||
      element.matches('textarea, input[type="text"], input:not([type]), [role="textbox"]')
    );
  };

  let target = null;
  if (mode === "editable") {
    const selectors = normalize(payload?.selectors || payload?.selector, [
      '[data-slate-editor="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      "textarea",
      'input[type="text"]',
      '[role="textbox"]',
    ]);
    target = elementsFor(selectors).find(isEditable) || null;
  } else {
    const selectors = normalize(payload?.selectors || payload?.selector, [
      "button",
      '[role="button"]',
      '[role="menuitem"]',
      '[role="option"]',
    ]);
    const terms = (Array.isArray(payload?.textIncludes) ? payload.textIncludes : [])
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
      .slice(0, 30);
    target =
      elementsFor(selectors)
        .filter(
          (element) =>
            visible(element) &&
            !element.disabled &&
            element.getAttribute("aria-disabled") !== "true" &&
            (!terms.length || terms.some((term) => textOf(element).includes(term))),
        )
        .sort((left, right) => textOf(left).length - textOf(right).length)[0] || null;
  }

  if (!target) return { found: false };
  if (shouldScroll) target.scrollIntoView({ block: "center", inline: "center" });
  const rect = target.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const right = Math.min(innerWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(innerHeight, rect.bottom);
  if (shouldScroll && (right <= left || bottom <= top)) return { found: false };
  const x = left + (right - left) / 2;
  const y = top + (bottom - top) / 2;
  return {
    found: true,
    x,
    y,
    absoluteX: x + scrollX,
    absoluteY: y + scrollY,
    text: textOf(target),
  };
}

function readFocusedText() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return element?.innerText || element?.textContent || "";
}

function collapseFocusedSelectionToEnd() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const end = element.value.length;
    element.setSelectionRange(end, end);
    return true;
  }
  if (!(element instanceof Element) || !element.isContentEditable) return false;
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function resolveFileInput(payload) {
  const selectors = (Array.isArray(payload?.selectors) ? payload.selectors : [payload?.selector])
    .map((selector) => String(selector || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  const candidates = selectors.length ? selectors : ['input[type="file"]'];
  const matches = [];
  for (const selector of candidates) {
    try {
      for (const element of document.querySelectorAll(selector)) {
        if (element instanceof HTMLInputElement && element.type === "file" && !element.disabled) {
          matches.push(element);
        }
      }
    } catch {
      // Seletores inválidos falham fechados.
    }
  }
  return [...new Set(matches)][0] || null;
}

function validateUploadFiles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_UPLOAD_FILES) return null;
  const output = [];
  for (const entry of value) {
    const filePath = String(entry || "");
    if (
      filePath.length < 3 ||
      filePath.length > MAX_UPLOAD_PATH_LENGTH ||
      filePath.includes("\0") ||
      filePath.split(/[\\/]+/).includes("..") ||
      !(/^[A-Za-z]:\\/.test(filePath) || filePath.startsWith("/"))
    ) {
      return null;
    }
    output.push(filePath);
  }
  return output;
}

async function setFileInputFiles(tabId, payload) {
  const files = validateUploadFiles(payload?.files);
  if (!files) return bridgeError("INVALID_COMMAND", "Lista de arquivos inválida.");
  const resolved = await sendCdp(tabId, "Runtime.evaluate", {
    expression: `(${resolveFileInput.toString()})(${JSON.stringify({
      selectors: payload?.selectors,
      selector: payload?.selector,
    })})`,
    returnByValue: false,
    awaitPromise: true,
    userGesture: true,
  });
  const objectId = resolved?.result?.objectId;
  if (!objectId) return bridgeError("FILE_INPUT_NOT_FOUND", "Controle de arquivo não encontrado.");
  const described = await sendCdp(tabId, "DOM.describeNode", { objectId });
  const node = described?.node;
  const attributes = Array.isArray(node?.attributes) ? node.attributes : [];
  const typeIndex = attributes.findIndex((value) => String(value).toLowerCase() === "type");
  if (
    String(node?.nodeName || "").toUpperCase() !== "INPUT" ||
    typeIndex < 0 ||
    String(attributes[typeIndex + 1] || "").toLowerCase() !== "file" ||
    !Number.isInteger(node?.backendNodeId)
  ) {
    return bridgeError("FILE_INPUT_NOT_FOUND", "O alvo não é um input de arquivo válido.");
  }
  await sendCdp(tabId, "DOM.setFileInputFiles", { files, backendNodeId: node.backendNodeId });
  return { ok: true, fileCount: files.length };
}

async function sendCdp(tabId, method, params = {}) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    if (String(err?.message || "").includes("Debugger is not attached")) {
      try {
        await chrome.debugger.attach({ tabId }, CDP_VERSION);
        return await chrome.debugger.sendCommand({ tabId }, method, params);
      } catch {}
    }
    throw err;
  }
}

async function evaluateValue(tabId, expression) {
  const evaluated = await sendCdp(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (evaluated?.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.text || "Runtime.evaluate falhou.");
  }
  return evaluated?.result?.value;
}

async function targetFor(tabId, payload, mode, shouldScroll) {
  const locatorPayload = {};
  if (typeof payload?.selector === "string") locatorPayload.selector = payload.selector;
  if (Array.isArray(payload?.selectors)) locatorPayload.selectors = payload.selectors;
  if (Array.isArray(payload?.textIncludes)) locatorPayload.textIncludes = payload.textIncludes;
  return await evaluateValue(
    tabId,
    `(${resolvePageTarget.toString()})(${JSON.stringify(locatorPayload)},${JSON.stringify(mode)},${Boolean(shouldScroll)})`,
  );
}

// Runs inside the already-authorized provider tab. This is intentionally
// limited to the same selector/text policy as the bridge command; it is not a
// general page-evaluation surface. DOM activation works while Chrome is
// minimized and avoids making the dedicated profile visible for every action.
function clickPageTarget(payload) {
  const visible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 8 &&
      rect.height > 8
    );
  };
  const allDeep = (selector, root = document) => {
    const output = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      for (const element of node.querySelectorAll(selector)) output.push(element);
      for (const element of node.querySelectorAll("*")) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return [...new Set(output)];
  };
  const textOf = (element) =>
    [
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("placeholder"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test-id"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const selectors = (Array.isArray(payload?.selectors) ? payload.selectors : [payload?.selector])
    .map((selector) => String(selector || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  const terms = (Array.isArray(payload?.textIncludes) ? payload.textIncludes : [])
    .map((term) =>
      String(term || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .slice(0, 30);
  const candidates = [
    ...new Set(
      selectors.flatMap((selector) => {
        try {
          return allDeep(selector);
        } catch {
          return [];
        }
      }),
    ),
  ];
  const target = candidates
    .filter(
      (element) =>
        visible(element) &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true" &&
        (!terms.length || terms.some((term) => textOf(element).includes(term))),
    )
    .sort((left, right) => textOf(left).length - textOf(right).length)[0];
  if (!target) return { clicked: false };
  target.scrollIntoView({ block: "center", inline: "center" });
  target.focus?.({ preventScroll: true });
  target.click();
  return { clicked: true, text: textOf(target) };
}

async function clickWithDom(tabId, payload) {
  return await evaluateValue(
    tabId,
    `(${clickPageTarget.toString()})(${JSON.stringify({
      selectors: payload?.selectors,
      selector: payload?.selector,
      textIncludes: payload?.textIncludes,
    })})`,
  );
}

async function dispatchMouseClick(tabId, target) {
  const base = { x: target.x, y: target.y, button: "left" };
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
  });
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...base,
    clickCount: 1,
  });
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...base,
    clickCount: 1,
  });
}

async function focusTargetAtPoint(tabId, target) {
  await sendCdp(tabId, "DOM.enable");
  const documentResult = await sendCdp(tabId, "DOM.getDocument", { depth: -1, pierce: true });
  const rootNodeId = documentResult?.root?.nodeId;
  if (rootNodeId) {
    const matches = await sendCdp(tabId, "DOM.querySelectorAll", {
      nodeId: rootNodeId,
      selector:
        '[contenteditable="true"], [contenteditable="plaintext-only"], textarea, input[type="text"], input:not([type]), [role="textbox"]',
    });
    let best = null;
    for (const nodeId of matches?.nodeIds || []) {
      try {
        const box = await sendCdp(tabId, "DOM.getBoxModel", { nodeId });
        const quad = box?.model?.border;
        if (!Array.isArray(quad) || quad.length < 8) continue;
        const xs = [quad[0], quad[2], quad[4], quad[6]];
        const ys = [quad[1], quad[3], quad[5], quad[7]];
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        if (target.x < left || target.x > right || target.y < top || target.y > bottom) continue;
        const area = Math.max(1, right - left) * Math.max(1, bottom - top);
        if (!best || area < best.area) best = { nodeId, area };
      } catch {
        // Nós ocultos ou removidos podem desaparecer entre a localização e o foco.
      }
    }
    if (best) {
      await sendCdp(tabId, "DOM.focus", { nodeId: best.nodeId });
      return;
    }
  }
  const node = await sendCdp(tabId, "DOM.getNodeForLocation", {
    x: Math.round(target.x),
    y: Math.round(target.y),
    includeUserAgentShadowDOM: true,
    ignorePointerEventsNone: true,
  });
  if (node?.backendNodeId) {
    await sendCdp(tabId, "DOM.focus", { backendNodeId: node.backendNodeId });
  }
}

async function replaceFocusedText(tabId, value) {
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
    commands: ["selectAll"],
  });
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
  });
  // Input.insertText não substitui de forma consistente a seleção controlada
  // por editores React/contenteditable. Apague explicitamente antes de inserir
  // para evitar concatenar o prompt anterior em novas tentativas.
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  if (value) {
    await sendCdp(tabId, "Input.insertText", { text: value });
  }
}

async function pressEnter(tabId) {
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
    unmodifiedText: "\r",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await sendCdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

async function dispatchCdpAction(tabId, command, policy) {
  if (await isExecutionCancelled(command)) {
    return bridgeError("CANCELLED", "Execução cancelada.");
  }
  const page = await evaluateValue(
    tabId,
    "({ url: location.href, origin: location.origin, title: document.title })",
  );
  let pageUrl;
  try {
    pageUrl = new URL(page?.url);
  } catch {
    return bridgeError("ORIGIN_NOT_ALLOWED", "A aba deixou a origem autorizada.");
  }
  if (!pathAllowed(pageUrl, policy)) {
    return bridgeError("ORIGIN_NOT_ALLOWED", "A aba deixou a origem autorizada.");
  }

  const payload = command.payload || {};
  if (command.action === "ping") {
    return { ok: true, protocolVersion: PROTOCOL_VERSION, url: page.url };
  }
  if (command.action === "inspect") {
    const editable = await targetFor(tabId, payload, "editable", false);
    return {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      url: page.url,
      title: page.title,
      editableReady: Boolean(editable?.found),
    };
  }
  if (command.action === "setText" || command.action === "setPrompt") {
    const text = String(payload.text || "");
    const expected = text.replace(/\s+/g, " ").trim();
    let actual = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = await targetFor(tabId, payload, "editable", true);
      if (!target?.found) {
        return bridgeError("EDITOR_NOT_FOUND", "Editor não encontrado.");
      }
      if (await isExecutionCancelled(command)) {
        return bridgeError("CANCELLED", "Execução cancelada.");
      }
      await focusTargetAtPoint(tabId, target);
      await dispatchMouseClick(tabId, target);
      await focusTargetAtPoint(tabId, target);
      await replaceFocusedText(tabId, text);
      actual = String((await evaluateValue(tabId, `(${readFocusedText.toString()})()`)) || "")
        .replace(/\uFEFF/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!expected || actual === expected || actual.includes(expected)) break;
    }
    if (expected && actual !== expected && !actual.includes(expected)) {
      return bridgeError("EDITOR_WRITE_FAILED", "O texto não permaneceu no editor.");
    }
    return { ok: true, readbackLength: actual.length };
  }
  if (command.action === "pressEnter") {
    const target = await targetFor(tabId, payload, "editable", true);
    if (!target?.found) {
      return bridgeError("EDITOR_NOT_FOUND", "Editor não encontrado.");
    }
    if (await isExecutionCancelled(command)) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    await focusTargetAtPoint(tabId, target);
    await evaluateValue(tabId, `(${collapseFocusedSelectionToEnd.toString()})()`);
    await pressEnter(tabId);
    return { ok: true, mechanism: "cdp-keyboard-enter" };
  }
  if (command.action === "setFiles") {
    if (await isExecutionCancelled(command)) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    return await setFileInputFiles(tabId, payload);
  }
  if (command.action === "click" || command.action === "clickGenerate") {
    const clickPayload =
      command.action === "clickGenerate" && !payload.textIncludes
        ? { ...payload, textIncludes: ["criar", "create", "gerar", "generate"] }
        : payload;
    const target = await targetFor(tabId, clickPayload, "clickable", true);
    if (!target?.found) {
      return bridgeError("CONTROL_NOT_FOUND", "Controle não encontrado ou desabilitado.");
    }
    if (await isExecutionCancelled(command)) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    if (clickPayload.preferDomActivation === true) {
      const domResult = await clickWithDom(tabId, clickPayload);
      if (domResult?.clicked) {
        return { ok: true, text: domResult.text || target.text, mechanism: "dom" };
      }
      return bridgeError("CONTROL_NOT_FOUND", "Controle não encontrado ou desabilitado.");
    }
    try {
      await dispatchMouseClick(tabId, target);
      return { ok: true, text: target.text, mechanism: "cdp-input" };
    } catch (error) {
      const domResult = await clickWithDom(tabId, clickPayload);
      if (domResult?.clicked)
        return { ok: true, text: domResult.text || target.text, mechanism: "dom-fallback" };
      throw error;
    }
  }
  return bridgeError("UNKNOWN_ACTION", `Ação não suportada: ${String(command.action)}`);
}

async function detachSessionDebugger(session) {
  if (!Number.isInteger(session?.attachedTabId)) return;
  const tabId = session.attachedTabId;
  session.attachedTabId = undefined;
  const owners = debuggerSessionsByTab.get(tabId);
  owners?.delete(session.sessionToken);
  if (owners?.size) return;
  debuggerSessionsByTab.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // A aba ou o Chrome podem ter sido fechados antes do fim do job.
  }
}

async function withJobDebugger(tabId, command, operation) {
  const session = activeSessions.get(command.sessionToken);
  if (!session) throw new Error("Sessão da Browser Bridge não encontrada.");
  if (session.attachedTabId !== tabId) {
    await detachSessionDebugger(session);
    let owners = debuggerSessionsByTab.get(tabId);
    if (!owners) {
      try {
        await chrome.debugger.attach({ tabId }, CDP_VERSION);
      } catch (error) {
        // A worker can be restarted while Chrome still holds this extension's
        // previous debugger attachment. The in-memory owners map is then
        // empty even though the extension can first release its own stale
        // attachment. Retry once; another extension remains protected because
        // chrome.debugger.detach only addresses this extension's debugger.
        if (!/already attached/i.test(String(error?.message || error))) throw error;
        await chrome.debugger.detach({ tabId }).catch(() => undefined);
        await chrome.debugger.attach({ tabId }, CDP_VERSION);
      }
      owners = new Set();
      debuggerSessionsByTab.set(tabId, owners);
    }
    owners.add(session.sessionToken);
    session.attachedTabId = tabId;
  }
  return await operation();
}

async function dispatchToPage(command) {
  const policy = policyForPlugin(command.pluginId);
  let expectedUrl;
  try {
    expectedUrl = new URL(command.expectedUrl);
  } catch {
    return bridgeError("INVALID_COMMAND", "expectedUrl inválida.");
  }
  if (!policy || !pathAllowed(expectedUrl, policy)) {
    return bridgeError("ORIGIN_NOT_ALLOWED", "A origem não foi autorizada para este plugin.");
  }

  const cache = await readCommandCache();
  const cached = cache[command.commandId];
  if (
    cached?.executionKey === command.executionKey &&
    cached?.pluginId === command.pluginId &&
    cached?.profileId === command.profileId &&
    Number(cached.expiresAt) > Date.now() &&
    cached.response
  ) {
    return { ...cached.response, replayed: true };
  }

  const tabs = await chrome.tabs.query({ url: policy.tabPatterns });
  const tab = selectPluginTab(tabs, expectedUrl.toString(), policy);
  if (!Number.isInteger(tab?.id)) {
    return bridgeError(
      "PLUGIN_TAB_NOT_FOUND",
      "A aba exata do provedor não foi encontrada no perfil dedicado.",
    );
  }

  if (["leaseAcquire", "leaseRenew", "leaseRelease"].includes(command.action)) {
    if (command.action !== "leaseRelease" && (await isExecutionCancelled(command))) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    const response = await enqueueTabCommand(tab.id, () =>
      Date.now() >= command.expiresAt
        ? bridgeError("COMMAND_EXPIRED", "O comando expirou antes de executar na aba.")
        : manageLease(tab, command, policy),
    );
    await cacheResponse(command, response);
    return response;
  }

  const timeoutMs = Math.max(1000, Math.min(30000, command.expiresAt - Date.now()));
  try {
    const response = await withTimeout(
      enqueueTabCommand(tab.id, () =>
        Date.now() >= command.expiresAt
          ? bridgeError("COMMAND_EXPIRED", "O comando expirou antes de executar na aba.")
          : withJobDebugger(tab.id, command, () => dispatchCdpAction(tab.id, command, policy)),
      ),
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
      `O motor CDP não conseguiu executar o comando: ${error?.message || String(error)}`,
    );
  }
}

globalThis.contentFlowBridge = Object.freeze({
  identity: identity(),
  connect(handshake) {
    if (
      !policyForPlugin(handshake?.pluginId) ||
      handshake?.protocolVersion !== PROTOCOL_VERSION ||
      typeof handshake?.profileId !== "string" ||
      handshake.profileId.length < 1 ||
      handshake.profileId.length > 128 ||
      !/^[a-f0-9-]{32,64}$/i.test(String(handshake?.sessionToken || ""))
    ) {
      return bridgeError("HANDSHAKE_REJECTED", "Handshake da extensão inválido.");
    }
    const now = Date.now();
    for (const [token, session] of activeSessions) {
      if (now - session.lastSeenAt > SESSION_TTL_MS) {
        activeSessions.delete(token);
        void cleanupLeases({ sessionToken: session.sessionToken });
        void detachSessionDebugger(session);
      }
    }
    while (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
      const oldest = [...activeSessions.entries()].sort(
        (left, right) => left[1].lastSeenAt - right[1].lastSeenAt,
      )[0];
      if (!oldest) break;
      activeSessions.delete(oldest[0]);
      void cleanupLeases({ sessionToken: oldest[1].sessionToken });
      void detachSessionDebugger(oldest[1]);
    }
    const previous = activeSessions.get(handshake.sessionToken);
    if (previous) {
      void cleanupLeases({ sessionToken: previous.sessionToken });
      void detachSessionDebugger(previous);
    }
    activeSessions.set(handshake.sessionToken, {
      pluginId: handshake.pluginId,
      profileId: handshake.profileId,
      sessionToken: handshake.sessionToken,
      connectedAt: now,
      lastSeenAt: now,
    });
    return { ok: true, pluginId: handshake.pluginId, ...identity() };
  },
  async dispatch(command) {
    const invalid = validateSession(command);
    if (invalid) return invalid;
    const inFlightKey = `${command.pluginId}:${command.profileId}:${command.sessionToken}:${command.commandId}`;
    if (inFlight.has(inFlightKey)) return await inFlight.get(inFlightKey);
    const operation = dispatchToPage(command).finally(() => inFlight.delete(inFlightKey));
    inFlight.set(inFlightKey, operation);
    return await operation;
  },
  async cancel(request) {
    const session = activeSessions.get(request?.sessionToken);
    if (
      !session ||
      Date.now() - session.lastSeenAt > SESSION_TTL_MS ||
      request?.pluginId !== session.pluginId ||
      request?.protocolVersion !== PROTOCOL_VERSION ||
      request?.profileId !== session.profileId ||
      typeof request?.executionKey !== "string" ||
      request.executionKey.length < 16
    ) {
      return bridgeError("SESSION_MISMATCH", "Cancelamento recusado pela extensão.");
    }
    session.lastSeenAt = Date.now();
    await markExecutionCancelled(session, request.executionKey);
    await cleanupLeases({
      sessionToken: session.sessionToken,
      executionKey: request.executionKey,
    });
    await detachSessionDebugger(session);
    return { ok: true };
  },
  async disconnect(request) {
    const session = activeSessions.get(request?.sessionToken);
    if (
      !session ||
      request?.pluginId !== session.pluginId ||
      request?.protocolVersion !== PROTOCOL_VERSION ||
      request?.profileId !== session.profileId
    ) {
      return bridgeError("SESSION_MISMATCH", "Desconexão recusada pela extensão.");
    }
    activeSessions.delete(request.sessionToken);
    await cleanupLeases({ sessionToken: session.sessionToken });
    await detachSessionDebugger(session);
    return { ok: true };
  },
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source === "contentflow-provider-page" && message?.action === "wake") {
    sendResponse({ ok: true, ...identity() });
  }
  if (message?.source === "contentflow-provider-page" && message?.action === "pagehide") {
    void cleanupLeases({ tabId: sender?.tab?.id });
    sendResponse({ ok: true });
  }
  return false;
});

chrome.alarms.create(LEASE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === LEASE_ALARM) void cleanupLeases({ forceExpired: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void cleanupLeases({ tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo?.url) return;
  void (async () => {
    const leases = await readLeases();
    const tabLeases = Object.values(leases).filter((lease) => lease?.tabId === tabId);
    if (!tabLeases.length) return;
    let current;
    try {
      current = new URL(changeInfo.url);
    } catch {
      await cleanupLeases({ tabId });
      return;
    }
    if (
      tabLeases.some((lease) => {
        const leasePolicy = policyForPlugin(lease.pluginId);
        return (
          !leasePolicy ||
          !pathAllowed(current, leasePolicy) ||
          current.origin !== lease.origin ||
          current.pathname !== lease.pathname
        );
      })
    ) {
      await cleanupLeases({ tabId });
    }
  })();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port?.name !== "contentflow-provider-page") return;
  port.onMessage.addListener(() => {
    // Receber o heartbeat renova a vida do service worker durante o job.
  });
});
