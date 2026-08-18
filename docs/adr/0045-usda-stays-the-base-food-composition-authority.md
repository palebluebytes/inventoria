# ADR 0045: Keep USDA FoodData Central as the single base-food composition authority, and fill Foundation from its SR Legacy twin

**Status:** Accepted  
**Date:** 2026-08-18  
**Amended by:** ADR-0046 §1 (§1 gains an exception for a base food no reference table carries)  
**Implemented:** #107 `014e57a`; the off-USDA mirror it relies on, `f3a159f` and `5db28f9`

This record amends [ADR-0030](0030-expanded-food-twin-source-data.md) and [ADR-0042](0042-usda-search-reference-foods.md) §6, both of which kept the rule that dedup prefers Foundation.

## Context

A search for blueberries returned a top hit with no fibre at all. The cause was not a
gap at USDA: it was ours. `searchFdc` dedups Foundation and SR Legacy hits by
`ndbNumber` and, on a collision, **replaces** the SR Legacy record with the Foundation
one (ADR-0030, restated in ADR-0042 §6). Foundation is a newer but far narrower
re-assay — USDA publishes only the nutrients a given sampling actually measured — so
the record we keep is routinely the one with less data. For `ndbNumber 9050` we kept a
26-nutrient record with no fibre and discarded a 106-nutrient record carrying 2.4 g.

That prompted a wider question: is USDA the right reference table for base foods at
all? [Research note #108](../research/108-base-food-composition-sources.md) rosters
every candidate found — USDA's five datasets and its bulk downloads, twenty-plus
national composition tables, the EuroFIR and FAO/INFOODS directories, derived and
crowd-sourced datasets, and the commercial APIs — and measures the shortlist against
the primary distributions rather than their descriptions. The alternatives that were
genuinely live, and what ruled each out:

- **CIQUAL (France), the strongest challenger.** Current (2025-11-19), Etalab 2.0,
  3,484 foods, 100% English names, fibre on 97%, 156 KiB gzipped as a trimmed panel.
  Ruled out for now because SR Legacy beats it on every micronutrient measured
  (vitamin C 94% vs 68%, B12 91% vs 61%, folate 87% vs 43%), it ships no household
  portions, and adopting it would put two blueberries in one result list.
- **CoFID (UK), the obvious regional choice.** Ruled out on its own numbers: AOAC
  fibre on 51% of foods — the basis UK guidance uses — frozen since 2021, and missing
  chia, oat drink, kefir and miso entirely.
- **OpenNutrition.** Ruled out on shape and provenance: 96% of its 326,759 rows are
  branded grocery items, leaving 5,299 generic foods; all 90 nutrient fields are
  populated for every one of them (including chromium and taurine); 36% cite no source;
  its blueberry blends five national tables into a figure matching none of them; it has
  not been updated since 2025-03-28; and its licence demands attribution on every
  screen displaying any data.
- **Open Food Facts as a base-food source.** Ruled out by its own documentation, which
  states it holds packaged food only. Measured on its blueberries category, 31% of
  products carry fibre, and coverage tracks labelling law rather than the food.
- **Commercial APIs** (Nutritionix, Edamam, FatSecret, Spoonacular, Nutrola, Spike).
  Ruled out structurally, before price: a keyless client has nowhere safe to hold an
  API secret, and their terms license queries rather than retention, which an
  append-only ledger cannot honour.

**Scope.** This record settles which source is authoritative for **base foods** — the
un-barcoded reference ingredients ADR-0042 governs — and how USDA's own datasets
combine. It does not touch the barcode path (OFF remains the authority for packaged
products, ADR-0034 §8), does not govern manual entries or recipes, and does not decide
whether the USDA subset is ever bundled for offline use; that stays open behind the
consequences below.

## Decision

### 1. USDA FoodData Central is the single composition authority for base foods

No second composition table is adopted. A food's nutrition panel is sourced from one
source's account of that food, never assembled across sources.

### 2. Foundation and SR Legacy merge fill-only, never replace

When Foundation and SR Legacy carry the same `ndbNumber`, the Foundation record is the
base: its `fdcId`, description, category and every nutrient it reports win, and the
entity stays `fdc:<foundation id>`. The SR Legacy twin fills **only** the panel fields
Foundation does not carry. A Foundation value is never overwritten by an SR Legacy one;
the newer assay stands.

The merge is order-independent: the result does not depend on which record the search
response happened to return first.

### 3. The fill unit is the panel field, not the raw nutrient id

Several panel fields are carried by more than one FDC nutrient id (energy 1008 / 2047 /
2048; carbohydrate 1005 / 1050; sugars 2000 / 1063). A field present under **any** of
its ids counts as present and is not filled from the twin.

This is what keeps energy coherent. Foundation reports energy as Atwater general
factors, so SR Legacy's `1008` is not borrowed and blueberries reads 63.9 kcal, not 57.
Two reasons: the macros displayed beside it are Foundation's, and 4x14.6 + 4x0.703 +
9x0.306 = 63.9, so the general-factor figure is the only energy that reconciles with
the panel on screen; and USDA pairs them the same way itself, its FNDDS record for the
same food stating 64 kcal alongside the borrowed 2.4 g of fibre.

### 4. A borrowed value is traceable

`twin/raw_provenance` keeps the Foundation record as `raw_data` and records the twin
beside it under `merged_from` — the canonical `/food/{fdcId}` URI it came from, its
`dataType`, its description, and the panel fields borrowed from it. A merged panel must never present itself as a single record USDA served. The
reference survives detail hydration.

### 5. Cross-source filling is forbidden

Should a second table ever be adopted, it arrives as a **whole-food alternative
record** with its own entity prefix and its own source tag, never as a per-nutrient
fill into a USDA food. Raw blueberries run from CoFID's 40 kcal to FNDDS's 64 kcal
across tables; a panel built from one table's energy and another's fibre describes no
food that exists.

## Consequences

- **The gap that prompted this closes inside the source we already use.** Measured over
  the complete datasets, the merge recovers fibre for 101 Foundation foods, and vitamin
  D for 158, vitamin A for 157, B12 for 154, vitamin E for 145, cholesterol for 143,
  vitamin C for 130, saturated fat for 116 and folate for 113.
- **Foundation-only foods stay thin.** 184 Foundation records have no SR Legacy twin;
  for those, an unmeasured nutrient is still unmeasured. The merge narrows the problem
  and does not remove it.
- **A missing nutrient still reads as a silent zero.** Nothing here distinguishes "not
  reported" from "none". That is now the largest remaining honesty gap in the panel and
  is tracked separately; it applies to every source, so no sourcing decision closes it.
- **We inherit USDA's American vocabulary.** Courgette, aubergine, swede and rocket are
  not searchable terms. The remedy, if it becomes a real complaint, is a synonym layer
  over search seeded from CoFID's names (OGL, no share-alike), not a table swap.
- **We accept a varietal residual.** USDA occasionally reuses one `ndbNumber` across
  varieties (a Foundation honeycrisp against an SR Legacy golden delicious). Measured
  over all 210 pairs the link is sound — median description token-Jaccard 0.83, no pair
  without a shared token, no `ndbNumber` mapping to two SR Legacy records — and
  borrowing a varietal fibre value beats showing none. Decision 4 makes each borrowing
  auditable rather than guarding against it.
- **Reversibility is preserved deliberately.** Because the merge is fill-only and
  provenance names both records, dropping back to either dataset alone stays a local
  change. The append-only ledger is untouched: dedup runs over the in-memory result set,
  logged history freezes its own macros, and food refs are already soft (ADR-0022).
- **Offline and self-hosting stay open, USDA-first.** If a keyless, quota-free or
  offline path is ever wanted, the move is to bundle USDA's own bulk distribution
  (Foundation plus SR Legacy trimmed to a 21-nutrient panel measures 361 KiB gzipped
  for 8,187 foods) rather than to import a foreign table. A copy of the upstream
  archives is kept off USDA infrastructure so this stays possible
  ([how to back up the USDA datasets](../how-to-back-up-the-usda-datasets.md)): SR
  Legacy's final release was 2018-04 and the dataset is discontinued, so upstream
  availability is a dependency worth insuring, not an assumption.
- **CIQUAL remains the named fallback**, not a rejected one. What would trigger picking
  it back up: a USDA outlier we cannot defend to a user, or a European-supply gap that
  the synonym layer cannot reach. It would enter under Decision 5, as its own food.
