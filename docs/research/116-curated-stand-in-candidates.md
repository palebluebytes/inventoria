# Research: vetting the next curated stand-in candidates against the ADR-0046 bar (#116)

**Grounds:** [ADR-0046](../adr/0046-curated-stand-ins-for-base-foods-usda-lacks.md) §2's four admissions, applied one candidate at a time. Absence measured over the complete mirrored archives `scripts/usda-backup.manifest.json` pins, and over CIQUAL 2025 pulled from its Dataverse DOI (`doi:10.57745/RDMHWY`, `alim_2025_11_03.xml` and the composition workbook beside it). Corpus verdicts come from `pnpm usda:ranking-audit --explain`, which runs the shipped filters rather than restating them.
**Siblings:** [#109](109-base-foods-no-composition-table-carries.md) §6 named seven of the eight candidates, "reasoned about, not measured". [#108](108-base-food-composition-sources.md) measured CoFID's holes. [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md)'s #141 Amendment routed `double cream` here.
**Date:** 2026-08-21. Every figure marked below was computed that day from the primary distribution named — complete datasets, not samples, unless a count is given. **Status:** research only. One addition and seven rejections; the decisions are recorded in ADR-0046's #116 Amendment.

---

## 1. Bottom line up front

- **Eight candidates, one admitted.** `double cream` joins the list. The other seven are rejected, and each rejection is written down below so nobody re-litigates the same food.
- **Four fail the first admission outright** — `nutritional yeast`, `oat drink`, `kefir` and `tempeh` are all carried by a reference table. Three of the four are carried by CIQUAL, which is a finding about CIQUAL rather than about them.
- **Three fail on the record, not the absence.** `lucuma` and `tigernut flour` are genuinely absent everywhere and have no panel worth pinning; `green jackfruit` is absent as a food and is sold as a compound one.
- **The ceiling is not reached.** Two of eight seats are taken and six are free, so ADR-0046 §6's trigger has not fired.
- **Energy transferred this time.** The reconstruction that corroborates double cream lands on the label's energy to within 1.3%, where the same check on cacao nibs missed by 20%. The difference is fibre, and the reason is worth keeping.

## 2. What the candidates were, and where they came from

#109 §6 listed seven plausible neighbours of cacao nibs — nutritional yeast, lucuma, tigernut flour, green jackfruit, oat drink, kefir, tempeh — and said in terms that they were "reasoned about, not measured; treat them as a place to look, not as a worklist". #141 added an eighth from a different direction: `double cream` was cut from the hand-written search vocabulary because it passes every mechanical admission a vocabulary entry has and fails the one about the food, and ADR-0049's #141 Amendment sent the argument here.

Eight candidates against seven free seats is the arithmetic the ticket flagged. It did not bind: seven candidates fail.

## 3. Admission 1, measured: which tables carry the food

Searched over the complete archives, by description, then re-asked of the shipped corpus through the real generator.

| Candidate         | Foundation 363              | SR Legacy 7,793                                     | Survey FNDDS 5,432   | CIQUAL 2025 (3,484)                             | Corpus                      |
| ----------------- | --------------------------- | --------------------------------------------------- | -------------------- | ----------------------------------------------- | --------------------------- |
| nutritional yeast | –                           | baker's yeast, yeast extract spread                 | `Yeast` (2710005)    | **`Yeast, flakes` (11009)**                     | `Yeast extract spread` only |
| lucuma            | –                           | –                                                   | –                    | –                                               | nothing                     |
| tigernut flour    | –                           | –                                                   | –                    | –                                               | nothing                     |
| green jackfruit   | –                           | `Jackfruit, raw`, `Jackfruit, canned, syrup pack`   | –                    | `Jackfruit, flesh without skin, raw` (13499)    | `Jackfruit, raw`            |
| oat drink         | **`Oat milk, unsweetened`** | –                                                   | `Oat milk` (2705412) | **`Oat drink, plain, no added sugar` (18899)**  | `Oat milk, unsweetened…`    |
| kefir             | –                           | `Kefir, lowfat, plain, LIFEWAY`, `…, strawberry, …` | `Kefir` (2705394)    | **`Milk kefir` (19865)**, `Water kefir` (18316) | nothing (brand-specific)    |
| tempeh            | –                           | **`Tempeh`, `Tempeh, cooked`**                      | –                    | **`Tempeh` (20917)**                            | both                        |
| double cream      | max 35.6 g fat              | max 36.1 g fat                                      | max 35.6 g fat       | max `>= 35% MG`                                 | `Cream, heavy` at 35.6 g    |

Four candidates die here, and each dies differently enough to be worth stating separately.

**`tempeh` is simply carried.** SR Legacy holds `Tempeh` (192 kcal, 20.3 g protein) and `Tempeh, cooked`; both ship. CIQUAL carries it too. Nothing was missing.

**`oat drink` is carried, and the search miss is a vocabulary miss.** Foundation's `Oat milk, unsweetened, plain, refrigerated` ships and answers `oat milk`. `oat drink` retrieves nothing only because the word `drink` appears in no description — which is the #141 shape exactly, inverted: a name USDA **has** an equivalent for is a vocabulary problem, not a coverage hole. It belongs in `LOCAL_VOCABULARY` (7 of 20 seats used), not here.

**`nutritional yeast` is carried by CIQUAL, and the corpus miss is a filter outcome.** CIQUAL 11009 `Levure de bière en paillettes` / `Yeast, flakes` is the deactivated food-yeast flake at 334 kcal, 40.4 g protein, 22.5 g fibre — the food sold on a UK shelf as nutritional yeast. USDA's nearest is `Leavening agents, yeast, baker's, active dry`, which the ADR-0042 `prepared` filter drops, and FNDDS's `Yeast` is that same record re-published (325 kcal, 40.4 g protein, 26.9 g fibre, 0.07 µg B12 — identical in every field). A _fortified_ nutritional yeast is a different matter: Engevita and Marigold declare B12 two to three orders of magnitude above either table, and the panel carries B12 against a 2.4 µg target. But a fortification level is a formulation a manufacturer chose, and that is the barcode path by construction, not a base food any table should be expected to hold.

**`kefir` is carried three times over, and the corpus miss is the brand filter.** SR Legacy's two records are both LIFEWAY and both dropped as brand-specific; FNDDS carries a generic `Kefir` but is not a bundled dataset; CIQUAL carries `Milk kefir`. So search returns nothing for `kefir` today, and every reason it does is a decision this project made about which rows to ship — not an absence upstream. ADR-0048 §7 widened eligibility to "a food for which no reference table yields a record this app can honestly log", and it is worth being precise that it does not stretch this far: the tables yield three usable kefir records, and curating around our own filter would make the exception list a place to park filter regressions.

## 4. `lucuma`: absent, and no panel worth pinning

Absence is real — no `lucuma` in any USDA archive, none in CIQUAL. It fails admission 3.

_Measured_ over 122 OFF products returned for `lucuma`, `lucuma powder` and `lucuma en polvo`: **8 are single-ingredient lucuma powder with a panel.** They do not agree.

| Barcode         | kcal | fat | carb | sugar | fibre | protein |
| --------------- | ---- | --- | ---- | ----- | ----- | ------- |
| `0658263085670` | 400  | 0   | 86.7 | 13.3  | 0     | 6.67    |
| `0858861000659` | 400  | 0   | 80   | 20    | 40    | 0       |
| `0858847000659` | 400  | 0   | 80   | 20    | 40    | 0       |
| `0805509330159` | 400  | 0   | 86.7 | 46.7  | 6.67  | 6.67    |
| `24097031`      | 378  | 0   | 86.7 | 13.3  | –     | 6.7     |
| `0760488373873` | 350  | 0   | 87.5 | 27.5  | 27.5  | 2.5     |
| `3760222090193` | 329  | 2.4 | 14.8 | –     | 2.3   | 1.4     |
| `5600317477943` | 306  | 1.1 | 57   | 32    | 26    | 4       |

Carbohydrate spans 14.8 to 87.5 g, fibre 0 to 40 g, protein 0 to 6.7 g. Two records are byte-identical across different brands, which is #109's descent caveat visible in eight rows. And admission 4 has nothing to offer: lucuma is a whole dried fruit, and no reference table carries a part of it to recombine the way cocoa powder and cocoa butter recombine into nibs. A median over this field is arithmetic, not a consensus.

## 5. `tigernut flour`: absent, and the field cannot agree what its energy is

Absent from every USDA archive and from CIQUAL, under `tigernut`, `tiger nut`, `chufa` and `souchet` alike. It fails admission 3, and it fails it on the one number ADR-0048 made load-bearing.

_Measured_ over 31 OFF products from four queries, **8 are single-ingredient with a panel.** Fat converges tightly — 23.3 to 26 g, clustered at 24.9 — and so does protein at 4.6. Energy does not: **376, 400, 435, 464, 469, 497, 562, 563 kcal.**

Worse, the spread is not measurement noise between different flours. Four French records (`3760087360615`, `2000000016733`, `3266191037097`, `3329487002503`) carry the _same_ declared macros — 24.9 g fat, 63.6 g carbohydrate, 33 g fibre, 4.58 g protein — and the _same_ 2,344 kJ, and then disagree with themselves about the kcal beside it:

- **560 kcal** is what 2,344 kJ converts to, and what those macros give under EU factors with the fibre counted outside the carbohydrate.
- **497 kcal** is what the same macros give under US factors, with fibre inside the carbohydrate at 4 kcal/g. Two of the four records print this.
- **426 kcal** is what they give under EU factors with fibre inside the carbohydrate.

The panel cannot be read all three ways at once: 24.9 + 63.6 + 33.0 + 4.6 is 126 g per 100 g, so at least one declared figure is wrong on every record in that cluster. This is the convention gap #109 §5 found on cacao nibs, except that there the manufacturers agreed with each other (633 kcal, n=21) and only USDA's factors dissented. Here the manufacturers do not agree with themselves. Admission 4 offers nothing either — tigernut is a tuber no table carries a fraction of.

## 6. `green jackfruit`: a canned preparation, not a base ingredient

USDA's `Jackfruit, raw` and CIQUAL's 13499 are the same record (1.72 g protein, 19.1 g sugars, 1.5 g fibre) and both describe the **ripe** fruit. Unripe jackfruit is a different food — the meat substitute is picked green at roughly a twentieth of the sugar — and no table carries it. So the absence stands.

It fails admission 2, and for a physical reason rather than a bookkeeping one. _Measured_ over 88 OFF products from three queries: **green jackfruit is sold canned in brine**, and all but four of the records with an ingredients list read "young green jackfruit, water, salt, citric acid" or a variant. ADR-0046 §2 says a compound product never stands in for an ingredient, and the field shows why the rule bites here: **declared salt runs from 0.0275 to 2.1 g per 100 g**, a factor of 76, because how much brine came out of the tin with the fruit is a property of the pack and of the cook, not of the food. Energy over the same field runs 17 to 120 kcal.

The four single-ingredient records do not rescue it: 17, 40, 45 and 50 kcal, with fibre at 4.3, 7.9, 7.9 and 9.5 g, and one of them declaring 0.64 g of salt beside an ingredients list that names only jackfruit — an incomplete list, not a brine-free product. This is ADR-0046's own sentence about where such a candidate goes: "the barcode path, where the user scans their own pack and owns the transcription".

## 7. `double cream`: admitted

### 7.1 The absence (admission 1)

UK double cream is a compositional standard of **not less than 48% milk fat**. Every table climbs the cream ladder and stops a rung short:

| Table        | Fattiest cream                          | Fat    | Energy   |
| ------------ | --------------------------------------- | ------ | -------- |
| Foundation   | `Cream, heavy` (2346386)                | 35.6 g | 343 kcal |
| SR Legacy    | `Cream, fluid, heavy whipping` (170859) | 36.1 g | 340 kcal |
| Survey FNDDS | `Cream, heavy` (2705597)                | 35.6 g | 343 kcal |
| CIQUAL 2025  | `Crème d'Isigny, >= 35% MG` (19411)     | ≥ 35 % | 382 kcal |

Nothing in any of them describes a cream at 48%, and nothing in any of them is named `double cream` or `clotted`. The nearest survivor is `Cream, heavy`, which understates the macro that dominates the food by about a quarter, and energy with it. That is the same shape as the cacao-nibs case at a smaller magnitude — a factor of 1.4 rather than 4 — and it lands on a food a UK user weighs into recipes weekly rather than on an edge case.

### 7.2 The record, and the consensus behind it (admissions 2 and 3)

_Measured_ over 500 OFF products returned for `double cream`: **58 are plain UK or Irish double cream with a panel** (cheeses, flavoured creams and the Australian and Swiss products under the same words excluded — those are different standards), and **23 of the 58 are single-ingredient**. The field is tight where the earlier candidates' fields were not:

| Per 100 g    | Median (n=58) | Range     |
| ------------ | ------------- | --------- |
| Energy       | **467 kcal**  | 427–497   |
| Fat          | **50.5 g**    | 45–53.7   |
| Saturated    | **31.4 g**    | 27.7–33.4 |
| Carbohydrate | **1.6 g**     | 1.5–5.3   |
| Protein      | **1.5 g**     | 1.5–2     |

Shortlist, by how well-formed the record is rather than by scan count:

| Barcode         | Brand       | Completeness | kcal / fat / sat / carb / protein | Why it did or did not win                                                                                                                                               |
| --------------- | ----------- | ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5010251341352` | Morrisons   | 0.788        | 467 / 50.5 / 31.4 / 1.6 / 1.5     | **Chosen.** `ingredients_text` is "pasteurised double cream" — the food and nothing else, which is what admission 2 asks. Dead on every median, OFF rates it **NOVA 1** |
| `5051399457437` | Tesco       | 0.888        | 467 / 50.5 / 31.4 / 1.6 / 1.5     | Higher completeness, a serving quantity, salt on the field's mode, and one more scan — but its ingredients text carries an allergen sentence alongside the ingredient   |
| `5000128795272` | Co-Op       | 0.788        | 467 / 51 / 31 / 1.6 / 1.5         | "Double cream" is as clean, but the panel is a rung off the median on fat and saturated fat                                                                             |
| `01510294`      | Sainsbury's | 1.087        | 467 / 50.5 / 31.4 / 1.6 / 1.5     | The highest completeness in the field, but filed under `en:cheeses`-adjacent tags and rated **NOVA 2**, which would make the processing badge read wrong                |

**One caveat worth recording**, in the shape of #109's UK fibre caveat. The chosen record declares 0.1 g salt where the field's modal value is 0.05 g. Both are the rounding noise of a trace on a food with no added salt, and the runner-up is the one that sits on the mode; the choice was made on admission 2 rather than on this.

### 7.3 The independent check: rebuild the cream from its halves (admission 4)

Double cream is butterfat and skimmed milk in a known ratio, and USDA carries both, so the nibs-style reconstruction is available. Two routes, each fitted only on fat:

| Per 100 g    | `Cream, heavy` + `Butter oil` (76.7 : 23.3) | `Butter oil` + skim milk (50.7 : 49.3) | OFF consensus (n=58) |
| ------------ | ------------------------------------------- | -------------------------------------- | -------------------- |
| Fat          | 50.5 (fitted)                               | 50.5 (fitted)                          | 50.5                 |
| Saturated    | 30.1                                        | 31.4                                   | 31.4                 |
| Protein      | 1.61                                        | 1.80                                   | 1.5                  |
| Carbohydrate | 2.91                                        | 2.44                                   | 1.6                  |
| **Energy**   | **467**                                     | **461**                                | **467**              |

Saturated fat and protein land, and so does energy — the first route reproduces the label figure exactly and the second misses by 1.3%.

**That is the opposite of what happened to cacao nibs, and the reason is fibre.** #109 §5 found three answers for one food spanning ~100 kcal, because label energy counts fibre at 4 kcal/g and USDA applies cocoa-specific Atwater factors. Cream has no fibre and no cocoa, so the two conventions have nothing to disagree about, and a curated cream does **not** read hotter than USDA's accounting of the same composition would. The #141 comment predicted the two would not agree; measured, they do.

**Carbohydrate is the figure that does not transfer**, by 0.8–1.3 g. USDA computes carbohydrate by difference — whatever is left after water, protein, fat and ash — and that residue absorbs everything the other four measurements missed. A UK label declares lactose directly. The gap is in the method, not in the cream.

## 8. The ceiling

ADR-0046 §6 caps the list at **eight**, and says that reaching it is a signal to revisit CIQUAL under ADR-0045 §5 rather than a cap to raise. With cacao nibs and double cream seated, the list holds **two of eight** and **six seats are free**. The trigger has not fired, and nothing in this sweep brings it closer: seven of eight candidates were rejected, four of them because a table already carries the food.

One thing this sweep does say about that eventual decision, though, and it is worth carrying forward. **Three of the four admission-1 rejections were CIQUAL's doing** — nutritional yeast, kefir and oat drink are all in CIQUAL under names a UK user would type, and two of the three are absent from the USDA data this app bundles. That is a small, concrete piece of evidence about what adopting CIQUAL would buy, gathered here as a side effect rather than argued for. It belongs to ADR-0045 §5's decision, not to this one.

## 9. What was deliberately not done

- **`clotted cream` was not curated.** It is absent from every table too — searching `clotted` over the archives and CIQUAL returns nothing at all — and it is a genuine UK base ingredient at 55–64% fat. It is not in the candidate list this ticket was given, and admitting it on the strength of double cream's evidence would be exactly the "curating on" ADR-0046 §6 warns about. It is a candidate for a later pass, with its own four admissions to clear.
- **`oat drink` was not added to the vocabulary.** §3 says where it belongs, and the entry is one line, but writing it is #141's mechanism under ADR-0049's admissions — including the generation-time check that the key retrieves nothing and its target leads — and not a thing to slip into a curation sweep.
- **The rejected candidates were not re-tested against the barcode path.** Every one of them is a packaged product a user can scan, which is where ADR-0046 §2 sends a candidate that cannot clear the bar. Nothing needed building for that to be true.

## Caveat

The OFF figures throughout are label transcriptions, not analyses. The double-cream consensus is a consensus of British and Irish manufacturers' declarations, and several of them plainly share a source: the 467 / 50.5 / 31.4 / 1.6 / 1.5 panel appears verbatim across a dozen own-brands. The reconstruction in §7.3 is the load-bearing check precisely because it does not descend from those labels. Morrisons' record was retrieved 2026-08-21; OFF records are publicly editable, which is why ADR-0046 snapshots rather than re-fetches, and why `pnpm curated:check` re-reads it quarterly. The CIQUAL compositions in §3 were read from the 2025 workbook rather than from the XML tables beside it; the two are the same release.
