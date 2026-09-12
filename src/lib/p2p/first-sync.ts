/**
 * The first sync: two devices converge live, and only then does a pairing exist
 * (ADR-0075 §6, §7, §8 and §11; ADR-0096 §2 and §8).
 *
 * It runs in the **same room** the pairing secret crossed, straight after
 * `pairing-act.ts` has derived both lanes. The room id is spent and a successor
 * room derived from the secret is refused (ADR-0096 §8), so there is nothing to
 * reopen and nothing here dials.
 *
 * ### Guard 1, which is what keeps this design from being a sealed replica
 *
 * > **A pairing is not complete until its first sync completes. An incomplete
 * > pairing deposits nothing and collects nothing.**
 *
 * Made absolute rather than left at *has never converged directly*: a sync that
 * stopped at 1% would otherwise drop the outstanding 99% into the store, and
 * *a diff against an unseen base* would be true in letter and worthless in
 * substance. So this module writes nothing down. It returns what a Paired
 * Device record is made of, and an attempt that ends any other way returns
 * nothing at all — **an abandoned attempt leaves nothing on either side to
 * clean up**, because there is nothing on either side.
 *
 * That is also why an interruption is cheap rather than catastrophic. Rows
 * already imported are real data, correctly stamped; pairing again is a
 * **resume**, not a retry, because the next vector exchange simply skips them
 * (ADR-0096 §8).
 *
 * ### What crosses, and in what order
 *
 * Each lane runs `open → chunk 0 … chunk n → close`, and the two lanes run at
 * the same time because neither waits on the other to start.
 *
 *   - **`open`** carries this device's `device_id` and its version vector. The
 *     `device_id` is what the peer keys its record by, and ADR-0096 §8 is
 *     explicit that it *is not learned until the act is spent* — which is why
 *     "Pair again" can promise nothing about which row it replaces.
 *   - **`chunk`** carries the datom lines a holder of the peer's vector lacks,
 *     in the ledger's own NDJSON grammar. **An empty chunk is the final one**,
 *     which is the whole of the end-of-stream marker: `readLedgerPage` returns
 *     nothing only when the walk is finished, so a device with nothing to send
 *     sends exactly one frame and needs no separate case.
 *   - **`close`** carries this device's vector read **again**, after everything
 *     the peer sent has been imported.
 *
 * **The closing exchange is required, and ADR-0075 §6 exchanged vectors at the
 * handshake only.** Without it both sides finish holding a stale view of each
 * other from the very first moment — each believing the peer holds only its
 * pre-sync state — and the deposit that view sizes would re-send the whole
 * first sync. There is exactly one live session left in this design, so the fix
 * is needed in one place instead of everywhere.
 *
 * ### The seal, and what the label is for
 *
 * **One seal per chunk, with the chunk's sequence number bound into the AEAD's
 * additional data** (ADR-0075 §7). A single seal over 30 MB could not be
 * verified until the last byte, which means holding the whole thing in memory
 * before writing a row; per-chunk seals give incremental `importLedgerRows`
 * batches instead, and make a dropped socket cost the chunk in flight rather
 * than the sync.
 *
 * The label also carries the **lane**, which costs nothing and closes a hole
 * the sequence number alone leaves: both directions run under one room key, so
 * without it a frame reflected back at its own sender would verify.
 *
 * **The key is the room's, not the lane's, and that is not an oversight.** The
 * chains `pairing-act.ts` just derived seal *deposits* — objects left at an
 * address on a server, which is where ADR-0096 §4's forward secrecy has
 * something to protect. A live room holds nothing at rest, so its seal is
 * ADR-0072 §2's, under the key that rode in the code. The lane appears here as
 * a label because it names a direction, not because a chain state is in use.
 *
 * ### Three payload rules of ADR-0073 invert here, deliberately
 *
 * **Superseded datoms cross** (or it is not a ledger sync), **photos cross**,
 * and **stamps are kept rather than restamped** — the receiving side advances
 * its own clock to them instead, per chunk, which `db.worker.ts` already does
 * on every `ledger_import` batch (ADR-0075 §8). Skipping an entity you already
 * hold is right when a stranger hands you a meal and exactly wrong between your
 * own devices, where the whole point is that a later fact wins.
 *
 * Nothing is compressed, unlike the Meal send. The chunk budget is what bounds
 * a frame either way, and a seal per chunk is what ADR-0075 §7 asks for; adding
 * a `CompressionStream` at both ends later changes no framing and no label.
 */

import { cursorOf, type LedgerCursor, type LedgerRow } from "../db/db.core";
import { datomLine } from "../db/ledger-export";
import { parseNdjsonObject } from "../db/ledger-import";
import { readVersionVector, type VersionVector } from "../db/version-vector";
import { refusingChunk, readDatomChunk } from "./datom-chunk";
import type { LaneDirection, PairedChains } from "./pairing-chain";
import type { PairingCode } from "./pairing-code";
import { whyRoomEnded, type Room } from "./relay-room";
import { openSealedFrame, sealFrame } from "./sealed-frame";

/**
 * Bytes of datom value fetched, sealed and sent in one chunk.
 *
 * Smaller than the export's page budget, because this one becomes a WebSocket
 * frame rather than a write to a file. It leaves room under the megabyte a
 * Durable Object will carry for the NDJSON's own keys and for `JSON.stringify`
 * escaping a value that is already JSON text.
 */
export const SYNC_CHUNK_BUDGET_BYTES = 256 * 1024;

/** The namespace every label on this wire sits under. */
export const SYNC_INFO_PREFIX = "inventoria/v1/sync/";

const openLabel = (lane: LaneDirection) => `${SYNC_INFO_PREFIX}${lane}/open`;
const chunkLabel = (lane: LaneDirection, seq: number) =>
  `${SYNC_INFO_PREFIX}${lane}/chunk/${seq}`;
const closeLabel = (lane: LaneDirection) => `${SYNC_INFO_PREFIX}${lane}/close`;

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

// ---------------------------------------------------------------------------
// The seam onto the ledger
// ---------------------------------------------------------------------------

/**
 * What a first sync needs of the ledger, as four operations rather than as a
 * database handle: SQLite lives in the worker, and a test proves this protocol
 * against two real ledgers without standing one up in this thread.
 */
export interface FirstSyncLedger {
  /** This device's own id, which is what the peer keys its record by. */
  readonly device_id: string;
  /** What this ledger holds, per originating device. Queried, never stored. */
  vector(): Promise<VersionVector>;
  /** The next rows a holder of `above` lacks; empty once the walk is done. */
  page(
    after: LedgerCursor | null,
    budgetBytes: number,
    above: VersionVector
  ): Promise<LedgerRow[]>;
  /**
   * Appends one chunk with its stamps intact, returning how many rows were new.
   * `final` is what makes every projection re-read once rather than per chunk.
   */
  write(rows: LedgerRow[], final: boolean): Promise<number>;
}

/** How far a first sync has got, on both sides at once. */
export interface FirstSyncProgress {
  rows_sent: number;
  rows_received: number;
}

export interface FirstSyncOptions {
  onProgress?: (progress: FirstSyncProgress) => void;
  chunkBudgetBytes?: number;
}

/**
 * Everything a completed sync knows about the peer, and the whole of what the
 * caller writes down. It carries no credential: the chain state is the pairing
 * act's, and this says who the peer is and what it holds.
 */
export interface FirstSyncResult extends FirstSyncProgress {
  /** The peer's own id, as the peer named itself. */
  device_id: string;
  /** What the peer held when it closed — this device's view of it from now. */
  peer_vector: VersionVector;
}

// ---------------------------------------------------------------------------
// The act
// ---------------------------------------------------------------------------

/**
 * Runs one first sync to completion, in a room both devices are already in.
 *
 * Resolving means **converged**: everything this device lacked has been
 * imported, everything the peer lacked has left, and the peer has said what it
 * holds. Anything else throws, and throws the same three kinds the pairing act
 * does — `RoomFailedError` for how the session ended, `SealRefusedError` for a
 * frame that did not come from this code, and {@link PairingRefusedError} for
 * one that opened to something this version cannot read.
 */
export async function runFirstSync(
  room: Room,
  code: PairingCode,
  chains: PairedChains,
  ledger: FirstSyncLedger,
  {
    onProgress,
    chunkBudgetBytes = SYNC_CHUNK_BUDGET_BYTES,
  }: FirstSyncOptions = {}
): Promise<FirstSyncResult> {
  const ours = chains.deposit.direction;
  const theirs = chains.collect.direction;

  const open = (bytes: Uint8Array, label: string) =>
    openSealedFrame(code, bytes, label).then((plain) => fromUtf8.decode(plain));

  const opened = latch<PeerOpening>();
  const drained = latch<void>();
  // The third latch is `collect`'s, and it is the one that is easy to miss:
  // `collect` waits on the room rather than on a latch, and a room whose
  // session has been left never says another word. Without this, a failure in
  // `deposit` would leave this task, its closure and any in-flight import
  // retained for the life of the page.
  const ended = latch<never>();
  const progress: FirstSyncProgress = { rows_sent: 0, rows_received: 0 };
  const said = () => onProgress?.({ ...progress });

  const send = async (label: string, body: string) =>
    room.send(await sealFrame(code, utf8.encode(body), { label }));

  /**
   * This lane, end to end. It does not touch the room's event queue: `receive`
   * is the only reader, because {@link Room.next} holds one waiter.
   */
  async function deposit(): Promise<void> {
    await send(
      openLabel(ours),
      JSON.stringify({
        device_id: ledger.device_id,
        vector: await ledger.vector(),
      })
    );

    const peer = await opened.waited;
    let after: LedgerCursor | null = null;
    for (let seq = 0; ; seq += 1) {
      const rows = await ledger.page(after, chunkBudgetBytes, peer.vector);
      await send(chunkLabel(ours, seq), rows.map(datomLine).join(""));
      // An empty chunk is the end of this lane, and `readLedgerPage` returns
      // one only when the walk is finished.
      if (rows.length === 0) break;
      progress.rows_sent += rows.length;
      said();
      after = cursorOf(rows[rows.length - 1]);
    }

    // The closing vector has to be read after the peer's last row has landed,
    // or it would understate what this device holds and the peer's very first
    // deposit would re-send rows it had already delivered.
    await drained.waited;
    await send(
      closeLabel(ours),
      JSON.stringify({ vector: await ledger.vector() })
    );
  }

  /** The peer's lane, read in the order the peer sent it. */
  async function collect(): Promise<PeerClosing> {
    let peer: PeerOpening | null = null;
    let seq = 0;
    let draining = true;

    for (;;) {
      const event = await Promise.race([room.next(), ended.waited]);

      // A second peer word is a rejoin: the room survives a lost socket and
      // keeps the session. Nothing is resent — a frame lost with the socket
      // stalls this lane until the room's five minutes end it, which is the
      // resume ADR-0096 §8 makes cheap rather than a gap this loop repairs.
      if (event.kind === "peer") continue;

      if (event.kind !== "frame") {
        throw whyRoomEnded(event, "you called this off part way through.");
      }

      if (!peer) {
        peer = readOpening(await open(event.bytes, openLabel(theirs)));
        opened.settle(peer);
        continue;
      }

      if (draining) {
        const body = await open(event.bytes, chunkLabel(theirs, seq));
        seq += 1;
        const rows = readDatomChunk(body);
        if (rows.length === 0) {
          // The peer's lane is finished. One `final` write so every projection
          // re-reads once rather than once per chunk.
          await ledger.write([], true);
          draining = false;
          drained.settle();
          continue;
        }
        await ledger.write(rows, false);
        progress.rows_received += rows.length;
        said();
        continue;
      }

      // The peer named itself when it opened; what it closes with is what it
      // holds, and the two together are the whole of the record.
      return {
        device_id: peer.device_id,
        peer_vector: readClosingVector(
          await open(event.bytes, closeLabel(theirs))
        ),
      };
    }
  }

  try {
    const [, peer] = await Promise.all([deposit(), collect()]);
    // The counts are read where both halves are done rather than where the
    // peer's close landed. Reading them at the close happens to be correct —
    // `drained` stops the peer closing until it holds this lane's final chunk,
    // by which point `rows_sent` is complete — but that is a cross-lane
    // argument three functions apart, and this needs none of it.
    return { ...peer, ...progress };
  } catch (failure) {
    // Whichever half failed, the other is still waiting — `deposit` on one of
    // the two latches it does not settle itself, `collect` on a room that has
    // nothing more to say. Both are told, so neither is left behind.
    opened.fail(failure);
    drained.fail(failure);
    ended.fail(failure);
    throw failure;
  }
}

// ---------------------------------------------------------------------------
// The bodies, read to the standard ADR-0075 §13 sets
// ---------------------------------------------------------------------------

interface PeerOpening {
  device_id: string;
  vector: VersionVector;
}

/** Who the peer is, and what it held when it closed. The record's two facts. */
type PeerClosing = Omit<FirstSyncResult, keyof FirstSyncProgress>;

function readOpening(body: string): PeerOpening {
  return refusingChunk(() => {
    const raw = parseNdjsonObject(body, null);
    const device_id = raw.device_id;
    if (typeof device_id !== "string" || device_id.length === 0) {
      throw new Error("the other device did not say which device it is.");
    }
    return { device_id, vector: readVersionVector(raw.vector) };
  });
}

/** The closing frame carries a vector and nothing else: the peer already said
 * who it was when it opened, and saying it twice would be a second place for
 * the two statements to disagree. */
function readClosingVector(body: string): VersionVector {
  return refusingChunk(() =>
    readVersionVector(parseNdjsonObject(body, null).vector)
  );
}

// ---------------------------------------------------------------------------

/**
 * A one-shot signal one half of the act waits on and the other settles.
 *
 * The two lanes are genuinely concurrent — neither can wait for the other to
 * finish without deadlocking — and there are exactly two moments where one has
 * to know something the other learned. A latch says that in the shape it is
 * rather than through a polled flag.
 */
function latch<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const waited = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // Nothing awaits a latch until its own half has work to do, so a rejection
  // that arrives first would otherwise be an unhandled one.
  waited.catch(() => {});
  return { waited, settle, fail };
}
