/**
 * The jar-wide wipe: what "Wipe Database" does, and why it unpairs (ADR-0096
 * §12).
 *
 * > **Wiping the whole jar takes the pairings with it, because otherwise it is
 * > a no-op with extra steps.**
 *
 * Measured before it was built: `clear` calls `resetLedgerSchema`, which drops
 * and recreates `datoms` and touches **no `localStorage` at all** — so it left
 * the Paired Device list standing behind an empty ledger, every version vector
 * empty, and the next sync was ADR-0075 §6's empty-vector case. The whole
 * ledger came back. That, and not the Facet-scoped wipe, was the catastrophic
 * case.
 *
 * So it unpairs, and re-pairing afterwards honestly means _pull it all back
 * from the laptop_ — ADR-0067 §1's two-deliberate-steps argument applied to
 * convergence instead of to import.
 *
 * ### The order is the argument, and it is the opposite of the Facet wipe's
 *
 * `facets/facet-wipe.ts` puts the ledger first, because a failure there should
 * leave everything standing rather than half of it. **Here the mark goes
 * first**, and the two failures are not the same shape: there, a half-done wipe
 * leaves data the user asked to remove; here, a half-done wipe lets a peer put
 * it all back. A wake takes its list once and then spends seconds per lane, so
 * a `clear` landing mid-round can have a collection import the peer's whole
 * ledger into the jar that was just emptied — §12's catastrophic case reached
 * by a race instead of by design.
 *
 * The mark is what closes it: it is synchronous and local, and both
 * `wake-errand.ts`'s filters read it, including the one that re-reads a row
 * immediately before serving it. A failure between the mark and the drop leaves
 * a device unpaired and still holding its ledger, which pressing the button
 * again repairs; the other way round is not repairable.
 *
 * ### The withdrawal is last, and it is cleanup
 *
 * Marking severs the pairing. Taking the two objects each one left in the store
 * is `unpair.ts`'s two-phase withdrawal, and this reuses that sweep rather than
 * growing a second mechanism — `withdrawRevoked` already runs at the front of
 * every wake and again on a re-pairing, so a mark that could not be finished
 * here is finished on the next open. It goes **after** the drop so that no
 * network round trip stands between the user's confirmation and the destructive
 * act they asked for, which matters most in the state a person wiping a device
 * is quite likely to be in: offline.
 *
 * ### What it takes outside the ledger, and the rule
 *
 * **It takes what would otherwise make the wipe a lie, and nothing else.** Two
 * records qualify: the Paired Device list, because those resurrect the data,
 * and the **Carried deletion** notice, because it is a sentence about rows that
 * would then be gone twice over. Everything else in the jar's `localStorage`
 * stands — ten device preferences, three secrets, both log-export doors, every
 * log channel, the dial, the OPFS test state — because a preference left behind
 * is a preference, not a resurrection. A control that took those is a different
 * control with a different name and a different confirmation.
 *
 * ### What it leaves behind of itself
 *
 * One `app` line at INFO, and it is the only mark the act can leave: the wipe
 * destroys every ledger-side trace by construction, and the log lives in
 * `localStorage`, which this wipe does not touch. It carries **no Carried
 * deletion** — a jar-wide `clear` takes the `deletion:` rows too, and there is
 * no peer left to carry one to.
 */

import { dbClient } from "./db/db.client";
import { appError, appInfo } from "./logs/app-log";
import { dismissCarriedDeletion } from "./stores/carried-deletion-notice";
import {
  readPairedDevices,
  revokeAllPairedDevices,
} from "./stores/paired-devices";
import { withdrawRevoked } from "./p2p/unpair";

/**
 * Where a run's effects go. Injected rather than imported, the arrangement
 * `facets/facet-wipe.ts` and `views/ledger/export-run.ts` both use: the
 * ordering below and the sentences it produces are the parts worth testing, and
 * none of them should need a Worker or a network to exercise.
 */
export interface JarWipeSeams {
  /** Drops and recreates `datoms`. `dbClient.clear`. */
  clearLedger: () => Promise<void>;
  /** Hands the freed pages back. `dbClient.vacuum`, and allowed to reject. */
  reclaimSpace: () => Promise<void>;
  /** Takes the objects every severed pairing left. `withdrawRevoked`. */
  withdrawLanes: () => Promise<void>;
}

/** The seams bound to the real app. */
export const appJarWipeSeams: JarWipeSeams = {
  clearLedger: () => dbClient.clear(),
  reclaimSpace: () => dbClient.vacuum(),
  withdrawLanes: () => withdrawRevoked(),
};

/** How a run ended, in the words the screen prints. */
export type JarWipeOutcome =
  | {
      kind: "wiped";
      /** Pairings this act severed. Zero on a jar that was never paired. */
      pairingsRevoked: number;
      /** Pairings whose objects are still to be taken, on a later open. */
      withdrawalsPending: number;
      /** Whether the `VACUUM` succeeded. The rows are gone either way. */
      reclaimed: boolean;
      message: string;
    }
  | { kind: "failed"; message: string; error: unknown };

/**
 * What the confirmation says before anything happens (ADR-0079 §5's ethic: a
 * wipe counts and enumerates **before** it acts).
 *
 * **The count is what changes the decision**, and it costs one synchronous
 * `localStorage` read with no worker round trip. The second half is the part
 * §12 insists on being honest about: re-pairing is a first sync and a first
 * sync is the empty-vector case, so a user who wipes and then pairs again has
 * not achieved what they thought.
 *
 * **At zero it reads exactly as it always did.** "It will also unpair 0
 * devices" is noise on the overwhelming majority of installs, and a sentence
 * about pairing on a jar that has never paired teaches a word for nothing.
 *
 * **And past one it stops saying _the other device_** (ADR-0096 §10). At two
 * pairings that phrase names one of several, which is the household of two
 * this whole arc stops being able to assume: what comes back comes back from
 * whichever device the user pairs with, and any of them has it.
 */
export function jarWipeConfirmation(pairings: number): string {
  const base =
    "Are you sure you want to completely wipe the database? This cannot be undone.";
  if (pairings === 0) return base;
  const devices = pairings === 1 ? "1 device" : `${pairings} devices`;
  const from =
    pairings === 1 ? "the other device" : "whichever device you pair with";
  return (
    `${base} It will also unpair ${devices} — pairing again afterwards copies ` +
    `everything back from ${from}.`
  );
}

/**
 * Marks, clears, reclaims, withdraws, and says what happened.
 *
 * The header carries the argument for the order. What is worth restating here
 * is that only the first step is allowed to be silent: the mark cannot fail
 * (it is a `localStorage` write the store's own guard swallows), the clear is
 * the one step whose failure aborts, and the last two are best-effort and are
 * **reported** rather than hidden.
 */
export async function runJarWipe(
  seams: JarWipeSeams = appJarWipeSeams
): Promise<JarWipeOutcome> {
  // First, and synchronously. From here no lane is served and no deposit is
  // made against a pairing that no longer stands, so the clear below cannot
  // race a collection that would hand the whole ledger back.
  const pairingsRevoked = revokeAllPairedDevices();

  try {
    await seams.clearLedger();
  } catch (error) {
    // Nothing else has happened yet, so the pairings are severed and the ledger
    // is not. That is recoverable by pressing the button again, and it is the
    // direction worth failing in.
    appError("clearing the ledger failed", error);
    return {
      kind: "failed",
      message: "Failed to wipe database",
      error,
    };
  }

  // The notice is a sentence about rows a peer deleted here. The rows are gone
  // twice over now, so leaving it would have the screen claim something that
  // was never true of the jar it is standing in.
  dismissCarriedDeletion();

  // Best-effort, and separate from the delete (ADR-0079 §4). `VACUUM` cannot
  // run inside a transaction, so "both or neither" is not expressible: the
  // delete commits and the reclaim is attempted after it.
  let reclaimed = true;
  try {
    await seams.reclaimSpace();
  } catch (error) {
    appError("compacting the ledger failed", error);
    reclaimed = false;
  }

  // Cleanup, and the one step that needs a network. It never rejects — each
  // pairing's failure is its own and leaves that mark standing for the next
  // open — so what is read afterwards is how many are still owed.
  await seams.withdrawLanes();
  const withdrawalsPending = readPairedDevices().filter(
    (device) => device.revoked
  ).length;

  // The only mark this act can leave: it has just destroyed every ledger-side
  // trace of itself, and the log is `localStorage`, which it does not touch.
  appInfo(
    `jar wipe: the ledger was emptied and ${pairingsRevoked} pairing(s) were severed`
  );

  return {
    kind: "wiped",
    pairingsRevoked,
    withdrawalsPending,
    reclaimed,
    message: jarWipeReport({ pairingsRevoked, withdrawalsPending, reclaimed }),
  };
}

/**
 * What the screen says afterwards: the half that succeeded, claimed, and the
 * half that did not, named.
 *
 * Three clauses, and two of them are conditional because only two of them can
 * fail. The emptiness is unconditional because it is true either way; the space
 * is conditional because only the space can fail; and the withdrawal's clause
 * appears only where something is still owed, which is #400's pending state
 * reported for a set rather than for one device.
 */
export function jarWipeReport({
  pairingsRevoked,
  withdrawalsPending,
  reclaimed,
}: {
  pairingsRevoked: number;
  withdrawalsPending: number;
  reclaimed: boolean;
}): string {
  const space = reclaimed
    ? "The ledger is empty, and the space it was using has been reclaimed."
    : "The ledger is empty. The space it was using could not be reclaimed, so the storage figure may not have changed.";
  if (pairingsRevoked === 0) return space;

  const devices = pairingsRevoked === 1 ? "device" : "devices";
  const unpaired = ` The paired ${devices} ${pairingsRevoked === 1 ? "has" : "have"} been removed.`;
  if (withdrawalsPending === 0) return `${space}${unpaired}`;

  const owed =
    withdrawalsPending === 1
      ? "One is still being cleared up"
      : `${withdrawalsPending} are still being cleared up`;
  return (
    `${space}${unpaired} ${owed}, and that finishes the next time you open ` +
    `the app.`
  );
}
