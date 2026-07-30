# Active-adult daily macronutrient targets

**Purpose:** primary-source basis for Inventoria's "active-adult" reach-toward daily
macronutrient targets — the personal fill-bar denominators (`value / target`) the food
panel renders — mapped to the food-panel breakdown keys, with each %-energy target
converted to grams. These numbers were decided in issue #34 and wired ad-hoc in commit
`c1862cd`; this file records the real derivation to primary-source standard. Unlike the
FDA Daily Values (see `fda-daily-values.md`), which are a generic reference-diet
denominator for computing a label %DV, these targets aim at a higher-protein active-adult
profile. They are still derived entirely from published DRI ranges — every value sits
inside its Acceptable Macronutrient Distribution Range (AMDR).

## Sources (primary only)

- **IOM (2005) — _Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty
  Acids, Cholesterol, Protein, and Amino Acids_** (the "macronutrients" DRI report),
  Institute of Medicine of the National Academies. Publication landing page:
  https://www.nationalacademies.org/publications/10490
  (NAP catalog `10490` redirects here). This is the source of the AMDRs, the Total Fiber
  Adequate Intake, the protein RDA, and the 4/4/9 energy-conversion (Atwater) factors.
  - **NASEM DRI Macronutrients summary table** (one-page official extract of the 2002/2005
    report, "Dietary Reference Intakes: Macronutrients — Nutrient / Function / Life Stage /
    RDA-AI / AMDR"):
    https://www.nationalacademies.org/cdn/materials/9fb9fae1-63a0-4048-88ad-3f972639149a
    — the AMDR percentages, Total Fiber AI grams, and protein RDA grams below were read
    directly from this table.
  - Full report on the NCBI Bookshelf (open access): https://www.ncbi.nlm.nih.gov/books/NBK56068/
- **Dietary Guidelines for Americans, 2020–2025** (USDA / HHS, 9th edition). Official site:
  https://www.dietaryguidelines.gov/
  — establishes the 2,000-calorie level as the illustrative reference for the Healthy
  U.S.-Style Dietary Pattern (Appendix 3, "Daily Servings by Calorie Level"), and restates
  the 4/4/9 kcal-per-gram energy factors.
- **21 CFR 101.9(c)(9)** (cross-reference; see `fda-daily-values.md`):
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9
  — the FDA label rule uses the same **2,000-kcal reference diet** as the rounding/anchor
  basis, and its dietary-fibre DV (28 g) coincides with the value derived here.

---

## Targets table

Conversion: energy stays kcal; each macro's %-energy target is converted to grams with the
Atwater factor (protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9 kcal/g) at the 2,000-kcal
reference diet. Fibre is set directly from the DRI Adequate Intake (14 g / 1,000 kcal), not
from a %-energy split.

| Nutrient                | Panel key       | Target    | % of 2000 kcal | AMDR band (adults) | In band?       | Derivation                                       |
| ----------------------- | --------------- | --------- | -------------- | ------------------ | -------------- | ------------------------------------------------ |
| Energy (reference diet) | `energy`        | 2000 kcal | —              | —                  | —              | reference diet (DGA 2020–2025; FDA 21 CFR 101.9) |
| Protein                 | `protein`       | 125 g     | 25 %           | 10–35 %            | yes            | 25 % × 2000 = 500 kcal ÷ 4 = **125 g**           |
| Total fat               | `fat`           | 67 g      | 30 %           | 20–35 %            | yes            | 30 % × 2000 = 600 kcal ÷ 9 = 66.7 ≈ **67 g**     |
| Total carbohydrate      | `carbs`         | 225 g     | 45 %           | 45–65 %            | yes (low edge) | 45 % × 2000 = 900 kcal ÷ 4 = **225 g**           |
| Dietary fibre           | `fiber_content` | 28 g      | —              | AI (not AMDR)      | —              | 14 g / 1000 kcal × 2000 kcal = **28 g**          |

Percentages sum to 100 % (25 + 30 + 45). Each macro sits **inside** its DRI AMDR band;
carbohydrate is deliberately placed at the **low edge** (45 %) so protein can be pushed to
the **high end** (25 %, versus the ~10 % implied by the FDA reference diet). This is a
legitimate high-protein point within the DRI-sanctioned ranges, not an out-of-band choice.

---

## Derivation detail (show your work)

### AMDRs — verified against the primary DRI table

Read directly from the NASEM DRI Macronutrients summary table (adult rows, ages 19–70+):

- **Carbohydrate — 45–65 %** of energy.
- **Total fat — 20–35 %** of energy (children 4–18 y are 25–35 %; adults 20–35 %).
- **Protein — 10–35 %** of energy.

These are the _Acceptable Macronutrient Distribution Ranges_: "the range of intake for a
particular energy source that is associated with reduced risk of chronic disease while
providing intakes of essential nutrients" (IOM 2005). Do **not** confuse the AMDR percent
bands with the FDA label %DV — the AMDR is a DRI concept, the %DV is a labelling denominator.

### Atwater energy factors — 4 / 4 / 9

The %-energy → gram conversion uses the Atwater general factors:

- **Protein — 4 kcal/g**
- **Carbohydrate — 4 kcal/g**
- **Fat — 9 kcal/g**

These are the standard general factors stated in the IOM 2005 DRI report (Energy chapter)
and restated in the DGA appendices. Applying them at 2,000 kcal:

```
protein:      0.25 × 2000 kcal = 500 kcal ; 500 / 4 = 125 g
fat:          0.30 × 2000 kcal = 600 kcal ; 600 / 9 = 66.67 g  → round to 67 g
carbohydrate: 0.45 × 2000 kcal = 900 kcal ; 900 / 4 = 225 g
             (check: 500 + 600 + 900 = 2000 kcal — energy balances exactly)
```

Only fat requires rounding (66.7 → 67 g); protein and carbohydrate are exact integers at
this energy level. Do **not** round fat to 66 g — the panel target is 67 g.

### Dietary fibre — DRI Adequate Intake, not a %-energy split

Fibre is **not** derived from an AMDR (fibre has no AMDR). The IOM 2005 report sets a
**Total Fiber Adequate Intake of 14 g per 1,000 kcal**, based on the fibre intake found
protective against coronary heart disease. At the 2,000-kcal reference diet:

```
14 g / 1000 kcal × 2000 kcal = 28 g
```

Note the summary table expresses this AI as sex/energy-specific grams — **38 g** for adult
men 19–50, **30 g** men 51+, **25 g** women 19–50, **21 g** women 51+ — because those
reflect 14 g/1000 kcal applied to each group's reference energy intake. Inventoria targets
a single 2,000-kcal reference diet, so the correct application is **28 g** (= 14 × 2).
This **agrees with the FDA dietary-fibre DV of 28 g** already documented in
`fda-daily-values.md`, so fibre is the one macro **uncontested** between the two bases.
Do **not** use 25 g (an older/sex-specific figure) here.

### The 2,000-kcal reference diet

Both primary systems anchor on 2,000 kcal:

- **DGA 2020–2025** uses the 2,000-calorie level as the illustrative Healthy U.S.-Style
  Dietary Pattern reference (Appendix 3), and its calorie-needs tables (Appendix 2) place a
  moderately active adult woman / lightly active adult man near this level.
- **FDA 21 CFR 101.9(c)(9)** fixes 2,000 kcal as the label reference diet for computing %DV.

Inventoria adopts the same 2,000-kcal denominator so its targets line up with both systems.

---

## Contrast with the FDA label Daily Values

These active-adult targets differ from the FDA label DVs (`fda-daily-values.md`) for the
three energy macros:

| Macro         | Active-adult target | FDA label DV  | Why they differ                                                                                                       |
| ------------- | ------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Protein       | **125 g** (25 %)    | 50 g (~10 %)  | FDA is a generic reference-diet floor; Inventoria targets a high-protein active-adult profile (still ≤ 35 % AMDR cap) |
| Total fat     | **67 g** (30 %)     | 78 g (~35 %)  | FDA sits at the top of the fat AMDR; Inventoria at 30 %                                                               |
| Carbohydrate  | **225 g** (45 %)    | 275 g (~55 %) | FDA carries the residual energy as carbohydrate; Inventoria trims carbs to the AMDR floor to make room for protein    |
| Dietary fibre | **28 g**            | 28 g          | **identical** — both trace to 14 g/1000 kcal at 2,000 kcal                                                            |

The FDA numbers are a **label denominator** for computing a food's %DV. Inventoria renders a
**personal fill bar** (`value / target`), so it targets an active-adult profile rather than
the generic reference diet. Fibre (28 g) is the single macro where the two bases coincide.

---

## Caveats / what is and isn't first-party verified

- AMDR percentages (45–65 / 20–35 / 10–35), the Total Fiber AI grams (38/30/25/21), and the
  protein RDA (56 g men / 46 g women) were read **directly** from the NASEM DRI Macronutrients
  summary-table PDF cited above — first-party confirmed.
- The **14 g / 1,000 kcal** fibre basis is stated in the full IOM 2005 report (Fiber chapter)
  and is the documented derivation of the summary table's gram AIs; it was confirmed via the
  IOM report content but the exact sentence was not re-read line-by-line from the full report
  PDF in this pass. The arithmetic check (14 × 2 = 28 g, and 38 g ÷ 2714 kcal ≈ 14/1000) is
  internally consistent with the table's own numbers.
- The Atwater 4/4/9 factors are universal and appear in both the IOM 2005 report and the DGA;
  they are not in dispute.
- The **25 / 30 / 45 %** split itself is Inventoria's product choice (issue #34), constrained
  to fall inside the DRI AMDRs — it is not a value published by any authority. Only the
  _bounds_ it respects are primary-sourced.

---

## How to bake this in

Store a targets map keyed by the food-panel breakdown key, mirroring `FDA_DAILY_VALUES_G`.
All macro values are in **grams**; `energy` is the one exception and stays in **kcal**.

```ts
// Active-adult reach-toward macro targets (issue #34).
// Derived from IOM (2005) DRI AMDRs + Atwater 4/4/9 factors at a 2,000-kcal reference diet.
// Values in GRAMS except `energy` which is kcal.
export const ACTIVE_ADULT_MACROS_G = {
  energy: 2000, // kcal — reference diet (DGA 2020–2025; FDA 21 CFR 101.9)
  protein: 125, // 25 % of energy (500 kcal ÷ 4); AMDR 10–35 %
  fat: 67, // 30 % of energy (600 kcal ÷ 9 = 66.7, rounded); AMDR 20–35 %
  carbs: 225, // 45 % of energy (900 kcal ÷ 4); AMDR 45–65 % (low edge)
  fiber_content: 28, // DRI Total Fiber AI: 14 g / 1000 kcal × 2000; matches FDA DV
} as const;
```

Note: these macros are the **active-adult** figures, deliberately higher-protein than the
FDA reference-diet DVs. Fibre (28 g) is identical between the two bases. See
`fda-daily-values.md` for the label %DV denominators.
