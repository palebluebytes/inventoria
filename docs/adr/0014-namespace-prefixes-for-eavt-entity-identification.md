# 14. Namespace Prefixes for EAVT Entity Identification

Date: 2026-06-22

## Status

Accepted

## Context

Inventoria uses a flat EAVT (Entity, Attribute, Value, Time) ledger to store all application state. Because the application is local-first and supports offline synchronization, entity identification must be fully decentralized and deterministic. If a user on Device A and a user on Device B both scan the identical Amazon product barcode while offline, the system must independently generate the exact same entity identifier so that their datoms merge cleanly upon sync.

Without a centralized relational database to issue auto-incrementing integers, we must rely on client-side ID generation.

## Decision

We have adopted a URN-style prefix namespace strategy for the `entity` column. Every entity identifier must be prefixed with its domain or type, followed by its unique identifier.

Common namespaces include:

- `asin:<id>` for Amazon products.
- `isbn:<id>`, `gtin:<id>`, `sku:<id>` for physical barcodes.
- `tmdb:movie_<id>`, `openlibrary:<id>` for external media twins.
- `habit:<uuid>` for user-generated habits.
- `cal_event:<uuid>` for calendar appointments.
- `url:<hash>` for generic web links that lack standardized identifiers.

## Consequences

- **Positives:**
  - **Deterministic Offline Merging:** Multiple devices resolving the same ASIN will independently construct the same `asin:123` entity string, allowing their datoms to merge perfectly without a coordinator.
  - **Human Readable:** The raw SQLite database remains highly debuggable and readable without requiring alias resolution tables or deciphering UUIDv5 hashes.
  - **Schema Simplicity:** Avoids expanding the rigid 4-column EAVT schema (e.g. adding an explicit `Type` column) and maintains standard Semantic Web (RDF) design principles.
- **Negatives:**
  - **Identity Aliasing:** If a physical item possesses multiple valid identifiers (e.g. an ASIN and an ISBN), the UI must pick one as the canonical identifier. If different identifiers are used sequentially for the same physical object, duplicate twin entities are created. Resolving this requires future support for a `twin/same_as` attribute to bridge the distinct entities.
