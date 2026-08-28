/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * Squeezing a session description down to what RFC 9429 §5.8.3 actually makes
 * a receiver enforce, and putting it back afterwards.
 *
 * #194 §4.2 priced this on paper: a browser's own offer is 578-591 bytes, the
 * spec floor is 384, and a hand-packed binary record is 60. Those figures were
 * built line by line from each engine's SDP serializer and never captured from
 * a running browser — §4.2's own "Reconstruction caveat" says so. This module
 * exists so the probe can check them against a real `RTCPeerConnection` on a
 * real phone, and so the QR symbol carries the small number rather than the
 * large one.
 *
 * The compaction is field extraction, not text minification: pull the values a
 * receiver verifies out of the browser's SDP, carry only those, and rebuild a
 * canonical SDP on the far side. That is the shape a real implementation would
 * ship, and rebuilding is the half that can fail, so the probe offers the raw
 * SDP as an alternative encoding and reports which ones connect.
 *
 * Pure. No RTCPeerConnection, no DOM.
 */

/** A candidate as we carry it: the standard fields, none of the extension tail. */
export interface CompactCandidate {
  foundation: string;
  component: number;
  transport: string;
  priority: number;
  address: string;
  port: number;
  type: string;
  /** Related address/port, present on srflx and relay candidates only. */
  raddr?: string;
  rport?: number;
}

/** Everything a peer needs, and nothing a peer checks that it can recompute. */
export interface CompactSdp {
  ufrag: string;
  pwd: string;
  /** Lowercase hex, colons stripped — 64 characters for SHA-256. */
  fingerprint: string;
  setup: string;
  sctpPort: number;
  maxMessageSize: number;
  candidates: CompactCandidate[];
}

// ---------------------------------------------------------------------------
// Reading a browser's SDP
// ---------------------------------------------------------------------------

const line = (sdp: string, prefix: string): string | undefined =>
  sdp
    .split(/\r?\n/)
    .find((l) => l.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();

/**
 * Parses one `a=candidate:` attribute value.
 *
 * Chrome appends a non-standard `cand-extension` tail — `generation`,
 * `network-id`, `network-cost` — unconditionally (#194 §4.5 traces it to
 * `api/candidate.cc`). Nothing requires transmitting it, so everything after
 * the standard fields is read for `raddr`/`rport` and otherwise dropped.
 */
export function parseCandidate(value: string): CompactCandidate | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 8 || parts[6] !== "typ") return null;
  const out: CompactCandidate = {
    foundation: parts[0],
    component: Number(parts[1]),
    transport: parts[2],
    priority: Number(parts[3]),
    address: parts[4],
    port: Number(parts[5]),
    type: parts[7],
  };
  for (let i = 8; i + 1 < parts.length; i += 2) {
    if (parts[i] === "raddr") out.raddr = parts[i + 1];
    if (parts[i] === "rport") out.rport = Number(parts[i + 1]);
  }
  return out;
}

export function compactSdp(sdp: string): CompactSdp {
  const fingerprintLine = line(sdp, "a=fingerprint:") ?? "";
  const [, fingerprintHex = ""] = fingerprintLine.split(/\s+/);
  const maxMessage = line(sdp, "a=max-message-size:");
  return {
    ufrag: line(sdp, "a=ice-ufrag:") ?? "",
    pwd: line(sdp, "a=ice-pwd:") ?? "",
    fingerprint: fingerprintHex.replace(/:/g, "").toLowerCase(),
    setup: line(sdp, "a=setup:") ?? "actpass",
    sctpPort: Number(line(sdp, "a=sctp-port:") ?? 5000),
    // #194 §4.2 flagged this constant as unsourced. Read it from the browser
    // rather than assuming it, and let the probe report what the browser said.
    maxMessageSize: maxMessage ? Number(maxMessage) : 262144,
    candidates: sdp
      .split(/\r?\n/)
      .filter((l) => l.startsWith("a=candidate:"))
      .map((l) => parseCandidate(l.slice("a=candidate:".length)))
      .filter((c): c is CompactCandidate => c !== null),
  };
}

// ---------------------------------------------------------------------------
// Rebuilding one a browser will accept
// ---------------------------------------------------------------------------

const withColons = (hex: string): string =>
  (hex.toUpperCase().match(/../g) ?? []).join(":");

const candidateLine = (c: CompactCandidate): string => {
  const base = `a=candidate:${c.foundation} ${c.component} ${c.transport} ${c.priority} ${c.address} ${c.port} typ ${c.type}`;
  return c.raddr !== undefined && c.rport !== undefined
    ? `${base} raddr ${c.raddr} rport ${c.rport}`
    : base;
};

/**
 * Rebuilds a full session description from the carried fields.
 *
 * The line inventory is RFC 9429 §5.8.3's mandatory set plus RFC 8866 §9's
 * four session lines and RFC 9429 §5.2.1's fixed `m=` shape. `a=tls-id` is
 * mandatory per the same section and omitted deliberately: #194 §4.1 found that
 * neither Chrome nor Firefox implements it, so emitting it would be the one
 * line no shipped parser has ever been fed.
 *
 * `a=ice-options:trickle` is omitted because gathering is complete before the
 * description is ever shown (#194 §4.5's half trickle); `a=end-of-candidates`
 * is included because Firefox reads it and it buys a fast ICE failure instead
 * of a timeout.
 */
export function expandSdp(c: CompactSdp, type: "offer" | "answer"): string {
  const lines = [
    "v=0",
    "o=- 8888888888888888888 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    `a=fingerprint:sha-256 ${withColons(c.fingerprint)}`,
    `a=setup:${c.setup}`,
    "a=mid:0",
    "a=sctp-port:" + c.sctpPort,
    `a=max-message-size:${c.maxMessageSize}`,
    ...c.candidates.map(candidateLine),
    "a=end-of-candidates",
  ];
  // Every SDP line ends CRLF, and the whole description ends with one too.
  void type;
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// The diagnostic
// ---------------------------------------------------------------------------

export interface CandidateCensus {
  host: number;
  srflx: number;
  prflx: number;
  relay: number;
  /** Host candidates whose address is an mDNS name rather than an IP. */
  mdns: number;
  /** Host candidates that leaked a real IP — meaning obfuscation was off. */
  literalIp: number;
  addresses: string[];
}

/**
 * Counts what the browser actually gathered.
 *
 * RFC 8828 §7 asks for exactly this check: "Applications SHOULD detect when
 * they don't have access to the full set of ICE candidates by checking for the
 * presence of host candidates. If no host candidates are present, Mode 3 or 4
 * is in use" — a policy has suppressed them and the LAN path is gone before
 * the exchange starts. On a probe whose whole question is whether the LAN path
 * works, that is the difference between a real answer and a wasted run.
 */
export function censusCandidates(
  candidates: CompactCandidate[]
): CandidateCensus {
  const census: CandidateCensus = {
    host: 0,
    srflx: 0,
    prflx: 0,
    relay: 0,
    mdns: 0,
    literalIp: 0,
    addresses: [],
  };
  for (const c of candidates) {
    if (c.type === "host") census.host++;
    else if (c.type === "srflx") census.srflx++;
    else if (c.type === "prflx") census.prflx++;
    else if (c.type === "relay") census.relay++;
    if (c.type === "host") {
      if (/\.local$/i.test(c.address)) census.mdns++;
      else census.literalIp++;
    }
    census.addresses.push(`${c.type} ${c.address}:${c.port}`);
  }
  return census;
}
