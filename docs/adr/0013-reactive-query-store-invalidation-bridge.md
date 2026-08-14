# 13. Reactive Query Store Invalidation Bridge

**Status:** Accepted  
**Implemented:** `src/lib/stores/datoms.store.ts`

Date: 2026-06-22

## Context

Inventoria uses Svelte's reactive model to automatically update UI screens when state changes. However, SQLite WASM runs inside a dedicated Web Worker to prevent database I/O from blocking the main rendering thread. This introduces an architectural challenge: Svelte's reactivity expects synchronous state updates, while communication across the main thread and the Web Worker (via `postMessage`) is strictly asynchronous.

Furthermore, we need to ensure that when a write occurs (e.g. logging a habit execution or adding a food item), all relevant read queries update automatically without requiring manual callback wiring inside components.

## Decision

We bridge Svelte's reactivity and the asynchronous Web Worker thread using a custom Query Store Invalidation mechanism:

1. **Async Query Store (`createQueryStore`):** We wrap Svelte's native `readable` store. Upon subscription, the store immediately triggers an asynchronous SQL SELECT query through the `dbClient` RPC bridge.
2. **Ledger Mutation Broadcasts:** When new datoms are appended inside `db.worker.ts`, the database transaction commits. Upon a successful commit, the worker broadcasts a `broadcast_invalidation` message to the main thread, carrying the list of altered attributes.
3. **Re-Query Trigger:** The client-side `dbClient` registers an `onInvalidate` callback listener. The active query stores subscribe to this invalidation listener. When notified of an invalidation, the stores trigger an asynchronous re-fetch (`refresh()`), updating the store's value once the database returns the query results.

## Consequences

- **Positives:**
  - **Clean UI Code:** Svelte components simply use standard Svelte reactivity (e.g. `$habits`) without manual loading, refreshing, or polling logic.
  - **Single Source of Truth:** All mutations flow through the append-only ledger worker, ensuring the UI is always a projection of the current database state.
- **Negatives:**
  - **Query Storm Risk:** In its current form, any mutation causes all subscribed query stores to re-run their SQL queries. For screens with many active queries or during batch insertions, this can cause a burst of message passing and database queries.
  - **Race Conditions:** Requires silent handling of query exceptions during startup sequences when query stores might try to execute before the worker database connection is fully active.
