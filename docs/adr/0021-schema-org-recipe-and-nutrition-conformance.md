# ADR 0021: Back Recipes and Nutrition with schema.org/Recipe and NutritionInformation

**Status:** Accepted; not yet implemented (specced 2026-07-26, this ADR)
**Date:** 2026-07-26

## Context

Inventoria already ingests reputable schemas: physical/media twins are scraped
as schema.org JSON-LD (`Product`, `src/lib/ingestion/json-ld.ts`), and food
ingredient twins are backed by reputable public databases — USDA FoodData
Central (`fdc:`) and Open Food Facts (`gtin:`).

The food-logging redesign (commit `a4b55aa`) added a recipe tracker whose data
model does **not** hold that standard:

- The `recipe/*` namespace is ad-hoc (`recipe/source`, `recipe/notes`,
  `recipe/steps`) — it maps to no reputable schema, and it silently drifted from
  the recipe shape documented in `docs/V1_REQUIREMENTS.md` §3
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

- **Supersedes** the recipe twin shape in `V1_REQUIREMENTS.md` §3 and revises the
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
