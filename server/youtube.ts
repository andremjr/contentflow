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

function normalizeYouTubeHandle(input: string) {
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

export function readSubscriberCount(html: string, handle: string) {
  return readStructuredSubscriberCount(html, handle) ?? readLegacySubscriberCount(html, handle);
}

function readStructuredSubscriberCount(html: string, handle: string) {
  const marker = '"contentMetadataViewModel":';
  const normalizedHandle = cleanDirectionalText(handle).toLocaleLowerCase();
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex < 0) return undefined;

    const objectStart = html.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) return undefined;

    const source = readJsonObject(html, objectStart);
    searchFrom = objectStart + Math.max(source?.length ?? 0, 1);
    if (!source) continue;

    try {
      const viewModel = JSON.parse(source) as { metadataRows?: unknown };
      if (!Array.isArray(viewModel.metadataRows)) continue;

      const rows = viewModel.metadataRows
        .map(readMetadataRow)
        .filter((row): row is string[][] => Boolean(row));
      const handleRowIndex = rows.findIndex((row) =>
        row.some((part) =>
          part.some(
            (value) => cleanDirectionalText(value).toLocaleLowerCase() === normalizedHandle,
          ),
        ),
      );
      if (handleRowIndex < 0) continue;

      for (const row of rows.slice(handleRowIndex + 1)) {
        const explicit = row.flat().find(isPublicSubscriberCount);
        if (explicit) return explicit.trim();

        // In the channel header, the row immediately after the handle contains
        // subscribers first and videos second. This positional fallback keeps
        // localized labels working even when their language is not in our regex.
        const firstMetric = row[0]?.find(Boolean)?.trim();
        if (row.length >= 2 && firstMetric) return firstMetric;
      }
    } catch {
      // Keep trying other view models, then fall back to the legacy strategies.
    }
  }

  return undefined;
}

function readMetadataRow(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.metadataParts)) return undefined;
  return value.metadataParts.map(readMetadataPart).filter((part) => part.length > 0);
}

function readMetadataPart(value: unknown) {
  if (!isRecord(value) || !isRecord(value.text)) return [];
  return [value.text.content, value.text.simpleText, value.text.accessibilityLabel].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(source: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return undefined;
}

function readLegacySubscriberCount(html: string, handle: string) {
  const normalizedHandle = handle.toLocaleLowerCase();
  const subtitleCandidates = [...html.matchAll(/"subtitle":\{"content":"((?:\\.|[^"\\])*)"/g)].map(
    (match) => match[1],
  );
  const textCandidates = [
    ...html.matchAll(/"(?:content|simpleText|accessibilityLabel)":"((?:\\.|[^"\\])*)"/g),
  ].map((match) => match[1]);
  const candidates = [...new Set([...subtitleCandidates, ...textCandidates])]
    .map(decodeJsonString)
    .map(cleanDirectionalText)
    .filter((value) => /inscrito|subscriber/i.test(value));

  const exact = candidates.find((value) => value.toLocaleLowerCase().includes(normalizedHandle));
  const orderedCandidates = exact ? [exact, ...candidates] : candidates;
  const parts = orderedCandidates.flatMap((value) => value.split(/\s*[\u2022\u00b7]\s*/));
  return parts.find(isPublicSubscriberCount)?.trim() ?? "0 inscritos";
}

function isPublicSubscriberCount(value: string) {
  return /^\s*[\d.,]+\s*(?:(?:mil|mi|milh(?:ão|ões)|thousand|million|billion|[kmb])\s*)?(?:de\s+)?(?:inscritos?|subscribers?)\s*$/iu.test(
    value,
  );
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
