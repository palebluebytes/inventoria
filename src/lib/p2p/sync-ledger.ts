/**
 * The app's ledger, as a first sync needs it (ADR-0075 §6 and §7).
 *
 * `first-sync.ts` is pure and takes its four ledger operations as a parameter,
 * so this is where that parameter comes from in the app: the same worker RPC
 * every other read and every import already uses. SQLite stays in the worker
 * (`CODING_STANDARDS` §1.2) and the rows cross as data.
 *
 * **Nothing here narrows.** ADR-0075 §7 inverts three of ADR-0073's payload
 * rules — superseded datoms cross, photos cross, and stamps are kept — so the
 * page read carries no `entityPrefixes` and no attribute exclusion, and the
 * only narrowing is the peer's own version vector. A device that lacks your
 * photos is not a second copy of your ledger, it is a lossy one.
 */

import { dbClient } from "../db/db.client";
import type { FirstSyncLedger } from "./first-sync";

/**
 * The seam, bound to this device.
 *
 * `device_id` is read once, up front, because it is the one fact the peer keys
 * its whole record by and a sync that learned it half way through would have
 * nothing to say if the read failed. `ledgerSummary` is how the app already
 * asks the ledger who it is — the row count it also returns is the export
 * envelope's, and is ignored here.
 */
export async function appSyncLedger(): Promise<FirstSyncLedger> {
  const { device_id } = await dbClient.ledgerSummary();
  return {
    device_id,
    vector: () => dbClient.versionVector(),
    page: (after, budgetBytes, above) =>
      dbClient.ledgerPage(after, budgetBytes, { above }),
    write: (rows, final) => dbClient.ledgerImport(rows, final),
  };
}
