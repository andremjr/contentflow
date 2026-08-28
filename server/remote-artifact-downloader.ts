import { createHash, randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, rename, rm, stat } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { PluginArtifact } from "../src/lib/plugin-contract";
import type { StoredFile } from "../src/lib/domain";

export const DEFAULT_REMOTE_ARTIFACT_MAX_BYTES = 512 * 1024 * 1024;
export const DEFAULT_REMOTE_ARTIFACT_TIMEOUT_MS = 30_000;
export const DEFAULT_REMOTE_ARTIFACT_MAX_REDIRECTS = 5;

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type RemoteArtifactResponse = Readable & {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
};

export type RemoteArtifactDependencies = {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: (
    url: URL,
    addresses: ResolvedAddress[],
    signal: AbortSignal,
  ) => Promise<RemoteArtifactResponse>;
};

export type RemoteArtifactDownloadOptions = {
  artifact: PluginArtifact & { source: { kind: "url"; url: string } };
  uploadsDirectory: string;
  allowedHosts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  dependencies?: RemoteArtifactDependencies;
};

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

export function normalizeNetworkHostPattern(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  const host = normalized.startsWith("*.") ? normalized.slice(2) : normalized;
  if (
    !host ||
    host.length > 253 ||
    isIP(host) !== 0 ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
  ) {
    throw new Error(`Host de rede inválido: ${value}.`);
  }
  return normalized.startsWith("*.") ? `*.${host}` : host;
}

export function hostMatchesPatterns(hostname: string, patterns?: string[]) {
  if (!patterns?.length) return true;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return patterns.some((value) => {
    const pattern = normalizeNetworkHostPattern(value);
    if (!pattern.startsWith("*.")) return host === pattern;
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

export function assertPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4 && !blockedIpv4.check(address, "ipv4")) return;
  if (family === 6) {
    const firstGroup = Number.parseInt(address.split(":", 1)[0] || "0", 16);
    const isGlobalUnicast = firstGroup >= 0x2000 && firstGroup <= 0x3fff;
    if (isGlobalUnicast && !blockedIpv6.check(address, "ipv6")) return;
  }
  throw new Error(`Artifact remoto resolveu para endereço bloqueado: ${address}.`);
}

export async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Artifacts remotos não podem usar localhost.");
  }
  if (isIP(hostname)) {
    assertPublicAddress(hostname);
    return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  }
  const addresses = (await dnsLookup(hostname, { all: true, verbatim: true })) as ResolvedAddress[];
  if (!addresses.length) throw new Error("O host do artifact remoto não resolveu no DNS.");
  for (const address of addresses) assertPublicAddress(address.address);
  return addresses;
}

export async function downloadRemoteArtifact({
  artifact,
  uploadsDirectory,
  allowedHosts,
  maxBytes = DEFAULT_REMOTE_ARTIFACT_MAX_BYTES,
  timeoutMs = DEFAULT_REMOTE_ARTIFACT_TIMEOUT_MS,
  maxRedirects = DEFAULT_REMOTE_ARTIFACT_MAX_REDIRECTS,
  dependencies = {},
}: RemoteArtifactDownloadOptions): Promise<{ file: StoredFile; storedPath: string }> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxRedirects) ||
    maxRedirects < 0 ||
    maxRedirects > 20
  ) {
    throw new Error("Os limites do downloader de artifacts são inválidos.");
  }
  validateArtifactMetadata(artifact, maxBytes);
  const resolve = dependencies.resolve ?? resolvePublicAddresses;
  const request = dependencies.request ?? requestPinnedHttps;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("O download do artifact remoto excedeu o timeout.")),
    timeoutMs,
  );
  let partialPath: string | undefined;
  let promotedPath: string | undefined;

  try {
    let currentUrl = parseArtifactUrl(artifact.source.url, allowedHosts);
    let response: RemoteArtifactResponse | undefined;
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      const addresses = await raceAbort(resolve(currentUrl.hostname), controller.signal);
      for (const address of addresses) assertPublicAddress(address.address);
      response = await raceAbort(
        request(currentUrl, addresses, controller.signal),
        controller.signal,
      );
      const status = response.statusCode ?? 0;
      if (![301, 302, 303, 307, 308].includes(status)) break;
      if (redirect === maxRedirects) {
        response.destroy();
        throw new Error("O artifact remoto excedeu o limite de redirects.");
      }
      const location = headerValue(response.headers.location);
      response.destroy();
      if (!location) throw new Error("Redirect de artifact remoto sem cabeçalho Location.");
      currentUrl = parseArtifactUrl(new URL(location, currentUrl).toString(), allowedHosts);
    }
    if (!response || response.statusCode !== 200) {
      response?.destroy();
      throw new Error(`O servidor do artifact respondeu com status ${response?.statusCode ?? 0}.`);
    }

    const responseMime = normalizeMime(headerValue(response.headers["content-type"]));
    const declaredMime = normalizeMime(artifact.mimeType);
    if (!responseMime || responseMime !== declaredMime) {
      response.destroy();
      throw new Error(
        `MIME remoto incompatível: esperado ${declaredMime}, recebido ${responseMime || "ausente"}.`,
      );
    }
    let contentLength: number | undefined;
    try {
      contentLength = parseContentLength(headerValue(response.headers["content-length"]));
    } catch (error) {
      response.destroy();
      throw error;
    }
    if (contentLength !== undefined && contentLength > maxBytes) {
      response.destroy();
      throw new Error(`Artifact remoto maior que o limite de ${maxBytes} bytes.`);
    }
    if (
      artifact.size !== undefined &&
      contentLength !== undefined &&
      artifact.size !== contentLength
    ) {
      response.destroy();
      throw new Error("O tamanho declarado do artifact não corresponde ao Content-Length.");
    }
    const contentEncoding = headerValue(response.headers["content-encoding"]);
    if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
      response.destroy();
      throw new Error("O artifact remoto não pode usar Content-Encoding comprimido.");
    }

    await mkdir(uploadsDirectory, { recursive: true });
    const extension = safeExtension(artifact.name);
    const storedName = `${randomUUID()}${extension}`;
    const storedPath = path.join(uploadsDirectory, storedName);
    partialPath = path.join(uploadsDirectory, `.${storedName}.${randomUUID()}.partial`);
    const hash = createHash("sha256");
    let receivedBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          callback(new Error(`Artifact remoto maior que o limite de ${maxBytes} bytes.`));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(response, meter, createWriteStream(partialPath, { flags: "wx" }), {
      signal: controller.signal,
    });
    if (artifact.size !== undefined && artifact.size !== receivedBytes) {
      throw new Error("O tamanho declarado do artifact não corresponde ao arquivo recebido.");
    }
    const partialMetadata = await lstat(partialPath);
    if (
      !partialMetadata.isFile() ||
      partialMetadata.isSymbolicLink() ||
      partialMetadata.size !== receivedBytes
    ) {
      throw new Error("O arquivo parcial do artifact remoto é inválido.");
    }
    await rename(partialPath, storedPath);
    partialPath = undefined;
    promotedPath = storedPath;
    const finalMetadata = await stat(storedPath);
    if (!finalMetadata.isFile() || finalMetadata.size !== receivedBytes) {
      await rm(storedPath, { force: true });
      promotedPath = undefined;
      throw new Error("O arquivo final do artifact remoto é inválido.");
    }
    return {
      storedPath,
      file: {
        id: artifact.id,
        name: artifact.name,
        mimeType: declaredMime,
        size: receivedBytes,
        url: `/api/files/${storedName}`,
        sha256: hash.digest("hex"),
      },
    };
  } catch (error) {
    if (partialPath) await rm(partialPath, { force: true }).catch(() => undefined);
    if (promotedPath) await rm(promotedPath, { force: true }).catch(() => undefined);
    if (controller.signal.aborted) {
      throw new Error("O download do artifact remoto excedeu o timeout.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function assertRemoteArtifactNetworkPermission(permissions: readonly string[]) {
  if (!permissions.includes("network")) {
    throw new Error("Artifact remoto exige a permissão network.");
  }
}

function validateArtifactMetadata(
  artifact: PluginArtifact & { source: { kind: "url"; url: string } },
  maxBytes: number,
) {
  if (typeof artifact.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(artifact.id)) {
    throw new Error("O id do artifact remoto é inválido.");
  }
  if (
    typeof artifact.name !== "string" ||
    !artifact.name ||
    artifact.name.length > 255 ||
    artifact.name === "." ||
    artifact.name === ".." ||
    path.basename(artifact.name) !== artifact.name ||
    /[\\/]/.test(artifact.name) ||
    hasControlCharacters(artifact.name)
  ) {
    throw new Error("O nome do artifact remoto é inválido.");
  }
  const normalizedMime =
    typeof artifact.mimeType === "string" ? normalizeMime(artifact.mimeType) : "";
  if (!normalizedMime || artifact.mimeType.trim().toLowerCase() !== normalizedMime) {
    throw new Error("O MIME do artifact remoto é inválido.");
  }
  if (typeof artifact.source?.url !== "string") {
    throw new Error("A URL do artifact remoto é inválida.");
  }
  if (
    artifact.size !== undefined &&
    (!Number.isSafeInteger(artifact.size) || artifact.size < 0 || artifact.size > maxBytes)
  ) {
    throw new Error("O tamanho declarado do artifact remoto é inválido.");
  }
}

function parseArtifactUrl(value: string, allowedHosts?: string[]) {
  if (value.length > 4_096) throw new Error("A URL do artifact remoto é muito longa.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Artifacts remotos exigem HTTPS.");
  if (url.username || url.password)
    throw new Error("A URL do artifact não pode conter credenciais.");
  if (url.hash) throw new Error("A URL do artifact não pode conter fragmento.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Artifacts remotos não podem usar localhost.");
  }
  if (!hostMatchesPatterns(url.hostname, allowedHosts)) {
    throw new Error(`Host do artifact não autorizado pelo manifesto: ${url.hostname}.`);
  }
  return url;
}

function requestPinnedHttps(
  url: URL,
  addresses: ResolvedAddress[],
  signal: AbortSignal,
): Promise<RemoteArtifactResponse> {
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: selected.address,
        family: selected.family,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        rejectUnauthorized: true,
        agent: false,
        signal,
        headers: {
          Host: url.host,
          Accept: "*/*",
          "Accept-Encoding": "identity",
          "User-Agent": "ContentFlow/1 remote-artifact-importer",
        },
      },
      (response) => resolve(response as RemoteArtifactResponse),
    );
    request.once("error", reject);
    request.end();
  });
}

function normalizeMime(value: string | undefined) {
  const mime = value?.split(";", 1)[0].trim().toLowerCase();
  return mime && /^[-\w.+]+\/[-\w.+]+$/.test(mime) ? mime : "";
}

function parseContentLength(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error("Content-Length inválido no artifact remoto.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Content-Length inválido no artifact remoto.");
  return parsed;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeExtension(name: string) {
  const extension = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,20}$/.test(extension) ? extension : "";
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
