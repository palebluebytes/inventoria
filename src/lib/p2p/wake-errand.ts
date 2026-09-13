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
import { isStopped, wakeCounter } from "./wake-counter";
import { appStore, type Store } from "./deposit-store";
import {
  openWake,
  type OpenWake,
  type WakeRound,
  type WakeTuning,
} from "./wake-cadence";
import { convergeWithPeer, depositToPeer, type WakeLedger } from "./wake";
import { withdrawRevoked } from "./unpair";

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
  // `"convergence"`: rows that *arrive* are held to every carried deletion
  // this ledger holds, on every batch (ADR-0096 §12). The user-chosen import
  // is the exemption, and it is the other caller.
  write: (rows, final) => dbClient.ledgerImport(rows, final, "convergence"),
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
 * **It is read once, and it counts every row whose pairing still stands** —
 * whatever state its lanes are in. A pairing whose peer has stopped collecting
 * is still a pairing, and §11's counter running out is exactly when the other
 * end most wants to see it named: the roster is the hunt list for mail
 * stranded at a lane nobody reads (§10). Reading it once rather than per lane
 * is what makes every deposit in one round say the same sentence.
 *
 * **A revoked pairing is the one row that is not named.** #398's finding —
 * *the roster is what makes §10's residual findable, and that only holds if
 * the list is unfiltered, so no pairing's health is looked at anywhere on this
 * path* — is **narrowed rather than reversed**: a mark is not a pairing's
 * health, it is whether the pairing exists. A stop is a pause a timer noticed
 * and is named precisely so the far end can hunt; a mark is an act the user
 * took, and naming it would state a pairing this device has dropped.
 *
 * **And the hunt does not need it.** §10's hunt runs on what a *peer* states:
 * a device that revokes C learns who still feeds C from B's roster, never from
 * its own. Dropping C here costs that nothing and keeps B's picture true.
 *
 * **No name goes with it.** A name is typed locally, about the peer, after the
 * act, and it never leaves this device; an id resolves to one at the far end
 * exactly where a name is wanted (§6, §9).
 */
const localRoster = (held: PairedDevice[]): string[] =>
  held.filter((paired) => !paired.revoked).map((paired) => paired.device_id);

/**
 * One pairing as it stands **now**, or nothing where it no longer stands.
 *
 * A sync takes its list once and then spends seconds per lane on the network,
 * and an unpair runs off a tap that joins no queue — so by the time the loop
 * reaches a row, the user may have severed it. Re-reading immediately before
 * serving is what stops a deposit landing on a lane the withdrawal has already
 * emptied, which is an object nothing could reach afterwards. It narrows that
 * window to one pairing's own sync rather than the whole round; `unpair.ts`
 * names what is left.
 *
 * It also serves from the fresher row, which {@link updatePairedDevice} is the
 * mirror of: that guard stops a stale write coming back, and this stops a stale
 * read going out.
 */
const stillStanding = (device_id: string): PairedDevice | null =>
  readPairedDevices().find(
    (row) => row.device_id === device_id && !row.revoked
  ) ?? null;

/**
 * The pairings a sync actually serves: every one that has neither run out nor
 * been severed.
 *
 * **A stopped pairing is skipped here and named in the roster above**, which is
 * the whole of §11's _stops touching that pairing's keys_. The two readings of
 * the same list are deliberate rather than an inconsistency: the addressing
 * harm is a key touched on every wake, and being *named* touches nothing, while
 * §10 makes the roster the hunt list for mail stranded at exactly this kind of
 * lane.
 *
 * **A revoked pairing is skipped by both**, and immediately: depositing and
 * collecting stop at the mark, before any delete has left this device (§11).
 * The row is still here only because the withdrawal needs the addresses on it.
 */
const stillServed = (held: PairedDevice[]): PairedDevice[] =>
  held.filter((paired) => !isStopped(paired) && !paired.revoked);

/**
 * What one full sync did, which is the cadence's {@link WakeRound} plus the one
 * thing only §11's counter wants.
 *
 * It is declared here rather than there because the counter is folded here: the
 * names never reach `wake-cadence.ts`, which reads `owed` and nothing else.
 */
export interface SyncRound extends WakeRound {
  /**
   * The `device_id` of every pairing that produced something — an
   * acknowledgement received, or a collection **settled**.
   */
  productive: string[];
}

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
): Promise<SyncRound> {
  const productive: string[] = [];
  let owed = false;
  const held = readPairedDevices();
  const roster = localRoster(held);
  for (const row of stillServed(held)) {
    const paired = stillStanding(row.device_id);
    if (!paired) continue;
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
      //
      // **Today this cannot fire, and it is kept deliberately.**
      // `convergeWithPeer` settles whenever anything was taken, so an unsettled
      // take reaches this loop down the `catch` below, which owes the peer for
      // its own reason. What is guarded here is the shape rather than the
      // build: a commit point that returned an unsettled take instead of
      // throwing would otherwise skip the floor silently (ADR-0096 §11's entry
      // on #399).
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
  for (const row of stillServed(held)) {
    const paired = stillStanding(row.device_id);
    if (!paired) continue;
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
 * afterwards is smaller, so what goes out is what survived — and since #402 one
 * of them leaves a **Carried deletion** behind, which is a datom like any other
 * and rides out in that same rewrite. That is the whole of ADR-0096 §12's _the
 * wipe deletes its outgoing lane object and re-deposits in the same wake_: the
 * index advances on collection, so the rewrite lands at the address the stale
 * object is at and replaces it. Nothing deletes an object here, and nothing
 * needs to. Unpairing on a jar-wide wipe is #403's.
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
 *
 * **This is where §11's counter is a wake.** One {@link wakeCounter} is made
 * per open and every sync of that open reports through it, so a session that
 * polls eight times against an absent peer burns one wake and not eight. It is
 * folded here rather than inside {@link convergeWithPeers}, which cannot see
 * how many times it has been called, and not at {@link OpenWake.close}, which a
 * discarded tab never reaches.
 */
export function openAppWake(
  store: Store = appStore,
  tuning?: WakeTuning
): OpenWake {
  const counted = wakeCounter(readPairedDevices, updatePairedDevice);
  return openWake(
    {
      converge: async () => {
        // A pending revocation is retried on any later open, and this is that
        // retry (§11). It runs before the lanes are served rather than after,
        // because a withdrawal that lands takes its row with it and the loop
        // below then has one fewer pairing to skip. It never throws.
        await withdrawRevoked(store);
        const round = await convergeWithPeers(store);
        counted(round.productive);
        return round;
      },
      deposit: () => depositToPeers(store),
      onLedgerGrowth,
      onHide,
    },
    tuning
  );
}
