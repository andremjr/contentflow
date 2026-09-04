// Mantém o Service Worker detectável após a navegação do provedor. A execução de
// ações de UI é feita exclusivamente por CDP no service-worker.js.
chrome.runtime.sendMessage({ source: "contentflow-provider-page", action: "wake" }).catch(() => {});
