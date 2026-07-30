# FDA Daily Values (2016 Nutrition Facts label rule)

**Purpose:** authoritative reference table of the FDA Daily Values (DVs) — the amounts a Nutrition-Facts label's %DV is computed against — for adults and children ≥4 years, mapped to Inventoria's food-panel breakdown keys, with each value converted to grams for storage.

## Sources (primary only)

- **21 CFR 101.9** — Nutrition labeling of food, current text on the eCFR:
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9
  - **§ 101.9(c)(9)** — Daily Reference Values (DRVs) for total fat, total carbohydrate, dietary fiber, protein, and the 2,000-calorie reference diet.
  - **§ 101.9(c)(8)(iv)** — table of Reference Daily Intakes (RDIs) for vitamins and minerals.
  - (Values below were read from the eCFR renderer API for the current text of § 101.9, adults/children ≥4 years column.)
- **FDA consumer page — "Daily Value on the Nutrition and Supplement Facts Labels":**
  https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels
  (formerly ".../new-nutrition-facts-label/daily-value-new-nutrition-and-supplement-facts-labels"). Confirms the same DVs for adults and children ≥4 years and that protein carries no %DV by default.

Values are current per 21 CFR 101.9 as amended (2016 final rule, "Food Labeling: Revision of the Nutrition and Supplement Facts Labels", 81 FR 33742).

---

## Daily Values table

Conversion: energy stays kcal; mg → value / 1,000 g; µg → value / 1,000,000 g.

| Nutrient                | Panel key       | Published DV | Native unit     | Gram-equivalent           | Source                                      |
| ----------------------- | --------------- | ------------ | --------------- | ------------------------- | ------------------------------------------- |
| Energy (reference diet) | `energy`        | 2000         | kcal            | 2000 kcal (not converted) | § 101.9(c)(9); label footnote § 101.9(d)(9) |
| Protein                 | `protein`       | 50           | g               | 50 g                      | § 101.9(c)(9)                               |
| Total fat               | `fat`           | 78           | g               | 78 g                      | § 101.9(c)(9)                               |
| Total carbohydrate      | `carbs`         | 275          | g               | 275 g                     | § 101.9(c)(9)                               |
| Dietary fibre           | `fiber_content` | 28           | g               | 28 g                      | § 101.9(c)(9)                               |
| Vitamin D               | `vitamin_d`     | 20           | µg              | 0.00002 g                 | § 101.9(c)(8)(iv) RDI                       |
| Calcium                 | `calcium`       | 1300         | mg              | 1.3 g                     | § 101.9(c)(8)(iv) RDI                       |
| Iron                    | `iron`          | 18           | mg              | 0.018 g                   | § 101.9(c)(8)(iv) RDI                       |
| Potassium               | `potassium`     | 4700         | mg              | 4.7 g                     | § 101.9(c)(8)(iv) RDI                       |
| Vitamin A               | `vitamin_a`     | 900          | µg RAE          | 0.0009 g                  | § 101.9(c)(8)(iv) RDI                       |
| Vitamin C               | `vitamin_c`     | 90           | mg              | 0.09 g                    | § 101.9(c)(8)(iv) RDI                       |
| Vitamin E               | `vitamin_e`     | 15           | mg α-tocopherol | 0.015 g                   | § 101.9(c)(8)(iv) RDI                       |
| Vitamin B6              | `vitamin_b6`    | 1.7          | mg              | 0.0017 g                  | § 101.9(c)(8)(iv) RDI                       |
| Vitamin B12             | `vitamin_b12`   | 2.4          | µg              | 0.0000024 g               | § 101.9(c)(8)(iv) RDI                       |
| Folate                  | `folate`        | 400          | µg DFE          | 0.0004 g                  | § 101.9(c)(8)(iv) RDI                       |
| Magnesium               | `magnesium`     | 420          | mg              | 0.42 g                    | § 101.9(c)(8)(iv) RDI                       |
| Zinc                    | `zinc`          | 11           | mg              | 0.011 g                   | § 101.9(c)(8)(iv) RDI                       |

---

## Contested macros default (decision needed — do NOT resolve here)

The FDA label DVs for the three energy macros are:

- **Protein — 50 g**
- **Total fat — 78 g**
- **Total carbohydrate — 275 g**

These are the reference amounts for a 2,000-kcal diet used to compute %DV on a food label. They differ **sharply** from Inventoria's current hardcoded active-adult targets of **protein 130 g / fat 70 g / carbs 220 g**. The FDA numbers describe a generic reference diet (low protein, high carbohydrate), whereas Inventoria's current targets reflect an active-adult / higher-protein profile.

This document does **not** pick a winner. Whether the food panel should show %DV against the FDA reference diet, against Inventoria's active-adult targets, or against a user-configurable profile is a separate product decision and feeds its own decision ticket. This file only records what the FDA primary source actually publishes.

---

## Unit subtleties that affect the stored-gram value

The 2016 rule changed several units away from the older IU-based DVs. Interpret the stored grams accordingly:

- **Vitamin A — µg RAE, not IU.** DV is 900 µg RAE (Retinol Activity Equivalents). The pre-2016 DV was 5,000 IU. Do not convert stored data assuming IU.
- **Vitamin E — mg α-tocopherol, not IU.** DV is 15 mg of alpha-tocopherol. The pre-2016 DV was 30 IU. IU↔mg conversion differs for natural vs synthetic vitamin E, so store/compare as mg α-tocopherol only.
- **Folate — µg DFE, not plain µg or "mcg folic acid".** DV is 400 µg DFE (Dietary Folate Equivalents). DFE weights synthetic folic acid higher than food folate (1 µg folic acid ≈ 1.7 µg DFE), so incoming source data must already be in DFE.
- **Vitamin D — µg, not IU.** DV is 20 µg (= 800 IU). Older labels used IU.
- **Dietary fibre — 28 g.** Easy to misremember; confirm 28 g (not 25 g, which is an older/DGA figure).
- **Potassium — 4,700 mg.** Raised under the 2016 rule (older DV was 3,500 mg); it is now a mandatory label nutrient.
- **Calcium — 1,300 mg** (raised from the older 1,000 mg).
- **Sodium** (not in the panel list) is 2,300 mg under the current rule, if ever added.

Because vitamin A (RAE), vitamin E (mg α-tocopherol), and folate (DFE) are already equivalence-weighted units, the gram-equivalent stored value is a straight unit conversion of the published DV — no IU math is applied. Any food-data ingestion must supply these nutrients already expressed in RAE / mg α-tocopherol / DFE for the %DV to be correct.

---

## How to bake this in

Store a targets map keyed by the food-panel breakdown key, with all values in **grams** — energy is the one exception and stays in **kcal**. Drop-in values for a reference module:

```ts
// FDA Daily Values (21 CFR 101.9), adults & children >=4 yr.
// Values in GRAMS except `energy` which is kcal.
export const FDA_DAILY_VALUES_G = {
  energy: 2000, // kcal (reference diet, not grams)
  protein: 50, // 50 g
  fat: 78, // 78 g
  carbs: 275, // 275 g
  fiber_content: 28, // 28 g
  vitamin_d: 0.00002, // 20 µg
  calcium: 1.3, // 1300 mg
  iron: 0.018, // 18 mg
  potassium: 4.7, // 4700 mg
  vitamin_a: 0.0009, // 900 µg RAE
  vitamin_c: 0.09, // 90 mg
  vitamin_e: 0.015, // 15 mg α-tocopherol
  vitamin_b6: 0.0017, // 1.7 mg
  vitamin_b12: 0.0000024, // 2.4 µg
  folate: 0.0004, // 400 µg DFE
  magnesium: 0.42, // 420 mg
  zinc: 0.011, // 11 mg
} as const;
```

Note: the macro values (`protein`/`fat`/`carbs`) here are the **FDA reference-diet** figures, which are contested against Inventoria's active-adult targets — see "Contested macros default" above before wiring these into the panel's %DV.
