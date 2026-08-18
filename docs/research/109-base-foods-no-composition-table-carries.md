# Research: base foods no composition table carries, and what to do about them (#109)

**Sibling:** [#108](https://github.com/palebluebytes/inventoria/issues/108) — rostered the candidate reference tables and recommended staying on USDA. This note takes the next question: what to do about a base ingredient that USDA, and every table #108 rostered, simply does not have.
**Grounds:** `searchFdc` / `isPreparedProduct` / `isBrandSpecific` in `src/lib/food/usda-fdc.ts`; `searchUsdaFoods` in `src/lib/food/food-search.ts`; [ADR-0042](../adr/0042-usda-search-reference-foods.md) (search returns reference foods), [ADR-0045](../adr/0045-usda-stays-the-base-food-composition-authority.md) (USDA is the base-food authority), [ADR-0034](../adr/0034-label-photo-food-capture.md) §8 (OFF is the barcode path).
**Date:** 2026-08-18. Figures marked _measured_ were computed that day from the primary distribution named — complete datasets, not samples, unless a count is given. **Status:** research only — the decision it fed is [ADR-0046](../adr/0046-curated-stand-ins-for-base-foods-usda-lacks.md).

---

## 1. Bottom line up front

- **Cacao nibs exist in no reference table.** Not in USDA's three datasets, not in CIQUAL. Every table carries the two halves of the bean after pressing — cocoa powder and cocoa butter — and not the intact bean. This is a coverage hole upstream, not a filter bug.
- **An OFF text-search fallback would be worse than the hole.** "Cacao nibs" returns 483 products of which **21** are nibs; the best-represented category is dark chocolate that _contains_ nibs. OFF has no nibs taxonomy node to filter on.
- **A single vetted OFF record is defensible where a search is not**, because the vetting can be done once, by a human, against a cross-product consensus and an independent reconstruction — none of which a per-keystroke fallback can do.
- **The consensus for nibs is solid.** 21 single-ingredient records agree to a median 633 kcal / 53 g fat / 32 g saturated / 22.4 g fibre / 13 g protein, and a reconstruction from USDA's own cocoa powder and cocoa butter lands on every one of those macros.
- **Energy is the one figure that does not transfer.** Label energy, fibre-at-2 energy, and USDA's cocoa-specific Atwater factors span ~100 kcal on the same food.

## 2. The hole, measured

Against the archives `scripts/usda-backup.manifest.json` pins, downloaded fresh and SHA-256 verified against the manifest:

| Dataset                 | Records | `cacao`                    | `nib`                                    |
| ----------------------- | ------- | -------------------------- | ---------------------------------------- |
| Foundation 2026-04-30   | 363     | 0                          | 0                                        |
| SR Legacy 2018-04       | 7,793   | 4, all dark-chocolate bars | 1, `Candies, TWIZZLERS NIBS CHERRY BITS` |
| Survey FNDDS 2024-10-31 | 5,432   | 0                          | 0                                        |

The Foundation count is the number of real records: its JSON array has 395 entries, 32 of which are literally `null`, which is what `scripts/usda-backup.manifest.json` counts.

_Measured._ CIQUAL 2025 — the named fallback in ADR-0045, food list pulled from its Dataverse DOI — carries none either: cocoa powder, cocoa butter, and dark-chocolate bars only. `fève` in CIQUAL is the broad bean.

The five USDA near-matches are then dropped by the ADR-0042 filters anyway (`Sweets` category with a head word outside `SWEETENER_HEADS`; the TWIZZLERS record also trips the brand detector), so the query returns zero and `searchUsdaFoods` throws its generic "No foods found matching your query" — indistinguishable, from the user's side, from a broken search.

**The nearest survivor is the wrong food.** `Cocoa, dry powder, unsweetened` passes the filters (head word `cocoa` is a sweetener staple) at **228 kcal and 13.7 g fat**. Nibs are the whole bean at ~53 g fat. Substituting it understates the fat of a nibs log by roughly 4x.

## 3. Why a text-search fallback fails

The obvious repair — when USDA returns nothing, ask OFF — reintroduces precisely the noise ADR-0042 exists to remove. _Measured_ over the complete result set for "cacao nibs" (all 427 legacy-search hits plus the 70 products under `en:cocoa-beans`, 483 unique):

- **21 products are actually nibs** — single-ingredient, with a usable panel. 4%.
- The **best-represented category is `en:dark-chocolates-with-cocoa-nibs`** (35 products): chocolate bars that _contain_ nibs, ranking above the nibs themselves.
- **OFF has no nibs concept in its taxonomy.** There is `en:cocoa-beans` (70) and `en:raw-cocoa-beans`, but no nibs node, so most nib packs sit under unnormalised free text: `en:Cacao Nibs`, `en:Organic cacao nibs`, `en:Raw cacao nibs`. Nothing to filter on.
- The junk is not subtle. Navitas `0858847000680` declares **6.7 g fat and 0 g protein** for cacao nibs.

A fallback would have to re-derive, per keystroke and without a category to lean on, a judgement that took a human one pass to make. The judgement is the deliverable; the search is not.

## 4. The consensus panel, and the record chosen

Median over the 21 single-ingredient records, per 100 g (_measured_): **633 kcal · 53 g fat · 32 g saturated · 28.6 g carbohydrate · 22.4 g fibre · 13 g protein.**

Shortlist, by how well-formed the record is rather than by scan count:

| Barcode         | Brand               | Completeness | kcal / fat / sat / carb / fibre / protein | Why it did or did not win                                                                                                                                                           |
| --------------- | ------------------- | ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5400706613279` | Purasana (FR)       | 0.775        | 652 / 55 / 32 / 29.5 / 27 / 12            | **Chosen.** The only record filed under the real taxonomy (`en:cocoa-beans`, `en:raw-cocoa-beans`), single ingredient, full panel, values on consensus, and OFF rates it **NOVA 1** |
| `0812907013652` | Natierra (US)       | 0.975        | 633 / 50 / 30 / 30 / 26.7 / 13.3          | Highest completeness in the set and dead on the median, but categorised `en:snacks` + free-text "Baking decorations"                                                                |
| `0873204104733` | Big Tree Farms (UK) | 0.975        | 650 / 42.9 / 25 / 35.7 / 32.1 / 14.3      | UK shelf and top completeness, but miscategorised as a cocoa **powder** and the lowest fat of the credible set                                                                      |
| `5060238480345` | Naturya (UK)        | 0.7          | 633 / 56 / 33 / 15 / 10 / 13              | Most-scanned (19) and UK, but its fibre is half the field's median                                                                                                                  |

**A UK caveat worth recording.** Both UK own-brands understate fibre against the field — Naturya 10 g, Holland & Barrett 12 g, against a 22.4 g median and Big Tree Farms' 32.1 g. The two packs a UK user is most likely to hold are the two whose panels overstate net carbohydrate.

## 5. The independent check: rebuild the bean from its halves

Every table lacks the bean but carries what pressing separates it into. Recombining USDA SR Legacy's `Cocoa, dry powder, unsweetened` and `Oil, cocoa butter` at the ratio that reproduces the consensus fat (46% butter / 54% powder) gives, per 100 g:

| Per 100 g    | Reconstruction from USDA | OFF consensus (n=21) |
| ------------ | ------------------------ | -------------------- |
| Fat          | 53.4 (fitted)            | 53                   |
| Saturated    | 31.8                     | 32                   |
| Fibre        | 20.0                     | 22.4                 |
| Carbohydrate | 31.3                     | 28.6                 |
| Protein      | 10.6                     | 13                   |
| **Energy**   | **530**                  | **633**              |

Every macro lands. This is the check that makes a single crowd-sourced label trustworthy enough to pin: two fully independent routes — one from lab-analysed USDA halves, one from 21 manufacturers' declarations — agree on the composition.

**Energy is the exception, and it is a convention gap rather than an error.** Three answers for one food:

- **~633 kcal** — the label figure, computed with fibre at 4 kcal/g. Natierra's own macros recompute to 623 that way against 633 declared.
- **~570 kcal** — the same macros with fibre at 2 kcal/g.
- **~530 kcal** — USDA's cocoa-specific Atwater factors. Those factors are steep: USDA's own cocoa powder record states 228 kcal where general 4/9/4 factors on its macros give 359.

So a curated OFF stand-in reads roughly **20% hotter** than USDA's own accounting of the same composition would. Nothing here fixes that; ADR-0045 §1 forbids splicing one table's energy onto another's macros, and the label figure is at least internally consistent with the macros displayed beside it.

## 6. What generalises

Cacao nibs is not a one-off. The same shape — a real base ingredient, no reference-table record, a barcode-only workaround — is predictable for foods that entered Western diets after SR Legacy froze in 2018 or that are sold only as packaged goods. Plausible neighbours, unverified: nutritional yeast, lucuma, tigernut flour, jackfruit (green, canned), oat drink, kefir, tempeh varieties, and the seed-and-superfood aisle generally. CoFID was _measured_ in #108 to be missing chia, oat drink, soya drink, kefir and miso, which is the same hole in a different table.

Two things follow, and both are decisions rather than findings, so they belong in the ADR:

1. **The admission bar has to be evidential**, not "a user asked". The nibs case had three independent supports: the absence is provable against complete datasets; the chosen record is single-ingredient and on-consensus; and a reconstruction from adjacent reference foods confirms the panel. A candidate that cannot clear something like that is a candidate for the barcode path, not for curation.
2. **The list has to have a ceiling.** A curated table that grows without bound is a second composition table admitted one food at a time, which is the thing ADR-0045 §1 declined to do deliberately. The count is the signal: past some small number, the right move is to revisit CIQUAL under ADR-0045 §5, not to keep curating.

## Caveat

The OFF figures are label transcriptions, not analyses, and the 21-record consensus is a consensus of manufacturers' declarations — several of which visibly derive from each other (five records share 633/50/30/30/26.7/13.3 exactly). The reconstruction in §5 is the load-bearing check precisely because it does not descend from those labels. Purasana's record was retrieved 2026-08-18; OFF records are publicly editable, which is why ADR-0046 snapshots rather than re-fetches. The neighbouring foods listed in §6 were reasoned about, not measured; treat them as a place to look, not as a worklist.
