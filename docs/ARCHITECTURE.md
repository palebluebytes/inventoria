# Core Architecture & Storage Layer

The application rejects traditional relational tables in favor of a single, immutable, append-only ledger. State is never mutated in-place.

## The Database Schema

```sql
CREATE TABLE datoms (
    entity TEXT NOT NULL,       -- Unique ID of the Twin, Habit, or Event
    attribute TEXT NOT NULL,    -- The property being declared (e.g., 'food/calories')
    value TEXT NOT NULL,        -- The payload (primitive or stringified JSON)
    time INTEGER NOT NULL,      -- Unix millisecond timestamp (T)
    PRIMARY KEY (entity, attribute, time)
) WITHOUT ROWID;

CREATE INDEX idx_eav ON datoms (entity, attribute, time);
CREATE INDEX idx_ave ON datoms (attribute, value, entity);
```

## Worker Thread & Persistence

SQLite WASM Layer: Instantiated strictly inside a background Web Worker utilizing the browser's Origin Private File System (OPFS) for persistent, high-performance binary storage.

Communication Protocol: The main thread communicates with the SQLite Worker via an asynchronous RPC layer.

## Reactive UI Strategy (Svelte Binding)

Because data consists of flat, time-ordered EAVT rows, Svelte components do not bind directly to raw table states.

The Flow: Components subscribe to custom Svelte stores that expose query interfaces to the Web Worker.

Invalidation: When the Web Worker appends a new datom, it broadcasts a lightweight message to the main thread, triggering the active Svelte stores to re-evaluate their queries asynchronously.

```sql
-- Example multi-hop aggregation executed via the Worker
SELECT sum(json_extract(value, '$.quantity')) as total_volume
FROM datoms
WHERE attribute = 'event/details'
  AND json_extract(value, '$.type') = 'ExerciseAction'
  AND json_extract(value, '$.instrument_id') = 'twin:kettlebell_16kg';
```
