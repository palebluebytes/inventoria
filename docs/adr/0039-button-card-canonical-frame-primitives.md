# ADR 0039: `Button` and `Card` as the canonical brutalist frame primitives

**Status:** Accepted  
**Date:** 2026-08-05  
**Implemented:** `ui/Button.svelte`, `ui/Card.svelte`, `tests/unit/ui-primitives.test.ts`

## Context

ADR-0038 named the brutalist frame — `--edge*`, `--radius`, `--shadow-*`,
`--ink`/`--paper` — but the two primitives that should _be_ that frame did not
carry it. `Button` framed itself with `border: 1px solid transparent` and a soft
`--accent` focus glow; `Card` used the lighter `--edge-thin` and no shadow. Both
were **softer than the bespoke sites that must adopt them**: call sites reach for
`class="shadow-brutal"`, hand-rolled `.commit` / `.save-btn` / `.delete-*`
buttons, and per-view `--edge` + offset-shadow tiles. Until the primitives look
like the destination, there is nothing worth migrating onto (the #69 arc).

Three further gaps blocked adoption:

- **No size axis.** Call sites needing a smaller or larger action forked their
  own CSS instead of asking the primitive.
- **`Card` was `<div>`-only.** Interactive tiles (a whole card that navigates or
  toggles) were built bespoke — a wrapping button, or click handlers on a
  non-interactive div with no keyboard path and no press semantics.
- **No a11y passthrough.** Neither primitive spread unknown attributes, so an
  `aria-label` / `aria-pressed` / `aria-controls` / `title` a call site set was
  **silently dropped**. This is invisible in code review and only shows up under
  a screen reader.

## Decision

**Re-express `Button` and `Card` in the ADR-0038 frame tokens and make them the
single source of the brutalist hard-edge + offset-shadow + `radius: 0` look**,
with an opinionated, minimal prop surface.

### `Button` — variants plus one orthogonal `size`

- **The frame is the default.** `border: var(--edge)`, `border-radius:
var(--radius)`, and (for the bordered variants) `box-shadow: var(--shadow-1)`
  that presses flush (`translate(2px, 2px)` + shadow removed) on `:active` — the
  brutalist push, replacing the old `scale(0.97)`.
- **Four semantic variants, tones folded in.** `primary` / `secondary` / `ghost`
  / `danger` stay. The destructive red _look_ lives **inside** the `danger`
  variant (`--red-bg` on `--paper`) rather than a free `tone` prop that would
  multiply into a variant × tone matrix. The affirmative/commit look is
  `primary` — the strong `--ink`-on-`--paper` CTA of the grayscale system; the
  lime green-commit button is **not** a `Button` variant but the bespoke
  `CommitButton` sheet CTA, which stays out of scope (see the boundary below),
  so no green variant is introduced. `ghost` is chromeless (no frame, no shadow)
  until hovered.
- **Exactly one new axis: `size` (`sm` / `md` / `lg`).** It varies padding and
  type step only; `md` preserves the previous metrics, so it is additive. There
  is deliberately **no `fullWidth`** and **no `frame` / edge-weight** prop: width
  is a layout concern the caller sets via `class`, and edge weight is implied by
  variant, not dialed independently.

### `Card` — one polymorphic module for frames and tiles

- **`onclick` makes it pressable.** With a handler, `Card` renders a native
  `<button type="button">` (real `role=button`, native keyboard activation, the
  shared focus ring, a hover-lift + press-flush); without one, a plain `<div>`.
  One module, one frame, both a static surface and an interactive tile — no
  bespoke wrapping button and no click-handler-on-a-div a11y trap.
- **The frame is the default.** Every card gets `--edge` + `--radius` +
  `--shadow-2`, so consumers stop appending `class="shadow-brutal"`.
- **Hover-lift is now pressable-only.** A static informational card no longer
  lifts on hover (an affordance it never earned); the lift belongs to tiles that
  actually respond to a click.

### Shared conventions

- **One unified brutalist focus ring.** Both `Button` and pressable `Card` use
  the hard offset outline (`outline: 2px solid var(--ink); outline-offset: 2px`,
  matching the `Segmented` precedent), never the old soft `--accent` glow.
- **`...rest` is the a11y / semantics escape hatch, not a styling channel.** Both
  primitives spread `...rest` onto the underlying element, so `aria-*`, `title`,
  `role`, and `data-*` a call site carries reach the DOM instead of being
  dropped. `class` remains the _only_ styling channel; `...rest` never clobbers
  it (the base + caller classes are applied after the spread).

### The bespoke-remainder boundary

This ADR governs `Button` and `Card` only. Explicitly **out of scope**:

- **Chips / pills / badges → #76.** A separate primitive with its own tokens.
- **Sheet chrome stays bespoke.** The `CommitButton` lime CTA, `BottomSheet` /
  `Modal` shells, and other sheet furniture are surface-specific and keep their
  own styling; they are not `Button` / `Card` in disguise.

## Consequences

- **Positive:** The brutalist frame lives once. A new action or surface inherits
  the edge, shadow, radius, focus ring, and press behaviour instead of
  re-deriving (and re-drifting from) them. The #69 adoption arc now has a
  destination worth migrating onto.
- **Positive:** Interactive tiles get correct semantics for free, and the a11y
  attributes call sites already write finally reach the DOM.
- **Visual shift (intended):** The ~23 already-adopted consumers (12 `Button`,
  11 `Card` imports) move to the heavier frame — `Button` gains a real 2px edge
  and offset shadow, `danger` turns red, `secondary` fills to `--paper`, the
  `ghost` hover fill tokenises to `--accent-glow` (a touch stronger than the old
  ad-hoc `rgba(0,0,0,0.05)`), `Card` gains `--shadow-2`, and static cards lose
  their hover-lift. This is the point of the ticket; it is verified
  in-app, not accidental. Redundant `class="shadow-brutal"` at call sites is now
  a no-op and can be removed during the #69 migration.
- **Covered:** `tests/unit/ui-primitives.test.ts` pins the contractual surface
  via Svelte's SSR render — variant/size classes, the polymorphic element choice
  (`<div>` vs `<button>`), and the `...rest` passthrough on both primitives.
- **Deferred:** the two-near-blacks reconciliation (`--accent` / `--text-primary`
  vs `--ink`) noted in ADR-0038 is untouched here; the focus ring uses `--ink`.

## Enforcement

The frame invariants that _can_ be a stylelint literal — radius, shadow shape,
colour — are enforced by ADR-0038 §Enforcement (radius allow-list, shadow
blur-`0` disallowed-list, keyword/hex colour ban; #75 + #83). A **frame-adoption**
rule — flagging inline `var(--edge*)` / `var(--shadow-*)` outside `src/lib/ui/`,
to push consumers onto `Button`/`Card` rather than restating the frame — is
**deferred debt**. There are 137 pre-existing inline-frame sites across 38 files
and no stylelint baseline mechanism, so the rule cannot hard-fail without an
out-of-proportion adoption-first pass; it waits on that migration. The #76 "chip"
carve-out the #69 rider anticipated is now **retired** — chips resolved to
`Badge` / `Button` / `ToggleGroup` per ADR-0040, so no chip primitive competes
with this frame vocabulary.
