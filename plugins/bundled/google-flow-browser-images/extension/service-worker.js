const PROTOCOL_VERSION = 1;
const FLOW_ORIGIN = "https://labs.google";

function bridgeError(code, message) {
  return { ok: false, code, message };
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
    (candidates.length === 1 ? candidates[0] : null)
  );
}

globalThis.contentFlowBridge = Object.freeze({
  protocolVersion: PROTOCOL_VERSION,
  async dispatch(command) {
    if (!command || command.protocolVersion !== PROTOCOL_VERSION) {
      return bridgeError("PROTOCOL_MISMATCH", "Versão de protocolo da extensão incompatível.");
    }
    if (typeof command.commandId !== "string" || !command.commandId) {
      return bridgeError("INVALID_COMMAND", "commandId ausente.");
    }
    let expectedUrl;
    try {
      expectedUrl = new URL(command.expectedUrl);
    } catch {
      return bridgeError("INVALID_COMMAND", "expectedUrl inválida.");
    }
    if (expectedUrl.origin !== FLOW_ORIGIN) {
      return bridgeError("ORIGIN_NOT_ALLOWED", "A extensão aceita somente páginas do Google Flow.");
    }

    const tabs = await chrome.tabs.query({ url: `${FLOW_ORIGIN}/*` });
    const tab = selectFlowTab(tabs, expectedUrl.toString());
    if (!Number.isInteger(tab?.id)) {
      return bridgeError(
        "FLOW_TAB_NOT_FOUND",
        "Não foi possível identificar uma única aba do Google Flow.",
      );
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        source: "contentflow-os",
        protocolVersion: PROTOCOL_VERSION,
        commandId: command.commandId,
        action: command.action,
        payload: command.payload || {},
      });
      return response && typeof response === "object"
        ? response
        : bridgeError("INVALID_RESPONSE", "A página retornou uma resposta inválida.");
    } catch (error) {
      return bridgeError(
        "CONTENT_SCRIPT_UNAVAILABLE",
        `A ponte da página não respondeu: ${error?.message || String(error)}`,
      );
    }
  },
});
