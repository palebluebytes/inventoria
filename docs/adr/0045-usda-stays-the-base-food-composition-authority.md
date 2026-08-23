# ADR 0045: Keep USDA FoodData Central as the single base-food composition authority, and fill Foundation from its SR Legacy twin

**Status:** Accepted  
**Amended by:** [ADR-0051](0051-a-shared-ndb-number-is-not-proof-of-one-food.md) §1 (§2's merge collects a shared `ndbNumber` only where an adjudication has not refused it)  
**Date:** 2026-08-18  
**Amended by:** ADR-0046 §1 (§1 gains an exception for a base food no reference table carries)  
**Amended by:** ADR-0047 (the Consequences' open offline/bundling question is resolved: USDA's archives are bundled and the API retired)  
**Amended by:** ADR-0048 §2 and §4 (§3's present-under-any-id rule gains a constraint: an id is never added without checking what the twin merge would stop filling; §2's merge is closed to pairing on anything but `ndbNumber`)  
**Amended by:** ADR-0049 §1 (§1 gains a second source of _words_ for search to reach a record by; it remains the only source of _values_)  
**Amended by:** ADR-0050 §1 (§2's merge keeps the base record's identity, and now carries the name it discarded as a search alias)  
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

## Amendment (2026-08-18): Foundation is 363 records, not 394

The decision is unaffected. It turns on what happens when one `ndbNumber` appears in
both datasets, and that is per-food arithmetic — no clause of it depends on how large
Foundation is.

Two figures in the Consequences do. Foundation's 2026-04-30 bulk archive carries **363
records**, not the 394 this record's measurements were taken over: its
`FoundationFoods` array holds 395 entries and the last 32 are literally `null`. So the
`184` Foundation foods with no SR Legacy twin and the `210` twinned pairs, which sum to
exactly 394, describe a population 8% larger than the archive does; and the bundling
figure of "8,187 foods" is 363 + 7,793 = **8,156**. The 361 KiB gzipped measurement
beside it was taken over the larger set and has not been re-taken; that is tracked as
[#120](https://github.com/palebluebytes/inventoria/issues/120).

Neither changes an argument. A thinner Foundation strengthens the case for filling it
from SR Legacy rather than weakening it, and 8,156 foods bundle much as 8,187 do. The
correction is recorded because the number is quoted when sizing a bundle or a coverage
claim, and because it was wrong in three places at once — see the
[correction in research note #108](../research/108-base-food-composition-sources.md#correction-2026-08-18-foundation-carries-363-records-not-394).
Verification now measures the count out of the archive instead of restating it.

**Extended 2026-08-19: the split is 190 pairs and 173 untwinned.** The two figures
above were flagged as approximate rather than re-derived. Joining the two bulk
archives on `ndbNumber` now gives **190 twinned pairs** against **173** Foundation
foods with no twin, which sum to the archive's 363 and reproduce the figure #111's
build-time measurement reaches by its own route. Read `210` and `184` in the
Consequences as `190` and `173`.

Nothing in the Decision moves. The bundling total tightens
once more, in the other direction — 363 + 7,793 counts each twinned food twice, so a
bundle merging them as Decision 2 does carries **7,966** distinct foods, not 8,156.
Measured by `pnpm usda:coverage`; the re-measured completeness table
beside it is the
[2026-08-19 correction in research note #108](../research/108-base-food-composition-sources.md#correction-2026-08-19-the-usda-columns-of-the-completeness-table-re-measured).
The varietal evidence quoted in the same bullet is re-derived in the amendment below.

## Amendment (2026-08-19): the varietal residual, re-derived, and one completeness figure

The Consequences accept a varietal residual on the strength of one statistic —
"measured over all 210 pairs the link is sound, median description token-Jaccard
0.83". That was taken over the 394-record population, so it has been re-taken over the
190 pairs the archives actually hold.

**Median 0.94, not 0.83.** Of the 190 pairs, **88 carry byte-identical descriptions**,
none has two descriptions sharing no token at all, and no `ndbNumber` maps to two
records in either dataset. The 0.83 does not reproduce, and the reason is almost
certainly method rather than data: a Jaccard median depends entirely on how a
description is cut into tokens and on which middle is taken, and the original record
states neither. This one states both. Tokens are the description lowercased, split on
every run of characters that is not a letter or a digit, with tokens under three
characters dropped; the median of an even count is the mean of the two middle scores.
`pnpm usda:coverage` prints it, and the tokeniser is `descriptionTokens` in
`scripts/usda-coverage.mjs`.

**The median was the wrong statistic to quote alone.** The distribution is bimodal:
95 pairs score 1.00, and **52 of 190 score below 0.5** — soy milk against soymilk with
added calcium (0.07), rolled oats against the Food Distribution Program's "Oats"
(0.08), not-from-concentrate orange juice against "Orange juice, raw" (0.13), creamy
peanut butter against "Peanut butter, smooth style, with salt" (0.14). Those are the
borrowings Decision 4 exists for, and a median that averages them away is evidence for
the auditability requirement rather than against it. Decision 4 stands unchanged and
better supported: read the varietal residual as narrow for most pairs and real for
roughly a quarter of them.

**One completeness figure moves with it.** The Context bullet reads folate as 87%
against CIQUAL's 43%; re-measured over the archive it is 88%, and vitamin C (94%) and
B12 (91%) are unchanged. The comparison it supports is untouched. The full re-measured
table is the
[2026-08-19 correction in research note #108](../research/108-base-food-composition-sources.md#correction-2026-08-19-the-usda-columns-of-the-completeness-table-re-measured).

## Amendment (2026-08-19): §3's energy reasoning, measured rather than argued

Decision 3 keeps energy coherent by refusing to borrow a twin's energy when the base
record states its own, and argues it from one food — blueberries at 63.9 kcal rather
than 57. [Research note #121](../research/121-usda-energy-derivation.md) tests that
reasoning over both complete archives. It holds, and for a stronger reason than the
worked example gives.

**Energy cannot travel without its macros.** USDA never assays a calorie; it computes
one from the macros, which are themselves derived — protein from nitrogen,
carbohydrate by difference. So a record with an energy value necessarily has the
macros behind it. _Measured:_ of Foundation's 321 energy-stating records, none lacks a
full macro set, and of the 42 stating no energy, none has one.

The consequence is that Decision 2's fill-only merge cannot produce the panel this
decision was written to prevent. Across all 190 twinned pairs, **no pair borrows a
macro underneath the base record's own calorie**, and coherence is unchanged on all
181 pairs where it can be measured. Nine pairs borrow the calorie itself — five oils,
two butters, salt and blackberries, all foods where Foundation assayed a partial panel
— and there the borrowed figure can sit 2–3% away from what the displayed grams
produce. Salted butter is the widest: 717 kcal against macros implying 743.

Two findings from the same measurement bear on this record without changing it. A
calorie and a macro row inside **one** USDA record already disagree on 30 of
Foundation's 321, so nothing downstream should recompute one from the other. And
Atwater general factors count fibre at 4 kcal/g where UK labelling counts it at 2,
which is a property of Decision 1's choice of authority rather than of the merge;
that is raised as [#122](https://github.com/palebluebytes/inventoria/issues/122).

## Amendment (2026-08-19): the bundle is 457 to 509 KiB, not 361

The last consequence sizes the offline option at "361 KiB gzipped for 8,187 foods".
Both figures were taken over the 394-record Foundation population the first amendment
retires. The food count has been corrected twice since, to 8,156 and then to 7,966;
the 361 KiB never was, and this record said so. It has now been re-taken over the
merged population the archives actually hold ([#120](https://github.com/palebluebytes/inventoria/issues/120)),
and unlike the corrections above, it does not land close enough to leave the argument
where it was.

**457 KiB gzipped for the 21 nutrients the consequence names, 509 KiB for the whole
panel, over 7,966 distinct foods.** Built out of the two mirrored bulk
archives, merged as Decision 2 merges them, trimmed to the panel the app fills, and
gzipped at level 9. `pnpm usda:coverage` prints it; `buildBundle` and
`serialiseBundle` in `scripts/usda-coverage.mjs` are what it runs, and
`usda-coverage.test.ts` locks the panel to the app's own `PANEL_FIELDS`.

| Panel                                  | gzipped | sorted by description |
| -------------------------------------- | ------- | --------------------- |
| 23 fields, everything the app fills    | 509 KiB | 462 KiB               |
| 21 nutrient masses                     | 457 KiB | 415 KiB               |
| identity only, `fdcId` and description | 106 KiB | 95 KiB                |

**Which twenty-one.** The consequence says "a 21-nutrient panel" without saying which
nutrients, and the panel is **twenty-three** fields wide today, not the twenty-four
#120 counted. The twenty-one are the gram-valued masses: protein, fat, carbohydrate,
fibre, saturated fat, trans fat, cholesterol, sodium, sugars, vitamin D, calcium,
iron, potassium, vitamin A, vitamin C, vitamin E, B6, B12, folate, magnesium and zinc.
The two the panel adds to them are energy, which USDA calculates rather than assays,
and unsaturated fat, which is monounsaturated plus polyunsaturated rather than one
nutrient. Both trims are published above because there is no way to tell which the
original meant.

**The merge rule, stated beside the number.** Foundation and SR Legacy join on
`ndbNumber`; the Foundation record is the base and keeps its `fdcId` and description,
and the twin fills only the panel fields it does not carry, at field granularity, per
Decisions 2 and 3. That is 190 pairs merged, 1,527 panel fields borrowed, and 7,966
distinct foods rather than 8,156 records counted once per dataset.

**What the bytes are.** Each food is its `fdcId`, its description, and the panel
fields it reports, with amounts exactly as USDA publishes them in the nutrient's own
unit — one unit per field across both archives, measured rather than assumed, so a
reader can carry the units instead of every record repeating them. A field the record
does not report is omitted rather than written as null, since "not measured" is a
distinction the panel keeps and null costs bytes to say nothing. Order is a free
variable in any compressed size, so both are given: archive order is Foundation
followed by the untwinned SR Legacy remainder, and sorting by description groups like
foods and saves 9%.

**This one does change the conversation.** Research note #108's own bundle-size axis
wants a trimmed table at "~100–400 KiB gzipped". The 361 KiB cleared that; 509 does
not, and neither does 457, nor the most favourable reading available — the same trim,
sorted by description, at 415 KiB. Nothing ships against this figure and no Decision
here moves: USDA stays the authority, and bundling its own distribution stays the
right first move ahead of importing a foreign table. What changes is the size of the
move. It is a 0.4 to 0.5 MB asset rather than a third of one, of which 95 to 106 KiB is
food names before a single nutrient is carried, so no amount of nutrient trimming
brings it near 361 KiB. Where that number came from cannot be reconstructed, like the population
it was measured over.

## Amendment (2026-08-23, #122): our calorie is not a label calorie, and the panel says so

No Decision changes. §1 still names USDA the single composition authority and §5 still
forbids assembling a panel across sources. What this adds is a Consequence §1 always
carried and never wrote down, and the disposal of the one alternative that looked open.

**What was measured.** [#121's #122 Addendum](../research/121-usda-energy-derivation.md#addendum-2026-08-23-122-52-was-right-about-the-mechanism-and-wrong-about-the-size-and-the-direction)
compares what we display against what Regulation 1169/2011 Annex XIV produces from the
same record, over the 3,943 shipped foods where the comparison is computable. The gap
runs **both ways**: 598 rows read high by 5% or more, **240 read low by 5% or more**,
and 2,009 sit inside 3% either side. Median absolute gap is 4.9 kcal/100 g; 0.6% of
rows exceed 50. Chia is near the ceiling at 517 against 448, and the biggest deviations
in the corpus are under-reports — cocoa powder 228 against 359, oat bran 246 against 366.

Fibre at 4 kcal/g against a British label's 2 is the largest single driver, but it is
not the only one, and three others push the other way or sideways: USDA's per-food
specific factors, which over-discount high-fibre plant foods; rows whose stated energy
does not reconcile with their own macros at all (#121 §5.1); and §2's nine pairs that
borrow the calorie itself. From the reader's chair the four are indistinguishable. The
question a user asks at the panel is never "which Atwater factor is this" but "why does
this not match my packet".

### Recomputing under the EU convention was never live

[ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §3 already settles it: _"No
panel's energy is ever computed from other fields — not by Atwater factors."_ Deriving
an EU figure is exactly that, and it would break §4's traceability promise besides —
`twin/raw_provenance` names a record USDA served, and a recomputed calorie is not in
it. Nothing here weakens §3 or needs to; the ticket that asked for the argument gets it
by citation.

The measured direction is the second reason. A recomputation would move 240 rows **up**
as well as 598 down, so it is not a correction toward the packet — it is a different
account of the food, which is what §1 exists to refuse.

### The panel discloses instead

The `usda` copy in `SourceExplainerSheet` gains one sentence saying our figures are
calculated differently from a UK or EU label and can read either side of one. It is
unconditional, on every USDA food, for three reasons: no threshold can be honest when
the direction is not uniform; deciding a threshold would mean computing the comparison
figure at panel time, which is the arithmetic §3 forbids even when only a sentence
depends on it; and half the corpus sits inside 3%, so a gated note would build a
mechanism for a 0.6% tail.

It rides in the source explainer rather than beside the number because that sheet
already carries the `Edit` affordance — a correction appends beside the USDA record
without displacing it (ADR-0034 §6/§7). That is what keeps this from being an inert
caveat: the disclosure names a discrepancy the user can act on, immediately below it.

Scope is USDA only. OFF panels are transcribed labels and already carry the EU
convention; curated stand-ins are OFF-origin products under a real barcode
([ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md) §5); recipes defer to
their ingredients; manual entries are the user's own arithmetic.

### One consequence is larger than the one that prompted this

Measured over §2's 190 twinned pairs, 181 state energy on both sides and **118 read
higher under Foundation than under the SR Legacy twin's `1008`**, 102 of them by 2% or
more — bok choy by 56%, leaf lettuce and collards by around 47%, mushrooms by 38 to
42%. None of that is fibre; SR Legacy publishes nutrient id 2048 on **0** of its 7,793
records, so no specific-factor row is being displaced. It is a newer assay reporting
different macros, which is precisely what §2 buys and §3's field-level fill protects.

It is nonetheless a bigger number in front of a user than the fibre gap, on foods eaten
far more often than chia, and it is left to its own ticket rather than folded in here.
Recording it as a line in this amendment would bury the larger effect inside the
smaller one.
