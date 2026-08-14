# How to add a new tracked domain

A tracked domain is a kind of thing the app records: food, media, physical items,
habits, calendar events. Adding one touches six layers in a fixed order. This is the
route; `CODING_STANDARDS.md` §2 is the rule it follows, and the acquisition domain
(`src/lib/acquisition/`, four small files) is the smallest complete example to read
alongside.

Work in this order. Each step depends on the one above it, and doing them out of
order is how logic ends up in the wrong layer.

## 1. Name it

Before any code, settle the vocabulary. Wrong names are the most expensive thing to
change later, because they end up in the ledger and the ledger is append-only.

1. Add the domain's terms to [CONTEXT.md](../CONTEXT.md), each with its `_Avoid_`
   line. If you cannot write the `_Avoid_` line, the concept is not distinct enough
   yet.
2. Pick an entity prefix (`widget:`) and an attribute namespace (`widget/`). Register
   both in [eavt-vocabulary.md](eavt-vocabulary.md), including what each prefix is
   seeded from.
3. Everything the ledger touches is **snake_case**, from the attribute key through to
   the Svelte store property. `widget/serial_number`, never `serialNumber`.

Prefixes are stable identity. `gtin:` means "keyed by barcode" forever, so a twin
minted under one prefix cannot be re-keyed under another without minting a new
entity.

## 2. Decide where the data comes from

Two paths, and they are not exclusive.

**Seeded from an outside source.** Write an `IngestionAdapter` and register it:

```ts
// src/lib/widgets/widget-source.ts
import { ingestionRegistry } from "../ingestion/registry";

export const widgetAdapter: IngestionAdapter<RawWidget> = {
  scheme: "widget", // matches entity ids beginning "widget:"
  fetch: (id) => fetchWidget(id), // network, isolated
  map: (raw) => ({
    // pure, no I/O
    entity: `widget:${raw.id}`,
    attributes: { "widget/name": raw.title },
  }),
};
ingestionRegistry.register(widgetAdapter);
```

`fetch` and `map` stay separate so the mapping is unit-testable without a network.
The registry attaches `twin/raw_provenance` itself; do not write it by hand. If the
source needs a browser-hostile request, it goes through the Cloudflare Worker proxy
([ADR-0007](adr/0007-serverless-proxy-and-metadata-fallback.md)), never direct.

**Authored locally.** Skip the adapter. Build the `EntityPayload` in a store helper
and hand it to `ingestEntity`.

## 3. Write the fold

`src/lib/widgets/state.ts` exports one pure function from datom rows to enriched
state. This is where the domain logic lives, and it is the only place it may live.

```ts
export function computeWidgetState(rows: DatomRow[]): EnrichedWidget[] {
  // group by entity, apply latest-wins per attribute in HLC order
}
```

Rules that are not negotiable:

- **Pure.** No `Date.now()`, no `Math.random()`, no I/O. It takes rows and returns
  state, so a test can pass a fixture and assert on the result.
- **Order by HLC, not `time`.** Rows arrive pre-ordered, but where the fold sorts,
  it sorts with `compareHlc`
  ([ADR-0020](adr/0020-logical-clock-ordering-over-wall-clock-key.md)).
- **No parameters.** The fold returns the full set for its kind. Date, slot, and
  range narrowing happen later, on the main thread
  ([ADR-0019](adr/0019-param-less-projections-with-main-thread-narrowing.md)).

## 4. Register the projection

Add an entry to `projections` in `src/lib/db/projections.ts`, pairing the SELECT that
pulls the input datoms with the fold that consumes them:

```ts
WIDGET_LIBRARY: {
  sql: inHlcOrder("entity LIKE 'widget:%' OR attribute LIKE 'widget/%'"),
  compute: computeWidgetState,
},
```

Scope by **entity prefix** when the entities are homogeneously named, and by
**attribute namespace** when they are not. Food does the latter because its twins
span `fdc:`, `gtin:`, `food:custom_`, and `recipe:`.

Nothing else changes in the worker. `db.worker.ts` is a thin dispatcher over this
map and stays that way
([ADR-0015](adr/0015-worker-side-eavt-projection-engine.md)).

## 5. Wire the store

`src/lib/stores/widgets.store.ts` holds reactivity and nothing else. No domain
logic here: if you are tempted to compute something, it belongs in step 3.

```ts
export const widgetLibraryStore = createProjectionStore<EnrichedWidget[]>(
  "WIDGET_LIBRARY",
  {},
  []
);
```

The store re-runs automatically when the worker broadcasts an invalidation after any
append ([ADR-0013](adr/0013-reactive-query-store-invalidation-bridge.md)), so you
never refresh it by hand.

Writes are separate exported functions that build datoms and call
`dbClient.append`. **Never** emit `UPDATE` or `DELETE`. A change is a later datom; an
undo is a cancelling fact. `Date.now()` and `Math.random()` belong here, in the write
helpers, where impurity enters the system deliberately.

## 6. Build the view

`src/lib/views/widgets/` subscribes to the store. Reach for the existing primitives
before writing anything new: `Card`, `Button`, `Badge`, `Meter`, `Segmented`,
`ToggleGroup`, `BottomSheet`, `Modal`. CONTEXT.md's "Interface primitives" section
lists what each is for and what not to build instead.

Keep screens decomposed. A view that grows past a few hundred lines splits into
sub-components ([ADR-0029](adr/0029-decompose-god-screens-into-sub-components.md)).

## 7. Test the fold, not the screen

Add `tests/unit/widgets-state.test.ts`. Because the fold is pure, the valuable tests
are fixture-in, state-out, and they need no database:

- latest-wins resolves correctly when two datoms touch one attribute
- an entity with no events still projects
- same-millisecond writes order deterministically by HLC counter

Run `pnpm test:unit`. Do not run Playwright as part of this loop; it is slow and it
rebuilds visual snapshots.

## 8. Write it down

- **Always:** the new prefixes and attributes in
  [eavt-vocabulary.md](eavt-vocabulary.md), and the new terms in CONTEXT.md. Do this
  in the same change, not afterwards.
- **If you made a non-obvious choice:** an ADR. Copy
  [adr/TEMPLATE.md](adr/TEMPLATE.md) and read [adr/README.md](adr/README.md) first.
  Adding a domain that follows this route is not itself a decision worth recording;
  deviating from it is.

## Before you open the PR

```bash
pnpm check && pnpm test:unit && pnpm lint:css && pnpm docs:check
```
