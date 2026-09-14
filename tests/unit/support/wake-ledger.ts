/**
 * `appWakeLedger`'s read seam, against a real ledger rather than through the
 * worker (`src/lib/p2p/wake-errand.ts`).
 *
 * Four suites stand two devices up around the store and every one of them needs
 * this exact lambda: the **oldest** rows a holder of the peer's vector lacks,
 * inside what this wake carries, in stamp order. It is one function here
 * because a harness whose narrowing has drifted from the app's proves the
 * wrong thing quietly — ADR-0103 §9 added the fourth argument and four copies
 * had to learn about it at once.
 *
 * **The write half stays with each suite**, and that is not an oversight: what
 * a device does with an arriving batch is what those suites differ about — one
 * moves a clock, one collects what each batch's carried deletions swept, one
 * counts rows and nothing else.
 */
import {
  readLedgerPage,
  type LedgerDb,
  type LedgerRow,
} from "../../../src/lib/db/db.core";
import type { LaneScope } from "../../../src/lib/p2p/lane-scope";
import type { VersionVector } from "../../../src/lib/db/version-vector";
import type { LedgerCursor } from "../../../src/lib/db/db.core";
import type { WakeLedger } from "../../../src/lib/p2p/wake";

/**
 * The two narrowings a deposit reads under, both of them the app's own:
 * `above` is what the peer already holds, and `scope` is what this wake may
 * carry down this lane. `order: "stamp"` is the load-bearing half — a deposit
 * cut short by the ceiling can only be summarised by a vector, and a vector
 * describes a set that is downward-closed in stamp order.
 */
export const oldestAbove =
  (db: LedgerDb): WakeLedger["oldestAbove"] =>
  async (
    after: LedgerCursor | null,
    budgetBytes: number,
    above: VersionVector,
    scope: LaneScope
  ): Promise<LedgerRow[]> =>
    readLedgerPage(db, after, budgetBytes, {
      above,
      laneScope: scope,
      order: "stamp",
    });
