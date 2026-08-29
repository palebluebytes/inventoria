/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * One scan, and the meal goes.
 *
 * #194 §4.4 proves a WebRTC session needs a **bidirectional exchange**: ICE
 * keys a connectivity check on the peer's password (RFC 8445 §7.2.2), DTLS
 * requires the peer's fingerprint (RFC 5763 §5), and `generateCertificate()`
 * takes an algorithm rather than key material, so no shared seed derives one.
 * The hardware run showed both halves of that live — the answerer's ICE reached
 * `connected` in 8.3 s while its DTLS sat `connecting` for another 45 s, until
 * the offerer finally saw the answer.
 *
 * #199 §8 recorded this as "both devices must show and both must read, in every
 * mode". That was decided under §4's no-server premise, where a human was the
 * only channel available, so "bidirectional exchange" and "two QR codes" were
 * the same sentence. A rendezvous separates them: the exchange stays
 * bidirectional, and only one leg stays human.
 *
 * The security argument is the whole reason this is admissible, and it is two
 * separate mechanisms rather than one:
 *
 *   1. **The sender's fingerprint rides in the QR**, never through the
 *      rendezvous. #199 §9 admits a rendezvous "only if it cannot
 *      man-in-the-middle", and the fingerprint reaching the peer out of band is
 *      exactly what denies it that. The recipient refuses a fetched offer whose
 *      fingerprint does not match what it scanned.
 *   2. **The payload is encrypted under a key that also rides in the QR.** That
 *      covers the direction the QR cannot: the sender gets the *recipient's*
 *      fingerprint from the rendezvous and cannot check it, so a hostile
 *      rendezvous could pose as the recipient — and would then hold ciphertext
 *      for a key it never saw. Only whoever scanned the code can decrypt.
 *
 * What the rendezvous holds is two session descriptions for the seconds a
 * handshake takes. It never holds the meal, so #199 §4's "exactly two places,
 * never three" survives: the code's life is still bounded by the sender
 * waiting, which is what §4 wanted from synchrony in the first place.
 *
 * Pure but for `crypto` and `fetch`, both of which are the point.
 */

/** Where the throwaway rendezvous lives. See `probeRendezvousPlugin` in vite.config.ts. */
const RENDEZVOUS = "/__probe198";

/**
 * What a single QR has to carry.
 *
 * Deliberately tiny: the room is a lookup key, the fingerprint is the anti-MITM
 * binding, and the key is the confidentiality. Everything else about the
 * session is fetched. Encoded as three base64url fields joined by dots, so the
 * whole thing is QR alphanumeric-hostile but short enough not to care.
 */
export interface ScanCode {
  room: string;
  /** The sender's DTLS fingerprint, lowercase hex, colons stripped. */
  fingerprint: string;
  /** Raw AES-GCM key bytes, 32 of them. */
  key: Uint8Array;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const unb64url = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export function encodeScanCode(code: ScanCode): string {
  return [
    code.room,
    b64url(hexToBytes(code.fingerprint)),
    b64url(code.key),
  ].join(".");
}

export function decodeScanCode(text: string): ScanCode {
  const [room, fp, key] = text.trim().split(".");
  if (!room || !fp || !key) throw new Error("not a one-scan code");
  return {
    room,
    fingerprint: bytesToHex(unb64url(fp)),
    key: unb64url(key),
  };
}

/** A fresh room id and a fresh 256-bit payload key, per send. Nothing is reused. */
export function mintCode(fingerprint: string): ScanCode {
  const room = b64url(crypto.getRandomValues(new Uint8Array(9)));
  const key = crypto.getRandomValues(new Uint8Array(32));
  return { room, fingerprint, key };
}

// ---------------------------------------------------------------------------
// The rendezvous, as seen from a browser
// ---------------------------------------------------------------------------

export async function put(
  room: string,
  slot: "offer" | "answer",
  body: string
) {
  const res = await fetch(
    `${RENDEZVOUS}/${slot}?room=${encodeURIComponent(room)}`,
    {
      method: "PUT",
      body,
    }
  );
  if (!res.ok) throw new Error(`rendezvous refused the ${slot}: ${res.status}`);
}

export async function get(
  room: string,
  slot: "offer" | "answer"
): Promise<string | null> {
  const res = await fetch(
    `${RENDEZVOUS}/${slot}?room=${encodeURIComponent(room)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`rendezvous failed on ${slot}: ${res.status}`);
  return res.text();
}

/**
 * Waits for the other side to post its half.
 *
 * Polling rather than a socket because this is a probe and the wait is seconds,
 * and because #199 §5 forbids a device listening for a send it was not asked
 * for — a poll that starts when you show a code and stops when the send
 * finishes is scoped to exactly the send that started it.
 */
export async function poll(
  room: string,
  slot: "offer" | "answer",
  timeoutMs = 120_000,
  everyMs = 400
): Promise<string> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await get(room, slot);
    if (value) return value;
    if (Date.now() > until)
      throw new Error(`nothing posted to ${slot} in time`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

// ---------------------------------------------------------------------------
// The payload key
// ---------------------------------------------------------------------------

const importKey = (raw: Uint8Array) =>
  crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

/**
 * AES-GCM with a fresh 96-bit nonce prepended.
 *
 * The nonce is per-message and the key is per-send, so the pair is never
 * reused. GCM rather than CTR because the recipient has to be able to tell a
 * tampered payload from a real one, and #197 §5's refusals all run *after* this
 * point — a payload that fails here never becomes a refusal, it never becomes
 * anything at all.
 */
export async function seal(
  key: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await importKey(key),
      plaintext as BufferSource
    )
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return out;
}

export async function open(
  key: Uint8Array,
  sealed: Uint8Array
): Promise<Uint8Array> {
  // Copied out of the subarray rather than passed as a view: a `subarray` keeps
  // the parent's `ArrayBufferLike`, which WebCrypto's `BufferSource` will not take.
  const iv = sealed.slice(0, 12);
  const body = sealed.slice(12);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await importKey(key),
      body
    )
  );
}
