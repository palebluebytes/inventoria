import { readable, type Readable } from "svelte/store";
import { dbClient } from "../db/db.client";

/**
 * Creates a Svelte Readable store backed by the datom ledger: it runs `load`
 * once on subscribe, then re-runs it on every worker invalidation broadcast,
 * holding the last good value in between. This is the single scaffold behind the
 * query/projection/calorie stores — they differ only in the `load` they pass.
 *
 * @param load    - async loader producing the next store value.
 * @param initial - value held until the first load resolves.
 * @param onError - optional handler for a failed load; by default failures are
 *                  swallowed so startup races don't surface as errors.
 */
export function createLedgerStore<T>(
  load: () => Promise<T>,
  initial: T,
  onError?: (err: unknown) => void
): Readable<T> {
  return readable<T>(initial, (set) => {
    let live = true;

    async function refresh() {
      try {
        const value = await load();
        if (live) set(value);
      } catch (err) {
        onError?.(err);
      }
    }

    refresh();

    const unsubscribe = dbClient.onInvalidate(() => {
      if (live) refresh();
    });

    return () => {
      live = false;
      unsubscribe();
    };
  });
}

/**
 * A live store over a read-only SELECT, re-run on each datom invalidation. Query
 * errors during startup races are swallowed; the store keeps its last value
 * (starting empty).
 */
export function createQueryStore<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Readable<T[]> {
  return createLedgerStore<T[]>(() => dbClient.query<T>(sql, params), []);
}

/**
 * A live store over a named worker projection, re-run on each datom
 * invalidation.
 */
export function createProjectionStore<T>(
  pipeline: string,
  params: Record<string, unknown> = {},
  initialValue: T
): Readable<T> {
  return createLedgerStore<T>(
    () => dbClient.project<T>(pipeline, params),
    initialValue,
    (err) => console.error(`Projection error for pipeline ${pipeline}:`, err)
  );
}
