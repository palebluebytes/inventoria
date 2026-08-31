/**
 * The ledger read a Meal payload is built from (ADR-0073 §1).
 *
 * `buildMealPayload` is pure and takes its reader as a parameter, so this is
 * where that parameter comes from in the app: one `SELECT` per generation of
 * the closure walk, through the same worker RPC every other read uses. SQLite
 * stays in the worker (`CODING_STANDARDS` §1.2) and the rows cross as data.
 *
 * **The three attributes that never cross are also three the read never
 * fetches.** The list is `meal-payload.ts`'s, imported rather than restated, so
 * the narrowing is still declared in exactly one place — and honouring it in the
 * `WHERE` is what keeps a full-resolution label photo from crossing the worker
 * boundary only to be dropped on the other side. It cannot change the closure:
 * `referencesOf` reads four attributes and none of them is on the list.
 */

import { dbClient } from "../db/db.client";
import type { LedgerRow } from "../db/db.core";
import { OMITTED_ATTRIBUTES, type EntityRowReader } from "./meal-payload";

/** Every row the ledger holds for these entities, bar the three that never cross. */
export const ledgerEntityRows: EntityRowReader = async (entities) => {
  if (entities.length === 0) return [];
  const marks = (n: number) => new Array(n).fill("?").join(", ");
  return dbClient.query<LedgerRow>(
    `SELECT entity, attribute, value, hlc_ms, hlc_ctr, device_id, time
       FROM datoms
      WHERE entity IN (${marks(entities.length)})
        AND attribute NOT IN (${marks(OMITTED_ATTRIBUTES.length)})`,
    [...entities, ...OMITTED_ATTRIBUTES]
  );
};
