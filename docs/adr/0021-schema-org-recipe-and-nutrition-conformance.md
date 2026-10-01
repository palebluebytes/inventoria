# ADR 0021: Back Recipes and Nutrition with schema.org/Recipe and NutritionInformation

**Status:** Accepted  
**Date:** 2026-07-26  
**Amended by:** ADR-0030 (widens the `nutrition/info` panel)  
**Implemented:** `nutrition/info` and the schema.org recipe vocabulary; the ad-hoc `recipe/source` / `recipe/notes` / `recipe/steps` attributes are gone

## Context

Inventoria already ingests reputable schemas: physical/media twins are scraped
as schema.org JSON-LD (`Product`, `src/lib/ingestion/json-ld.ts`), and food
ingredient twins are backed by reputable public databases — USDA FoodData
Central (`fdc:`) and Open Food Facts (`gtin:`).

The food-logging redesign (commit `a4b55aa`) added a recipe tracker whose data
model does **not** hold that standard:

- The `recipe/*` namespace is ad-hoc (`recipe/source`, `recipe/notes`,
  `recipe/steps`) — it maps to no reputable schema, and it silently drifted from
  the recipe shape documented in `docs/history/V1_REQUIREMENTS.md` §3
  (`recipe/description`, `recipe/scrape_url`). The projection
  (`consumption-state.ts`) now reads _both_ vocabularies, so dead branches exist
  for names nothing emits.
- Recipes store aggregate macros **and** per-ingredient macro snapshots, both
  duplicating the ingredient twins they are built from — the numbers can rot
  against their source.
- Nutrition lives only in `food/*`, coupled to food identity, with no notion of
  a nutrition panel as a first-class, reputable concept.

The reputable schema for recipes is **schema.org/Recipe** (with
**NutritionInformation**) — the sibling of the `Product` JSON-LD we already
parse. Conforming now means a future scraped-recipe importer is a straight map
rather than a second translation, consistent with the remap-on-standard-change
rationale in ADR-0016 and `CONTEXT.md`.

## Decision

**1. Conform semantically to schema.org/Recipe & NutritionInformation, expressed
as snake_case EAVT attributes.** Conformance means a documented lossless mapping
(below), not literal JSON-LD storage — the same normalization the USDA and OFF
adapters already do (foreign property names → app-local snake_case, per
ADR-0014). This honours the snake_case red line in `AGENTS.md`.

**2. Nutrition is a first-class concept on every food-bearing twin, stored as a
single atomic `nutrition/info` blob** mirroring NutritionInformation:

```jsonc
"nutrition/info": {
  "serving_size": "100 g",         // schema.org servingSize — the basis of these values
  "calories": 539,                 // schema.org calories (kcal)
  "protein_content": 6.3,          // schema.org proteinContent (g)
  "fat_content": 30.9,             // schema.org fatContent (g)
  "carbohydrate_content": 57.5,    // schema.org carbohydrateContent (g)
  "fiber_content": 0,              // schema.org fiberContent   — when the source provides it
  "sugar_content": 56.3,           // schema.org sugarContent
  "sodium_content": 0.107,         // schema.org sodiumContent
  "saturated_fat_content": 10.6,   // schema.org saturatedFatContent
  "trans_fat_content": 0.2,        // schema.org transFatContent
  "unsaturated_fat_content": 12.5, // schema.org unsaturatedFatContent (mono + poly)
  "cholesterol_content": 0.01      // schema.org cholesterolContent (g)
}
```

- **Atomic (one datom), by design.** A nutrition panel is one coherent reading;
  a single macro is deliberately _not_ independently correctable. This is the
  opposite granularity choice to the per-attribute soft-archive of ADR-0008, and
  it is justified: you correct a panel as a unit, not a macro at a time. The
  cost — a single-macro fix rewrites the whole blob, and multi-device merge is
  last-writer-wins on the panel (ADR-0020) — is acceptable for measured panels.
- **Trivially extensible.** New nutrients are new keys; no new attribute, no
  migration, no index change. Storage is already `value TEXT` holding JSON
  (`db.core.ts`), and reads fold in JS (`groupByEntity`), so a blob is as
  queryable as flat fields for every real access path.
- **Numbers, not unit-strings**, because derivation needs arithmetic; units are
  fixed per field and reattached only on schema.org export.

**3. Recipe nutrition is derived, never stored.** Per-serving macros =
`Σ(ingredient nutrition × amount / serving_size) / recipe/yield`. Recipe twins
carry no `nutrition/info`. `recipe/ingredients` holds **pure references**
`{ ref, amount, unit }`; the ingredient's name and nutrition resolve from the
referenced (already-persisted) food twin. The ingredient twin is the single
source of truth, so nothing can rot.

**4. Food twins gain `twin/raw_provenance` (ADR-0016 alignment).** The adapters
currently discard everything but four macros and — unlike items/media — write no
provenance. Storing the raw USDA/OFF JSON makes any nutrient (including
beyond-schema.org micronutrients) backfillable with **no network re-fetch**, and
closes food being the lone ingested twin type that skips provenance.

**5. `recipe/*` renamed to schema.org-faithful names.** `description` (was
`notes`), `url` (was `source`/`scrape_url`), `instructions` (was `steps`, an
ordered `string[]` of HowToStep text), plus `name`, `image`, `yield`,
`ingredients`.

### Mapping table (schema.org ⇄ EAVT)

| schema.org/Recipe           | EAVT                                   |
| --------------------------- | -------------------------------------- |
| `name`                      | `recipe/name`                          |
| `description`               | `recipe/description`                   |
| `url` / `isBasedOn`         | `recipe/url`                           |
| `image`                     | `recipe/image`                         |
| `recipeYield`               | `recipe/yield` (default 1)             |
| `recipeInstructions[].text` | `recipe/instructions[]` (`string[]`)   |
| `recipeIngredient`          | derived from `recipe/ingredients` refs |
| `nutrition`                 | derived (not stored on the recipe)     |

| schema.org/NutritionInformation | `nutrition/info.*`                      |
| ------------------------------- | --------------------------------------- |
| `servingSize`                   | `serving_size`                          |
| `calories`                      | `calories`                              |
| `proteinContent`                | `protein_content`                       |
| `fatContent`                    | `fat_content`                           |
| `carbohydrateContent`           | `carbohydrate_content`                  |
| `fiberContent`                  | `fiber_content`                         |
| `sugarContent`                  | `sugar_content`                         |
| `sodiumContent`                 | `sodium_content`                        |
| `saturatedFatContent`           | `saturated_fat_content`                 |
| `transFatContent`               | `trans_fat_content`                     |
| `unsaturatedFatContent`         | `unsaturated_fat_content` (mono + poly) |
| `cholesterolContent`            | `cholesterol_content`                   |

Food-bearing twins carry `food/name`, `food/image`, `nutrition/info`,
`twin/raw_provenance`. The consumption event keeps its frozen `event/metrics`
snapshot (an atomic historical record, correctly a blob), with inner keys
aligned to the nutrition vocabulary.

## Consequences

- **Supersedes** the recipe twin shape in `docs/history/V1_REQUIREMENTS.md` §3 and revises the
  food twin shape in §1; both must be updated, and new attributes registered in
  `docs/eavt-vocabulary.md`.
- **No backward compatibility** with `a4b55aa` recipe/food data — explicitly
  waived. Readers drop the dead old-vocabulary branches in `consumption-state.ts`.
- One nutrition model spans USDA/OFF/custom/derived-recipe — no per-source
  special-casing, ending the drift the redesign introduced.
- Provenance increases OPFS usage (the tradeoff ADR-0016 already accepted) in
  exchange for lossless, re-fetch-free nutrient history.
- **schema.org/Recipe import/export (scraped recipes) is now a straight map** —
  deferred to a future ticket; this ADR only makes the model conformant.
- `recipe/yield` defaults to 1, preserving the current "build a recipe from
  today's logged foods → retract them" replace flow (ADR-0008 retraction).
  Multi-serving batch semantics for that flow are out of scope.

## Amendment (2026-08-14): the worked example's sodium figure is salt, not sodium

The `nutrition/info` example in the Decision section gives
`"sodium_content": 0.107` for Nutella. That is OFF's **salt** figure. The shipped
mapper takes OFF's own sodium figure instead (`sodium_100g`, 0.0428 for the same
product) at `src/lib/food/open-food-facts.ts:239`, which is what
schema.org's `sodiumContent` means.

The mapping rule is: **read `sodium_100g`, never `salt_100g`.** The two differ by
roughly the 2.5x sodium-to-salt conversion, so taking the wrong one overstates
sodium by that factor. The example's number is wrong; the code is right. This rule
was previously stated only as an inline comment in the archived
`docs/history/V1_REQUIREMENTS.md`, which is why it is recorded here.

## Amendment (2026-10-01): the panel stores sodium, and one surface may ask for salt

The 2026-08-14 Amendment above fixes the rule as **read `sodium_100g`, never
`salt_100g`**, and reads as a blanket prohibition on the word "salt". Ingestion
obeys it and should keep obeying it. One surface is now licensed to invert it on
the way **in**, and that licence is recorded here because this is where the ratio
and the direction live.

`src/lib/food/label-form.ts`'s salt row asks for **salt as the pack prints it**,
in grams, and divides by 2.5 before storing. The stored figure is sodium exactly
as this ADR requires; what changed is the question the row asks a person holding
a jar.

**Why the input side is a different case from ingestion.** Ingestion reads a
record that carries both figures, so reading the wrong field is a straight defect
with a correct alternative sitting beside it. A person reads a pack, and every EU
pack prints salt in grams and no sodium figure at all — all four committed label
samples do (#476), and so does every hand capture in the real ledger. There the
wrong field is not an alternative, it is the only thing printed. Asking for
sodium there is asking for a number that is not on the label.

**What the defect was.** The row was captioned `Salt / sodium` and typed in
milligrams, and no `÷ 2.5` existed on the hand-typed path at all. Somebody read
`Salt 0,6 g`, typed `600`, and stored 0.6 g of sodium where the truth was 0.24 —
2.5x over, against a 2,300 mg DRV, in an append-only ledger (#508). It was also
publishable: `open-food-facts.ts` maps `sodium_content` to OFF's `sodium`, so the
contribution path would have pushed that figure into a public database.

**The ratio and its direction are now one constant.** `SALT_TO_SODIUM` lives in
`nutrition.ts`, in the panel's own vocabulary rather than on either surface that
needs it — the label form, and `ai-autofill.ts`, whose wire carries `salt_g` as
printed because asking a model to divide would be a computed number reaching a
panel (ADR-0115 §6.2). Before this, the two paths disagreed about the same row in
the same form: the model path divided and the hand path did not.

Open Food Facts corroborates both the ratio and that its salt figure is
arithmetic rather than a reading. For GTIN `9300658411892` it publishes
`sodium_100g: 0.059` and `salt_100g: 0.1475` — exactly 2.5x — and marks the
latter `salt_modifier: "~"`, estimated.

**What is NOT licensed.** Nothing may read a published `salt` figure as sodium,
and nothing may store salt. The row holds one value, in salt grams, and the
sodium box beside it is a lens over that value rather than a second figure: there
is one stored number, shown twice, so the two cannot disagree. A panel field named
for a quantity means that quantity, which is all the 2026-08-14 Amendment ever
said.
