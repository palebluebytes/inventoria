# ADR 0043: Surfacing OFF assessment signals (allergens + dietary labels) and contributing back `ingredients_text`

**Status:** Accepted  
**Date:** 2026-08-13  
**Implemented:** #101 `45f6b21`, #102 `535aedf`, #103 `10188bc`, #104 `01dd9c8`

## Context

The food twin captures Open Food Facts' consumer-facing signals as one atomic
`food/assessment` blob (ADR-0030 §4): `nova_group`, `nutri_score`, `eco_score`,
`nutrient_levels`, `allergens`, `additives`, `labels`. That blob was **write-only**
until [ADR-0041](0041-nova-processing-badge.md) gave it its first reader — the
NOVA processing badge, computed on read via a pure `deriveNovaVerdict` selector.
ADR-0041 surfaced **exactly one of the blob's signals**; the rest still never
reach the UI.

In the other direction, the contribute-back path
(`OffContribution` / `buildOffWriteBody` / `submitToOpenFoodFacts`, ADR-0034 §8)
sends a product's name, brand, category, and nutrient panel back to OFF — but not
its **ingredients**, even though the read-along capture flow is the natural place
to author them.

Wayfinder map [#94](https://github.com/palebluebytes/inventoria/issues/94) charted
the route to close these gaps **in both directions**, within a
**nutrition + safety + dietary-labels** mission boundary, mirroring the NOVA arc.
Four decision tickets resolved the shape before this synthesis:

- **[#95 research](https://github.com/palebluebytes/inventoria/issues/95)** —
  `docs/research/95-off-assessment-signals.md`. We store the right fields
  (`nutrient_levels` is an object not `_tags`; Nutri-Score is **versioned**
  2021/2023; `traces_tags` is **separate** from `allergens_tags`). **Coverage:**
  Nutri-Score / traffic-lights ~33%, allergens / additives ~28%, **dietary labels
  sparse (3–6%)**. **Readability:** allergens / additives / labels are cryptic
  `en:` tags with **no display name in the API response** → a tag→name lookup is
  required, reachable client-side via **static taxonomy JSON**
  (`allergens/additives/labels.json`, CORS-open). **Safety:** an empty
  `allergens_tags` means "none found in the parsed ingredients", **not**
  allergen-free; a declared free-from claim lives only in `labels_tags`
  (`en:no-gluten`). ODbL credit already carried by the NOVA badge covers these.
- **[#96 grilling](https://github.com/palebluebytes/inventoria/issues/96)** — the
  roster and the allergen safety framing (folded into §1 / §3 below).
- **[#97 prototype](https://github.com/palebluebytes/inventoria/issues/97)** — the
  surface, prototyped against the real staged card in add + edit modes
  (throwaway branch `prototype/97-off-assessment-surface`, `0dd498e`). Settled
  layout, marks, explainers, and placement (folded into §2 / §4 below).
- **[#98 grilling](https://github.com/palebluebytes/inventoria/issues/98)** — the
  contribute-back extension, after correcting a premise (folded into §5 below).

This ADR folds #95–#98 into one decision and cuts the implementation tickets. It
extends ADR-0041 (the NOVA precedent it generalizes) and ADR-0034 §8 (the
contribute-back path it widens). Reading the blob back is pure implementation, so
it lives in the tickets this ADR cuts, not in any further decision ticket.

## Decision

### 1. The surfacing roster — allergens + dietary labels only (#96)

Of the blob's seven captured signals, **two** reach the UI:

| Signal                             | Decision                                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| **Allergens** (+ traces)           | **Surface** — a static safety block (§3).                              |
| **Dietary labels**                 | **Surface** — vegan / vegetarian / gluten-free / organic tags (§2).    |
| Additives                          | **Explainer only** — no badge; at most an `additives_n` count (§2).    |
| NOVA (`nova_group`)                | Already surfaced (ADR-0041); this ADR only **re-places** its badge.    |
| Nutri-Score                        | **Out of scope** — single-jurisdiction (SPF); NOVA carries processing. |
| Traffic-lights (`nutrient_levels`) | **Out of scope** — single-jurisdiction (UK-FSA).                       |
| `eco_score`                        | **Out of scope** — outside the nutrition/safety/dietary boundary.      |

Nutri-Score and traffic-lights are **cut from the roster** — single-jurisdiction
schemes we don't trust as cross-market signals, and NOVA already carries the
processing story. **Additives** get no badge of their own; they fold into the
existing NOVA explainer, surfaced at most as a small count. Every survivor is a
**tag-list** (`en:`-prefixed), so both go through **one shared taxonomy lookup**
and neither carries a numeric or letter mark.

### 2. Dietary + source tags — an inline row below the name (#97)

There is **no unified "assessment section."** The signals surface **inline** on
the staged food card, in both add and edit modes, exactly where the food already
lives. A **tags row** sits below the food name:

- **order:** `source · dietary` on the card head; the **NOVA** mark no longer
  rides here — it floats right on the **portions row** inside the amount panel
  (see the amendment below). The **source** and **NOVA** marks still share **one
  brutalist framed tag** (uppercase, ink-edged chip; the only difference is fill).
  The **dietary** marks do **not** wear that frame — see below.
- the **source tag** (the food's origin — OFF / USDA / manual / recipe) **floats
  top-right of the name**, not inline in the row, and carries a **leading origin
  icon** (`◆` for a resolved data source — OFF / USDA / a computed recipe — and
  `✎` for a hand-authored manual entry) before its label.
- the **dietary** marks sit on a **meta-row below the name, floated right**
  against the brand (brand left) — not a standalone left-aligned row.
- **additives** render as a **circular count** on the NOVA tag (e.g. a small
  `3` disc) — a deliberate `--radius:0` **exception** to ADR-0038's square-frame
  rule, the one round mark in the food UI.
- **dietary tags** are **bare placeholder glyphs** (🌱 vegan, Ⓥ vegetarian,
  🏵️ organic) — **no frame, no fill, no visible text**; the short form lives in
  the tag's title / aria-label, and tapping the glyph opens the dietary explainer.
  **These glyphs are placeholders** — the real iconography (trademarked V-Label /
  EU-organic marks vs a monochrome custom set) is settled by standalone research
  [#100](https://github.com/palebluebytes/inventoria/issues/100), deferrable past
  this map's destination.

Each tag **taps through** to a house `BottomSheet` (ADR-0027/0028; the #67 Modal
precedent): a new **source explainer** (per-origin — what "from OFF" / "from
USDA" / "manual" means for trust), a new **dietary explainer** (the bare symbol
glyphs, their short forms, and the "on-pack claim, not our verdict" caveat), and
the **existing NOVA explainer**, now also carrying the additives detail.

> **Amendment (2026-08-13): the NOVA badge floats right on the portions row, not
> the tags row.** ADR-0041 shipped the NOVA badge on the "Quantity (grams)" label
> row, floated right; this ADR first moved it into the card's tags row. It now
> sits **floated right on the household-portions row inside the amount panel**
> (`QuantityGrams`) — the same place on the staged card **and** the dashboard
> edit-amount sheet, so the badge reads identically on every screen rather than
> living in two different spots. This still supersedes ADR-0041 Amendment §3 (the
> badge is off the quantity label row). The additives count disc still rides the
> NOVA tag and the tap-through NOVA explainer is unchanged; the badge's
> **word-only, colour-weighted** form (ADR-0041 Amendment §1) is unchanged — only
> its position moves.

### 3. Allergens — a present-only safety block, never inferred from absence (#96)

Allergens are a **safety** signal, so they get their own **static block** below
the quantity row (not a tap-through tag), and they follow one hard rule: **surface
only what is positively present; never infer allergen-freeness from absence.**
The block has three lines, in strict **precedence** order, each allergen on its
**own line**:

1. **Contains** — from `allergens_tags`.
2. **May contain** — from `traces_tags` (a **distinct** line; cross-contamination
   ≠ an ingredient).
3. **Free from** — declared free-from claims **only** from `labels_tags`
   (`en:no-gluten`, `en:no-…`); **never** synthesized from an empty
   `allergens_tags`. `no-gluten` is **de-duplicated** out of the dietary
   gluten-free tag into this line.

The block always carries the **mandatory disclaimer** — "OFF's reading of the
ingredients; check the packaging" — behind an **(i) toggle**, because an empty
`allergens_tags` means "none found in the parsed ingredients", not "allergen-free"
(#95). When OFF carries **no** allergen/traces/free-from data at all, the block is
**silent** — it does not render.

There are **no "not rated" states** anywhere in this surface (a departure from the
NOVA badge's always-present neutral chip): both allergens and dietary labels
**degrade to silence** for manual / USDA / recipe foods and for OFF products that
carry no such data. The signals are sparse and positive-only; a "not rated"
allergen line would be noise at best and dangerously reassuring at worst.

### 4. Verdicts computed on read — pure selectors, no new attribute (#97)

Mirroring ADR-0041 §4, there is **no new written attribute and no migration**.
Two pure selectors read the already-captured `food/assessment` at render time and
return value objects:

```ts
deriveDietaryVerdict(food): DietaryVerdict   // vegan/vegetarian/gluten-free/organic + additives count
deriveAllergenVerdict(food): AllergenVerdict // contains / may-contain / free-from tag lists
```

Both are **present-only and silent-on-empty** (they return an "absent" value, not
a "not-rated" one, when OFF has no data), pure, and table-testable — the same
shape `deriveNovaVerdict` established. Two **domain rules** are baked into the
selectors:

- **`vegan ⟹ suppress vegetarian`** — a vegan food is trivially vegetarian, so the
  vegetarian tag is dropped when vegan is present (no redundant pair).
- **allergen-line precedence** (Contains › May-contain › Free-from) and the
  `no-gluten` de-dup live in `deriveAllergenVerdict`, so the block is a dumb
  renderer of an already-ordered structure.

The selectors return **`en:` tags**, not display names. Resolving a tag to its
human name is a **separate concern**: a client-side **taxonomy resolver** loads
OFF's static taxonomy JSON (`allergens.json` / `additives.json` / `labels.json`,
CORS-open), caches it, and maps `en:peanuts → "Peanuts"`. It **degrades
gracefully** — an unknown or not-yet-loaded tag falls back to a prettified form of
the bare `en:` slug, so a missing taxonomy never blanks a safety line. Keeping the
resolver out of the selectors keeps the selectors pure and synchronous.

**Visible ODbL attribution to Open Food Facts** already rides the NOVA badge on
every OFF food (ADR-0041); it covers these OFF-derived signals too — no new
attribution surface is owed.

### 5. Contribute back `ingredients_text` — the read-along form authors it (#98)

**Premise corrected.** The read-along capture form captured **no** ingredients
today: `food/ingredients` is the unrelated _menu-descriptor_ attribute (ADR-0035),
while OFF's canonical `food/ingredients_text` was written **only** by the read
mapper. So the extension is:

1. **Add an ingredients field to the read-along capture form**, **seeded from the
   twin's existing `food/ingredients_text`** — true read-along: show OFF's parsed
   ingredients, let the user correct them.
2. **`saveLabelFood` writes `food/ingredients_text`** from that field.
3. **`buildOffWriteBody` sends it as a bare `ingredients_text`** — **REPLACE**
   (like `product_name`, not `add_`), **suppress-when-empty** (an untouched empty
   field never posts, so it can't wipe OFF's data).

**Language safety.** The write round-trips the **same main-language slot**: seed
from the bare `ingredients_text` read, write to the bare `ingredients_text`;
**never `_en`**, which would mislabel a non-English label as English. The
transcribe-a-different-language edge (needs label-language capture + OFF's `lc`
param) is a **deferred refinement**, not v1.

Ingredients is the **whole** extension — dietary labels and allergens are
OFF-derived, never user-authored here, so nothing else is added to the write path.
It rides the **existing model-C per-capture consent** (ADR-0034 §8 / #61); **no
new consent gate**.

### 6. Widen the OFF mapper for `traces_tags`, forward-only

`allergens`, `additives`, and `labels` are already captured, so the only mapper
widening is **`traces_tags` → `FoodAssessment.traces`** (the May-contain line has
no source today). This is **forward-only** (adapter bump), matching ADR-0041 §7:
the May-contain line appears only for foods captured after the change; older foods
still show Contains and Free-from from their already-captured tags. No selector
ever depends on `traces` being present.

## Known gaps (carried forward, not tickets)

- **`serving_quantity` (grams) on write** — the contribute-back path sends only
  the human `serving_size` string, not a grams value; deriving trustworthy grams
  from a display string is fiddly and low-value (#98). Left open, noted.
- **Ingredients label-language (`lc`)** — transcribing a label in a language other
  than OFF's main slot needs label-language capture; deferred (#98).
- **Dietary iconography** — the placeholder glyphs (§2) await research
  [#100](https://github.com/palebluebytes/inventoria/issues/100) (trademarked
  marks vs a custom monochrome set). Deferrable past this map's destination.

## Implementation tickets

Four `ready-for-agent` tickets, sequenced by the read-back selectors + taxonomy
resolver as the shared spine (mirroring ADR-0041's #90–#93 split). The
contribute-back ticket touches a disjoint code path (the write side), so it is
**independent and unblocked from the start**.

```
A Data spine ──► B Dietary + source tags row (+ explainers)
             └─► C Allergen safety block
D Contribute-back ingredients_text   (independent, unblocked)
```

- **A — Data spine.** Widen the OFF mapper for `traces_tags` (forward-only) +
  `FoodAssessment.traces`; the two pure read-back selectors
  `deriveDietaryVerdict` / `deriveAllergenVerdict` (present-only, silent-on-empty,
  `vegan ⟹ suppress vegetarian`, allergen-line precedence + `no-gluten` de-dup);
  and the client-side taxonomy resolver (static `allergens`/`additives`/`labels`
  JSON, cached, graceful `en:`-prettify fallback). Unit-tested against fixture
  assessments. **Unblocked.**
- **B — Dietary + source tags row.** The inline tags row below the name
  (`source · dietary · NOVA`, NOVA last, one design); **relocate the existing NOVA
  badge** into it (supersedes ADR-0041 Amendment §3); additives as a circular
  count (`--radius:0` exception) on the NOVA tag; the source explainer + dietary
  explainer sheets (house `BottomSheet`, placeholder glyphs → #100) and fold
  additives into the existing NOVA explainer. **← A.**
- **C — Allergen safety block.** The static block below the quantity row —
  Contains › May-contain › Free-from precedence, each allergen one line, the
  mandatory disclaimer behind an (i) toggle, silent when OFF has no data. **← A.**
- **D — Contribute-back `ingredients_text`.** Add the ingredients field to the
  read-along capture form (seeded from the twin's `food/ingredients_text`);
  `saveLabelFood` writes `food/ingredients_text`; `buildOffWriteBody` sends bare
  `ingredients_text` REPLACE, suppress-when-empty; rides existing model-C consent.
  Note the deferred `lc` + `serving_quantity` gaps. **Independent, unblocked.**

## Consequences

- The `food/assessment` blob gains its second and third readers (allergens +
  dietary labels), leaving only the deliberately out-of-scope signals
  (Nutri-Score, traffic-lights, `eco_score`) unread.
- Allergen safety is surfaced **honestly**: present-only, never inferred from
  absence, always disclaimed. The app never tells a user a food is allergen-free.
- Sparse signals stay quiet: with dietary coverage at 3–6%, silence (not a "not
  rated" chip) keeps the card clean for the overwhelming majority of foods.
- The write path finally lets a user **correct OFF's ingredients** — the missing
  half of the read-along flow — under the existing consent, with language-slot
  safety.
- The read side is pure and migration-free; the taxonomy resolver is the only new
  network dependency, and it degrades to prettified slugs when unreachable.
- Two known gaps (`serving_quantity` grams, ingredients `lc`) and the iconography
  question (#100) are carried forward, not built.

## Alternatives considered

- **Surface Nutri-Score + traffic-lights too** (the Destination's example roster).
  Rejected in #96: single-jurisdiction algorithmic scores we don't trust as
  cross-market signals; NOVA already carries the processing story.
- **A unified "assessment section."** Rejected in #97: an inline tags row + a
  static allergen block keep each signal where the food already is, rather than
  inventing a panel the sparse data can't fill.
- **Infer "allergen-free" from an empty `allergens_tags`.** Rejected (#95/#96):
  empty means "none found in the parsed ingredients", not "safe" — the single most
  dangerous misread of OFF data. Free-from claims come only from explicit labels.
- **A "not rated" chip for missing allergens/dietary data** (the NOVA badge's
  neutral state). Rejected (§3): safe here means silent; a persistent "not rated"
  allergen line is noise, and a reassuring-looking one is unsafe.
- **Send `ingredients_text_en`.** Rejected (#98): mislabels a non-English label as
  English. Round-trip the bare main-language slot instead.
- **Persist resolved verdicts on save.** Rejected, per ADR-0041 §4: the read-back
  selectors need no migration and re-tune freely.
