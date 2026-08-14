# 16. Declarative Ingestion Registry and Provenance Storage

**Status:** Accepted  
**Implemented:** `src/lib/ingestion/registry.ts`, `twin/raw_provenance`

Date: 2026-06-22

## Context

Inventoria tracks physical items and digital media by pulling metadata from external APIs (e.g., OpenLibrary, TMDB) and scraping web schemas. Historically, the network requests (`fetch`) were tightly coupled to the JSON-to-EAVT mapping logic, scattered across files like `tmdb.ts` and `open-library.ts`.

As we anticipate ingesting more data types (board games, Spotify, etc.) and complying with emerging semantic standards like the EU Digital Product Passport (DPP), we faced two questions:

1. How do we cleanly scale the API ingestion logic without splintering the codebase?
2. If schema standards change in the future, how do we remap historical data if we've already destructively transformed the original API responses into our flat EAVT format?

## Decision

We chose to implement a **Declarative Ingestion Registry** utilizing the Ports & Adapters pattern.

1. **Strict Decoupling:** Internally, the registry enforces strict `Fetcher` and `Mapper` interfaces. External modules are tested in isolation by passing mock JSON to the `Mapper` without invoking the `Fetcher`. The UI interacts only with a generic `Registry.resolve(input)` interface.
2. **Immutable Provenance Storage:** Whenever an adapter successfully fetches from an external API, the `Mapper` yields the parsed `EntityPayload`, but it also creates an immutable `Provenance` datom (containing the raw JSON API response, the extraction timestamp, and the adapter version).
3. **Manual Refresh Boundary:** We strictly prohibit the PWA from automatically crawling APIs in the background to refresh metadata. Updating a Digital Twin's provenance is exclusively a user-initiated action to respect rate limits, save battery, and uphold local-first principles.

## Consequences

- OPFS disk space usage will increase because we are storing raw, potentially bloated JSON responses (Provenance) alongside the normalized EAVT attributes.
- The codebase gains a robust "Anti-Corruption Layer," guaranteeing that messy, proprietary API formats cannot leak into the UI components.
- If legislation or schema standards evolve, we possess the cryptographically undeniable history needed to write a script that safely remaps all historical Provenance blobs into new datom attributes without making a single network request.
