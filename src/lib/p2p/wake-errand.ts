/**
 * The Wake itself: one open of the root Facet, and every pairing served as
 * often as it has reason to be (ADR-0096 §3, §7, and §3's two Amendments).
 *
 * `wake.ts` is pure and takes its store, its ledger and its record writer as
 * parameters, and `wake-cadence.ts` is pure and takes its two syncs and its two
 * signals as parameters. This is where all five come from in the app — the same
 * worker RPC every other read and every import already uses, the route on this
 * origin, and the browser's own account of when the ledger grew and when the
 * app went away.
 *
 * **A wake is an open of the root Facet, and a Rations-only user never
 * converges** (§7). Both Facets are separately installable and separately
 * launched, so a person who opens Rations daily and the root never gets no
 * wakes at all. That is **stated, not repaired**: reaching across would re-open
 * ADR-0084 §6 from the wrong side and would put convergence inside a Facet
 * ADR-0078 gives no way out of. It is why {@link openAppWake} is called from
 * `App.svelte` rather than from `facets/startup.ts`, which both entry points
 * run.
 *
 * **One open is still one wake, and it is no longer one sync.** §3's 2026-09-06
 * Amendment unwelds the two: the promise stays stated in opens — _your data
 * reaches your other device the first time you open the app on each of them_ —
 * while a session that stays open deposits whenever its delta grows and
 * collects again no more than hourly. `wake-cadence.ts` holds the whole of
 * when; this module holds the whole of what, once per pairing.
 *
 * **Nothing here reaches a screen.** Steady state shows nothing (ADR-0075 §11),
 * a collection that finds nothing is the normal outcome, and a sync that could
 * not reach the store is a sync that did not converge — it leaves a line in the
 * app log and the next trigger tries again.
 */

import { dbClient } from "../db/db.client";
import { appWarn } from "../logs/app-log";
import {
  readPairedDevices,
  updatePairedDevice,
  type PairedDevice,
} from "../stores/paired-devices";
import { appStore, type Store } from "./deposit-store";
import {
  openWake,
  type OpenWake,
  type WakeRound,
  type WakeTuning,
} from "./wake-cadence";
import { convergeWithPeer, depositToPeer, type WakeLedger } from "./wake";

/**
 * The ledger as a wake needs it: two operations, both already on the client.
 *
 * `order: "stamp"` is the load-bearing half. A deposit may be cut short by the
 * ceiling and a version vector can only summarise a walk that is downward-closed
 * in stamp order, so a key-ordered page here would withhold rows permanently the
 * first time a backlog drained.
 */
export const appWakeLedger: WakeLedger = {
  oldestAbove: (after, budgetBytes, above) =>
    dbClient.ledgerPage(after, budgetBytes, { above, order: "stamp" }),
  write: (rows, final) => dbClient.ledgerImport(rows, final),
};

/**
 * The one lane condition draining cannot reach, said by whichever sync met it.
 *
 * Both of them can: a deposit is a deposit whether a collection preceded it,
 * and the trigger that fires most often is the one least worth being silent on.
 */
const JAMMED =
  "[p2p] A datom is wider than one deposit, so this pairing's lane cannot " +
  "drain. It will not converge until that row is smaller.";

/**
 * What this device is paired with, as every deposit of this round states it
 * (ADR-0096 §6).
 *
 * **It is the whole list and it is read once.** Every row counts, whatever
 * state its lanes are in: a pairing whose peer has stopped collecting is still
 * a pairing, and §11's counter running out is exactly when the other end most
 * wants to see it named — the roster is the hunt list for mail stranded at a
 * lane nobody reads (§10). Reading it once rather than per lane is what makes
 * every deposit in one round say the same sentence.
 *
 * **No name goes with it.** A name is typed locally, about the peer, after the
 * act, and it never leaves this device; an id resolves to one at the far end
 * exactly where a name is wanted (§6, §9).
 */
const localRoster = (held: PairedDevice[]): string[] =>
  held.map((paired) => paired.device_id);

/**
 * Converge with every paired device, once.
 *
 * **Pairings run one after another rather than at once.** Each one's work is a
 * `GET`, a batch of imports through the single worker that owns SQLite, and a
 * `PUT` of up to 16 MiB; running them together would interleave those imports
 * for no gain on a path with no deadline. The fan-out that makes this a real
 * question is #401's, and it is forced by pairwise pairing rather than by this
 * loop.
 *
 * **One pairing's failure is its own.** A peer whose store call failed, or whose
 * deposit would not open, must not stop the next peer's lane from being served
 * — and it is **owed** either way, because a sync that stopped part way may have
 * taken rows it never said the word for.
 */
export async function convergeWithPeers(
  store: Store = appStore,
  ledger: WakeLedger = appWakeLedger
): Promise<WakeRound> {
  const productive: string[] = [];
  let owed = false;
  const held = readPairedDevices();
  const roster = localRoster(held);
  for (const paired of held) {
    try {
      const outcome = await convergeWithPeer(paired, store, ledger, {
        keep: updatePairedDevice,
        roster,
      });
      if (outcome.acknowledged || outcome.settled) {
        productive.push(paired.device_id);
      }
      // A take that moved rows and settled nothing: the acknowledgement it owes
      // is not in the store, so the next sync repeats it whole from the `GET`.
      if (outcome.collected > 0 && !outcome.settled) owed = true;
      if (outcome.jammed) appWarn(JAMMED);
    } catch (failure) {
      owed = true;
      // A sync that did not converge, which a later trigger retries. It is a
      // line in the log rather than a surface: there is nothing the person
      // holding the phone can do about it, and ADR-0075 §11 shows nothing in
      // steady state.
      appWarn("[p2p] This wake did not converge with a paired device", failure);
    }
  }
  return { productive, owed };
}

/**
 * Leave a deposit on every paired device's lane, collecting from none.
 *
 * What the delta growing triggers. It reads nothing, so it can neither settle a
 * collection nor learn of an acknowledgement — which is why it reports nothing
 * and why the collection floor does not skip while a peer is owed a word.
 */
export async function depositToPeers(
  store: Store = appStore,
  ledger: WakeLedger = appWakeLedger
): Promise<void> {
  const held = readPairedDevices();
  const roster = localRoster(held);
  for (const paired of held) {
    try {
      const outcome = await depositToPeer(paired, store, ledger, {
        keep: updatePairedDevice,
        roster,
      });
      if (outcome.jammed) appWarn(JAMMED);
    } catch (failure) {
      appWarn("[p2p] This deposit did not reach a paired device", failure);
    }
  }
}

/**
 * The ledger changing, as the app already announces it.
 *
 * The worker broadcasts on four things, not two: an append, the final batch of
 * an import, a Facet-scoped wipe and a `clear`. The first two are growth in the
 * plain sense — rows this device logged are what a peer lacks, and rows it
 * imported are what a *third* device lacks (#401) — and **nothing here tells
 * any of them apart, which is deliberate**. Telling an append from an import
 * was available (the worker sends an empty attribute list for everything but an
 * append) and is refused, because under §10's fan-out an import is exactly what
 * a third device is waiting for.
 *
 * The two deletions cost one rewrite each and nothing else: the delta read
 * afterwards is smaller, so what goes out is what survived. A deposit carrying
 * the deletion itself is #402's, and unpairing on a jar-wide wipe is #403's.
 */
const onLedgerGrowth = (grew: () => void): (() => void) =>
  dbClient.onInvalidate(grew);

/**
 * The app going away, as far as a browser will say.
 *
 * Both events, because neither is enough alone: `visibilitychange` is what
 * fires when a tab is backgrounded or a phone is locked, and `pagehide` is the
 * one iOS gives before a tab is discarded. The flush behind them is
 * best-effort and idempotent, so being told twice costs nothing.
 *
 * **Best-effort is as good as this gets, and the reason is a number.** The two
 * events differ in what survives them: a backgrounded tab keeps running, so its
 * `PUT` completes normally, while a tab being discarded cancels it. The usual
 * repair — `fetch` with `keepalive` — cannot be used here, because keepalive
 * caps a request body at 64 KiB and a deposit's ceiling is 16 MiB, so it would
 * carry the small deposits and silently refuse exactly the backlogs that most
 * need carrying. ADR-0096 §3's amendment already names this residual: a device
 * closed inside the debounce window defers to its next open, which is the
 * promise rather than a regression.
 */
function onHide(hidden: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") hidden();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", hidden);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", hidden);
  };
}

/**
 * Opens this app's wake, wired to the real store, the real ledger and the real
 * browser. Closing it ends every trigger it started.
 */
export function openAppWake(
  store: Store = appStore,
  tuning?: WakeTuning
): OpenWake {
  return openWake(
    {
      converge: () => convergeWithPeers(store),
      deposit: () => depositToPeers(store),
      onLedgerGrowth,
      onHide,
    },
    tuning
  );
}
