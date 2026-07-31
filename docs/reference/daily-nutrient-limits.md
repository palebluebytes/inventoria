# Daily nutrient limits (stay-under reference values)

**Purpose:** primary-source basis for Inventoria's **limit** ("stay-under") daily
targets — the four nutrients the food panel renders a _fill-toward-a-cap_ bar for,
tinting amber once the day's total exceeds the limit — mapped to the food-panel
breakdown keys, with each published limit converted to grams for storage. This is the
inverting counterpart to the reach-toward references (`fda-daily-values.md`,
`active-adult-macros.md`): those record amounts you aim **up** toward, this one records
caps you keep **under**. Decided in issue #43 / ADR-0032.

Three of the four limits are FDA Daily Reference Values; trans fat has **no FDA DV**
(the label rule only says "as low as possible"), so its cap comes from the WHO
guideline instead. Every value carries its own source line, exactly as the reach-toward
docs mix FDA (micronutrients) and IOM (macros).

## Sources (primary only)

- **21 CFR 101.9** — Nutrition labeling of food, current text on the eCFR:
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9
  - **§ 101.9(c)(9)** — Daily Reference Values (DRVs), including saturated fat,
    cholesterol, and sodium, against the 2,000-calorie reference diet. (Values below
    were read from the eCFR renderer for the current text of § 101.9, adults/children
    ≥4 years column.)
- **FDA consumer page — "Daily Value on the Nutrition and Supplement Facts Labels":**
  https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels
  Confirms the same DVs for adults and children ≥4 years, and that trans fat carries
  **no %DV** ("a %DV is not required" — the label lists grams only).
- **WHO — trans-fatty acids.** The World Health Organization guideline caps industrially-
  produced and ruminant trans fat at **less than 1% of total energy intake**:
  - **WHO fact sheet, "Healthy diet"** (current):
    https://www.who.int/news-room/fact-sheets/detail/healthy-diet
    — "…trans-fats to less than 1% of total energy intake."
  - **WHO REPLACE action package (2018/2023 update)** — the technical package for
    eliminating industrially-produced trans fat, restating the <1%-energy ceiling:
    https://www.who.int/teams/nutrition-and-food-safety/replace-trans-fat

FDA values are current per 21 CFR 101.9 as amended (2016 final rule, 81 FR 33742). The
WHO ceiling is the standing recommendation as of the WHO "Healthy diet" fact sheet.

---

## Limits table

Conversion: mass values in mg → value / 1,000 g; g stays g. Every stored limit is in
**grams** (the panel's canonical mass unit — ADR-0021, one fixed unit per field).

| Nutrient      | Panel key               | Published limit | Native unit | Gram-equivalent | Source                            |
| ------------- | ----------------------- | --------------- | ----------- | --------------- | --------------------------------- |
| Sodium        | `sodium_content`        | 2,300           | mg          | 2.3 g           | § 101.9(c)(9) DRV                 |
| Saturated fat | `saturated_fat_content` | 20              | g           | 20 g            | § 101.9(c)(9) DRV                 |
| Cholesterol   | `cholesterol_content`   | 300             | mg          | 0.3 g           | § 101.9(c)(9) DRV                 |
| Trans fat     | `trans_fat_content`     | 2               | g           | 2 g             | WHO <1% energy (derivation below) |

---

## Trans fat: the WHO 1%-of-energy derivation

The FDA publishes **no Daily Value** for trans fat — the Nutrition Facts label lists
trans fat in grams with no %DV, and the FDA's only quantitative guidance is "as low as
possible." A stay-under bar needs a number to fill against, so the cap comes from the
WHO guideline, which _is_ quantitative:

```
WHO ceiling      : trans fat < 1% of total energy intake
Reference diet   : 2,000 kcal/day (same anchor the FDA DVs and the active-adult
                   macros both use)
1% of energy     : 2,000 kcal × 0.01 = 20 kcal
Energy per gram  : 9 kcal/g (Atwater factor for fat)
Grams            : 20 kcal ÷ 9 kcal/g = 2.22 g  →  rounded to 2 g
```

So the baked trans-fat limit is **2 g/day**. It is deliberately the _ceiling_ WHO names,
not a target to reach — a day at or below 2 g of trans fat is within guidance; the amber
tint marks a day that has gone over.

---

## Unit subtleties that affect the stored-gram value

- **Sodium — 2,300 mg, not "salt".** The DRV is for the element sodium, not sodium
  chloride (2,300 mg sodium ≈ 5.75 g salt). Panel data must supply sodium, not salt.
- **Cholesterol — 300 mg.** Retained as a DRV under the 2016 rule even though the label
  no longer prints a %DV footnote for it; the 300 mg reference value still stands.
- **Saturated fat — 20 g.** The DRV, distinct from _total_ fat (78 g, a reach-toward
  reference-diet figure — see `fda-daily-values.md`). Only the saturated fraction is a
  limit here.
- **Trans fat — 2 g (WHO-derived), not an FDA DV.** See the derivation above. Do not
  attribute this number to the FDA; it is the WHO <1%-energy ceiling at 2,000 kcal.

---

## Total sugar is deliberately **not** here

The obvious fifth limit — added sugars, FDA DV **50 g** — is absent on purpose. The
panel's `sugar_content` key is schema.org `sugarContent`, i.e. **total** sugars
(intrinsic sugar in fruit and milk included), whereas the 50 g DV is for **added**
sugars specifically. Baking a 50 g cap against total sugar would flag a bowl of fruit as
"over limit" — a semantically wrong comparison against a quantity the panel does not
carry. There is no authoritative daily limit for _total_ sugar (nutrition guidance caps
free/added sugars, not intrinsic), so no cited total-sugar number exists to bake either.

Total sugar is therefore removed from the display catalogue (kept as a captured field —
see ADR-0032 "Out of scope"), and an `added_sugar_content` key plus its 50 g limit is
deferred to a data-first twin-expansion effort, at which point the stay-under machinery
below extends to it with one more entry.

---

## How to bake this in

Store a limits map keyed by the food-panel breakdown key, all values in **grams** (no
energy member — there is no calorie limit). Drop-in values for the reference module:

```ts
// Daily nutrient limits ("stay under"): FDA DRVs (sodium, saturated fat, cholesterol)
// + the WHO <1%-energy trans-fat ceiling. Values in GRAMS. See daily-nutrient-limits.md.
export const BAKED_NUTRIENT_LIMITS_G = {
  sodium_content: 2.3, // 2300 mg — § 101.9(c)(9) DRV
  saturated_fat_content: 20, // 20 g — § 101.9(c)(9) DRV
  cholesterol_content: 0.3, // 300 mg — § 101.9(c)(9) DRV
  trans_fat_content: 2, // WHO <1% energy ≈ 2.2 g/2000 kcal, rounded
} as const;
```

A user override layers over these exactly as the reach-toward targets do (absent → this
baked cap, `> 0` → the user's cap, `0` → opt out of a limit), but with **no** always-on
clamp — unlike energy in the reach-toward set, no limit is mandatory.
