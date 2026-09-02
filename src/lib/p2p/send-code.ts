/**
 * The Send code: a room to meet in, and the key that seals what crosses it
 * (ADR-0072 §3, §4, §6 and §10).
 *
 * The property the whole design is measured against, stated so this module can
 * be read against it:
 *
 * > A Send code is a single-use secret of at least 128 bits. An attacker who
 * > does not hold it cannot read the payload, cannot substitute a payload of
 * > their own, and cannot cause either device to complete a session believing
 * > the other is its intended peer — and no server on the path holds enough to
 * > do any of those three either.
 *
 * The two halves earn their places differently, and conflating them is the
 * mistake this comment exists to prevent:
 *
 *   - **The key is the security.** 256 bits, minted in the browser, riding in
 *     the code and reaching the Relay by no path (§2). WSS terminates at
 *     Cloudflare, so transport TLS is not a confidentiality control here and
 *     the AEAD seal is the whole binding rather than belt-and-braces.
 *   - **The room id is only an address**, and the Relay accepts any id it is
 *     handed (§10). A guessed room id buys a socket and nothing else: the
 *     ciphertext can be neither opened nor forged, so guessing is a *denial*
 *     attack exclusively, never a disclosure or substitution one.
 *
 * **Four omissions are deliberate** (§3): no attempt ceiling, no rate limit, no
 * expiry policy beyond the room's own five minutes, and no detection
 * requirement. Every one of those is machinery for making a *small* secret
 * safe, which is the price of magic wormhole's spoken code shape (#195) — and
 * §4 refuses the spoken code, so nothing here borrows that stack. Guessing 128
 * bits is not a threat model, it is arithmetic. Do not "fix" this.
 *
 * The code is minted here and dies here. Everything between is
 * `meal-send.ts`.
 */

import { facetOf } from "../facets/registry";

/**
 * The room id's width. Nine bytes rather than a round eight so it renders as
 * twelve base64url characters with nothing to pad, and because an address is
 * sized against collision rather than against an attacker (§10).
 */
export const SEND_CODE_ROOM_BYTES = 9;

/** The key's width: 256 bits of AES-GCM, which is the bar §3 states, doubled. */
export const SEND_CODE_KEY_BYTES = 32;

/**
 * Where randomness comes from, injected for the reason the rest of the app
 * injects its clock and its ids: a code minted from a known draw is a code a
 * test can assert against. There is one caller in the app and it takes the
 * default.
 */
export type RandomBytes = (length: number) => Uint8Array;

export const randomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/** One send's whole secret: where to meet, and what to seal with. */
export interface SendCode {
  /** The room id the Relay is handed, base64url. */
  room: string;
  /** Raw AES-GCM key bytes, {@link SEND_CODE_KEY_BYTES} of them. */
  key: Uint8Array;
}

/** A code that is not one: the wrong shape, or bytes that will not decode. */
export class SendCodeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SendCodeError";
  }
}

/** A code that has already done its one job (§6). */
export class SendCodeSpentError extends Error {
  constructor() {
    super("this code is spent: a Send code is single-use, so draw a new one.");
    this.name = "SendCodeSpentError";
  }
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function unBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  let raw: string;
  try {
    raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    throw new SendCodeError("this code's key is not base64url.");
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * A fresh code, from **one** CSPRNG draw.
 *
 * One draw rather than two because the room id and the key are one secret with
 * two jobs, and drawing them together is the shape that cannot accidentally
 * seed one of them from something weaker than the other.
 */
export function mintSendCode(draw: RandomBytes = randomBytes): SendCode {
  const drawn = draw(SEND_CODE_ROOM_BYTES + SEND_CODE_KEY_BYTES);
  if (drawn.length !== SEND_CODE_ROOM_BYTES + SEND_CODE_KEY_BYTES) {
    throw new SendCodeError("the draw returned the wrong number of bytes.");
  }
  return {
    room: base64url(drawn.subarray(0, SEND_CODE_ROOM_BYTES)),
    key: drawn.slice(SEND_CODE_ROOM_BYTES),
  };
}

/** The fragment a code travels in, without its `#` (ADR-0074 §8). */
export function sendCodeFragment(code: SendCode): string {
  return `r=${code.room}&k=${base64url(code.key)}`;
}

/**
 * The code's carrier: `https://<origin>/food/#r=<room>&k=<key>` (ADR-0074 §8,
 * ADR-0084 §5).
 *
 * **The secret is in the fragment, never a query parameter**, so it reaches no
 * server by construction — RFC 9110 §7.1 excludes a fragment from the target
 * URI. The QR encodes this same link, so there is one code shape with two
 * carriers rather than two shapes.
 *
 * **It mints at Rations' scope rather than the root's**, and the two arguments
 * ADR-0084 §5 gives converge without either restating the other. By
 * **ownership**: a meal is `event:consume_*` and food twins, which belong to
 * Rations, and a hand-off belongs to the Facet that owns what it carries. By
 * **scope**: prefix matching is one-directional (ADR-0078 §3), so `/food/`
 * opened by someone who installed only the root is still inside their scope and
 * lands, while `/` opened by someone who installed only Rations is outside
 * theirs and opens a browser tab. The two directions do not cost the same.
 *
 * ADR-0074 §9's reason for `/` survives the move intact and is now #312's:
 * `public/_headers` is `/*`, so an **asset-served** `/food/` inherits
 * `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` and keeps
 * `SharedArrayBuffer`. A `/food/` that fell through to the Worker script
 * instead would answer without them and drop the app onto an in-memory
 * database, which is why the move waited on a real request rather than on a
 * local run — `vite`'s `appType: 'spa'` falls back to `index.html` in both
 * `pnpm dev` and `pnpm preview` and would show nothing.
 *
 * **The path is read off the roster, never written out here**, for the reason
 * the root reads Rations' name off it to offer the install: a literal would let
 * this mint a link to a path Rations has stopped answering to.
 *
 * The link is the only carrier that leaves a trace: a messenger learns that two
 * people exchanged something at a time. The code is dead by then (§5), but that
 * metadata is not, and it is the user's choice of messenger rather than the
 * app's.
 */
export function sendCodeLink(code: SendCode, origin: string): string {
  const rations = facetOf("food");
  return `${new URL(rations.startUrl, origin).href}#${sendCodeFragment(code)}`;
}

/**
 * The code in a link, or `null` if there is no code in it.
 *
 * Two different answers on purpose. `null` is "this is not a Send code" — an
 * ordinary boot, a scanned product barcode — and the caller carries on.
 * {@link SendCodeError} is "this is a Send code and it is broken", which the
 * receive surface can say something about.
 *
 * The key's width is checked exactly, because it *is* §3's bar and a short one
 * would not be a code at all. The room's is not: §10 has the Relay accept any
 * id it is handed, and an address is not ours to police once it has been read.
 */
export function readSendCode(href: string): SendCode | null {
  let hash: string;
  try {
    hash = new URL(href).hash;
  } catch {
    // Whatever the camera read, it was not a URL. The scanner sees whatever is
    // in the room (ADR-0074 §4: the Scan way in reads a meal code as well as a
    // barcode), so this is an ordinary answer rather than a failure.
    return null;
  }

  const fields = new URLSearchParams(hash.slice(1));
  const room = fields.get("r");
  const key = fields.get("k");
  if (room === null && key === null) return null;
  if (!room || !key) {
    throw new SendCodeError("this code is missing half of itself.");
  }

  const bytes = unBase64url(key);
  if (bytes.length !== SEND_CODE_KEY_BYTES) {
    throw new SendCodeError(
      `this code's key is ${bytes.length} bytes, not ${SEND_CODE_KEY_BYTES}.`
    );
  }
  return { room, key: bytes };
}

/**
 * The rooms whose codes are spent, for the life of this page.
 *
 * It is the only mutable state in the p2p client, and it is here because §6's
 * "there is no try again on a spent code" is a rule about the code rather than
 * about any one screen. Keyed by room id rather than by object identity, so a
 * link pasted twice is refused the second time even though it parses to a new
 * object — which is the way a person actually retries.
 *
 * It does not survive a reload, and it does not need to: ADR-0074 §8 reads the
 * fragment once and then cleans the URL, so a reload has no code to retry with.
 *
 * **It is deliberately not injected**, where the rest of the app injects its
 * clock and its ids. Those seams exist so a test can pin a value a caller is
 * entitled to choose; this one records a rule a caller is not, and a register
 * that could be swapped out is a rule that can be opted out of. Tests mint
 * their own codes, so no two of them ever meet in here.
 *
 * Terminal-on-refusal survives from #195 on new grounds. At 128 bits a retry
 * loop is not an attack budget; a refusal means the payload was malformed or
 * hostile, so retrying the same code with the same payload fails identically
 * and silently hides a real fault.
 */
const spentRooms = new Set<string>();

/** Spends a code, which is the only thing that ever happens to one. */
export function burnSendCode(code: SendCode): void {
  spentRooms.add(code.room);
}

export function isSendCodeSpent(code: SendCode): boolean {
  return spentRooms.has(code.room);
}
