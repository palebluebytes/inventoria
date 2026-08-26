# ADR 0023: Numeric-first amount entry; drag controls are accelerators, not the primary affordance

**Status:** Accepted  
**Amended by:** [ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §3 (the control is renamed `AmountField` and announces the unit its panel is measured in)  
**Implemented:** `8e5a854`, `QuantityGrams.svelte`; see the amendment below

## Context

Staging a food to a recipe (or a log) needs the user to set an **amount** in
grams. The original control in `AddIngredientSheet` was a plain
`<input type="number">`. We explored replacing it with something more tactile —
the prompt was "different rotary knob designs to change the amount easily" — and
built a throwaway prototype of four variants: a full twist **Dial**, a
horizontal **Jog Wheel**, a semicircular **Gauge**, and a **numeric-first**
field paired with a slider and preset chips.

Prototyping surfaced a premise problem, confirmed against primary sources:

- **Grams is a _precise, known_ value.** The user usually knows the number (a
  label says 40 g; a scale reads 128 g). Drag/rotary controls optimise for
  _approximate_ selection and are poor at hitting an exact value —
  [NN/g](https://www.nngroup.com/articles/gui-slider-controls/) and the
  [GOV.UK Design System](https://design-system.service.gov.uk/components/text-input/)
  both steer precise/known entry to a typed field, not a slider.
- **A rotary knob buys nothing for accessibility.** WAI-ARIA has **no
  knob/dial/gauge role**; a rotary control must be exposed as
  [`role="slider"`](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) with
  `aria-valuemin/valuemax/valuenow/valuetext` and the APG keyboard map (arrows =
  step, Home/End = min/max, PageUp/PageDown = large step). To assistive tech a
  knob simply _is_ a slider — the rotary visual is decorative.
- **The full twist Dial was the worst option**: no absolute scale, angle
  ambiguity, finger occlusion, and multiple turns for large values. Android's one
  defensible full-twist control — the Material **time picker** — works only
  because time has an innate angular mental model (a clock face) and a bounded
  single revolution; grams has neither.
- **The ecosystem confirms the same conclusion.** There is no maintained,
  accessible, Svelte-5 rotary-knob _input_ library; the well-supported primitive
  is a slider. This repo already depends on **`bits-ui`** (`^2.18.1`), whose
  `Slider` is Svelte-5-native and ships the `role="slider"` + ARIA + keyboard
  plumbing our hand-rolled knobs were missing.

## Decision

**The numeric field is the primary affordance; drag/preset controls are
accelerators layered on top of it — never a replacement for typing.**

> **Known value ⇒ type it. Approximate value ⇒ skim it.** The typed field is
> always available and always authoritative. A slider and preset chips exist only
> to reach a value _faster_ when precision isn't the point — they never gate or
> override what the user can type.

Concretely, `QuantityGrams.svelte`:

- **A full-width `<input inputmode="text">` is the star** — its value is the
  source of truth. Typing accepts a number _or_ a small arithmetic expression
  (`+ - * / ( )`, e.g. `65 / 2` when you know the total but not the split); the
  field evaluates it live and, on commit, collapses to the result. An incomplete
  or malformed expression is a no-op — the last good amount stands. The result is
  held to the single food precision (`roundFood`, currently 3 dp) and clamped to
  `≥ 0` by a sanity ceiling; a value with no fractional part shows whole, since
  the amount is a number and nothing pads trailing zeros. `inputmode` is `text`,
  not `numeric`, because the operator keys
  must be reachable on a mobile soft keyboard; evaluation is a hand-rolled
  tokenizer + recursive-descent parser (`amount-expression.ts`), never `eval`.
- **A `bits-ui` `Slider` is a coarse accelerator** over the common range,
  inheriting `role="slider"` + full ARIA/keyboard for free. It is **controlled**
  (`value` + `onValueChange`), not two-way-bound: a typed value beyond the
  slider's range keeps the exact number while the thumb pins at max. The field
  always wins over the slider's grid.
- **Slider `step` is 1**, so a typed value is never silently snapped to a coarser
  grid — the failure mode that motivated making the field authoritative.
- **Preset chips** cover one-tap common amounts; they reuse the app's shared
  `<Button>` (`primary` = selected, `secondary` = rest) rather than bespoke
  styling.
- **Built on the app's CSS** — the shared `<Button>` and design tokens
  (`--green-bg`, `--border-accent`, `--bg-surface`), no literal hex — so it reads
  as part of the grayscale-brutalist system of ADR-0003.

## Consequences

- The amount control is a **reusable `QuantityGrams` component**, not markup
  inlined in `AddIngredientSheet`; `grams` simplifies from `number | string` to
  `number`. An e2e test drives it end-to-end (type → preset → add-to-recipe).
- **Accessibility comes for free**: the control satisfies the APG slider pattern
  and keyboard expectations because `bits-ui` implements them, rather than us
  re-deriving them per hand-rolled knob.
- **Rejected alternatives** (Dial, Jog Wheel, Gauge, and any dedicated
  knob-input dependency) are dropped; the throwaway prototype and its research
  notes are deleted — this ADR is their durable record.
- Surfaced, but out of scope: re-adding a food already in the recipe crashes the
  add via a duplicate `entity` key (pre-existing, tracked as issue #14).
- **Update (2026-07-27):** `QuantityGrams` is now also the amount control in
  `LogFoodSheet` (the direct-log flow), replacing its plain field — so the
  numeric+slider control is consistent across logging a food and adding a recipe
  ingredient. `grams` there simplified from `number | string` to `number` too.
- **Deferred:** a `valuetext` for richer screen-reader announcement (e.g. "128
  grams, ≈ 497 kcal").

## Amendment (2026-08-14): the preset chips are gone

Two clauses of the decision above are no longer true and are corrected here rather
than rewritten, so the original record stands.

- **Preset chips were removed** by `4620922` (2026-08-13), which dropped the
  `25 / 50 / 100 / 150 / 200 / 300` row and the `presets` prop from
  `QuantityGrams.svelte`. The Decision clause "Preset chips cover one-tap common
  amounts" and the Consequence "an e2e test drives it end-to-end (type → preset →
  add-to-recipe)" no longer describe the control. The numeric-first stance itself,
  which is what this ADR is actually about, is unchanged; only one of the two
  accelerators is gone. Household portions from
  [ADR-0030](0030-expanded-food-twin-source-data.md) now occupy that role, and
  they are per-food rather than a fixed ladder.
- **`--border-accent` was retired** by `9e2b216` (#73) in the
  [ADR-0038](0038-named-brutalist-frame-tokens.md) frame-token sweep. The token
  list in the Consequences section names it; read that as a statement about the
  palette at the time of writing, not a current token.
