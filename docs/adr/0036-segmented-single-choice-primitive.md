# ADR 0036: A shared `Segmented` primitive for single-choice controls

**Status:** Accepted; implemented (`ui/Segmented.svelte`, migrated `CalorieCalculatorSheet` and `FoodStager`). **Date:** 2026-08-04

## Context

The food screen hand-rolls the same single-choice control in several places: a
horizontal row of mutually-exclusive cells where the selected one inverts to
black-on-white.

- **CalorieCalculatorSheet** builds three — biological sex, activity, goal — each
  as `<fieldset><legend>` + `.segmented.{two,three,four}` + a loop of
  `<button class="seg" class:on={x === v} onclick={() => (x = v)}>`.
- **FoodStager**'s Custom capture form builds a fourth, `.cf-seg`
  (per-100 g / per-serving), with the same `class:on`/`onclick` shape.

Two problems follow from the duplication:

1. **The behaviour is re-derived per call site, and the accessibility is
   missing.** None of the four carries `role="radiogroup"`/`role="radio"`,
   `aria-checked`, roving `tabindex`, or arrow-key selection. Selection is
   conveyed only visually (a black fill via `.seg.on`), so the controls are
   opaque to assistive tech and unusable by keyboard beyond Tab-and-Space.
2. **The two treatments had already drifted.** The calculator uses square,
   gapped, uppercase cells (ADR-0003-compliant); `.cf-seg` used a joined pill
   with `border-radius: 10px` — a direct violation of ADR-0003's "all
   `border-radius` values are strictly 0".

The one existing bits-ui use inside the food domain — `QuantityGrams`' `Slider`
— shows the resolution: behaviour and a11y come from a headless bits primitive,
the brutalist skin is applied with pure custom CSS via `:global`. Nothing about
that model conflicts with ADR-0003.

## Decision

**Introduce `ui/Segmented.svelte` as the one single-choice control, backed by
bits-ui `RadioGroup`, and migrate the four food-screen controls onto it.**

- **`RadioGroup`, not `ToggleGroup`, sits behind the seam.** All four controls
  are "exactly one of N", and none should ever deselect back to none once a
  choice is made. That is precisely `RadioGroup`'s contract: it never toggles a
  selection off, it supplies `role=radiogroup`/`radio` + `aria-checked`, and its
  arrow keys _select_ rather than merely move focus. A single-select
  `ToggleGroup` would allow re-press-to-deselect, which is wrong for
  activity/goal/basis. Biological sex — which starts empty — is expressed as an
  `aria-required` group with no initial selection.
- **The module owns the row and a label above it, nothing more.** Its interface
  is small: `options: { value: T; label: string }[]`, a `$bindable` `value: T |
null`, a `label` (the visible heading and the group's accessible name), an
  optional `required`, and an optional `testid`. The surrounding chrome that
  differs per call site — the calculator's explanatory hint, the Custom form's
  conditional serving-grams field — stays with the caller.
- **One owned look; `.cf-seg` converges.** The module ships a single brutalist
  skin (square, gapped cells; the four-plus-cell case wraps to two columns on a
  narrow sheet and expands to a full row once there's room). `.cf-seg`'s rounded
  pill is retired and its `border-radius: 10px` ADR-0003 violation corrected as
  a consequence. Column count is derived from `options.length`; there is no
  style variant on the interface.
- **The test surface does not move.** The behaviour under these controls —
  `computeEnergyAndMacros`, `resolveServingSize`, the calorie store's basis
  handling — is exercised by unit tests that call those functions directly,
  below the UI seam, and they are untouched by this refactor. No component-test
  tier is introduced for the widget; its behaviour is bits-ui's guarantee, and
  the four call sites are verified with `pnpm check`, `lint:css`, and the dev
  server.

## Consequences

- The roles, `aria-checked`, and arrow-key selection that were absent now exist
  for all four controls, in one place. A future single-choice control gets them
  by reaching for `Segmented` instead of rediscovering the markup.
- The duplicated `.segmented`/`.seg` CSS leaves `CalorieCalculatorSheet` and the
  `.cf-seg` CSS leaves `FoodStager`; the button loops and `class:on`/`onclick`
  handlers collapse to a four-line element per call site.
- The Custom form's per-100 g / per-serving control changes appearance (square
  cells, label above rather than a rounded pill with an inline label) and drops
  its stray `border-radius`.
- `Segmented` is the codebase's first component that takes a generic type
  parameter (`<T extends string>`), so a caller's `value` binding keeps its
  precise union type through the control.
- **Deferred:** `QuantityGrams`' preset/portion chips are a related but
  divergent shape (wrap layout, a "none selected" state when the typed grams
  match no preset) and are left for a possible follow-up. `WeekStrip` is
  deliberately out of scope — it is a date scroller with paging arrows, a Today
  reset, and auto-centring, not a segmented control, and bits-ui has no clean
  primitive for it.
