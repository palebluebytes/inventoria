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
 * ### A collection commits on its acknowledgement
 *
 * §5's 2026-09-12 amendment moves the commit point, and the whole of this
 * module's shape follows from it. A collection is `GET`, verify, import,
 * **deposit the acknowledgement**, advance, `DELETE` — so a lane's object is
 * deleted only after the word for it is in the store, and a depositor meeting a
 * refusal knows its peer has already said it.
 *
 * That is what makes the frozen pairing unreachable. The defect it repairs was
 * not that a mute lane could not be written to but that a collector **advances
 * alone**: from that moment the depositor's only writable address is one the
 * peer has stopped reading, and the depositor may advance only on an
 * acknowledgement it can deliver nowhere else. Both lanes reach that state from
 * one failed `PUT`, and one lane reaches it from an expiry.
 *
 * **A collection that cannot acknowledge is retried whole, from the `GET`.** It
 * does not record _I took index i_ and skip the read: the depositor keeps
 * rewriting at that index until it is acknowledged, so a word sent against an
 * older take credits the peer with rows that arrived after it and those rows
 * are never sent again. What does survive a failed attempt is the imported rows
 * — the ledger is append-only and a re-import is a no-op — and the `peer_vector`
 * fold, because taking rows from a peer proves the peer holds them.
 *
 * **The depositor still advances only on receiving the acknowledgement**, so
 * between the two moments it rewrites at the old index while the collector
 * finds nothing at the new one. **A collector finding nothing is normal** — it
 * is not an error, it is not a toast, and it must not be repaired with the scan
 * window §4 boasts of not needing.
 *
 * Collecting first is also what makes the healthy path never see a refused
 * rewrite: the acknowledgement for the outstanding index arrives, the deposit
 * lane advances, and the wake's own deposit lands at a fresh index with no
 * precondition to fail.
 *
 * ### A refusal is answered by a recreate
 *
 * A refused conditional rewrite means the object is gone, and under the commit
 * point above it is gone for one of two reasons that now want the **same**
 * answer. If the peer collected it, the peer's acknowledgement is already in the
 * store; if it expired unread or somebody deleted it, the peer is still sitting
 * at that index with nothing coming. So the refusal is answered by an
 * unconditional write at the same index, which may **not** advance the lane —
 * only a sealed acknowledgement does that — and may **not** advance what that
 * index will be taken to have brought.
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
 * A deposit carries **a delta, an acknowledgement and a device roster, any of
 * which may be empty**, and that list is closed: §6 admits the roster and
 * refuses the chain index and push material by name, so a fourth passenger
 * costs an ADR amendment rather than an edit to
 * {@link DepositEnvelope}. The peer's own vector crosses exactly once, at the
 * first sync's closing exchange; from then on each side keeps its view of the
 * other current from what it has **observed** — rows it collected, which the
 * peer necessarily held to send, and rows of its own the peer acknowledged
 * collecting. Re-asserting a vector would state which *third* devices this
 * ledger has heard from, and the roster is exactly the narrower thing §6 admits
 * in its place: which third devices this one is **paired** with, said about
 * itself, rather than which ones its ledger has heard of. See `vectorWith` for
 * why the inexact direction is the safe one.
 *
 * ### A deposit follows the data, and it is not a second collection
 *
 * §3's 2026-09-06 Amendment unwelds the wake from the sync, so this module has
 * two entry points rather than one. {@link convergeWithPeer} is the whole
 * round — collect, deposit, settle — and {@link depositToPeer} is the deposit
 * alone, for the trigger that fires whenever the delta grows.
 *
 * **What makes the second one affordable is that the index advances on
 * collection.** Every rewrite made before the peer takes one lands on the
 * **same address**, so three meals logged in one open are three writes to one
 * key: it merges no components of the address chain and spends nothing of §4.
 * A deposit-only sync therefore touches one address on one lane and reads
 * nothing, which is why it is not a collection with the `GET` left out.
 *
 * The word it says is the same word: **the highest index this device has
 * taken**, re-asserted exactly as a wake's own deposit re-asserts it.
 *
 * ### What this module is not
 *
 * It is one pairing. When those two entry points run — the debounce, the
 * hourly collection floor, the flush on hide — is `wake-cadence.ts`'s, and the
 * fan-out at three or more devices is #401's.
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
import {
  DEPOSIT_CEILING_BYTES,
  StoreUnreachableError,
  type Store,
} from "./deposit-store";
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
 * What a deposit says beside its datoms, and **the list is closed** (§3, §6).
 *
 * > **A deposit carries datoms, and beside them only what a device states about
 * > _itself_: the least that answers a question its peer cannot otherwise
 * > answer, re-asserted whole in every deposit, never a statement about a third
 * > device and never an instruction to any device.**
 *
 * Two fields, and **a third costs an ADR amendment** rather than a judgement
 * call (§6): a closed list with a dead member is a door left ajar with a sign
 * on it. The chain index and push subscription material are both refused by
 * name, because they are about this device and answer nothing.
 */
export interface DepositEnvelope {
  /**
   * The highest index this device has taken from its peer.
   *
   * It is an index rather than a flag, because a bare flag would be an advance
   * signal an operator could trigger by replaying bytes it holds, and under a
   * ratchet with old state dropped an advance past an uncollected index is
   * permanent, unrecoverable desynchronisation rather than a lost delta. `null`
   * is a device that has collected nothing yet.
   */
  acknowledges: number | null;
  /**
   * The other `device_id`s this device is paired with (§6).
   *
   * **The ledger cannot answer this and that is why it crosses.** `datoms`
   * carries `device_id` in its primary key, so `SELECT DISTINCT device_id`
   * looks like a free roster — but that set only ever grows, and an
   * append-only ledger names a phone sold two years ago forever. Only a device
   * can say it is **still** paired.
   *
   * Four rules ride with it, and they matter more than the content:
   *
   * - **One hop.** A device states its own pairings and never relays a peer's,
   *   which is what stops the roster becoming an authority: nobody holds a view
   *   they did not each separately receive.
   * - **Every deposit, superseding.** Once-at-pairing fails *silently* as
   *   pairings change, and a design whose failure mode is silence is the one
   *   nobody catches.
   * - **Never merged.** Two devices' rosters disagreeing is legitimate under
   *   pairwise pairing, so there is nothing to reconcile.
   * - **No typed names.** An id resolves to a name locally exactly where a name
   *   is wanted; nothing about a name crosses.
   *
   * **The peer of this very lane is not in it**, because it already knows: the
   * rule is the *least* that answers a question its peer cannot otherwise
   * answer, and that is what refuses the chain index one row above. An empty
   * list is therefore a household of two, and it is a statement rather than a
   * silence. **This is a narrowing of §6's table row**, which names the member
   * as _the set of `device_id`s it is paired with_ without qualifying it; it
   * follows §6's own necessity clause rather than its enumeration, and it is
   * written into `CONTEXT.md`'s **Device roster** so the glossary does not say
   * one thing while the wire says another.
   *
   * **`null` is a deposit that stated nothing**, which only a build predating
   * #398 can leave: every deposit this version writes carries the list. It is
   * kept apart from the empty list all the way to the screen, because
   * *nothing stated* and *nobody else* are different news and collapsing them
   * puts a claim in a peer's mouth that it never made.
   */
  roster: string[] | null;
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
  /**
   * Every `device_id` this device is paired with, **this lane's peer
   * included** — {@link DepositEnvelope.roster} is what trims it.
   *
   * It is required rather than defaulted, because the honest default is
   * unreachable from here: this module holds one pairing and the roster is a
   * fact about the whole list. A default of `[]` would state _paired with
   * nobody else_ on every lane the day a caller forgot it, and that is a wrong
   * sentence rather than a missing one.
   *
   * **It is handed over unfiltered.** A pairing whose peer has stopped
   * collecting is still a pairing, and §11's counter running out is exactly
   * when its peer most wants to see it named: the roster is the hunt list for a
   * revocation that stranded mail at a lane nobody reads (§10).
   */
  roster: readonly string[];
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
  /**
   * Whether this wake's collection **settled**: took rows, deposited the
   * acknowledgement for them, advanced the collect lane and deleted the object.
   *
   * A take that did not settle moved real rows and made no progress, and the
   * next wake will repeat it identically — so it is what §11's counter must not
   * read as productive, or a pairing getting nowhere never reaches K.
   */
  settled: boolean;
  /**
   * Whether a rewrite was refused and answered by an unconditional write at the
   * same index. The object was gone: collected, expired, or deleted.
   */
  recreated: boolean;
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

/** What one deposit inside an open did. A deposit reads nothing, so it
 * reports nothing about the peer: it cannot collect, and it cannot be
 * acknowledged until the peer's own object is read on a later collection. */
export interface DepositOutcome {
  /** Rows this deposit carries. */
  deposited: number;
  /** Whether a refused rewrite was answered by a recreate. See {@link WakeOutcome}. */
  recreated: boolean;
  /** Whether a datom is wider than a whole deposit. See {@link WakeOutcome}. */
  jammed: boolean;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/**
 * The highest index this device has taken, which is what every deposit
 * acknowledges.
 *
 * The collect lane sits at the index it will take **next**, because it advances
 * on a settled collection — so the index behind it is the last one taken, and a
 * lane that has taken nothing acknowledges nothing.
 */
const highestTaken = (device: PairedDevice): number | null =>
  device.collect.index > 0 ? device.collect.index - 1 : null;

/**
 * One sync's options with the three bounds filled in.
 *
 * Here rather than in each entry point's parameter list, because there are two
 * of them now and a default that drifts between a collection and a deposit
 * would size one object against a ceiling the other does not use.
 */
const asked = ({
  keep,
  roster,
  ceilingBytes = DEPOSIT_CEILING_BYTES,
  chunkBudgetBytes = DEPOSIT_CHUNK_BUDGET_BYTES,
  draw = randomBytes,
}: WakeOptions): Required<WakeOptions> => ({
  keep,
  roster,
  ceilingBytes,
  chunkBudgetBytes,
  draw,
});

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
  options: WakeOptions
): Promise<WakeOutcome> {
  const { keep, ...bounds } = asked(options);
  const taken = await takeFromPeer(paired, store, ledger, keep);
  const left = await depositLane(taken.device, store, keep, {
    ledger,
    ...bounds,
    acknowledges: taken.acknowledges,
  });

  // The collection settles here and nowhere earlier: the acknowledgement it
  // owes is in the store, so the lane may advance and the object may go.
  //
  // **The recreate above cannot strand this word at a dead address.** A refusal
  // with a take pending means the object vanished *uncollected* — had the peer
  // taken it, the peer would have deposited its acknowledgement before deleting
  // it, and this wake collects before it deposits, so that word would have
  // advanced this lane past the index that was refused. What is left is an
  // expiry or a delete, after which the peer is still reading the index the
  // recreate just refilled.
  let device = left.device;
  let settled = false;
  if (taken.pending !== null) {
    device = { ...device, collect: await advancedLane(device.collect) };
    keep(device);
    await store.discard(taken.pending);
    settled = true;
  }

  return {
    collected: taken.collected,
    acknowledged: taken.acknowledged,
    settled,
    deposited: left.deposited,
    recreated: left.recreated,
    jammed: left.jammed,
  };
}

/**
 * Leaves one deposit without collecting, for the trigger that is the delta
 * growing (§3's 2026-09-06 Amendment, as extended on 2026-09-12).
 *
 * **It touches one address and it is the address the last one touched**, until
 * the peer collects. That is the whole of why depositing on every change is
 * free rather than a cadence with a price: the index advances on collection, so
 * the rewrites between two collections are rewrites of one object.
 *
 * It re-asserts {@link highestTaken}, which is what a wake with nothing to
 * collect also says. Nothing here can settle a collection — only
 * {@link convergeWithPeer} takes one — so a peer owed an acknowledgement is
 * still owed it afterwards, which is why the collection floor does not skip
 * while a debt is outstanding.
 */
export async function depositToPeer(
  paired: PairedDevice,
  store: Store,
  ledger: WakeLedger,
  options: WakeOptions
): Promise<DepositOutcome> {
  const { keep, ...bounds } = asked(options);
  const { deposited, recreated, jammed } = await depositLane(
    paired,
    store,
    keep,
    { ledger, ...bounds, acknowledges: highestTaken(paired) }
  );
  return { deposited, recreated, jammed };
}

// ---------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------

/** What the take handed the deposit, and what the deposit hands back to it. */
interface TakenFromPeer {
  device: PairedDevice;
  collected: number;
  acknowledged: boolean;
  /**
   * The address holding the object this wake took, or `null` when it took
   * none. It is deleted once the acknowledgement for it is deposited, and not
   * before — which is the whole of §5's 2026-09-12 commit point.
   */
  pending: string | null;
  /**
   * The index this deposit must acknowledge: **the highest index this device
   * has taken**. With a take pending that is the collect lane's current index,
   * because the advance has not happened yet; with none it is the index behind
   * it, re-asserted exactly as §6 re-asserts the roster.
   */
  acknowledges: number | null;
}

/**
 * Takes the peer's deposit, if there is one: `GET`, verify, import, and apply
 * the acknowledgement it carries.
 *
 * **It neither advances the collect lane nor deletes anything.** Both wait on
 * the deposit that carries the acknowledgement for what was taken, back in
 * {@link convergeWithPeer} — so a take whose acknowledgement does not land is
 * retried whole from the `GET` on a later wake, re-importing rows the ledger
 * ignores and re-reading an object the peer may have made fuller meanwhile.
 *
 * The record is written back here all the same. Nothing downstream depends on
 * it being unwritten, and an acknowledgement applied but forgotten is a lane
 * that stays at an index its peer has left.
 */
async function takeFromPeer(
  device: PairedDevice,
  store: Store,
  ledger: WakeLedger,
  keep: (device: PairedDevice) => void
): Promise<TakenFromPeer> {
  const lane = laneChainOf(device.collect);
  const address = await laneAddress(lane);
  const held = await store.collect(address);
  const behind = highestTaken(device);
  // The normal outcome, said plainly: the peer has not deposited since this
  // device last collected, or has not woken at all.
  if (!held) {
    return {
      device,
      collected: 0,
      acknowledged: false,
      pending: null,
      acknowledges: behind,
    };
  }

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

  // Superseded rather than merged, and never relayed onward: what is kept is
  // exactly what this peer said about **itself** (§6).
  const next: PairedDevice = {
    ...acknowledged.device,
    peer_vector,
    peer_roster: envelope.roster,
  };
  keep(next);
  return {
    device: next,
    collected,
    acknowledged: acknowledged.advanced,
    pending: address,
    acknowledges: device.collect.index,
  };
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
  roster: readonly string[];
  /** The index this deposit acknowledges, from {@link takeFromPeer}. */
  acknowledges: number | null;
}

/**
 * Leaves one sealed object on the outgoing lane, at the lane's current index.
 *
 * **The rewrite is conditional, and a refusal is answered by an unconditional
 * write at the same index** (§5's 2026-09-12 amendment). A refusal means the
 * object is gone, and under the commit point {@link takeFromPeer} implements
 * both reasons it can be gone want the same answer: if the peer took it, the
 * peer's acknowledgement is already in the store and this lane advances the
 * moment it is read; if it expired unread or somebody deleted it, the peer is
 * still at this index and the recreate is what it is waiting for.
 *
 * **The recreate may advance neither the index nor `brings`.** Only a sealed
 * acknowledgement advances an index. And `brings` is what an acknowledgement
 * for this index will *mean*, so crediting the peer with a fuller rewrite than
 * the one it actually took would skip the rows only that rewrite carried,
 * permanently — where understating costs a re-sent row an import ignores.
 *
 * **The orphan §5 refuses is narrowed rather than tolerated.** A recreate
 * answering a refusal the peer's own collection caused is one, and it is rare
 * (this wake collects first, so that acknowledgement has normally been read
 * already) and bounded (§1's backstop reaps it).
 */
async function depositLane(
  device: PairedDevice,
  store: Store,
  keep: (device: PairedDevice) => void,
  {
    ledger,
    ceilingBytes,
    chunkBudgetBytes,
    draw,
    roster,
    acknowledges,
  }: DepositWork
): Promise<{
  device: PairedDevice;
  deposited: number;
  recreated: boolean;
  jammed: boolean;
}> {
  const standing = device.deposit_standing;
  const lane = laneChainOf(device.deposit);
  // Both re-asserted whole in every deposit and never accumulated: the highest
  // index this device has taken, and what this device is paired with. A lane
  // that has taken nothing acknowledges nothing.
  const envelope: DepositEnvelope = {
    acknowledges,
    roster: statedRoster(roster, device.device_id),
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
  const address = await laneAddress(lane);
  const conditional = await store.deposit(
    address,
    sealed,
    standing?.etag ?? null
  );
  const recreated = conditional === null;
  // Unconditional, so it has no precondition left to refuse. A store that
  // refuses it anyway is one this protocol cannot use, and it says so rather
  // than writing an etag-less standing the next rewrite cannot match on.
  const etag = recreated
    ? await store.deposit(address, sealed, null)
    : conditional;
  if (etag === null) {
    throw new StoreUnreachableError("an unconditional deposit was refused.");
  }

  const next: PairedDevice = {
    ...device,
    deposit_standing: {
      etag,
      // The recreate carries this wake's delta, which may be fuller than the
      // object the peer took. What an acknowledgement for this index means is
      // still the older, smaller claim.
      brings: recreated
        ? (standing?.brings ?? device.peer_vector)
        : delta.brings,
    },
  };
  keep(next);
  return {
    device: next,
    deposited: delta.rows,
    recreated,
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

/**
 * What this device says it is paired with, down this one lane.
 *
 * **The peer of the lane is trimmed and nothing else is.** It knows already,
 * and §6's rule is the *least* that answers a question its peer cannot
 * otherwise answer — the same clause that refuses the chain index. Nothing
 * about a pairing's health is looked at: a pairing frozen at §11's counter is
 * still a pairing, and naming it is the point.
 *
 * **It is what keeps the far end's sentence honest, as well.** A collector
 * resolves every stated id against the devices it is paired with, and the one
 * id it could never resolve that way is its own — so an untrimmed roster would
 * have the screen call the reader _a device you are not paired with_. The trim
 * is why that id cannot arrive, rather than a filter the surface has to
 * remember.
 */
const statedRoster = (roster: readonly string[], peer: string): string[] =>
  roster.filter((device_id) => device_id !== peer);

function readEnvelope(body: string): DepositEnvelope {
  return refusingChunk(() => {
    const raw = parseNdjsonObject(body, null);
    return {
      acknowledges: readAcknowledgement(raw.acknowledges),
      roster: readRoster(raw.roster),
    };
  });
}

function readAcknowledgement(acknowledges: unknown): number | null {
  if (acknowledges === null || acknowledges === undefined) return null;
  if (
    typeof acknowledges !== "number" ||
    !Number.isSafeInteger(acknowledges) ||
    acknowledges < 0
  ) {
    throw new Error("an acknowledgement is the index it is for.");
  }
  return acknowledges;
}

/**
 * The roster the peer stated, read to the same standard as everything else off
 * a wire (`datom-chunk.ts`): **a seal that held and a field that is malformed
 * is a bug, and a bug is refused anyway**.
 *
 * **Absent reads as `null` and not as empty.** A build predating #398 states no
 * roster at all, and the empty list is the positive claim _I am paired with
 * nobody but you_ — reading the first as the second puts words in that peer's
 * mouth, and the screen would repeat them.
 */
function readRoster(roster: unknown): string[] | null {
  if (roster === null || roster === undefined) return null;
  if (
    !Array.isArray(roster) ||
    !roster.every((device_id) => typeof device_id === "string" && device_id)
  ) {
    throw new Error("a roster is the device ids its depositor is paired with.");
  }
  return roster;
}
