/**
 * §11's counter: when a pairing stops being touched, and the one date the
 * design ever says about staleness (ADR-0096 §11, as amended 2026-09-12).
 *
 * > **After K = 200 consecutive wakes in which a pairing produced nothing — no
 * > acknowledgement received and no collection settled — a device stops
 * > touching that pairing's keys and shows the one-sided state.**
 *
 * ### What it is bounding, which is not staleness
 *
 * A pairing whose peer stops collecting freezes the depositor's chain index, so
 * a perfectly rotating address collapses into **a constant touched on every
 * wake** — ADR-0075 §5's _with a constant it is a `GROUP BY`_, arriving by a
 * third route. A lost device, a dead device and a phone in a drawer all do it,
 * and the mirror holds: a device with nothing to deposit touches its absent
 * peer's frozen key just as repeatedly.
 *
 * **A frozen key during a genuine absence is already accepted** — §4's whole
 * finding is that an address must not rotate *during* the absence it has to
 * survive. What is bounded here is the **infinite** case and nothing else.
 *
 * ### Settled is the word
 *
 * A collection commits on its acknowledgement (§5's 2026-09-12 amendment), so a
 * wake can take rows and settle nothing: real data moved into the ledger, the
 * pairing made no progress, and the next wake repeats it identically. Counting
 * that as productive would let a pairing getting nowhere never reach K — which
 * is the infinite case this exists to bound, wearing productive clothes.
 * `WakeOutcome.settled` is what says which happened, and `wake-errand.ts` is
 * where it is read.
 *
 * ### Wakes, never syncs
 *
 * K is counted in **wakes** (§11's 2026-09-06 clarification): a session that
 * polls eight times against an absent peer is one unproductive wake, or K = 200
 * quietly becomes K = 25 and _about seven months of daily use_ is wrong by an
 * order of magnitude. {@link wakeCounter} is that wake — one is made per open
 * and called once per sync, and it burns at most one wake however many syncs
 * run through it.
 *
 * **It settles on the wake's first sync rather than on its last.** There is no
 * dependable end of a session — a discarded tab runs no teardown — so a counter
 * folded at the close would never advance on exactly the device this bound
 * exists for, a phone that is killed rather than closed. Settling at the front
 * and letting every later sync of the same wake only ever *reset* gives the
 * same answer as folding the whole wake, and gives it before the tab can go.
 *
 * ### What the stop is not
 *
 * **Hitting K never unpairs.** Auto-removal would convert a recoverable pause
 * into an irreversible act taken by a timer on the user's behalf, and the user
 * cannot re-pair without the other device in the room. The record keeps both
 * lanes, both indices and the deposit's standing, so nothing is lost: the store
 * still holds the full outstanding delta, and a peer waking on day 900 collects
 * it, acknowledges and resumes one batch behind. The exit on *this* side is the
 * user's — unpair it here too, or pair again (ADR-0075 §12) — which is why the
 * stop is a state on the row rather than a deletion of it.
 */

import { metOn, type PairedDevice } from "../stores/paired-devices";

/**
 * K: how many consecutive unproductive wakes a pairing survives.
 *
 * **Generous on purpose.** A daily phone burns roughly 30 unproductive wakes
 * per healthy month and about 90 against a quarterly laptop, so anything under
 * about 100 stops a *working* pairing. 200 is about seven months of daily use.
 * **An adaptive K is refused** as a knob in a design that has refused knobs.
 */
export const UNPRODUCTIVE_WAKE_LIMIT = 200;

/**
 * Whether this pairing has run out, and is therefore no longer touched.
 *
 * The one predicate, so that what the wake skips and what the section draws
 * cannot disagree about which pairings have stopped.
 */
export const isStopped = (device: PairedDevice): boolean =>
  device.unproductive_wakes >= UNPRODUCTIVE_WAKE_LIMIT;

/**
 * One wake's counting, ready to be handed each of its syncs.
 *
 * Make one per wake and call it with every sync's productive set. An
 * unproductive result burns **at most one** wake however many syncs report it;
 * a productive one resets the counter and dates the meeting, however late in
 * the wake it arrives.
 *
 * **A stopped pairing is not counted further.** It is no longer being touched,
 * so there is nothing for a wake to have produced, and a number that kept
 * climbing past K would be counting absences nobody looked for.
 *
 * `keep` is {@link updatePairedDevice}'s guard in the app: a row severed while
 * a sync was in flight must not come back because a counter moved afterwards.
 */
export function wakeCounter(
  held: () => PairedDevice[],
  keep: (device: PairedDevice) => void,
  now: () => Date = () => new Date()
): (productive: readonly string[]) => void {
  let burned = false;
  return (productive) => {
    const met = metOn(now());
    for (const device of held()) {
      if (productive.includes(device.device_id)) {
        keep({ ...device, unproductive_wakes: 0, last_met: met });
      } else if (!burned && !isStopped(device)) {
        keep({ ...device, unproductive_wakes: device.unproductive_wakes + 1 });
      }
    }
    burned = true;
  };
}
