# ADR 0018: Notes & Checklist as a CRDT Op-Log in the Ledger

**Status:** Accepted
**Date:** 2026-06-24

## Context

A new tab introduces two user-authored, free-form concepts that did not exist
in the domain before (see `CONTEXT.md`):

- **Checklist / Checklist Item** — an unscheduled scratchpad list of manually
  ticked items. It is **not** an Agenda obligation: no Schedule Rule, no
  tracking, no streak, and ticking an item produces no Execution or Occurrence
  Event. It is deliberately distinct from the Agenda's Habit Blueprints and
  Compliance Events, which already own the meaning "things I must do today".
- **Note** — a titled entry whose **body must merge concurrent edits from
  multiple devices without conflict** (character-level), a requirement the
  ledger's last-write-wins-per-attribute model cannot satisfy.

The multi-device merge requirement is the forcing function. It pulls in a
sequence CRDT (`loro-crdt`), which raises the central question: how does a
self-contained CRDT coexist with the append-only EAVT **Ledger** (ADR-0001),
whose every row is supposed to be a single immutable **fact**?

Three options were considered:

1. **Decompose into datoms.** Model Checklist Items and Note metadata as
   ordinary facts (`item/text`, `item/status`, …) and use a CRDT only for Note
   bodies. Keeps everything SQL-projectable and uniform with the rest of the
   app, but the data has no factual/queryable role: a Checklist Item is
   explicitly never queried, aggregated, cross-linked, or surfaced on the
   Agenda. Decomposition would buy queryability the feature does not want, at
   the cost of two persistence mechanisms inside one feature.
2. **CRDT op-log in the Ledger (chosen).** Treat the whole feature as one Loro
   document and persist it as an append-only stream of operation deltas inside
   the existing `datoms` table.
3. **Separate CRDT context.** Keep Loro entirely out of the Ledger with its own
   OPFS persistence and Loro-native sync. Conceptually cleanest, but introduces
   a second persistence path and — critically — a **second sync channel**,
   forfeiting the "rides the ledger for free" benefit that ADR-0014's
   deterministic-ID offline-sync plan already provides.

A naive first cut stored the entire Loro document as a single base64
**snapshot** datom, read back with `ORDER BY time DESC LIMIT 1`. This is a
latent multi-device **data-loss bug**: once two devices each append a snapshot
and sync (ADR-0014), the ledger's last-write-wins-by-`time` resolution discards
the older snapshot wholesale, _before_ Loro is ever given the chance to merge
the two. Last-write-wins sitting above a CRDT defeats the CRDT.

## Decision

Adopt **Option 2: a CRDT op-log in the Ledger**, scoped as a self-contained
scratchpad that is conceptually walled off from the facts domain.

- **Source of truth.** One `LoroDoc` holds the Checklist (a movable list) and
  the Notes (titled entries with nested `LoroText` bodies). The document — not
  decomposed datoms — is the source of truth for this feature. Pure CRDT logic
  lives in `src/lib/notes/loro-doc.ts`; the ledger/Svelte bridge lives in
  `src/lib/stores/notes.store.svelte.ts`.

- **Persistence is an append-only op-log, not a snapshot.** Each local change
  appends one immutable datom carrying a Loro **update delta**:
  - entity `notes:doc` (singleton), attribute `notes/op`, value = base64 of
    `doc.export({ mode: "update", from: lastPersistedVersion })`, `time` = now.
  - The `(entity, attribute, time)` primary key is protected by a monotonic
    `time` guard; the store tracks `lastPersistedVersion` so each append carries
    only new ops.

- **State is derived by replaying the log.** On load, read **all** `notes/op`
  datoms and `doc.import` each. Loro operations are commutative, so importing
  every device's deltas (rather than taking the latest) produces a correct
  merge. This restores the Ledger's "current state is derived by replaying the
  historical log" principle — replay here means CRDT import rather than SQL
  fold.

- **Deliberately bypasses the projection engine (ADR-0015).** The feature is
  opaque to SQL projections by design. Its live UI signal is Loro's own
  `doc.subscribe`, not a `createProjectionStore`. The Ledger provides only
  durable persistence; the invalidation broadcast is intra-tab (no
  `BroadcastChannel`), so it plays no role here.

- **Compaction is deferred.** The op-log grows unbounded, but a personal
  scratchpad emits tiny deltas. Because the Ledger is append-only, adding
  snapshot-based compaction later requires **no migration** (begin appending
  snapshot + watermark datoms; old ops remain importable). Revisit when a single
  document's op count exceeds roughly 500.

## Consequences

**Positive:**

- **One sync channel.** Notes and Checklist ride the native datom replication of
  ADR-0014's offline-sync plan; there is no second sync mechanism to build.
- **Correct multi-device merge.** Importing all deltas is conflict-free; the
  snapshot + last-write-wins data-loss bug is structurally avoided.
- **Clean domain language.** The Checklist/Note vocabulary is explicitly
  separated from Agenda obligations, preventing the "to-do" collision.

**Negative / Trade-offs:**

- **Opaque rows in a facts ledger.** Not every row in `datoms` is now a single
  fact — `notes/op` rows are opaque CRDT deltas. This is a scoped, documented
  exception to the **Datom** definition, justified solely by the sequence-merge
  requirement. It is confined to one feature under the `notes:` namespace.
- **Not SQL-queryable.** Checklist Items and Notes cannot be filtered,
  aggregated, or cross-linked in SQL. This is acceptable only because the
  feature has no such requirement; any future need to query this data would
  force reconsideration of Option 1.
- **Unbounded growth until compaction** is implemented (mitigated as above).
- **Build weight.** Pulls in the ~3.1 MB Loro WASM and a Vite/Vitest dual-build
  configuration (the package's `development` export resolves to a bundler build
  Vite's dev server cannot load; the app is aliased to the `browser` build while
  tests stay on the Node build).
