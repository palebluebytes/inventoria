# Core Architecture & Storage Layer

The application rejects traditional relational tables in favor of a single, immutable, append-only ledger. State is never mutated in-place.

## The Database Schema

Order and identity are a Hybrid Logical Clock, not the wall-clock `time`, per [ADR-0020](adr/0020-logical-clock-ordering-over-wall-clock-key.md). `time` is retained as the domain timestamp; latest-wins reads fold in HLC order.

```sql
CREATE TABLE datoms (
    entity TEXT NOT NULL,       -- Unique ID of the Twin, Habit, or Event
    attribute TEXT NOT NULL,    -- The property being declared (e.g., 'food/calories')
    value TEXT NOT NULL,        -- The payload (primitive or stringified JSON)
    time INTEGER NOT NULL,      -- Domain timestamp (Unix ms), e.g. when a user confirmed
    hlc_ms INTEGER NOT NULL,    -- HLC physical component (Unix ms)
    hlc_ctr INTEGER NOT NULL,   -- HLC logical counter (same-ms tiebreak / causality)
    device_id TEXT NOT NULL,    -- Originating device, for a deterministic total order
    PRIMARY KEY (entity, attribute, hlc_ms, hlc_ctr, device_id)
) WITHOUT ROWID;

CREATE INDEX idx_eav ON datoms (entity, attribute, hlc_ms, hlc_ctr, device_id);
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

## Ingestion & External Data

While the primary architecture is offline-first, users can ingest external data (like e-commerce products) to generate local entities. To bypass browser CORS constraints and strict e-commerce payload limitations, the application relies on a lightweight serverless proxy architecture. See [ADR-0007: Serverless Proxy and Metadata Fallback](adr/0007-serverless-proxy-and-metadata-fallback.md) for full context on these design constraints.
