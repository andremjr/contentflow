const BRIDGE_ID = "com.contentflow.browser-bridge";
const FLOW_PLUGIN_ID = "local.contentflow.google-flow-batch-images";
const VIBES_PLUGIN_ID = "local.contentflow.vibes-browser-studio";
const PROTOCOL_VERSION = 2;
const PROTOCOL_RANGE = Object.freeze({ min: 2, max: 2 });
const BRIDGE_CAPABILITIES = Object.freeze([
  "idempotent-replay.v1",
  "lifecycle-events.v1",
  "snapshot.v1",
  "condition-observer.v1",
  "reload.v1",
]);
const COMMAND_CACHE_KEY = "contentflowCommandCacheV2";
const CANCELLED_EXECUTIONS_KEY = "contentflowCancelledExecutionsV2";
const LEASES_KEY = "contentflowLeasesV1";
const LIFECYCLE_KEY = "contentflowLifecycleV1";
const LEASE_ALARM = "contentflow-lease-cleanup";
const MAX_COMMAND_CACHE = 500;
const COMMAND_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const COMMAND_IN_FLIGHT_TTL_MS = 10 * 60 * 1000;
const DURABLE_IN_FLIGHT_ACTIONS = new Set([
  "click",
  "clickGenerate",
  "pressEnter",
  "setFiles",
  "reload",
]);
const MAX_LIFECYCLE_EVENTS = 128;
const CDP_VERSION = "1.3";
const DEFAULT_LEASE_TTL_MS = 60_000;
const MAX_LEASE_TTL_MS = 5 * 60_000;
const MAX_UPLOAD_FILES = 8;
const MAX_UPLOAD_PATH_LENGTH = 1024;
const MAX_CONDITION_OBSERVERS_PER_SESSION = 4;
const MAX_CONDITION_OBSERVERS_PER_TAB = 1;
const MAX_CONDITION_SELECTORS = 8;
const MAX_CONDITION_SELECTOR_LENGTH = 256;
const MAX_CONDITION_PAYLOAD_BYTES = 4096;
const MIN_CONDITION_TIMEOUT_MS = 250;
const MAX_CONDITION_TIMEOUT_MS = 30_000;
const MIN_CONDITION_DEBOUNCE_MS = 25;
const MAX_CONDITION_DEBOUNCE_MS = 1000;
const COMMON_ACTIONS = new Set([
  "ping",
  "inspect",
  "setText",
  "pressEnter",
  "click",
  "observeCondition",
  "reload",
]);
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
const providerPorts = new Set();
function announceJobActivity() {
  const selected = activeSessions.size ? providerPorts.values().next().value : undefined;
  for (const port of providerPorts) {
    try {
      port.postMessage({ action: port === selected ? "job-active" : "job-idle" });
    } catch {
      providerPorts.delete(port);
    }
  }
}
const debuggerSessionsByTab = new Map();
const lifecycleQueues = new Map();
const activeConditionObservers = new Map();
const intentionalDebuggerDetaches = new Set();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 128;

function bridgeError(code, message) {
  return { ok: false, code, message };
}

function safeLocation(value) {
  try {
    const url = new URL(String(value || ""));
    return { origin: url.origin, pathname: url.pathname };
  } catch {
    return undefined;
  }
}

async function readLifecycleStore() {
  const stored = await chrome.storage.session.get(LIFECYCLE_KEY);
  const value = stored?.[LIFECYCLE_KEY];
  return value && typeof value === "object" ? value : {};
}

async function mutateLifecycle(session, mutate) {
  const token = session.sessionToken;
  const previous = lifecycleQueues.get(token) || Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await readLifecycleStore();
      const current = store[token];
      const state =
        current?.pluginId === session.pluginId && current?.profileId === session.profileId
          ? current
          : {
              pluginId: session.pluginId,
              profileId: session.profileId,
              sequence: 0,
              events: [],
              snapshot: {
                state: "connected",
                location: null,
                debuggerAttached: false,
                leaseActive: false,
              },
            };
      const result = await mutate(state, Boolean(current));
      state.updatedAt = Date.now();
      store[token] = state;
      await chrome.storage.session.set({ [LIFECYCLE_KEY]: store });
      return result;
    });
  lifecycleQueues.set(token, operation);
  try {
    return await operation;
  } finally {
    if (lifecycleQueues.get(token) === operation) lifecycleQueues.delete(token);
  }
}

async function emitLifecycleEvent(session, type, details = {}, snapshotPatch = {}) {
  return mutateLifecycle(session, (state) => {
    state.sequence = Number(state.sequence || 0) + 1;
    const event = {
      sequence: state.sequence,
      type,
      at: Date.now(),
      ...details,
    };
    state.events = [...(Array.isArray(state.events) ? state.events : []), event].slice(
      -MAX_LIFECYCLE_EVENTS,
    );
    state.snapshot = { ...(state.snapshot || {}), ...snapshotPatch };
    return event;
  });
}

async function initializeLifecycle(session) {
  return mutateLifecycle(session, (state, existed) => {
    if (!existed) return { lastSequence: Number(state.sequence || 0), reconnected: false };
    state.sequence = Number(state.sequence || 0) + 1;
    const event = {
      sequence: state.sequence,
      type: "worker_reconnected",
      diagnosticCode: "BRIDGE_WORKER_RESTART",
      at: Date.now(),
    };
    state.events = [...(Array.isArray(state.events) ? state.events : []), event].slice(
      -MAX_LIFECYCLE_EVENTS,
    );
    state.snapshot = {
      ...(state.snapshot || {}),
      state: "reconnected",
      debuggerAttached: false,
    };
    return { lastSequence: state.sequence, reconnected: true };
  });
}

function validateLifecycleRequest(request) {
  const session = activeSessions.get(request?.sessionToken);
  if (
    !session ||
    request?.pluginId !== session.pluginId ||
    request?.profileId !== session.profileId ||
    request?.protocolVersion !== session.protocolVersion
  ) {
    return { error: bridgeError("SESSION_MISMATCH", "Sessão de lifecycle inválida.") };
  }
  session.lastSeenAt = Date.now();
  return { session };
}

function identity() {
  const bridgeVersion = chrome.runtime.getManifest().version;
  return {
    bridgeId: BRIDGE_ID,
    protocolVersion: PROTOCOL_VERSION,
    protocol: { ...PROTOCOL_RANGE },
    bridgeVersion,
    extensionVersion: bridgeVersion,
    capabilities: [...BRIDGE_CAPABILITIES],
  };
}

function negotiateHandshake(handshake) {
  const legacyVersion = Number(handshake?.protocolVersion);
  const requestedRange = handshake?.protocol;
  const clientMin = Number(requestedRange?.min);
  const clientMax = Number(requestedRange?.max);
  const isRangeHandshake =
    Number.isInteger(clientMin) && Number.isInteger(clientMax) && clientMin <= clientMax;
  const negotiatedVersion = isRangeHandshake
    ? Math.min(PROTOCOL_RANGE.max, clientMax)
    : legacyVersion;
  const compatible = isRangeHandshake
    ? negotiatedVersion >= Math.max(PROTOCOL_RANGE.min, clientMin)
    : legacyVersion === PROTOCOL_VERSION;
  if (!compatible) {
    return bridgeError(
      "PROTOCOL_MISMATCH",
      `Nenhuma versão compatível da Browser Bridge foi encontrada (extensão ${PROTOCOL_RANGE.min}-${PROTOCOL_RANGE.max}).`,
    );
  }
  const requestedCapabilities = Array.isArray(handshake?.requestedCapabilities)
    ? handshake.requestedCapabilities
    : [];
  const missingCapabilities = requestedCapabilities.filter(
    (capability) => !BRIDGE_CAPABILITIES.includes(capability),
  );
  if (missingCapabilities.length > 0) {
    return bridgeError(
      "CAPABILITY_MISMATCH",
      `A Browser Bridge não oferece as capabilities requeridas: ${missingCapabilities.join(", ")}.`,
    );
  }
  return {
    ok: true,
    protocolVersion: negotiatedVersion,
    capabilities: [...BRIDGE_CAPABILITIES],
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
  const now = Date.now();
  const current = cache && typeof cache === "object" ? cache : {};
  const entries = Object.entries(current)
    .filter(([, value]) => Number(value?.expiresAt) > now)
    .sort((left, right) => {
      const storedAt = Number(left[1]?.storedAt) - Number(right[1]?.storedAt);
      return storedAt || left[0].localeCompare(right[0]);
    });
  while (entries.length > MAX_COMMAND_CACHE) entries.shift();
  const pruned = Object.fromEntries(entries);
  if (Object.keys(pruned).length !== Object.keys(current).length) {
    await chrome.storage.session.set({ [COMMAND_CACHE_KEY]: pruned });
  }
  return pruned;
}

async function writeCommandCacheEntry(command, entry) {
  const cache = await readCommandCache();
  const entries = Object.entries(cache).filter(([commandId]) => commandId !== command.commandId);
  while (entries.length >= MAX_COMMAND_CACHE) entries.shift();
  entries.push([command.commandId, entry]);
  await chrome.storage.session.set({ [COMMAND_CACHE_KEY]: Object.fromEntries(entries) });
}

function commandCacheMatches(entry, command) {
  return (
    entry?.executionKey === command.executionKey &&
    entry?.pluginId === command.pluginId &&
    entry?.profileId === command.profileId &&
    (!entry?.action || entry.action === command.action)
  );
}

async function markCommandInFlight(command) {
  const now = Date.now();
  await writeCommandCacheEntry(command, {
    pluginId: command.pluginId,
    profileId: command.profileId,
    executionKey: command.executionKey,
    action: command.action,
    status: "in_flight",
    storedAt: now,
    expiresAt: now + COMMAND_IN_FLIGHT_TTL_MS,
  });
}

async function cacheResponse(command, response) {
  const now = Date.now();
  await writeCommandCacheEntry(command, {
    pluginId: command.pluginId,
    profileId: command.profileId,
    executionKey: command.executionKey,
    action: command.action,
    status: "completed",
    response,
    storedAt: now,
    expiresAt: now + COMMAND_CACHE_TTL_MS,
  });
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
  const expiredLeases = [];
  let changed = false;
  for (const [leaseId, lease] of Object.entries(leases)) {
    const expired = Number(lease?.expiresAt) <= now;
    const matches =
      (Number.isInteger(tabId) && lease?.tabId === tabId) ||
      (sessionToken && lease?.sessionToken === sessionToken) ||
      (executionKey && lease?.executionKey === executionKey);
    if ((forceExpired && expired) || matches) {
      if (Number.isInteger(lease?.tabId)) releasedTabs.add(lease.tabId);
      if (forceExpired && expired) expiredLeases.push(lease);
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
  for (const lease of expiredLeases) {
    await emitLifecycleEvent(
      {
        pluginId: lease.pluginId,
        profileId: lease.profileId,
        sessionToken: lease.sessionToken,
      },
      "lease_expired",
      { executionKey: lease.executionKey },
      { leaseActive: false },
    );
  }
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
  await mutateLifecycle(session, (state) => {
    state.snapshot = { ...(state.snapshot || {}), leaseActive: true };
  });
  return { ok: true, leaseId, expiresAt, ttlMs };
}

function validateSession(command) {
  const session = activeSessions.get(command?.sessionToken);
  const now = Date.now();
  if (!session || now - session.lastSeenAt > SESSION_TTL_MS) {
    if (session) {
      activeSessions.delete(command.sessionToken);
      announceJobActivity();
    }
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeConditionPayload(payload, expiresAt) {
  let encoded;
  try {
    encoded = JSON.stringify(payload || {});
  } catch {
    return null;
  }
  if (encoded.length > MAX_CONDITION_PAYLOAD_BYTES) return null;
  const selectors = (Array.isArray(payload?.selectors) ? payload.selectors : [payload?.selector])
    .map((selector) => String(selector || "").trim())
    .filter(Boolean);
  if (
    selectors.length < 1 ||
    selectors.length > MAX_CONDITION_SELECTORS ||
    selectors.some((selector) => selector.length > MAX_CONDITION_SELECTOR_LENGTH)
  ) {
    return null;
  }
  const state = String(payload?.state || "");
  if (!["exists", "absent", "visible", "hidden", "enabled", "disabled"].includes(state)) {
    return null;
  }
  const remainingMs = Number(expiresAt) - Date.now() - 500;
  if (remainingMs < MIN_CONDITION_TIMEOUT_MS) return null;
  const timeoutMs = Math.max(
    MIN_CONDITION_TIMEOUT_MS,
    Math.min(
      MAX_CONDITION_TIMEOUT_MS,
      remainingMs,
      Number(payload?.timeoutMs) || Math.min(10_000, remainingMs),
    ),
  );
  const debounceMs = Math.max(
    MIN_CONDITION_DEBOUNCE_MS,
    Math.min(MAX_CONDITION_DEBOUNCE_MS, Number(payload?.debounceMs) || 100),
  );
  return { selectors, state, timeoutMs, debounceMs };
}

function observePageCondition(payload, observerKey) {
  const registryName = "__contentFlowConditionObserversV1";
  const registry = globalThis[registryName] instanceof Map ? globalThis[registryName] : new Map();
  globalThis[registryName] = registry;
  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
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
    try {
      visit(root);
    } catch {
      return [];
    }
    return [...new Set(output)];
  };
  const evaluate = () => {
    for (let index = 0; index < payload.selectors.length; index += 1) {
      const elements = allDeep(payload.selectors[index]);
      if (payload.state === "absent" && elements.length === 0) return index;
      if (payload.state === "exists" && elements.length > 0) return index;
      if (payload.state === "visible" && elements.some(isVisible)) return index;
      if (
        payload.state === "hidden" &&
        elements.length > 0 &&
        elements.every((item) => !isVisible(item))
      ) {
        return index;
      }
      if (
        payload.state === "enabled" &&
        elements.some(
          (item) =>
            !item.disabled && item.getAttribute("aria-disabled") !== "true" && isVisible(item),
        )
      ) {
        return index;
      }
      if (
        payload.state === "disabled" &&
        elements.some(
          (item) =>
            (item.disabled || item.getAttribute("aria-disabled") === "true") && isVisible(item),
        )
      ) {
        return index;
      }
    }
    return -1;
  };

  return new Promise((resolve) => {
    let settled = false;
    let debounceTimer;
    let sampleTimer;
    let timeoutTimer;
    let observer;
    const cleanup = () => {
      observer?.disconnect();
      clearTimeout(debounceTimer);
      clearTimeout(sampleTimer);
      clearTimeout(timeoutTimer);
      registry.delete(observerKey);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const sample = () => {
      sampleTimer = undefined;
      const selectorIndex = evaluate();
      if (selectorIndex < 0) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
        return;
      }
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const confirmedIndex = evaluate();
        if (confirmedIndex < 0) return;
        finish({
          ok: true,
          matched: true,
          state: payload.state,
          selectorIndex: confirmedIndex,
        });
      }, payload.debounceMs);
    };
    const scheduleSample = () => {
      if (settled || sampleTimer) return;
      sampleTimer = setTimeout(sample, 50);
    };
    registry.set(observerKey, () =>
      finish({ ok: false, code: "CANCELLED", message: "Observação cancelada." }),
    );
    observer = new MutationObserver(scheduleSample);
    const root = document.documentElement || document;
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    timeoutTimer = setTimeout(
      () =>
        finish({ ok: false, code: "COMMAND_TIMEOUT", message: "Condição não atingida no prazo." }),
      payload.timeoutMs,
    );
    sample();
  });
}

function conditionObserverMatches(entry, filters = {}) {
  return (
    (!filters.sessionToken || entry.sessionToken === filters.sessionToken) &&
    (!filters.executionKey || entry.executionKey === filters.executionKey) &&
    (!Number.isInteger(filters.tabId) || entry.tabId === filters.tabId)
  );
}

async function cancelConditionObservers(filters = {}) {
  const matches = [...activeConditionObservers.entries()].filter(([, entry]) =>
    conditionObserverMatches(entry, filters),
  );
  await Promise.all(
    matches.map(async ([observerKey, entry]) => {
      activeConditionObservers.delete(observerKey);
      try {
        await sendCdp(entry.tabId, "Runtime.evaluate", {
          expression: `globalThis.__contentFlowConditionObserversV1?.get(${JSON.stringify(
            observerKey,
          )})?.()`,
          returnByValue: true,
          awaitPromise: false,
        });
      } catch {
        // Navegação, fechamento da aba ou perda do debugger também encerram a observação.
      }
    }),
  );
}

function forgetConditionObservers(filters = {}) {
  for (const [observerKey, entry] of activeConditionObservers) {
    if (conditionObserverMatches(entry, filters)) activeConditionObservers.delete(observerKey);
  }
}

async function runConditionObserver(tabId, command) {
  const payload = normalizeConditionPayload(command.payload, command.expiresAt);
  if (!payload) return bridgeError("INVALID_COMMAND", "Condição declarativa inválida.");
  const session = activeSessions.get(command.sessionToken);
  if (!session) return bridgeError("SESSION_MISMATCH", "Sessão do observador não encontrada.");
  const sessionCount = [...activeConditionObservers.values()].filter(
    (entry) => entry.sessionToken === session.sessionToken,
  ).length;
  const tabCount = [...activeConditionObservers.values()].filter(
    (entry) => entry.tabId === tabId,
  ).length;
  if (
    sessionCount >= MAX_CONDITION_OBSERVERS_PER_SESSION ||
    tabCount >= MAX_CONDITION_OBSERVERS_PER_TAB
  ) {
    return bridgeError("OBSERVER_LIMIT", "Limite de observadores temporários atingido.");
  }
  const observerKey = `${session.sessionToken}:${command.commandId}`;
  activeConditionObservers.set(observerKey, {
    sessionToken: session.sessionToken,
    executionKey: command.executionKey,
    tabId,
  });
  try {
    const response = await evaluateValue(
      tabId,
      `(${observePageCondition.toString()})(${JSON.stringify(payload)},${JSON.stringify(
        observerKey,
      )})`,
    );
    if (response?.ok) {
      await emitLifecycleEvent(session, "condition_reached", {
        executionKey: command.executionKey,
        commandId: command.commandId,
        state: payload.state,
      });
    }
    return response && typeof response === "object"
      ? response
      : bridgeError("INVALID_RESPONSE", "O observador retornou uma resposta inválida.");
  } finally {
    activeConditionObservers.delete(observerKey);
  }
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
  if (command.action === "observeCondition") {
    return await runConditionObserver(tabId, command);
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

async function controlledReload(tab, command, policy) {
  const session = activeSessions.get(command.sessionToken);
  if (!session) return bridgeError("SESSION_MISMATCH", "A sessão da recarga não existe.");
  const reconciliationState = String(command.payload?.reconciliationState || "");
  if (reconciliationState === "uncertain") {
    return bridgeError(
      "RELOAD_BLOCKED_UNCERTAIN_EFFECT",
      "A recarga foi bloqueada enquanto o efeito externo permanece incerto.",
    );
  }
  if (!["safe", "reconciled"].includes(reconciliationState)) {
    return bridgeError(
      "INVALID_COMMAND",
      "A recarga exige reconciliationState safe ou reconciled.",
    );
  }
  if (await isExecutionCancelled(command)) {
    return bridgeError("CANCELLED", "Execução cancelada.");
  }

  await detachSessionDebugger(session);
  try {
    await chrome.tabs.reload(tab.id, {
      bypassCache: command.payload?.bypassCache === true,
    });
  } catch (error) {
    return bridgeError(
      "TAB_CLOSED",
      `A aba não pôde ser recarregada: ${error?.message || String(error)}`,
    );
  }

  const deadline = Math.min(command.expiresAt, Date.now() + 30_000);
  let currentTab;
  while (Date.now() < deadline) {
    try {
      currentTab = await chrome.tabs.get(tab.id);
    } catch {
      return bridgeError("TAB_CLOSED", "A aba foi fechada durante a recarga.");
    }
    let currentUrl;
    try {
      currentUrl = new URL(currentTab?.url || tab.url || "");
    } catch {
      return bridgeError("ORIGIN_NOT_ALLOWED", "A aba recarregada não possui URL válida.");
    }
    if (!pathAllowed(currentUrl, policy)) {
      return bridgeError("ORIGIN_NOT_ALLOWED", "A aba recarregada deixou a origem autorizada.");
    }
    if (!currentTab?.status || currentTab.status === "complete") {
      const location = safeLocation(currentUrl.toString());
      session.lastKnownLocation = location;
      await emitLifecycleEvent(
        session,
        "reload",
        {
          executionKey: command.executionKey,
          commandId: command.commandId,
          diagnosticCode: "BRIDGE_CONTROLLED_RELOAD",
          reasonCode:
            typeof command.payload?.reasonCode === "string" &&
            /^[A-Z0-9_]{1,96}$/.test(command.payload.reasonCode)
              ? command.payload.reasonCode
              : "CONTROLLED_RECOVERY",
          controlled: true,
          location,
        },
        {
          state: "reload",
          location,
          debuggerAttached: false,
        },
      );
      return {
        ok: true,
        reloaded: true,
        reconciliationState,
        location,
      };
    }
    await delay(50);
  }
  return bridgeError(
    "COMMAND_TIMEOUT",
    "A aba não concluiu a recarga dentro da validade do comando.",
  );
}

async function detachSessionDebugger(session) {
  if (!Number.isInteger(session?.attachedTabId)) return;
  const tabId = session.attachedTabId;
  session.attachedTabId = undefined;
  session.lastKnownLocation = undefined;
  const owners = debuggerSessionsByTab.get(tabId);
  owners?.delete(session.sessionToken);
  if (owners?.size) return;
  debuggerSessionsByTab.delete(tabId);
  intentionalDebuggerDetaches.add(tabId);
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
      intentionalDebuggerDetaches.delete(tabId);
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
    const tabs = await chrome.tabs.query({
      url: policyForPlugin(session.pluginId)?.tabPatterns || [],
    });
    const attachedTab = tabs.find((item) => item.id === tabId);
    session.lastKnownLocation = safeLocation(attachedTab?.url);
    await mutateLifecycle(session, (state) => {
      state.snapshot = {
        ...(state.snapshot || {}),
        state: "active",
        location: session.lastKnownLocation,
        debuggerAttached: true,
      };
    });
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
  if (commandCacheMatches(cached, command) && cached?.response) {
    return { ...cached.response, replayed: true };
  }
  if (commandCacheMatches(cached, command) && cached?.status === "in_flight") {
    return {
      ...bridgeError(
        "COMMAND_OUTCOME_UNKNOWN",
        "O worker reiniciou ou perdeu a resposta durante um comando com efeito potencial. Reconcile o estado externo antes de decidir por nova tentativa.",
      ),
      reconciliationRequired: true,
    };
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

  if (command.action === "reload") {
    await markCommandInFlight(command);
    const response = await enqueueTabCommand(tab.id, () =>
      Date.now() >= command.expiresAt
        ? bridgeError("COMMAND_EXPIRED", "O comando expirou antes de executar na aba.")
        : controlledReload(tab, command, policy),
    );
    if (response?.code !== "COMMAND_TIMEOUT") await cacheResponse(command, response);
    return response;
  }

  const timeoutMs = Math.max(1000, Math.min(30000, command.expiresAt - Date.now()));
  try {
    if (DURABLE_IN_FLIGHT_ACTIONS.has(command.action)) await markCommandInFlight(command);
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
  async connect(handshake) {
    if (
      !policyForPlugin(handshake?.pluginId) ||
      typeof handshake?.profileId !== "string" ||
      handshake.profileId.length < 1 ||
      handshake.profileId.length > 128 ||
      !/^[a-f0-9-]{32,64}$/i.test(String(handshake?.sessionToken || ""))
    ) {
      return bridgeError("HANDSHAKE_REJECTED", "Handshake da extensão inválido.");
    }
    const negotiation = negotiateHandshake(handshake);
    if (!negotiation.ok) return negotiation;
    const now = Date.now();
    for (const [token, session] of activeSessions) {
      if (now - session.lastSeenAt > SESSION_TTL_MS) {
        activeSessions.delete(token);
        announceJobActivity();
        void cancelConditionObservers({ sessionToken: session.sessionToken });
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
      announceJobActivity();
      void cancelConditionObservers({ sessionToken: oldest[1].sessionToken });
      void cleanupLeases({ sessionToken: oldest[1].sessionToken });
      void detachSessionDebugger(oldest[1]);
    }
    const previous = activeSessions.get(handshake.sessionToken);
    if (previous) {
      void cancelConditionObservers({ sessionToken: previous.sessionToken });
      void cleanupLeases({ sessionToken: previous.sessionToken });
      void detachSessionDebugger(previous);
    }
    const session = {
      pluginId: handshake.pluginId,
      profileId: handshake.profileId,
      sessionToken: handshake.sessionToken,
      protocolVersion: negotiation.protocolVersion,
      connectedAt: now,
      lastSeenAt: now,
    };
    activeSessions.set(handshake.sessionToken, session);
    announceJobActivity();
    const lifecycle = await initializeLifecycle(session);
    return {
      ok: true,
      pluginId: handshake.pluginId,
      ...identity(),
      protocolVersion: negotiation.protocolVersion,
      capabilities: negotiation.capabilities,
      lastSequence: lifecycle.lastSequence,
    };
  },
  async events(request) {
    const validated = validateLifecycleRequest(request);
    if (validated.error) return validated.error;
    const afterSequence = Math.max(0, Number(request?.afterSequence) || 0);
    const store = await readLifecycleStore();
    const state = store[validated.session.sessionToken];
    const events = (Array.isArray(state?.events) ? state.events : []).filter(
      (event) => Number(event?.sequence) > afterSequence,
    );
    const earliestSequence = Number(state?.events?.[0]?.sequence || state?.sequence || 0);
    return {
      ok: true,
      events,
      lastSequence: Number(state?.sequence || 0),
      snapshotRequired: earliestSequence > afterSequence + 1,
    };
  },
  async snapshot(request) {
    const validated = validateLifecycleRequest(request);
    if (validated.error) return validated.error;
    const store = await readLifecycleStore();
    const state = store[validated.session.sessionToken];
    return {
      ok: true,
      sequence: Number(state?.sequence || 0),
      snapshot: {
        state: state?.snapshot?.state || "connected",
        location: state?.snapshot?.location ?? null,
        debuggerAttached: Boolean(state?.snapshot?.debuggerAttached),
        leaseActive: Boolean(state?.snapshot?.leaseActive),
      },
    };
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
    await cancelConditionObservers({
      sessionToken: session.sessionToken,
      executionKey: request.executionKey,
    });
    await cleanupLeases({
      sessionToken: session.sessionToken,
      executionKey: request.executionKey,
    });
    await emitLifecycleEvent(session, "session_cancelled", {
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
    announceJobActivity();
    await cancelConditionObservers({ sessionToken: session.sessionToken });
    await cleanupLeases({ sessionToken: session.sessionToken });
    await detachSessionDebugger(session);
    await mutateLifecycle(session, (state) => {
      state.snapshot = {
        ...(state.snapshot || {}),
        state: "disconnected",
        debuggerAttached: false,
        leaseActive: false,
      };
    });
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
  if (alarm?.name === LEASE_ALARM) {
    void cleanupLeases({ forceExpired: true });
    void readCommandCache();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetConditionObservers({ tabId });
  for (const session of activeSessions.values()) {
    if (session.attachedTabId !== tabId) continue;
    session.attachedTabId = undefined;
    session.lastKnownLocation = undefined;
    void emitLifecycleEvent(
      session,
      "tab_closed",
      {},
      { state: "tab_closed", location: null, debuggerAttached: false, leaseActive: false },
    );
  }
  void cleanupLeases({ tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo?.url || changeInfo?.status === "loading") {
    void cancelConditionObservers({ tabId });
  }
  for (const session of activeSessions.values()) {
    if (session.attachedTabId !== tabId) continue;
    const nextLocation = changeInfo?.url ? safeLocation(changeInfo.url) : session.lastKnownLocation;
    const previousLocation = session.lastKnownLocation;
    const sameLocation =
      nextLocation &&
      previousLocation &&
      nextLocation.origin === previousLocation.origin &&
      nextLocation.pathname === previousLocation.pathname;
    const isReload = changeInfo?.status === "loading" && (!changeInfo.url || sameLocation);
    if (changeInfo?.url || isReload) {
      const type = isReload ? "reload" : "navigation";
      session.lastKnownLocation = nextLocation;
      void emitLifecycleEvent(session, type, nextLocation ? { location: nextLocation } : {}, {
        state: type,
        location: nextLocation,
      });
    }
  }
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

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId)) return;
  forgetConditionObservers({ tabId });
  if (intentionalDebuggerDetaches.delete(tabId)) return;
  const owners = debuggerSessionsByTab.get(tabId);
  debuggerSessionsByTab.delete(tabId);
  if (!owners) return;
  for (const sessionToken of owners) {
    const session = activeSessions.get(sessionToken);
    if (!session) continue;
    session.attachedTabId = undefined;
    void emitLifecycleEvent(
      session,
      "debugger_lost",
      { reason: String(reason || "detached") },
      { state: "debugger_lost", debuggerAttached: false },
    );
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port?.name !== "contentflow-provider-page") return;
  providerPorts.add(port);
  port.onDisconnect.addListener(() => {
    providerPorts.delete(port);
    announceJobActivity();
  });
  announceJobActivity();
  port.onMessage.addListener(() => {
    // Receber o heartbeat renova a vida do service worker durante o job.
  });
});
