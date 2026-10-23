/**
 * Blocks the wishlist fetcher from reaching private networks.
 * Hostnames are resolved first; every address must be a public IP, and every
 * redirect is checked again. Callers inject the resolver so tests need no network.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export type DnsResolver = (hostname: string) => Promise<string[]>;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
]);

export function isBlockedAddress(address: string): boolean {
  let ip = address.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  if (ip.startsWith("::ffff:")) return isBlockedAddress(ip.slice("::ffff:".length));

  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    const head = ip.split(":")[0] ?? "";
    if (head.startsWith("ff")) return true;
    if (/^f[cd][0-9a-f]{0,2}$/.test(head)) return true;
    if (/^fe[89ab][0-9a-f]?$/.test(head)) return true;
    return false;
  }

  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function hostnameBlocked(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    return true;
  if (host === "0.0.0.0" || isIpLiteral(host)) return isBlockedAddress(host);
  return false;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export async function assertPublicHttpUrl(raw: string, resolve: DnsResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("That link is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http and https links can be read.");
  }
  if (url.username || url.password)
    throw new SsrfError("Links with a username or password are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new SsrfError("Only standard web ports can be read.");
  }

  const host = url.hostname;
  if (hostnameBlocked(host)) throw new SsrfError("That address is not allowed.");

  const addresses = isIpLiteral(host) ? [host] : await resolve(host);
  if (!addresses.length) throw new SsrfError("That address could not be resolved.");
  if (addresses.some((address) => isBlockedAddress(address))) {
    throw new SsrfError("That address is on a private network.");
  }

  return url;
}

export type SafeFetchOptions = {
  resolve: DnsResolver;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
};

export async function safeFetch(
  raw: string,
  options: SafeFetchOptions,
): Promise<{ url: string; body: Uint8Array; contentType: string }> {
  const maxRedirects = options.maxRedirects ?? 2;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const timeoutMs = options.timeoutMs ?? 8_000;
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = await assertPublicHttpUrl(current, options.resolve);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "WardrobeBot/1.0 (+https://wardrobe-vaulted.lovable.app)",
        Accept: options.accept ?? "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SsrfError("The page redirected without a destination.");
      if (hop === maxRedirects) throw new SsrfError("Too many redirects.");
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) throw new SsrfError(`The page responded with ${response.status}.`);

    const reader = response.body?.getReader();
    if (!reader) throw new SsrfError("The page had no body.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SsrfError("The page is too large.");
      }
      chunks.push(next.value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      url: url.toString(),
      body,
      contentType: response.headers.get("content-type") ?? "",
    };
  }

  throw new SsrfError("Too many redirects.");
}

type DnsAnswer = { Answer?: { type: number; data: string }[] };

/** Resolves A and AAAA records through DNS-over-HTTPS. Used on Cloudflare Workers. */
export async function resolvePublicDns(hostname: string): Promise<string[]> {
  const ips: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(4_000) },
    );
    if (!response.ok) continue;
    const data = (await response.json()) as DnsAnswer;
    for (const answer of data.Answer ?? []) {
      if ((answer.type === 1 || answer.type === 28) && answer.data) ips.push(answer.data);
    }
  }
  return ips;
}
