import { readable, type Readable } from "svelte/store";
import { dbClient } from "../db/db.client";

/**
 * Creates a Svelte Readable store that:
 *  1. Immediately executes the given SQL query via the DB worker.
 *  2. Re-runs the query whenever the worker broadcasts a datom invalidation.
 *
 * The store exposes an array of typed rows. While loading, it holds the
 * last known good value (starts as an empty array).
 *
 * @param sql    - SELECT statement to run on each invalidation.
 * @param params - Optional bound parameters for the query.
 */
export function createQueryStore<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Readable<T[]> {
  return readable<T[]>([], (set) => {
    let live = true;

    async function refresh() {
      try {
        const rows = await dbClient.query<T>(sql, params);
        if (live) set(rows);
      } catch {
        // silently swallow query errors during startup races
      }
    }

    // Kick off an initial load
    refresh();

    // Subscribe to invalidation broadcasts from the worker
    const unsubscribe = dbClient.onInvalidate(() => {
      if (live) refresh();
    });

    // Cleanup on store unsubscription
    return () => {
      live = false;
      unsubscribe();
    };
  });
}
