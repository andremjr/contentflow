const PLUGIN_ID = "local.contentflow.google-flow-batch-images";
const PROTOCOL_VERSION = 2;
const cancelledExecutions = new Set();

function visible(element) {
  if (!(element instanceof Element)) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0 &&
    rect.width > 12 &&
    rect.height > 12
  );
}

function allDeep(selector, root = document) {
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
}

function textOf(element) {
  return [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("placeholder"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isEditable(element) {
  if (!(element instanceof Element) || !visible(element) || element.disabled || element.readOnly) {
    return false;
  }
  const contenteditable = (element.getAttribute("contenteditable") || "").toLowerCase();
  return (
    element.getAttribute("data-slate-editor") === "true" ||
    contenteditable === "true" ||
    contenteditable === "plaintext-only" ||
    element.matches('textarea, input[type="text"], input:not([type]), [role="textbox"]')
  );
}

function promptCandidate(customSelector) {
  if (customSelector) {
    try {
      const custom = allDeep(customSelector).find(isEditable);
      if (custom) return custom;
    } catch {
      // O seletor customizado inválido não bloqueia as heurísticas seguras.
    }
  }
  const placeholders = allDeep('[data-slate-placeholder="true"]').filter((element) =>
    /^(o que você quer criar\?|what do you want to create\?)$/i.test(
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    ),
  );
  for (const placeholder of placeholders) {
    const closest = placeholder.closest(
      '[data-slate-editor="true"], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]',
    );
    if (isEditable(closest)) return closest;
    let current = placeholder.parentElement;
    for (let depth = 0; depth < 20 && current; depth += 1, current = current.parentElement) {
      if (isEditable(current)) return current;
      const slate = current.querySelector?.('[data-slate-editor="true"]');
      if (isEditable(slate)) return slate;
    }
  }
  return allDeep(
    '[data-slate-editor="true"], [contenteditable="true"], [contenteditable="plaintext-only"], textarea, input[type="text"], [role="textbox"]',
  ).find(isEditable);
}

function generateCandidate(prompt, customSelector, requireEnabled) {
  if (customSelector) {
    try {
      const custom = allDeep(customSelector).find(
        (element) => visible(element) && (!requireEnabled || !element.disabled),
      );
      if (custom) return custom;
    } catch {
      // Continua com a busca semântica.
    }
  }
  const promptRect = prompt?.getBoundingClientRect?.();
  const candidates = allDeep('button, [role="button"]').filter((element) => {
    if (!visible(element)) return false;
    if (requireEnabled && (element.disabled || element.getAttribute("aria-disabled") === "true")) {
      return false;
    }
    const text = textOf(element);
    return /(^|\s)(criar|create|gerar|generate)(\s|$)/i.test(text);
  });
  if (!promptRect) return candidates[0] || null;
  return (
    candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const distance =
          Math.abs(rect.left + rect.width / 2 - (promptRect.left + promptRect.width / 2)) +
          Math.abs(rect.top + rect.height / 2 - (promptRect.top + promptRect.height / 2));
        return { element, distance };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.element || null
  );
}

function replaceText(element, value) {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value;
  }

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, value);
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
  );
  return element.innerText || element.textContent || "";
}

async function dispatchAction(action, payload) {
  if (location.origin !== "https://labs.google" || !location.pathname.includes("/tools/flow")) {
    return { ok: false, code: "WRONG_PAGE", message: "A aba selecionada não é do Google Flow." };
  }
  if (action === "ping") return { ok: true, protocolVersion: PROTOCOL_VERSION, url: location.href };
  if (action === "inspect") {
    return {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      url: location.href,
      title: document.title,
      promptReady: Boolean(promptCandidate(payload.promptSelector || "")),
    };
  }
  if (action === "setPrompt") {
    const prompt = promptCandidate(payload.promptSelector || "");
    if (!prompt)
      return { ok: false, code: "PROMPT_NOT_FOUND", message: "Editor do prompt não encontrado." };
    const expected = String(payload.text || "")
      .replace(/\s+/g, " ")
      .trim();
    const actual = String(replaceText(prompt, String(payload.text || "")))
      .replace(/\uFEFF/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!actual || (expected.slice(0, 60) && !actual.includes(expected.slice(0, 60)))) {
      return {
        ok: false,
        code: "PROMPT_WRITE_FAILED",
        message: "O texto não permaneceu no editor.",
      };
    }
    return { ok: true, readbackLength: actual.length };
  }
  if (action === "clickGenerate") {
    const prompt = promptCandidate(payload.promptSelector || "");
    const button = generateCandidate(prompt, payload.generateSelector || "", true);
    if (!button)
      return {
        ok: false,
        code: "GENERATE_NOT_FOUND",
        message: "Botão Criar/Gerar não encontrado ou desabilitado.",
      };
    const label = textOf(button);
    button.click();
    return { ok: true, text: label };
  }
  return { ok: false, code: "UNKNOWN_ACTION", message: `Ação não suportada: ${String(action)}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.source !== "contentflow-os" ||
    message?.pluginId !== PLUGIN_ID ||
    message?.protocolVersion !== PROTOCOL_VERSION ||
    typeof message?.commandId !== "string" ||
    typeof message?.profileId !== "string" ||
    typeof message?.executionKey !== "string"
  ) {
    return false;
  }
  if (message.action === "cancel") {
    cancelledExecutions.add(message.executionKey);
    sendResponse({ ok: true });
    return false;
  }
  if (cancelledExecutions.has(message.executionKey)) {
    sendResponse({ ok: false, code: "CANCELLED", message: "Execução cancelada." });
    return false;
  }
  const cacheKey = `contentflow:${message.commandId}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.executionKey === message.executionKey && cached?.response) {
      sendResponse({ ...cached.response, replayed: true });
      return false;
    }
  } catch {
    sessionStorage.removeItem(cacheKey);
  }
  dispatchAction(message.action, message.payload || {})
    .then((response) => {
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ executionKey: message.executionKey, response, storedAt: Date.now() }),
        );
      } catch {
        // A idempotência principal também existe no storage.session do service worker.
      }
      sendResponse(response);
    })
    .catch((error) =>
      sendResponse({
        ok: false,
        code: "CONTENT_SCRIPT_ERROR",
        message: error?.message || String(error),
      }),
    );
  return true;
});

chrome.runtime.sendMessage({ source: "contentflow-flow-page", action: "wake" }).catch(() => {});
