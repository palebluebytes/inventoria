/**
 * SSRF guard for the scraper proxy.
 *
 * The proxy fetches a user-supplied URL, so it must refuse anything that could
 * reach internal infrastructure: non-HTTP schemes, loopback, private/link-local
 * ranges (incl. cloud metadata at 169.254.169.254), and *.internal / *.local.
 *
 * Single source of truth shared by the Cloudflare Worker proxy and the Vite dev
 * proxy middleware.
 */
export type UrlGuardResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function ipv4ToOctets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isPrivateIpv4(host: string): boolean {
  const o = ipv4ToOctets(host);
  if (!o) return false;
  const [a, b] = o;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  // IPv6 loopback / link-local / unique-local (URL hostnames keep the brackets
  // off, but be defensive about them).
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) {
    return true;
  }
  if (v6.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — validate the embedded v4.
    const mapped = v6.slice("::ffff:".length);
    if (isPrivateIpv4(mapped)) return true;
  }

  if (isPrivateIpv4(host)) return true;

  return false;
}

/**
 * Validates a raw (possibly URI-encoded) target URL for proxying.
 * Returns the parsed URL on success, or a human-readable refusal reason.
 */
export function checkProxyTarget(raw: string): UrlGuardResult {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Not valid percent-encoding; fall back to the raw string.
  }

  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    return { ok: false, reason: "Malformed target URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported scheme: ${url.protocol}` };
  }

  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: `Blocked host: ${url.hostname}` };
  }

  return { ok: true, url };
}
