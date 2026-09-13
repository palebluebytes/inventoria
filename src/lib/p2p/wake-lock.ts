/**
 * One wake's errand at a time, across every tab and install at this origin
 * (ADR-0096 §5, as amended for #418).
 *
 * > **Collecting, acknowledging and depositing are one errand, and two of them
 * > may not overlap at one origin.**
 *
 * `wake-cadence.ts` already queues every trigger of **one** open onto one
 * chain, and that is not enough: a root browser tab beside the installed root
 * is two opens over one `localStorage` jar and one ledger, and nothing above
 * this module serialises them. ADR-0103 §9 makes the pair routine rather than
 * accidental — a root tab beside an installed Rations — which is why #418 is
 * repaired before it rather than by it.
 *
 * ### What overlapping costs, and why the conditional `PUT` does not cover it
 *
 * A deposit's rewrite is conditional on the etag this device's own `PUT`
 * returned, and a **refused** rewrite is answered by an unconditional recreate
 * (§5's 2026-09-12 amendment). So the store's write order and the jar's write
 * order can disagree: one errand's `PUT` can land first and its record write
 * last, leaving `deposit_standing` naming an object the other errand has
 * already replaced. The peer then collects the object that is actually there,
 * acknowledges it, and this device merges the **other** one's `brings` into
 * `peer_vector` — crediting the peer with rows it never received, which
 * `vectorAboveMatch` withholds on every later sync. `paired-devices.ts`
 * documents the mirror of this on `DepositStanding` — _if the peer took an
 * earlier rewrite and the recreate is a fuller one, crediting the fuller one
 * would skip the rows only it carried, permanently_ — and this is the same
 * hazard reached from the other side.
 *
 * A lock on the write alone would not close it. Both errands read
 * `deposit_standing` before either writes, so the disagreement is settled
 * before the first `PUT` leaves; what has to be serialised is the read and the
 * write together, which is the errand.
 *
 * ### Why a Web Lock, and why the loser waits
 *
 * `navigator.locks` is scoped to the **origin**, so one name covers two tabs, a
 * tab beside an install, and two installs — which is exactly the set of wakes
 * that share a jar. Nothing else the platform offers does: a `localStorage`
 * flag is not atomic, and a `BroadcastChannel` election needs a timeout to
 * decide that nobody answered.
 *
 * **The loser waits rather than skipping.** A wake that declined to run would
 * be a collection that did not happen, and the whole promise is stated in
 * opens; a wake that waits re-reads the record afterwards, finds the lane
 * already advanced, and has nothing left to do. That is why this takes no
 * `ifAvailable` — the cost of waiting is latency on a path with no deadline,
 * and the cost of skipping is the open the user made.
 *
 * ### Where there is no `LockManager`, the errand runs anyway
 *
 * It is absent under the Node unit runner and can be absent in a browser that
 * has taken it away, so presence is checked the way every `localStorage` access
 * in this app checks its own. **The fallback is "wake", not "do not wake"**: a
 * device with one open has nothing to serialise against, and refusing to
 * converge to avoid a race that needs a second open would trade a certainty for
 * a possibility.
 */

/**
 * The name every wake takes the lock under.
 *
 * One name for the whole origin and not one per Facet: the two Facets are
 * separately installable but they share one jar and one ledger, so a lock they
 * did not share would serialise nothing that matters.
 */
export const WAKE_LOCK_NAME = "inventoria_wake";

/**
 * The browser's `LockManager`, or `null` where this runtime has none.
 *
 * The Web Locks API is secure-context only and the Node unit runner has a
 * `navigator` with no `locks` on it, so presence is checked rather than
 * assumed — `persistent-storage.ts` reads `navigator.storage` the same way.
 */
function lockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  if (!("locks" in navigator) || !navigator.locks) return null;
  return navigator.locks;
}

/**
 * Runs one wake's errand with every other wake at this origin held off.
 *
 * It resolves and rejects with whatever the errand did: a failure is the
 * caller's to report, and the lock is released either way.
 */
export async function underWakeLock<T>(errand: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (locks === null) return errand();
  return locks.request(WAKE_LOCK_NAME, errand);
}
