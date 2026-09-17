const words = {
  pt: {
    navFlow: "Como funciona",
    navCommunity: "Comunidade VIP",
    navEcosystem: "Ecossistema",
    navConcept: "Conceito",
    downloadHeader: "Baixar para Windows",
    communityCtaEyebrow: "COMUNIDADE ABERTA",
    communityCtaTitle: "Vamos conversar sobre canais Dark, YouTube e ContentFlow?",
    communityCtaText:
      "A comunidade do WhatsApp fica aberta às segundas, terças e sábados. Entre para participar da conversa e acompanhar o canal.",
    communityCtaWhatsapp: "Entrar na comunidade do WhatsApp",
    communityCtaYoutube: "Ver canal no YouTube",
    downloadItem: "Baixar",
    home: "Início",
    downloadSelected: "Baixar selecionados",
    plugins: "Plugins",
    methods: "Métodos",
    selected: "selecionados",
    plugin: "PLUGIN",
    method: "MÉTODO",
    empty: "Nenhum item encontrado.",
    searchPlaceholder: "Pesquisar por nome ou função",
    searchLabel: "Pesquisar por nome ou função",
    allTypes: "Todos os tipos",
    text: "Gerador de texto",
    image: "Gerador de imagem",
    audio: "Áudio",
    video: "Vídeo",
    tool: "Ferramenta",
    allProcesses: "Todos os processos",
    theme: "Tema",
    title: "Título",
    thumbnail: "Thumbnail",
    script: "Roteiro",
    narration: "Narração",
    assets: "Assets",
    editing: "Edição",
    publishing: "Publicação",
    results: "resultados",
  },
  en: {
    navFlow: "How it works",
    navCommunity: "VIP Community",
    navEcosystem: "Ecosystem",
    navConcept: "Concept",
    downloadHeader: "Download for Windows",
    communityCtaEyebrow: "OPEN COMMUNITY",
    communityCtaTitle: "Let’s talk about Dark channels, YouTube, and ContentFlow.",
    communityCtaText:
      "The WhatsApp community is open on Mondays, Tuesdays, and Saturdays. Join the conversation and follow the channel.",
    communityCtaWhatsapp: "Join the WhatsApp community",
    communityCtaYoutube: "Visit the YouTube channel",
    downloadItem: "Download",
    home: "Home",
    downloadSelected: "Download selected",
    plugins: "Plugins",
    methods: "Methods",
    selected: "selected",
    plugin: "PLUGIN",
    method: "METHOD",
    empty: "No items found.",
    searchPlaceholder: "Search by name or function",
    searchLabel: "Search by name or function",
    allTypes: "All types",
    text: "Text generator",
    image: "Image generator",
    audio: "Audio",
    video: "Video",
    tool: "Tool",
    allProcesses: "All processes",
    theme: "Theme",
    title: "Title",
    thumbnail: "Thumbnail",
    script: "Script",
    narration: "Narration",
    assets: "Assets",
    editing: "Editing",
    publishing: "Publishing",
    results: "results",
  },
  es: {
    navFlow: "Cómo funciona",
    navCommunity: "Comunidad VIP",
    navEcosystem: "Ecosistema",
    navConcept: "Concepto",
    downloadHeader: "Descargar para Windows",
    communityCtaEyebrow: "COMUNIDAD ABIERTA",
    communityCtaTitle: "Hablemos de canales Dark, YouTube y ContentFlow.",
    communityCtaText:
      "La comunidad de WhatsApp está abierta los lunes, martes y sábados. Únete a la conversación y sigue el canal.",
    communityCtaWhatsapp: "Entrar a la comunidad de WhatsApp",
    communityCtaYoutube: "Ver el canal de YouTube",
    downloadItem: "Descargar",
    home: "Inicio",
    downloadSelected: "Descargar seleccionados",
    plugins: "Plugins",
    methods: "Métodos",
    selected: "seleccionados",
    plugin: "PLUGIN",
    method: "MÉTODO",
    empty: "No se encontraron elementos.",
    searchPlaceholder: "Buscar por nombre o función",
    searchLabel: "Buscar por nombre o función",
    allTypes: "Todos los tipos",
    text: "Generador de texto",
    image: "Generador de imagen",
    audio: "Audio",
    video: "Vídeo",
    tool: "Herramienta",
    allProcesses: "Todos los procesos",
    theme: "Tema",
    title: "Título",
    thumbnail: "Miniatura",
    script: "Guion",
    narration: "Narración",
    assets: "Recursos",
    editing: "Edición",
    publishing: "Publicación",
    results: "resultados",
  },
};
const allProcesses = [
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
];
const pluginMeta = {
  "ContentFlow-Plugin-assemblyai-srt.zip": {
    delivery: ["text", "processing"],
    process: ["narration", "assets", "editing"],
    features: ["srt"],
  },
  "ContentFlow-Plugin-antigravity-skill-runner.zip": {
    delivery: ["text", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-claude-code-skill-runner.zip": {
    delivery: ["text", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-codex-skill-runner.zip": {
    delivery: ["text", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-manual-tool-launcher.zip": {
    delivery: ["processing"],
    process: [],
  },
  "ContentFlow-Plugin-chatgpt-browser-studio.zip": {
    delivery: ["text", "image", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-claude-browser-text.zip": {
    delivery: ["text", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-free-stock-media-studio.zip": {
    delivery: ["image", "video", "processing"],
    process: ["thumbnail", "assets", "editing"],
  },
  "ContentFlow-Plugin-gemini-browser-studio.zip": {
    delivery: ["text", "image", "audio", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-google-flow-browser-images.zip": {
    delivery: ["image", "video"],
    process: ["thumbnail", "assets", "editing"],
  },
  "ContentFlow-Plugin-grok-browser-studio.zip": {
    delivery: ["text", "image", "video", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-mai-playground-browser.zip": {
    delivery: ["audio", "text", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-meta-ai-browser-studio.zip": {
    delivery: ["text", "image", "video", "processing"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-text-file-builder.zip": {
    delivery: ["text"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-anthropic-claude.zip": {
    delivery: ["text"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-edge-tts.zip": {
    delivery: ["audio", "processing"],
    process: ["narration"],
  },
  "ContentFlow-Plugin-elevenlabs.zip": {
    delivery: ["text", "audio", "processing"],
    process: ["narration", "assets", "editing", "script"],
  },
  "ContentFlow-Plugin-ffmpeg-image-sequence-video.zip": {
    delivery: ["video", "processing"],
    process: ["editing"],
  },
  "ContentFlow-Plugin-openai-gpt.zip": {
    delivery: ["text"],
    process: allProcesses,
  },
  "ContentFlow-Plugin-silence-remover.zip": {
    delivery: ["audio", "video", "processing"],
    process: ["narration", "editing"],
  },
};
const methodData = [
  [
    "theme",
    "Método de Tema",
    "4 blocos: categoria, ângulo, geração e escolha final.",
  ],
  [
    "title",
    "Método de Título",
    "2 blocos: opções de título e validação humana.",
  ],
  [
    "thumbnail",
    "Método de Thumbnail",
    "3 blocos: prompt, geração no Flow e aprovação.",
  ],
  [
    "script",
    "Método de Roteiro",
    "11 blocos: pesquisa, estrutura, dossiê, roteiro e validação.",
  ],
  [
    "narration",
    "Método de Narração e Áudio",
    "Geração da narração a partir do roteiro aprovado.",
  ],
  [
    "assets",
    "Método de Assets Visuais",
    "SRT, prompts visuais e imagens em lote no Flow.",
  ],
].map(([process, name, description]) => ({
  slug: process,
  name,
  description,
  url: `downloads/methods/historicos-contentflow-${process}.contentflow-method.zip`,
  process: [process],
  delivery:
    process === "assets"
      ? ["image", "srt"]
      : process === "narration"
        ? ["audio"]
        : ["text"],
}));
let language = localStorage.getItem("contentflow-site-language") || "pt",
  kind = "plugins",
  catalog = [],
  selected = new Set();
const gallery = document.querySelector("#gallery"),
  count = document.querySelector("#selection-count"),
  download = document.querySelector("#download-selected"),
  search = document.querySelector("#search"),
  deliveryFilter = document.querySelector("#delivery-filter"),
  processFilter = document.querySelector("#process-filter"),
  resultCount = document.querySelector("#result-count");
function icon(plugin) {
  return `ecosystem-assets/plugin-${plugin.downloadUrl.replace("ContentFlow-Plugin-", "").replace(".zip", "")}.png`;
}
function urlFor(item) {
  return kind === "plugins"
    ? `https://github.com/andremjr/contentflow/releases/latest/download/${item.downloadUrl}`
    : item.url;
}
function filteredData() {
  const source = kind === "plugins" ? catalog : methodData,
    term = search.value.trim().toLocaleLowerCase();
  return source.filter((item) => {
    const matchesSearch =
        !term ||
        `${item.name} ${item.description}`.toLocaleLowerCase().includes(term),
      matchesDelivery =
        deliveryFilter.value === "all" ||
        item.delivery.includes(deliveryFilter.value) ||
        item.features?.includes(deliveryFilter.value),
      matchesProcess =
        processFilter.value === "all" ||
        item.process.includes(processFilter.value);
    return matchesSearch && matchesDelivery && matchesProcess;
  });
}
function render() {
  const data = filteredData();
  resultCount.textContent = `${data.length} ${words[language].results}`;
  gallery.innerHTML = data.length
    ? data
        .map((item) => {
          const url = urlFor(item);
          return `<article class="card ${kind === "plugins" ? "plugin" : ""}"><label><input class="select" type="checkbox" data-url="${url}" ${selected.has(url) ? "checked" : ""}></label><div class="cover"><img src="${kind === "plugins" ? icon(item) : "ecosystem-assets/historicos.webp"}" onerror="this.src='logo-mark.png'" alt="${item.name}"></div><div class="body"><small>${words[language][kind === "plugins" ? "plugin" : "method"]}</small><h2>${item.name}</h2><p>${item.description}</p><a href="${url}" download>${words[language].downloadItem}</a></div></article>`;
        })
        .join("")
    : `<div class="empty">${words[language].empty}</div>`;
  gallery.querySelectorAll(".select").forEach(
    (box) =>
      (box.onchange = () => {
        box.checked
          ? selected.add(box.dataset.url)
          : selected.delete(box.dataset.url);
        update();
      }),
  );
  update();
}
function update() {
  count.textContent = selected.size
    ? `${selected.size} ${words[language].selected}`
    : "";
  download.disabled = !selected.size;
}
function setLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === "pt" ? "pt-BR" : language;
  document
    .querySelectorAll("[data-i18n]")
    .forEach(
      (element) =>
        (element.textContent = words[language][element.dataset.i18n]),
    );
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach(
      (element) =>
        (element.placeholder =
          words[language][element.dataset.i18nPlaceholder]),
    );
  document
    .querySelectorAll("[data-i18n-aria]")
    .forEach((element) =>
      element.setAttribute(
        "aria-label",
        words[language][element.dataset.i18nAria],
      ),
    );
  document
    .querySelectorAll("[data-language]")
    .forEach((element) =>
      element.setAttribute(
        "aria-pressed",
        element.dataset.language === language,
      ),
    );
  localStorage.setItem("contentflow-site-language", language);
  render();
}
document
  .querySelectorAll("[data-language]")
  .forEach(
    (element) =>
      (element.onclick = () => setLanguage(element.dataset.language)),
  );
document.querySelectorAll(".tab").forEach(
  (element) =>
    (element.onclick = () => {
      kind = element.dataset.kind;
      selected.clear();
      document
        .querySelectorAll(".tab")
        .forEach((tab) => tab.classList.toggle("active", tab === element));
      render();
    }),
);
[search, deliveryFilter, processFilter].forEach((element) =>
  element.addEventListener(element === search ? "input" : "change", render),
);
download.onclick = () =>
  [...selected].forEach((url, index) =>
    setTimeout(() => {
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      link.click();
    }, index * 400),
  );
fetch(new URL("ecosystem-catalog.json", document.baseURI))
  .then((response) => response.json())
  .then((data) => {
    catalog = data.plugins.map((plugin, index) => ({
      ...plugin,
      ...(pluginMeta[plugin.downloadUrl] ?? { delivery: [], process: [] }),
      slug: `plugin-${index}`,
    }));
    setLanguage(language);
  })
  .catch(() => setLanguage(language));
