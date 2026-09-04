# ADR 0093: A tap floor binds the box that accepts the tap

**Status:** Accepted  
**Date:** 2026-09-04  
**Amends:** [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) §3 (which box `--tap-min` binds, and the second reading a box is measured under)  
**Implemented:** #338 — `tests/unit/support/markup.ts` and `tests/unit/tap-floor.test.ts` (the sweep, `e2c95ad`, corrected at `8c41423`, turned from a measurement into a guard at `e858db3`), `ui/Checkbox.svelte` (`290f0dd`), eight of Rations' fields (`da1dd5f`), six of the root Facet's (`808ff2a`), `views/food/AmountField.svelte`'s row promotion (`ce8d802`) and `views/food/FoodStager.svelte`'s single shared floor (`3152378`)

## Context

[#336](https://github.com/palebluebytes/inventoria/issues/336) floored the shared brutalist field skin at `--tap-min` and swept the tree to find out whether that made the app level. It did not, and [#338](https://github.com/palebluebytes/inventoria/issues/338) opened with the sweep: every `input`, `textarea` and `select` skin in `src/`, forty-seven rules, twelve of them standing under 48px.

That measurement was wrong twice, and both errors are the reason this record exists rather than a patch note.

**It read only the stylesheet, and a stylesheet does not know which box a finger lands on.** Four counter-examples, all of them already in the tree:

- `AmountField`'s `.num` is a 32px `<input>` that was never a target: the `<label class="value">` around it took every tap, and flooring the input would have grown its row from 54.4px to 70px to reach a size the row already had.
- `NutrientCard`'s `.card-toggle` is a 1.2em checkbox at `opacity: 0`. The card renders as the `<label>` around it, so the whole card is the control and the box inside it is irrelevant.
- `ui/Checkbox`'s `.checkbox` is the `<label>`, drawing 21px against a 48px floor. It was the largest shortfall in the app, on a primitive with ten importers, and the sweep filed it as unmeasurable because the `<input>` inside it inherits its font size. The label does not.
- `FoodStager`'s `.cf-row` declares `min-height: 48px` and is a `<div>`. It takes no tap at all. Its 48px is spacing that happens to equal the token.

**It recorded the optimistic reading of a box it could not measure exactly.** `tap-targets.test.ts` names the soft spot in its own docblock: it assumes a field inherits `line-height: 1.5`, while a browser handing a form control `line-height: normal` draws a shorter line box and so a shorter field. `ItemManualForm`'s `.custom-select` draws 49px under the first assumption and ~43.6 under the second. Clearing a floor by one pixel on an assumption is not clearing it, and #336's whole argument for `min-height` over padding was that a declared floor is the only fix that holds in every browser.

### The alternatives that were live

**Floor every field, container or not.** Simplest to state and to check. Rejected on what it costs: it grows boxes that are already comfortable to tap because their container is, it would put a 48px floor on a control drawn at `opacity: 0`, and in `AmountField` it buys 15.6px of target by adding 15.6px of row.

**Require every activating region to clear the floor.** The strict reading of "a target must be 48px". Rejected because a `<label for>` caption sits beside almost every field in the app at 18.8px, and raising all of them would mean a 48px caption over every input — which no guideline asks for and which is a worse design than the one it replaced.

**Exempt a dense surface by argument.** #338 proposed this for the read-along capture form, five of whose fields were short, on the grounds that twenty nutrient rows paying 8px each is 160px of scroll. It dissolved on measurement: `.cf-row` already stood 48px tall, so the vertical space was already spent, and what pushed a 48px field to 56 was the row's own `0.25rem` padding. Nothing had to be exempted and nothing had to grow.

**Accept 44 as a legitimate guideline.** Seven rules sat at or under it and four exactly on it, which is Apple's 44pt rather than an arbitrary number. Rejected because ADR-0089 §3 already weighed exactly this: 48 is Material's figure and "clears Apple's 44pt, so one number satisfies both rather than passing one guideline and failing the other". A rule at 44 is not older than that decision, it is on the losing side of it.

### Scope

This record covers text fields — `<input>`, `<textarea>`, `<select>` — and the boxes that activate them. It does not cover:

- **Controls that are not fields.** A button, a toggle cell, a calendar day. `.sb-factor` and the `ToggleGroup` cell four lines above it in `ScaleTier` carry the same wrong `2.75rem`, and a sweep keyed on field elements can only see one of them. That is [#361](https://github.com/palebluebytes/inventoria/issues/361), and §1 to §5 below apply to it unchanged.
- **The value of `--tap-min`.** ADR-0089 §3's, and settled.
- **A pointer-conditional floor.** [#337](https://github.com/palebluebytes/inventoria/issues/337) decision 10 proposes letting a hit area go under the token where `@media (hover: hover) and (pointer: fine)` proves there is no finger. It is unwritten and unticketed at the time of this record, and is now [#363](https://github.com/palebluebytes/inventoria/issues/363). The order is deliberate: a floor applied everywhere and later relaxed under a proven pointer is safe, and the reverse order ships a phone shortfall in the gap.

## Decision

### 1. The floor binds the box that accepts the tap

`--tap-min` is a floor on the element a pointer activates, not on the element that looks like the control.

For a bare field that is the field. For a field inside a `<label>`, it is the label, because the label's box contains the field's and the field may then be any size at all — which is how `ui/Checkbox`, `AmountField` and `NutrientCard` are built.

**Where the two differ, the markup is the cheaper thing to change.** `AmountField` was a `<div>` holding a smaller `<label>` around just the number. Naming the row as the label instead cost one element and no pixels, and moved the field's own caption inside the target rather than beside it. A rule that can only be satisfied by adding height will always be satisfied by adding height; stating it in terms of the box means the answer is sometimes free.

### 2. A group of activating regions passes when any one of them clears

A field and the `<label for>` naming it are two boxes that activate one control. The group is large enough when the larger box is.

This is why a caption is not a defect. It is also why a failure quotes the field rather than the caption: the caption is a bonus hit area, and growing it is never the fix.

### 3. A box is measured twice, and the pessimistic reading is the one that counts

Height is `2 × border + 2 × vertical padding + the line box`, with tokens at their `clamp()` floor. The line box is the type step times the line-height, and the line-height has two readings:

- **optimistic** — the declared value, or the 1.5 inherited from `:root`;
- **pessimistic** — 1.2, a UA's `normal`, which applies to a form control only where the rule declares no line-height of its own, since a declared one is honoured.

A box clears the floor when the **pessimistic** reading clears it. This turns `tap-targets.test.ts`'s stated caveat into an assertion, and it is the clause that convicts `.custom-select`, `.kcal-input`, `.yield-in` and `.sin`, all of which looked level and were not.

### 4. A floor is declared, and never merely arrived at

A box that reaches 48px because its padding happens to add up is a box the next change to a type step will move. `var(--tap-min)`, never a literal: the token had nine uses in `src/` against twenty-three raw tap-sized literals, and that ratio is the mechanism by which #336's fix failed to reach a skin that had been copied.

The corollary is that a box which already clears the floor may still need the declaration. `.nutrient-card` and `.af-row` are both comfortably over it and both now say so, because a true thing that cannot be shown is not yet proved.

### 5. A box whose height cannot be derived is not passing

A container takes its height from its children, and the model above walks one line box. Guessing there is how `CalorieCalculatorSheet`'s `<label class="field">` — a caption stacked over an input, about 85px tall — reads as 27.

So the sweep declines, loudly, and a declared floor is what turns such a box into a provable one. **The failure mode this guards against is a silent pass**: a sweep that answers "no" where it means "I cannot tell" reports a level tree it never read.

### 6. An exemption lives in the guard, never in a comment

`styleOf` strips comments before the sweep reads a rule, so an argument written beside a declaration is invisible to the test that would have to honour it. A sanctioned shortfall is an entry in `SHORT_BY_ARGUMENT` in `tests/unit/tap-floor.test.ts`, carrying its argument, and it costs a diff in that file.

The list is empty, and the one candidate that was ever proposed for it dissolved on measurement.

## Consequences

**The population is discovered rather than named.** A new field is in the measurement the day it is written, which is the property a hand-written roster cannot have — and the roster was how `ui/Checkbox` went missing and two non-targets were convicted. The cost is an instrument that reads markup, with the shallowness that implies: sibling combinators, attribute selectors carrying expressions, and heights that come from children are all cases it declines rather than answers.

**Fifty targets: thirty-one carried by a declared floor, nineteen by arithmetic.** The split is asserted, because drift towards the second column is what this record exists to catch before a finger does.

**Checkbox rows more than doubled in height**, from 21px to 48, across ten importers — Settings, the log settings section, the recipe builder, the nutrient target editor and six more. This is the loudest visible change and it was taken without a `dense` variant: an opt-out from the floor is an opt-out from the finger, and ADR-0089 §3 argues 48 precisely as a number that does not vary with the context it is used in. If a settings list reads as crowded afterwards, the answer is the list's spacing and not the control's floor.

**The read-along form's identity row grows 14px** — `.cf-title` from 44 and `.cf-subline` from 38, both to 48 — and the 60px thumbnail beside them stretches to match. The two are still told apart by weight, which is what separated them at one shared type step anyway. This is the only place in the app where the floor cost layout it did not get back.

**Three duplications were found and not fixed here.** `HabitDetailView`'s `.select-brutal, .input-number-brutal` is `ui/Input`'s `.input` copied declaration for declaration, minus the floor that skin gained in #336, which is why both wearers drew the same 47px; `.time-input` is one rule in two habits files; and seven native selects wear three hand-rolled skins. Floored in place, recorded in [#362](https://github.com/palebluebytes/inventoria/issues/362). The general shape is worth naming: **a shared primitive protects only the call sites that reached for it**, and a copy taken before a fix never receives it.

**bits-ui was weighed for both `Select` and `Checkbox` and declined.** `Select` renders a custom listbox, and on a phone a native `<select>` opens the OS picker — rows already far over the floor, correct with every assistive technology, free — so adopting it would replace a control that satisfies this record with one this record would then have to floor. `Checkbox` renders a `<button role="checkbox">` whose only additions over the platform are `indeterminate` and a group part, both of which `ui/Checkbox` declines by name, and it would have left the box 21px tall regardless. Against ADR-0036's test — does the library supply behaviour the platform withholds — the answer for a select is that the platform supplies more.

**What this forecloses, for now, is a floor that varies.** Every clause above is written as one number for every pointer. #363 will argue the first condition ever attached to it, and §1 to §5 are built to survive that: a condition changes _when_ the floor applies, not which box it binds or how that box is read.
