const words = {
  pt: {
    materials: "Materiais do canal",
    materialsIntro: "Os materiais compartilhados nos vídeos do canal, reunidos aqui para você baixar e usar.",
    skill: "SKILL",
    prompts: "PROMPTS",
    catalogLabel: "Catálogo do ecossistema",
    typeLabel: "Tipo",
    processLabel: "Processo",
    selectItem: "Selecionar para download",

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
    sourceCode: "Código-fonte",
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
    materials: "Channel materials",
    materialsIntro: "The materials shared in the channel’s videos, collected here for you to download and use.",
    skill: "SKILL",
    prompts: "PROMPTS",
    catalogLabel: "Ecosystem catalog",
    typeLabel: "Type",
    processLabel: "Process",
    selectItem: "Select for download",

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
    sourceCode: "Source code",
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
    materials: "Materiales del canal",
    materialsIntro: "Los materiales compartidos en los vídeos del canal, reunidos aquí para descargar y usar.",
    skill: "SKILL",
    prompts: "PROMPTS",
    catalogLabel: "Catálogo del ecosistema",
    typeLabel: "Tipo",
    processLabel: "Proceso",
    selectItem: "Seleccionar para descargar",

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
    sourceCode: "Código fuente",
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
let methodData = [], materialData = [];
let language = localStorage.getItem("contentflow-site-language") || "pt",
  kind = ["plugins", "methods", "materials"].includes(new URLSearchParams(location.search).get("category")) ? new URLSearchParams(location.search).get("category") : "plugins",
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
  return `ecosystem-assets/plugin-${plugin.asset.replace("ContentFlow-Plugin-", "").replace(".zip", "")}.png`;
}
function urlFor(item) { return item.downloadUrl; }
function filteredData() {
  const source = kind === "plugins" ? catalog : kind === "methods" ? methodData : materialData,
    term = search.value.trim().toLocaleLowerCase();
  return source.filter((item) => {
    const matchesSearch =
        !term ||
        `${item.name} ${descriptionFor(item)}`.toLocaleLowerCase().includes(term),
      matchesDelivery =
        kind === "materials" || deliveryFilter.value === "all" ||
        item.delivery.includes(deliveryFilter.value) ||
        item.features?.includes(deliveryFilter.value),
      matchesProcess =
        kind === "materials" || processFilter.value === "all" ||
        item.process.includes(processFilter.value);
    return matchesSearch && matchesDelivery && matchesProcess;
  });
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"})[char]); }
function descriptionFor(item) {
  return typeof item.description === "string" ? item.description : item.description?.[language] ?? item.description?.pt ?? "";
}
function render() {
  const materials = kind === "materials";
  deliveryFilter.hidden = materials;
  processFilter.hidden = materials;
  document.querySelector(".source-links").hidden = materials;
  document.querySelector("#materials-intro").hidden = !materials;

  const data = filteredData();
  resultCount.textContent = `${data.length} ${words[language].results}`;
  gallery.innerHTML = data.length
    ? data
        .map((item) => {
          const url = urlFor(item);
          return `<article class="card ${kind === "plugins" ? "plugin" : kind === "materials" ? "material" : ""}"><label><input class="select" type="checkbox" aria-label="${escapeHtml(words[language].selectItem + ": " + item.name)}" data-url="${escapeHtml(url)}" ${selected.has(url) ? "checked" : ""}></label><div class="cover"><img src="${kind === "plugins" ? icon(item) : kind === "materials" ? item.cover : "logo-mark.png"}" onerror="this.src='logo-mark.png'" alt="${escapeHtml(item.name)}"></div><div class="body"><small>${words[language][kind === "plugins" ? "plugin" : kind === "methods" ? "method" : item.type] + (kind === "materials" ? " · " + item.format : "")}</small><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(descriptionFor(item))}</p><a href="${escapeHtml(url)}" download>${words[language].downloadItem}</a></div></article>`;
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
  document.querySelectorAll(".tab").forEach(tab => (tab.classList.toggle("active", tab.dataset.kind === kind), tab.setAttribute("aria-pressed", tab.dataset.kind === kind)));
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
      search.value = "";
      deliveryFilter.value = "all";
      processFilter.value = "all";
      const url = new URL(location.href);
      url.searchParams.set("category", kind);
      history.replaceState(null, "", url);

      document
        .querySelectorAll(".tab")
        .forEach((tab) => (tab.classList.toggle("active", tab === element), tab.setAttribute("aria-pressed", tab === element)));
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
// Each catalog loads independently, so channel downloads remain available if an external catalog fails.
setLanguage(language);
fetch(new URL("channel-materials.json", document.baseURI))
  .then(response => { if (!response.ok) throw new Error("materials"); return response.json(); })
  .then(data => { materialData = data.materials; render(); })
  .catch(() => render());
fetch("https://raw.githubusercontent.com/andremjr/plugins-contentflow/main/catalog.json")
  .then(response => { if (!response.ok) throw new Error("catalog"); return response.json(); })
  .then(data => {
    catalog = data.plugins.map((plugin, index) => ({
      ...plugin, ...(pluginMeta[plugin.asset] ?? { delivery: [], process: [] }), slug: `plugin-${index}`,
    }));
    render();
  }).catch(() => render());
fetch("https://raw.githubusercontent.com/andremjr/methods-contentflow/main/catalog.json")
  .then(response => { if (!response.ok) throw new Error("catalog"); return response.json(); })
  .then(data => {
    methodData = data.methods.map(method => ({ ...method, slug: method.id, url: method.downloadUrl, process: ["assets"], delivery: ["image", "video"] }));
    render();
  }).catch(() => render());
