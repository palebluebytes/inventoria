/**
 * A room to meet in, and the key that seals what crosses it.
 *
 * **One shape, two jobs.** A Send code addresses one Meal send (ADR-0072 §3)
 * and a Pairing code addresses one Pairing act (ADR-0096 §8); they are minted
 * on different Facets, they travel in different carriers, and what they carry
 * is the same two things. The shape is here so that neither can be drawn
 * differently from the other by accident — the widths, the draw, and the rule
 * that a code does one job.
 *
 * The property the whole design is measured against, stated so this module can
 * be read against it:
 *
 * > A code is a single-use secret of at least 128 bits. An attacker who does
 * > not hold it cannot read what crosses, cannot substitute something of their
 * > own, and cannot cause either device to complete a session believing the
 * > other is its intended peer — and no server on the path holds enough to do
 * > any of those three either.
 *
 * The two halves earn their places differently, and conflating them is the
 * mistake this comment exists to prevent:
 *
 *   - **The key is the security.** 256 bits, minted in the browser, riding in
 *     the code and reaching the Relay by no path (ADR-0072 §2). WSS terminates
 *     at Cloudflare, so transport TLS is not a confidentiality control here and
 *     the AEAD seal is the whole binding rather than belt-and-braces.
 *   - **The room id is only an address**, and the Relay accepts any id it is
 *     handed (§10). A guessed room id buys a socket and nothing else: what
 *     crosses can be neither opened nor forged, so guessing is a *denial*
 *     attack exclusively, never a disclosure or substitution one.
 *
 * **Four omissions are deliberate** (§3): no attempt ceiling, no rate limit, no
 * expiry policy beyond the room's own five minutes, and no detection
 * requirement. Every one of those is machinery for making a *small* secret
 * safe, which is the price of magic wormhole's spoken code shape (#195) — and
 * §4 refuses the spoken code, so nothing here borrows that stack. Guessing 128
 * bits is not a threat model, it is arithmetic. Do not "fix" this.
 */

/**
 * The room id's width. Nine bytes rather than a round eight so it renders as
 * twelve base64url characters with nothing to pad, and because an address is
 * sized against collision rather than against an attacker (ADR-0072 §10).
 */
export const ROOM_ID_BYTES = 9;

/** The key's width: 256 bits of AES-GCM, which is the bar §3 states, doubled. */
export const ROOM_KEY_BYTES = 32;

/**
 * Where randomness comes from, injected for the reason the rest of the app
 * injects its clock and its ids: a code minted from a known draw is a code a
 * test can assert against. Both callers in the app take the default.
 */
export type RandomBytes = (length: number) => Uint8Array;

export const randomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/** One act's whole secret: where to meet, and what to seal with. */
export interface RoomCode {
  /** The room id the Relay is handed, base64url. */
  room: string;
  /** Raw AES-GCM key bytes, {@link ROOM_KEY_BYTES} of them. */
  key: Uint8Array;
}

/** A code that is not one: the wrong shape, or bytes that will not decode. */
export class RoomCodeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RoomCodeError";
  }
}

/** A code that has already done its one job (ADR-0072 §6). */
export class RoomCodeSpentError extends Error {
  constructor() {
    super("this code is spent: a code does one job, so draw a new one.");
    this.name = "RoomCodeSpentError";
  }
}

export const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function unBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  let raw: string;
  try {
    raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    throw new RoomCodeError("this code's key is not base64url.");
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
export function mintRoomCode(draw: RandomBytes = randomBytes): RoomCode {
  const drawn = draw(ROOM_ID_BYTES + ROOM_KEY_BYTES);
  if (drawn.length !== ROOM_ID_BYTES + ROOM_KEY_BYTES) {
    throw new RoomCodeError("the draw returned the wrong number of bytes.");
  }
  return {
    room: base64url(drawn.subarray(0, ROOM_ID_BYTES)),
    key: drawn.slice(ROOM_ID_BYTES),
  };
}

/**
 * Reads a code's key half, or refuses it.
 *
 * The key's width is checked exactly, because it *is* ADR-0072 §3's bar and a
 * short one would not be a code at all. The room's is not: §10 has the Relay
 * accept any id it is handed, and an address is not ours to police once it has
 * been read.
 */
export function readRoomKey(key: string): Uint8Array {
  const bytes = unBase64url(key);
  if (bytes.length !== ROOM_KEY_BYTES) {
    throw new RoomCodeError(
      `this code's key is ${bytes.length} bytes, not ${ROOM_KEY_BYTES}.`
    );
  }
  return bytes;
}

/**
 * The rooms whose codes are spent, for the life of this page.
 *
 * It is the only mutable state in the p2p client, and it is here because
 * ADR-0072 §6's "there is no try again on a spent code" is a rule about the
 * code rather than about any one screen — and it is one register rather than
 * one per kind of code, because a room id is a room id whatever act minted it.
 * Keyed by room id rather than by object identity, so a code pasted twice is
 * refused the second time even though it parses to a new object — which is the
 * way a person actually retries.
 *
 * It does not survive a reload, and it does not need to: ADR-0074 §8 reads a
 * Send code's fragment once and then cleans the URL, and a Pairing code never
 * reaches a URL at all (ADR-0096 §8).
 *
 * **It is deliberately not injected**, where the rest of the app injects its
 * clock and its ids. Those seams exist so a test can pin a value a caller is
 * entitled to choose; this one records a rule a caller is not, and a register
 * that could be swapped out is a rule that can be opted out of. Tests mint
 * their own codes, so no two of them ever meet in here.
 *
 * Terminal-on-refusal survives from #195 on new grounds. At 128 bits a retry
 * loop is not an attack budget; a refusal means what crossed was malformed or
 * hostile, so retrying the same code with the same payload fails identically
 * and silently hides a real fault.
 */
const spentRooms = new Set<string>();

/** Spends a code, which is the only thing that ever happens to one. */
export function burnRoomCode(code: RoomCode): void {
  spentRooms.add(code.room);
}

export function isRoomCodeSpent(code: RoomCode): boolean {
  return spentRooms.has(code.room);
}
