/**
 * The seal: AES-GCM under the key that rides in the code (ADR-0072 §2).
 *
 * **This is the whole binding, and transport TLS is not a control here.** WSS
 * terminates at Cloudflare, so the operator of the Relay would otherwise hold
 * plaintext; the map's standing bar — a server may exist but must never read —
 * is met only by sealing above the transport. §15.5 records that as a refusal
 * so nobody later argues the seal is belt-and-braces.
 *
 * GCM rather than a bare cipher because the recipient has to be able to tell a
 * tampered frame from a real one. The authenticity half is what carries two of
 * §3's three clauses: an attacker who does not hold the code cannot substitute
 * a payload of their own, and cannot complete a session posing as the peer,
 * because they cannot produce a frame that opens. It is also why the Relay's
 * five bounds can all be *shape* bounds — nothing on the path can read enough
 * to have a content-based opinion.
 *
 * A frame is `nonce ‖ ciphertext ‖ tag`, the nonce being the 96 bits WebCrypto
 * takes. It is fresh per frame and the key is fresh per send, so the pair is
 * never reused — which is the one way GCM breaks.
 *
 * **A label binds a frame to its place in a conversation without hiding it**
 * (ADR-0075 §7). One sealed frame each way needs none: there is nowhere else
 * for it to go. A first sync is a *stream* of frames under one key, and there
 * §7 requires the chunk's sequence number bound into the AEAD's additional
 * data, so that a chunk cannot be reordered, replayed or dropped without the
 * seal failing. The label is never sent — both ends know what they expect next
 * and derive it — which is what makes it an assertion about the protocol rather
 * than a field an attacker can rewrite. ADR-0096 §5 widens what a label carries
 * on the store's path, where several distinct objects live at one address.
 */

import { randomBytes, type RandomBytes } from "./room-code";

/** The nonce's width: 96 bits, the size AES-GCM is specified for. */
export const SEAL_NONCE_BYTES = 12;

/**
 * The tag's width: 128 bits, WebCrypto's default and the only one this app
 * asks for. It is stated here because a caller sizing a payload against a
 * ceiling has to know what a seal costs on top of its plaintext (ADR-0096 §1).
 */
export const SEAL_TAG_BYTES = 16;

/**
 * What a frame is sealed **under**: the raw AES-GCM key, and nothing about
 * where it came from.
 *
 * A `RoomCode` satisfies it, which is every caller in a live room. So does a
 * Lane's derived seal key (ADR-0096 §4), which is what a Deposit is sealed
 * under — and the reason this is a property rather than the code itself.
 */
export interface SealedUnder {
  readonly key: Uint8Array;
}

/**
 * A frame that would not open: tampered with, sealed under a different code, or
 * never a sealed frame at all.
 *
 * The three are deliberately one error. Only whoever holds the code can tell
 * them apart, and nothing on this path holds enough to distinguish them for
 * the person being shown the failure.
 */
export class SealRefusedError extends Error {
  constructor() {
    super("this frame does not open under this code.");
    this.name = "SealRefusedError";
  }
}

// WebCrypto's `BufferSource` will not take a `Uint8Array<ArrayBufferLike>`, and
// this is the genuine external boundary CODING_STANDARDS §3.2 admits a cast at.
const importKey = (key: Uint8Array) =>
  crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

/**
 * What a seal is bound to beyond the key.
 *
 * `label` is the additional data: authenticated, not encrypted, and not sent.
 * A frame sealed under one label does not open under another, and a frame
 * sealed under none does not open under one.
 */
export interface SealOptions {
  label?: string;
  draw?: RandomBytes;
}

const utf8 = new TextEncoder();

// WebCrypto takes the additional data as a `BufferSource` or not at all, and
// `undefined` is how "not at all" is spelled — an empty array is a different
// seal from no additional data, so the two must not be confused here.
const aeadOf = (nonce: Uint8Array, label: string | undefined) => ({
  name: "AES-GCM" as const,
  iv: nonce as BufferSource,
  additionalData: label === undefined ? undefined : utf8.encode(label),
});

/** Seals one frame under a key, with a fresh nonce in front of it. */
export async function sealFrame(
  under: SealedUnder,
  plaintext: Uint8Array,
  { label, draw = randomBytes }: SealOptions = {}
): Promise<Uint8Array> {
  const nonce = draw(SEAL_NONCE_BYTES);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      aeadOf(nonce, label),
      await importKey(under.key),
      plaintext as BufferSource
    )
  );
  const frame = new Uint8Array(nonce.length + sealed.length);
  frame.set(nonce, 0);
  frame.set(sealed, nonce.length);
  return frame;
}

/**
 * Opens one frame, or refuses it.
 *
 * `label` is what the opener *expected* this frame to be, and a mismatch is a
 * {@link SealRefusedError} like any other: a chunk arriving out of order, twice,
 * or with one of its siblings missing opens under a label nobody derived.
 *
 * Both halves are copied out rather than passed as views: a `subarray` keeps
 * its parent's `ArrayBufferLike`, which `BufferSource` will not take.
 */
export async function openSealedFrame(
  under: SealedUnder,
  frame: Uint8Array,
  label?: string
): Promise<Uint8Array> {
  if (frame.length <= SEAL_NONCE_BYTES) throw new SealRefusedError();
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        aeadOf(frame.slice(0, SEAL_NONCE_BYTES), label),
        await importKey(under.key),
        frame.slice(SEAL_NONCE_BYTES)
      )
    );
  } catch {
    throw new SealRefusedError();
  }
}
