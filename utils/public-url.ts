import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type PublicAddress = {
  address: string;
  family: 4 | 6;
};

function ipv4ToNumber(address: string): number {
  return address
    .split(".")
    .reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function isInIpv4Range(address: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const blockedRanges = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ] as const;
    return !blockedRanges.some(([base, prefix]) =>
      isInIpv4Range(address, base, prefix),
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001::") ||
      normalized.startsWith("2001:0:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") ||
      /^2001:2[0-9a-f]:/.test(normalized) ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2002:") ||
      /^3fff:[0-9a-f]{0,3}:/.test(normalized) ||
      normalized.startsWith("::ffff:")
    ) {
      return false;
    }

    const firstGroup = Number.parseInt(normalized.split(":")[0] ?? "", 16);
    return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
  }

  return false;
}

export function normalizeWebsiteUrl(value: string): URL {
  const trimmed = value.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Enter a public HTTP or HTTPS website URL.");
  }
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(normalized);

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "80" && url.port !== "443")
  ) {
    throw new Error("Enter a public website using the standard HTTP or HTTPS port.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Enter a public website URL.");
  }

  url.hostname = hostname;
  return url;
}

async function publicAddresses(url: URL): Promise<PublicAddress[]> {
  if (isIP(url.hostname)) {
    if (!isPublicIpAddress(url.hostname)) {
      throw new Error("Private network addresses cannot be scanned.");
    }
    return [
      {
        address: url.hostname,
        family: isIP(url.hostname) as 4 | 6,
      },
    ];
  }

  const addresses = await dnsLookup(url.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new Error("The website must resolve to a public network address.");
  }
  return addresses.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
}

async function fetchPinnedPublicUrl(
  url: URL,
  signal: AbortSignal,
): Promise<Response> {
  const addresses = await publicAddresses(url);
  const selected =
    addresses.find(({ family }) => family === 4) ?? addresses[0];
  if (!selected) {
    throw new Error("The website must resolve to a public network address.");
  }

  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<Response>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        family: selected.family,
        headers: {
          "User-Agent": "Dopa website profile scanner/1.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [selected]);
            return;
          }
          callback(null, selected.address, selected.family);
        },
        signal,
      },
      (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }

        const status = incoming.statusCode ?? 502;
        const body =
          status === 204 || status === 304
            ? null
            : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers,
          }),
        );
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

export async function fetchPublicWebsite(
  value: string,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let url = normalizeWebsiteUrl(value);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetchPinnedPublicUrl(url, signal);

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: url };
    }

    const location = response.headers.get("location");
    if (!location || redirect === MAX_REDIRECTS) {
      await response.body?.cancel();
      throw new Error("The website redirected too many times.");
    }
    await response.body?.cancel();
    url = normalizeWebsiteUrl(new URL(location, url).href);
  }

  throw new Error("The website could not be loaded.");
}

export async function readLimitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("The website response is too large to scan.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("The website response is too large to scan.");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}
