# Research: the USDA whole-food NOVA-1 inference rule (#89)

**Parent map:** [#85](https://github.com/inkpot-monkey/inventoria/issues/85) — surface a food's processing level (NOVA / ultra-processed).
**Sibling:** [#87](https://github.com/inkpot-monkey/inventoria/issues/87) prototype pulled a _constrained_ NOVA-1 inference into scope — a basic USDA whole food (banana, egg, raw chicken) should read **"NOVA 1 · est"** with a visually-distinct estimated badge. This ticket settles the **exact rule** for when to infer it.
**Grounds:** `searchFdc` / `mapFdcFoodToPayload` in `src/lib/food/usda-fdc.ts`, which already restricts search to `dataType=Foundation,SR Legacy` (line ~351) and already emits `food/category` (adapter v6, lines 59 / 207).
**Date:** 2026-08-06. Category strings verified against the live FDC API (`api.nal.usda.gov/fdc/v1/foods/search`) queried the same day; food-group taxonomy verified against the USDA SR documentation PDF. **Status:** research only.

---

## 1. Bottom line up front

- **Data type alone is NOT a safe NOVA-1 gate.** `dataType ∈ {Foundation, SR Legacy}` still contains ~13 food groups of prepared / composite / culinary-ingredient foods (Fast Foods, Restaurant Foods, Meals & Entrees, Soups & Sauces, Baked Products, Sweets, Snacks, Sausages & Luncheon Meats, Breakfast Cereals, Beverages, Fats & Oils, Baby Foods). Gating on data type alone would confidently mislabel a fast-food burger or a can of soup as NOVA 1 — the worst failure mode.
- **A `foodCategory` allow-list IS reliable and IS required.** FDC returns `foodCategory` as a plain **string** on every SR Legacy / Foundation search hit (e.g. banana → `"Fruits and Fruit Juices"`), drawn from the fixed 25-group SR food-group taxonomy. Whitelisting the whole-food groups is a clean, defensible NOVA-1 gate.
- **No mapper widening is needed.** The adapter already captures `food/category` (adapter v6). The data is on the twin forward-only already — unlike the OFF case in #88, nothing has to change in the mapper to unlock this. (One nuance in §5.)

## 2. FDC's category taxonomy — the 25 SR food groups

Foundation and SR Legacy foods are both categorised against the **same** food-group taxonomy (`food_category.csv` in the FDC download; Survey/FNDDS uses the separate `wweia_food_category` taxonomy — but we never fetch Survey foods). The live search API surfaces the group's _description_ as the string `foodCategory` on each hit.

The complete 25-group SR taxonomy, from the USDA SR documentation ([`sr25_doc.pdf`](https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR25/sr25_doc.pdf)), with a NOVA judgement for each:

| #   | Food group (`foodCategory` string)                            | Predominant NOVA                                                                                         | Whole-food?                             |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 01  | Dairy and Egg Products                                        | **Mixed** — milk/eggs/plain yogurt are NOVA 1, but cheese (3) and processed cheese (4) are a large share | ⚠️ trap                                 |
| 02  | Spices and Herbs                                              | 1 (dried/raw)                                                                                            | ✅                                      |
| 03  | Baby Foods                                                    | 3–4 (formulated)                                                                                         | ❌                                      |
| 04  | Fats and Oils                                                 | 2 (culinary) / 4 (margarine)                                                                             | ❌                                      |
| 05  | Poultry Products                                              | 1 (raw/cooked meat)                                                                                      | ✅                                      |
| 06  | Soups, Sauces, and Gravies                                    | 3–4 (composite)                                                                                          | ❌                                      |
| 07  | Sausages and Luncheon Meats                                   | 4 (processed meat)                                                                                       | ❌                                      |
| 08  | Breakfast Cereals                                             | 4                                                                                                        | ❌                                      |
| 09  | Fruits and Fruit Juices                                       | 1 (raw/frozen/dried)                                                                                     | ✅ (juice/syrup = minor trap)           |
| 10  | Pork Products                                                 | **Mixed** — raw pork is 1, but bacon/ham/cured is a big share                                            | ⚠️ trap                                 |
| 11  | Vegetables and Vegetable Products                             | 1 (raw/frozen/plain-cooked)                                                                              | ✅ (canned-salted/pickled = minor trap) |
| 12  | Nut and Seed Products                                         | 1 (raw); roasted/salted borderline                                                                       | ✅                                      |
| 13  | Beef Products                                                 | 1 (raw/cooked meat)                                                                                      | ✅                                      |
| 14  | Beverages                                                     | 4 (sodas etc.)                                                                                           | ❌                                      |
| 15  | Finfish and Shellfish Products                                | 1 (raw/cooked); canned-in-oil / smoked = trap                                                            | ✅ (with guard)                         |
| 16  | Legumes and Legume Products                                   | 1 (dry/cooked beans); tofu (3) / canned-salted = trap                                                    | ✅ (with guard)                         |
| 17  | Lamb, Veal, and Game Products                                 | 1 (raw/cooked meat)                                                                                      | ✅                                      |
| 18  | Baked Products                                                | 3–4 (bread, cakes)                                                                                       | ❌                                      |
| 19  | Sweets                                                        | 4                                                                                                        | ❌                                      |
| 20  | Cereal Grains and Pasta                                       | **Mixed** — raw grains/flour are 1, dry pasta is 3                                                       | ⚠️ trap                                 |
| 21  | Fast Foods                                                    | 4 (composite)                                                                                            | ❌                                      |
| 22  | Meals, Entrees, and Side Dishes                               | 3–4 (composite)                                                                                          | ❌                                      |
| 25  | Snacks                                                        | 4                                                                                                        | ❌                                      |
| 35  | American Indian/Alaska Native Foods (formerly "Ethnic Foods") | Mixed (incl. prepared)                                                                                   | ❌                                      |
| 36  | Restaurant Foods                                              | 3–4 (composite)                                                                                          | ❌                                      |

Group numbering is the historic SR food-group code; the API string is the description column, exactly as written above.

## 3. NOVA Group 1 — what qualifies (the yardstick)

From the NOVA method ([Open Food Facts NOVA page](https://world.openfoodfacts.org/nova), summarising Monteiro et al., _World Nutrition_ 2016):

- **Group 1 (unprocessed / minimally processed):** "edible parts of plants (seeds, fruits, leaves, stems, roots) or of animals (muscle, offal, eggs, milk)" plus fungi/algae — and the _minimal_ processes that only preserve them: drying, crushing, grinding, roasting, boiling, pasteurisation, chilling, freezing, vacuum-packing. → **raw/frozen/dried fruit, veg, grains, legumes, nuts, plain meat, fish, eggs, milk.**
- **Group 2 (culinary ingredients):** oils, butter, sugar, salt, honey — _pressed/refined/milled from Group 1_. (→ excludes group 04 Fats and Oils.)
- **Group 3 (processed):** Group 1 food + **added salt/oil/sugar** and preservation — "bottled vegetables, canned fish, fruits in syrup, **cheeses**, freshly made **breads**." This is the boundary that catches the in-category traps: canned/salted veg, fruit in syrup, canned/smoked fish, cheese, dry pasta, tofu.
- **Group 4 (ultra-processed):** formulations of substances + additives — sodas, packaged snacks, reconstituted meats, ready meals.

The key design consequence: **the allow-list must exclude any group whose contents routinely cross into Group 3 by salt/oil/sugar addition or by being a composite dish.** Cheese and bread being _explicitly_ NOVA 3 is why Dairy-and-Egg and Baked-Products cannot be waved through on category alone.

## 4. Recommended rule

> **Infer `NOVA 1 · est` iff** the food is a USDA FDC food (entity id `fdc:*`, which by construction of `searchFdc` guarantees `dataType ∈ {Foundation, SR Legacy}`) **AND** its `food/category` is in the allow-list below **AND** its `food/name` contains none of the deny-substrings. **Otherwise → "not rated."**

This is forward-only and errs toward under-claiming: a missed banana falls through to "not rated" (harmless); a prepared dish never reaches NOVA 1.

### 4a. Category allow-list (the primary gate)

Ten groups whose SR/Foundation contents are overwhelmingly raw / whole single foods:

```
Fruits and Fruit Juices
Vegetables and Vegetable Products
Legumes and Legume Products
Nut and Seed Products
Spices and Herbs
Beef Products
Poultry Products
Lamb, Veal, and Game Products
Finfish and Shellfish Products
Pork Products
```

Match the string **exactly** (case-sensitive equality against the FDC `foodCategory` value — these strings are stable).

**Deliberately excluded** (mixed / processed / composite — accept the under-claim): Dairy and Egg Products, Cereal Grains and Pasta, Baby Foods, Fats and Oils, Soups/Sauces/Gravies, Sausages and Luncheon Meats, Breakfast Cereals, Beverages, Baked Products, Sweets, Fast Foods, Meals/Entrees/Side Dishes, Snacks, American Indian/Alaska Native Foods, Restaurant Foods.

_If you want the tightest possible list_, drop **Pork Products** too (heavy bacon/ham/cured share). It is included above only because the name-deny guard (§4b) neutralises its cured items; without the guard, exclude it.

### 4b. Name-substring deny guard (belt-and-braces, recommended)

Even inside allow-listed groups a minority of items are NOVA 3 (fruit in syrup, canned-salted veg, canned/smoked fish, cured pork, tofu). A lowercase substring check on `food/name` catches them cheaply. Suppress the inference (→ "not rated") when the name contains any of:

```
canned · in syrup · cured · smoked · pickled · sauce · breaded · fried · creamed · cheese · tofu
```

This is why the allow-list can safely include Finfish, Legumes, and Pork. It is optional hardening, not load-bearing — the category gate alone is already conservative — but it is cheap and materially reduces false positives. Keep the list small and documented; over-long deny-lists create their own false-negatives.

### 4c. Milk & eggs (the one notable under-claim)

Milk and eggs are iconic NOVA-1 foods but live in **Dairy and Egg Products** alongside cheese (3) and processed cheese (4), so the category is excluded. Options, in order of preference:

- **Accept the under-claim** (milk/egg read "not rated"). Simplest, fully defensible, matches the "missed banana is fine" directive. **Recommended for v1.**
- _Optional rescue:_ additionally allow Dairy-and-Egg items whose name starts with `Milk,` / `Egg,` / `Eggs,` and contains none of `cheese/cream/butter/whey`. Higher coverage, slightly more surface area. Defer unless coverage complaints arise.

## 5. Does the mapper need widening? — No (with one nuance)

- **`foodCategory` → already captured.** `mapFdcFoodToPayload` emits `food/category` from the search hit's `foodCategory` string since adapter **v6** (`ADAPTER_VERSION = "7"` today; see `usda-fdc.ts` lines 19-20, 59, 207). Verified live: the search response carries `foodCategory` as a string on SR Legacy hits (banana → `"Fruits and Fruit Juices"`). **No mapper change required** — this is the clean contrast with #88, where the OFF NOVA blob was write-only.
- **`dataType` need not be read per-food.** Every catalogue food with an `fdc:` entity id came through `searchFdc`, which hard-codes `dataType=Foundation,SR Legacy`. So the "data type ∈ {Foundation, SR Legacy}" half of the rule is satisfied _by construction_ — the NOVA reader does not need a `dataType` attribute; the `fdc:` prefix is sufficient. (If a belt-and-braces explicit check is ever wanted, `dataType` already rides along untouched inside `twin/raw_provenance.raw_data.dataType` — no re-fetch.)
- **Forward-only caveat (same as #88):** foods staged before adapter v6 have no `food/category` attribute and will read "not rated." Harmless under-claim; no backfill needed.

## 6. Residual risk

- **In-category NOVA-3 minority.** Fruit-in-syrup, canned-salted veg, canned/smoked fish, cured pork, dry-pasta-adjacent legume products, tofu. Mitigated by the §4b deny guard; residual after the guard is small and skews toward _under_-claiming.
- **Foundation `foodCategory` occasionally absent.** A rare Foundation record may omit it; that food simply falls through to "not rated" (safe). The bulk of coverage is SR Legacy (~7,800 foods), which reliably carries the string.
- **100% fruit/vegetable juice.** Lives in "Fruits and Fruit Juices"; strictly NOVA 1 under the method but a grey area for some readers. The `· est` badge already signals the inference is heuristic, so this is acceptable.
- **String drift.** The rule hard-codes the 25 category descriptions. They are historically stable, but if USDA renames one (as "Ethnic Foods" → "American Indian/Alaska Native Foods"), an allow-listed food would silently drop to "not rated." Low likelihood, safe failure mode; worth a code comment pointing here.

---

## Recommendation (paste into #89)

**Data type alone is not safe** — `SR Legacy` includes Fast Foods, Restaurant Foods, Soups/Sauces, Baked Products, Sweets, Snacks, etc., which would false-positive as NOVA 1. **Gate on `food/category` as well.**

**Rule:** infer `NOVA 1 · est` iff entity is `fdc:*` (⟹ Foundation/SR Legacy by construction of `searchFdc`) **AND** `food/category` ∈ allow-list **AND** `food/name` contains no deny-substring; else **"not rated."**

**Allow-list (exact strings):** Fruits and Fruit Juices · Vegetables and Vegetable Products · Legumes and Legume Products · Nut and Seed Products · Spices and Herbs · Beef Products · Poultry Products · Lamb, Veal, and Game Products · Finfish and Shellfish Products · Pork Products. _(Drop "Pork Products" for the tightest variant.)_ Deliberately **exclude** Dairy and Egg Products (cheese=3/4) and Cereal Grains and Pasta (dry pasta=3); milk/eggs read "not rated" in v1 (acceptable under-claim).

**Deny-substring guard (recommended):** canned · in syrup · cured · smoked · pickled · sauce · breaded · fried · creamed · cheese · tofu.

**Mapper widening: NO.** `food/category` is already captured (adapter v6), and `dataType` need not be an attribute because the `fdc:` entity prefix already guarantees the data type. Forward-only, mirroring #88's caveat.
