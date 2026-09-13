/**
 * The one-shot notice a peer shows after applying a **Carried deletion**
 * (ADR-0096 §12).
 *
 * > **The peer shows a one-shot notice of a completed act, and never a prompt.**
 *
 * ADR-0079 §5's ethic is that a wipe counts and enumerates **before** it acts.
 * The remote half cannot ask — the device that wiped is asleep, and the rows
 * have already gone — so it enumerates **afterwards**, and it names the
 * prefixes *this* build recognised, which is what this device actually
 * deleted. **No undo**, because there is nothing to undo and offering one would
 * be the recoverability claim ADR-0096 §17 refuses.
 *
 * ### Why the names are not carried
 *
 * A frozen human label was recommended and then refuted (ADR-0096 §13): a peer
 * that does not recognise a prefix deleted nothing under it, so a name derived
 * from the carried prefixes **intersected with this device's own registry**
 * says what happened here, where a frozen phrase would claim rows that are
 * still standing. That is why this module resolves and the wire does not.
 *
 * ### Why it is `localStorage` and could not be a datom
 *
 * It is a fact about **this device's copy** — which rows went from here, under
 * which of the prefixes this build knows. A datom would sync, so the next
 * deposit would tell every other device that this one had deleted something,
 * which is both untrue of them and an instruction-shaped thing to say. It is
 * also not a setting, so ADR-0085 is not engaged in either direction: it is a
 * message waiting to be read, which is why it is cleared on being dismissed and
 * kept across a reload until then.
 *
 * ### Two acts before one reading merge
 *
 * A device that has been shut for a fortnight can apply two wipes in one wake,
 * and a notice per act would be a queue of modal-ish banners about the same
 * absence. What the person needs to know is what is gone from this device, so a
 * second act **adds to** the standing notice rather than replacing or queuing
 * it. The count stays true because it is a sum of rows this device removed, and
 * no act is counted twice.
 */

import { writable, type Readable } from "svelte/store";
import { dbClient, type CarriedDeletionSwept } from "../db/db.client";
import { ownerOfEntity } from "../facets/registry";
import { listOf } from "../ui/words";

/** One `localStorage` record: the standing notice, or nothing to say. */
const LS_KEY = "inventoria_carried_deletion";

/**
 * What is waiting to be read: what went from **this** device, in this device's
 * own words.
 */
export interface CarriedDeletionNotice {
  /**
   * The Tracked Domains this build recognised among the carried prefixes,
   * named the way the wipe's own confirmation names them.
   *
   * Empty is a real answer and not a missing one: a prefix this build has
   * never minted under resolves to nobody, and the sentence then reports the
   * count without naming what it was.
   */
  names: string[];
  /** Rows this device physically deleted, summed over the unread acts. */
  datoms: number;
}

// `localStorage` is absent under the Node unit runner and can throw outright in
// a privacy-locked browser. A store that cannot be read holds no notice, and a
// notice that cannot be written is one the person does not get — which is the
// same outcome as this feature not existing, and strictly better than a throw
// on the convergence path that applied the deletion.
function jar(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readNotice(): CarriedDeletionNotice | null {
  try {
    // Inside the `try` rather than above it: `jar()` answers whether there is a
    // store, and a privacy-locked one is a store that throws on the accessor
    // rather than on the reference.
    const held = jar()?.getItem(LS_KEY);
    if (!held) return null;
    const parsed: unknown = JSON.parse(held);
    if (parsed === null || typeof parsed !== "object") return null;
    const { names, datoms } = parsed as Partial<CarriedDeletionNotice>;
    if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
      return null;
    }
    if (typeof datoms !== "number" || !Number.isSafeInteger(datoms))
      return null;
    return { names, datoms };
  } catch {
    return null;
  }
}

const standing = writable<CarriedDeletionNotice | null>(readNotice());

/**
 * The notice, or `null` when there is nothing to say — which is every open
 * except the one after a peer's wipe reached this device.
 */
export const carriedDeletionNotice: Readable<CarriedDeletionNotice | null> =
  standing;

function keep(notice: CarriedDeletionNotice | null): void {
  standing.set(notice);
  try {
    const store = jar();
    if (!store) return;
    if (notice === null) store.removeItem(LS_KEY);
    else store.setItem(LS_KEY, JSON.stringify(notice));
  } catch {
    /* privacy-locked — the banner still shows for the life of this page */
  }
}

/**
 * What this build calls the carried prefixes, once each, in roster order.
 *
 * **Recognition is ownership**, asked of the registry rather than of a list:
 * `ownerOfEntity` answers with the domain whose longest declared prefix the
 * string starts with, and a prefix is a prefix of itself — so a carried
 * `food:custom_` resolves to Food, and a prefix retired or not yet invented on
 * this build resolves to nobody and is dropped. A domain is named once however
 * many of its prefixes the wipe took, because the person reads domains and the
 * wire carries prefixes.
 */
export function namesOfCarriedPrefixes(prefixes: readonly string[]): string[] {
  const named: string[] = [];
  for (const prefix of prefixes) {
    const owner = ownerOfEntity(prefix);
    if (owner && !named.includes(owner.name)) named.push(owner.name);
  }
  return named;
}

/**
 * Records one applied carried deletion, merging it into anything not yet read.
 *
 * It is only ever called for a sweep that took rows: a deletion that found
 * nothing here changed nothing here, and announcing it would be news about
 * another device's ledger rather than about this one.
 */
export function noteCarriedDeletion(swept: CarriedDeletionSwept): void {
  if (swept.datomsDeleted <= 0) return;
  const before = readNotice();
  const names = [...(before?.names ?? [])];
  for (const name of namesOfCarriedPrefixes(swept.prefixes)) {
    if (!names.includes(name)) names.push(name);
  }
  keep({ names, datoms: (before?.datoms ?? 0) + swept.datomsDeleted });
}

/** Marks the notice read. One-shot: nothing brings it back. */
export function dismissCarriedDeletion(): void {
  keep(null);
}

/**
 * What the banner says: a completed act, its size, and no offer of a way back.
 *
 * **It is one sentence about a deletion and one about its finality**, in that
 * order, because the second is the part that stops a reader hunting for an
 * undo. It never says which device, because this one does not know: a deposit
 * carries no author beyond the lane it came down, and naming a pairing would be
 * a claim about a *relationship* that ADR-0075 §14.6 still refuses.
 */
export function carriedDeletionLine(notice: CarriedDeletionNotice): string {
  const what =
    notice.names.length === 0
      ? "Data was deleted on another of your devices"
      : `${listOf(notice.names)} was deleted on another of your devices`;
  return (
    `${what}, so ${notice.datoms.toLocaleString()} datoms have gone from this ` +
    `device too. It has already happened, and nothing here can bring them back.`
  );
}

/**
 * Wires the notice to the worker's announcement, and hands back the way to stop
 * listening.
 *
 * A shell calls this before it opens its wake, because the wake is what applies
 * a carried deletion and a broadcast with nobody listening is a notice the
 * person never gets. It is this module's own plumbing rather than the shell's,
 * so the one place that decides what a notice is also decides what makes one.
 */
export function watchCarriedDeletions(): () => void {
  return dbClient.onCarriedDeletion(noteCarriedDeletion);
}
