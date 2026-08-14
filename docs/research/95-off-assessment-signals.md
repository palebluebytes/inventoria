# Research: the other OFF assessment signals (allergens, Nutri-Score, traffic-lights, additives, labels) (#95)

**Parent map:** [#95](https://github.com/palebluebytes/inventoria/issues/95) — surface the OFF consumer-assessment signals Inventoria already captures but does not yet show.
**Grounds:** the `food/assessment` blob emitted by `mapProductToAttributes` in `src/lib/food/open-food-facts.ts` (ADR-0030 §4). It already stores `allergens` (`allergens_tags`), `nutri_score` (`nutriscore_grade`), `nutrient_levels`, `additives` (`additives_tags`), and `labels` (`labels_tags`) — all write-only today. Sibling of [#86](https://github.com/palebluebytes/inventoria/issues/86) (NOVA), which shipped as ADR-0041.
**Date:** 2026-08-07. Field shapes verified against the live OFF **API v3** (`world.openfoodfacts.org/api/v3/product/<gtin>.json`) and coverage counts against **API v2 search** (`/api/v2/search`), both queried the same day. **Status:** research only.

---

## TL;DR

| Signal             | API field (captured)                                                       | Coverage                                                   | Readable as-is?                    | Trust                                                     |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| **Allergens**      | `allergens_tags` (`["en:milk",…]`)                                         | ~28% (ingredient-gated); milk 383k, gluten 319k            | No — `en:milk` needs name-mapping  | Derived from ingredients (parsed), not a safety guarantee |
| **Nutri-Score**    | `nutriscore_grade` (`"a"`–`"e"`)                                           | ~33% known (67% `unknown`)                                 | Yes — single letter a–e            | Algorithmic; **read, don't recompute**                    |
| **Traffic-lights** | `nutrient_levels` (`{fat,saturated-fat,sugars,salt: low\|moderate\|high}`) | ~33% (nutrition-table-gated)                               | Yes — `low`/`moderate`/`high`      | Algorithmic (FSA thresholds); **read, don't recompute**   |
| **Additives**      | `additives_tags` (`["en:e330",…]`) + `additives_n`                         | ~28% (ingredient-gated)                                    | No — `en:e330` needs name-mapping  | Derived from parsed ingredients                           |
| **Dietary labels** | `labels_tags` (`["en:vegan",…]`)                                           | Sparse: vegan 3.2%, veg 3.7%, organic 6.1%, no-gluten 5.0% | No — `en:vegan` needs name-mapping | **Authored** (on-pack claim), not computed                |

**Two headlines for design:** (1) **Labels are sparse** (single-digit %) and authored — a "vegan/organic" badge is absent for ~95%+ of products, so it can only ever be an additive positive, never a filter. (2) **Allergen absence ≠ allergen-free** — `allergens_tags` reflects only what OFF parsed from the ingredient list; see the safety section. Nutri-Score and traffic-lights are the two high-value, self-explanatory, algorithmic signals; the three tag-list signals (allergens/additives/labels) all need the same canonical-tag→display-name lookup.

---

## 1. Allergens — `allergens_tags`

- **Field & shape.** `allergens_tags` is a canonical, language-neutral array of `en:`-prefixed tags, e.g. Nutella (`3017620422003`) returns `["en:milk","en:nuts","en:soybeans"]`. This is the right/complete field. `allergens_hierarchy` is present too but is **identical** to `allergens_tags` for allergens (the allergen taxonomy is flat — no parent/child rollup), so it adds nothing. Raw localized strings also exist (`allergens` = `"lait, fruits à coque, soja"`, `allergens_lc` = the language) but are in the product's own language, not the user's. `additives_n`-style helpers do not apply here.
- **`traces_tags` is a distinct, second field** — "may contain" / cross-contamination warnings — separate from `allergens_tags` (present allergens). Both were empty `[]` on Coca-Cola (`5449000000996`). To be complete about allergen risk the UI should consider _both_ `allergens_tags` (present) and `traces_tags` (traces).
- **Coverage.** Allergen extraction is gated on the ingredient list being parsed, so it tracks `states_tags=en:ingredients-completed` ≈ **1,295,617 / 4,668,932 ≈ 27.7%** ([search: ingredients-completed](https://world.openfoodfacts.org/api/v2/search?states_tags=en:ingredients-completed)). Individual allergens: milk **383,592** ([en:milk](https://world.openfoodfacts.org/api/v2/search?allergens_tags=en:milk)), gluten **318,792** ([en:gluten](https://world.openfoodfacts.org/api/v2/search?allergens_tags=en:gluten)).
- **Readability.** Cryptic — `en:milk` must be mapped to a display name. See §7 for the lookup routes.
- **Trust.** Derived — OFF parses the ingredient text (and the bolded on-pack allergen list) into canonical tags. It is a machine reading of the label, **not** a certified allergen declaration. See the safety section (§6) — this gates the framing.

_Source: [data-fields.txt](https://static.openfoodfacts.org/data/data-fields.txt) (`allergens`, `allergens_tags`, `traces`, `traces_tags`); live v3 product JSON, fetched 2026-08-07._

## 2. Nutri-Score — `nutriscore_grade`

- **Field & shape.** `nutriscore_grade` is a single letter `"a"`–`"e"` (e.g. Nutella = `"e"`). This is the correct display field. Related fields:
  - `nutriscore_score` — the **numeric** score (Nutella = 30). Signed integer; useful for ordering but not for a badge. `nutrition_grade_fr` / `nutrition_grades` are legacy aliases of the grade.
  - **Versioned data.** `nutriscore` is an object with **both** `"2021"` and `"2023"` sub-objects, each carrying its own `grade`/`score`/`data`; `nutriscore_2021_tags` and `nutriscore_2023_tags` mirror the grades; `nutriscore_version` names the current one (`"2023"` on the live product). The top-level `nutriscore_grade` follows `nutriscore_version` (the 2023 formula). This matters because **30–40% of products changed grade** between the 2021 and 2023 formulas ([OFF blog: new Nutri-Score on 3M+ products](https://blog.openfoodfacts.org/en/news/open-food-facts-computes-the-new-nutri-score-on-3-million-products)). On Nutella the letter was `e` under both, but the scores differed (23 vs 30) — for borderline products the _letter_ can move. **Decision: display the top-level `nutriscore_grade`** (the current 2023 grade); do not surface both versions.
- **Coverage.** Of 4,668,932 products, **3,136,195 (67.2%)** return `nutrition_grades_tags=unknown` ([search: unknown](https://world.openfoodfacts.org/api/v2/search?nutrition_grades_tags=unknown)) → only **~32.8% (~1.53M)** carry a known a–e grade. Same "silent-or-warn on unknown" design question as NOVA (#86).
- **Readability.** Fully self-explanatory (a–e, universally recognised colour scale). No lookup needed.
- **Trust.** Algorithmic — computed by OFF from the nutrition table (+ a few category signals) via the official Santé publique France formula ([OFF Nutri-Score formula](https://world.openfoodfacts.org/nutriscore-formula)). **Read OFF's stored value; do not recompute** — reproducing the versioned formula (and its beverage/fat/cheese special cases) client-side would drift from OFF and is pointless when the grade ships in the payload.

## 3. Traffic-lights — `nutrient_levels`

- **Field & shape.** `nutrient_levels` is an **object**, exactly the shape Inventoria captures: `{"fat":"high","saturated-fat":"high","sugars":"high","salt":"low"}` (Nutella). Values are one of **`low` / `moderate` / `high`** (confirmed a `moderate` on product `3168930010265`: `{fat:moderate, saturated-fat:moderate, sugars:moderate, salt:low}`). Four keys: `fat`, `saturated-fat`, `sugars`, `salt`.
  - The parallel `nutrient_levels_tags` is the **flattened tag form** of the same data (`["en:fat-in-high-quantity","en:sugars-in-high-quantity",…]`) — same information, awkward to render. Inventoria already keeps the **object**, which is the better choice (direct key→level map, no string parsing).
- **Coverage.** Computed from the nutrition table alone (independent of the ingredient list), so it tracks nutrition-facts completeness — `states_tags=en:nutrition-facts-completed` ≈ **3,534,402 (75.7%)**, though a level is only assigned per-nutrient where that nutrient's value exists, so effective coverage aligns with Nutri-Score (~33%) for the full four-nutrient set. **More consistently populated than the ingredient-gated signals** (allergens/additives), because it needs no ingredient parsing.
- **Readability.** Self-explanatory — `low`/`moderate`/`high` map straight to a green/amber/red traffic-light per nutrient. No taxonomy lookup.
- **Trust.** Algorithmic — the UK FSA per-100g thresholds ([OFF wiki: Nutrients handling](https://wiki.openfoodfacts.org/Nutrients_handling_in_Open_Food_Facts)), computed by OFF. **Read the stored levels; do not recompute** (thresholds differ for solids vs beverages and are OFF's to maintain).

## 4. Additives — `additives_tags`

- **Field & shape.** `additives_tags` is a canonical `en:e###` array, e.g. Nutella = `["en:e322","en:e322i"]` (lecithins), Coca-Cola = `["en:e150d","en:e338"]`. `additives_n` gives the count (2). `additives_original_tags` mirrors the list (pre-normalisation) and is not needed. Correct/complete field pair for a badge is `additives_tags` + `additives_n`.
- **Coverage.** Additives are extracted from the parsed ingredient list, so — like allergens and NOVA — gated on `en:ingredients-completed` ≈ **27.7%**. Absence of additives tags on a product usually means _ingredients not parsed_, not _no additives_.
- **Readability.** Cryptic — `en:e330` is meaningless to users; needs mapping to "E330 – Citric acid". See §7.
- **Trust.** Derived from parsed ingredients (same machine-reading caveat as allergens). `additives_n` is a legitimate count for a "contains N additives" summary.

## 5. Dietary labels — `labels_tags`

- **Field & shape.** `labels_tags` is a canonical `en:` array mixing certifications, dietary claims, and packaging marks, e.g. an Alpro oat drink (`5411188124689`) returns `["en:vegan","en:vegetarian","en:no-milk","en:organic"…,"en:certified-b-corporation","en:fsc","en:green-dot"…]`. The dietary ones Inventoria cares about are `en:vegan`, `en:vegetarian`, `en:organic`, `en:no-gluten`. `labels_hierarchy` adds taxonomy parents (e.g. `en:vegan` implies `en:vegetarian`) — potentially useful for rollup, but the flat `labels_tags` is enough.
  - **Do not confuse with `ingredients_analysis_tags`.** That field (`["en:vegan","en:vegetarian","en:palm-oil-free"]`) is OFF's _algorithmic_ vegan/vegetarian inference from ingredients — a different trust class from an _authored_ on-pack `labels_tags` claim. `labels_tags=en:vegan` = "the manufacturer put a vegan claim on the pack"; `ingredients_analysis_tags=en:vegan` = "OFF's parser thinks the ingredients are vegan". Keep them distinct if surfaced.
- **Coverage — sparse.** Labels only exist when someone recorded an on-pack claim: vegan **149,053 (3.2%)** ([en:vegan](https://world.openfoodfacts.org/api/v2/search?labels_tags=en:vegan)), vegetarian **173,471 (3.7%)**, organic **283,893 (6.1%)** ([en:organic](https://world.openfoodfacts.org/api/v2/search?labels_tags=en:organic)), no-gluten **232,112 (5.0%)** ([en:no-gluten](https://world.openfoodfacts.org/api/v2/search?labels_tags=en:no-gluten)), no-lactose 41,428 (0.9%). **NB:** OFF uses `en:no-gluten`, **not** `en:gluten-free` (the latter query errors — the tag does not exist). **Design consequence:** a label badge can only be a _positive_ affordance ("this one is vegan") — its absence tells you nothing, so it must never drive a filter or a "not vegan" claim.
- **Readability.** Cryptic tags — `en:vegan` → "Vegan" via lookup (§7).
- **Trust.** **Authored** — a transcription of a claim printed on the package, the only signal of the five that is human-entered rather than computed. Trustworthy as "the pack says so"; still not a certification Inventoria can vouch for.

## 6. Safety caveat — allergen absence is not "allergen-free"

This gates the entire allergen framing, so it is called out separately.

- OFF **distinguishes present allergens from declared-free**, but through _different fields_, and it does **not** cleanly distinguish "parsed, none found" from "not parsed / unknown":
  - **Present:** the allergen appears in `allergens_tags` (e.g. `en:milk`).
  - **May contain / cross-contamination:** `traces_tags` (a separate list).
  - **Declared free of X:** expressed as a **label**, not an allergen tag — `labels_tags` values like `en:no-gluten`, `en:no-milk`, `en:no-lactose`. These are affirmative "free-from" claims.
  - **Absent / unknown:** an **empty `allergens_tags` (`[]`)** or a product with unparsed ingredients. Critically, `[]` does **not** mean "contains no allergens" — it means OFF found none _in what it parsed_, and ~72% of products aren't ingredient-complete at all.
- **Rule for the UI:** treat `allergens_tags` as "allergens OFF detected" (positive information only). **Never** render "free of milk" from the _absence_ of `en:milk`. A genuine free-from statement requires the affirmative `labels_tags` claim (`en:no-milk`) **and** should still be caveated. Surface `traces_tags` alongside presence so "may contain nuts" isn't lost. Any allergen UI needs a visible "based on OFF's reading of the ingredient list — always check the packaging" disclaimer.

## 7. Readability — the shared tag→name lookup (client-side, reachable)

Three of the five signals (allergens, additives, labels) are cryptic `en:`-tag lists. Neither the product response nor a `_hierarchy` field ships a localized display name — `allergens_hierarchy`/`labels_hierarchy` are still `en:`-tags, and there is no `additives_known_names`-style field. So a lookup is required, and **two client-side routes exist** (both public, no auth, CORS-open — same class as the `taxonomy_suggestions` category lookup Inventoria already uses):

1. **Static taxonomy JSON (recommended for exact tag→name).** Per-tagtype files under `static.openfoodfacts.org/data/taxonomies/`: `allergens.json` (**27** entries), `additives.json` (**683** entries), `labels.json` (**3,048** entries). Each entry has a `name` object keyed by language — e.g. `additives.json["en:e330"].name.en` = `"E330 - Citric acid"`, `allergens.json["en:milk"].name.en` = `"Milk"`, `labels.json["en:vegan"].name.en` = `"Vegan"`. Small enough to fetch once and cache. This is a direct canonical-tag → localized-name map, exactly what a badge renderer needs.
2. **`taxonomy_suggestions` endpoint (prefix search).** `GET /api/v3/taxonomy_suggestions?tagtype=additives&string=e330&lc=en` → `{"suggestions":["E330 - Citric acid"]}`. This is the same endpoint family Inventoria uses for categories, but it is a **prefix-search** (type-ahead) surface, not a stable exact tag→name resolver — good for input, weaker for rendering a fixed tag. Prefer route 1 for display.

_(The `/api/v3/taxonomy` action does **not** exist — it returns `invalid_api_action`. Use the static files or `taxonomy_suggestions`.)_

## 8. Licensing / attribution — ODbL, credit required (unchanged from #86)

Same terms as the NOVA badge (doc 86 §5), reconfirmed against [OFF Data page](https://world.openfoodfacts.org/data):

- Database under **Open Database License (ODbL) 1.0**; individual facts under the **Database Contents License (DbCL) 1.0**; product photos **CC-BY-SA 3.0**.
- Displaying these signals (Nutri-Score, traffic-lights, allergens, additives, labels) to end users is permitted, but **attribution is required** — credit "Open Food Facts" and the ODbL, and keep any redistributed/derived database share-alike. Nutri-Score and NOVA the _methods_ are public; no separate per-signal licence applies. A single "Data from Open Food Facts (ODbL)" credit already required by the NOVA badge covers all of these too — no new attribution surface needed.

## Caveat

The throttled OFF search API occasionally returned empty counts on rapid-fire queries (retried with spacing); the totals here reconciled to the ~4.67M index. Per-signal counts are live snapshots and drift as the database grows, but the _orders of magnitude_ — Nutri-Score/traffic-lights ~⅓, allergens/additives ~28%, dietary labels single-digit % — are the durable, design-relevant facts.
