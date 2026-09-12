/**
 * The object a Deposit is: a generation, and a stream of sealed chunks bound to
 * it (ADR-0096 §5).
 *
 * ### What the seal binds, and why the fourth field is the interesting one
 *
 * > **The AEAD's additional data binds `{index, generation, chunk seq, final}`.**
 *
 * ADR-0075 §7 already bound the **chunk sequence**, so a chunk cannot be
 * reordered, replayed or dropped without the seal failing. The **final** marker
 * makes a truncated collection re-collectable rather than destroyed: the
 * collector deletes only once the last frame in the object opens as the final
 * one, so a stream missing its tail refuses and is left where it is.
 *
 * The **generation** is the one nobody had. Several distinct sealed objects
 * exist at the same address under the same key over the life of one index —
 * that is what supersede-in-place means — so without it a chunk from rewrite 3
 * verifies inside rewrite 7's stream: same key, same index, same sequence, seal
 * passes. An operator that kept a superseded copy could splice a stale delta
 * into a fresh collection and the collector would import it as authentic. Not
 * hypothetical: R2 overwrites the object, but nothing stops whoever holds the
 * disk from keeping the bytes.
 *
 * **The generation is in the clear, and it has to be**, because the collector
 * needs it to derive the label it opens chunk 0 under. It reveals nothing: it
 * is a fresh random draw per rewrite, meaning the same thing to the operator as
 * a nonce. It is not trusted either — a generation rewritten by anyone on the
 * path simply produces labels nothing verifies under, which is a refusal.
 *
 * **The direction is not bound, deliberately.** Both lanes of a pairing derive
 * their seal keys under different `direction` labels (§4), so a lane's object
 * cannot open under the other lane's key at all and binding it again would be
 * binding the same fact twice. The live room's frames need the lane in their
 * label precisely because both directions there run under *one* key.
 *
 * ### The shape on the wire
 *
 * ```
 *   [ generation ][ u32 length ][ sealed chunk ] … [ u32 length ][ sealed chunk ]
 * ```
 *
 * Length-prefixed rather than delimited, because the payload is ciphertext and
 * has no bytes a delimiter could be safe from. Big-endian, which is what every
 * other length on a wire is, and four bytes, which is more than the 16 MiB
 * ceiling (§1) can reach.
 */

import { randomBytes, type RandomBytes } from "./room-code";
import {
  openSealedFrame,
  sealFrame,
  SEAL_NONCE_BYTES,
  SEAL_TAG_BYTES,
  type SealedUnder,
} from "./sealed-frame";

/**
 * The generation's width: 128 bits, drawn fresh for every rewrite.
 *
 * Sized against collision rather than against an attacker — it is an
 * identifier, not a secret — at the same width as a UUID and for the same
 * reason: over the life of one index there will be a handful of rewrites, and
 * a repeat is what would let one generation's chunk verify inside another's.
 */
export const DEPOSIT_GENERATION_BYTES = 16;

/** How a frame's length is written: four bytes, big-endian. */
const FRAME_LENGTH_BYTES = 4;

/** The namespace every label on the store's path sits under. */
export const DEPOSIT_INFO_PREFIX = "inventoria/v1/deposit/";

/**
 * What one chunk costs on top of its plaintext: its length prefix, its nonce
 * and its tag.
 *
 * Exported because the ceiling is a bound on **the object**, so whoever fills
 * one has to be able to price a chunk before sealing it (§1).
 */
export const CHUNK_OVERHEAD_BYTES =
  FRAME_LENGTH_BYTES + SEAL_NONCE_BYTES + SEAL_TAG_BYTES;

/**
 * An object that is not a Deposit this version can read: a length that runs off
 * the end, a trailing byte, no chunks at all.
 *
 * Distinct from `SealRefusedError`, which is a chunk that would not open. The
 * two are different news only to a reader of the logs — a wake does the same
 * thing with either, which is to leave the object where it is and try again on
 * the next open — but keeping them apart is what stops a framing bug in this
 * module reading as a splicing attempt.
 */
export class DepositRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DepositRefusedError";
  }
}

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * What one chunk is sealed as. Never sent: both ends derive it, which is what
 * makes it an assertion about the object rather than a field anyone can
 * rewrite.
 */
const chunkLabel = (
  index: number,
  generation: string,
  seq: number,
  final: boolean
): string =>
  `${DEPOSIT_INFO_PREFIX}${index}/${generation}/${seq}/${final ? "final" : "more"}`;

/** How many bytes a chunk of this plaintext will occupy in the object. */
export const chunkCost = (plaintextBytes: number): number =>
  plaintextBytes + CHUNK_OVERHEAD_BYTES;

/**
 * Seals one Deposit: a fresh generation, then every chunk bound to it.
 *
 * The chunks are the caller's — this module has no opinion about what is in
 * them, which is what keeps the envelope and the datom pages one concern
 * (`wake.ts`) and the sealing another. At least one is required, because a
 * Deposit with no final chunk is an object no collector may delete.
 */
export async function sealDeposit(
  under: SealedUnder,
  index: number,
  chunks: readonly Uint8Array[],
  draw: RandomBytes = randomBytes
): Promise<Uint8Array> {
  if (chunks.length === 0) {
    throw new DepositRefusedError("a deposit carries at least one chunk.");
  }
  const generation = draw(DEPOSIT_GENERATION_BYTES);
  const label = (seq: number) =>
    chunkLabel(index, hex(generation), seq, seq === chunks.length - 1);

  const sealed = await Promise.all(
    chunks.map((plain, seq) => sealFrame(under, plain, { label: label(seq) }))
  );

  const object = new Uint8Array(
    sealed.reduce(
      (total, frame) => total + FRAME_LENGTH_BYTES + frame.length,
      DEPOSIT_GENERATION_BYTES
    )
  );
  object.set(generation, 0);
  const lengths = new DataView(object.buffer);
  let at = DEPOSIT_GENERATION_BYTES;
  for (const frame of sealed) {
    lengths.setUint32(at, frame.length);
    at += FRAME_LENGTH_BYTES;
    object.set(frame, at);
    at += frame.length;
  }
  return object;
}

/**
 * Opens one Deposit, whole, and hands back every chunk's plaintext in order.
 *
 * **Every chunk is verified before any of it is returned**, which is how the
 * collector's rule — _delete only after the final chunk verifies_ — is kept in
 * one place rather than trusted to a caller's loop. The whole object is already
 * in memory by the time it gets here (one `GET` of at most 16 MiB), so nothing
 * is bought by streaming it, and a great deal is lost: a half-verified stream
 * whose tail turns out to be spliced would have already been imported.
 *
 * **The last frame in the object is the one opened as final**, which needs no
 * count on the wire and gives a truncation nowhere to hide. A stream cut short
 * at a frame boundary ends on a chunk sealed as `more`, which does not open as
 * `final`; one cut mid-frame fails its length check here.
 */
export async function openDeposit(
  under: SealedUnder,
  index: number,
  object: Uint8Array
): Promise<Uint8Array[]> {
  if (object.length < DEPOSIT_GENERATION_BYTES) {
    throw new DepositRefusedError("a deposit begins with its generation.");
  }
  const generation = hex(object.slice(0, DEPOSIT_GENERATION_BYTES));

  const frames: Uint8Array[] = [];
  const lengths = new DataView(
    object.buffer,
    object.byteOffset,
    object.byteLength
  );
  let at = DEPOSIT_GENERATION_BYTES;
  while (at < object.length) {
    if (at + FRAME_LENGTH_BYTES > object.length) {
      throw new DepositRefusedError("a chunk's length runs off the end.");
    }
    const length = lengths.getUint32(at);
    at += FRAME_LENGTH_BYTES;
    if (at + length > object.length) {
      throw new DepositRefusedError("a chunk runs off the end.");
    }
    frames.push(object.slice(at, at + length));
    at += length;
  }
  if (frames.length === 0) {
    throw new DepositRefusedError("a deposit carries at least one chunk.");
  }

  return Promise.all(
    frames.map((frame, seq) =>
      openSealedFrame(
        under,
        frame,
        chunkLabel(index, generation, seq, seq === frames.length - 1)
      )
    )
  );
}
