# Research: NOVA / ultra-processing data in Open Food Facts (#86)

**Parent map:** [#85](https://github.com/inkpot-monkey/inventoria/issues/85) — surface a food's processing level (NOVA / ultra-processed) from OFF data.
**Grounds:** the write-only `food/assessment` blob emitted by `mapProductToAttributes` in `src/lib/food/open-food-facts.ts` (ADR-0030 §4), which already carries `nova_group`.
**Date:** 2026-08-06. Verified against the live OFF API (`world.openfoodfacts.org/api/v2/search`) queried the same day. **Status:** research only.

---

## 1. `nova_group` coverage — ~1 in 4 products

Live counts across the whole OFF index:

- Total products: **4,667,861**
- `nova_groups_tags=unknown` (no NOVA value): **3,491,647 ≈ 74.8%**
- Known NOVA 1–4: **≈1,146,901 ≈ 24.6%**
  - NOVA 1: 136,540 (2.9%) · NOVA 2: 66,140 (1.4%) · NOVA 3: 212,001 (4.5%) · **NOVA 4: 732,220 (15.7%)**
  - `not-applicable`: 974 (negligible)

**~3 in 4 products come back with no NOVA group.** Of the known quarter, NOVA 4 dominates (64% of classified products). Design consequence: a badge that stayed silent on unknown would be absent for most scanned products — which is why map #85 chose a **warning-style "unknown"** state instead.

## 2. Computation — fully algorithmic, gated on parsed ingredients + category

`nova_group` is **computed, not manually entered** (the off-nova algorithm, per the World Nutrition "NOVA. The star shines bright" formula). It starts every product at Group 1, promotes to 2 for culinary ingredients (oils / salt / sugar), then to 3/4 from category lists plus ultra-processing markers (additives such as colourants / emulsifiers / sweeteners, and "ultra-processed" ingredient / category markers).

**The gate:** it needs both the **ingredients list parsed** and the **category populated**. OFF itself flags the feature as experimental ("multilingual taxonomisation of ingredients is ongoing"). Even some `en:ingredients-completed` products still return `unknown`, so completeness alone does not guarantee a classification. `states_tags` (`en:ingredients-completed`, `en:categories-completed`) indicate whether NOVA _could_ be computed; ~1,295,350 products (~27.7%) are `en:ingredients-completed`.

## 3. Known vs missing in the API — check `nova_groups_tags`

- **Known:** integer `nova_group` (1–4) present; `nova_groups` = the string e.g. `"4"`; `nova_groups_tags` = e.g. `["en:4-ultra-processed-food-and-drink-products"]`.
- **Missing:** `nova_group` and `nova_groups` are **omitted entirely** from the response; `nova_groups_tags` = **`["unknown"]`** (bare `"unknown"`, **no** `en:` prefix).

**Reliable client check:** treat as known only if `nova_groups_tags` exists and is not `["unknown"]` (equivalently, the integer `nova_group` field is present). Do not rely on the integer field's mere absence alone — check the tag.

## 4. Per-product evidence — reachable (explainer depth (ii) is viable)

- `nova_group_debug` (in the fuller product payload) carries the **reasoning trail** behind a product's classification — the machine-readable "why this is NOVA 4."
- `additives_tags` (E-number list, e.g. `["en:e322","en:e322i"]`) + `additives_n` are a real UPF signal for the evidence view — **but gated on the same parsed-ingredients requirement as NOVA**, so no more populated than `nova_group`.
- `ingredients_analysis_tags` does **NOT** carry ultra-processing (`=en:ultra-processed` returns **0**); it only holds palm-oil / vegan / vegetarian states. Useful only as a "were ingredients parsed?" proxy.
- `nutrient_levels_tags` (`en:fat-in-high-quantity`, `en:sugars-in-high-quantity`, …) are computed **from the nutrition table alone**, independent of the ingredients list, so they are the **most consistently populated** signal (fat-in-high-quantity alone: 414,033) — but they are a Nutri-Score-style nutrition proxy, **not** a processing measure.

**Implication for the mapper:** our current `open-food-facts.ts` captures only the integer `nova_group` (+ `additives_tags`, `nutrient_levels`). Reaching depth (ii) requires **widening the mapper to also capture `nova_group_debug` and the labelled `nova_groups_tags`** — forward-only, so the evidence explainer will only work for foods captured after that change.

## 5. Licensing / attribution — ODbL, credit required

- OFF **database is ODbL 1.0**; individual facts under the Database Contents License (DbCL); product photos CC-BY-SA.
- Displaying NOVA to end users is permitted, but **attribution is required** — credit "Open Food Facts" and the ODbL. Any redistributed / derived database must stay share-alike under ODbL. An in-app NOVA badge is fine **with visible attribution**; no separate NOVA-specific licence applies (NOVA the classification is a public academic method).

## Caveat

The throttled OFF API means per-group counts can lag the live index slightly (known 1–4 + unknown + not-applicable summed to ~4.64M vs the 4.67M total), but the **~25% known / ~75% unknown** split is solid.
