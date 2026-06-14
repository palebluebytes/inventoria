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

/**
 * Expands an IPv6 literal into its eight 16-bit groups, or null if it does not
 * parse as one. A trailing dotted-quad (e.g. `::ffff:127.0.0.1`) is folded into
 * two groups first so both the dotted and the URL-normalized hex form
 * (`::ffff:7f00:1`) collapse to the same numbers.
 */
function expandIpv6(v6: string): number[] | null {
  let body = v6;
  const lastColon = body.lastIndexOf(":");
  if (lastColon !== -1 && body.slice(lastColon + 1).includes(".")) {
    const quad = ipv4ToOctets(body.slice(lastColon + 1));
    if (!quad) return null;
    const hi = ((quad[0] << 8) | quad[1]).toString(16);
    const lo = ((quad[2] << 8) | quad[3]).toString(16);
    body = `${body.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = body.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;

  const nums = groups.map((g) => parseInt(g, 16));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/**
 * Returns the dotted IPv4 string embedded in an IPv6 address that tunnels v4 —
 * IPv4-mapped (`::ffff:0:0/96`), IPv4-compatible (`::/96`), or NAT64
 * (`64:ff9b::/96`) — otherwise null. The last two 16-bit groups carry the four
 * octets.
 */
function embeddedIpv4(nums: number[]): string | null {
  const headZero = nums.slice(0, 5).every((n) => n === 0);
  const isMappedOrCompat = headZero && (nums[5] === 0xffff || nums[5] === 0);
  const isNat64 =
    nums[0] === 0x0064 &&
    nums[1] === 0xff9b &&
    nums.slice(2, 6).every((n) => n === 0);
  if (!isMappedOrCompat && !isNat64) return null;

  const [hi, lo] = [nums[6], nums[7]];
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  // IPv6 loopback / link-local / unique-local. URL hostnames keep the brackets
  // on the literal, so strip them before inspecting.
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) {
    return true;
  }
  // IPv4 tunnelled inside IPv6 (mapped/compatible/NAT64). The URL parser
  // normalizes `[::ffff:127.0.0.1]` to the hex form `[::ffff:7f00:1]`, so match
  // on the expanded numbers rather than the source string.
  const v6nums = expandIpv6(v6);
  if (v6nums) {
    const tunnelled = embeddedIpv4(v6nums);
    if (tunnelled && isPrivateIpv4(tunnelled)) return true;
  }

  if (isPrivateIpv4(host)) return true;

  return false;
}

/** Applies the scheme + host checks to an already-parsed URL. */
function checkParsedUrl(url: URL): UrlGuardResult {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported scheme: ${url.protocol}` };
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: `Blocked host: ${url.hostname}` };
  }
  return { ok: true, url };
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
