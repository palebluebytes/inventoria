# ADR 0040: No monolithic `Chip` — the chip/pill/badge vocabulary

**Status:** Accepted; implementation pending in #81 (`Badge` `neutral` variant + `categoryBadgeVariant` helper) and #82 (`ui/ToggleGroup.svelte`, which also renders this ADR). **Date:** 2026-08-05

## Context

Ticket #76 — split out of the #69 Button/Card adoption arc — proposed adopting a
single `Chip` primitive at the ~10 hand-rolled chip/pill/badge sites, on the
assumption that they were one shape wearing ten costumes. ADR-0039 drew its
boundary at `Button` + `Card` and deferred chips/pills/badges here for their own
design pass.

By the time #76 was grilled, that assumption no longer held. The space had
already resolved itself into existing primitives:

- **Display badges are `Badge`.** `ui/Badge.svelte` exists, is expressed in the
  ADR-0038 frame tokens, and is adopted at ~11 sites (`default` / `success` /
  `error` / `warning` variants).
- **Selected chips are `Button`.** The interactive "chip that toggles a
  selection" is already a `Button` with a variant swap — e.g. the `QuantityGrams`
  portion and preset chips render `variant={grams === p.grams ? 'primary' :
'secondary'}`. No new primitive is involved.

Surveying the candidate sites against those two facts left exactly **one**
genuinely un-modelled shape: a single-select **filter bar** (the `ItemsView` tag
bar) with **click-to-clear** — click the active item to deselect back to "all".
That behaviour is precisely what `Segmented` (ADR-0036) refuses: `Segmented` is
`RadioGroup`-backed _so that selection can never fall back to none_.

A monolithic `Chip` would therefore re-invent `Badge` (display) and `Button`
(selected) just to house one filter bar — bloating a new primitive's variant
axis to serve a single caller. It fails the deletion test: it removes little and
adds a broad new surface.

Two smaller gaps sat under the "display badge" heading:

- **Habit _category_ badges are two divergent bespoke treatments.** The habit
  detail header renders a square, filled, coloured badge via an inline
  `getCategoryColor(category)` switch; the agenda row (`HabitItem`) renders a
  rounded, muted-outline `habit-category-pill` — a pre-ADR-0038 straggler in a
  different visual language. Neither uses `Badge`, because `Badge`'s four fixed
  variants cannot carry the per-category colour.
- The category "colour" is not open-ended: it is a **closed set of five
  outcomes** (green / red / ink / amber, plus a grey fallback) selected by a
  free-form category string — a set that already lines up with `Badge`'s variant
  vocabulary, missing only a grey `neutral`.

## Decision

**There is no monolithic `Chip` primitive.** The chip/pill/badge space is three
primitives, each already existing or a near-sibling of one that does:

### 1. `Badge` — display-only labels (gains a colour axis)

`Badge` remains the display-only status/category label. It gains:

- **A `neutral` variant** — grey `--border` background, `--ink` text,
  `--edge-thin` — the frame-token expression of the current unknown-category
  grey.
- **A shared `categoryBadgeVariant(category)` helper** — the single source of the
  closed category→variant map (fitness→`success`, health→`error`, mind→`default`,
  productivity→`warning`, anything else→`neutral`). This replaces the duplicated
  inline `getCategoryColor` switch; no component re-declares the mapping.

The two divergent habit-category treatments converge on `<Badge
variant={categoryBadgeVariant(category)}>`. `off-day-pill` adopts `neutral`.
`reps-pill` / `time-hint-pill` are **live-metric readouts**, not labels, and stay
bespoke.

### 2. `Button` — interactive _selected_ chips (no change)

A chip that toggles a selection is a `Button` whose variant reflects the selected
state (`primary` when selected, `secondary` otherwise). This is the established
convention (`QuantityGrams`) and is **not** re-modelled into a new primitive.

### 3. `ToggleGroup` — deselectable single-select (new, the `Segmented` sibling)

`ui/ToggleGroup.svelte` is a new primitive over bits-ui `ToggleGroup`
(`type="single"`), the **deselectable** sibling to `Segmented`:

- **`Segmented` / `RadioGroup`** — selection _must_ persist once made (mode
  switches, sex/goal pickers).
- **`ToggleGroup`** — selection _may_ clear; clicking the active item deselects
  it (native click-to-clear).

It carries the same headless-behaviour + brutalist `:global`-skin split as
`Segmented`, but **wraps** (content-width items, `flex-wrap`) rather than forcing
equal columns, because its item list is dynamic and can be long. It is adopted at
the one qualifying site — the `ItemsView` tag filter bar — which thereby gains
group role, `aria`-state, roving tabindex, and arrow-key navigation from the
primitive, and keeps its click-to-clear affordance.

### The bespoke-remainder boundary

Explicitly **out of scope**, kept bespoke:

- **Nutrient _data_ pills.** `food/MacroPills` and `DailyDashboard`'s
  `rda-chip` / `meal-total-item` are label+value data-viz coloured by nutrient
  key — a data-encoding concern, not a status label or a selector.
- **The Owned/Wanted view tabs.** A Tabs pattern (cf. #64's method switcher →
  bits-ui `Tabs`), not a chip group.
- **`reps-pill` / `time-hint-pill`.** Live metrics, not labels.

## Consequences

- **Positive:** The "why isn't there a `Chip`?" question is answered durably. New
  chip-shaped UI reaches for the primitive that matches its _semantics_ — a label
  (`Badge`), a selected action (`Button`), or a clearable single-select group
  (`ToggleGroup`) — instead of one over-loaded `Chip` with a wide variant axis.
- **Positive:** The last hand-rolled single-select toggle group gains
  radiogroup-grade a11y for free, and the two divergent habit-category
  treatments collapse to one look with a single colour-mapping source.
- **Visual shift (intended, lands in #81):** the health category badge text flips
  ink→paper (Badge `error` is paper-on-`--red-bg`), and the agenda-row category
  chip restyles from rounded-muted-outline to square-filled-coloured. Verified
  in-app, not accidental.
- **Relationship to prior ADRs:** extends ADR-0036 (defers to its
  RadioGroup-vs-ToggleGroup axis), ADR-0038 (frame tokens), and ADR-0039 (which
  routed chips/pills/badges here). Supersedes #76's "adopt a `Chip` primitive"
  framing.
- **Deferred / not built yet:** `Badge`'s `neutral` variant + helper (#81) and
  `ui/ToggleGroup.svelte` + the tag-bar adoption (#82) are ready-for-agent and
  parallel; this ADR records the decision ahead of their implementation.
