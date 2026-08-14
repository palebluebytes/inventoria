# 14. Namespace Prefixes for EAVT Entity Identification

**Status:** Accepted  
**Implemented:** `gtin:` / `fdc:` / `tmdb:` and the rest; the live registry is [docs/eavt-vocabulary.md](../eavt-vocabulary.md)

Date: 2026-06-22

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

## Amendment (2026-08-14): the registry moved, the decision did not

The decision above, that entities are identified by a namespaced colon-prefix, is
unchanged and has never been revisited.

The **list** of prefixes has, repeatedly. It grows every time the project tracks
something new, and keeping a growing list inside a fixed decision record guaranteed
drift: by 2026-08 this ADR was missing `fdc:`, `food:custom_`, `recipe:`,
`tmdb:tv_`, `twin:`, and the five `event:*` prefixes, while still listing `asin:`,
`sku:`, `openlibrary:`, and `url:<hash>`, which the shipped code does not use.

The live registry is now [docs/eavt-vocabulary.md](../eavt-vocabulary.md), which
also records what each prefix is seeded from. Add new prefixes there, not here.
