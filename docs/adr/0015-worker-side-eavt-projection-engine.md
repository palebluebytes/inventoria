# 15. Worker-Side EAVT Projection Engine

Date: 2026-06-22

## Status

Accepted

## Context

The UI Svelte stores were previously querying raw EAVT `datoms` and running heavy $O(N)$ chronological folding algorithms on the main thread whenever a new event was appended. This risked UI jank when dealing with thousands of Digital Twins or long Habit Lineages.

We had two primary alternatives to fix this:

1. **CQRS SQLite Read Models:** Upsert the folded state synchronously into native SQLite tables inside the worker during the `append` transaction. Svelte stores would issue paginated `LIMIT` queries directly against these read models.
2. **Worker RPC Projection:** Keep SQLite purely as an event store, but move the JS folding loops into the web worker. The worker executes the loops on invalidation and passes the full array of enriched entities back to Svelte over `postMessage`.

## Decision

We chose **Worker RPC Projection (Option 2)**.

We introduced a named projection bridge (`createProjectionStore`) where the worker parses the datoms and runs `computeMediaLibraryState` and `computeAcquisitionState` internally, sending only the final folded snapshot to Svelte stores.

We explicitly rejected the CQRS approach for now because the serialization cost over `postMessage` is currently negligible for the scale of tracked entities (under 5,000). The CQRS approach introduces schema migration burdens, data duplication on disk, and complex UI pagination state that the current application scale does not justify.

## Consequences

- The main UI thread is entirely freed from EAVT timeline folding mathematics.
- Svelte stores are drastically simplified, dropping from 100+ lines of custom mapping to 3-line `createProjectionStore` declarations.
- **Future Development Note:** If the user ever tracks 10,000+ entities and we observe `postMessage` serialization bottlenecks, we have documented the blueprint to pivot to the CQRS SQLite Read Models approach as the designated scaling path.
