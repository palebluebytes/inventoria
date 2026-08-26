# ADR 0059: The meal header offers every way into a meal, and each way is its own sheet

**Status:** Accepted  
**Date:** 2026-08-26

## Context

[Issue #166](https://github.com/palebluebytes/inventoria/issues/166) asked for a
second control in each meal-section header — one that copies a past meal —
sitting to the left of the `+`. It settled that as ruling 13: _"Its own
BottomSheet and its own button — not a fifth `FoodStager` tab via `extraTabs`.
Every tab in that stager picks a food; this picks a meal."_ It also flagged that
call as the load-bearing one, and asked the prototype to check the cheaper
alternative before committing to a second header control.

The prototype checked it, and the answer came back larger than the question.

### What the `+` actually is

`+ Add breakfast` does not name an action. It opens a sheet that then asks a
second question — _by which method?_ — and offers Search, Scan, Custom and
Recipe in a dock at its foot
([ADR-0026](0026-shared-food-staging-component.md)). Every one of those is a
different way into the same meal, and the `+` is a lobby in front of all of
them. The tab dock is where the real choice is made; the `+` only defers it.

Ruling 13's argument against the fifth tab — _"a tab would put it behind the
`+`, reinstating the very tap the control exists to remove"_ — is true of the
other four ways in as well. Nothing about a past meal makes that tap uniquely
wasteful.

### What the prototype showed

Two shapes, on a facsimile of the dashboard over the same fixture (branch
`prototype/166-copy-a-past-meal`, `?demo=copymeal`):

- **a "Past meals" tab behind the `+`** — the cheap alternative ruling 13
  rejected on argument. Three things told against it in the flesh. The dock
  already carries four tabs in a one-word uppercase label slot at 52 px, and
  "Past meals" is two words. A tab cannot vanish the way ADR-0058 §7 lets a
  button vanish, so it needs an empty state that a hidden button never needs.
  And it keeps the deferred tap for every method, not just this one.
- **a button per way in, and no `+`** — chosen.

### Alternatives that were genuinely live

**Keep the `+` and add one button beside it**, exactly as #166 specified. This
is the smaller change and it ships ADR-0058 on its own. It leaves the header
saying that copying a past meal is special and the other four ways are not,
which is a claim nothing supports. It was rejected as an end state and then, in
§6, rejected as a step too.

**Keep the `+` as a lobby and put all five behind it**, tidying the dock rather
than the header. It preserves the deferred tap that #166 exists to remove.

**A menu on the `+`** rather than five squares. It is the same lobby with a
different door, and it costs a tap plus a dismissible surface.

**Scope.** This record covers the meal-section header in the food dashboard and
the log flow reached from it. It does **not** cover `AddIngredientSheet`, which
consumes the same `FoodStager` from the recipe builder and has no meal header to
hang buttons on; that host keeps its dock. It does not change what any method
does once opened, and it does not change `FoodChoice` or anything downstream of
it.

## Decision

### 1. Every way into a meal is a control in the meal header

The meal-section header carries one 2 rem square per way in, in line with the
meal name. There is no `+`. The order, left to right, is **copy, custom, recipe,
scan, search** — the past meal nearest the meal name, search furthest from it.

### 2. Each control opens its own single-purpose sheet, with no method dock

A sheet reached from the header does one thing and says so in its title, which
is the same words the control's accessible name used. It carries no tab dock,
because the header already made that choice.

This amends **ADR-0026**, which gave `FoodStager` "the method state and the
Search / Scan / Custom sub-flows … and the method dock", and had `LogFoodSheet`
inject the Recipe browser as an `extraTab`. The stager keeps everything else it
owns — the stage, the staged card, the amount panel, `onChoose` — and the dock
becomes a host's choice rather than a fixture. `AddIngredientSheet` keeps it;
the log flow drops it.

### 3. All the controls are secondary

With the `+` gone, the header has no primary action left to protect. #166 ruling
14 wanted the `+` to stay dominant over "two equal blocks of ink"; five equal
blocks is the opposite arrangement, and the answer is to make them all
secondary rather than to elect one of the five.

### 4. A control is hidden when it could not work

The past-meal square is absent until that meal has history (ADR-0058 §7). Since
it leads the row, the row shortens from the meal name's end. Any later control
that can be dead on arrival follows the same rule rather than rendering
disabled.

### 5. The marks are drawn, not borrowed

Header controls use stroke marks on `.add-meal-icon`'s spec — `currentColor`, a
2.25 square-capped stroke — not the dock's emoji, which read as stickers in a
grayscale header.

### 6. ADR-0058 and this record land as one change

Splitting them was available and was refused. The past-meal control is
well-defined as a second header button beside a surviving `+`, and ADR-0058
depends on no clause here, so it could have gone first with this record
following. It does not, because a `+` that survives one release only to be
removed the next teaches the header twice, and the second lesson has to unteach
the first. There is no point shipping a layout already known to be wrong.

The two records stay separate because they settle different questions — what a
copy does, and where the ways in live. That is a boundary between decisions, not
a boundary between releases.

## Consequences

**This is a much larger change than #166 asked for**, and it is worth saying
plainly. It removes the `+` from four meal headers, moves the log flow's method
choice out of `FoodStager`, turns the Recipe `extraTab` into a header control,
and invalidates every selector and screenshot that names `Add {meal}`. §6 refuses
the obvious relief — shipping ADR-0058 first behind a surviving `+` — so the
whole of it arrives at once, and the copy control cannot land early if this half
runs into trouble. That is the accepted cost of not teaching the header twice.

**Changing your mind now costs a close and reopen.** The dock let a user switch
method mid-sheet; a single-purpose sheet does not. That is the price of removing
the deferred tap, paid by the rarer action.

**Five squares is roughly 12 rem of header** beside the meal name. They wrap
rather than push the name off, so a narrow screen shows the squeeze. If the row
proves unworkable at small widths the fallback is not the `+`, it is fewer ways
in — the header is then telling us the app has too many.

**The header now teaches the app's shape.** Four ways to add a food were
previously invisible until the sheet opened. Making them visible is most of the
value here and also most of the risk: a user who never scans now sees a scan
button on every meal, every day.

**`FoodStager` gains a mode it must keep honest.** The dock becomes optional,
and an optional dock is a branch that can rot. The add-ingredient host is the
only remaining caller that wants it, so if that host ever loses the dock too,
the option should be deleted rather than left standing.
