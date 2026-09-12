/**
 * One Wake against one pairing: collect the incoming lane, deposit the outgoing
 * one (ADR-0096 §3, §5 and §7).
 *
 * > **A device converges once per app open: it collects what its peer left,
 * > deposits what its peer lacks, and joins a live room only to complete a
 * > pairing.**
 *
 * This is the half of the arc that makes the promise true — _your phone and
 * your laptop converge without ever being open at the same time_. Nothing here
 * dials a relay and nothing here waits for anybody: a deposit is left at an
 * address, and it is still there when the other device wakes up a week later.
 *
 * ### The order is collect, then deposit, and it is load-bearing
 *
 * **The collector advances on collecting; the depositor on receiving the
 * acknowledgement** (§5's amendment). Between those two moments the depositor
 * rewrites at the old index while the collector finds nothing at the new one,
 * and it self-heals only because the acknowledgement is **re-asserted in every
 * deposit**. **A collector finding nothing is normal** — it is not an error, it
 * is not a toast, and it must not be repaired with the scan window §4 boasts of
 * not needing.
 *
 * Collecting first is what makes the healthy path never see a refused rewrite:
 * the acknowledgement for the outstanding index arrives, the deposit lane
 * advances, and the wake's own deposit lands at a fresh index with no
 * precondition to fail.
 *
 * ### A deposit goes out even when there is nothing to send
 *
 * **An acknowledgement-only deposit is a real deposit.** A device with nothing
 * of its own to send still spends a wake depositing, or its peer's chain stalls
 * at an index the conditional rewrite will not let it recreate — the read-mostly
 * tablet would otherwise be a permanent chain-stopper for the device that
 * actually writes.
 *
 * ### No version vector crosses, and that is a decision
 *
 * A deposit carries **an acknowledgement and a delta, either of which may be
 * empty**, and that list is the whole of §3's. The peer's own vector crosses
 * exactly once, at the first sync's closing exchange; from then on each side
 * keeps its view of the other current from what it has **observed** — rows it
 * collected, which the peer necessarily held to send, and rows of its own the
 * peer acknowledged collecting. Re-asserting a vector would state which *third*
 * devices this ledger has heard from, which §6 shuts the door on, and would buy
 * only exactness. See `vectorWith` for why the inexact direction is the safe
 * one.
 *
 * ### What this module is not
 *
 * It is one pairing and one wake. The cadence §3's amendment adds — a deposit
 * whenever the delta grows, a collection no more than hourly in a session that
 * stays open — is #397's, and the fan-out at three or more devices is #401's.
 * Both are callers of this, not changes to it.
 */

import { cursorOf, type LedgerCursor, type LedgerRow } from "../db/db.core";
import { datomLine } from "../db/ledger-export";
import { parseNdjsonObject } from "../db/ledger-import";
import {
  mergeVersionVectors,
  vectorWith,
  type VersionVector,
} from "../db/version-vector";
import {
  advancedLane,
  laneChainOf,
  type PairedDevice,
} from "../stores/paired-devices";
import { DEPOSIT_CEILING_BYTES, type Store } from "./deposit-store";
import { deriveLaneKey, type LaneChain } from "./pairing-chain";
import { readDatomChunk, refusingChunk } from "./datom-chunk";
import { base64url, randomBytes, type RandomBytes } from "./room-code";
import {
  chunkCost,
  openDeposit,
  sealDeposit,
  DEPOSIT_GENERATION_BYTES,
} from "./sealed-deposit";

/**
 * Bytes of datom value read into one chunk of a deposit.
 *
 * The same budget a first sync uses, and for a weaker reason: nothing here is a
 * WebSocket frame, so the number is not a transport bound but the granularity
 * an import batch arrives in. Keeping it the same means one number to reason
 * about when a ledger crosses by either route.
 */
export const DEPOSIT_CHUNK_BUDGET_BYTES = 256 * 1024;

/**
 * What a wake needs of the ledger, as two operations rather than a database
 * handle: SQLite lives in the worker, and a test proves this protocol against
 * two real ledgers without standing one up in this thread.
 *
 * It is `FirstSyncLedger` minus the two things only a live session needs — this
 * device's own id, which nothing on this path states, and its own vector, which
 * no deposit carries.
 */
export interface WakeLedger {
  /**
   * The **oldest** rows a holder of `above` lacks; empty once the walk is done.
   *
   * Oldest is in the name because it is the requirement rather than a
   * preference. A deposit may be cut short by the ceiling, and the only thing
   * that can summarise a cut-short walk is a version vector — which describes a
   * set that is downward-closed in stamp order and nothing else. Walked by
   * primary key, a prefix is not: `event:aaa` stamped 900 comes before
   * `event:bbb` stamped 100, so the vector after the first chunk would claim a
   * watermark of 900 and `event:bbb` would be withheld **permanently**. ADR-0096
   * §1 says it in one word — a depositor over the ceiling deposits its _oldest_
   * 16 MiB.
   */
  oldestAbove(
    after: LedgerCursor | null,
    budgetBytes: number,
    above: VersionVector
  ): Promise<LedgerRow[]>;
  /** Appends one chunk with its stamps intact, returning how many rows were new. */
  write(rows: LedgerRow[], final: boolean): Promise<number>;
}

/**
 * What a deposit says beside its datoms, and the list is closed (§3, §6).
 *
 * One field, because an acknowledgement is **for an index**: a bare flag would
 * be an advance signal an operator could trigger by replaying bytes it holds,
 * and under a ratchet with old state dropped an advance past an uncollected
 * index is permanent, unrecoverable desynchronisation rather than a lost delta.
 * `null` is a device that has collected nothing yet.
 *
 * The device roster §6 admits is #398's, and adding it is an edit here.
 */
export interface DepositEnvelope {
  acknowledges: number | null;
}

export interface WakeOptions {
  /**
   * Writes the record back, called every time this wake moves it.
   *
   * Between the two calls sit a `DELETE` and a `PUT`, so it is not an ending
   * hook: the collect lane is persisted **before** the object it took is
   * discarded, because a delete that lands against a record that did not is an
   * object nobody will ever collect again.
   */
  keep: (device: PairedDevice) => void;
  ceilingBytes?: number;
  chunkBudgetBytes?: number;
  draw?: RandomBytes;
}

/** What one wake did with one pairing. Nothing here reaches a screen. */
export interface WakeOutcome {
  /** Rows this device took from its peer's deposit. */
  collected: number;
  /** Rows this device's own deposit carries. */
  deposited: number;
  /** Whether the peer's acknowledgement advanced this device's deposit lane. */
  acknowledged: boolean;
  /** Whether a rewrite was refused, which means the peer had collected it. */
  refused: boolean;
  /**
   * Whether an outstanding delta exists that no deposit can carry.
   *
   * The ceiling **drains rather than refuses** — a backlog empties one ceiling
   * per round trip — and the one thing draining cannot reach is a single datom
   * wider than a whole deposit. `readLedgerPage` hands back one row however
   * large it is, so the walk never stalls; this lane would. It is reported
   * rather than repaired, because the repair is a decision (split a value
   * across deposits) and not a line of code.
   */
  jammed: boolean;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/**
 * Runs one wake against one pairing.
 *
 * It resolves to what happened and shows nothing: steady state shows nothing
 * (ADR-0075 §11), and the two outcomes a caller might mistake for failures —
 * a collection that finds nothing, and a rewrite that is refused — are both
 * normal. It throws only where the store could not be reached or what came back
 * would not open, which is a wake that did not converge and will try again on
 * the next open.
 */
export async function convergeWithPeer(
  paired: PairedDevice,
  store: Store,
  ledger: WakeLedger,
  {
    keep,
    ceilingBytes = DEPOSIT_CEILING_BYTES,
    chunkBudgetBytes = DEPOSIT_CHUNK_BUDGET_BYTES,
    draw = randomBytes,
  }: WakeOptions
): Promise<WakeOutcome> {
  const taken = await collectLane(paired, store, ledger, keep);
  const left = await depositLane(taken.device, store, keep, {
    ledger,
    ceilingBytes,
    chunkBudgetBytes,
    draw,
  });
  return {
    collected: taken.collected,
    acknowledged: taken.acknowledged,
    deposited: left.deposited,
    refused: left.refused,
    jammed: left.jammed,
  };
}

// ---------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------

/**
 * Takes the peer's deposit, if there is one: `GET`, verify, import, advance,
 * and only then `DELETE`.
 *
 * **The delete comes last and after the final chunk verifies**, which is what
 * makes a truncated collection re-collectable rather than destroyed. It comes
 * after the record is written back too: an advance this device forgot is an
 * address it would ask for again and find empty forever, where a delete that
 * did not land is one object the backstop expiry reaps.
 */
async function collectLane(
  device: PairedDevice,
  store: Store,
  ledger: WakeLedger,
  keep: (device: PairedDevice) => void
): Promise<{ device: PairedDevice; collected: number; acknowledged: boolean }> {
  const lane = laneChainOf(device.collect);
  const address = await laneAddress(lane);
  const held = await store.collect(address);
  // The normal outcome, said plainly: the peer has not deposited since this
  // device last collected, or has not woken at all.
  if (!held) return { device, collected: 0, acknowledged: false };

  const chunks = await openDeposit(
    { key: await deriveLaneKey(lane, "seal") },
    device.collect.index,
    held.bytes
  );
  const [head, ...pages] = chunks;
  const envelope = readEnvelope(fromUtf8.decode(head));

  // The acknowledgement is applied first, so the rows below fold into the view
  // of the peer that it establishes rather than into the one it supersedes.
  const acknowledged = await acknowledging(device, envelope.acknowledges);
  let peer_vector = acknowledged.device.peer_vector;
  let collected = 0;
  for (const [seq, page] of pages.entries()) {
    const rows = readDatomChunk(fromUtf8.decode(page));
    // `final` on the last, so every projection re-reads once rather than once
    // per chunk (ADR-0075 §8).
    await ledger.write(rows, seq === pages.length - 1);
    peer_vector = vectorWith(peer_vector, rows);
    collected += rows.length;
  }

  const next: PairedDevice = {
    ...acknowledged.device,
    collect: await advancedLane(device.collect),
    peer_vector,
  };
  keep(next);
  await store.discard(address);
  return { device: next, collected, acknowledged: acknowledged.advanced };
}

/**
 * Applies the peer's acknowledgement to this device's deposit lane.
 *
 * **An acknowledgement is for an index, and one for any other index is
 * discarded.** A replayed one names an index this lane has already left; a
 * forged one names an index nothing was deposited at. Both fall through here
 * and cost nothing, which is the point — only a sealed acknowledgement advances
 * a chain, and a refused write never does.
 */
async function acknowledging(
  device: PairedDevice,
  acknowledges: number | null
): Promise<{ device: PairedDevice; advanced: boolean }> {
  if (acknowledges === null || acknowledges !== device.deposit.index) {
    return { device, advanced: false };
  }
  const standing = device.deposit_standing;
  return {
    advanced: true,
    device: {
      ...device,
      deposit: await advancedLane(device.deposit),
      // The peer holds what that object carried, **as well as** whatever this
      // device has watched it hold since — a collection made between that `PUT`
      // and this acknowledgement is a sound statement about the same peer, and
      // taking one whole would discard the other. Where this device never
      // recorded what the object carried — a `PUT` whose answer was lost — the
      // lane still advances on nothing but its own view: understating what a
      // peer holds costs a re-sent row an import ignores, and a lane stuck at an
      // index its peer has left costs everything.
      peer_vector: standing
        ? mergeVersionVectors(device.peer_vector, standing.brings)
        : device.peer_vector,
      deposit_standing: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Depositing
// ---------------------------------------------------------------------------

interface DepositWork {
  ledger: WakeLedger;
  ceilingBytes: number;
  chunkBudgetBytes: number;
  draw: RandomBytes;
}

/**
 * Leaves one sealed object on the outgoing lane, at the lane's current index.
 *
 * **The rewrite is conditional and is refused rather than recreating.** If the
 * peer has collected, the etag is gone and the write fails — and the object is
 * simply not recreated, which is what removes the permanently orphaned object
 * rather than tolerating it. An orphan is a leak rather than untidiness: one
 * listing returns the whole series of keys, exact lengths and write times at any
 * later moment.
 */
async function depositLane(
  device: PairedDevice,
  store: Store,
  keep: (device: PairedDevice) => void,
  { ledger, ceilingBytes, chunkBudgetBytes, draw }: DepositWork
): Promise<{
  device: PairedDevice;
  deposited: number;
  refused: boolean;
  jammed: boolean;
}> {
  const standing = device.deposit_standing;
  // A rewrite at this index was already refused, so the object is gone. It is
  // not recreated, and nothing else is written here until an acknowledgement
  // advances the lane — which is normally not an error at all: the peer took the
  // object, and its acknowledgement is what comes next.
  //
  // **The hole this leaves is ADR-0096 §5's rather than this early return's**,
  // and it is #410. A deposit carries this device's acknowledgement as well as
  // its delta, so a lane that may not be written to is a lane that cannot
  // acknowledge — and if **both** lanes of a pairing reach this state, neither
  // can say the word the other is waiting for and both chains freeze. One failed
  // `PUT` gets there: a peer that collects and then cannot deposit leaves this
  // device rewriting into a refusal while the peer's own next rewrite is refused
  // in turn. Retrying the conditional write instead of short-circuiting here
  // changes nothing, because it is refused too; the only exits are to advance on
  // absence, which §5 refuses outright, or to give the acknowledgement an object
  // of its own, which §1 refuses. Both are the record's to decide. §11's K = 200
  // reaps it meanwhile, and no data is lost — the ledger is intact and
  // re-pairing recovers.
  if (standing?.kind === "taken") {
    return { device, deposited: 0, refused: true, jammed: false };
  }

  const lane = laneChainOf(device.deposit);
  const envelope: DepositEnvelope = {
    // Re-asserted whole in every deposit, never accumulated: the highest index
    // this device has collected, which is one behind the index it is now
    // listening at. A lane that has collected nothing acknowledges nothing.
    acknowledges: device.collect.index > 0 ? device.collect.index - 1 : null,
  };
  const head = utf8.encode(JSON.stringify(envelope));
  const delta = await outstandingDelta(device, ledger, {
    chunkBudgetBytes,
    roomBytes: ceilingBytes - DEPOSIT_GENERATION_BYTES - chunkCost(head.length),
  });

  const sealed = await sealDeposit(
    { key: await deriveLaneKey(lane, "seal") },
    device.deposit.index,
    [head, ...delta.chunks],
    draw
  );
  const etag = await store.deposit(
    await laneAddress(lane),
    sealed,
    standing?.etag ?? null
  );

  const next: PairedDevice = {
    ...device,
    deposit_standing:
      etag === null
        ? // Refused: the object is gone, and what it carried is still what an
          // acknowledgement for this index will mean.
          { kind: "taken", brings: standing?.brings ?? device.peer_vector }
        : { kind: "live", etag, brings: delta.brings },
  };
  keep(next);
  return {
    device: next,
    deposited: delta.rows,
    refused: etag === null,
    jammed: delta.jammed,
  };
}

/**
 * The rows this deposit carries: everything the peer lacks, up to the ceiling.
 *
 * **The ceiling drains rather than refuses.** A delta larger than one deposit
 * leaves its oldest chunks now; the collector takes them and acknowledges this
 * index; the next wake carries the next ceiling's worth. A backlog empties one
 * ceiling per round trip instead of jamming, which is why ADR-0075 §13 survives
 * verbatim — _a rule that refuses your own data is a rule against convergence_,
 * and this rule reorders delivery without declining any of it.
 */
async function outstandingDelta(
  device: PairedDevice,
  ledger: WakeLedger,
  {
    chunkBudgetBytes,
    roomBytes,
  }: { chunkBudgetBytes: number; roomBytes: number }
): Promise<{
  chunks: Uint8Array[];
  brings: VersionVector;
  rows: number;
  jammed: boolean;
}> {
  const chunks: Uint8Array[] = [];
  let brings = device.peer_vector;
  let rows = 0;
  let room = roomBytes;
  let after: LedgerCursor | null = null;

  for (;;) {
    const page = await ledger.oldestAbove(
      after,
      chunkBudgetBytes,
      device.peer_vector
    );
    if (page.length === 0) return { chunks, brings, rows, jammed: false };
    const body = utf8.encode(page.map(datomLine).join(""));
    if (chunkCost(body.length) > room) {
      // Out of room. Everything gathered so far goes now and the rest follows
      // the acknowledgement — unless nothing fits at all, which is a single
      // datom wider than a whole deposit and the one case draining cannot
      // reach.
      return { chunks, brings, rows, jammed: chunks.length === 0 };
    }
    room -= chunkCost(body.length);
    chunks.push(body);
    brings = vectorWith(brings, page);
    rows += page.length;
    after = cursorOf(page[page.length - 1]);
  }
}

// ---------------------------------------------------------------------------
// The lane's two derivations, and the bodies read to ADR-0075 §13's standard
// ---------------------------------------------------------------------------

/**
 * Where a lane's deposit sits, as the route's flat namespace takes it.
 *
 * Base64url of the address the ratchet yields, which is 43 characters of the
 * route's `[A-Za-z0-9_-]{1,256}` — a shape rule the server keeps because it
 * cannot tell a derived address from an invented one and must not try.
 */
const laneAddress = async (lane: LaneChain): Promise<string> =>
  base64url(await deriveLaneKey(lane, "addr"));

function readEnvelope(body: string): DepositEnvelope {
  return refusingChunk(() => {
    const raw = parseNdjsonObject(body, null);
    const acknowledges = raw.acknowledges;
    if (acknowledges === null || acknowledges === undefined) {
      return { acknowledges: null };
    }
    if (
      typeof acknowledges !== "number" ||
      !Number.isSafeInteger(acknowledges) ||
      acknowledges < 0
    ) {
      throw new Error("an acknowledgement is the index it is for.");
    }
    return { acknowledges };
  });
}
