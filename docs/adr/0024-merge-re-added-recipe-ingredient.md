# ADR 0024: Re-adding a food already in a recipe merges into its row; cross-unit collisions are blocked

**Status:** Accepted; implemented (issue #14, `addOrMergeIngredient` in `recipe-ingredient.ts`).
**Date:** 2026-07-27

## Context

The shared `IngredientListEditor` (the ingredient surface behind both the recipe
builder — Consolidate/Define — and the instantiation editor — Instantiate/Correct,
ADR-0022) let a user **Add ingredient** a food that was already an ingredient of
the current recipe. The add silently failed: the sheet stayed open and the
ingredient was not added (issue #14).

The cause is structural, not cosmetic. The list is **entity-keyed** end to end:
the render loop is `{#each ingredients as … (entity)}`, `removeIngredient`
filters by `entity`, and the panel/name resolvers (`panelFromIngredients`,
`nameFromIngredients`) `find` by `entity`. Appending a second row for the same
twin produces a **duplicate key**, which throws during Svelte's render flush and
aborts before `showAdd = false` settles — so the sheet never closes and the
change doesn't stick. The old plain amount input hit the same path; the
numeric+slider control of ADR-0023 did not introduce it.

The issue framed a genuine **design decision** among three options:

- **Merge** the re-add into the existing row (sum the amounts);
- **Block** the re-add with a message; or
- **Allow duplicates** by keying each row on a stable per-line id instead of
  `entity`.

## Decision

**Re-adding a food folds its `amount` into the existing row. When that row uses
an incompatible unit, the add is blocked with a reason instead.**

> **One row per twin.** A recipe references each ingredient once; re-adding it
> adjusts how much, it doesn't mint a second reference.

A single pure helper, `addOrMergeIngredient(ingredients, incoming)`, owns the
rule and returns a discriminated `IngredientAddition`:

- **New twin ⇒ append.** No existing row references it — add it at the end.
- **Same twin, same unit ⇒ merge.** Sum `incoming.amount` into the existing
  row **in place** (position preserved), keeping its `entity`/`payload`/`name`
  and discarding the incoming snapshot. Amounts funnel through the shared
  `coerceAmount` so a transiently-empty inline field can't poison the sum.
- **Same twin, incompatible unit ⇒ block.** `g` and `serving` are not summable
  without a serving-size conversion, so the helper returns
  `{ ok: false, reason: "unit_mismatch", name }` rather than silently coercing.
  The editor turns that into a message and the add sheet stays open to show it.

**Merge was chosen over the alternatives because it is the only option that
preserves the entity-keyed single-source model** (ADR-0021 rows-derive-from-panel,
ADR-0022 snapshot-on-write) with no cross-cutting change:

- **Allow-duplicates** would have to thread a per-line id through the each-key,
  `removeIngredient`, and both resolvers — across a component now shared by two
  surfaces — and would show two identical rows for one twin. Large blast radius,
  worse UX.
- **Merge-across-units** (converting `serving` ↔ `g` via `serving_size`) adds a
  lossy conversion on a rare collision; blocking is safe and honest.
- **Block-always** is simpler but needlessly refuses the common, obviously-correct
  same-unit case (add 50 g oats to a recipe that already has 50 g oats → 100 g).

The unit-mismatch block is a real, reachable case, not defensive dead code:
`ingredientFromFood` always mints `unit: "g"`, while `parseLoggedQuantity` seeds
`unit: "serving"` from a logged whole-serving event — so a food seeded whole and
then searched-in by gram hits it.

## Consequences

- The rule is a **pure, unit-tested helper** (`addOrMergeIngredient`, beside
  `recipe-nutrition`), not logic inlined in the component. The fix lands in
  **both** consuming surfaces (`RecipeModal`, `InstantiationSheet`) at once,
  since both go through `IngredientListEditor`.
- `AddIngredientSheet.onAdd` now returns an `IngredientAddOutcome`
  (`{ ok, message? }`) so the sheet can surface a blocked add and stay open,
  rather than assuming every tap succeeds and silently dropping it.
- Covered by a Seam 1 unit test (append / merge / non-numeric coercion / block)
  and a Seam 3 e2e (re-add an existing food → sheet closes, one row, folded to
  100 g, total updated).
- **Deferred:** an e2e for the block path (the unit-mismatch fixture — a
  whole-serving seed re-added by gram — is unit-tested; the sheet plumbing is
  trivial and typechecked). If a same-twin unit clash ever becomes common, revisit
  a `serving_size`-based conversion instead of the block.
