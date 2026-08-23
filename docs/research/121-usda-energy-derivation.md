# Research: how USDA derives a calorie, and whether the twin merge disturbs it (#121)

**Grounds:** `mapFdcFoodToPayload` / `fillFromTwin` in `src/lib/food/usda-fdc.ts`; [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) §2 and §3, whose energy-coherence argument this tests.
**Sibling:** [#119](https://github.com/palebluebytes/inventoria/issues/119) built the archive reader and the `ndbNumber` join this measures over.
**Date:** 2026-08-19. Figures marked _measured_ were computed that day over the complete bulk archives in `.usda-backup/` — Foundation 2026-04-30 (363 records) and SR Legacy 2018-04 (7,793) — and are reproduced by `pnpm usda:coverage`, which verifies each archive's sha256 against `scripts/usda-backup.manifest.json` before counting. Documentary claims come from the pages cited. **Status:** research only — no code beyond the measurement, no ADR.  
**Corrected by:** the [#122 Addendum](#addendum-2026-08-23-122-52-was-right-about-the-mechanism-and-wrong-about-the-size-and-the-direction) below, which overturns §5.2's chia table and the "roughly 10%" in §1's last bullet, and measures the comparison over the shipped corpus in both directions.

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

> **Overtaken.** Every figure in this section was superseded when #122 was settled: the chia record we ship is no longer the SR Legacy row, the gap is 15.3% rather than "about 10%", and it does not run one way. See the [#122 Addendum](#addendum-2026-08-23-122-52-was-right-about-the-mechanism-and-wrong-about-the-size-and-the-direction) below.

## 6. What this does not establish

- **Whether USDA's factors are right.** This measures what the archives say and whether it is internally consistent, not whether the metabolisable energy is correct for a human.
- **FNDDS and Branded.** Both are outside the base-food path (ADR-0034 §8, ADR-0042) and were not measured.
- **The 786 SR Legacy records that do not reconcile.** Their derivation codes say they were imputed or borrowed rather than calculated in place; which foods and how far off is unmeasured.
- **Why the meat and fish energies imply a lower protein**, and why the 19 legacy rows miss in both directions. Both patterns are measured; neither cause is established, and USDA's documentation does not address either. The carried-over-from-the-twin explanation was tested and refuted.
- **Whether any energy is truly analytical.** 30 SR Legacy records carry `A` or `MA` — "Analytical" and "Manufacturer supplied, analytical data". For energy this most likely means derived from analytical macros rather than combusted, since USDA documents only Atwater routes, but the codes do not say so outright and this note does not settle it.

## Caveat

"Reconciles" here means the stated energy is within a point of what the record's own macros produce under the factor system its nutrient id names. A record can reconcile perfectly and still be wrong about the food: reconciliation is internal consistency, not accuracy, and says nothing about how old the assay is or how many samples stood behind it.

---

## Addendum (2026-08-23, #122): §5.2 was right about the mechanism and wrong about the size and the direction

§5.2 was written against the archives. [#122](https://github.com/palebluebytes/inventoria/issues/122) asked what to do about it, and answering that meant measuring the same thing over the corpus we actually ship. Three of §5.2's claims did not survive, and one of them was the load-bearing one.

**Method.** Over `public/usda/nutrient-store.json` as generated at `420cc37` — 4,360 foods, the artefact the app reads. "What we display" is the energy the app's own preference order lands on (1008, then 2047, then 2048; `PANEL_FIELDS` in `usda-fdc.ts`). "The EU figure" is what Regulation 1169/2011 Annex XIV produces from the same record: `4×protein + 9×fat + 4×carbohydrate + 7×alcohol − 2×fibre`, the subtraction being what turns USDA's carbohydrate _by difference_ — which includes fibre — into the available carbohydrate at 4 plus fibre at 2. Polyols and organic acids are ignored; neither is carried in the panel. Of the 4,360, **8** state no energy, **397** carry no fibre row at all (absent, not zero — ADR-0048 §1, so the comparison is not computable rather than trivially equal), and **12** produce an EU figure at or below 5 kcal, where a percentage means nothing. **3,943 rows remain**, and every figure below is over those. This is not wired into `pnpm usda:coverage`: that script reads the archives, this reads the bundle, and the two inputs should not share a script.

### The mechanism is real, and §5.2 understated it on the food it chose

| Chia seeds, per 100 g                                                                             | kcal    |
| ------------------------------------------------------------------------------------------------- | ------- |
| §5.2's table, `Seeds, chia seeds, dried` (SR Legacy 170554)                                       | 486     |
| **What we ship**, `Chia seeds, dry, raw` (Foundation 2710819, merged fill-only under ADR-0045 §2) | **517** |
| The EU figure for the record we ship                                                              | 448     |

**+69 kcal, 15.3%** — not the "about 10%" §5.2 and §1 both quote. The sentence _"USDA's specific factors already discount some of it, which is why the stated 486 sits between"_ is now false for this food: the Foundation record is the base of the merge and carries its own energy under general factors, so the SR row's specific factors never reach the display. Chia sits in the top handful of the whole corpus on this measure.

### It does not run one way, and the biggest deviations run the other way

This is the finding §5.2 missed, and it is the one that decided #122.

|                                   | rows        |
| --------------------------------- | ----------- |
| we read **high** by ≥5%           | 598         |
| we read **low** by ≥5%            | **240**     |
| within ±3% either way             | 2,009 (51%) |
| high by ≥10% _and_ ≥25 kcal/100 g | 28          |

The largest absolute deviations in the corpus are **under**-reports:

| Food                           | We show | EU figure |      |
| ------------------------------ | ------- | --------- | ---- |
| Cocoa, dry powder, unsweetened | 228     | 359       | −131 |
| Oat bran, raw                  | 246     | 366       | −120 |
| Seaweed, spirulina, dried      | 290     | 388       | −98  |
| Wheat bran, crude              | 216     | 273       | −57  |

Two causes, and neither is the fibre factor. USDA's per-food specific factors over-discount high-fibre plant foods past what the EU convention would take off; and some rows do not reconcile with their own macros at all — **191 of the 240 low rows sit more than 10% below their own flat 4/4/9**, which is §5.1's population, not §5.2's. A disclosure saying "we count fibre generously, so we read high" would be plainly wrong in front of oat bran, and oat bran is a food a British user logs.

### Most of it is small

| Absolute gap   | rows        |
| -------------- | ----------- |
| ≥10 kcal/100 g | 526 (13.3%) |
| ≥20            | 201 (5.1%)  |
| ≥30            | 92 (2.3%)   |
| ≥50            | 24 (0.6%)   |

Median 4.9 kcal/100 g, p90 13.1, p95 20.4, p99 41.0, max 144. Everyday high-fibre foods land modestly: cooked lentils 116 vs 104, wholemeal bread 252 vs 240. Raw broccoli reads 31 against an EU figure of 34 — **low**, by 7.8%.

### The class the ticket's correction asked about is 118 pairs, and it is not fibre

The #122 comment asked how large the class is where a Foundation re-assay won the merge from an SR Legacy row carrying specific factors. Measured over the 190 twinned pairs: **181 state energy on both sides, and 118 read higher under Foundation, 102 of them by ≥2%.**

But the premise needs correcting. **SR Legacy publishes nutrient id 2048 on 0 of its 7,793 records** — §3's table says as much — so no specific-factor row is being displaced; SR's specific factors, where it has them, are folded into `1008`. And the largest movers carry almost no fibre: bok choy +56%, collards +47%, leaf lettuce +35–47%, mushrooms +38–42%, Brussels sprouts +38%. That is a newer assay reporting different macros, which is exactly what ADR-0045 §2 buys. It is a larger effect than fibre and a different one, and it is carried out to [#147](https://github.com/palebluebytes/inventoria/issues/147) rather than folded in here.

### What #122 decided

Nothing is recomputed. [ADR-0048](../adr/0048-an-absent-measurement-is-not-a-zero.md) §3 already forecloses it — _"No panel's energy is ever computed from other fields — not by Atwater factors"_ — so the option §5.2's ticket wanted argued was never live. The panel discloses instead, in one sentence of the USDA source explainer, and the decision is recorded as an amendment to [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md).

One "Related" line in the ticket is also settled: the "not reported versus zero" gap this section pointed at closed under ADR-0048, so the two no longer want settling together.
