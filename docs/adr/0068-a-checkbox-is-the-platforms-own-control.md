# ADR 0068: A checkbox is the platform's own control, in one shared skin

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** #150 (`ui/Checkbox.svelte` + the eight-control adoption)

## Context

Measured over `src/lib` on 2026-08-23 for #150: eight files carried
`type="checkbox"`, nine controls between them, and the brutalist skin among them
was copied **five times, byte for byte** — 28 lines each, hashing identically
once the scope selector was normalised. `appearance: none`, a `1.35em` box in
`var(--edge)`, a `0.62em` `var(--ink)` inner square scaled 0 → 1 on `:checked`,
and a `focus-visible` outline. Beside them the label row was copied four times
and the optical nudge that corrects Epilogue's ascent — the
`@supports (text-box-trim: trim-both)` block — three times.

Three things the copies hid:

- **One site missed the memo.** `FoodStager`'s per-capture OFF consent box was a
  bare native control in the middle of a brutalist form, because the copy was
  never made there. That is what copied CSS looks like when it fails: not a
  wrong pixel, an absent one.
- **The rows were not identical even though the skins were.** Two carry a
  container-query font ramp tuned to their own label string (`5.3cqi` against a
  row measured at ≈ 18.9em, `6cqi` against one at ≈ 15.3em, with the formula
  `X = 100 / row-width-in-em` written in a comment). A constant that is a
  function of the text beside it cannot live in a shared component.
- **`.toggle-label` meant two different things** — a row containing a checkbox
  in four files, and the label span of the habits views' button-based switch,
  which contains no checkbox at all.

`CONTEXT.md`'s primitive roster had no Checkbox, so there was nothing to import;
#149 added the sixth and seventh copies of the skin without anything objecting.

**The alternative that was genuinely live: bits-ui `Checkbox.Root`.** Five
primitives already sit on bits (ADR-0036, ADR-0040), and it would buy
`data-state` hooks, a `Checkbox.Group` for the log-review multi-select, and
uniformity with its siblings. It was costed rather than dismissed.

One argument against it was tested and does not hold, and is recorded here
because it will otherwise be cited again. Playwright's `check()` and
`toBeChecked()` are **not** tag-bound: `getChecked()` in the installed
`playwright-core@1.59.1` accepts a native checkbox input **or** any element
whose ARIA role is in `kAriaCheckedRoles`, via `aria-checked`. A bits
`button role="checkbox"` would have survived `getByRole("checkbox").check()` and
`page.locator("#dev-mode-toggle").check()` alike. Only the five tag-named
`input[data-nutrient="…"]` selectors were ever at risk, and they belong to the
one site that does not adopt.

**Scope.** This record covers the checkbox: one component, its adoption, and the
boundary between what it owns and what a call site keeps. It does not touch
single-choice controls (ADR-0036, ADR-0040), the button-based switch in
`AddEventScreen`, or the `retro-input` / `ui/Input` divergence.

## Decision

### 1. bits-ui is for behaviour the platform lacks

ADR-0036 states its own test in its Context: the hand-rolled segmented controls
carried no `role`, no `aria-checked`, no roving `tabindex` and no arrow-key
selection, so bits was brought in to supply accessibility **the platform did not
have**. A checkbox fails that test. `<input type="checkbox">` **is** the
accessible control — keyboard, `:checked`, label association, `disabled`,
`required`, form participation — and `Checkbox.Root` would replace it with a
`button role="checkbox"` that emits a real input only when given a `name`.

So `ui/Checkbox.svelte` wraps a native input, and bits stays right for
`Segmented`, `ToggleGroup`, `Combobox` and `Accordion`. The rule generalises: a
new primitive reaches for bits when the platform has no control with the
behaviour, never merely because its siblings did.

### 2. `ui/Checkbox.svelte` is the one checkbox

It renders `<label class="checkbox {class}"><input type="checkbox"/><span
class="checkbox-text">…</span></label>` and takes `checked` (`$bindable`),
`onCheckedChange(checked)`, `label`, `children`, `disabled`, `class`, `id`, and
`...rest`.

- **`...rest` spreads onto the input as the a11y/semantics escape hatch and not
  a styling channel**, exactly as `Button` treats it — which is why `name`,
  `required`, `form` and `value` need no named props. `id` lands on the input,
  so `page.locator("#dev-mode-toggle").check()` still resolves.
- **`onCheckedChange` earns its place.** Every adopting site persists on change
  and would otherwise dig `e.currentTarget.checked` out of an event.
- **`indeterminate` is deliberately absent.** It is a DOM property rather than
  an attribute, so `...rest` could not carry it, and no site wants a tri-state.
- **A name is impossible to omit.** One of `label` or `children` must be given
  — the props type is a union that refuses both being absent — `children` wins
  when both are, and the `<label>` wrapper is always rendered.
- **Scoped CSS, not `:global`.** `Segmented` and `ToggleGroup` use `:global`
  only because bits owns their DOM; we own ours. Scoped styles are also what
  keeps the skin unreachable from call sites, which is the property that stops a
  sixth copy appearing.

### 3. One look, no size axis, and the row's typography is the caller's

The primitive ships one treatment — caps, `--step-n1`, centred, the `1.35em` box
— and owns the optical nudge unconditionally (in any engine with
`text-box-trim` it is already zero; the fallback error on a wrapping label is
0.08em). There is no size variant and no `align` prop.

`class` lands on the label row, so a caller keeps its own departure by styling
that class with `:global` — the arrangement `ChecklistItem` already uses to
reach `Card`'s `.checklist-item`. That is how the two measured `cqi` ramps
survive, and how the three sentence-case consent rows keep
`align-items: flex-start`. The label span takes the rest of the row, so a caller
whose name is itself a row — a channel name, a Badge and a right-aligned count —
lays that out in its own markup rather than reaching into the primitive.

### 4. Not a variant of `ui/Input`

A checkbox shares a tag name with a text field and nothing else. `Input` binds
`value` as a string where a checkbox binds `checked` as a boolean, wraps its
input in a text-field skin, and has no label association. Widening its type
union would fork a four-line component on one member of that union.

### 5. Adoption, and the one control that stays out

Eight of the nine controls adopt: the six drawn in the house skin, plus
`FoodStager`'s unstyled consent box, plus the checklist tick. Five skin copies,
four label rows and three `text-box-trim` blocks are deleted, and
`FoodStager`'s consent checkbox has the house look for the first time.

`NutrientCard` stays out and says so in a comment. It hides a real input
entirely and makes the whole card the control, with the card's fill as the
checked state. A primitive that must render invisibly and nameless is a
different control, and this is the site all five `input[data-nutrient="…"]` e2e
selectors drive.

## Consequences

- **The checklist tick gets bigger, on purpose.** The house box is `1.35em`
  against a `--step-n1` row (≈ 1.27–1.35rem); the checklist's was a flat
  `1.1rem`, so converging enlarges it by about a fifth. ADR-0036 took the same
  trade when `.cf-seg` changed appearance and recorded it here rather than
  adding a variant. A native `accent-color` box in a brutalist app is drift, not
  a decision.
- **Two more rows shift slightly**: the log-recording switch and the log-review
  channel rows sized their box off the ambient font and now size it off
  `--step-n1`. Snapshot churn on the notes, settings and log screens is
  expected, not a surprise.
- **The house row is unselectable, and three rows inherit that.** `user-select:
none` belonged to the four caps rows, where dragging across a label is only
  ever a mis-click; the log-review channel row and `FoodStager`'s consent
  sentence now carry it too. `ChecklistItem` opts back out through its class,
  because the text beside its tick is the user's own note rather than chrome.
  `FoodStager` also loses a `margin-top: 0.1rem` nudge on its box, which was
  compensating for a `1.15rem` box against a `1.107rem` line; the house box is
  that line's height exactly, so flush-top alignment is now correct.
- **`.toggle-label`'s collision dissolves without being renamed.** Deleting the
  four checkbox rows leaves the name meaning one thing — the label span of the
  button-based switch, in the three habits views that draw one
  (`AddEventScreen`, `AddHabitScreen`, `ScheduleRuleEditor`) — so none of those
  views is opened by this change.
- **A caller can still reach the row, and that is the point.** The escape hatch
  is one class on one element; if it turns out to be used for the skin rather
  than for typography and alignment, that is the signal that a variant was
  needed after all. The two cheap escalations, if the evidence arrives, are an
  `align: center | start` prop and a size axis — both were rejected here as
  variants bought for a rounding error.
- **Relationship to prior ADRs:** cites ADR-0036 as the precedent whose boundary
  it draws, and nothing in ADR-0036 moves — it chose bits for `RadioGroup` on
  grounds that still hold. Carries the ADR-0038 frame tokens and sits beside
  ADR-0039's `Button` / `Card` as another canonical primitive.
