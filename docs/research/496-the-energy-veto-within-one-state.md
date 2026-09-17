# Research: does the energy veto survive the declared-state partition? (#496)

**Grounds:** `pnpm veto:census` (`scripts/veto-census.mjs`), composed entirely from machinery [#243](https://github.com/palebluebytes/inventoria/issues/243) and [#497](https://github.com/palebluebytes/inventoria/issues/497) already ship. The as-bought state set is the committed `public/usda/search-index.json` (2,023 rows), read as `pairing-census.mjs` reads it; the cooked state set is `pairing-target-census.mjs`'s lifted arm rebuilt from the committed archives with `isCookedForm` stubbed to `false` and collapsed (1,182 rows); the two sets overlap in **0** rows. The offer is the app's own `searchIndexRows` asked #243's queries, keeping every hit. The harm axis is #243's divergence instrument verbatim — worst material metered micronutrient, floor 0.1 of the daily target. No artifact was regenerated; `public/usda/` is untouched.
**Siblings:** parent map [#240](https://github.com/palebluebytes/inventoria/issues/240). [#489](https://github.com/palebluebytes/inventoria/issues/489) settled the veto; [#497](https://github.com/palebluebytes/inventoria/issues/497) found it had no measured wrong-food catch; [#510](https://github.com/palebluebytes/inventoria/issues/510) partitioned by Declared state and handed this ticket its question a second time. [#513](https://github.com/palebluebytes/inventoria/issues/513) writes ADR-0111.
**Date:** 2026-09-17. **Status:** measured, and the ticket ruled on it. The ledger export is personal data, lives outside every working tree and is not committed (ADR-0064); what is committed is the adjudication, in `scripts/pairing-adjudication.mjs`.

---

## 0. What was actually unmeasured

Every number #243 and #497 produced is about a **cross-state** confusion. #510's Declared state refuses those by construction, symmetrically, so the only population left for a veto to defend against is a **wrong food of the right state** — and nobody had measured it. That is this census.

## 1. Within its own state, every right pairing lands under 2.5×

All 25 adjudicated pairings (#243's 22, plus the three #497 added and #510 shipped), each scored inside its own declared state:

|            | ratio |
| ---------- | ----: |
| min        | ×0.24 |
| median     | ×1.03 |
| max        | ×2.22 |
| above 2.5× |     0 |
| below 0.7× |     5 |
| below 0.4× |     2 |

The three cooked additions land at ×0.97, ×1.22 and ×1.55; as cross-state gaps they read ×3.20 and ×4.01. **`Pepinillo Laminado`'s ×2.22 is not a state gap and the partition does not remove it** — sliced gherkin in vinegar and sugar against `Pickles, cucumber, sweet`, both sides as-bought — so #489's one-row margin survives. It is a sugar-loading difference, not the dry-food-plus-water asymmetry #489's one-sidedness was argued from, and it now has a mirror: the low edge rests on one row too, the almond drink at ×0.24. **Two one-row margins, not one.**

## 2. The band that admits every right pairing admits most wrong rows too

The zero-cost band is therefore ×0.24 .. ×2.22. Against the rows the shipped search actually offers inside one state:

| instrument                               |   n | inside the band | above 2.5× | below 0.7× |
| ---------------------------------------- | --: | --------------: | ---------: | ---------: |
| offered by the search, in state          | 138 |        80 (58%) |         32 |         42 |
| head-phrase siblings, in state (#497 §4) | 512 |       491 (96%) |          4 |         75 |

Two instruments because 10 of the 25 twins cannot be asked at all: their OFF categories reach no row. That includes **all three cooked twins** — no query reaches the cooked index — so the cooked state has no measurable typed-query population and its numbers come from head-phrase siblings alone, over a ground truth of three packs.

## 3. The finding: energy and harm are anti-correlated

Counting rows prices a band's reach. It says nothing about whether the rows it reaches are worth refusing. Cross-tabbing energy against #243's divergence instrument, over the 29 rows that are **both** search-offered and head-phrase siblings — the rows a person could plausibly tap yes to:

| band                         | catches | of those, carrying ≥2× material harm | harmful ones missed |
| ---------------------------- | ------: | -----------------------------------: | ------------------: |
| one-sided ×2.5 (#489, today) |       3 |                                **0** |                  12 |
| zero-cost ×0.24 .. ×2.22     |       3 |                                **0** |                  12 |
| symmetric ×0.40 .. ×2.50     |       8 |                                    1 |                  11 |
| symmetric ×0.70 .. ×1.43     |      10 |                                    3 |                   9 |

The three rows the shipped rule catches are `Pickles, chowchow` (×2.95), `Pickles, cucumber, sweet, low sodium` (×2.98) and `Vinegar, balsamic` (×3.31). **Every one is ×1.00 on all twelve metered micronutrients** — the veto's entire measured catch is rows that would have cost nothing. One of them, the low-sodium sweet pickle, is very nearly the row the hand actually chose.

Meanwhile every plausible wrong row that carries harm sits inside the band:

```
harm ×  inf  vitamin_e     energy ×1.33   Espinaca picada → Spinach, baby
harm ×  inf  vitamin_b12   energy ×0.68   Yogur natural   → Yogurt, plain, nonfat
harm ×25.17  vitamin_b12   energy ×1.22   Emmental        → Cheese, goat, hard type
harm × 9.48  folate        energy ×1.01   Liguine         → Pasta, gluten-free, corn, dry
harm × 3.14  folate        energy ×0.39   Dark Soy Sauce  → Soy sauce … low sodium
```

All five of #243's hand-graded "a person would tap yes" errors sit between **×0.74 and ×1.10**. 43 of the 80 wrong rows inside the band carry ≥10× divergence; 34 carry an infinite one.

**This is structural, not bad luck.** A wrong row matching your label on energy is a food that resembles yours in _macros_, which is exactly the condition under which a micronutrient differs by 25× — B12 across dairy, folate across enriched and unenriched pasta. **Energy is a macro; a pairing spends micros.** The veto measures the one axis the transaction does not risk.

## 4. The low arm is free and worthless

A low arm buys +26 refusals at zero cost in right pairings, and #497's reverse errors do land low. But in substance it catches nothing metered, and its most plausible refusals are `Pickles, cucumber, sour` and `Pickles, cucumber, dill` at ×0.27–0.29 — **the same food in a different brine**, four rows, all of which a symmetric band refuses outright. Tightening to ×0.70 .. ×1.43 finally catches 3 harmful rows, at a cost of 7 of the 25 right pairings.

## 5. What this does not measure

1. **#510's partition is a decision, not code.** Nothing is built: no declared-state field, no Pairing index artifact. The two state sets here are #497's two arms, which is what #510 ruled would ship. If the shipped partition differs, every cooked-side number moves.
2. **Cooked ground truth is 3 packs of 35**, all pulses, two sharing a head phrase. Indicative, not a population. The decisive table in §3 is as-bought, where the population is real.
3. **Plausibility is a hand judgement.** 138 rows were not re-adjudicated; two mechanical proxies stand in, both reported, plus #243's already-graded five.
4. **`Espinaca picada` could be declared either state.** #497 §4 measured the cooked row at ×1.38 → ×1.15; not re-derived here.
