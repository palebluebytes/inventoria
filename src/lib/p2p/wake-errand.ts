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
 * **A wake is an open of *a* Facet, and it serves every lane its Facet's scope
 * meets** (ADR-0105 §9, amending §7). ADR-0096 §7 had a wake be an open of the
 * root and left _a Rations-only user never converges_ stated rather than
 * repaired; ADR-0105 answers its two reasons and this module is where the
 * answer is spent. {@link openAppWake} is called from `App.svelte` and from
 * `Rations.svelte`, each naming its own Facet, and still not from
 * `facets/startup.ts` — a wake is an open of a Facet, so which Facet it is has
 * to be said rather than shared.
 *
 * **What differs between the two is the deposit and nothing else.** A wake
 * collects whatever its peer left, whole, because one Jar is one ledger and a
 * lane that is not read stalls its depositor's chain. What it *deposits* is
 * narrowed to the domains the waking Facet holds, so a Rations wake on a
 * jar-wide lane carries food and its deletions and leaves the other five to the
 * root's wake. A lane whose scope the waking Facet does not meet at all is not
 * touched, and is not counted against either (§11's counter measures absences
 * somebody looked for).
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
import type { FacetId } from "../facets/registry";
import { appWarn } from "../logs/app-log";
import {
  readPairedDevices,
  updatePairedDevice,
  type PairedDevice,
} from "../stores/paired-devices";
import { isStopped, wakeCounter, type CountedRound } from "./wake-counter";
import { appStore, type Store } from "./deposit-store";
import {
  openWake,
  type OpenWake,
  type WakeRound,
  type WakeTuning,
} from "./wake-cadence";
import { convergeWithPeer, depositToPeer, type WakeLedger } from "./wake";
import { laneScope, scopeOfFacet, type LaneScope } from "./lane-scope";
import { withdrawRevoked } from "./unpair";
import { underWakeLock } from "./wake-lock";

/**
 * The ledger as a wake needs it: two operations, both already on the client.
 *
 * `order: "stamp"` is the load-bearing half. A deposit may be cut short by the
 * ceiling and a version vector can only summarise a walk that is downward-closed
 * in stamp order, so a key-ordered page here would withhold rows permanently the
 * first time a backlog drained.
 */
export const appWakeLedger: WakeLedger = {
  // `laneScope` is what this wake may carry down this lane (ADR-0105 §9), and
  // it is handed over as the domain ids it is: `readLedgerPage` derives the
  // prefixes from the registry, and reads the same list a second time for the
  // one row whose entity cannot say what it is about — a Carried deletion,
  // which crosses only where its frozen list is a subset of this lane's (§6).
  oldestAbove: (after, budgetBytes, above, scope) =>
    dbClient.ledgerPage(after, budgetBytes, {
      above,
      laneScope: scope,
      order: "stamp",
    }),
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
 * The pairings a sync still touches at all: every one that has neither run out
 * nor been severed.
 *
 * **It is not §9's *serves*.** This is a pairing's health — whether this device
 * touches its keys — and which lanes the waking Facet meets is decided one
 * layer in, against the lane's own scope. A pairing can pass here and be
 * skipped there.
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
const stillTouched = (held: PairedDevice[]): PairedDevice[] =>
  held.filter((paired) => !isStopped(paired) && !paired.revoked);

/**
 * What one full sync did: the cadence's {@link WakeRound}, and beside it the
 * two lists only §11's counter wants.
 *
 * The counter is folded here rather than in `wake-cadence.ts`, which reads
 * `owed` and nothing else — so {@link CountedRound} is the shape of what
 * crosses to it, declared where the counting lives.
 */
export interface SyncRound extends WakeRound, CountedRound {}

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
  facetId: FacetId,
  store: Store = appStore,
  ledger: WakeLedger = appWakeLedger
): Promise<SyncRound> {
  const waking = scopeOfFacet(facetId);
  const productive: string[] = [];
  const served: string[] = [];
  let owed = false;
  const held = readPairedDevices();
  const roster = localRoster(held);
  for (const row of stillTouched(held)) {
    const paired = stillStanding(row.device_id);
    if (!paired) continue;
    // §9's rule, both halves. A wake **serves** a lane its Facet's scope meets,
    // and what it deposits is the meeting itself — the whole lane where the
    // root is awake, food and its deletions where Rations is. A lane it meets
    // no part of is left alone rather than deposited to emptily, and it is not
    // in `served`, so §11's counter does not burn a wake for an absence this
    // wake never looked for. That skip cannot fire today: both Facets hold
    // food, so every lane a pairing act can mint meets both.
    const scope = laneScope(waking, paired.scope);
    if (scope.length === 0) continue;
    served.push(paired.device_id);
    try {
      const outcome = await convergeWithPeer(paired, store, ledger, {
        keep: updatePairedDevice,
        roster,
        scope,
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
  return { productive, served, owed };
}

/**
 * Leave a deposit on every paired device's lane, collecting from none.
 *
 * What the delta growing triggers. It reads nothing, so it can neither settle a
 * collection nor learn of an acknowledgement — which is why it reports nothing
 * and why the collection floor does not skip while a peer is owed a word.
 */
export async function depositToPeers(
  facetId: FacetId,
  store: Store = appStore,
  ledger: WakeLedger = appWakeLedger
): Promise<void> {
  const waking = scopeOfFacet(facetId);
  const held = readPairedDevices();
  const roster = localRoster(held);
  for (const row of stillTouched(held)) {
    const paired = stillStanding(row.device_id);
    if (!paired) continue;
    const scope = laneScope(waking, paired.scope);
    if (scope.length === 0) continue;
    try {
      const outcome = await depositToPeer(paired, store, ledger, {
        keep: updatePairedDevice,
        roster,
        scope,
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
 *
 * **`facetId` is the Facet doing the waking**, handed in by the shell that
 * mounted rather than worked out here, for the reason `facetOf`'s own comment
 * gives: a Facet's runtime identity is a build-time constant, and nothing
 * anywhere reads `location.pathname` to decide. It is what §9's two halves are
 * computed from, and it is the **only** thing the wake learns about the Facet —
 * §11's counter never sees it, so a pairing served by both Facets carries one
 * count rather than one per Facet.
 *
 * **And this is where an errand is one at a time across the origin** (#418).
 * `wake-cadence.ts` queues every trigger of *this* open, which leaves the open
 * beside it — a browser tab next to the installed app — sharing one jar and one
 * ledger with nothing between them. {@link underWakeLock} is what both opens
 * queue on, and it goes around the whole of an errand rather than around a
 * deposit: two errands that interleaved their **reads** of `deposit_standing`
 * would disagree before either wrote.
 */
export function openAppWake(
  facetId: FacetId,
  store: Store = appStore,
  tuning?: WakeTuning
): OpenWake {
  const counted = wakeCounter(readPairedDevices, updatePairedDevice);
  return openWake(
    {
      converge: () =>
        underWakeLock(async () => {
          // A pending revocation is retried on any later open, and this is that
          // retry (§11). It runs before the lanes are served rather than after,
          // because a withdrawal that lands takes its row with it and the loop
          // below then has one fewer pairing to skip. It never throws.
          //
          // **It is not narrowed by the waking Facet, and that is ADR-0105
          // §8**: a Paired Device record belongs to the Jar rather than to the
          // Facet its lane is scoped to, so a withdrawal the user asked for is
          // finished by whichever Facet is next opened.
          await withdrawRevoked(store);
          const round = await convergeWithPeers(facetId, store);
          counted(round);
          return round;
        }),
      deposit: () => underWakeLock(() => depositToPeers(facetId, store)),
      onLedgerGrowth,
      onHide,
    },
    tuning
  );
}
