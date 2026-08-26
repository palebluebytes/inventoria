# ADR 0058: A past meal is copied whole, at the amounts it was logged, into the meal you are viewing

**Status:** Accepted  
**Date:** 2026-08-26  
**Implemented:** [#167](https://github.com/palebluebytes/inventoria/issues/167); `66b03e8` (the read and the copy), `627f8d6` (the header and the sheets), `92b163c` (review fixes); `src/lib/food/past-meals.ts` (the narrowing, the copyable partition and the tally), `src/lib/stores/calorie.store.ts` (`copyPastMeal`), `src/lib/views/food/PastMealSheet.svelte` (the picker)

## Context

[ADR-0057](0057-the-recent-list-is-the-meals-default-content.md) made the log
sheet's Recent list _the foods you logged at this meal_, so a repeated breakfast
is one tap per food. Two things it still cannot give you:

- **the set** — the foods come one at a time, and nothing says they belong
  together;
- **the amounts** — each tap still opens the amount panel and asks for grams.

Someone eating the same three-item breakfast eight mornings running pays three
taps and three amount entries for a meal they have already described eight
times. That gap, and only that gap, is what this record answers. A proposal that
closes one half of it and not the other is out of scope by construction.

### What the surface is

Recent gives you **a food**. This gives you **a meal**: its foods _and_ its
amounts, in one action. That is the claim ADR-0057 does not make, and it is why
this is not a widening of Recent rather than a separate control. A Recent entry
is a twin you _might_ use; a past meal is an occasion you actually ate. The two
are judged differently — Recent is judged on being apt, a past meal on being
faithful.

The distinction also settles the catalogue question. `isCatalogueFood`
([ADR-0035](0035-custom-food-intent-chooser.md) §6) keeps one-off manual entries
out of Recent because they are not reusable _foods_. That reasoning does not
reach a meal actually eaten, and excluding them would understate the day.

### Alternatives that were genuinely live

**A checkbox picker**, choosing which foods to bring across. The moment the user
is ticking boxes they may as well have used the ordinary add flow, and the ✕
already on every logged row trims a copy afterwards at the same cost.

**Re-deriving a recipe serving from its template** rather than copying the
frozen `event/instantiation` snapshot. Rejected: an edited recipe would log
something the user did not eat under the name of something they did.

**Preserving the source times**, so a copied breakfast keeps its 08:14. It buys
an ordering that is cosmetic inside a meal section and pays for it with a lie
about when the food was eaten.

**A toast with an undo.** Reversing one log is one tap; reversing a five-item
copy is five, and that asymmetry is real. It does not buy the app's first
toast/undo primitive, plus its ADR and its `CONTEXT.md` entry, for one button.

**Collapsing the picker by identical composition** — five identical breakfasts
as one row reading "×5 · last Mon". Prototyped and dropped. The measurement is
recorded here because it is the part of the comparison that survives as
evidence: over a sixteen-day fixture the collapse took breakfast from 15 rows to
4, lunch to 6 and dinner to 7. It pays where meals repeat and barely at all
where they do not, so the picker's length would depend on how varied the reader
eats — and identity would have had to mean same foods _and_ same amounts, since
§2 makes the amounts the point, so 40 g and 60 g of oats could never have shared
a row anyway.

**A "Past meals" tab inside the sheet the `+` opens**, rather than a control of
its own. Prototyped and dropped;
[ADR-0059](0059-the-meal-header-offers-every-way-in.md) records what replaced it
and why.

### Where the evidence is

Branch `prototype/166-copy-a-past-meal` is the primary source: three shapes on a
facsimile of the food dashboard over a hand-transcribed sixteen-day fixture,
reached at `?demo=copymeal`. Its history carries the two dropped variants; its
tip carries the settled one.

**Scope.** This record covers what a copy does and what the picker shows. It
does **not** cover where the control lives or how it is reached — that is
ADR-0059, and this control is one of the five ways in that record describes.

## Decision

### 1. A copy is wholesale

Copying brings across **every** food in that meal in one action. There is no
selection step. Partial copies are made afterwards, with the ✕ already on each
logged row.

### 2. Amounts are reproduced exactly, as logged

A copy that silently changed how much you ate would not be a copy, and the
meters would move by the wrong amount. The amount is carried across verbatim,
never re-derived and never rounded to a preset.

### 3. The tap is the commit

There is no confirmation step. The picker row already showed the meal's
contents, so the tap _is_ the informed decision.

### 4. A meal is copied only into the same meal

The control's position gives it its meaning: _this meal, from a previous day_.
It never offers a past lunch for today's breakfast.

### 5. A copy appends and never replaces

Whatever is already logged at that meal on that day stays. A copy must not
destroy something the user entered.

### 6. Sources are any logged day except the one being viewed, newest first

The operative idea is "a meal I have already eaten". While back-filling an old
day, _later_ days satisfy that reading too, and excluding them would be a rule
with no visible reason. Only the day on screen is excluded.

### 7. The control is hidden when the meal has no history

Precedent: `.today-btn` in `WeekStrip.svelte` (`{#if !onToday}`). This deviates
from ADR-0057 §5, which had an empty default explain itself rather than vanish,
and the difference is the reason: Recent is empty inside a sheet opened for
another purpose, whereas history is this control's _only_ job. A button that
always disappoints is worse than one that is not there yet.

### 8. Entries Recent deliberately hides are included

The catalogue rule (ADR-0035 §6) does not apply here, for the reason in Context.
A one-off manual entry logged at that meal is copied like anything else.

### 9. A recipe serving reproduces its frozen snapshot

The `event/instantiation` blob ([ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md)) is
copied verbatim, **never** re-derived from the recipe as it stands today.

### 10. A copied entry takes now's clock

Like every other log, on the viewed day, exactly as `logFoodConsumption` stamps
one. Ordering inside a meal section is cosmetic; a timestamp is not.

### 11. Success is silent, and only failure speaks

A clean copy closes the sheet and the rows appear. That is the app's existing
answer for logging a food, and this is that N times over.

Partial failure follows `scaleSelected`'s contract in `FoodView.svelte`: loop
per item, catch per item so one failure does not abort the run, tally, and
surface a `role="status"` line **only when something went wrong** ("3 copied ·
1 no longer available"). Like the scale note, it must not outlive what it
described.

### 12. The picker is one row per past day, newest first

Each row carries the date, the meal's total, and its contents _with amounts_ —
one food per line, so what is about to be copied is legible without a second
tap. Rows are not collapsed or grouped.

### 13. The mark is a clock, not a copy-mark

The action is a copy but the button opens history, and the mark says what the
tap reveals rather than what it will afterwards do.

## Consequences

**The picker is long, and deliberately so.** One row per day over a few weeks is
a few weeks of rows. §12 chose legibility over brevity; if that becomes the
complaint, the collapse in Context is the measured alternative to reach for, and
the measurement above says it will help breakfast far more than dinner.

**Nothing new is stored.** Every rule here is a read over facts already held, or
a write through the existing `logFoodConsumption`. There is no attribute, no
migration, and no projection change.

**A five-item copy is five taps to undo.** §11 accepted that knowingly. The
trigger for revisiting it is a _second_ multi-write action wanting the same
affordance — one button does not justify a toast/undo primitive, two might.

**§6 will surface later days while back-filling**, which reads oddly the first
time. It is the honest consequence of "a meal I have already eaten", and the
alternative is a rule the user cannot see.

**§7 leaves the control invisible until the second day of use.** A new user
never sees it, which is the cost of not showing a button that could not work.
ADR-0059 §4 makes the same call for the same reason.
