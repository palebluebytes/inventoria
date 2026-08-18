# ADR 0022: Recipes are templates; each logging is an editable instantiation snapshot

**Status:** Accepted  
**Amended by:** ADR-0030 (#28), see the amendment below  
**Implemented:** #11 foundation, #12 Instantiate + correct, #13 Define + template edit

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
- **Rows are the batch as cooked; the headline is per serving.** Each frozen row
  carries its ingredient's _batch_ macros — what went in the pot — so the rows
  sum to the batch total, and the headline is that total ÷ yield. The exact
  invariant is therefore `headline == Σrows ÷ yield`, which collapses to "the
  rows sum to the headline" only at the default `yield = 1`. Issues #10 (story
  12, "the breakdown always adds up to its logged total") and #11 ("per-row
  macros sum to its headline") state that yield-1 special case as if it were the
  general rule; against a `yield > 1` the invariant is the divided form above.
  Dividing the _rows_ by yield is deliberately rejected: it would re-round each
  row and stop it matching the `amount` the user actually logged (story 11,
  "record exactly what I made — its ingredients, amounts, yield"). Editing
  surfaces spell the basis out — the instantiation editor labels its log button
  "… kcal / serving" whenever yield > 1 — so the batch-rows vs per-serving-total
  gap never reads as an arithmetic error. The yield _input_ is currently hidden
  in the UI (multi-serving isn't ready to expose; ADR-0021 scoped it out), so
  newly-created recipes and instantiations are single-serving and the two forms
  coincide; the divided invariant and the "/ serving" label remain for any seeded
  or legacy `yield > 1` and for when the control returns.
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
  `docs/history/V1_REQUIREMENTS.md` §3/§4; `event/instantiation` is registered in
  `docs/eavt-vocabulary.md`. `CONTEXT.md` gains **Recipe Twin** and **Recipe
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

## Amendment (ADR-0030 / #28): `event/metrics` widened to the full scaled panel; forward-only

To surface fibre and micronutrients **for the day** (parent #21), the frozen
snapshot must carry more than the four macros. This amendment widens the snapshot
shape without changing the model — it is the same "snapshot on write, never derive
on read" rule freezing _more_ at write time; logged history stays immutable.

- **`event/metrics` now carries the food's whole `nutrition/info` panel, scaled to
  the amount logged.** The four `{ calories, protein, fat, carbs }` headline keys
  are unchanged and byte-compatible with every existing reader; each remaining
  panel nutrient is added under its **panel name** (`fiber_content`,
  `sodium_content`, `saturated_fat_content`, the twelve micronutrients, …) so no
  key is duplicated.
- **Each `event/instantiation` row carries the same full breakdown** (the recipe
  path mirrors the food path): the derivation (`deriveRecipeNutrition` /
  `deriveIngredientMacros`) and `buildInstantiation` now produce a full
  `NutritionBreakdown`, round-then-sum per nutrient exactly as the macros already
  were, so the frozen headline is byte-identical to before and the rows still sum
  to it.
- **Forward-only.** A nutrient the food never reported is **absent (undefined),
  never 0**. Events logged before this change keep their four-macro snapshot; the
  day total (`totalNutrition` → `sumNutrition`) sums only what each event actually
  froze and never fabricates a zero for an un-measured nutrient.
- Verified headless at Seam 2 (store action → `computeConsumption` round-trip);
  no twin storage, no `{ ref, amount, unit }` change, no UI change. Docs updated:
  `docs/history/V1_REQUIREMENTS.md` §Module A and `eavt-vocabulary.md` `event/*` shapes.

## Amendment (food-addition flow unification): Define now logs one serving

The three-verb table above gave **Define** "Logs instantiation: no" — a new
template existed with zero instantiations. In practice a user who builds a brand
new recipe expects it on the day they built it, and its absence read as a bug. As
part of unifying the food-addition flows behind one pinned **"Log"** button, Define
is brought in line with the other add flows.

- **Define now logs one serving onto the current day**, into the meal the "＋ New
  recipe" sheet was opened from (`recipe_meal_type`, defaulting to `dinner`). It
  reuses the exact `logRecipeConsumption` call Consolidate already makes — same
  derived-then-frozen per-serving snapshot — so a defined recipe and a
  consolidated one log identically.
- **Retraction stays a property of Consolidate alone.** Define builds from scratch
  and carries no source `event_id`s, so the retraction loop remains guarded to
  Consolidate; Define's fresh ingredient foods are never touched.
- **Edit is unchanged** — still template-only (logs nothing, retracts nothing); it
  re-seeds only future instantiations. The revised table row for Define reads
  "Creates twin: yes · Logs instantiation: **yes** · Retracts source foods: no".
- No storage/model change — same snapshot shape and `{ ref, amount, unit }`
  references; only the mode guard in `RecipeModal.handleSave` widened.

## Amendment (servings control exposed): the yield input returns

The decision above records the model in full but notes that the yield _input_ is
hidden in the UI, so newly-created recipes and instantiations are single-serving
"until the control returns". It has returned, as **Servings**.

- **The recipe surface asks how many servings the batch makes**
  (`IngredientListEditor`, labelled "Makes (servings)"), bound to the same
  `recipeYield` the derivation and `saveRecipe` already read. Nothing in the model
  changes: `recipe/yield` still defaults to 1, the divided invariant
  (`headline == Σrows ÷ yield`) is unchanged, and the rows still carry the batch.
- **It replaces a ×/÷ scaler on the ingredient amounts.** Halving every amount by
  hand was only ever a way of saying "this makes fewer" — an operation that
  rewrote the ingredients to express a fact about the batch. Asking for the fact
  directly leaves the amounts as the cook entered them, which is what the frozen
  rows are supposed to record ("record exactly what I made — its ingredients,
  amounts, yield"). The ×/÷ control remains on the dashboard's selection bar,
  where it means what it says: rescale foods actually logged.
- **A logging still records one serving.** `logRecipeConsumption` freezes the
  per-serving snapshot, so a recipe that makes four puts a quarter of the batch on
  the day — the behaviour the model always specified and the "/ serving" labels
  always claimed.
