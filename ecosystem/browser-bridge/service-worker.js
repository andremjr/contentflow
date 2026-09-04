const BRIDGE_ID = "com.contentflow.browser-bridge";
const FLOW_PLUGIN_ID = "local.contentflow.google-flow-batch-images";
const PROTOCOL_VERSION = 2;
const COMMAND_CACHE_KEY = "contentflowCommandCacheV2";
const CANCELLED_EXECUTIONS_KEY = "contentflowCancelledExecutionsV2";
const MAX_COMMAND_CACHE = 500;
const CDP_VERSION = "1.3";
const COMMON_ACTIONS = new Set(["ping", "inspect", "setText", "click"]);
const policy = (origins, tabPatterns, options = {}) =>
  Object.freeze({
    origins: new Set(origins),
    tabPatterns,
    requiredPath: options.requiredPath || "",
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
  [FLOW_PLUGIN_ID]: policy(["https://labs.google"], ["https://labs.google/*"], {
    requiredPath: "/tools/flow",
    actions: ["setPrompt", "clickGenerate"],
  }),
  "local.contentflow.grok-browser-studio": policy(["https://grok.com"], ["https://grok.com/*"]),
  "local.contentflow.meta-ai-browser-studio": policy(
    ["https://meta.ai", "https://www.meta.ai"],
    ["https://meta.ai/*", "https://www.meta.ai/*"],
  ),
});
const inFlight = new Map();
const tabQueues = new Map();
let activeSession = null;

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

function selectPluginTab(tabs, expectedUrl, policy) {
  const expected = new URL(expectedUrl);
  if (!policy.origins.has(expected.origin)) return null;
  const candidates = tabs.filter((tab) => {
    try {
      const url = new URL(tab.url || "");
      return policy.origins.has(url.origin) && url.pathname.includes(policy.requiredPath);
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

async function markExecutionCancelled(executionKey) {
  const stored = await chrome.storage.session.get(CANCELLED_EXECUTIONS_KEY);
  const now = Date.now();
  const cancellations = Object.fromEntries(
    Object.entries(stored?.[CANCELLED_EXECUTIONS_KEY] || {}).filter(
      ([, expiresAt]) => Number(expiresAt) > now,
    ),
  );
  cancellations[executionKey] = now + 12 * 60 * 60 * 1000;
  await chrome.storage.session.set({ [CANCELLED_EXECUTIONS_KEY]: cancellations });
}

async function isExecutionCancelled(executionKey) {
  const stored = await chrome.storage.session.get(CANCELLED_EXECUTIONS_KEY);
  return Number(stored?.[CANCELLED_EXECUTIONS_KEY]?.[executionKey]) > Date.now();
}

function validateSession(command) {
  if (!activeSession || command?.sessionToken !== activeSession.sessionToken) {
    return bridgeError(
      "SESSION_MISMATCH",
      "A sessão efêmera da extensão não corresponde à execução.",
    );
  }
  if (
    command.pluginId !== activeSession.pluginId ||
    !policyForPlugin(command.pluginId) ||
    command.protocolVersion !== PROTOCOL_VERSION
  ) {
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
  if (!policyForPlugin(command.pluginId).actions.has(command.action)) {
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

async function sendCdp(tabId, method, params = {}) {
  return await chrome.debugger.sendCommand({ tabId }, method, params);
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
  if (value) {
    await sendCdp(tabId, "Input.insertText", { text: value });
  } else {
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
  }
}

async function dispatchCdpAction(tabId, command, policy) {
  if (await isExecutionCancelled(command.executionKey)) {
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
  if (!policy.origins.has(pageUrl.origin) || !pageUrl.pathname.includes(policy.requiredPath)) {
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
    const target = await targetFor(tabId, payload, "editable", true);
    if (!target?.found) {
      return bridgeError("EDITOR_NOT_FOUND", "Editor não encontrado.");
    }
    if (await isExecutionCancelled(command.executionKey)) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    await dispatchMouseClick(tabId, target);
    const text = String(payload.text || "");
    await replaceFocusedText(tabId, text);
    const actual = String((await evaluateValue(tabId, `(${readFocusedText.toString()})()`)) || "")
      .replace(/\uFEFF/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const expected = text.replace(/\s+/g, " ").trim();
    if (expected && actual !== expected && !actual.includes(expected.slice(0, 80))) {
      return bridgeError("EDITOR_WRITE_FAILED", "O texto não permaneceu no editor.");
    }
    return { ok: true, readbackLength: actual.length };
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
    if (await isExecutionCancelled(command.executionKey)) {
      return bridgeError("CANCELLED", "Execução cancelada.");
    }
    await dispatchMouseClick(tabId, target);
    return { ok: true, text: target.text };
  }
  return bridgeError("UNKNOWN_ACTION", `Ação não suportada: ${String(command.action)}`);
}

async function withAttachedDebugger(tabId, operation) {
  let attached = false;
  let result;
  let failure;
  try {
    await chrome.debugger.attach({ tabId }, CDP_VERSION);
    attached = true;
    result = await operation();
  } catch (error) {
    failure = error;
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (error) {
        failure ||= error;
      }
    }
  }
  if (failure) throw failure;
  return result;
}

async function dispatchToPage(command) {
  const policy = policyForPlugin(command.pluginId);
  let expectedUrl;
  try {
    expectedUrl = new URL(command.expectedUrl);
  } catch {
    return bridgeError("INVALID_COMMAND", "expectedUrl inválida.");
  }
  if (!policy || !policy.origins.has(expectedUrl.origin)) {
    return bridgeError("ORIGIN_NOT_ALLOWED", "A origem não foi autorizada para este plugin.");
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

  const tabs = await chrome.tabs.query({ url: policy.tabPatterns });
  const tab = selectPluginTab(tabs, expectedUrl.toString(), policy);
  if (!Number.isInteger(tab?.id)) {
    return bridgeError(
      "PLUGIN_TAB_NOT_FOUND",
      "A aba exata do provedor não foi encontrada no perfil dedicado.",
    );
  }

  const timeoutMs = Math.max(1000, Math.min(30000, command.expiresAt - Date.now()));
  try {
    const response = await withTimeout(
      enqueueTabCommand(tab.id, () =>
        withAttachedDebugger(tab.id, () => dispatchCdpAction(tab.id, command, policy)),
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
      !/^[a-f0-9-]{32,64}$/i.test(String(handshake?.sessionToken || ""))
    ) {
      return bridgeError("HANDSHAKE_REJECTED", "Handshake da extensão inválido.");
    }
    activeSession = {
      pluginId: handshake.pluginId,
      profileId: handshake.profileId,
      sessionToken: handshake.sessionToken,
      connectedAt: Date.now(),
    };
    return { ok: true, pluginId: handshake.pluginId, ...identity() };
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
    await markExecutionCancelled(request.executionKey);
    return { ok: true };
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.source === "contentflow-provider-page" && message?.action === "wake") {
    sendResponse({ ok: true, ...identity() });
  }
  return false;
});
