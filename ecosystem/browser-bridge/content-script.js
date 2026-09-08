// Mantém o Service Worker detectável durante jobs longos. Abrir a porta não é
// suficiente nas versões atuais do Chrome, portanto a página autorizada envia
// um heartbeat curto enquanto continuar aberta.
function connectContentFlowBridge() {
  const port = chrome.runtime.connect({ name: "contentflow-provider-page" });
  const heartbeat = setInterval(() => {
    try {
      port.postMessage({ action: "keepalive" });
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);
  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat);
    setTimeout(connectContentFlowBridge, 500);
  });
  port.postMessage({ action: "keepalive" });
}

connectContentFlowBridge();
