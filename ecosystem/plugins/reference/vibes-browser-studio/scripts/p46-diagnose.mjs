import { createHash } from "node:crypto";

const basePort = Number(process.env.CONTENTFLOW_VIBES_P46_PORT || 9430);
const profile = String(process.env.CONTENTFLOW_VIBES_P46_PROFILE || "default");
const port =
  basePort +
  (Number.parseInt(createHash("sha256").update(profile).digest("hex").slice(0, 4), 16) % 700);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
  response.json(),
);
const page = targets.find(
  (target) => target.type === "page" && target.url.startsWith("https://vibes.ai/"),
);
if (!page?.webSocketDebuggerUrl) throw new Error("Aba Vibes não encontrada no perfil dedicado.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const expression = `(() => ({
  path: location.pathname,
  visibility: document.visibilityState,
  identities: [...document.querySelectorAll('[data-analytics-media-id]')].map((element) => ({
    tag: element.tagName,
    analytics: element.getAttribute('data-analytics-id'),
    mediaId: element.getAttribute('data-analytics-media-id')
  })),
  images: [...document.images].map((image) => ({
    alt: image.getAttribute('alt'),
    width: image.naturalWidth,
    height: image.naturalHeight,
    declaredWidth: image.getAttribute('width'),
    declaredHeight: image.getAttribute('height'),
    complete: image.complete,
    hasSource: Boolean(image.currentSrc || image.src),
    loading: image.loading,
    ancestorAnalytics: image.closest('[data-analytics-id]')?.getAttribute('data-analytics-id') || null
  })),
  videos: [...document.querySelectorAll('video')].map((video) => ({
    readyState: video.readyState,
    width: video.videoWidth,
    height: video.videoHeight,
    hasSource: Boolean(video.currentSrc || video.src || video.querySelector('source')?.src),
    ancestorMediaId: video.closest('[data-analytics-media-id]')?.getAttribute('data-analytics-media-id') || null
  })),
  dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => ({
    visible: Boolean(dialog.getClientRects().length),
    headings: [...dialog.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .map((heading) => heading.textContent?.trim())
      .filter(Boolean),
    text: String(dialog.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  })),
  fileInputs: [...document.querySelectorAll('input[type="file"]')].map((input, index) => ({
    index,
    disabled: input.disabled,
    accept: input.accept,
    files: [...(input.files || [])].map((file) => file.name),
    dialogHeadings: [...(input.closest('[role="dialog"]')?.querySelectorAll('h1,h2,h3,[role="heading"]') || [])]
      .map((heading) => heading.textContent?.trim())
      .filter(Boolean)
  })),
  alerts: [...document.querySelectorAll('[role="alert"]')]
    .filter((alert) => alert.getClientRects().length)
    .map((alert) => String(alert.innerText || alert.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean),
  statusLines: String(document.body?.innerText || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /generat|gerando|vídeo|video|falhou|failed|erro|error/i.test(line))
    .slice(0, 30),
  controls: [...document.querySelectorAll('button')]
    .map((button) => button.getAttribute('aria-label'))
    .filter(Boolean)
    .slice(-30),
  dialogButtons: [...document.querySelectorAll('[role="dialog"] button')].map((button) => ({
    text: String(button.innerText || button.textContent || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
    disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
    headings: [...(button.closest('[role="dialog"]')?.querySelectorAll('h1,h2,h3,[role="heading"]') || [])]
      .map((heading) => heading.textContent?.trim())
      .filter(Boolean)
  })),
  visibleButtons: [...document.querySelectorAll('button,[role="button"]')]
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((button) => ({
      text: String(button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      aria: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      testId: button.getAttribute('data-testid') || button.getAttribute('data-test-id'),
      disabled: button.disabled || button.getAttribute('aria-disabled') === 'true'
    }))
    .filter((button) => button.text || button.aria || button.title || button.testId)
}))()`;
const response = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP não respondeu.")), 5000);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timer);
    resolve(message);
  });
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true },
    }),
  );
});
socket.close();
console.log(JSON.stringify({ port, ...response.result.result.value }, null, 2));
if (process.env.CONTENTFLOW_VIBES_P46_CLOSE === "1") {
  const closeSocket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    closeSocket.addEventListener("open", resolve, { once: true });
    closeSocket.addEventListener("error", reject, { once: true });
  });
  closeSocket.send(JSON.stringify({ id: 2, method: "Browser.close" }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  closeSocket.close();
}
