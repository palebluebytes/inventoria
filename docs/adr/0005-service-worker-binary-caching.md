# 5. Service Worker Binary Caching for Digital Twin Images

We need to support offline visual tracking of physical Digital Twins by caching external images locally. Rather than fetching and base64-encoding images into the immutable Ledger (which would dramatically bloat the database and impact RPC query performance over the worker thread), we delegate dynamic binary storage to the browser's Cache Storage API via Service Worker Runtime Caching.

## Status

Accepted

## Considered Options

- **Base64 / Blob Storage inside Ledger:** Keeps data fully contained in the SQLite database for replication, but introduces massive size overhead, query latency, and complex serialization.
- **Service Worker Runtime Caching via Workbox (Selected):** Automatically intercepts cross-origin image requests using a `CacheFirst` strategy. Caches external images locally with sensible size/expiration limits (500 items / 30 days) to prevent storage bloat while maintaining offline availability.
