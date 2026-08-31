/**
 * The seal: AES-GCM under the key that rides in the Send code (ADR-0072 §2).
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
 */

import { randomBytes, type RandomBytes, type SendCode } from "./send-code";

/** The nonce's width: 96 bits, the size AES-GCM is specified for. */
export const SEAL_NONCE_BYTES = 12;

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

/** Seals one frame under a code, with a fresh nonce in front of it. */
export async function sealFrame(
  code: SendCode,
  plaintext: Uint8Array,
  draw: RandomBytes = randomBytes
): Promise<Uint8Array> {
  const nonce = draw(SEAL_NONCE_BYTES);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      await importKey(code.key),
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
 * Both halves are copied out rather than passed as views: a `subarray` keeps
 * its parent's `ArrayBufferLike`, which `BufferSource` will not take.
 */
export async function openSealedFrame(
  code: SendCode,
  frame: Uint8Array
): Promise<Uint8Array> {
  if (frame.length <= SEAL_NONCE_BYTES) throw new SealRefusedError();
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: frame.slice(0, SEAL_NONCE_BYTES) },
        await importKey(code.key),
        frame.slice(SEAL_NONCE_BYTES)
      )
    );
  } catch {
    throw new SealRefusedError();
  }
}
