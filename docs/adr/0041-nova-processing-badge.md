# ADR 0041: A NOVA processing badge — reading back the `food/assessment` blob

**Status:** Accepted, then **amended post-implementation (2026-08-06)** — all four
tickets (#90–#93) shipped, then the badge was simplified to a word-only chip and
its placement moved. The original decision text is preserved below as the record;
the [Amendment](#amendment-2026-08-06-word-only-badge-plain-inference-placement)
supersedes the specific clauses it names (§1, §3, §5, §6). **Date:** 2026-08-06

## Context

The food twin already captures Open Food Facts' NOVA classification. The OFF
mapper (`src/lib/food/open-food-facts.ts:194`) folds `nova_group` — OFF's 1–4
ultra-processing score — into the atomic `food/assessment` blob (ADR-0030 §4),
alongside `additives`, Nutri-Score, and the rest. But that blob is **write-only**:
nothing in `src/` reads it back. ADR-0030 §4 foresaw exactly this gap — its
Consequences record that "the full-panel display is still owed — micronutrients
and `food/assessment`." This ADR closes the NOVA slice of that debt.

Wayfinder map #85 ("surface a food's processing level from OFF data") charted the
route. Two decision tickets resolved the shape before this synthesis:

- **[#86 research](https://github.com/inkpot-monkey/inventoria/issues/86)** —
  `docs/research/86-nova-ultra-processing-in-off.md`. Only **~25% of OFF products
  carry a NOVA group; ~75% are unknown**. `nova_group` is algorithmic (gated on
  parsed ingredients + a matched category), so absence is common and expected.
  Known-vs-missing is `nova_groups_tags` ≠ `["unknown"]`; equivalently, a present
  `nova_group` number _is_ a known verdict. Per-product **evidence is reachable**
  via `nova_group_debug` (the trail of markers that drove the verdict) plus
  `additives_tags`. ODbL requires **visible attribution** wherever OFF data shows.
- **[#87 prototype](https://github.com/inkpot-monkey/inventoria/issues/87)** — the
  badge + explainer, prototyped against real brutalist tokens. Visual spec:
  <https://claude.ai/code/artifact/75de4901-85b8-4795-827a-1ea5a53479d7>. It settled
  the badge form (word-first), dropped the warning state in favour of a neutral
  "not rated", and pulled a **constrained NOVA-1 inference** for basic USDA whole
  foods into scope.

This ADR folds #86 + #87 into one decision and cuts the implementation tickets.
The exact USDA inference rule is settled in parallel by
**[#89 research](https://github.com/inkpot-monkey/inventoria/issues/89)** and
lands in ticket D.

## Decision

Surface a **per-food NOVA processing badge**, derived by reading back the
captured `food/assessment` blob, at log-time (`FoodStager`) and on the food
detail. Everything below is the destination the map converged on.

### 1. Badge vocabulary — word-first, colour-weighted (#87 D1)

The badge leads with a **plain-language word**, not a bare number, so it reads
without tapping through. A small tier pip carries the numeral for those who want
it:

| NOVA | Word            | Weight            |
| ---- | --------------- | ----------------- |
| 1    | Unprocessed     | lime              |
| 2    | Ingredient      | pale lime         |
| 3    | Processed       | amber             |
| 4    | Ultra-processed | **red (caution)** |

NOVA 2's word is **"Ingredient"** (the group is culinary oils, salt, sugar), not
a literal "processed ingredient" — it reads as a pantry staple, which is what it
is. Only tier 4 reads as caution; the badge informs, it does not scold.

> **Amended (2026-08-06):** the badge shipped **word-only** — the tier pip (the
> numeral) and the outer frame border were dropped as visual clutter. The
> colour-weighted word alone carries the tier; the words and weights above are
> unchanged. See the [Amendment](#amendment-2026-08-06-word-only-badge-plain-inference-placement).

### 2. No warning state — everything unrated is a neutral "not rated" (#87 D2)

There is **no hazard/warning badge**. Any food without an _authoritative_ NOVA
value — an OFF product OFF could not classify (the ~75%), **and** any non-OFF
food (manual, USDA, recipe) — wears the same quiet, greyed **"— not rated"**. It
is never alarming and never silent: the badge is always present, so the absence
of a rating is itself legible rather than a blank.

> **This amends the map's headline decision.** #85 opened with "unknown → a
> warning-style badge, never silent." #87 kept "never silent" and swapped
> "warning-style" → "neutral." A raw banana with no OFF record must not wear a
> warning; "not rated" is an honest data-coverage statement, not a verdict.

### 3. Inferred "NOVA 1 · est" for basic USDA whole foods (#87 D3, rule → #89)

A basic USDA whole food (a banana, an egg, raw chicken) reads as **NOVA 1**,
shown in a **visually distinct** state — dashed edge + an "est" tag — so it can
never be mistaken for OFF's authoritative rating. This is a **constrained**
carve-out of the map's Q2 client-side-inference ban: **NOVA-1-only, single/basic
foods only, never a 2/3/4 guess.**

The exact rule (data type ∈ {Foundation, SR Legacy} **and** a `foodCategory`
allow-list, erring toward under-claiming) is settled by
[#89](https://github.com/inkpot-monkey/inventoria/issues/89) and implemented in
ticket D. Everything else this ADR specifies is independent of that rule.

> **Amended (2026-08-06):** the inference itself is unchanged and still ships — a
> basic USDA whole food still reads **NOVA 1 — Unprocessed**. What was dropped is
> the **visual distinction**: the badge renders the inferred NOVA-1 **plainly**,
> identical to an OFF NOVA-1 (no dashed edge, no "est" tag). The inferred source
> marker is retained internally _only_ to keep the explainer honest — its sheet
> never attributes the reading to OFF or shows ODbL for it. See the
> [Amendment](#amendment-2026-08-06-word-only-badge-plain-inference-placement).

### 4. The verdict is computed on read, not written on save

There is **no new written attribute**. A pure selector —

```ts
deriveNovaVerdict(food): NovaVerdict
```

— reads the already-captured `food/assessment` (and, for the ·est branch, the
USDA `foodCategory`) at render time and returns one value object:

```ts
type NovaVerdict =
  | {
      state: "rated";
      tier: 1 | 2 | 3 | 4;
      source: "off";
      evidence: NovaEvidence;
    }
  | { state: "rated"; tier: 1; source: "inferred" } // the ·est case
  | { state: "not-rated" };
```

Computing on read (rather than persisting a resolved verdict at capture time) was
a deliberate choice: it needs no migration, works for **already-captured** foods,
keeps the inference rule re-tunable without re-writing stored data, and matches
the map's whole framing — _reading back_ the write-only blob. The selector is a
pure, table-testable function; both surfaces and the explainer consume its output.

### 5. Placement — `FoodStager` + food detail; list rows stay clean (#87 D4)

The badge renders in the `FoodStager` badge-row (beside the origin badge, at
log-time) and on the per-food detail. Recent/Search **list rows stay clean** in
v1 — the badge is a decision-support signal at the moment of logging and on
inspection, not list furniture.

> **Amended (2026-08-06):** unchanged in _which_ surfaces show the badge (both
> staging and detail; list rows stay clean) but changed in _where_ on the surface.
> The badge now rides the **"Quantity (grams)" label row, floated right**, on both
> surfaces — not beside the origin badge and not in its own row above the amount
> body. Both go through one shared slot (`FoodAmountPanel`'s optional `badge`
> snippet), so the position is identical everywhere the amount panel appears. See
> the [Amendment](#amendment-2026-08-06-word-only-badge-plain-inference-placement).

### 6. The explainer — tap-through sheet, three states, evidence + ODbL (#87 D5)

Tapping the badge opens the house `BottomSheet` (ADR-0027/0028; the #67 reader
Modal precedent), with three faces keyed off the verdict state:

- **rated** — the hero tier, the four-group scale, and **this product's
  evidence**: the additives (E-numbers from `additives_tags`) and the
  `nova_group_debug` trail that drove OFF's verdict, where present.
- **not-rated** — an honest coverage statement: "no rating — about 3 in 4
  products aren't rated yet; this is not a safe/unsafe verdict."
- **inferred · est** — "our estimate, not OFF's, because this is a single basic
  whole food."

**Visible ODbL attribution to Open Food Facts** appears wherever OFF data is
shown, per #86 and the OFF licence.

> **Amended (2026-08-06):** the three faces still exist, but the inferred face
> dropped the "· est" label and dashed treatment to match the plain badge (§3).
> Its copy is now neutral — "a single basic whole food … reads as NOVA 1 —
> Unprocessed" — and, because the reading is not OFF's, that face shows **no OFF
> evidence and no ODbL attribution**. ODbL remains on the **rated (OFF)** face,
> the only face that shows OFF data. See the
> [Amendment](#amendment-2026-08-06-word-only-badge-plain-inference-placement).

### 7. Widen the OFF mapper for evidence, forward-only (#86 §4, #87 D6)

`nova_group` and `additives` are already captured, so the "widening" is narrow:
add **`nova_group_debug`** (the evidence trail) to the mapper and the
`FoodAssessment` type, and optionally the labelled **`nova_groups_tags`**. This
is **forward-only** — the debug trail exists only for foods captured after the
change; older foods still show their tier (from the already-captured
`nova_group`) with a thinner evidence section. The explainer degrades gracefully:
a rated verdict never depends on `nova_group_debug` being present.

## Implementation tickets

Four `ready-for-agent` tickets, sequenced by the read-back selector as the shared
spine (mirroring the ADR-0030 → #23–#27 split). The `deriveNovaVerdict` value
object is designed up front with the `inferred` source slot **reserved**, so
ticket D is purely additive and A/B/C need not wait on the USDA rule.

```
A Data spine  ──► B Badge
              └─► C Explainer
D ·est inference (← A, ← #89)   fills the reserved `inferred` slot
```

- **A — [#90]** Data spine: widen the OFF mapper (`nova_group_debug`,
  forward-only) + the `deriveNovaVerdict` read-back selector producing
  `NovaVerdict` (OFF tiers 1–4 + `not-rated`, with the `inferred` slot reserved
  and unfilled). Unit-tested against fixture assessments. **Unblocked.**
- **B — [#91]** The NOVA badge component: word-first, colour-weighted, tier pip;
  all visual states including the dashed `·est` and the neutral not-rated; wired
  into `FoodStager` + food detail. **← #90.**
- **C — [#92]** The explainer sheet: house `BottomSheet`, three states, evidence
  (additives + `nova_group_debug`) + visible ODbL attribution. **← #90.**
- **D — [#93]** The USDA "NOVA 1 · est" inference: implement #89's category
  allow-list rule in the verdict's `inferred` branch + widen the USDA mapper for
  `foodCategory`. **← #90, ← #89.**

## Amendment (2026-08-06): word-only badge, plain inference, placement

All four tickets (#90–#93) shipped as specified. In review the badge chrome read
as cluttered, so three things changed **after** implementation. The data model
(`deriveNovaVerdict` and the `NovaVerdict` shape in §4) is **unchanged** — these
are presentation and placement changes only.

1. **Badge is word-only (supersedes §1).** The tier pip (the numeral) and the
   badge's outer frame border were removed. The colour-weighted word — the same
   words and weights as the §1 table — carries the tier on its own. The neutral
   state reads a plain **"not rated"** (the leading em dash went with the pip).

2. **The NOVA-1 inference is kept but rendered plainly (supersedes §3, §6).** A
   basic USDA whole food still reads **NOVA 1 — Unprocessed**; the constrained
   #89 rule is fully implemented in `deriveNovaVerdict`. What was dropped is the
   dashed-edge + "est" visual distinction — an inferred NOVA-1 now looks exactly
   like an OFF NOVA-1 on the badge. `source: "inferred"` is retained in the value
   object purely so the explainer stays honest: the inferred explainer face uses
   neutral copy and shows **no OFF evidence and no ODbL** (that reading is ours,
   not OFF's), while ODbL remains on the OFF-rated face.

   > The visual distinction was originally there to stop an estimate posing as an
   > authoritative OFF rating. With it gone, the badge no longer signals "estimate"
   > to the eye; the honesty now lives one tap deeper, in the explainer copy and
   > the withheld OFF attribution. This was a deliberate owner call favouring a
   > calmer badge over an at-a-glance provenance cue.

3. **Placement moved to the amount row (supersedes §5).** Instead of sitting
   beside the origin badge (staging) or in its own row above the amount body
   (detail), the badge now rides the **"Quantity (grams)" label row, floated
   right**, on both surfaces. It is passed through a single optional `badge`
   snippet on the shared `FoodAmountPanel`, so staging and the detail sheet render
   it identically. Which surfaces show the badge, and the clean list rows, are
   unchanged.

   > **Superseded on the staged card by [ADR-0043 §2](0043-off-assessment-signals-and-ingredients-contribution.html)
   > (#103).** On the `FoodStager` staged card the badge no longer rides the
   > "Quantity (grams)" row: it moves into a new tags row below the food name
   > (`source · dietary · NOVA`, NOVA last), so the three marks read as one family,
   > and the additives count now rides it as a small circular disc. The badge's
   > **word-only, colour-weighted form (Amendment §1) is unchanged** — only its
   > position moves. The food-detail sheet (`IngredientAmountSheet`) still renders
   > the badge on the amount row via `FoodAmountPanel`'s `badge` slot, unchanged.

## Consequences

- The write-only `food/assessment` blob gains its first reader — the NOVA slice
  of the "full-panel display still owed" debt ADR-0030 §4 recorded.
- Data coverage is surfaced honestly: ~75% of OFF products, and every non-OFF
  food, read "not rated" rather than pretending to a verdict. This is a feature,
  not a gap to paper over.
- The only client-side inference in the app is the constrained NOVA-1-for-USDA
  case; the broader map-Q2 ban on 2/3/4 guesses stands.
- Evidence is forward-only. Foods captured before ticket A ships show their tier
  but a thin evidence trail — acceptable, and it heals as foods are re-captured.
- The aggregate day/week UPF-share **meter** and any behavioural **nudge** remain
  out of scope (map #85); this ADR is the badge, and only the badge. Those
  efforts presuppose it and can build on `deriveNovaVerdict`.

## Alternatives considered

- **A warning-style "unknown" badge** (the map's original headline). Rejected in
  #87: with ~75% of products unrated, a warning on every unrated food is noise,
  and it misreads "no data" as "bad." Neutral "not rated" is the honest signal.
- **Persisting a resolved verdict on save.** Rejected (§4): forward-only, needs a
  migration, freezes the inference rule into stored data, and helps no
  already-captured food. The read-back selector avoids all four.
- **Client-side NOVA 2/3/4 heuristics** when OFF is blank. Out of scope (map Q2):
  a homemade processing verdict is exactly the false-confidence the neutral
  not-rated state refuses. Only the unambiguous NOVA-1 whole-food case is inferred.
- **Reusing the RDA/limits meter machinery.** Rejected (map Notes): the aggregate
  meter is a different, out-of-scope effort; the badge is a discrete per-food chip.
