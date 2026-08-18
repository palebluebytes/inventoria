# ADR 0046: Curated stand-ins for base foods USDA does not carry

**Status:** Accepted  
**Date:** 2026-08-18  
**Implemented:** #109

This record amends [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md) §1 (USDA is the only base-food source) and [ADR-0042](0042-usda-search-reference-foods.md) §3 (a brand-specific record is always dropped from search).

## Context

A search for cacao nibs returns nothing, and the reason is not one this project can
fix by tuning filters: **no composition table carries the food.** Measured against
complete datasets in [research note #109](../research/109-base-foods-no-composition-table-carries.md),
cacao nibs is absent from USDA Foundation, SR Legacy and Survey FNDDS, and from
CIQUAL — the fallback ADR-0045 named. Every table carries the two halves the bean is
pressed into, cocoa powder and cocoa butter, and not the bean.

ADR-0045 §1 settled that USDA is the single composition authority for base foods, and
ruled out Open Food Facts as a base-food source on OFF's own documentation that it
holds packaged food only. That reasoning is intact and this record does not disturb
it. But it answers a question this case does not ask. ADR-0045 §1 is a rule about
**conflict**: when two tables describe one food, do not blend them, pick one. A food
USDA has no record of presents no conflict to resolve. The hole was simply not in
scope when that record was written.

The user-visible symptom makes the case concrete. `searchUsdaFoods` throws a generic
"No foods found matching your query", which reads as a broken search rather than an
absent food, and the nearest record that does survive the filters — `Cocoa, dry
powder, unsweetened`, at 13.7 g fat against the bean's ~53 g — is wrong by a factor
of four on the macro that dominates the food.

The obvious repair is rejected on measurement, not on taste. Falling back to an OFF
text search for "cacao nibs" returns 483 products of which 21 are nibs, ranks dark
chocolate that _contains_ nibs above them, and has no taxonomy node to filter on
(OFF has `en:cocoa-beans`, and no nibs concept at all). That is the noise ADR-0042
exists to remove, re-admitted through a side door.

What distinguishes the case from the fallback is that the judgement can be made
**once, by a human, with evidence a per-keystroke query cannot gather**: that the
absence is real across complete datasets, that the chosen record is single-ingredient
and sits on a 21-record consensus, and that a reconstruction from USDA's own cocoa
powder and cocoa butter independently confirms the panel.

**Scope.** This record governs base ingredients that **no** reference table carries.
It does not reopen ADR-0045 §1 for foods USDA does have, does not admit a second
composition table, does not touch the barcode path, and does not change how any
USDA record is mapped, merged or ranked.

## Decision

### 1. A curated stand-in covers a base food no reference table carries

A short, hand-maintained list pins such a food to **one vetted Open Food Facts
record**, which search returns as if it were a reference food. This is an exception
list against a coverage hole, not a second composition table: ADR-0045 §1 continues to
govern every food USDA carries, and nothing here fills a USDA panel from a non-USDA
value, which ADR-0045 §5 forbids and this record leaves forbidden.

### 2. Admission is evidential, and the bar is deliberately high

A food joins the list only when all four hold, and the evidence is recorded with the
entry:

1. **The absence is proven**, not assumed — searched across the complete Foundation,
   SR Legacy and Survey archives the project mirrors, and across the fallback table
   ADR-0045 names, rather than through the live search UI.
2. **The chosen record is single-ingredient** — its OFF `ingredients_text` names the
   food and nothing else. A compound product never stands in for an ingredient.
3. **Its panel sits on a cross-product consensus** — the median of the comparable
   single-ingredient records for that food, so one manufacturer's transcription error
   cannot become the app's answer.
4. **An independent check corroborates the panel**, where the food admits one — a
   reconstruction from adjacent reference foods, as cocoa powder plus cocoa butter
   reproduces nibs. Crowd-sourced labels descend from each other; a check that does
   not descend from them is what makes a single label trustworthy enough to pin.

A candidate that cannot clear this belongs to the barcode path, where the user scans
their own pack and owns the transcription.

### 3. The stand-in is the OFF record, not a new authority

The entity is the real barcode (`gtin:5400706613279`), the source tag reads OFF, and
the payload is produced by the ordinary OFF mapper. Two consequences are wanted:
scanning the same pack later resolves to the **same twin** rather than minting a
duplicate, and the panel is traceable to a record that actually exists and can be
re-fetched, corrected upstream, or refuted.

Deliberately **not** a `curated:` prefix of its own. ADR-0045 §5 prescribes that shape
for a second composition table arriving as a whole-food alternative, and this is not
that: we did not measure these nibs, a manufacturer did, and OFF is where that
measurement lives. Inventing a namespace would assert an authority this project does
not hold.

### 4. Values are snapshotted in the repo, never fetched at search time

The entry carries a trimmed capture of the OFF v3 response and the date it was
retrieved. OFF records are publicly editable and search runs per keystroke; a live
lookup would put an editable third-party value and a network round-trip on the path of
every search. The snapshot is mapped through the same OFF mapper a live lookup uses,
so the twin is byte-comparable with a scanned one and every derived reading — NOVA,
allergens, dietary tags — works with no special case.

The cost is silent staleness, and it is accepted on the same terms as the USDA mirror:
a snapshot that drifts is wrong slowly and visibly at review, where a live value is
wrong instantly and invisibly.

### 5. A stand-in says what it is

The result carries the ordinary OFF source tag **and** an explainer naming the food
USDA does not carry, the product standing in for it, and the date it was captured. A
branded record presented as a generic reference food is the one genuinely uncomfortable
thing in this decision, and ADR-0045 §4 already sets the standard it has to meet: a
panel must never present itself as something it is not.

### 6. The list has a ceiling, and the ceiling is the real control

**Eight entries.** Reaching it is not a cap to raise but a signal to act on: a curated
table growing without bound is a second composition table admitted one food at a time,
which is what ADR-0045 §1 declined to do on purpose. At the ceiling the move is to
revisit CIQUAL under ADR-0045 §5, not to keep curating.

## Consequences

- **Cacao nibs becomes findable**, at Purasana `5400706613279` — the only record in
  its field filed under OFF's real taxonomy, single-ingredient, on-consensus, and
  rated NOVA 1 by OFF so the processing badge reads correctly without inference.
- **A brand now appears in reference-food search.** ADR-0042 §3 drops brand-specific
  records because they belong to the barcode path; this carves the single exception
  where the barcode path cannot be reached by search and no generic record exists.
  The exception is enumerable — it is a literal list — which is what keeps §3's
  guarantee meaningful for everything else.
- **Curated energy reads about 20% hotter than USDA's would.** Label energy counts
  fibre at 4 kcal/g; USDA applies cocoa-specific Atwater factors that put the same
  composition near 530 kcal. Three conventions span ~100 kcal on one food (#109 §5).
  No blending is possible without breaking ADR-0045 §5, so the label figure stands,
  internally consistent with the macros shown beside it.
- **The snapshot can go stale.** An upstream correction, or a product delisting, will
  not reach the app until someone looks. The entry's retrieval date is what makes that
  auditable.
- **This does not close the "not reported vs zero" gap** ADR-0045 names as the largest
  remaining honesty problem in the panel. A curated stand-in inherits it like any other
  food.
- **The generic no-results message stays wrong for everything else.** A food that is
  genuinely absent and not curated still reads as a failed search. Distinguishing
  "nothing matched" from "not covered" is a separate improvement this record neither
  makes nor blocks.

## Alternatives considered

- **OFF text-search fallback when USDA returns zero.** Rejected on measurement: 21 of
  483 hits for "cacao nibs" are nibs, and OFF has no nibs taxonomy node to filter on.
  It would re-admit the noise ADR-0042 removed, and it cannot do the vetting that makes
  a single record defensible.
- **A `curated:` entity prefix with its own source tag.** Rejected under Decision 3: it
  asserts an authority this project does not hold, and it would make a scanned pack a
  second twin for a food already in the ledger.
- **Author our own composition record from the §5 reconstruction.** Rejected: the
  reconstruction is a good _check_ and a bad _source_. It is an unmeasured blend, which
  is the specific failure ADR-0045 §5 forbids and the one #108 rejected OpenNutrition
  for.
- **Adopt CIQUAL now.** Does not help: CIQUAL has no cacao nibs either. It remains the
  named fallback for a different problem, and Decision 6 makes it the answer if this
  list ever fills.
- **Leave the hole and let the user scan.** The status quo, and reasonable for a
  packaged product. Rejected for a base ingredient a user weighs into recipes, where
  the app's own division of labour promises a generic record and then returns a message
  indistinguishable from a broken search.
