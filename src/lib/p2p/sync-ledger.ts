/**
 * The app's ledger, as a first sync needs it (ADR-0075 §6 and §7).
 *
 * `first-sync.ts` is pure and takes its four ledger operations as a parameter,
 * so this is where that parameter comes from in the app: the same worker RPC
 * every other read and every import already uses. SQLite stays in the worker
 * (`CODING_STANDARDS` §1.2) and the rows cross as data.
 *
 * **What narrows here is the lane, and never the kind of row.** ADR-0075 §7
 * inverts three of ADR-0073's payload rules — superseded datoms cross, photos
 * cross, and stamps are kept — and all three still hold: a device that lacks
 * your photos is not a second copy of your ledger, it is a lossy one, so
 * nothing here excludes an attribute and nothing here skips a superseded fact.
 *
 * What ADR-0103 §1 adds is one narrowing of a different kind: a lane carries
 * the rows of the **Tracked Domains** its two ends agreed on. The predicate is
 * **derived** — `entityPrefixesOfDomains` over the scope, the same function a
 * Facet-scoped wipe reaches through `entityPrefixesOf` — and it composes with
 * the peer's own version vector in `readLedgerPage`, which already took both.
 *
 * **A jar-wide lane is every prefix the registry declares, which is not quite
 * the same as no narrowing.** A row whose entity carries a prefix **no** domain
 * declares is now excluded here as well, and there is such a row: ADR-0086 §3
 * retired six scraper-minted prefixes whose rows stay in `datoms` forever.
 * Nothing is lost that was not already withheld — the version vector has an
 * axis per content domain and no row here stands on one
 * ([#425](https://github.com/palebluebytes/inventoria/issues/425)) — but the
 * ticket that repairs that now has **two** mechanisms to undo rather than one,
 * and this is the second.
 */

import { dbClient } from "../db/db.client";
import { entityPrefixesOfDomains } from "../facets/registry";
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
    page: (after, budgetBytes, above, scope) =>
      dbClient.ledgerPage(after, budgetBytes, {
        above,
        entityPrefixes: entityPrefixesOfDomains(scope),
      }),
    // A first sync is convergence like any other, so its batches are held to
    // the carried deletions this ledger holds (ADR-0096 §12). It is the case
    // most in need of it: a first sync is the empty-vector case, so a peer
    // that never saw the wipe offers everything it has.
    write: (rows, final) => dbClient.ledgerImport(rows, final, "convergence"),
  };
}
