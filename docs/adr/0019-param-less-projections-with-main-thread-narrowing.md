# ADR 0019: Projections Stay Param-less; Narrowing Is a Main-Thread Concern

**Status:** Accepted  
**Implemented:** `src/lib/db/projections.ts` (no params field)

## Context

ADR-0015 established the worker-side projection engine: a named projection pairs
a static `SELECT` over the `datoms` ledger with a pure `compute(rows)` fold, run
inside the worker on every invalidation, returning the full folded snapshot to a
`createProjectionStore`. The two original projections (`MEDIA_LIBRARY`,
`ACQUISITION_LIBRARY`) each project **every** entity of their kind; the UI
narrows client-side.

Three stores never adopted this shape. `habits.store`, `cal_events.store`, and
`calorie.store` each reimplement the query → group-by-entity → JSON-parse → map
dance inside a `readable` closure, so the folds — habit-lineage building, streak
and score, occurrence lookup, the consumption twin-join — sit in untestable
closures rather than pure functions. Folding them onto the projection seam
raises a question the two original projections never had to answer, because one
of the three is **parameterized**: `calorie.store` is created per-selected-date
(`createCalorieTrackerStore(date)`) and issues a narrow `time BETWEEN ?` query
for that day.

So: when a projection's input depends on a runtime parameter (the selected day,
a slot, a range), does the parameter belong **in the projection** or **in the
UI**?

Two options were considered:

1. **Extend `project()` with params.** Thread a params object through the worker
   `project` message (today it is accepted by `db.client` but ignored by
   `db.worker`) into a projection whose SQL is a function of those params. The
   per-day consumption query stays narrow.
2. **Keep projections param-less; narrow on the main thread.** Every projection
   returns its full enriched entity set with no parameter. A single global
   `consumptionStore` projects all Consumption Events (joined to their food and
   recipe twins in `compute`, exactly as `MEDIA_LIBRARY` joins events to twins);
   `DailyDashboard` filters that list to the selected day with a `$derived`.

## Decision

We chose **param-less projections (Option 2)** and adopt it as a standing
invariant for the projection engine:

- **A projection takes no runtime parameters.** Its `SELECT` is static and it
  returns the full enriched set for its kind. Date, slot, and range narrowing
  are main-thread concerns, expressed as Svelte `$derived` over the projected
  value.
- Projections scope their `SELECT` by **entity prefix** where the entities are
  cleanly namespaced (`habit:`, `event:execute_`, `cal_event:`, `event:occur_`,
  `event:consume_`, `food:`, `recipe:`), pulling only their own entity families.
  `MEDIA_LIBRARY`/`ACQUISITION_LIBRARY` keep attribute-prefix scoping because
  their twins (`tmdb:…`, `isbn:…`) share no common entity prefix to scope by.
- A projection whose fold yields more than one collection returns them together
  (e.g. `CAL_EVENTS` returns `{ blueprints, occurrences }`), so one invalidation
  drives one refresh and one `postMessage`. Imperative per-date getters are
  replaced by pure lookups over the returned arrays.

We explicitly rejected extending `project()` with params for now. It would make
projection SQL param-dependent, add a cache key per parameter value, and
fragment the uniform "project everything, UI narrows" shape that ADR-0015
already established for media and acquisition.

## Consequences

- **One uniform store shape.** All five reactive stores collapse to a
  `createProjectionStore` line over a pure `compute…State(datoms)` fold in a
  sibling `<domain>/state.ts`, testable datoms-in/state-out with no `dbClient`
  mock — the shape ADR-0015 introduced now covers habits, calendar events, and
  consumption too.
- **`db.worker`'s `project` handler stays param-less.** The engine is untouched;
  no per-parameter dispatch or cache to reason about.
- **Full history is projected into memory.** `consumptionStore` folds all
  Consumption Events, not one day's. This is acceptable at ADR-0015's stated
  scale (under 5,000 entities) and shares that ADR's escape hatch: if
  consumption history ever dominates memory or `postMessage` cost, extending
  `project()` with params — or the CQRS read-model pivot ADR-0015 documents — is
  the sanctioned path. This decision does not foreclose it; it defers it until
  scale justifies the added surface.
- **Latent bugs concentrate and get fixed at the fold.** Moving occurrence
  lookup into a pure function let us align its date bucketing to **local** time,
  matching Habit day math (`toLocalDateStr`) and removing a UTC/local
  disagreement that the old imperative getter carried.
- **Relationship to ADR-0013's query storm.** This ADR does not address the
  storm (every append still re-runs every store); attribute-aware invalidation
  remains future work. But by giving every store the same scaffold, it provides
  the single place such a filter would later hang.
