# 1. SQLite WASM in OPFS with Append-Only Ledger and Worker Isolation

**Status:** Accepted  
**Implemented:** `src/lib/db/db.core.ts`, `src/lib/db/db.worker.ts`

We are building a local-first application using Svelte and SQLite. Instead of a standard relational database with mutable tables, we store all states as an append-only chronological log of EAVT (Entity, Attribute, Value, Time) datoms. To avoid blocking the browser's UI thread during complex queries and ledger ingestion, we isolate all SQLite execution inside a dedicated background Web Worker, using a lightweight asynchronous RPC layer for communication and broadcasting state invalidation messages to reactive Svelte stores.

## Considered Options

- **Mutable Relational Tables on Main Thread:** Easy to implement initially, but blocks the UI during queries and runs contrary to local-first sync requirements.
- **IndexedDB (e.g. Dexie.js):** Standard browser solution, but lacks SQL's query power and multi-hop aggregation efficiency required for EAVT queries.
- **SQLite WASM in Web Worker with OPFS (Selected):** Unlocks persistent high-performance storage via the Origin Private File System, keeps the main thread responsive, and supports SQL-based EAVT queries.
