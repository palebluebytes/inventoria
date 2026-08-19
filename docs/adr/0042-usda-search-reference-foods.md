# ADR 0042: USDA food search returns generic reference foods, base ingredients first

**Status:** Accepted  
**Date:** 2026-08-07  
**Amended by:** ADR-0045 §2 (§6's "dedup keeps preferring Foundation" becomes a fill-only merge)  
**Amended by:** ADR-0046 §1 (§3's "a brand-specific record is always dropped" gains a curated exception)  
**Amended by:** ADR-0047 §1 and §4 (the corpus is bundled and pre-filtered at generation time; §2's Lucene boost is retired)  
**Implemented:** `dabb1fe`, `082ad31`, `fcb3b60`, `1365343`; `src/lib/food/food-search.ts`

## Context

The food search runs over USDA FoodData Central's Foundation + SR Legacy datasets
(ADR-0030). Those are a **reference** food database — generic, non-branded,
lab-analysed entries — but noisy for a "log what I ate" search:

- SR Legacy (a frozen, discontinued dataset) bakes brand names into
  otherwise-generic descriptions ("Grapefruit juice, white, bottled, unsweetened,
  OCEAN SPRAY") with no structured brand field to filter on.
- Both datasets carry packaged products (canned, frozen, sweetened, juice drinks)
  and composite prepared dishes (potato salad, breaded fried chicken) alongside
  the raw base foods.
- FDC's wildcard search scores every prefix match identically, so a broad short
  query (`gra*`, ~980 hits) returns matches in a fixed order that buries the
  obvious food ("Grapes") past the fetched page.

The app already has a complementary path: **barcode scanning against Open Food
Facts (OFF)** (ADR-0034), which is where a specific _branded, packaged_ product
with a barcode belongs. That gives a clean division of labour, which this ADR
makes explicit and enforces in search.

ADR-0030 §5 described search as "the cheap Foundation + SR Legacy prefix query it
is today." This ADR changes that: search now filters, ranks, and weights its
query (ADR-0030 §5 carries a forward-pointer to here).

## Decision

**Governing principle.** USDA search returns **reference foods** — generic,
non-branded, non-composite entries — and ranks **base ingredients** (raw whole
foods) first. **Brand-specific foods**, packaged/barcoded products, and
**composite dishes** are dropped; they belong to the OFF barcode path.

The token / marker / category lists implementing each rule live in
`src/lib/food/usda-fdc.ts` and are validated there against the frozen
7,793-record SR Legacy corpus. This ADR records the **decisions**, not the lists
— those are expected to drift as new cases surface.

### 1. Rank relevance first, then raw base forms

Results are ordered by, in priority:

1. **Structural tier** — how exactly the name matches the query: head-phrase (the
   name _is_ the query) > whole-word (plural-aware) > mere prefix. Floats
   "Grapes" above prefix-lookalikes like "Grapefruit" and "grass-fed".
2. **Base-ingredient (raw) preference** — a raw whole food outranks a processed
   form _within_ a tier, so the search surfaces the base ingredient.
3. **Head-completeness** — for a partial query still short of a whole word
   ("grap"), the food whose name most completely fills the query wins.
4. **Raw simplicity** — the simplest raw form (fewest qualifiers) as the final
   tiebreak.

Relevance gates rawness: an off-target raw food never beats an on-target one.

### 2. Weight the query so name-leading foods surface

FDC's `query` accepts Lucene. Because a plain wildcard scores all matches
equally, we add a heavy boost on `lowercaseDescription.keyword:<prefix>*` — the
non-tokenised description field, so a true "name starts with" — floating foods
whose _name_ leads with the typed prefix to the top of the first page, while the
per-token wildcard preserves full coverage. This is what makes a 3-character
"gra" return grapes in a single request, without pagination or a larger page
size.

### 3. Drop brand-specific records

A record naming a specific commercial brand is always dropped — even when the
query names the brand — because branded products are the OFF path's job. USDA's
editorial convention writes brands in ALL CAPS, the only available signal; the
detector is precision-first (guarded by token length, a generic-acronym
stoplist, an "assorted brands" safelist, and a trademark denylist for names built
from generic words like Cream of Wheat). Corpus-validated at zero generic-food
false drops. A query-aware "rescue" was tried and removed (a generic food word
capitalised inside a brand — "apple" → APPLEBEE'S, "almond" → ALMOND JOY —
tripped it).

### 4. Drop packaged forms by marker

Descriptions carrying a packaging/processing marker (canned, frozen, bottled,
sweetened, drink, juice, ready-to-eat, …) are dropped as barcode-bearing
products. A food described "raw" is always a base ingredient and is exempt — so
raw retail cuts sold frozen, and raw-pressed juice, survive.

### 5. Drop prepared/composite foods by category and dish-marker

- **By `foodCategory`** — wholly-prepared categories (Soups/Sauces, Sausages,
  Breakfast Cereals, Fast Foods, Restaurant Foods, Meals/Entrees, Snacks, Baby
  Foods) are dropped. **Beverages is deliberately kept** — generic coffee/tea/
  water are reference foods; their packaged forms fall to the marker filter.
- **By composite-dish marker** — home-prepared dishes leak into base categories
  (potato salad under Vegetables), so a description marker (home-prepared/
  home-recipe, au-gratin, scalloped, salad, breaded/battered/french-fried) drops
  them regardless of category. Bare "fried" is _not_ a marker: a plain fried egg
  is a reference food like a scrambled one; only battering/breading marks a dish.
- **Two mixed categories split by head word.** _Sweets_ keeps its
  single-ingredient sweeteners (honey, sugar, cocoa, molasses, syrup) and drops
  confections. _Baked Products_ keeps bready staples (bread, croissant, bagel,
  tortilla, English muffin) and drops sweet treats (cake, cookies, doughnuts,
  pie). Both mirror the "keep the base staple, drop the composite" line.

### 6. Keep both Foundation and SR Legacy

Search stays on Foundation + SR Legacy (ADR-0030) and drops neither. SR Legacy is
discontinued and noisier, but ~89% of the raw base foods — and the only copy of
common ones (spinach, lentils, mushroom, tuna) — live there; Foundation alone is
~400 records. Dedup keeps preferring Foundation (ADR-0030). SR Legacy's noise is
handled by the filters above, not by dropping the dataset.

> **Amendment (2026-08-18):** "Dedup keeps preferring Foundation" is superseded by
> **ADR-0045** §2: the two records are merged fill-only instead, with Foundation as
> the base. Keeping both datasets — the decision this section actually makes — is
> unchanged and is now load-bearing for the panel, not just for coverage.

## Consequences

- A food search returns a clean, base-ingredient-first list; brands, packaged
  products, and composite dishes are absent from it and arrive via the OFF
  barcode path. "Fried chicken" and "cookies" return nothing; "grape", "cheddar",
  "olive oil", "coffee", "croissant" return their generic forms.
- **Search is no longer "unchanged" from ADR-0030** — that ADR's §5 gets a
  forward-pointer, and the adapter's header comment is corrected.
- The filters are **precision-first, not perfect recall.** Some composite dishes
  mis-filed under base categories (a few potato dishes; plain pan-fried meats)
  survive as an accepted leak, ranked low; a Title-case brand (rare in SR Legacy)
  can slip through. Never dropping a real food is the priority — a leak costs a
  rank, not a disappearance.
- **Deliberate edges, not oversights:** fried eggs, pan-fried/stir-fried simple
  foods, pasta, and honey/sugar/cocoa are kept; the 3-character minimum search
  length and default page size are unchanged (the query boost removed the need to
  raise them).
- The marker/category/token lists live in code and are expected to be tuned; this
  ADR is the stable _why_, `usda-fdc.ts` the living _how_.

## Alternatives considered

- **Drop SR Legacy, keep only Foundation.** Rejected: it would delete ~89% of the
  raw base foods it aims to surface (no raw spinach, lentils, mushroom). The
  dataset's noise is a filtering problem, not a coverage one (Decision 6).
- **A raw-only filter (keep only foods described "raw").** Rejected: whole
  categories of un-branded base foods never carry "raw" — dairy, oils, spices,
  flour — so 15+ common searches (cheddar, olive oil, cinnamon) would go empty.
  The marker + category approach keeps those.
- **Paginate / enlarge the fetch for broad short queries.** Rejected for the
  query boost (Decision 2): grapes for "gra" sit ~400 deep, needing ~3 extra
  requests per keystroke; the Lucene boost surfaces them in the existing single
  request.
- **Keep a brand the user searched for (query-aware rescue).** Tried and removed:
  a generic food word capitalised inside a brand name tripped it, so brands are
  always dropped instead (Decision 3).

## Amendment (2026-08-18): Foundation is 363 records, not ~400

Decision 6 keeps both datasets on the grounds that "~89% of the raw base foods ... live
[in SR Legacy]; Foundation alone is ~400 records". The second figure is wrong. Measured
from the 2026-04-30 bulk archive, Foundation carries **363** records: its
`FoundationFoods` array holds 395 entries and the last 32 are literally `null`, and the
394 that the surrounding measurements were taken over is not reproducible from that
distribution. See the
[correction in research note #108](../research/108-base-food-composition-sources.md#correction-2026-08-18-foundation-carries-363-records-not-394).

The decision holds, more firmly than before. A smaller Foundation makes SR Legacy a
larger share of the base foods search exists to surface, which is the argument Decision
6 already makes.
