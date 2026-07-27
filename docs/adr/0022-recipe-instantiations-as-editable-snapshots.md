# ADR 0022: Recipes are templates; each logging is an editable instantiation snapshot

**Status:** Accepted; not yet implemented (specced 2026-07-27, this ADR). Extends
and revises the read-path stance of ADR-0021.
**Date:** 2026-07-27

## Context

ADR-0021 made a recipe a **schema.org/Recipe** whose `recipe/ingredients` are
pure references `{ ref, amount, unit }` and whose per-serving macros are
**derived, never stored** — the ingredient food twins are the single source of
truth. Logging a recipe writes a Consumption Event that freezes a headline macro
snapshot into `event/metrics`, so template edits never rewrite logged history.

That model treats a logged recipe as a thin pointer at the template plus a frozen
headline. Two problems surfaced once we looked at how people actually use it:

- **Split-brain read path.** `consumption-state.ts` freezes the headline
  (`event/metrics`) but reads the _ingredient breakdown_ **live from the current
  template** (`event.ingredients = t.ingredients`) and re-derives a live
  `recipe_nutrition` on every read. So a logged meal's total is frozen while its
  breakdown floats — the two can disagree, and correcting or deleting an
  ingredient twin silently rewrites the breakdown of a meal already eaten.
  (Today this is invisible only because no view reads those fields yet.)
- **No per-occasion divergence or history.** A recipe is a **template** you cook
  again and again, tweaking it each time — 60 g of avocado today, skip the chili,
  a double batch on Sunday. The model had nowhere to record "what I actually made
  _this_ time" as distinct from the template, and no first-class history of the
  occasions a template was cooked.

Users think of a recipe the way they think of a food: a reusable identity (the
**twin**) plus the individual times they consumed it (the **instantiations**).
The Consumption Event already targets "any twin (gtin, fdc, custom, recipe)", so
the skeleton is present — it just carries too little.

## Decision

**1. Split the recipe into a Template and an Instantiation** (see `CONTEXT.md`).
A **Recipe Twin** is a reusable _template/default_. A **Recipe Instantiation** is
a Consumption Event whose target is that twin, recording one occasion of cooking
or eating it. The twin _seeds_ an instantiation with default ingredients and
yield; it does not _govern_ it, and is not _governed_ by it. This mirrors the
food model exactly — a food twin (identity) plus its Consumption Events — with
two differences that drive the schema: an instantiation varies along a
**structured, editable ingredient list** rather than a single `quantity` scalar,
and a recipe twin is a **composite of references to other twins** and only a
default, whereas a food twin is a leaf and the nutrition authority.

**2. Snapshot on write, never re-derive on read.** The governing principle:

> **Editable ⇒ derive. Logged ⇒ snapshot.** The boundary is the _write_ action.
> Before it — template, live editor — nutrition is always derived live from the
> ingredient twins (ADR-0021's `deriveRecipeNutrition`, the single computation
> path). At the moment of logging _or editing_, the derivation's output is
> captured onto the event and thereafter never recomputed on read.

Each instantiation carries, alongside the existing frozen `event/metrics`
headline, a new atomic `event/instantiation` blob:

```jsonc
"event/instantiation": {
  "based_on": "recipe:abc123_…",   // the template it was seeded from (= event/target)
  "yield": 1,
  "ingredients": [
    { "ref": "fdc:170372", "name": "Avocado", "amount": 60, "unit": "g",
      "calories": 96, "protein": 1.2, "fat": 8.8, "carbs": 5.1 }
  ]
}
```

- **Per-row macros are snapshotted**, so the breakdown is internally consistent
  with the headline forever and survives an ingredient twin being corrected,
  renamed, or deleted. This is _not_ the "duplicated macros rot against source"
  case ADR-0021 forbade: that argument is about the _template_, where `amount` is
  forever editable. A logged instantiation is a historical reading — freezing is
  the goal, not a hazard. `name` is denormalized for the same reason (display
  resilience); `ref` is kept but soft (may dangle) for re-log / save-as-template.
- **`event/metrics` (headline) stays** as-is, byte-compatible with the dashboard
  aggregation path; it is the cached Σrows ÷ yield.
- **Editing is by supersession, like a logged food** (`LogFoodSheet`,
  retract-and-replace per ADR-0008): open the instantiation, tweak, save; a new
  event is appended with a freshly-derived snapshot and the old is retracted with
  `event/replaced_by`. A read never silently drifts; a deliberate edit re-derives
  from the _current_ ingredient twins.
- **Revises ADR-0021's read path:** `deriveRecipeNutrition` moves out of the
  historical read path (`computeConsumption` stops live-deriving for logged
  events and drops `event.ingredients = t.ingredients`) and survives only for the
  live editor and for browsing a template's current per-serving nutrition.

**3. Template and instantiation are fully decoupled.** Instance edits are
instance-only — they never write back to the template. A template edit is a
separate deliberate act that re-seeds **future** instantiations only; past
instantiations, being snapshots, never move. Consequently _nothing_ — neither a
template edit nor an ingredient-twin correction — can rewrite logged history.
(Optional push-back — "you keep bumping avocado to 60 g, update the recipe?" — is
a deliberately deferred future affordance, not part of this model.)

**4. Three distinct verbs**, separating the acts today's single flow fuses:

| Verb            | Creates twin | Logs instantiation | Retracts source foods |
| --------------- | ------------ | ------------------ | --------------------- |
| **Define**      | yes          | no                 | no                    |
| **Consolidate** | yes          | yes                | yes (the replace)     |
| **Instantiate** | no           | yes                | **no**                |

**Consolidate** is today's "Build recipe from selected foods" flow, unchanged
except that it now also writes the `event/instantiation` snapshot. **Retraction
is a property of Consolidate alone** — Instantiate is purely additive. **Define**
lets a template exist with zero instantiations (a genuine reusable template, not
a byproduct of one meal). **Instantiate** seeds the editor from a template, lets
the user tweak amounts / add / remove / adjust yield, and logs — reusing the
builder's inline-amount editor (issue #9).

## Consequences

- **Revises** ADR-0021's read-path derivation and the recipe shape in
  `V1_REQUIREMENTS.md` §3/§4; `event/instantiation` is registered in
  `docs/eavt-vocabulary.html`. `CONTEXT.md` gains **Recipe Twin** and **Recipe
  Instantiation**.
- The split-brain branch in `consumption-state.ts` is deleted; the low blast
  radius is because no view reads the live-derived fields yet.
- Storage grows by one denormalized ingredient blob per logged recipe — accepted
  for the immutability and history it buys, consistent with `event/metrics`
  already being a frozen blob.
- **Deferred:** a per-template instantiation-history view (the data model
  supports it for free — query events by `target`); optional edit push-back to
  the template; and the schema.org key rename of `event/metrics`'s inner
  `{calories,protein,fat,carbs}` (the instantiation rows follow the same
  shorthand for now, per the ADR-0021 follow-up already tracked).
