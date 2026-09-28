// Mantém o worker ativo somente enquanto há uma sessão de execução.
function connectContentFlowBridge() {
  const port = chrome.runtime.connect({ name: "contentflow-provider-page" });
  let heartbeat;
  let jobActive = false;
  port.onMessage.addListener((message) => {
    if (message?.action !== "job-active" && message?.action !== "job-idle") return;
    jobActive = message.action === "job-active";
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    if (!jobActive) return;
    try {
      port.postMessage({ action: "keepalive" });
      heartbeat = setInterval(() => {
        try {
          port.postMessage({ action: "keepalive" });
        } catch {
          clearInterval(heartbeat);
          heartbeat = undefined;
        }
      }, 20_000);
    } catch {}
  });
  port.onDisconnect.addListener(() => {
    if (heartbeat) clearInterval(heartbeat);
    if (jobActive) setTimeout(connectContentFlowBridge, 500);
  });
}

connectContentFlowBridge();

addEventListener("pagehide", () => {
  void chrome.runtime.sendMessage({
    source: "contentflow-provider-page",
    action: "pagehide",
    url: location.href,
  });
});
