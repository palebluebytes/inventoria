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
 * The whole argument is the 2026-09-13 Amendment's, in five steps; what it
 * comes to is that a refused rewrite is answered by an unconditional recreate
 * (§5's 2026-09-12 amendment), so the **store's** write order and the
 * **record's** can disagree. A `deposit_standing` left naming an object the
 * other errand has already replaced credits the peer with what that other
 * object carried, and `vectorAboveMatch` withholds the difference on every
 * later sync. `paired-devices.ts` documents the mirror of it on
 * `DepositStanding`.
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
 * ### Where the lock cannot be had, the errand runs anyway
 *
 * **The fallback is "wake", not "do not wake"**: a device with one open has
 * nothing to serialise against, and refusing to converge to avoid a race that
 * needs a second open would trade a certainty for a possibility.
 *
 * There are two ways not to have it and both take that fallback. The API is
 * **absent** under the Node unit runner and in any insecure context, which is
 * the `typeof` half of the guard every `localStorage` access in this app
 * carries; and it can be **present and refusing** — an opaque origin rejects
 * `request()` with a `SecurityError`, and a privacy-locked browser can throw on
 * the accessor rather than on the reference — which is the `try` half, the one
 * `carried-deletion-notice.ts` names in so many words.
 *
 * A refusal is told from a failure by whether the callback ever ran, because
 * the two want opposite answers: an errand that already ran may not be run
 * again, or a device deposits twice.
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
 * The browser's `LockManager`, or `null` where this runtime will not give one
 * up.
 *
 * The Web Locks API is secure-context only and the Node unit runner has a
 * `navigator` with no `locks` on it, so presence is checked rather than
 * assumed. The `try` is the other half: a browser that has taken the API away
 * can throw on the accessor rather than answer with `undefined`, and this path
 * runs on every open.
 */
function lockManager(): LockManager | null {
  try {
    if (typeof navigator === "undefined") return null;
    if (!("locks" in navigator) || !navigator.locks) return null;
    return navigator.locks;
  } catch {
    return null;
  }
}

/**
 * Runs one wake's errand with every other wake at this origin held off.
 *
 * It resolves and rejects with whatever the errand did: a failure is the
 * caller's to report — `wake-errand.ts` already logs a sync that did not
 * converge — and the lock is released either way.
 *
 * **A lock that was never granted is not a failed errand.** `request()` rejects
 * outright on an opaque origin, without ever calling back, and treating that as
 * the errand's own rejection would be the silent _do not wake_ this whole
 * module exists to avoid. So the errand runs unserialised instead, and the flag
 * is what keeps that from re-running one that already ran.
 */
export async function underWakeLock<T>(errand: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (locks === null) return errand();
  let granted = false;
  try {
    return await locks.request(WAKE_LOCK_NAME, () => {
      granted = true;
      return errand();
    });
  } catch (refused) {
    if (granted) throw refused;
    return errand();
  }
}
