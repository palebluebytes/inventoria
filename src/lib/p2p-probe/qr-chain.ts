/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * Chunking a payload across a chain of QR symbols, and putting it back
 * together on the other side.
 *
 * #194 §9 recorded, as an explicitly unsourced deduction, that a browser-based
 * reader "cannot reassemble a Structured Append set through `BarcodeDetector`".
 * That is true of the native `BarcodeDetector` API, which exposes only
 * `rawValue`, `format` and a bounding box. It is NOT true of `zxing-wasm`,
 * which this repo already ships: its `ReadResult` carries `sequenceSize`,
 * `sequenceIndex` and `sequenceId` (see `bindings/readResult.d.ts`). The
 * writer, however, exposes no way to CREATE a Structured Append sequence, so
 * the standard's own chaining is unavailable to the sending half regardless.
 *
 * Hence our own frame header. We control both ends, so this costs 14 bytes a
 * symbol and buys independence from a feature only one half of the library has.
 *
 * Frame layout, little-endian throughout:
 *
 *   0..2    magic  "IV1"
 *   3       kind   0x01 payload chunk
 *   4..5    seqId  random per transfer, so two overlapping transfers cannot mix
 *   6..7    total  number of chunks in this transfer
 *   8..9    index  0-based position of this chunk
 *   10..13  crc32  over the WHOLE reassembled payload, repeated in every frame
 *   14..    body
 *
 * The whole-payload CRC riding in every frame is deliberate: a receiver can
 * verify the reassembly the moment the last chunk lands, without a trailer
 * symbol that could itself be the one that never scans.
 *
 * Pure. No DOM, no camera, no zxing.
 */

/** Bytes of frame header before the body starts. */
export const FRAME_HEADER_BYTES = 14;

const MAGIC = [0x49, 0x56, 0x31]; // "IV1"
const KIND_CHUNK = 0x01;

/** The largest chunk index the 2-byte field can name, hence the chain limit. */
export const MAX_CHUNKS = 0xffff;

export interface Chunk {
  seqId: number;
  total: number;
  index: number;
  crc32: number;
  body: Uint8Array;
}

// ---------------------------------------------------------------------------
// CRC32 — the standard reflected polynomial, table built once.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Sending half
// ---------------------------------------------------------------------------

/**
 * Splits a payload into frames of at most `symbolBytes` each, header included.
 *
 * `symbolBytes` is the QR symbol's byte-mode capacity, not the body size — the
 * caller thinks in symbol capacity, which is what the version table and the
 * scanning ceiling are both expressed in.
 */
export function toFrames(
  payload: Uint8Array,
  symbolBytes: number,
  seqId: number
): Uint8Array[] {
  const bodyBytes = symbolBytes - FRAME_HEADER_BYTES;
  if (bodyBytes <= 0)
    throw new Error(`symbolBytes ${symbolBytes} leaves no room for a body`);

  const total = Math.max(1, Math.ceil(payload.length / bodyBytes));
  if (total > MAX_CHUNKS)
    throw new Error(
      `${total} chunks exceeds the ${MAX_CHUNKS} the header names`
    );

  const checksum = crc32(payload);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index++) {
    const body = payload.subarray(index * bodyBytes, (index + 1) * bodyBytes);
    const frame = new Uint8Array(FRAME_HEADER_BYTES + body.length);
    const view = new DataView(frame.buffer);
    frame.set(MAGIC, 0);
    frame[3] = KIND_CHUNK;
    view.setUint16(4, seqId & 0xffff, true);
    view.setUint16(6, total, true);
    view.setUint16(8, index, true);
    view.setUint32(10, checksum, true);
    frame.set(body, FRAME_HEADER_BYTES);
    frames.push(frame);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Receiving half
// ---------------------------------------------------------------------------

/** Reads a scanned frame back, or null if these bytes are not one of ours. */
export function parseFrame(bytes: Uint8Array): Chunk | null {
  if (bytes.length < FRAME_HEADER_BYTES) return null;
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2])
    return null;
  if (bytes[3] !== KIND_CHUNK) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const total = view.getUint16(6, true);
  const index = view.getUint16(8, true);
  if (total === 0 || index >= total) return null;
  return {
    seqId: view.getUint16(4, true),
    total,
    index,
    crc32: view.getUint32(10, true),
    body: bytes.subarray(FRAME_HEADER_BYTES),
  };
}

export type AcceptResult =
  | { kind: "duplicate" }
  | { kind: "foreign" }
  | { kind: "accepted"; have: number; total: number }
  | { kind: "complete"; payload: Uint8Array; checksumOk: boolean };

/**
 * Collects frames until the chain is whole.
 *
 * Order-independent and duplicate-tolerant, because a camera pointed at a
 * cycling display will re-read symbols it already has and will miss others —
 * which is the behaviour the probe is there to measure.
 */
export class Reassembler {
  private seqId: number | null = null;
  private total = 0;
  private expectedCrc = 0;
  private readonly parts = new Map<number, Uint8Array>();

  /** Chunk indices still missing, for the progress readout. */
  missing(): number[] {
    if (this.total === 0) return [];
    const gaps: number[] = [];
    for (let i = 0; i < this.total; i++) if (!this.parts.has(i)) gaps.push(i);
    return gaps;
  }

  have(): number {
    return this.parts.size;
  }

  expected(): number {
    return this.total;
  }

  accept(chunk: Chunk): AcceptResult {
    // First frame of a transfer fixes what transfer we are on. A frame from a
    // different sequence is somebody else's chain, not a corruption of ours.
    if (this.seqId === null) {
      this.seqId = chunk.seqId;
      this.total = chunk.total;
      this.expectedCrc = chunk.crc32;
    } else if (chunk.seqId !== this.seqId) {
      return { kind: "foreign" };
    }

    if (this.parts.has(chunk.index)) return { kind: "duplicate" };
    this.parts.set(chunk.index, chunk.body);

    if (this.parts.size < this.total)
      return { kind: "accepted", have: this.parts.size, total: this.total };

    const size = [...this.parts.values()].reduce((n, b) => n + b.length, 0);
    const payload = new Uint8Array(size);
    let at = 0;
    for (let i = 0; i < this.total; i++) {
      const part = this.parts.get(i)!;
      payload.set(part, at);
      at += part.length;
    }
    return {
      kind: "complete",
      payload,
      checksumOk: crc32(payload) === this.expectedCrc,
    };
  }

  reset(): void {
    this.seqId = null;
    this.total = 0;
    this.expectedCrc = 0;
    this.parts.clear();
  }
}
