export type YouTubeChannelProfile = {
  youtubeChannelId: string;
  name: string;
  handle: string;
  subscribers: string;
  avatarUrl: string;
  bannerUrl?: string;
  lastSyncedAt: string;
};

const YOUTUBE_ORIGIN = "https://www.youtube.com";
const HANDLE_PATTERN = /^[\p{L}\p{N}._-]{3,100}$/u;

export function normalizeYouTubeHandle(input: string) {
  let value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value =
        url.pathname
          .split("/")
          .filter(Boolean)
          .find((part) => part.startsWith("@")) ?? "";
    } catch {
      value = "";
    }
  }

  value = value.replace(/^@/, "").split(/[/?#]/)[0]?.trim() ?? "";
  if (!HANDLE_PATTERN.test(value)) {
    throw new Error("Informe um @ válido do YouTube.");
  }

  return `@${value}`;
}

export async function fetchYouTubeChannel(input: string): Promise<YouTubeChannelProfile> {
  const handle = normalizeYouTubeHandle(input);
  const response = await fetch(`${YOUTUBE_ORIGIN}/${encodeURIComponent(handle)}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("Não foi possível encontrar esse canal no YouTube.");
  }

  const html = await response.text();
  const name = readMeta(html, "og:title");
  const avatarUrl = readMeta(html, "og:image");
  const youtubeChannelId = readFirstGroup(html, /"externalId":"([^"]+)"/);

  if (!name || !avatarUrl || !youtubeChannelId || name === "YouTube") {
    throw new Error("O YouTube não retornou os dados públicos desse canal.");
  }

  return {
    youtubeChannelId,
    name: decodeEntities(name),
    handle,
    subscribers: readSubscriberCount(html, handle),
    avatarUrl: decodeJsonEscapes(avatarUrl),
    bannerUrl: readBannerUrl(html),
    lastSyncedAt: new Date().toISOString(),
  };
}

function readMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${escaped}"[^>]*>`, "i"))?.[0];
  return tag?.match(/content="([^"]*)"/i)?.[1] ?? "";
}

function readFirstGroup(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1] ?? "";
}

function readSubscriberCount(html: string, handle: string) {
  const normalizedHandle = handle.toLocaleLowerCase();
  const candidates = [...html.matchAll(/"subtitle":\{"content":"((?:\\.|[^"\\])*)"/g)]
    .map((match) => decodeJsonString(match[1]))
    .map(cleanDirectionalText)
    .filter((value) => /inscrito|subscriber/i.test(value));

  const exact = candidates.find((value) => value.toLocaleLowerCase().includes(normalizedHandle));
  const value = exact ?? candidates[0] ?? "";
  const parts = value.split(/\s*[•·]\s*/);
  return parts.find((part) => /inscrito|subscriber/i.test(part))?.trim() ?? "Inscritos ocultos";
}

function readBannerUrl(html: string) {
  const sources = html.match(
    /"banner":\{"imageBannerViewModel":\{"image":\{"sources":(\[[^\]]+\])/,
  )?.[1];

  if (!sources) return undefined;

  try {
    const images = JSON.parse(sources) as { url?: string; width?: number }[];
    return images
      .filter((image): image is { url: string; width?: number } => Boolean(image.url))
      .sort((left, right) => (right.width ?? 0) - (left.width ?? 0))[0]?.url;
  } catch {
    return undefined;
  }
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function decodeJsonEscapes(value: string) {
  return value.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

function cleanDirectionalText(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
