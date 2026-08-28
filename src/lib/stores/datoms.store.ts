import { readable, writable, type Readable } from "svelte/store";
import { dbClient } from "../db/db.client";

/**
 * How far a ledger store has got with its first load.
 *
 * This exists because a store's initial value is indistinguishable from a real
 * empty result. `consumptionStore` starts as `[]`, and so does a day with no
 * food logged — so a view reading only the value cannot tell "nothing yet" from
 * "nothing at all", and the dashboard spent the whole of the database's boot
 * asserting "No breakfast logged yet." That is not a missing spinner; it is a
 * false statement about the user's data, and no amount of UI can fix it while
 * the two states share one representation.
 *
 * - `pending` — no load has finished. The value is the placeholder and means
 *   nothing. A view should say so, or say nothing, but must not read it.
 * - `loaded` — at least one load has finished. The value is real, though a later
 *   refresh may still be in flight.
 * - `failed` — the FIRST load threw, so there is still nothing real to show.
 */
export type LedgerLoadStatus = "pending" | "loaded" | "failed";

/**
 * A ledger-backed store, plus the {@link LedgerLoadStatus} of its first load.
 *
 * `status` is a separate store rather than part of the value so that every
 * existing consumer is untouched: a view that does not care keeps reading `$store`
 * and a view that does subscribes to `$store.status` as well.
 */
export interface LedgerStore<T> extends Readable<T> {
  status: Readable<LedgerLoadStatus>;
}

/**
 * Creates a Svelte Readable store backed by the datom ledger: it runs `load`
 * once on subscribe, then re-runs it on every worker invalidation broadcast,
 * holding the last good value in between. This is the single scaffold behind the
 * query/projection/calorie stores — they differ only in the `load` they pass.
 *
 * The status transitions **once**, on the first load, and then only ever from
 * `failed` to `loaded`. A refresh that fails after a successful load leaves the
 * status `loaded`, because the value on screen is still real data that was
 * really read: `failed` means "there is nothing to show", not "something went
 * wrong". Failures reach `onError` either way, which is where a caller that
 * wants to report a stale refresh should look.
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
): LedgerStore<T> {
  // Outside `readable`, so it survives the subscriber count dropping to zero and
  // back: a store that has loaded once has loaded, whoever is watching.
  const status = writable<LedgerLoadStatus>("pending");

  const store = readable<T>(initial, (set) => {
    let live = true;

    async function refresh() {
      try {
        const value = await load();
        if (!live) return;
        set(value);
        status.set("loaded");
      } catch (err) {
        // Only the first load can fail into `failed`; after that the held value
        // is real and the status says so.
        if (live) status.update((s) => (s === "pending" ? "failed" : s));
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

  return {
    subscribe: store.subscribe,
    status: { subscribe: status.subscribe },
  };
}

/**
 * A live store over a read-only SELECT, re-run on each datom invalidation. Query
 * errors during startup races are swallowed; the store keeps its last value
 * (starting empty) and its `status` reports whether that empty is real.
 */
export function createQueryStore<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): LedgerStore<T[]> {
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
): LedgerStore<T> {
  return createLedgerStore<T>(
    () => dbClient.project<T>(pipeline, params),
    initialValue,
    (err) => console.error(`Projection error for pipeline ${pipeline}:`, err)
  );
}
