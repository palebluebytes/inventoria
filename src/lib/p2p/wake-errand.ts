/**
 * The Wake itself: one open of the root Facet, every pairing served once
 * (ADR-0096 §3 and §7).
 *
 * `wake.ts` is pure and takes its store, its ledger and its record writer as
 * parameters, so this is where those come from in the app — the same worker RPC
 * every other read and every import already uses, and the route on this origin.
 *
 * **A wake is an open of the root Facet, and a Rations-only user never
 * converges** (§7). Both Facets are separately installable and separately
 * launched, so a person who opens Rations daily and the root never gets no
 * wakes at all. That is **stated, not repaired**: reaching across would re-open
 * ADR-0084 §6 from the wrong side and would put convergence inside a Facet
 * ADR-0078 gives no way out of. It is why this errand is called from
 * `App.svelte` rather than from `facets/startup.ts`, which both entry points
 * run.
 *
 * **One open is one wake however long the app stays open.** A collection at the
 * start of an hour-long session and a deposit at the end are the same IP and
 * are trivially regrouped, so there is nothing to buy by splitting them. The
 * second sync §3's amendment allows — a deposit whenever the delta grows, a
 * collection no more than hourly — is #397's, and it is a second caller of
 * `convergeWithPeer` rather than a change to it.
 *
 * **Nothing here reaches a screen.** Steady state shows nothing (ADR-0075 §11),
 * a collection that finds nothing is the normal outcome, and a wake that could
 * not reach the store is a wake that did not converge — it leaves a line in the
 * app log and tries again on the next open.
 */

import { dbClient } from "../db/db.client";
import { appWarn } from "../logs/app-log";
import {
  readPairedDevices,
  updatePairedDevice,
} from "../stores/paired-devices";
import { appStore, type Store } from "./deposit-store";
import { convergeWithPeer, type WakeLedger } from "./wake";

/** The ledger as a wake needs it: two operations, both already on the client. */
export const appWakeLedger: WakeLedger = {
  page: (after, budgetBytes, above) =>
    dbClient.ledgerPage(after, budgetBytes, { above }),
  write: (rows, final) => dbClient.ledgerImport(rows, final),
};

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
 * deposit would not open, must not stop the next peer's lane from being served.
 */
export async function convergeOnWake(store: Store = appStore): Promise<void> {
  for (const paired of readPairedDevices()) {
    try {
      const outcome = await convergeWithPeer(paired, store, appWakeLedger, {
        keep: updatePairedDevice,
      });
      if (outcome.jammed) {
        appWarn(
          "[p2p] A datom is wider than one deposit, so this pairing's lane " +
            "cannot drain. It will not converge until that row is smaller."
        );
      }
    } catch (failure) {
      // A wake that did not converge, which the next open retries. It is a
      // line in the log rather than a surface: there is nothing the person
      // holding the phone can do about it, and ADR-0075 §11 shows nothing in
      // steady state.
      appWarn("[p2p] This wake did not converge with a paired device", failure);
    }
  }
}
