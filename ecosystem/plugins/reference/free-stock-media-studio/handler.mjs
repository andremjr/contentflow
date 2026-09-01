import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PROVIDERS = Object.freeze({
  pexels: { label: "Pexels", secret: "PEXELS_API_KEY" },
  pixabay: { label: "Pixabay", secret: "PIXABAY_API_KEY" },
  unsplash: { label: "Unsplash", secret: "UNSPLASH_ACCESS_KEY" },
  coverr: { label: "Coverr", secret: "COVERR_API_KEY" },
  openverse: { label: "Openverse" },
  wikimedia: { label: "Wikimedia Commons" },
  nasa: { label: "NASA" },
});
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_JSON_BYTES = 1_750_000;
const PROVIDER_PAGE_LIMITS = Object.freeze({
  image: Object.freeze({
    pexels: 80,
    pixabay: 200,
    unsplash: 30,
    openverse: 20,
    wikimedia: 500,
    nasa: 100,
  }),
  video: Object.freeze({
    pexels: 80,
    pixabay: 200,
    coverr: 100,
    wikimedia: 500,
    nasa: 100,
  }),
});
const PROVIDER_PRIORITY = Object.freeze({
  image: Object.freeze(["pexels", "pixabay", "unsplash", "openverse", "wikimedia", "nasa"]),
  video: Object.freeze(["pexels", "pixabay", "coverr", "wikimedia", "nasa"]),
});

class PluginFailure extends Error {
  constructor(code, message, retryable = false, retryAfterMs) {
    super(message);
    this.name = "PluginFailure";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function clamp(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function cleanText(value, maximum = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizeQuery(value) {
  const parts = Array.isArray(value) ? value : [value];
  const query = parts
    .map((part) => cleanText(part, 100))
    .filter(Boolean)
    .join(" ")
    .slice(0, 100);
  if (!query)
    throw new PluginFailure(
      "INVALID_INPUT",
      "Informe termos de busca para pesquisar o banco de mídia.",
    );
  return query;
}

function normalizeConfiguration(request, mediaType) {
  const configuration = request.configuration ?? {};
  const allowed =
    mediaType === "image"
      ? ["all", "pexels", "pixabay", "unsplash", "openverse", "wikimedia", "nasa"]
      : ["all", "pexels", "pixabay", "coverr", "wikimedia", "nasa"];
  const provider = allowed.includes(configuration.provider) ? configuration.provider : "all";
  return {
    provider,
    providers: provider === "all" ? allowed.slice(1) : [provider],
    resultLimitMode: configuration.resultLimitMode === "custom" ? "custom" : "provider_max",
    resultsPerProvider: clamp(configuration.resultsPerProvider, 1, 500, 20),
    page: clamp(configuration.page, 1, 100, 1),
    orientation: cleanText(configuration.orientation || "any", 20),
    safeSearch: configuration.safeSearch !== false,
  };
}

function providerPageLimit(provider, mediaType, config) {
  const maximum = PROVIDER_PAGE_LIMITS[mediaType]?.[provider];
  if (!maximum)
    throw new PluginFailure(
      "INVALID_INPUT",
      `${PROVIDERS[provider]?.label || provider} não oferece mídia do tipo ${mediaType}.`,
    );
  return config.resultLimitMode === "custom"
    ? Math.min(maximum, config.resultsPerProvider)
    : maximum;
}

function requestTimeout(request) {
  return clamp(request.settings?.requestTimeoutMs, 3000, 120000, 30000);
}

function combinedSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - Date.now()) : undefined;
}

function providerError(provider, response) {
  const label = PROVIDERS[provider].label;
  if (response.status === 401 || response.status === 403) {
    return new PluginFailure("AUTHENTICATION_FAILED", `${label} recusou a credencial configurada.`);
  }
  if (response.status === 429) {
    return new PluginFailure(
      "RATE_LIMIT",
      `${label} aplicou um limite temporário.`,
      true,
      retryAfterMs(response),
    );
  }
  if (response.status >= 500) {
    return new PluginFailure(
      "UPSTREAM_UNAVAILABLE",
      `${label} está temporariamente indisponível.`,
      true,
    );
  }
  return new PluginFailure(
    "UPSTREAM_ERROR",
    `${label} recusou a solicitação (HTTP ${response.status}).`,
  );
}

async function fetchJson(url, init, request, services, provider) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: combinedSignal(services.signal, requestTimeout(request)),
    });
  } catch (error) {
    if (services.signal?.aborted) throw new PluginFailure("CANCELLED", "A execução foi cancelada.");
    throw new PluginFailure(
      "UPSTREAM_UNAVAILABLE",
      `${PROVIDERS[provider].label} não respondeu a tempo.`,
      true,
    );
  }
  if (!response.ok) throw providerError(provider, response);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES)
    throw new PluginFailure(
      "UPSTREAM_ERROR",
      `${PROVIDERS[provider].label} retornou uma resposta grande demais.`,
    );
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_JSON_BYTES)
    throw new PluginFailure(
      "UPSTREAM_ERROR",
      `${PROVIDERS[provider].label} retornou uma resposta grande demais.`,
    );
  try {
    return JSON.parse(body);
  } catch {
    throw new PluginFailure(
      "UPSTREAM_ERROR",
      `${PROVIDERS[provider].label} retornou dados inválidos.`,
    );
  }
}

async function secret(services, provider) {
  const value = cleanText(await services.getSecret(PROVIDERS[provider].secret), 1000);
  if (!value)
    throw new PluginFailure(
      "AUTHENTICATION_FAILED",
      `Configure a credencial de ${PROVIDERS[provider].label}.`,
    );
  return value;
}

function baseRecord(provider, mediaType, item) {
  return {
    asset_id: `${provider}:${item.id}`,
    external_id: String(item.id),
    provider,
    provider_label: PROVIDERS[provider].label,
    media_type: mediaType,
    preview_url: "",
    download_url: "",
    source_url: "",
    author: "",
    author_url: "",
    attribution: "",
    license_name: "",
    license_url: "",
    width: 0,
    height: 0,
    duration: 0,
    mime_type: mediaType === "image" ? "image/jpeg" : "video/mp4",
    file_size: 0,
    download_location: "",
    title: "",
    source_name: "",
  };
}

function stripHtml(value, maximum = 500) {
  return cleanText(
    String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'"),
    maximum,
  );
}

function pexelsImage(item) {
  return {
    ...baseRecord("pexels", "image", item),
    preview_url: item.src?.medium || item.src?.small || "",
    download_url: item.src?.original || item.src?.large2x || "",
    source_url: item.url || "",
    author: cleanText(item.photographer, 200),
    author_url: item.photographer_url || "",
    attribution: `Photo by ${cleanText(item.photographer, 200) || "creator"} on Pexels`,
    license_name: "Pexels License",
    license_url: "https://www.pexels.com/license/",
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
  };
}

function choosePexelsVideo(files = []) {
  const valid = files.filter((file) => file?.link && Number(file.width) > 0);
  return valid.sort((a, b) => {
    const aSizePenalty = Number(a.file_size || 0) > 50 * 1024 * 1024 ? 1 : 0;
    const bSizePenalty = Number(b.file_size || 0) > 50 * 1024 * 1024 ? 1 : 0;
    const aPenalty = Number(a.width) > 1920 ? 1 : 0;
    const bPenalty = Number(b.width) > 1920 ? 1 : 0;
    return (
      aSizePenalty - bSizePenalty ||
      aPenalty - bPenalty ||
      Number(b.width) - Number(a.width) ||
      Number(a.file_size || 0) - Number(b.file_size || 0)
    );
  })[0];
}

function pexelsVideo(item) {
  const file = choosePexelsVideo(item.video_files) ?? {};
  return {
    ...baseRecord("pexels", "video", item),
    preview_url: item.image || "",
    download_url: file.link || "",
    source_url: item.url || "",
    author: cleanText(item.user?.name, 200),
    author_url: item.user?.url || "",
    attribution: `Video by ${cleanText(item.user?.name, 200) || "creator"} on Pexels`,
    license_name: "Pexels License",
    license_url: "https://www.pexels.com/license/",
    width: Number(file.width) || Number(item.width) || 0,
    height: Number(file.height) || Number(item.height) || 0,
    duration: Number(item.duration) || 0,
    mime_type: file.file_type || "video/mp4",
    file_size: Number(file.file_size) || 0,
  };
}

function pixabayImage(item) {
  return {
    ...baseRecord("pixabay", "image", item),
    preview_url: item.webformatURL || item.previewURL || "",
    download_url: item.largeImageURL || item.webformatURL || "",
    source_url: item.pageURL || "",
    author: cleanText(item.user, 200),
    author_url: item.user_id
      ? `https://pixabay.com/users/${encodeURIComponent(item.user || "user")}-${item.user_id}/`
      : "",
    attribution: `Image by ${cleanText(item.user, 200) || "creator"} on Pixabay`,
    license_name: "Pixabay Content License",
    license_url: "https://pixabay.com/service/license-summary/",
    width: Number(item.imageWidth) || Number(item.webformatWidth) || 0,
    height: Number(item.imageHeight) || Number(item.webformatHeight) || 0,
    file_size: Number(item.imageSize) || 0,
  };
}

function choosePixabayVideo(videos = {}) {
  const renditions = [videos.large, videos.medium, videos.small, videos.tiny].filter(
    (item) => item?.url,
  );
  return (
    renditions.find((item) => !Number(item.size) || Number(item.size) <= 50 * 1024 * 1024) ??
    renditions.at(-1) ??
    {}
  );
}

function pixabayVideo(item) {
  const file = choosePixabayVideo(item.videos);
  return {
    ...baseRecord("pixabay", "video", item),
    preview_url: item.picture_id
      ? `https://i.vimeocdn.com/video/${item.picture_id}_640x360.jpg`
      : "",
    download_url: file.url || "",
    source_url: item.pageURL || `https://pixabay.com/videos/id-${item.id}/`,
    author: cleanText(item.user, 200),
    author_url: item.user_id
      ? `https://pixabay.com/users/${encodeURIComponent(item.user || "user")}-${item.user_id}/`
      : "",
    attribution: `Video by ${cleanText(item.user, 200) || "creator"} on Pixabay`,
    license_name: "Pixabay Content License",
    license_url: "https://pixabay.com/service/license-summary/",
    width: Number(file.width) || 0,
    height: Number(file.height) || 0,
    duration: Number(item.duration) || 0,
    mime_type: "video/mp4",
    file_size: Number(file.size) || 0,
  };
}

function unsplashImage(item) {
  return {
    ...baseRecord("unsplash", "image", item),
    preview_url: item.urls?.small || item.urls?.thumb || "",
    download_url: item.urls?.full || item.urls?.regular || "",
    source_url: item.links?.html || "",
    author: cleanText(item.user?.name, 200),
    author_url: item.user?.links?.html || "",
    attribution: `Photo by ${cleanText(item.user?.name, 200) || "creator"} on Unsplash`,
    license_name: "Unsplash License",
    license_url: "https://unsplash.com/license",
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    download_location: item.links?.download_location || "",
  };
}

function openverseImage(item) {
  const license = [cleanText(item.license, 50).toUpperCase(), cleanText(item.license_version, 25)]
    .filter(Boolean)
    .join(" ");
  return {
    ...baseRecord("openverse", "image", item),
    title: cleanText(item.title, 300),
    source_name: cleanText(item.source || item.provider, 100),
    preview_url: item.thumbnail || "",
    download_url: item.thumbnail || "",
    source_url: item.foreign_landing_url || item.detail_url || "",
    author: cleanText(item.creator, 200),
    author_url: item.creator_url || "",
    attribution:
      stripHtml(item.attribution, 500) || `${cleanText(item.title, 200) || "Image"} via Openverse`,
    license_name: license || "Open license — verify item",
    license_url: item.license_url || "https://openverse.org/about/",
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    mime_type: item.filetype
      ? `image/${String(item.filetype).replace(/^jpg$/, "jpeg")}`
      : "image/webp",
    file_size: Number(item.filesize) || 0,
  };
}

function metadataValue(metadata, key) {
  return metadata?.[key]?.value ?? "";
}

function wikimediaRecord(mediaType, page) {
  const info = page.imageinfo?.[0] ?? {};
  const metadata = info.extmetadata ?? {};
  const author = stripHtml(metadataValue(metadata, "Artist"), 200);
  const licenseName = stripHtml(
    metadataValue(metadata, "LicenseShortName") || metadataValue(metadata, "UsageTerms"),
    200,
  );
  const downloadUrl = info.url || "";
  return {
    ...baseRecord("wikimedia", mediaType, { id: page.pageid || page.title }),
    title: cleanText(page.title?.replace(/^File:/i, ""), 300),
    source_name: "Wikimedia Commons",
    preview_url: mediaType === "image" ? downloadUrl : "",
    download_url: downloadUrl,
    source_url: info.descriptionurl || page.canonicalurl || page.fullurl || "",
    author,
    attribution:
      stripHtml(metadataValue(metadata, "Credit"), 500) ||
      `${author || "Creator"}, via Wikimedia Commons`,
    license_name: licenseName || "See item page",
    license_url:
      metadataValue(metadata, "LicenseUrl") ||
      info.descriptionurl ||
      "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
    mime_type: cleanText(info.mime, 100) || (mediaType === "image" ? "image/jpeg" : "video/webm"),
    file_size: Number(info.size) || 0,
  };
}

function nasaRecord(mediaType, item) {
  const data = item.data?.[0] ?? {};
  const preview = (item.links ?? []).find((link) => link?.href)?.href || "";
  const creator = cleanText(data.secondary_creator || data.center, 200);
  return {
    ...baseRecord("nasa", mediaType, { id: data.nasa_id }),
    title: cleanText(data.title, 300),
    source_name: cleanText(data.center || "NASA", 100),
    preview_url: preview,
    download_url: "",
    download_location: item.href || "",
    source_url: data.nasa_id
      ? `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`
      : "https://images.nasa.gov/",
    author: creator || "NASA",
    attribution: `Credit: ${creator || "NASA"}`,
    license_name: "NASA Images and Media Usage Guidelines",
    license_url: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    mime_type: mediaType === "image" ? "image/jpeg" : "video/mp4",
  };
}

function coverrVideo(item) {
  const id = item.id || item.video_id || item.slug;
  return {
    ...baseRecord("coverr", "video", { id }),
    title: cleanText(item.title, 300),
    source_name: "Coverr",
    preview_url: item.thumbnail || item.poster || "",
    download_url: "",
    download_location: `https://api.coverr.co/videos/${encodeURIComponent(id)}`,
    source_url: item.slug
      ? `https://coverr.co/videos/${encodeURIComponent(item.slug)}`
      : "https://coverr.co/",
    author: "Coverr",
    attribution: "Video provided by Coverr",
    license_name: "Coverr License",
    license_url: "https://coverr.co/license",
    width: Number(item.max_width) || 0,
    height: Number(item.max_height) || 0,
    duration: Number(item.duration) || 0,
    mime_type: "video/mp4",
  };
}

function orientationForPixabay(orientation) {
  return orientation === "landscape" || orientation === "portrait" ? orientation : "all";
}

async function searchPexels(mediaType, query, config, request, services) {
  const key = await secret(services, "pexels");
  const limit = providerPageLimit("pexels", mediaType, config);
  const path = mediaType === "image" ? "/v1/search" : "/v1/videos/search";
  const url = new URL(path, "https://api.pexels.com");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("page", String(config.page));
  if (config.orientation !== "any") url.searchParams.set("orientation", config.orientation);
  const data = await fetchJson(
    url,
    { headers: { Authorization: key } },
    request,
    services,
    "pexels",
  );
  const items = mediaType === "image" ? data.photos : data.videos;
  return (Array.isArray(items) ? items : [])
    .map(mediaType === "image" ? pexelsImage : pexelsVideo)
    .filter((item) => item.download_url);
}

function cachePath(services, mediaType, params) {
  const fingerprint = createHash("sha256")
    .update(`${mediaType}:${params.toString()}`)
    .digest("hex")
    .slice(0, 24);
  return services.getWorkspacePath(`cache/pixabay-${fingerprint}.json`);
}

async function readCache(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (Date.now() - Number(value.cachedAt) <= CACHE_TTL_MS) return value.data;
  } catch {}
  return undefined;
}

async function saveCache(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ cachedAt: Date.now(), data }), "utf8");
}

async function searchPixabay(mediaType, query, config, request, services) {
  const key = await secret(services, "pixabay");
  const limit = providerPageLimit("pixabay", mediaType, config);
  const params = new URLSearchParams({
    q: query,
    page: String(config.page),
    per_page: String(Math.max(3, limit)),
    safesearch: String(config.safeSearch),
    orientation: orientationForPixabay(config.orientation),
  });
  if (mediaType === "image") params.set("image_type", "photo");
  const path = cachePath(services, mediaType, params);
  let data = await readCache(path);
  if (!data) {
    const url = new URL(mediaType === "image" ? "/api/" : "/api/videos/", "https://pixabay.com");
    for (const [name, value] of params) url.searchParams.set(name, value);
    url.searchParams.set("key", key);
    data = await fetchJson(url, {}, request, services, "pixabay");
    await saveCache(path, data);
  }
  return (Array.isArray(data.hits) ? data.hits : [])
    .slice(0, limit)
    .map(mediaType === "image" ? pixabayImage : pixabayVideo)
    .filter((item) => item.download_url);
}

async function searchUnsplash(query, config, request, services) {
  const key = await secret(services, "unsplash");
  const limit = providerPageLimit("unsplash", "image", config);
  const url = new URL("/search/photos", "https://api.unsplash.com");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(config.page));
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("content_filter", config.safeSearch ? "high" : "low");
  if (config.orientation !== "any") url.searchParams.set("orientation", config.orientation);
  const data = await fetchJson(
    url,
    { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } },
    request,
    services,
    "unsplash",
  );
  return (Array.isArray(data.results) ? data.results : [])
    .map(unsplashImage)
    .filter((item) => item.download_url);
}

async function searchOpenverse(query, config, request, services) {
  const limit = providerPageLimit("openverse", "image", config);
  const url = new URL("/v1/images/", "https://api.openverse.org");
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(config.page));
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("mature", String(!config.safeSearch));
  const ratios = { landscape: "wide", portrait: "tall", square: "square" };
  if (ratios[config.orientation]) url.searchParams.set("aspect_ratio", ratios[config.orientation]);
  const data = await fetchJson(
    url,
    {
      headers: {
        "Api-User-Agent": "ContentFlow/0.4.1 (https://github.com/andremjr/contentflow)",
      },
    },
    request,
    services,
    "openverse",
  );
  return (Array.isArray(data.results) ? data.results : [])
    .map(openverseImage)
    .filter((item) => item.download_url);
}

async function searchWikimedia(mediaType, query, config, request, services) {
  const limit = providerPageLimit("wikimedia", mediaType, config);
  const url = new URL("/w/api.php", "https://commons.wikimedia.org");
  const fileType = mediaType === "image" ? "bitmap" : "video";
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} filetype:${fileType}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(limit));
  url.searchParams.set("gsroffset", String((config.page - 1) * limit));
  url.searchParams.set("prop", "imageinfo|info");
  url.searchParams.set("iiprop", "url|mime|size|mediatype|extmetadata");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const data = await fetchJson(
    url,
    {
      headers: {
        "Api-User-Agent": "ContentFlow/0.4.1 (https://github.com/andremjr/contentflow)",
      },
    },
    request,
    services,
    "wikimedia",
  );
  return (Array.isArray(data.query?.pages) ? data.query.pages : [])
    .map((page) => wikimediaRecord(mediaType, page))
    .filter((item) => item.download_url);
}

async function searchNasa(mediaType, query, config, request, services) {
  const limit = providerPageLimit("nasa", mediaType, config);
  const url = new URL("/search", "https://images-api.nasa.gov");
  url.searchParams.set("q", query);
  url.searchParams.set("media_type", mediaType);
  url.searchParams.set("page", String(config.page));
  url.searchParams.set("page_size", String(limit));
  const data = await fetchJson(url, {}, request, services, "nasa");
  return (Array.isArray(data.collection?.items) ? data.collection.items : [])
    .slice(0, limit)
    .map((item) => nasaRecord(mediaType, item))
    .filter((item) => item.download_location);
}

async function searchCoverr(query, config, request, services) {
  const key = await secret(services, "coverr");
  const limit = providerPageLimit("coverr", "video", config);
  const url = new URL("/videos", "https://api.coverr.co");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(config.page - 1));
  url.searchParams.set("page_size", String(limit));
  const data = await fetchJson(
    url,
    { headers: { Authorization: `Bearer ${key}` } },
    request,
    services,
    "coverr",
  );
  return (Array.isArray(data.hits) ? data.hits : [])
    .map(coverrVideo)
    .filter((item) => item.download_location);
}

function diagnosticRecords(mediaType, providers) {
  return providers.map((provider, index) => ({
    ...baseRecord(provider, mediaType, { id: `diagnostic-${index + 1}` }),
    preview_url: `https://${provider}.invalid/preview`,
    download_url: `https://${provider}.invalid/download`,
    source_url: `https://${provider}.invalid/source`,
    author: "Diagnostic Fixture",
    attribution: `Diagnostic fixture for ${PROVIDERS[provider].label}`,
    license_name: "Diagnostic only",
    license_url: `https://${provider}.invalid/license`,
  }));
}

async function searchProvider(provider, mediaType, query, config, request, services) {
  if (request.settings?.diagnosticFixture === true) return diagnosticRecords(mediaType, [provider]);
  if (provider === "pexels") return searchPexels(mediaType, query, config, request, services);
  if (provider === "pixabay") return searchPixabay(mediaType, query, config, request, services);
  if (provider === "unsplash") return searchUnsplash(query, config, request, services);
  if (provider === "openverse") return searchOpenverse(query, config, request, services);
  if (provider === "wikimedia") return searchWikimedia(mediaType, query, config, request, services);
  if (provider === "nasa") return searchNasa(mediaType, query, config, request, services);
  return searchCoverr(query, config, request, services);
}

function fitResultsToBudget(results, maximumBytes = MAX_OUTPUT_JSON_BYTES) {
  const queues = new Map();
  for (const result of results) {
    const queue = queues.get(result.provider) ?? [];
    queue.push(result);
    queues.set(result.provider, queue);
  }
  const selected = [];
  let bytes = 2;
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues.values()) {
      const item = queue.shift();
      if (!item) continue;
      const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
      if (bytes + itemBytes > maximumBytes)
        return { results: selected, truncated: selected.length < results.length };
      selected.push(item);
      bytes += itemBytes;
      added = true;
    }
  }
  return { results: selected, truncated: false };
}

async function search(mediaType, request, services) {
  const query = normalizeQuery(request.inputs?.query);
  const config = normalizeConfiguration(request, mediaType);
  if (request.settings?.diagnosticFixture === true) {
    const results = diagnosticRecords(mediaType, config.providers);
    return {
      status: "success",
      values: { results, warnings: [] },
      usage: { provider: "diagnostic", outputUnits: results.length, unit: "items" },
    };
  }
  const tasks = config.providers.map((provider) =>
    searchProvider(provider, mediaType, query, config, request, services),
  );
  const settled = await Promise.allSettled(tasks);
  const results = [];
  const warnings = [];
  let firstFailure;
  settled.forEach((entry, index) => {
    const provider = config.providers[index];
    if (entry.status === "fulfilled") results.push(...entry.value);
    else {
      firstFailure ??= entry.reason;
      const code = entry.reason instanceof PluginFailure ? entry.reason.code : "UPSTREAM_ERROR";
      warnings.push(`${PROVIDERS[provider].label}: indisponível (${code}).`);
    }
  });
  if (settled.every((entry) => entry.status === "rejected")) throw firstFailure;
  const fitted = fitResultsToBudget(results);
  if (fitted.truncated)
    warnings.push(
      "A resposta atingiu o limite seguro do plugin; os resultados foram reduzidos de forma equilibrada entre provedores.",
    );
  return {
    status: "success",
    values: { results: fitted.results, warnings },
    usage: {
      provider: config.providers.join(","),
      outputUnits: fitted.results.length,
      unit: "items",
    },
  };
}

function normalizeTerms(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[;,\n]/);
  return values
    .map((item) => cleanText(item, 80).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeAssetBrief(value) {
  const brief = Array.isArray(value) ? value[0] : value;
  if (!brief || typeof brief !== "object")
    throw new PluginFailure("INVALID_INPUT", "Informe um briefing visual em formato de record.");
  const primaryQuery = normalizeQuery(brief.primary_query ?? brief.query ?? brief.keywords);
  const startSeconds = Number(brief.start_seconds ?? brief.start ?? 0);
  const endSeconds = Number(brief.end_seconds ?? brief.end ?? startSeconds);
  const preference = cleanText(brief.media_preference || "mixed", 20).toLowerCase();
  return {
    briefId: cleanText(brief.brief_id || brief.id || `brief-${startSeconds}`, 120),
    startSeconds: Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0,
    endSeconds: Number.isFinite(endSeconds) ? Math.max(0, endSeconds) : 0,
    transcriptExcerpt: cleanText(brief.transcript_excerpt || brief.transcript || "", 500),
    visualIntent: cleanText(brief.visual_intent || "", 300),
    primaryQuery,
    fallbackQueries: [brief.fallback_query_1, brief.fallback_query_2]
      .map((item) => cleanText(item, 100))
      .filter(Boolean),
    mediaPreference: ["image", "video", "mixed"].includes(preference) ? preference : "mixed",
    orientation: ["landscape", "portrait", "square", "any"].includes(brief.orientation)
      ? brief.orientation
      : "any",
    negativeTerms: normalizeTerms(brief.negative_terms),
  };
}

function normalizeBriefConfiguration(request) {
  const configuration = request.configuration ?? {};
  const minimumCandidates = clamp(configuration.minimumCandidatesPerBrief, 1, 30, 4);
  const maximumCandidates = clamp(configuration.maximumCandidatesPerBrief, 1, 50, 12);
  return {
    strategy: ["balanced_fallback", "priority_fallback", "all"].includes(
      configuration.providerStrategy,
    )
      ? configuration.providerStrategy
      : "balanced_fallback",
    batchIndex: Math.max(0, Number(request.batch?.index) || 0),
    provider: cleanText(configuration.provider || "all", 20).toLowerCase(),
    minimumCandidates: Math.min(minimumCandidates, maximumCandidates),
    maximumCandidates,
    maximumFallbackQueries: clamp(configuration.maximumFallbackQueries, 0, 2, 2),
    mediaPolicy: ["follow_brief", "images_only", "videos_only", "mixed"].includes(
      configuration.mediaPolicy,
    )
      ? configuration.mediaPolicy
      : "follow_brief",
    minimumImageWidth: clamp(configuration.minimumImageWidth, 0, 10000, 1280),
    minimumVideoWidth: clamp(configuration.minimumVideoWidth, 0, 10000, 1280),
    minimumVideoDuration: clamp(configuration.minimumVideoDuration, 0, 3600, 3),
    maximumVideoDuration: clamp(configuration.maximumVideoDuration, 0, 7200, 0),
    minimumQualityScore: clamp(configuration.minimumQualityScore, 0, 100, 65),
    strictOrientation: configuration.strictOrientation !== false,
    commercialSafe: configuration.licenseProfile !== "all_declared",
  };
}

function briefMediaTypes(brief, config) {
  if (config.mediaPolicy === "images_only") return ["image"];
  if (config.mediaPolicy === "videos_only") return ["video"];
  if (config.mediaPolicy === "mixed") return ["video", "image"];
  if (brief.mediaPreference === "image") return ["image"];
  if (brief.mediaPreference === "video") return ["video"];
  return ["video", "image"];
}

function orientationMatches(item, orientation) {
  if (orientation === "any" || !item.width || !item.height) return true;
  const ratio = item.width / item.height;
  if (orientation === "landscape") return ratio > 1.05;
  if (orientation === "portrait") return ratio < 0.95;
  return ratio >= 0.9 && ratio <= 1.1;
}

function candidateAllowed(item, brief, config) {
  if (item.media_type === "image" && item.width && item.width < config.minimumImageWidth)
    return false;
  if (item.media_type === "video" && item.width && item.width < config.minimumVideoWidth)
    return false;
  if (
    item.media_type === "video" &&
    item.duration &&
    (item.duration < config.minimumVideoDuration ||
      (config.maximumVideoDuration > 0 && item.duration > config.maximumVideoDuration))
  )
    return false;
  if (
    config.commercialSafe &&
    /(?:noncommercial|no derivatives|\bby-nc\b|\bby-nd\b)/i.test(item.license_name)
  )
    return false;
  if (config.strictOrientation && !orientationMatches(item, brief.orientation)) return false;
  const searchable = [item.title, item.author, item.source_name, item.attribution]
    .map((value) => cleanText(value, 500).toLowerCase())
    .join(" ");
  return !brief.negativeTerms.some((term) => searchable.includes(term));
}

function enrichCandidate(item, brief, config, query, queryIndex, providerIndex) {
  const dimensionsKnown = Number(item.width) > 0 && Number(item.height) > 0;
  const orientationScore = brief.orientation === "any" ? 10 : dimensionsKnown ? 15 : 5;
  const minimumWidth =
    item.media_type === "image" ? config.minimumImageWidth : config.minimumVideoWidth;
  const resolutionScore = Number(item.width) >= minimumWidth ? 15 : dimensionsKnown ? 0 : 5;
  const provenanceScore = item.source_url && item.license_name && item.attribution ? 15 : 5;
  const usableScore = item.preview_url && (item.download_url || item.download_location) ? 15 : 5;
  const queryScore = queryIndex === 0 ? 25 : Math.max(10, 20 - queryIndex * 5);
  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      10 +
        queryScore +
        orientationScore +
        resolutionScore +
        provenanceScore +
        usableScore -
        providerIndex * 2,
    ),
  );
  return {
    ...item,
    brief_id: brief.briefId,
    start_seconds: brief.startSeconds,
    end_seconds: Math.max(brief.startSeconds, brief.endSeconds),
    transcript_excerpt: brief.transcriptExcerpt,
    visual_intent: brief.visualIntent,
    query_used: query,
    query_kind: queryIndex === 0 ? "primary" : `fallback_${queryIndex}`,
    candidate_score: qualityScore,
    minimum_quality_score: config.minimumQualityScore,
    orientation_match: orientationMatches(item, brief.orientation),
  };
}

function selectDiverseCandidates(candidates, maximum) {
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.external_id}:${candidate.media_type}`;
    const current = unique.get(key);
    if (!current || candidate.candidate_score > current.candidate_score) unique.set(key, candidate);
  }
  const queues = new Map();
  for (const candidate of [...unique.values()].sort(
    (left, right) => right.candidate_score - left.candidate_score,
  )) {
    const key = `${candidate.media_type}:${candidate.provider}`;
    const queue = queues.get(key) ?? [];
    queue.push(candidate);
    queues.set(key, queue);
  }
  const selected = [];
  while (selected.length < maximum) {
    let added = false;
    for (const queue of queues.values()) {
      const candidate = queue.shift();
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length === maximum) break;
    }
    if (!added) break;
  }
  return selected;
}

function providersForBrief(mediaType, config) {
  const available = PROVIDER_PRIORITY[mediaType];
  if (config.provider === "all") {
    if (config.strategy !== "balanced_fallback" || available.length < 2) return available;
    const offset = config.batchIndex % available.length;
    return [...available.slice(offset), ...available.slice(0, offset)];
  }
  return available.includes(config.provider) ? [config.provider] : [];
}

async function searchByBrief(request, services) {
  const brief = normalizeAssetBrief(request.inputs?.asset_briefs);
  const briefConfig = normalizeBriefConfiguration(request);
  const queries = [
    brief.primaryQuery,
    ...brief.fallbackQueries.slice(0, briefConfig.maximumFallbackQueries),
  ];
  const candidates = [];
  const warnings = [];
  const failures = [];
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    for (const mediaType of briefMediaTypes(brief, briefConfig)) {
      if (
        briefConfig.strategy !== "all" &&
        selectDiverseCandidates(candidates, briefConfig.maximumCandidates).length >=
          briefConfig.minimumCandidates
      )
        break;
      const config = normalizeConfiguration(
        {
          ...request,
          configuration: {
            ...request.configuration,
            provider: "all",
            orientation: brief.orientation,
            resultLimitMode: "provider_max",
          },
        },
        mediaType,
      );
      const providers = providersForBrief(mediaType, briefConfig);
      if (briefConfig.strategy === "all") {
        const settled = await Promise.allSettled(
          providers.map((provider) =>
            searchProvider(provider, mediaType, query, config, request, services),
          ),
        );
        settled.forEach((entry, providerIndex) => {
          const provider = providers[providerIndex];
          if (entry.status === "rejected") {
            failures.push(entry.reason);
            const code =
              entry.reason instanceof PluginFailure ? entry.reason.code : "UPSTREAM_ERROR";
            warnings.push(`${PROVIDERS[provider].label}: ${code}`);
            return;
          }
          candidates.push(
            ...entry.value
              .filter((item) => candidateAllowed(item, brief, briefConfig))
              .map((item) =>
                enrichCandidate(item, brief, briefConfig, query, queryIndex, providerIndex),
              )
              .filter((item) => item.candidate_score >= briefConfig.minimumQualityScore),
          );
        });
      } else {
        for (let providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
          const provider = providers[providerIndex];
          try {
            const results = await searchProvider(
              provider,
              mediaType,
              query,
              config,
              request,
              services,
            );
            candidates.push(
              ...results
                .filter((item) => candidateAllowed(item, brief, briefConfig))
                .map((item) =>
                  enrichCandidate(item, brief, briefConfig, query, queryIndex, providerIndex),
                )
                .filter((item) => item.candidate_score >= briefConfig.minimumQualityScore),
            );
          } catch (error) {
            failures.push(error);
            const code = error instanceof PluginFailure ? error.code : "UPSTREAM_ERROR";
            warnings.push(`${PROVIDERS[provider].label}: ${code}`);
          }
          if (
            selectDiverseCandidates(candidates, briefConfig.maximumCandidates).length >=
            briefConfig.minimumCandidates
          )
            break;
        }
      }
    }
    if (
      selectDiverseCandidates(candidates, briefConfig.maximumCandidates).length >=
      briefConfig.minimumCandidates
    )
      break;
  }
  const pool = selectDiverseCandidates(candidates, briefConfig.maximumCandidates);
  if (!pool.length && failures.length === 1) throw failures[0];
  if (!pool.length)
    throw new PluginFailure(
      "NOT_FOUND",
      `Nenhum asset atingiu o piso de qualidade para o briefing ${brief.briefId}.`,
    );
  const selected = [
    {
      ...pool[0],
      candidate_rank: 1,
      candidate_pool_size: pool.length,
      selection_mode: "automatic_best",
      search_warnings: warnings.join("; ").slice(0, 1000),
    },
  ];
  return {
    status: "success",
    values: { selected_assets: selected },
    usage: {
      provider: [...new Set(selected.map((item) => item.provider))].join(",") || "none",
      inputUnits: queries.length,
      outputUnits: selected.length,
      unit: "items",
    },
  };
}

function assetFromInput(value) {
  const asset = Array.isArray(value) ? value[0] : value;
  if (!asset || typeof asset !== "object")
    throw new PluginFailure("INVALID_INPUT", "Selecione um resultado de busca para baixar.");
  return asset;
}

function isProviderHost(provider, hostname, tracking = false) {
  const host = hostname.toLowerCase();
  if (provider === "pexels") return host === "images.pexels.com" || host === "videos.pexels.com";
  if (provider === "pixabay") return host === "pixabay.com" || host.endsWith(".pixabay.com");
  if (provider === "unsplash")
    return tracking ? host === "api.unsplash.com" : host === "images.unsplash.com";
  if (provider === "coverr")
    return tracking
      ? host === "api.coverr.co"
      : host === "storage.coverr.co" || host === "cdn.coverr.co";
  if (provider === "openverse") return host === "api.openverse.org";
  if (provider === "wikimedia") return host === "upload.wikimedia.org";
  if (provider === "nasa")
    return tracking
      ? host === "images-api.nasa.gov" || host === "images-assets.nasa.gov"
      : host === "images-assets.nasa.gov";
  return false;
}

function validateAssetUrl(value, provider, tracking = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PluginFailure("INVALID_INPUT", "O resultado contém uma URL inválida.");
  }
  if (url.protocol !== "https:" || !isProviderHost(provider, url.hostname, tracking)) {
    throw new PluginFailure(
      "PERMISSION_DENIED",
      "O host do arquivo não pertence ao provedor informado.",
    );
  }
  return url;
}

function eventFingerprint(request, asset) {
  return createHash("sha256")
    .update(
      [
        request.executionId,
        request.blockId,
        request.capabilityId,
        request.invocation?.attempt || 1,
        request.batch?.itemId || asset.brief_id || "single",
        asset.asset_id,
      ].join(":"),
    )
    .digest("hex");
}

async function trackUnsplashDownload(request, services, asset) {
  if (asset.provider !== "unsplash") return;
  const url = validateAssetUrl(asset.download_location, "unsplash", true);
  const marker = services.getWorkspacePath(
    `download-events/${eventFingerprint(request, asset)}.json`,
  );
  try {
    await access(marker);
    return;
  } catch {}
  const key = await secret(services, "unsplash");
  await fetchJson(
    url,
    { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } },
    request,
    services,
    "unsplash",
  );
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(
    marker,
    JSON.stringify({
      assetId: cleanText(asset.asset_id, 200),
      trackedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

async function resolveCoverrDownload(request, services, asset) {
  const url = validateAssetUrl(asset.download_location, "coverr", true);
  const key = await secret(services, "coverr");
  const data = await fetchJson(
    url,
    { headers: { Authorization: `Bearer ${key}` } },
    request,
    services,
    "coverr",
  );
  const downloadUrl = data.urls?.mp4_download || data.urls?.mp4;
  if (!downloadUrl)
    throw new PluginFailure("NOT_FOUND", "Coverr não retornou um arquivo para este vídeo.");
  return validateAssetUrl(downloadUrl, "coverr");
}

function nasaAssetScore(url, mediaType) {
  const path = url.pathname.toLowerCase();
  const extension = path.match(/\.([a-z0-9]+)$/)?.[1] || "";
  const allowed =
    mediaType === "image"
      ? new Set(["jpg", "jpeg", "png", "webp"])
      : new Set(["mp4", "webm", "mov"]);
  if (!allowed.has(extension)) return -1;
  let score =
    mediaType === "image"
      ? ({ jpg: 4, jpeg: 4, png: 3, webp: 2 }[extension] ?? 1)
      : ({ mp4: 4, webm: 3, mov: 2 }[extension] ?? 1);
  if (/~orig|_orig|original/.test(path)) score += 10;
  if (/~large|_large/.test(path)) score += 5;
  if (/~small|_small|thumb/.test(path)) score -= 3;
  return score;
}

async function resolveNasaDownload(mediaType, request, services, asset) {
  const location = validateAssetUrl(asset.download_location, "nasa", true);
  const data = await fetchJson(location, {}, request, services, "nasa");
  const candidates = (Array.isArray(data) ? data : (data.collection?.items ?? []))
    .map((item) => (typeof item === "string" ? item : item?.href))
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (url.protocol === "http:" && url.hostname.toLowerCase() === "images-assets.nasa.gov")
        url.protocol = "https:";
      return validateAssetUrl(url, "nasa");
    })
    .map((url) => ({ url, score: nasaAssetScore(url, mediaType) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length)
    throw new PluginFailure("NOT_FOUND", "NASA não retornou um formato compatível para este item.");
  return candidates[0].url;
}

function extensionFor(mimeType, mediaType) {
  const known = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/ogg": ".ogv",
  };
  return known[mimeType] || (mediaType === "image" ? ".img" : ".video");
}

function validMagic(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp")
    return (
      bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
    );
  if (mimeType === "image/gif") return bytes.subarray(0, 3).toString() === "GIF";
  if (mimeType === "video/webm")
    return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === "video/ogg") return bytes.subarray(0, 4).toString() === "OggS";
  if (mimeType === "video/mp4" || mimeType === "video/quicktime")
    return bytes.subarray(4, 8).toString() === "ftyp";
  return false;
}

async function downloadToArtifact(url, expectedType, maximumBytes, request, services, asset) {
  let response;
  try {
    let currentUrl = url;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: combinedSignal(services.signal, requestTimeout(request)),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirect === 3)
        throw new PluginFailure(
          "UPSTREAM_ERROR",
          "O provedor retornou redirecionamentos inválidos.",
        );
      currentUrl = validateAssetUrl(new URL(location, currentUrl), asset.provider);
    }
  } catch (error) {
    if (services.signal?.aborted) throw new PluginFailure("CANCELLED", "O download foi cancelado.");
    if (error instanceof PluginFailure) throw error;
    throw new PluginFailure("UPSTREAM_UNAVAILABLE", "O arquivo não respondeu a tempo.", true);
  }
  if (!response.ok) throw providerError(asset.provider, response);
  const mimeType = cleanText(
    response.headers.get("content-type")?.split(";")[0],
    100,
  ).toLowerCase();
  if (!mimeType.startsWith(`${expectedType}/`))
    throw new PluginFailure("UPSTREAM_ERROR", "O provedor retornou um tipo de arquivo inesperado.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximumBytes)
    throw new PluginFailure("OUTPUT_TOO_LARGE", "O arquivo excede o limite configurado.");
  const id = `stock-${expectedType}-${eventFingerprint(request, asset).slice(0, 16)}`;
  const name = `${id}${extensionFor(mimeType, expectedType)}`;
  const path = services.getOutputPath(name);
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "w");
  let size = 0;
  let head = Buffer.alloc(0);
  try {
    for await (const chunkValue of response.body) {
      const chunk = Buffer.from(chunkValue);
      size += chunk.length;
      if (size > maximumBytes)
        throw new PluginFailure("OUTPUT_TOO_LARGE", "O arquivo excede o limite configurado.");
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
      await file.write(chunk);
    }
  } catch (error) {
    await file.close();
    await unlink(path).catch(() => {});
    throw error;
  }
  await file.close();
  if (!size || !validMagic(head, mimeType)) {
    await unlink(path).catch(() => {});
    throw new PluginFailure(
      "UPSTREAM_ERROR",
      "O arquivo baixado não corresponde ao formato declarado.",
    );
  }
  return { id, name, mimeType, size, url: `artifact://${id}` };
}

function provenance(asset) {
  return [
    {
      asset_id: cleanText(asset.asset_id, 200),
      external_id: cleanText(asset.external_id, 200),
      provider: cleanText(asset.provider, 50),
      provider_label: cleanText(asset.provider_label, 100),
      title: cleanText(asset.title, 300),
      source_name: cleanText(asset.source_name, 100),
      media_type: cleanText(asset.media_type, 20),
      source_url: cleanText(asset.source_url, 2000),
      author: cleanText(asset.author, 200),
      author_url: cleanText(asset.author_url, 2000),
      attribution: cleanText(asset.attribution, 500),
      license_name: cleanText(asset.license_name, 200),
      license_url: cleanText(asset.license_url, 2000),
    },
  ];
}

async function download(mediaType, request, services) {
  const asset = assetFromInput(request.inputs?.asset);
  if (!Object.hasOwn(PROVIDERS, asset.provider) || asset.media_type !== mediaType) {
    throw new PluginFailure(
      "INVALID_INPUT",
      `Selecione um resultado de busca do tipo ${mediaType}.`,
    );
  }
  if (mediaType === "video" && ["unsplash", "openverse"].includes(asset.provider))
    throw new PluginFailure(
      "INVALID_INPUT",
      `${PROVIDERS[asset.provider].label} não está habilitado para vídeos.`,
    );
  let url;
  if (asset.provider === "coverr") url = await resolveCoverrDownload(request, services, asset);
  else if (asset.provider === "nasa")
    url = await resolveNasaDownload(mediaType, request, services, asset);
  else url = validateAssetUrl(asset.download_url, asset.provider);
  if (mediaType === "image") await trackUnsplashDownload(request, services, asset);
  const maximumBytes =
    mediaType === "image"
      ? clamp(request.settings?.maxImageBytes, 1048576, 104857600, 52428800)
      : clamp(request.settings?.maxVideoBytes, 1048576, 1073741824, 536870912);
  const artifact = await downloadToArtifact(url, mediaType, maximumBytes, request, services, asset);
  return {
    status: "success",
    values: { [mediaType]: artifact, provenance: provenance(asset) },
    artifacts: [
      {
        id: artifact.id,
        name: artifact.name,
        mimeType: artifact.mimeType,
        size: artifact.size,
        source: { kind: "path", path: artifact.name },
      },
    ],
    usage: { provider: asset.provider, outputUnits: artifact.size, unit: "bytes" },
  };
}

async function downloadSelected(request, services) {
  const asset = assetFromInput(request.inputs?.selected_assets);
  if (!["image", "video"].includes(asset.media_type))
    throw new PluginFailure(
      "INVALID_INPUT",
      "O asset selecionado deve ser uma imagem ou um vídeo.",
    );
  const result = await download(
    asset.media_type,
    { ...request, inputs: { ...request.inputs, asset } },
    services,
  );
  const artifact = result.values[asset.media_type];
  return {
    ...result,
    values: {
      assets: [
        {
          ...artifact,
          brief_id: cleanText(asset.brief_id, 120),
          start_seconds: Number(asset.start_seconds) || 0,
          end_seconds: Number(asset.end_seconds) || 0,
          provider: cleanText(asset.provider, 50),
          source_url: cleanText(asset.source_url, 2000),
          attribution: cleanText(asset.attribution, 500),
          license_name: cleanText(asset.license_name, 200),
          license_url: cleanText(asset.license_url, 2000),
        },
      ],
    },
  };
}

function errorResponse(error) {
  if (error instanceof PluginFailure) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  }
  return {
    status: "error",
    code: "INTERNAL_ERROR",
    message: "O plugin encontrou uma falha interna.",
    retryable: false,
  };
}

export async function execute(request, services) {
  try {
    if (services.signal?.aborted) throw new PluginFailure("CANCELLED", "A execução foi cancelada.");
    if (request.capabilityId === "search-stock-images")
      return await search("image", request, services);
    if (request.capabilityId === "search-stock-videos")
      return await search("video", request, services);
    if (request.capabilityId === "search-stock-by-briefs")
      return await searchByBrief(request, services);
    if (request.capabilityId === "download-stock-image")
      return await download("image", request, services);
    if (request.capabilityId === "download-stock-video")
      return await download("video", request, services);
    if (request.capabilityId === "download-selected-stock-assets")
      return await downloadSelected(request, services);
    throw new PluginFailure("NOT_SUPPORTED", "Capacidade não suportada por este plugin.");
  } catch (error) {
    return errorResponse(error);
  }
}

export const __test = Object.freeze({
  normalizeQuery,
  normalizeAssetBrief,
  normalizeBriefConfiguration,
  providerPageLimit,
  candidateAllowed,
  providersForBrief,
  selectDiverseCandidates,
  fitResultsToBudget,
  choosePexelsVideo,
  choosePixabayVideo,
  pexelsImage,
  pexelsVideo,
  pixabayImage,
  pixabayVideo,
  unsplashImage,
  openverseImage,
  wikimediaRecord,
  nasaRecord,
  coverrVideo,
  validateAssetUrl,
  validMagic,
});
