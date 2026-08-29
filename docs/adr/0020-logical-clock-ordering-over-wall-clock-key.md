# ADR 0020: Order Datoms by a Conflict-Free Logical Clock, Not a Bare Wall-Clock Key

**Status:** Accepted  
**Amended by:** [ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) §8 (advance-on-receive gets the live peer this record was built for, and this record's "not yet wired to any sync transport" is corrected: it has run on every ledger import since ADR-0067)  
**Amended by:** [ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §7 (advance-on-receive is deliberately **not** called against another person's payload, which is restamped instead)  
**Implemented:** 2026-07-06, `0568955`, `src/lib/db/hlc.ts`

## Context

The ledger keys and orders datoms by wall-clock `time` (Unix milliseconds). The
`datoms` table declares `PRIMARY KEY (entity, attribute, time)`, and current
state is read by folding an entity's datoms in `time` order and letting the
latest value for each attribute win (ADR-0015, ADR-0019).

The datom model derives from Rich Hickey's Datomic but diverges deliberately.
Datomic orders facts by a monotonic **transaction id** and removes them with an
explicit **retraction** operation. Inventoria orders by wall-clock time and
resolves reads by latest-wins, with domain-specific cancelling facts (an
`uncompleted` Execution Event) standing in for retraction.

Using wall-clock time as both the ordering key and part of datom identity has
two weaknesses. Both are latent in single-user use and become sharp under the
planned multi-device sync, which ADR-0014 already designs entity IDs to support
(deterministic IDs so two devices' datoms "merge cleanly upon sync"):

1. **Ordering ambiguity under clock skew.** Latest-wins is only correct if two
   datoms are reliably ordered. Skewed device clocks can invert the real causal
   order, so a merge can pick the wrong winner.
2. **Collision on the primary key.** Two datoms for the same `(entity, attribute)`
   written in the same millisecond collide on `PRIMARY KEY (entity, attribute,
time)`, and one is rejected. Rare for a single user, more likely under batch
   imports and sync merges.

This is not hypothetical. ADR-0018 records that last-write-wins-by-`time`
already discards the older of two synced Note snapshots wholesale, before any
merge can run, which is why that feature had to adopt a CRDT.

The tempting fix is to adopt Datomic's fuller model wholesale. Three options
were considered:

1. **Keep the bare wall-clock key.** Simplest, and adequate for a single online
   device. It leaves the ordering and collision hazards in place for the sync
   work to trip over, exactly as ADR-0018 already did.
2. **Adopt Datomic's full model:** reified transaction entities, an add/retract
   `Op` flag with retraction-aware reads, the covering index tuples (AEVT, AVET,
   VAET) on top of EAVT, and bitemporal `as-of`/`since` history. Uniform and
   powerful, but heavy for a single-writer-per-device, browser-embedded,
   OPFS/SQLite-WASM ledger at ADR-0015's scale (under ~5,000 entities). It
   multiplies index storage and write amplification inside a quota-bound OPFS
   sandbox, pushes retraction reconciliation onto the pure projection folds that
   ADR-0019 kept simple, sets a second mental model against the plain E-A-V-T
   seam, and front-loads lock-in on the hardest-to-reverse part of the system
   against a future shape that has not been validated.
3. **Keep the minimal model and borrow only the ordering property.** Retain the
   four-field E-A-V-T datom and latest-wins reads, but replace bare wall-clock
   `time` as the ordering and identity key with a conflict-free logical clock.

## Decision

We chose **Option 3**.

- **Datoms carry a hybrid logical clock (HLC) as their order and identity.**
  Each datom stores `(physical_ms, logical_counter, device_id)`. The pair
  `(physical_ms, logical_counter)` is a standard HLC: on a local write the
  physical component tracks wall-clock milliseconds and the logical counter
  breaks same-millisecond ties; on receiving remote datoms during sync a device
  advances its clock to the maximum it has seen. That advance-on-receive rule
  preserves causality, so a write made after observing a remote edit always
  orders after it, whichever device's wall clock is faster. `device_id` gives a
  deterministic tiebreak between genuinely concurrent writes, yielding one total
  order every device computes identically.
- **The naive tuple is the documented fallback.** If the advance-on-receive
  coupling proves not worth its cost during the sync build,
  `(physical_ms, device_id, counter)` with a purely local counter is the
  step-down: it keeps deterministic convergence and collision-freedom but drops
  causal correctness under clock skew.
- **Latest-wins is defined against the logical order, not raw wall-clock time.**
  The projection folds are unchanged in shape (ADR-0019); only the comparator
  they sort by changes.
- **Datom identity gains a per-device tiebreaker,** so two same-millisecond
  writes no longer collide on the primary key.
- **Wall-clock time is retained as human-facing metadata,** and the domain
  meaning of `time` (for example, the millisecond a user confirmed an Occurrence
  Event) is unchanged. This ADR governs ordering and identity, not domain
  timestamps.

We **explicitly reject the fuller machinery** as standing scope. Reified
transactions, a general add/retract `Op`, the extra covering indexes, and
bitemporal history are each deferred until a concrete feature demands that
specific piece: retraction only if an attribute must be cleared rather than
overwritten; extra indexes only when a measured query is slow; history queries
only when a feature reads the past. Concurrent-edit merge remains a CRDT concern
(ADR-0018), orthogonal to this decision.

**Implemented 2026-07-06** (commit `0568955`): the primary key and the projection
folds carry the HLC, with a legacy-to-HLC migration and a per-device id in a
`meta` table. The advance-on-receive path exists but is not yet wired to any
sync transport, since none exists; that wiring lands with the V2 sync work.

## Consequences

- **The sync data-loss edge closes.** Ordering becomes well-defined across
  devices and same-millisecond collisions disappear, removing the class of bug
  ADR-0018 ran into rather than papering over it per feature.
- **The minimal model is preserved.** Projections stay pure `compute(datoms)`
  folds; the read path grows no retraction reconciliation. The change is a
  comparator and a key, not a new data model.
- **Cost stays proportional.** No covering-index storage multiplication in OPFS;
  a logical clock is a few bytes per datom.
- **A one-time migration is required.** The primary key moves from `(entity,
attribute, time)` to `(entity, attribute, physical_ms, logical_counter,
device_id)`, and folds order by the HLC. State is re-derived from the log, so
  this is a backfill, not a reinterpretation of past facts.
- **LLM-legibility is protected.** The log stays a uniform E-A-V-T stream. A
  logical clock is a monotonic key, not a new concept graph, so the history
  remains easy to read in order.
- **The divergence from Datomic is now deliberate and recorded.** Inventoria
  orders by a logical clock and removes via cancelling facts by choice, and the
  documentation can say so rather than presenting wall-clock time as an oversight.
- **The rejected paths remain open.** This ADR's fuller machinery and ADR-0015's
  CQRS read-model pivot are documented options, reopenable if scale or a specific
  feature later justifies them.
