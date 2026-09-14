import { writable } from "svelte/store";
import { readVersionVector, type VersionVector } from "../db/version-vector";
import { readLaneScope, WHOLE_JAR, type LaneScope } from "../p2p/lane-scope";
import { writeDate } from "../p2p/send-date";
import {
  CHAIN_STATE_BYTES,
  ratchetLane,
  type LaneChain,
  type LaneDirection,
  type PairedChains,
} from "../p2p/pairing-chain";

/**
 * The Paired Device list: `localStorage`, never a datom (ADR-0075 §3 as
 * replaced by ADR-0096 §9).
 *
 * > **A Paired Device record holds derived, per-lane chain state and never a
 * > reusable credential. Nothing in it can regenerate the pairing, only advance
 * > it.**
 *
 * A rule rather than a list of fields, and it is a **strengthening**: ADR-0075
 * §3's record held the 256-bit pairing secret, which regenerates both `state₀`s
 * and with them every deposit address and every seal key from pairing onward.
 * The secret does not survive its own pairing (ADR-0096 §4), so what is here is
 * one ratchet step past it and a stolen record opens at most one outstanding
 * object per lane and nothing behind it.
 *
 * ### Why it is here and not in the ledger
 *
 * Two arguments, and ADR-0096 §9 leaves both untouched:
 *
 * - Secrets never live in the append-only ledger, because it is undeletable
 *   **and it syncs**. Putting derived pairing material inside the thing it
 *   unlocks is circular.
 * - **A revocation cannot live in an append-only log that the revoked device
 *   also writes to.** If these were datoms, unpairing on one device would be
 *   *undone by the next sync from the other*: the deletion is not a fact the
 *   ledger can represent, and the pairing datom would simply come back.
 *
 * ADR-0085 §1 is **not** what puts it here — that record governs settings, and
 * chain state is no more a setting than the pairing secret was. It is derived
 * material, it lives where the seed lived, and it inherits the seed's rules:
 * never a datom, and never in an ADR-0064 export, which is structural because
 * an export is a walk of `datoms`.
 *
 * ### Guard 1 is what decides when a row appears
 *
 * > **A pairing is not complete until its first sync completes. An incomplete
 * > pairing deposits nothing and collects nothing.**
 *
 * So {@link rememberPairedDevice} is called on completion and nowhere else, and
 * an abandoned attempt leaves nothing to clean up. **Pairing is keyed by
 * `device_id`, and pairing again replaces** — losslessly, which is the repair
 * path for the one side that can commit alone when the last frame is lost
 * (ADR-0096 §8). "Pair a device" must therefore work with no row present, and
 * "Pair again" promises nothing, because `device_id` is not learned until the
 * act is spent.
 *
 * **What "losslessly" rests on, stated rather than assumed.** Replacing resets
 * both indices to zero and overwrites the peer's vector, and that loses nothing
 * only because the pairing being replaced is a *fresh* one: the act mints a new
 * secret and a new `state₀`, so the lanes it replaces address nothing any more.
 * #396 is what makes an index worth something, and the two-phase unpair takes
 * the old lanes' outstanding objects **before** this overwrites the indices and
 * the etag that reach them — `unpair.ts` holds that ordering, and the pairing
 * act settles a pending revocation before it reaches this function.
 */

/** One lane's ratchet, at the index it has reached. */
export interface StoredLane {
  direction: LaneDirection;
  /**
   * {@link CHAIN_STATE_BYTES} of state as base64. Never an address and never a
   * key: both are derived from it, under separate labels, at use.
   */
  state: string;
  /**
   * How far along the ratchet this lane is. **It advances on collections,
   * never on the clock** (ADR-0096 §4), so a first sync leaves it at zero and
   * #396 is what moves it.
   */
  index: number;
}

/**
 * What this device's own `PUT` last left on its deposit lane, at the lane's
 * current index (ADR-0096 §5).
 *
 * Two states, and the absent one is the second: `null` is **nothing written at
 * this index yet**, so the next deposit goes out unconditionally — the first
 * write at a fresh chain index has no etag to match on.
 *
 * The rewrite carries `If-Match` against the etag that `PUT` returned, and a
 * refusal means the object is gone — collected, expired, or deleted by
 * somebody. **The refusal is answered by an unconditional write at the same
 * index** (ADR-0096 §5's 2026-09-12 amendment), so there is no second arm here
 * for a lane that has fallen silent: a lane holds a live object or none.
 *
 * **`brings` may not advance on that recreate**, which is why it is carried
 * rather than recomputed. It is what an acknowledgement for this index will
 * *mean*: the peer collected the object that was here, so it holds everything
 * this device knew it held **plus** what that object carried. If the peer took
 * an earlier rewrite and the recreate is a fuller one, crediting the fuller
 * one would skip the rows only it carried, permanently.
 */
export interface DepositStanding {
  etag: string;
  brings: VersionVector;
}

export interface PairedDevice {
  /** The peer's own id, and the key: pairing again replaces this row. */
  device_id: string;
  /**
   * A name typed **locally, about the peer, after the act**, and never sent
   * (ADR-0096 §6 and §9). A row reads by short `device_id` until it is named.
   */
  name: string | null;
  /** The lane this device deposits into. */
  deposit: StoredLane;
  /** The lane this device collects from. */
  collect: StoredLane;
  /**
   * The Tracked Domains this pairing carries, agreed by intersection at the
   * act (ADR-0105 §1 and §3).
   *
   * **It is a fact about rows and never about the peer** (§2). Nothing here is
   * the far device's install roster: a food lane says *this pairing carries
   * food*, which is as true of a Rations phone paired with a root laptop as of
   * two Rations phones, and neither end learns which.
   *
   * **One pairing per device pair, so pairing again re-scopes it** (§4). Both
   * directions are sound under the vector's second axis: widening leaves the
   * new domains' marks absent for that peer, which is the empty-vector case and
   * therefore a first sync of those domains, and narrowing leaves the dropped
   * domains' marks standing, correctly — the lane no longer carries them and
   * nothing advances them.
   *
   * **Absent reads as the whole Jar**, because a record written before this
   * field predates the pairing surface leaving the root, and the root's lane
   * was jar-wide. {@link filled} is what turns the absence into the field.
   */
  scope: LaneScope;
  /**
   * What the peer said it held when the first sync closed.
   *
   * This is the whole point of ADR-0096 §8's **closing vector exchange**:
   * without it both sides would finish holding the peer's *pre-sync* state, and
   * the first deposit would re-send everything the first sync had just
   * delivered. It is superseded by each later exchange, never merged.
   */
  peer_vector: VersionVector;
  /**
   * The one live object on the deposit lane, as this device's own `PUT` left
   * it. `null` before the first deposit at an index, and again the moment an
   * acknowledgement advances the lane past it.
   */
  deposit_standing: DepositStanding | null;
  /**
   * The `device_id`s the peer last said **it** is paired with, beside this
   * device (ADR-0096 §6).
   *
   * **It is never merged with the local roster and never relayed onward.** Two
   * devices' rosters disagreeing is legitimate under pairwise pairing, so there
   * is nothing to reconcile, and a merge would invent the authority ADR-0075 §4
   * declined. Each deposit re-asserts it whole, so this field is **replaced**
   * and never accumulated.
   *
   * **`null` is a peer that has stated nothing yet**, which a first sync leaves
   * because a first sync crosses no deposit. An empty list is the different,
   * louder statement that the peer is paired with nobody but this device — the
   * two must not collapse, or a fresh pairing would read as a peer that had
   * unpaired from everything else.
   *
   * The ledger cannot stand in for it: `datoms` carries `device_id` in its
   * primary key, but that set only ever grows, so it names a phone sold two
   * years ago forever. Only a device can say it is **still** paired.
   */
  peer_roster: string[] | null;
  /**
   * How many consecutive **wakes** this pairing has produced nothing in
   * (ADR-0096 §11). At K = 200 the pairing stops; `wake-counter.ts` holds K
   * and the rule that reads it.
   *
   * It is in wakes and never in syncs, which is why nothing here moves it: a
   * session that polls eight times against an absent peer is one unproductive
   * wake, and `wake-counter.ts` is the one thing that folds a whole wake into
   * this number.
   */
  unproductive_wakes: number;
  /**
   * The day this pairing last produced something, coarsened to the calendar
   * date it happened on (ADR-0096 §9 and §11).
   *
   * **The coarsening is what is stored, not how it is drawn.** The record holds
   * `YYYY-MM-DD` and no hour, no minute and no zone, so a stolen jar says which
   * day two devices met and cannot say when in it. {@link metOn} is the only
   * thing that writes one and {@link readMet} the only thing that reads one
   * back.
   *
   * **`null` is a record written before this version**, which is a healthy
   * record and says nothing at all: an absent date is not a claim that the
   * devices have never met. A first sync is a meeting, so a pairing made by
   * this version always has one.
   */
  last_met: string | null;
  /**
   * Phase 1 of the two-phase unpair: **the user has severed this pairing and
   * the withdrawal has not landed yet** (ADR-0096 §11).
   *
   * The mark is the half that was always local, immediate and unforgeable, so
   * it is what stops the lanes rather than the row's removal: from here this
   * device deposits nothing, collects nothing, and states the pairing to
   * nobody. Everything else on the row is **kept** — both lanes, both indices
   * and the deposit's standing — because those are the only things that reach
   * the two objects the withdrawal has to take, and discarding them first is
   * exactly what would make it best-effort.
   *
   * So a marked row is a **pending revocation**, retryable on any later open,
   * and {@link forgetPairedDevice} is reached only once the deletes have
   * landed. `unpair.ts` is the whole of that ordering.
   */
  revoked: boolean;
}

/**
 * One `localStorage` record holding the whole list.
 *
 * The list is the unit rather than one key per device: every read wants all of
 * them (a wake serves every pairing, one key each), replacing by `device_id` is
 * a rewrite of the same record either way, and the jar-wide wipe that unpairs
 * has one key to take rather than an enumeration to get right.
 */
const LS_KEY = "inventoria_paired_devices";

// `localStorage` is absent under the Node unit runner and can throw in a
// privacy-locked browser, so every access is guarded the way `secrets.ts`
// guards its own: a missing store reads as no pairings and a refused write
// simply does not persist.
function jar(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * An instant as {@link PairedDevice.last_met} keeps it: the calendar day it
 * fell on, and nothing finer.
 *
 * **The calendar is the local one**, read off the date's own parts rather than
 * through `toISOString`, for `send-date.ts`'s reason: a wake at half past
 * eleven at night is not tomorrow's.
 */
export const metOn = (at: Date): string => writeDate(at, "YYYY-MM-DD");

/**
 * A kept day back as a date, for the one surface that writes it out.
 *
 * It builds a **local** midnight rather than letting `new Date(string)` parse
 * it, which would read `YYYY-MM-DD` as UTC and draw the day before in every
 * zone behind it.
 *
 * **It lives beside {@link metOn} rather than beside `writeDate`**, because the
 * two of them and `isMetDay` are the three sides of one field's invariant: what
 * the record keeps, what it will accept back, and how coarse it is. Splitting
 * the reader out would put half of that in a module that knows nothing about
 * this field.
 */
export function readMet(last_met: string): Date {
  const [year, month, day] = last_met.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const unb64 = (text: string) =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

/**
 * A lane as it is kept, at the index a first sync leaves it: zero.
 *
 * It takes no index, because **the index advances on collections** (ADR-0096
 * §4) and a pairing act has collected nothing. {@link advancedLane} is how a
 * lane moves afterwards; nothing re-derives one from an act, so an index
 * parameter here would be a hook for a caller that does not exist.
 */
const storedLane = (lane: LaneChain): StoredLane => ({
  direction: lane.direction,
  state: b64(lane.state),
  index: 0,
});

/**
 * The lane at its next index, with the state it stepped from dropped.
 *
 * **Dropping the old state is what forward secrecy is** (ADR-0096 §4), and it
 * is a property of what a device *stores* rather than of what `ratchetLane`
 * did with an array — so it is this function, the one that writes the record,
 * that has to be the only way a lane moves. There is no window to keep an old
 * state for: both sides advance on the same acknowledged collection, so the
 * scan window every event-indexed chain in the literature ships is zero here.
 */
export async function advancedLane(lane: StoredLane): Promise<StoredLane> {
  const stepped = await ratchetLane(laneChainOf(lane));
  return {
    direction: stepped.direction,
    state: b64(stepped.state),
    index: lane.index + 1,
  };
}

/** A stored lane back as the chain it is, for deriving an address or a key. */
export function laneChainOf(lane: StoredLane): LaneChain {
  return { direction: lane.direction, state: unb64(lane.state) };
}

/**
 * A row as this version uses it, with the one field an earlier one did not
 * write filled in. The guard above admits its absence; this is where the
 * absence stops being a hole every reader has to remember.
 */
const filled = (device: PairedDevice): PairedDevice => ({
  ...device,
  scope: device.scope ?? WHOLE_JAR,
  deposit_standing: device.deposit_standing ?? null,
  peer_roster: device.peer_roster ?? null,
  unproductive_wakes: device.unproductive_wakes ?? 0,
  last_met: device.last_met ?? null,
  revoked: device.revoked ?? false,
});

/**
 * Every pairing this device holds.
 *
 * A record that will not parse reads as **no pairings** rather than throwing,
 * and a row that is not a pairing is dropped rather than carried. This jar is a
 * boundary like any other — a devtools console reaches it, and so does a
 * version of this app that wrote a different shape — and the guard is here,
 * once, so that everything above can trust the type.
 *
 * It is deliberately the gentler failure. A Settings screen that cannot render
 * is a worse way to learn about a broken record than a list saying nothing is
 * paired beside a "Pair a device" that still works, and re-pairing is the
 * repair either way.
 */
export function readPairedDevices(): PairedDevice[] {
  const held = jar()?.getItem(LS_KEY);
  if (!held) return [];
  try {
    const parsed: unknown = JSON.parse(held);
    return Array.isArray(parsed)
      ? parsed.filter(isPairedDevice).map(filled)
      : [];
  } catch {
    return [];
  }
}

/**
 * One row, checked to the standard the two things it holds will be used at.
 *
 * **The vector is checked with the ledger's own reader**, not with a shape
 * test: `readVersionVector` is what every vector off a wire goes through, and a
 * row that passed a looser test here would bind `undefined` into
 * `vectorAboveMatch`'s `WHERE` the first time a deposit sized itself against
 * it. The same argument makes the lane state decode here rather than at
 * `laneChainOf`, which is reached far from this boundary and by code that has
 * been told the type is good.
 */
function isPairedDevice(row: unknown): row is PairedDevice {
  if (row === null || typeof row !== "object") return false;
  if (
    !(
      "device_id" in row &&
      typeof row.device_id === "string" &&
      row.device_id.length > 0 &&
      "name" in row &&
      (row.name === null || typeof row.name === "string") &&
      "deposit" in row &&
      isStoredLane(row.deposit) &&
      "collect" in row &&
      isStoredLane(row.collect) &&
      "peer_vector" in row &&
      isDepositStanding(
        "deposit_standing" in row ? row.deposit_standing : null
      ) &&
      isPeerRoster("peer_roster" in row ? row.peer_roster : null) &&
      isWakeCount(
        "unproductive_wakes" in row ? row.unproductive_wakes : undefined
      ) &&
      isMetDay("last_met" in row ? row.last_met : null) &&
      isRevokedMark("revoked" in row ? row.revoked : undefined)
    )
  ) {
    return false;
  }
  try {
    readVersionVector(row.peer_vector);
    // Checked with the wire's own reader for `isPairedDevice`'s argument: a
    // scope that passed a looser test here would narrow — or fail to narrow —
    // every page this pairing reads afterwards. Absence is admitted and is what
    // {@link filled} turns into the whole Jar.
    readLaneScope("scope" in row ? row.scope : undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * The deposit's standing, checked to the standard the two things it holds will
 * be used at, which is `isPairedDevice`'s own argument one field along.
 *
 * **Absent reads as `null`**, because a record written before there was
 * anything to deposit is a healthy record: the lane is at index zero with
 * nothing written at it, which is exactly what `null` says. {@link filled} is
 * what turns the absence into the field.
 */
function isDepositStanding(
  standing: unknown
): standing is DepositStanding | null {
  if (standing === null || standing === undefined) return true;
  if (typeof standing !== "object") return false;
  if (!("brings" in standing)) return false;
  try {
    readVersionVector(standing.brings);
  } catch {
    return false;
  }
  return (
    "etag" in standing &&
    typeof standing.etag === "string" &&
    standing.etag.length > 0
  );
}

/**
 * The peer's last-stated roster, checked to the standard it is used at: a list
 * of ids, each of which a row is looked up by.
 *
 * **Absent reads as `null`**, because a record written before a deposit ever
 * crossed is a healthy record — the peer has simply not spoken yet — and
 * {@link filled} is what turns that absence into the field.
 */
function isPeerRoster(roster: unknown): roster is string[] | null {
  if (roster === null || roster === undefined) return true;
  return (
    Array.isArray(roster) &&
    roster.every((id) => typeof id === "string" && id.length > 0)
  );
}

/**
 * §11's counter, checked to the standard it is used at: a whole number of
 * wakes that only ever goes up by one or back to zero.
 *
 * **Absent reads as none burned**, because a record written before there was a
 * counter is a pairing that has not been measured rather than one that has run
 * out — and reading it as anything else would stop a healthy pairing on the
 * first wake after an upgrade. {@link filled} is what turns the absence into
 * the field.
 */
function isWakeCount(wakes: unknown): wakes is number {
  if (wakes === undefined || wakes === null) return true;
  return typeof wakes === "number" && Number.isSafeInteger(wakes) && wakes >= 0;
}

/**
 * The last-met day, checked to the standard {@link readMet} reads it at: the
 * `YYYY-MM-DD` {@link metOn} writes, and nothing else.
 *
 * **Absent reads as `null`** — a record written before the date existed has
 * not forgotten when the devices met, it never kept it, and the section draws
 * nothing rather than a claim.
 */
function isMetDay(last_met: unknown): last_met is string | null {
  if (last_met === null || last_met === undefined) return true;
  return typeof last_met === "string" && /^\d{4}-\d{2}-\d{2}$/.test(last_met);
}

/**
 * The revocation mark, checked to the standard the wake reads it at: a pairing
 * is either severed or it is not.
 *
 * **Absent reads as not revoked**, which is the only reading available: a
 * record written before the mark existed is a live pairing, and reading it as
 * revoked would silently stop every pairing on the jar at the upgrade.
 * {@link filled} is what turns the absence into the field.
 *
 * `undefined` is that absence and is the whole of what is admitted. Unlike
 * {@link isMetDay}, `null` is not a value this field ever holds: a pairing is
 * severed or it is not, and there is no third thing for a `null` to mean.
 */
function isRevokedMark(revoked: unknown): revoked is boolean {
  return revoked === undefined || typeof revoked === "boolean";
}

function isStoredLane(lane: unknown): lane is StoredLane {
  if (lane === null || typeof lane !== "object") return false;
  if (
    !(
      "direction" in lane &&
      (lane.direction === "a2b" || lane.direction === "b2a") &&
      "state" in lane &&
      typeof lane.state === "string" &&
      "index" in lane &&
      typeof lane.index === "number" &&
      Number.isSafeInteger(lane.index) &&
      lane.index >= 0
    )
  ) {
    return false;
  }
  try {
    return unb64(lane.state).length === CHAIN_STATE_BYTES;
  } catch {
    return false;
  }
}

/** The live list, for a Settings section that redraws when one is added. */
export const pairedDevices = writable<PairedDevice[]>(readPairedDevices());

/**
 * Writes the list, and then publishes **what the jar actually holds** rather
 * than what was handed in.
 *
 * The two differ only where the store refused — a full jar, or site data
 * blocked outright — and there the difference is the whole point: a section
 * showing a pairing that a reload will not find would be reporting success for
 * a write that did not happen. Re-pairing is the repair, and it is only offered
 * if the screen says nothing is paired.
 */
function keep(devices: PairedDevice[]): void {
  try {
    jar()?.setItem(LS_KEY, JSON.stringify(devices));
  } catch {
    /* privacy-locked / quota-exceeded — the pairing just does not persist */
  }
  pairedDevices.set(readPairedDevices());
}

/** What a completed first sync hands over, and the whole of what is kept. */
export interface CompletedPairing {
  device_id: string;
  chains: PairedChains;
  peer_vector: VersionVector;
  /** What the act's two Facets agreed this lane carries (ADR-0105 §3). */
  scope: LaneScope;
}

/**
 * Writes one pairing down, replacing any row for the same device.
 *
 * **Called on completion and nowhere else.** Both halves of guard 1 rest on
 * that: it is what bounds what the store can accumulate, and it is what makes a
 * fresh pairing cost a live session rather than a whole-ledger upload.
 *
 * **A pending revocation is settled before this runs.** Replacing a row
 * overwrites both indices and the etag, which are the only things reaching a
 * pending withdrawal's two objects (ADR-0096 §11) — so the pairing act calls
 * `withdrawRevoked` immediately before this line. An act is online by
 * definition, which makes it the one moment such a withdrawal is sure of a
 * chance, and the last moment its addresses exist.
 */
export function rememberPairedDevice(
  { device_id, chains, peer_vector, scope }: CompletedPairing,
  at: Date = new Date()
): PairedDevice {
  const held = readPairedDevices();
  const remembered: PairedDevice = {
    device_id,
    // The name is the user's to type afterwards, so re-pairing a device they
    // have already named keeps the name rather than making them type it again.
    name: held.find((device) => device.device_id === device_id)?.name ?? null,
    deposit: storedLane(chains.deposit),
    collect: storedLane(chains.collect),
    // **Pairing again re-scopes the lane** (ADR-0105 §4), which is why the
    // scope is taken from the act rather than carried across like the name: the
    // act that just ran is what decides what this pairing carries, and a
    // pairing made from Rations after one made from the root is a narrowing the
    // user performed.
    scope,
    peer_vector,
    // Nothing has been deposited at index zero yet, so the first deposit of
    // this pairing's life goes out unconditionally.
    deposit_standing: null,
    // Unlike the name, a roster this device held is **not** carried across a
    // re-pairing. The name is this device's own and asking for it twice is a
    // nuisance; the roster is the peer's statement, and the peer has not made
    // one down this pairing. Its first deposit restates it whole.
    peer_roster: null,
    // A fresh pairing has burned no wakes, and a pairing made again starts its
    // count over: the act is exactly the reversal §11 leaves to the user.
    unproductive_wakes: 0,
    // **A first sync is a meeting**, and the loudest one there is — the two
    // devices were in a room together. Without this a pairing made today would
    // show no date at all until its first productive wake, on the one screen
    // whose job is to say when they last met.
    last_met: metOn(at),
    // A pairing made again is a **fresh** one, whatever happened to the row it
    // replaces: new secret, new `state₀`, both indices at zero. Carrying a mark
    // across would leave the new pairing severed before its first wake. What a
    // re-pairing must not do is silently strand the *old* lanes' objects, and
    // that is why the act settles any pending withdrawal before it reaches
    // here rather than why this field is cleared.
    revoked: false,
  };
  keep([
    ...held.filter((device) => device.device_id !== device_id),
    remembered,
  ]);
  return remembered;
}

/**
 * Writes back one pairing a Wake moved on, **and only if it is still here**.
 *
 * The guard is the point rather than defensiveness. A Wake reads the list,
 * then spends seconds on the network per lane, and unpairing is unilateral and
 * immediate (ADR-0075 §4) — so a row severed while a collection was in flight
 * must not come back because a deposit finished afterwards. Replacing only what
 * is present is the whole of that, and it needs no coordination.
 */
export function updatePairedDevice(device: PairedDevice): void {
  const held = readPairedDevices();
  if (!held.some((row) => row.device_id === device.device_id)) return;
  keep(held.map((row) => (row.device_id === device.device_id ? device : row)));
}

/** The name this device calls a peer, typed locally and never sent. */
export function namePairedDevice(device_id: string, name: string): void {
  const named = name.trim();
  keep(
    readPairedDevices().map((device) =>
      device.device_id === device_id
        ? { ...device, name: named.length > 0 ? named : null }
        : device
    )
  );
}

/**
 * **Phase 1 of the unpair**: marks the pairing revoked and keeps everything
 * else (ADR-0096 §11).
 *
 * ADR-0075 §4: every device already holds total power over its own pairings,
 * and §12 makes **silence the revocation signal** — a message can be dropped,
 * blocked or missed, and a revocation you can suppress is worse than none
 * because it reports success. So nothing is sent, and the peer reaches the
 * one-sided state on its own.
 *
 * The mark is immediate and unforgeable because it is local: depositing and
 * collecting stop here, before any delete has left this device. It hands back
 * nothing, because the withdrawal reads the list rather than one row —
 * `unpair.ts` sweeps every pending revocation, and a row handed straight over
 * would be a second path to the same two addresses.
 */
export function revokePairedDevice(device_id: string): void {
  keep(
    readPairedDevices().map((device) =>
      device.device_id === device_id ? { ...device, revoked: true } : device
    )
  );
}

/**
 * **Phase 1 for every pairing at once**: the jar-wide wipe's half of the act
 * (ADR-0096 §12), answering how many pairings it marked.
 *
 * The jar-wide wipe has to unpair, because otherwise it is a no-op with extra
 * steps: it empties `datoms` and touches nothing here, so every vector goes
 * empty and the next sync is ADR-0075 §6's empty-vector case — the whole ledger
 * comes back.
 *
 * **It marks rather than removing, and the mark is the load-bearing half.** It
 * is synchronous and local, so both lanes stop before any delete has left this
 * device — which is what closes the window a wipe otherwise opens, since a wake
 * takes its list once and then spends seconds per lane. Taking the whole record
 * instead would throw away the addresses the withdrawal spends, making it
 * best-effort at exactly the moment there is most to withdraw.
 *
 * A row already carrying a mark is left as it is rather than counted twice: it
 * is a pending revocation the same sweep is already going to finish.
 */
export function revokeAllPairedDevices(): number {
  const held = readPairedDevices();
  const marking = held.filter((device) => !device.revoked).length;
  if (marking > 0) keep(held.map((device) => ({ ...device, revoked: true })));
  return marking;
}

/**
 * **Phase 3**: drops the row, once the withdrawal has landed.
 *
 * Discarding it any earlier throws away the two addresses the withdrawal
 * needs, which is precisely what would make it best-effort — so `unpair.ts`
 * is the only thing that reaches it, and only once both deletes have returned.
 *
 * **The jar-wide wipe reaches it by the same route** and not by taking the
 * whole `localStorage` record, which is what this comment used to anticipate:
 * it marks every row through {@link revokeAllPairedDevices} and the ordinary
 * sweep finishes them, so there is one way a pairing leaves this list rather
 * than two (`jar-wipe.ts`, #403).
 */
export function forgetPairedDevice(device_id: string): void {
  keep(readPairedDevices().filter((device) => device.device_id !== device_id));
}
