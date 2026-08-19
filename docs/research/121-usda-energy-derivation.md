# Research: how USDA derives a calorie, and whether the twin merge disturbs it (#121)

**Grounds:** `mapFdcFoodToPayload` / `fillFromTwin` in `src/lib/food/usda-fdc.ts`; [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §2 and §3, whose energy-coherence argument this tests.
**Sibling:** [#119](https://github.com/palebluebytes/inventoria/issues/119) built the archive reader and the `ndbNumber` join this measures over.
**Date:** 2026-08-19. Figures marked _measured_ were computed that day over the complete bulk archives in `.usda-backup/` — Foundation 2026-04-30 (363 records) and SR Legacy 2018-04 (7,793) — and are reproduced by `pnpm usda:coverage`, which verifies each archive's sha256 against `scripts/usda-backup.manifest.json` before counting. Documentary claims come from the pages cited. **Status:** research only — no code beyond the measurement, no ADR.

---

## 1. Bottom line up front

- **USDA does not report a measured calorie.** _Measured:_ all 321 Foundation energies carry derivation code `NC`, Calculated; SR Legacy is 6,668 of 7,793 `NC`, and the remainder are manufacturer-supplied, back-calculated from a label, imputed, or taken from another table. No derivation code in either archive states combustion.
- **Energy is the macros times a factor system**, and the macros are themselves derived: protein from nitrogen, carbohydrate by subtraction. Only fat and water are directly assayed.
- **The merge does not disturb it, structurally.** Energy cannot exist without its macros, because USDA computed one from the other. _Measured_ over all 190 twinned pairs: **0** borrow a macro underneath the base record's own calorie, and coherence is unchanged on all 181 pairs where it can be measured. ADR-0045 §3 holds.
- **The residual is nine pairs** that borrow the calorie itself, all foods where Foundation assayed a partial panel: five oils, two butters, salt, blackberries. Worst case is salted butter at roughly 3%.
- **Two things are worth knowing that the merge did not cause.** Calories and macros already disagree inside single USDA records — 30 of Foundation's 321 fail to reconcile — and USDA's general factors count fibre at 4 kcal/g where UK labelling uses 2, which puts our chia roughly 10% above what a British packet would claim.

## 2. The derivation chain

Documented by USDA and confirmed against the archives:

```
nitrogen ──× Jones factor──▶ protein ──┐
water, ash, alcohol ───────────────────┼──▶ carbohydrate by difference
fat (assayed) ─────────────────────────┘              │
                                                       ▼
                                   energy = Σ (macro × Atwater factor)
```

- **Protein is not measured.** "The values for protein are calculated from the amount of total nitrogen in the food using the nitrogen-to-protein conversion factors recommended by Jones (1941)" ([Foundation Foods Documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)), defaulting to 6.25. Each record publishes its own as `.ProteinConversionFactor`.
- **Carbohydrate is not measured either.** It is "the difference between 100 and the sum of the percentages of water, protein, total lipid (fat), ash, and alcohol (when present)" ([FDC FAQ](https://fdc.nal.usda.gov/faq/)). Every analytical error in the other four lands here, and then in the calorie.
- **Energy is the sum.** "Most energy values are calculated using the Atwater general factors of 4, 9, and 4 for protein, fat, and carbohydrates" (FAQ); where USDA has per-food factors from Handbook 74 it also publishes a specific-factor value, and "whenever possible, profiles of foods with energy values calculated using specific factors will also include values calculated using general factors".

Three nutrient ids carry the result:

| Id       | Name                              | What it is                                                              |
| -------- | --------------------------------- | ----------------------------------------------------------------------- |
| **1008** | Energy                            | the legacy row: specific factors where USDA has them, general where not |
| **2047** | Energy (Atwater General Factors)  | flat 4 / 4 / 9                                                          |
| **2048** | Energy (Atwater Specific Factors) | the record's own `.CalorieConversionFactor`, per Handbook 74            |

Hummus, commercial publishes `proteinValue 3.47, fatValue 8.37, carbohydrateValue 4.07` — its own factors, all below the general ones.

## 3. What each dataset actually does

_Measured_, with "reads" meaning the id the app's preference order lands on (1008, then 2047, then 2048 — `PANEL_FIELDS` in `usda-fdc.ts`):

| Dataset    | Reads 1008 | Reads 2047 | Reads nothing | Also publishes 2048 | Reconcile with their own macros |
| ---------- | ---------- | ---------- | ------------- | ------------------- | ------------------------------- |
| Foundation | 95         | 226        | 42            | 199                 | 291 / 321                       |
| SR Legacy  | 7,793      | 0          | 0             | 0                   | 7,007 / 7,793                   |

Reading notes:

- **The 95 and the 226 are disjoint.** A Foundation record publishes either the legacy row or the two Atwater rows, never both, so the app's preference order never has to arbitrate.
- **Reconciliation is judged under the system the id names** — 2047 against 4/4/9, 2048 and 1008 against the record's own factors where it publishes them, general where it does not, with a tolerance of a kilocalorie or a percent, whichever is larger, because the archives publish three significant figures and the arithmetic happens behind them.
- **How a record was derived predicts whether it reconciles.** SR Legacy's energy is `NC` (Calculated) on 6,668 records, of which **311 fail to reconcile — 5%**. On the other 1,125, derived some other way, **475 fail — 42%**:

| Code       | Records | Fail | Meaning, in USDA's own words                                 |
| ---------- | ------- | ---- | ------------------------------------------------------------ |
| `NC`       | 6,668   | 5%   | Calculated                                                   |
| `MC`       | 417     | 54%  | Manufacturer supplied; calculated by manufacturer or unknown |
| _unstated_ | 179     | 41%  | no derivation given                                          |
| `LC`       | 136     | 63%  | Label claim, back-calculated from the label by NDL staff     |
| `PIK`      | 131     | 11%  | Based on physical composition; derived from imputed data     |
| `RPI`      | 64      | 22%  | Recipe, per package directions, no adjustments applied       |

A label-claim energy is a rounded number off a packet, so it disagreeing with the macros is expected rather than alarming. This is USDA's own gap-filling, visible in the data and inherited by anything reading SR Legacy — including our merge, where SR is the fill source.

## 4. Does the merge disturb it?

**No, and it cannot, for one structural reason: energy travels with its macros.**

_Measured_ over Foundation: of the 321 records stating energy, **0** lack a full macro set; of the 42 stating none, **0** have one. That is not a coincidence but an identity — USDA cannot publish a calculated energy without the values it calculated from.

That fact disposes of the failure worth worrying about. ADR-0045 §2 fills only the fields the base record lacks, so the dangerous case is a panel showing Foundation's calorie above a carbohydrate borrowed from SR Legacy — a number its own grams do not produce. It cannot arise, because a Foundation record with a calorie has all three macros already.

_Measured_ over all 190 twinned pairs:

| Outcome                                                           | Pairs     |
| ----------------------------------------------------------------- | --------- |
| Borrow a macro underneath the base record's own calorie           | **0**     |
| Borrow the calorie itself                                         | 9         |
| Coherence unchanged before and after the merge (where measurable) | 181 / 181 |

**The nine borrowers** are exactly the foods where Foundation assayed part of a panel: canola, corn, soybean, peanut and safflower oil; salted and unsalted butter; table salt; raw blackberries. For these the calorie comes from SR Legacy while a macro may still be Foundation's, so the two are not from one arithmetic:

| Food                  | Shown | 4/4/9 over the macros shown | Why                                        |
| --------------------- | ----- | --------------------------- | ------------------------------------------ |
| Butter, stick, salted | 717   | 743                         | fat is Foundation's 82.2 g, SR's is 81.1 g |
| Oil, canola           | 884   | 900                         | SR's specific factor for oils is below 9   |
| Blackberries, raw     | 43    | 49                          | protein is Foundation's, the rest SR's     |
| Salt, table, iodized  | 0     | 0                           | no disagreement to have                    |

Roughly 2–3%, on foods where showing the borrowed figure beats showing none. Worth knowing; not worth a mechanism.

## 5. Two findings the merge did not cause

### 5.1 Calories and macros already disagree inside single records

30 of Foundation's 321 energy-stating records do not reconcile with their own macros, every one of them by more than 1%. They split cleanly in two, and the split is informative:

**The 11 read from 2047 miss low, consistently, and are all flesh foods.**

| Food                             | Stated (2047) | 4/4/9 over its own macros | Implied protein ÷ nitrogen | Published protein ÷ nitrogen |
| -------------------------------- | ------------- | ------------------------- | -------------------------- | ---------------------------- |
| Fish, cod, Atlantic, wild caught | 66            | 70.4                      | 5.84                       | 6.26                         |
| Fish, tilapia, farm raised       | 94.7          | 98.3                      | 5.95                       | 6.25                         |
| Beef, ground, 90% lean           | 185           | 188                       | 6.02                       | 6.28                         |
| Chicken, breast, boneless        | 106           | 107.4                     | 6.15                       | 6.25                         |

The published protein row is a clean nitrogen × 6.25 in every case, while the protein the energy was computed over runs nearer 6.0 × nitrogen.

**The 19 read from 1008 miss further and in both directions** — ketchup +13.6%, pasta sauce −12%, overripe bananas +10.9%, raw garlic +10.1%, whole wheat flour +6.9%. The obvious explanation is that these legacy rows were carried over from SR Legacy rather than recomputed. _Measured:_ they were not. Of the 19, **none** states the same energy as its SR Legacy twin, and 7 have no twin at all.

Either way the operative fact is the same and it holds before any merging: **the calorie and the macro row inside one USDA record are not always the same arithmetic.** Anything that recomputes calories from displayed macros, or asserts to a user that the two agree, is building on sand. The app does neither — it displays USDA's kcal and USDA's grams as separate facts, which is the right call.

### 5.2 USDA counts fibre at 4 kcal/g; UK labelling counts it at 2

Atwater general factors apply 4 kcal/g to carbohydrate by difference, which includes fibre. UK and EU labelling rules use 2 kcal/g for fibre. For a high-fibre whole food the gap is not rounding:

| Chia seeds, dried, per 100 g                 | kcal    |
| -------------------------------------------- | ------- |
| Plain 4/4/9 over its macros                  | 511     |
| **What SR Legacy states** (specific factors) | **486** |
| Recomputed with fibre at 2 kcal/g            | 442     |

USDA's specific factors already discount some of it, which is why the stated 486 sits between. Against a British packet our panel still reads about 10% high for chia, and similarly for pulses. This is a property of choosing USDA as the authority ([ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §1), not a defect in the merge, and it interacts with the "not reported versus zero" work research note [#108](108-base-food-composition-sources.md) names as escalation step 1. It is raised separately as [#122](https://github.com/palebluebytes/inventoria/issues/122); nothing here proposes acting on it.

## 6. What this does not establish

- **Whether USDA's factors are right.** This measures what the archives say and whether it is internally consistent, not whether the metabolisable energy is correct for a human.
- **FNDDS and Branded.** Both are outside the base-food path (ADR-0034 §8, ADR-0042) and were not measured.
- **The 786 SR Legacy records that do not reconcile.** Their derivation codes say they were imputed or borrowed rather than calculated in place; which foods and how far off is unmeasured.
- **Why the meat and fish energies imply a lower protein**, and why the 19 legacy rows miss in both directions. Both patterns are measured; neither cause is established, and USDA's documentation does not address either. The carried-over-from-the-twin explanation was tested and refuted.
- **Whether any energy is truly analytical.** 30 SR Legacy records carry `A` or `MA` — "Analytical" and "Manufacturer supplied, analytical data". For energy this most likely means derived from analytical macros rather than combusted, since USDA documents only Atwater routes, but the codes do not say so outright and this note does not settle it.

## Caveat

"Reconciles" here means the stated energy is within a point of what the record's own macros produce under the factor system its nutrient id names. A record can reconcile perfectly and still be wrong about the food: reconciliation is internal consistency, not accuracy, and says nothing about how old the assay is or how many samples stood behind it.
