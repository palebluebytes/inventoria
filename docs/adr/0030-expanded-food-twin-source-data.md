# ADR 0030: Capture the full source record on food twins — micronutrients, portions, and provenance signals

**Status:** Accepted; not yet implemented (specced 2026-07-29, this ADR)
**Date:** 2026-07-29

## Context

The USDA FoodData Central and Open Food Facts adapters (`src/lib/food/usda-fdc.ts`,
`open-food-facts.ts`) each fetch a rich source record and then keep a thin slice
of it: the `nutrition/info` panel's twelve schema.org macros (ADR-0021) plus
`food/name`. Everything else the source returns is discarded from the working
model — it survives only inside `twin/raw_provenance` (ADR-0016), which nothing
reads back.

Two whole classes of data the sources already return go unused:

- **Portion / household-serving weights.** FDC's `/food/{fdcId}` detail record
  carries `foodPortions[]` (`amount`, `modifier`, `gramWeight`, e.g. "1 medium →
  118 g"); OFF carries `serving_quantity` / `serving_size`. The app has no notion
  of a household portion, so a searched "croissant" can only be logged in grams
  the user must already know. (The `/foods/search` response's `foodMeasures[]` is
  empty for Foundation/SR Legacy foods, so portions require the detail endpoint.)
- **Micronutrients.** FDC reports 40–105 nutrients per food (vitamins, minerals);
  OFF reports its own `*_100g` set. The panel keeps four macros' worth plus fibre,
  sugar, sodium, the fats and cholesterol — the vitamins and minerals are dropped.

Beyond nutrition, each source carries record-level signals we throw away: FDC's
`foodCategory` and `scientificName`; OFF's Nutri-Score, NOVA group, Eco-Score,
`nutrient_levels`, ingredients text, allergens, additives, labels, and brand.

This ADR decides **what to capture and where it lives in the EAVT model**. It does
**not** build the display surface for the new nutrition fields — surfacing the
full panel in the UI is issue #21, a separate follow-up. The one exception is
portions, which are wired into the existing amount picker here (see Decision 5),
because a portion weight is inert without a way to pick it and answering "log one
croissant" is the motivating use case.

## Decision

### 1. `nutrition/info` gains a fixed set of micronutrient keys, in grams

ADR-0021 §2 already provides for this: "New nutrients are new keys; no new
attribute, no migration." We elevate the twelve micronutrients of the US
Nutrition-Facts label to first-class optional panel keys:

`vitamin_d`, `calcium`, `iron`, `potassium` (the four mandatory on the label),
plus `vitamin_a`, `vitamin_c`, `vitamin_e`, `vitamin_b6`, `vitamin_b12`, `folate`,
`magnesium`, `zinc`.

- **Stored in grams**, like every existing `*_content` field — the adapters'
  `toGrams` already normalises FDC's mg/µg, and OFF reports grams. This preserves
  the panel invariant ("every value in a unit fixed per field") so no reader needs
  a per-key unit table; the display layer reformats to mg/µg (issue #21).
- **Beyond schema.org.** schema.org/NutritionInformation defines no vitamin or
  mineral properties, so these keys have no schema.org counterpart and are
  documented as app extensions. The panel stays a superset of NutritionInformation,
  not a violation of it — the twelve schema.org macros still map exactly.
- The **long tail** (the other 30–90 FDC nutrients, fatty-acid isomers, etc.)
  stays in `twin/raw_provenance`, recoverable with no re-fetch — the exact use
  ADR-0021 §4 reserved provenance for. We elevate only the label set; more can be
  promoted later by the same "new key" move.

`macrosFromNutrition` still narrows the panel to the four display macros, so the
frozen `event/metrics` consumption snapshot (ADR-0022) is **unchanged** — the new
keys live on the food twin's live panel, not on logged history.

### 2. Portions are a new `food/portions` attribute, resolving to grams

A food-bearing twin gains an optional `food/portions`: an ordered list of
household measures the source offers.

```jsonc
"food/portions": [
  { "label": "1 medium", "amount": 1, "unit": "medium", "grams": 118 },
  { "label": "1 cup, sliced", "amount": 1, "unit": "cup, sliced", "grams": 150 }
]
```

- A portion is a **labelled gram weight**, nothing more. It is captured as source
  data on the twin, not a nutrition reading (so it belongs in `food/*`, not the
  `nutrition/info` panel).
- **Portions resolve to grams at entry time and are not otherwise persisted.**
  Picking "1 medium" fills a gram amount of 118; the logged Consumption Event and
  the recipe `ReferenceIngredient` store grams exactly as they do today. The
  `{ ref, amount, unit: "g" | "serving" }` reference model and
  `deriveRecipeNutrition` are **untouched** — a portion is a convenience shortcut
  onto the existing gram path, not a third unit. This keeps the single-source
  derivation (ADR-0021 §3) and the frozen snapshot intact, and avoids a
  portion-label that could rot against the twin.

### 3. FDC record metadata → `food/category`, `food/scientific_name`

Two scalar attributes captured at search-map time (both are on the search
response): `food/category` (FDC `foodCategory`; OFF `categories`) and
`food/scientific_name` (FDC `scientificName`). These are food-identity, not
nutrition.

### 4. OFF proprietary signals → one `food/assessment` blob (+ existing attrs)

OFF's consumer-facing assessments have no schema.org/NutritionInformation
counterpart and are OFF-specific. Rather than scatter a dozen loose attributes or
pollute the schema.org panel, they are captured as one atomic `food/assessment`
blob — the same "one coherent reading, corrected as a unit" granularity argument
ADR-0021 made for `nutrition/info`:

```jsonc
"food/assessment": {
  "nova_group": 4,
  "nutri_score": "e",
  "eco_score": "d",
  "nutrient_levels": { "fat": "high", "salt": "low", "sugars": "high", "saturated-fat": "high" },
  "allergens": ["en:milk", "en:nuts"],
  "additives": ["en:e322"],
  "labels": ["en:no-gluten"]
}
```

Two OFF fields map onto existing concepts instead of the blob:
`ingredients_text` → **`food/ingredients_text`** (a scalar, distinct from a
recipe's structured `recipe/ingredients` references), and OFF `brands` → the
existing **`twin/brand`** attribute. `food/assessment` is OFF-only today; the FDC
path does not populate it.

### 5. FDC portions arrive via lazy detail-hydration on select

Because `foodPortions` lives on `/food/{fdcId}` (not the search response), the
adapter gains `hydrateFdcFood(fdcId)`: called **once, when a searched food is
staged** (not per keystroke), it fetches the detail record, maps `foodPortions[]`
→ `food/portions`, and refreshes `twin/raw_provenance` with the fuller record.
Search stays the cheap Foundation + SR Legacy prefix query it is today — this ADR
does **not** broaden the dataset to Branded foods. OFF needs no second call: its
single product response already carries `serving_quantity`, the assessments, and
everything else, mapped at lookup time.

Both adapters bump their `ADAPTER_VERSION` (the mapper-version marker), since the
FDC → panel/twin and OFF → panel/twin normalisations now emit new keys.

**Search dedup keys on `ndbNumber`, not the description.** Foundation and SR
Legacy carry one food as two records with different free-text descriptions (e.g.
chia's "Chia seeds, dry, raw" vs "Seeds, chia seeds, dried"), so the original
description-string dedup left both as separate results. USDA links them by the
Standard Reference food number (`ndbNumber`), which the Foundation re-sample
inherits from the SR Legacy record — present on 100% of Foundation/SR Legacy
search hits sampled — so `searchFdc` now dedups by `ndbNumber` (still preferring
Foundation), falling back to the description only for the rare hit without one.
This is safe because dedup runs over the in-memory result set only: the
append-only ledger is untouched, logged history freezes its own macros, and food
refs are already soft/danglable (ADR-0022), so a different winning `fdcId` in a
future search can never orphan an existing log or recipe. Known limitation: USDA
occasionally reuses one `ndbNumber` across genuinely distinct foods (e.g. ndb 9501
spans a Foundation "honeycrisp" and an SR Legacy "golden delicious" apple), which
this collapses; a description-token-similarity guard is the fix if that proves
noticeable.

## Consequences

- **Food-bearing twins now carry** `food/name`, `food/category`,
  `food/scientific_name`, `food/ingredients_text` (OFF), `food/portions`,
  `food/assessment` (OFF), `nutrition/info` (now with micronutrients),
  `twin/brand` (OFF), `twin/raw_provenance`. All must be registered in
  `docs/eavt-vocabulary.html`, and the food twin shape in `V1_REQUIREMENTS.md`
  Module A updated.
- **The consumption snapshot is unaffected.** `event/metrics` and the
  recipe-instantiation rows stay four macros — new nutrition fields are twin-only.
- **Staging a searched FDC food becomes async** (one detail fetch) and needs a
  loading affordance; the fetch failing degrades to "no portions", never blocks
  logging in grams.
- **The full-panel display is still owed** — micronutrients and `food/assessment`
  are captured but not shown; that is issue #21. Only portions get UI here, as
  amount-picker presets over the ADR-0025 picker.
- **Provenance grows** (the FDC detail record is larger than the search hit) — the
  storage-for-losslessness tradeoff ADR-0016 already accepted.
- **schema.org export**, if built later, maps the twelve macros exactly and omits
  the micronutrient/assessment extensions (or emits them as non-standard
  properties) — no export code exists today, so nothing is broken.
- **No backfill of existing twins.** New fields populate on foods ingested after
  this change; a provenance-backfill pass (ADR-0021 §4) remains unbuilt and
  out of scope.

## Alternatives considered

- **Promote every FDC nutrient to a panel key.** Rejected: 40–105 keys per food
  (including fatty-acid isomers) bloats every panel for data no user reads; the
  label set is the recognised, cross-source-mappable subset, and the rest stays
  recoverable in provenance.
- **A third reference unit (`unit: "portion"`).** Rejected: it would ripple through
  `ReferenceIngredient`, `deriveRecipeNutrition`, the frozen snapshot, and every
  reader, to persist a label that can rot against the twin. Resolving portions to
  grams at entry keeps the model single-source and the change small.
- **Scatter OFF signals as loose `food/*` attributes.** Rejected: they are one
  coherent, source-specific assessment, corrected as a unit — the same blob
  argument as `nutrition/info`.
- **Broaden FDC search to Branded foods** for richer `householdServingFullText`
  serving data. Deferred: Branded is noisier and more duplicative and would need
  the dedup/ranking retuned; detail-endpoint `foodPortions` covers Foundation/SR
  without changing search quality.
