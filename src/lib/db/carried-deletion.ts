/**
 * What a Facet-scoped wipe writes down so a sleeping peer can apply it
 * (ADR-0096 §12 and §13).
 *
 * > **A wipe on one device deletes on the other, and it travels as a fact
 * > rather than as an instruction.**
 *
 * ADR-0079 §8 left the first convergence design to reach `main` an unowned
 * debt: _a Facet-scoped wipe and a syncing peer are incompatible without a
 * deletion the peer can carry_. ADR-0096's retention makes it strictly worse
 * than §8 modelled — §8 assumed a **live** peer hands the wiped rows back, and
 * a retained deposit hands them back with no peer awake at all.
 *
 * ### The prefix list is the fact, and it is frozen
 *
 * The datom carries the **prefix list itself**, derived from the wiping
 * device's registry at the instant of the act and then frozen — never the Facet
 * and never the domain. A re-derivation is evaluated against the *peer's*
 * registry, and two devices are not on the same build: an older peer deletes
 * less, a newer one deletes more, and both report success. **The set a wipe
 * took is a fact, and a fact does not get recomputed by whoever reads it.**
 *
 * It looks like the second hand-written list ADR-0079 §3 forbids and is the
 * opposite of one: §3's fear is a list authored *beside* the registry, which
 * drifts; this is derived *from* it, once, and cannot drift because nothing
 * re-derives it.
 *
 * ### It takes rows stamped at or before it, and nothing after
 *
 * That is the ledger's own semantics — a later fact wins — so a wipe deletes
 * history and never the future, and the outcome is **order-independent**:
 * applying one twice, or applying two in either order, gives the same ledger.
 * The bound is on `(hlc_ms, hlc_ctr)` and is inclusive, so a row stamped in the
 * same tick as the act goes with it and the answer does not depend on which
 * device is asking.
 *
 * ### It is applied to every arriving batch, and it is a physical delete
 *
 * Firing once leaves a hole at three devices or more: one that slept through
 * the wipe wakes later, syncs with the peer that already deleted, and
 * re-supplies the rows one hop out. So {@link carriedDeletionWarrant} is asked
 * of **every** batch a convergence writes, for as long as the deletion is in
 * the ledger — which is forever, because the ledger is append-only.
 *
 * The rows go from the table rather than being filtered at fold time, so
 * ADR-0079's _a wipe that grows the file is a lie_ is untouched and the freed
 * pages are reusable on both devices.
 *
 * ### What is not here
 *
 * The SQL is `db.core.ts`'s, beside the other sanctioned deletions — this
 * module is the shape of the fact, the predicate over one row, and the question
 * "need this batch be swept at all?". Which batches are convergence and which
 * are a user-chosen import is `db.worker.ts`'s, and the notice the peer shows
 * afterwards is `stores/carried-deletion-notice.ts`'s.
 */

import { mintEntity } from "../facets/entity-id";
import type { LedgerRow } from "./db.core";
import { compareHlcMark, type HlcKey } from "./hlc";

/**
 * The one attribute the `deletion/` namespace holds (ADR-0096 §13).
 *
 * `deletion/` and not `wipe/`: `wipe` is the local control's name, and a
 * travelling record named after a button reads as the button rather than as
 * what it is. Nothing joins it — a frozen human label was recommended and then
 * refuted, because a peer that does not recognise a prefix deleted nothing
 * under it, so a name derived from the prefixes **this** build recognises says
 * what this device actually did where a frozen phrase would claim rows that are
 * still there.
 */
export const CARRIED_DELETION_ATTRIBUTE = "deletion/prefixes";

/** One carried deletion, as the ledger holds it. */
export interface CarriedDeletion {
  /** The act's own datom key, which is also its entity id. */
  entity: string;
  /** The prefix list the wiping device froze. */
  prefixes: readonly string[];
  hlc_ms: number;
  hlc_ctr: number;
}

/**
 * The datom one act of a Facet-scoped wipe writes.
 *
 * **The entity is the act's own stamp** — `deletion:<hlc_ms>_<hlc_ctr>_<device_id>`
 * — which is unique across devices by construction, legible in the raw
 * database, and needs neither a clock read nor a random of its own. ADR-0014's
 * determinism rule does not bind it, because two devices never perform the same
 * wipe.
 *
 * **Per-act rather than a singleton.** Two wipes are two facts with two stamps,
 * and one entity under _a later fact wins_ would keep only the newer prefix
 * list, stranding rows under any prefix that retired between builds.
 *
 * `time` is the stamp's own millisecond rather than a second clock read. The
 * domain instant of this fact *is* the act, and the act is what the stamp
 * names, so a second reading could only disagree with it.
 */
export function carriedDeletionRow(
  stamp: HlcKey,
  prefixes: readonly string[]
): LedgerRow {
  return {
    entity: mintEntity(
      "deletion:",
      `${stamp.hlc_ms}_${stamp.hlc_ctr}_${stamp.device_id}`
    ),
    attribute: CARRIED_DELETION_ATTRIBUTE,
    value: JSON.stringify([...prefixes]),
    time: stamp.hlc_ms,
    hlc_ms: stamp.hlc_ms,
    hlc_ctr: stamp.hlc_ctr,
    device_id: stamp.device_id,
  };
}

/**
 * One stored row back as the deletion it is, or `null` where it is not one.
 *
 * Read to the standard everything off a wire is read to, and then some: this
 * row arrived in a peer's deposit, and a value that will not parse must not
 * stop the batch that carried it. A malformed one is **ignored rather than
 * thrown on**, because the alternative is a single bad row wedging every
 * convergence this device will ever attempt — the deletion is in the ledger
 * forever, so a throw here would be permanent.
 *
 * **An unrecognised prefix is carried, not refused.** The list is the wiping
 * device's registry and this build's may be older or newer; a string this
 * device has never minted under simply matches no row, which is the same
 * outcome as recognising it and finding nothing.
 */
export function readCarriedDeletion(row: LedgerRow): CarriedDeletion | null {
  if (row.attribute !== CARRIED_DELETION_ATTRIBUTE) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const prefixes = parsed.filter(
    (prefix): prefix is string =>
      typeof prefix === "string" && prefix.length > 0
  );
  if (prefixes.length !== parsed.length) return null;
  return {
    entity: row.entity,
    prefixes,
    hlc_ms: row.hlc_ms,
    hlc_ctr: row.hlc_ctr,
  };
}

/**
 * Whether this deletion takes this row: one of its prefixes, and a stamp at or
 * before its own.
 *
 * The same predicate the `DELETE` runs, evaluated in memory over rows that have
 * not been written yet. It exists so a sweep can be **skipped** rather than
 * repeated — see {@link carriedDeletionWarrant}.
 */
export function carriedDeletionTakes(
  deletion: CarriedDeletion,
  row: LedgerRow
): boolean {
  return (
    deletion.prefixes.some((prefix) => row.entity.startsWith(prefix)) &&
    compareHlcMark(row, deletion) <= 0
  );
}

/**
 * Which of the held deletions this arriving batch obliges the ledger to sweep.
 *
 * **The sweep is over the whole table and the batch decides whether it runs.**
 * Every batch before this one was swept against every deletion held at the
 * time, so the only two things that can leave a row a deletion takes are:
 *
 * - a **new deletion** in this batch, which may take rows that arrived at any
 *   point in the past — including earlier batches of this same import — so
 *   everything held is swept; and
 * - a **row this batch carries** that a deletion already held takes, which is
 *   the peer re-supplying what a wipe removed.
 *
 * Anything else leaves the ledger exactly as the last sweep left it, and a
 * scan of it would find nothing. That matters because a deletion is permanent:
 * without this, every convergence batch for the rest of a jar's life would pay
 * a full table scan for a wipe somebody performed once, years ago.
 *
 * An empty answer means no sweep, not "sweep nothing".
 */
export function carriedDeletionWarrant(
  held: readonly CarriedDeletion[],
  arrived: readonly LedgerRow[]
): CarriedDeletion[] {
  if (held.length === 0) return [];
  const carriesADeletion = arrived.some(
    (row) => row.attribute === CARRIED_DELETION_ATTRIBUTE
  );
  if (carriesADeletion) return [...held];
  return held.filter((deletion) =>
    arrived.some((row) => carriedDeletionTakes(deletion, row))
  );
}

/** What a sweep took, which is what the peer's one-shot notice is built from. */
export interface CarriedDeletionSweep {
  /**
   * The prefixes of every deletion that took at least one row.
   *
   * The prefixes as they were **carried**, unfiltered: what this build calls
   * them is the notice's business, and a prefix it cannot name is one it
   * deleted nothing under.
   */
  prefixes: readonly string[];
  /** Rows physically removed by this sweep. */
  datomsDeleted: number;
}

/**
 * A sweep that took nothing, which is every batch in a jar nobody has wiped.
 *
 * One shared value rather than a fresh object per batch, and frozen because it
 * is shared: a reader that pushed a prefix onto it would be editing every
 * "nothing happened" answer this process has given.
 */
export const SWEPT_NOTHING: CarriedDeletionSweep = Object.freeze({
  prefixes: Object.freeze([]),
  datomsDeleted: 0,
});
