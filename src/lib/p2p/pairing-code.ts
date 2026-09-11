/**
 * The Pairing code: the same room and key a Send code carries, in a carrier
 * that is deliberately not a link (ADR-0096 §8).
 *
 * **Scan, or the bare code pasted. Never a link.** A link exists to cross a
 * distance between two people and there is none between two devices you are
 * holding — and a link would charge the root a receive route, a URL fragment
 * and an ADR-0082 handover page for reach nobody needs. So the code is a
 * labelled token that **must not parse as a URL**, and not a `scheme:` shape
 * either, because `new URL("x-pair:abc")` parses: a URL-shaped QR is a link
 * **in the operating system's hands** whatever this app calls it.
 *
 * **The refusal lives in the shape, not in the naming.** The written form is a
 * label and two base64url fields separated by spaces, so its whole character
 * set is `[A-Za-z0-9-_ ]` and a colon cannot appear in it. A parser that read
 * some other shape and then checked it against `new URL` would be one edit away
 * from shipping a link; a form that has no colon to give is not.
 *
 * **It carries no pairing secret**, which is the inversion the record exists
 * for: the 256-bit pairing secret is minted *inside* the sealed room by the
 * device that showed this code (`pairing-act.ts`), so nothing a camera can see
 * carries it and a photograph of a spent code is worth nothing. Under ADR-0075
 * §3 a photographed QR regenerated every deposit address and every seal key
 * from pairing onward — today's pairing QR was a stronger credential than
 * either device's own disk.
 */

import {
  base64url,
  readRoomKey,
  RoomCodeError,
  type RoomCode,
} from "./room-code";

/**
 * One pairing act's whole secret.
 *
 * A named alias rather than a bare {@link RoomCode} for the reason `SendCode`
 * is one, and with the same limit: it is documentation and not a guard, since
 * the two are structurally identical. `send-code.ts` carries the trade. It is
 * minted by `mintRoomCode`, because the draw is the same draw and a renaming
 * wrapper over it would earn nothing.
 */
export type PairingCode = RoomCode;

/**
 * The word in front of the two fields.
 *
 * It is what lets the reader answer *this is not a Pairing code* about a
 * product barcode or a Send code link, rather than trying to decode one and
 * reporting a broken code. It carries no meaning to any other reader: nothing
 * dispatches on it, and it is not a scheme.
 */
export const PAIRING_CODE_LABEL = "inventoria-pair";

/** The code as a person or a camera sees it. */
export function writePairingCode(code: PairingCode): string {
  return `${PAIRING_CODE_LABEL} ${code.room} ${base64url(code.key)}`;
}

/**
 * A code read from a camera or a paste, or `null` if this is not one.
 *
 * Two different answers on purpose, the same two {@link readSendCode} gives.
 * `null` is "this is not a Pairing code" — a barcode, a poster, somebody's
 * Send code link — and the reader carries on looking. {@link RoomCodeError} is
 * "this is a Pairing code and it is broken", which the surface can say
 * something about.
 *
 * Whitespace is normalised rather than required to be single spaces: a paste
 * arrives with whatever a text field, a wrapped line or a clipboard put around
 * it, and refusing that would be refusing the carrier the ADR asked for.
 */
export function readPairingCode(raw: string): PairingCode | null {
  const fields = raw.trim().split(/\s+/);
  if (fields[0] !== PAIRING_CODE_LABEL) return null;
  const [, room, key] = fields;
  if (fields.length !== 3 || !room || !key) {
    throw new RoomCodeError("this code is missing half of itself.");
  }
  return { room, key: readRoomKey(key) };
}

/**
 * One decode or one paste, read for what the reader should do with it.
 *
 * The same three-way shape `scanned-code.ts` gives Rations' Scan way in, and
 * for the same reason: a live camera sees whatever is in the room, so *this is
 * not a Pairing code* is the ordinary answer rather than a failure, and only a
 * code that is labelled and then broken is worth a line. It carries no wording,
 * because which line a surface prints is that surface's.
 *
 * It is here rather than inside the reader component so that the decision can
 * be tested without a camera: the component is left holding the copy and the
 * loop, which is all a `.svelte` file should own.
 */
export type PairingScan =
  /** Somebody is showing a Pairing code. */
  | { kind: "code"; code: PairingCode }
  /** A Pairing code that is damaged — a truncated paste, a mangled key. */
  | { kind: "broken" }
  /** Anything else, which is what a camera mostly sees. */
  | { kind: "neither" };

export function readPairingScan(raw: string): PairingScan {
  let code: PairingCode | null;
  try {
    code = readPairingCode(raw);
  } catch {
    return { kind: "broken" };
  }
  return code ? { kind: "code", code } : { kind: "neither" };
}
