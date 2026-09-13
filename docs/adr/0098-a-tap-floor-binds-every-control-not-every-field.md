# ADR 0098: A tap floor binds every control, not every field

**Status:** Accepted  
**Date:** 2026-09-07  
**Amends:** [ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) (Scope, which held the floor to text fields and named this widening as future work; §6, whose `SHORT_BY_ARGUMENT` was empty and is now six; and its Amendment, which left a reading unread wherever _any_ conditional rule touched a modelled property)  
**Amended by:** [ADR-0100](0100-what-earns-a-member-of-the-ui-vocabulary.md) (the Consequences below predict a new primitive for §3's duplication; it is refused, and the four copies adopt `ui/Button` instead. §3 itself stands)  
**Implemented:** #361 — `tests/unit/support/tap-floor.ts` (the model: what takes a tap and how big its box is), `tests/unit/tap-floor.test.ts` (the sweep, the width clause, the cross-component clause and the two library rosters) and `tests/unit/support/markup.ts` (the `child` snippet, the import edge, and the walk fix below), plus the ninety boxes the sweep then convicted across thirty-four components

## Context

[ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) settled which box a tap floor binds and how that box is measured, and its Scope named what it was not covering: "Controls that are not fields. A button, a toggle cell, a calendar day. `.sb-factor` and the `ToggleGroup` cell four lines above it in `ScaleTier` carry the same wrong `2.75rem`, and a sweep keyed on field elements can only see one of them."

That exhibit is the whole argument. One row, one commit, one author, two boxes given the same wrong number, and a comment beside the toggle cell saying outright that it "wants a square cell big enough to hit". #338 levelled the field and could not see the cell. **A finger does not know which element it is landing on**, so a population defined by `input|textarea|select` is not a boundary in the design; it is the shape of a regex.

The measurement that followed was larger than the ticket expected. Widening the predicate took the sweep from 34 boxes to 165, and **ninety of the hundred and thirty-one that arrived were short, unreadable, or both**. The app's action primitive was among them: `ui/Button` declared no floor at all and drew 28px at `sm` and 40px at `md` on padding alone, under every one of its fifty-three call sites.

### The alternatives that were live

**Keep the field sweep and add a second one for controls.** Rejected on the ticket's own terms: two instruments means two populations, two models of a line box, and two places for a box to fall between. The extension needed here is a predicate, not an instrument.

**Define the population from the CSS instead.** `src/lib/**/*.svelte` carries 91 declarations of a fixed or minimum height or width in the 24-47px band, which looks like a ready-made list. It is a superset containing thumbnails, badges and icon glyphs that take no tap, and — worse — a subset, because a box short on padding alone declares nothing at all. `ui/Button` appears in neither direction. ADR-0093's population is discovered from markup for exactly this reason, and that is not re-argued here.

**Floor the badge-marks along with everything else.** Four ~14px badge-buttons sit in one wrapped cluster on a food card. Flooring them is possible and costs about 34px on every row of the densest list in the app. Rejected in favour of an entry in `SHORT_BY_ARGUMENT` and a ticket of its own ([#388](https://github.com/palebluebytes/inventoria/issues/388)), because what is wrong with them is their _role_ rather than their size: [ADR-0040](0040-no-monolithic-chip-vocabulary.md) says a badge is a status mark and a Button is the control, and growing them would harden that mistake into layout.

**Grow every small mark to 48px.** The simplest rule and the one ADR-0093 used for `ui/Checkbox`, whose rows more than doubled. It works where the box is chromeless and fails where the box _is_ the drawing: a 21.6px ⓘ ring grown to 48 is a 48px circle, which is not the same control.

### Scope

This record covers which boxes the floor binds and how a sweep may read them. It does not cover:

- **The value of `--tap-min`.** [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) §3's, and settled. Every "was 2.75rem" in this change is Apple's 44pt losing to Material's 48 for the second time.
- **Which box a tap floor binds, or how its height is derived.** ADR-0093 §1 to §5, applied here unchanged.
- **A pointer-conditional floor.** [ADR-0094](0094-a-tap-floor-takes-no-condition-because-no-query-knows-which-pointer-is-in-use.md) refused it, and the clause below that lets a breakpoint through is about padding, not about pointers.

## Decision

### 1. The population is every box that takes a tap

A box is in the sweep when a pointer activates it. Four things say so, and the tag is only the first:

- a native control — `<button>`, `<a href>`, `<summary>`, `<input>`, `<textarea>`, `<select>`;
- an interactive ARIA role on any element. Deliberately short: `button`, `link`, `checkbox`, `radio`, `switch`, `tab`, `option`, the `menuitem` family, `slider`, `spinbutton`. A `role` naming a _region_ — `status`, `listbox`, `dialog` — is not a control, and flooring one would convict a card for announcing itself;
- a pointer handler written on the element, in **either** spelling. `onclick={…}` and the forwarding shorthand `{onclick}` are the same claim, and a predicate that reads only the first misses `FoodItemRow` — every row of the food list;
- a part rendered by a component library, per §6.

Each segment of a date field is its own control by this rule, because each takes its own tap and its own arrow keys. The floor binds the segment, not the field around it.

### 2. The floor belongs to the primitive, not to the call site

`ui/Button` now declares `min-height: var(--tap-min)`, and that is one diff rather than fifty-three. The same holds for `ui/Card`'s pressable variant, `ui/Row`'s remove, `ui/ToggleGroup`'s cell and `ui/Segmented`'s.

The corollary is the one ADR-0093 already drew about copied skins, in the other direction: **a call site does not need to restate a floor it inherits, and a call site that reshapes the primitive does** — see §5.

### 3. Where the mark is smaller than the floor, the mark stays and the target grows

A control whose drawn box _is_ its chrome — a bordered ⓘ ring, a 28px reset square — is split rather than inflated. The button keeps the floor on both axes and gives up its own `border` and `background`; a `::before` draws the mark at its old size, absolutely centred. Hover and disabled states move to the pseudo-element with it.

This is ADR-0093 §1 applied to a control instead of a field. There it was `AmountField`, where naming the row as the label cost one element and no pixels; here it is CSS rather than markup, and the principle is the same: a rule that can only be satisfied by adding size will always be satisfied by adding size, and stating it in terms of the box means the answer is sometimes free.

**Chromeless boxes take the plain floor.** Where a control declares no border and no background, growing it draws nothing new, and the split would be indirection for its own sake.

### 4. A declared floor survives a breakpoint that moves padding

ADR-0093's Amendment made every conditional rule touching a modelled property leave the reading unread. That is right for a box measured by arithmetic and wrong for a box carrying `min-height: var(--tap-min)`: padding and type steps only ever _add_ to a box a `min-height` is already holding open, and a conditional `height` loses to it outright.

So a floored box is unread only where a conditional rule names something that can genuinely undo it — another `min-height`, a `max-height`, or a rule that stops it being drawn. Without this, `Sidebar`'s nav item and `WeekStrip`'s day button could never be _made_ readable, since their breakpoints move exactly the property a floor exists to survive.

**`display: none` at a breakpoint removes the box rather than shrinking it**, and a box that is not drawn cannot fail a finger. It is not a refusal. `ItemInspector`'s close ✕ is the tree's one instance: a mobile control, hidden above 800px where the panel is a fixed sidebar.

### 5. A rule that reaches across a component may not shrink a control

Svelte scopes a component's rules to its own elements, so the only way a call site can resize a box another file draws is `:global(…)`. Every such rule is checked, and one that puts a control under the token is a shortfall wherever it is written.

Three were doing it: `ScaleTier` held a `ToggleGroup` cell at 44, and `EventRecurrenceField` and `ScheduleRuleEditor` each held a `ui/Button` at 32 and 44. All three outrank the primitive's own rule on specificity, so §2's single declaration does not save them — which is the point of stating this separately rather than trusting the primitive.

A `:global` rule is convicted only where some element in the tree wearing its rightmost compound is a control. A rule sizing an `<svg>` inside a button, a meter's track or a visually-hidden label is not this sweep's business, and there are more of those in `src/` than of the other kind.

### 6. A library's parts are a roster, and the roster must cover the tree

bits-ui renders `Calendar.Day` as a `<button>` and `Calendar.HeadCell` as a `<th>`, and nothing under `src/` says so. That fact cannot be discovered from this repository, so it is written down: two sets, one of parts that take a tap and one of parts that draw chrome.

**A roster is admissible here only because it is held to the tree.** Every namespaced part in `src/` must appear in exactly one of the two sets, and no set may name a part the tree has stopped using. A new part fails the guard rather than being skipped, which is the property ADR-0093 said a hand-written population could not have.

**A part given a `{#snippet child(…)}` renders no element of its own.** It hands its props to one the reader can already see, so it is not in the population; `MonthCalendar`'s days are read as the `<button>`s they are, once.

### 7. Width is read only where it is declared

A text control is as wide as its text and no stylesheet holds the text, so there is no arithmetic here to be pessimistic with. What a rule _can_ say is read, and both readings convict:

- a **bound** — `width` or `max-width` under the token, with no `min-width` rescuing it. `.cf-skip` is 40 x 40 and stays 40 wide however long its label;
- a **declared floor** under the token — `min-width: 2.75rem`. The box may draw wider; the defect is in the declaration either way, which is ADR-0093 §4's rule about `min-height` on the other axis.

`min-width: 0` is neither. It is the flex idiom for "you may shrink me" and claims no size, which is why `WeekStrip`'s day button and `FoodView`'s back title are not convicted by it.

**This is a stated limit, not a silent pass.** A control that declares no width at all is not measured on that axis and this record says so, which is the difference ADR-0093 §5 draws between declining and answering "no".

### 8. An exemption is still an entry in the guard, and there are now six

ADR-0093 §6 stands unchanged and its list is no longer empty. Both arguments are WCAG 2.5.8's own exceptions rather than a plea, which matters: "this one is awkward" is what an exemption list degenerates into if the first entry is allowed to be that.

- **Four badge-marks** — `SourceTag`, `NovaBadge`, and `FoodCard`'s edit-origin and dietary marks. Argued above; the fix is a change of role, filed as [#388](https://github.com/palebluebytes/inventoria/issues/388).
- **Two inline links** — `<button>`s laid out _within a line of running text_. WCAG 2.5.8 exempts by name a target whose size is constrained by the line-height of the non-target text around it, and ADR-0093 §2 refuses to floor a `<label for>` caption on the same ground: the fix would be a 48px word in the middle of a sentence.

An exemption covers a box in all three of the sweep's lists — short, narrow, unreadable — because it is a decision about the box and not about which way the model happened to fail to clear it.

## Consequences

**The population is 165 boxes, and 133 of them are carried by a declared floor.** Before this record the split was 25 of 34. The move is not a change of standard: it is what happens when a sweep stops asking whether a box is a field.

**Nearly every fix was one declaration.** Ninety convictions across thirty-four components, and the answer was `min-height: var(--tap-min)` — with `min-width` beside it for a square — in all but eight. That is the shape ADR-0093 §4 predicted, and it is why the primitives were done first: `ui/Button`, `ui/Card`, `ui/Row`, `ui/BottomSheet`, `ui/ToggleGroup` and `ui/Segmented` between them took a third of the population out.

**The visible cost is height, and it is everywhere.** Every `sm` and `md` Button in the app grows to 48px; so do the tabs, the chips, the calendar days, the date segments and the nav. This is the same cost ADR-0093 took for `ui/Checkbox` across ten call sites, taken again at a larger scale and for the same reason: an opt-out from the floor is an opt-out from the finger. **Every visual baseline in `tests/` will differ**, and the rebaseline is a CI dispatch rather than a local run.

**Two `style="…"` attributes became classes.** `AddEventScreen` carried two buttons styled inline, which no rule can reach and no sweep can read. A floor is a declaration, so it has to live where the declarations are — the same argument [ADR-0097](0097-a-class-name-in-markup-is-reached-by-a-rule-or-by-a-spec-or-it-is-deleted.md) makes about a class nothing declares.

**One measurement in `tap-targets.test.ts` inverted.** It recorded that `.nav-item` reached 68.4px "without declaring a floor, on padding alone", which was true and is no longer a virtue: the box is re-padded above 768px, so its arithmetic was the phone's reading and nothing above the breakpoint could be derived from it. It now asserts the floor is declared.

**What this does not reach is anything a stylesheet does not describe.** A control sized by a parent's grid track, by a container query, or by an inline style set from script is outside every clause above. The sweep declines such a box loudly rather than passing it, which is the property that makes the gap safe to leave open — but it is open.

**A duplication was found and not fixed here.** §3's mark/target split is written out four times — twice for a 1.35rem ⓘ ring (`AllergenSafetyBlock` and `NutritionTargetEditor`, byte-identical, and identical before this change too) and twice for a 1.75rem reset square (`NutritionTargetEditor` and `CalorieCalculatorSheet`). Each copy now carries a hover and a disabled state relocated onto the pseudo-element, so the recipe is longer than the duplication that preceded it. ADR-0093's Consequences named exactly this shape — "a shared primitive protects only the call sites that reached for it, and a copy taken before a fix never receives it" — and the answer is a primitive rather than a fifth copy, which is a change to the ADR-0040 vocabulary and belongs with #362's arc rather than inside a sweep. Filed as [#390](https://github.com/palebluebytes/inventoria/issues/390).

**The instrument found a hole in its own reader.** `markup.ts`'s tag walk tracks quote state, and an apostrophe in a handler's `//` comment — "the input's blur" — opened a quote nothing closed: the scan ran off the end of the file, dropped the tag it was reading, and dropped every tag after it. `CategoryPicker`'s `<li role="option">` and the three elements below it were invisible to **every** census in this repository, which is why a 44px option row survived #338, #376 and #381. Comments are now skipped inside an expression. This is the third time a fixed assumption in that walk has narrowed a population silently, after #376's brace depth and ADR-0093's at-rule drop, and the pattern is worth naming: a reader that cannot parse something must say so, and this one was built to stop.

**The roster is the one thing here that can rot quietly.** Its coverage assertion catches a _new_ part; it cannot catch bits-ui changing what an existing part renders. That would need a rendered-DOM measurement, which is the e2e tier, and is not attempted here.

## Amendment (2026-09-13): the duplication needed an adoption, not a primitive

The Consequences above filed #390 with a prediction: _"the answer is a primitive
rather than a fifth copy, which is a change to the ADR-0040 vocabulary"_.
[ADR-0100](0100-what-earns-a-member-of-the-ui-vocabulary.md) refuses that primitive,
and the prediction is withdrawn.

What it missed is a question §3 never asks: **why is the mark drawn in CSS at
all?** `ui/Button` already carries `min-height: var(--tap-min)` and already takes
a `children` snippet, so the four copies are `<button>`s that never adopted it.
The `::before` and the two relocated states exist only because the mark is a CSS
drawing rather than content — pass a glyph or an SVG as children and there is
nothing to centre absolutely and nothing to relocate. ADR-0100 §1's subtraction
clause therefore leaves a reach of zero, and §6 refuses the name `IconButton`
besides: a control you press is a `Button`.

**§3 is not withdrawn.** Where a mark genuinely is drawn in CSS, the split it
describes remains the right recipe. What ADR-0100 adds is the prior question, and
the consequence that where the mark can be content, adoption **deletes** the
recipe rather than extracting it.

#390 stays open under its own number, retitled to the adoption, because the
measurement in it — four copies, two identical pairs, byte-identical including
their comment, and identical before this change — is the evidence the refusal
rests on.
