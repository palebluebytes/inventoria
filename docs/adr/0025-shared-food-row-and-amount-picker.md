# ADR 0025: One food row, one amount picker — shared across the dashboard and recipe lists

**Status:** Accepted  
**Implemented:** `FoodItemRow.svelte`, `IngredientAmountSheet.svelte`, `changeLoggedFoodAmount`

## Context

A logged food appeared in two places that looked and behaved differently:

- On the **dashboard** (`DailyDashboard`) a logged food was a card — name over a
  muted quantity subtitle, kcal on the right, a corner ✕ — and tapping it opened
  the full `LogFoodSheet` in edit mode.
- In the **recipe / instantiation builder** (`IngredientListEditor`) an
  ingredient was a different row with an inline amount `<input>`; ADR-0023's
  numeric+slider control (`QuantityGrams`) only reached the _add-ingredient_
  sheet, not the row itself.

Two visuals and two edit affordances for what is fundamentally the same thing —
"a food, in some amount, contributing some macros." The amount was also editable
in three inconsistent ways (dashboard full-edit sheet, recipe inline input,
add-sheet slider).

## Decision

**One presentational row component and one amount picker, shared by both
surfaces. The row reads as the dashboard card; tapping it opens the picker.**

- **`FoodItemRow`** renders the shared line — `lead` slot (photo / selection
  check) · name · muted quantity subtitle · kcal · corner remove — in the
  dashboard's visual. Both `DailyDashboard` and `IngredientListEditor` render
  through it, so they are identical by construction. It is presentational: it
  takes an optional whole-row `onclick` and an `onRemove`; the dashboard leaves
  `onclick` unset and lets its own wrapper (which owns long-press selection)
  handle the tap, while the recipe list passes `onclick` to open the picker.
- **`IngredientAmountSheet`** is the one amount editor. It edits a working copy
  and reports the result once on **Done** (`onCommit`), so the caller commits it
  its own way without the sheet knowing which: a recipe mutates the ingredient in
  memory (live re-derivation of per-serving totals); the dashboard
  retract-and-replaces the logged event append-only. It wraps ADR-0023's
  `QuantityGrams`, so the recipe row, the add-ingredient sheet, and the dashboard
  all share the same numeric-first control.
- **`changeLoggedFoodAmount`** is the dashboard's commit: it re-derives the
  food's macros from its twin's `nutrition/info` panel at the new amount (the
  ADR-0021 formula), logs a fresh Consumption Event, and retracts the old one
  (ADR-0008). No `UPDATE` — a logged food's amount change is a supersession, like
  every other edit.

**Grams only; whole-serving amounts are locked.** The picker edits grams, where
scaling a twin's per-100 g panel is well-defined. A whole-serving / custom food
(logged as "1 serving" with frozen macros) has no per-gram twin to rescale, so
its amount is **locked at 1 for now** (future work): its row is inert, and on the
dashboard it still opens the full `LogFoodSheet` where its macros and photo
remain editable. Recipe instantiations keep their own correction editor
(ADR-0022) — a tapped recipe card routes there, not to the picker.

## Consequences

- The dashboard's own look is unchanged — `FoodItemRow` reuses its exact styles —
  and the recipe rows now match it, from one component. The old inline
  amount-input row and its bespoke styles are gone.
- Editing an amount is the same gesture everywhere: tap the row → numeric +
  slider + presets → Done. `QuantityGrams` is now reused by the log flow, the
  add-ingredient flow, the recipe rows, and the dashboard.
- `IngredientAmountSheet` moved from a live two-way `bind:amount` to
  commit-on-Done, so the dashboard's append-only retract-and-replace fires once
  per edit rather than per slider tick.
- Covered by a Seam 2 unit test for `changeLoggedFoodAmount` (re-derive + retract;
  no-op without a panel), the `unitLabel` unit test, and Seam 3 e2e (tap a logged
  gram food → picker → amount + total update; recipe rows edit through the picker).
- **Deferred:** editing a whole-serving amount (needs a serving-count model that
  scales frozen macros), and a `valuetext` announcement (carried from ADR-0023).

## Amendment (2026-09-03): a logged food's name has the full width, and its amount is its figure

The decision above gives `FoodItemRow` one shape — "name · muted quantity
subtitle · kcal" — and rests on it: both surfaces render through the component,
"so they are identical by construction". The dashboard's row no longer reads that
way, and the two surfaces are no longer identical.

**A logged food is a full-width name over its amount, and states no kcal.** A
mark beside the title is a column taken from the title: the kcal figure reserved
5.4em of every row, and a long food name — "Bananas, ripe and slightly ripe,
raw" — wrapped into two lines against that column while it stood empty below.
The amount moves down onto the line the quantity already occupied, set like the
figure it now is (right of the line, the kcal figure's weight and size), and
nothing is reserved beside the name.

Losing the kcal figure from the row is the point rather than a cost of the move.
The number a logged row is read for is its amount — it is what the row's own
controls change, the picker (this ADR) and Scale (ADR-0088 §5) both write one —
and a food's calories are already stated three other places the same screen
reaches: the meal's subtotal under the list, the day's meters above it, and the
picker a tap opens.

A recipe ingredient row is read for its derived kcal, so it keeps the older
shape, and keeps ADR-0088 §6.3's reserved column with it: there, a previewed
figure that gains digits still has a name column beside it to squeeze. The shape
is chosen by the `logged` prop, and the parts keep their names — `.fi-qty` is the
quantity on both — so the `.fi-name` / `.fi-qty` / `.fi-remove` contract the e2e
suite locates is unchanged. The name is now the part that has to clear the corner
✕, since it is the part that reaches the corner.

**The amount is set as a reading of the name, not as a second heading.** It
shares the name's left edge, one step down the scale in the secondary ink, bold
and tabular because it is still the row's figure and because a column of them is
read down the list. Right-aligned on a line of its own it had left the card
occupied only on a diagonal — a figure in one empty band, the ✕ alone in the
other — and set at the name's own size and ink the two competed for a row that
has one subject. The card also lost a step of vertical padding (a list line, not
a poster) and gained a tighter leading on the name, so a wrapped name and the
amount under it read as one block; the ✕ is drawn in the muted ink and takes its
full ink back on hover, since it is an action on the row rather than a figure in
it.

**The meal subtotal's labels are no longer set in capitals.** `PROT 1.41 g` was
the only place in the app that shouted a nutrient's name; the compact labels are
short enough to read as labels without it, and the tracking that caps needed went
with them.
