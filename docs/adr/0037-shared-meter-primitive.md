# ADR 0037: A shared `Meter` primitive for the nutrition bars and the calorie ring

**Status:** Accepted  
**Date:** 2026-08-04  
**Implemented:** `ui/Meter.svelte`; `MacroMeters`, `DailyDashboard` RDA cells, `CalorieRing`

## Context

The food dashboard shows nutrition progress in three places, and **none of them
was legible to assistive tech** — a search for `role="meter"`, `role="progressbar"`,
or `aria-valuenow` turned up nothing in the whole of `src/`.

- **MacroMeters** renders each macro/nutrient as a `.progress-bar-bg` track with a
  `.progress-bar-fill` div sized by `style="width: {fill}%"`; a nutrient with no
  target gets a striped `.no-target` track.
- **DailyDashboard**'s full-day RDA cells render the same shape under different
  names (`.rda-cell-bar` / `.rda-cell-bar-fill`), with an amber `over` state for a
  day total past its target.
- **CalorieRing** is a hand-computed SVG dial (`stroke-dashoffset`); a screen
  reader gets only the two `<span>` numbers, with no meter semantics at all.

The two bar surfaces are the same track-and-fill shape written twice, and the
value semantics are missing everywhere. bits-ui ships a `Meter` primitive that
supplies `role="meter"` + `aria-valuenow`/`min`/`max`; it is thin, but it is the
same headless-behaviour-plus-brutalist-skin split already used for `Slider`
(`QuantityGrams`), `Dialog` (`BottomSheet`, `Modal`), and `RadioGroup`
(`Segmented`, ADR-0036).

## Decision

**Introduce `ui/Meter.svelte` over bits-ui `Meter` for the two bar surfaces, and
give the calorie ring its meter semantics directly.**

- **A shared module for the bars.** `Meter.svelte` renders the track-and-fill bar
  and the meter semantics; `MacroMeters` and the RDA cells both render it (two
  real adapters, so the seam is genuine). The duplicated `.progress-bar-*` and
  `.rda-cell-bar-*` markup and CSS are removed in favour of one owned look (a 6px
  track, black fill, `border-radius: 0`), with an amber `over` state and a striped
  no-target state folded in.
- **Percent-based value model.** The bar is driven by `fill` (0–100, the width the
  callers already compute) with `aria-valuetext` carrying the human reading
  ("62 g of 90 g"). Callers pass a clamped percent plus the formatted strings they
  already hold; no raw grams or targets are threaded through, and the pure
  `buildNutrientMeters` / RDA view models are untouched.
- **No target is not a meter.** A nutrient with no configured target has no range
  to measure against, so `Meter` renders a striped, role-less track rather than a
  misleading empty progress bar (`fill === undefined`).
- **The ring carries aria directly.** The dial is a single bespoke SVG visual, not
  a track-and-fill bar, so routing it through the bar module would mean a
  visual-override slot used by exactly one caller. Instead the ring container gets
  `role="meter"` + `aria-valuemin`/`max`/`now` + `aria-valuetext`; its svg and
  numeric label are marked decorative so the reading is announced once.
- **bits-ui earns its place by consistency, not depth.** `Meter` is a shallow
  primitive — it sets three aria attributes. The leverage here is the shared
  module (the value semantics live in one place); wrapping bits rather than
  hand-writing `role="meter"` keeps the primitive vocabulary uniform with the
  other bits-backed controls.

## Consequences

- Every nutrition bar and the calorie dial now expose `role="meter"` +
  `aria-valuetext`; the dashboard's progress surface is legible non-visually for
  the first time.
- Two hand-drawn bar implementations collapse into one module. A future progress
  bar reaches for `Meter` instead of re-deriving a track-and-fill div.
- The class hooks change from MacroMeters-specific names (`.progress-bar-fill`,
  `.progress-bar-bg.no-target`) to the shared module's (`.meter-fill`,
  `[data-meter-state="empty"]`); four assertions in `food-ui.spec.ts` are
  rewritten to match, their intent (a targeted nutrient shows a fill; an
  untargeted one shows the empty track) preserved.
- The behaviour under these surfaces (`buildNutrientMeters` and the RDA row view
  models) is unchanged and still covered by its own unit tests below the UI seam.
