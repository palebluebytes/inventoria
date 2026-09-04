# ADR 0091: Rations widens into two regions, and above that width it has pages

**Status:** Accepted  
**Date:** 2026-09-03  
**Amends:** [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) §5 (narrows what "one design that widens" protects), [ADR-0078](0078-a-facet-contains-no-way-out.md) §1 (one Tracked Domain stopped implying one screen)  
**Implemented:** §1 by #347 — the Amendment on ADR-0089 itself, since what §1 changes is another record rather than any code. §2, §3 and §4 by #342 — `app.css` (the one shared `.main`, centred and capped, and the three measures `--measure-solo`, `--measure` and `--rail`), `App.svelte` and `Rations.svelte` (each losing its copy of a rule that was duplicated character for character), `views/food/DailyDashboard.svelte` (the `.day` element the two-region grid is written on, scoped to `.rations` so the root's Food tab does not grow a rail, and the room under the last meal moved onto the timeline), `tests/unit/shell.test.ts` (§4 is a decided absence, so the unpinned rail is asserted rather than drawn). The rail's own top block by #344 — `views/food/MonthCalendar.svelte`, `lib/food/logged-days.ts` (the pure day-key fold and the local-fields conversion the calendar reads through), `views/food/DailyDashboard.svelte` (which swaps the week strip and the `.dashboard-header` banner out for it at this width, the first exercise of §1), `tests/unit/logged-days.test.ts` and `tests/unit/month-calendar.test.ts`; the shipped weight is +58,485 B on Rations (+57.1 KiB, +0.58%) and +8,502 B on the root (+0.09%), measured build to build — the Consequences below say "about 56 KiB" and "~7.5 KiB", which were the prototype's figures and are what these replace. `facets/registry.ts`'s `precacheBytes` moves further than either, because it had not been re-declared since #343 and takes up that drift too, and it says so. §5's `inline` surface by #341 — `ui/BottomSheet.svelte`, `views/food/FoodSettingsSheet.svelte`, `views/food/RecipeLibrarySheet.svelte` — and the `Rations.svelte` comment §5 makes false by #347. §5's pages themselves by #345 — `food/pages.ts` (the roster in the header's order, what each page's one control is called and what a legend says it does, and the width a page exists at — which is where the shell half of that lives, so a shell with no pages never reads a width and a resize cannot reach a screen that has only ever shown sheets), `ui/breakpoints.ts`'s `watchAtLeast` (the only width this app reads from JavaScript, because a page is a component mounted rather than a box laid out), `views/FoodView.svelte` (one opening instead of two booleans, the title as the way back, the header's icons as navigation with the current one inverted, and one call site per surface switched by `inline`), `Rations.svelte` (`hasPages`, the shell saying what it can hold, which the root does not pass) and `tests/unit/pages.test.ts`. Two of the three pages: Reports is not in the roster because #346 has not built it. §8's roster and gate by #343 — `lib/ui/breakpoints.ts`, `tests/unit/breakpoints.test.ts` — and its seven deletions by #342 — `views/FoodView.svelte` ×1, `views/food/DailyDashboard.svelte` ×5, `views/food/CommitButton.svelte` ×1. An eighth of the same shape survives in `app.css`'s `.main` gutter, because #342 enumerated the seven it was deleting and did not name it; both that file and `shell.test.ts` say so rather than calling it a shape rule. §6 and §7 are unbuilt — a report is #346

## Context

Rations has a mobile-first design and no desktop design at all. Above 768px it
does not reflow; it pads. On a 1920px screen it renders an ~864px column hugging
the **left** edge — `.main` is `max-width: 54rem` with no `margin: 0 auto` — with
roughly a thousand pixels of empty grey beside it. Nothing moves into that space
at any width. Every other adaptation above the breakpoint is a spacing or type
step onto a scale that is already fluid.

This was mapped in [#337](https://github.com/palebluebytes/inventoria/issues/337)
and prototyped on `prototype/337-rations-desktop` against the real ledger. Three
shells were built and compared at 1280 and 1669px: a centred single column as the
control, a two-region shell with a rail, and the four meal sections two-up. The
control lost — centring alone is a real improvement and not an answer to the
width. The two-up timeline lost for the reason it was refused before it was
built: the four meal sections are a chronology, and a grid asserts they are peers.

**The alternatives that were live.** Growing the Utopia scale past its 1240px
ceiling so type and space keep expanding was refused: the scales are calibrated,
every screen reads off them, and regenerating them moves the phone. A third
middle shell between phone and desktop was refused as a third thing to design and
photograph whose only content would be "the two-region shell, but without the
rail". Promoting the full-day RDA panel into the rail was refused because it
leaves the control that opens it with nothing to open.

**Scope.** This record covers Rations' shell, its rail, and the pages it grows
above the shell breakpoint. It does **not** cover the overlay shape, which is
ADR-0089 §6 as amended by [#340](https://github.com/palebluebytes/inventoria/issues/340);
it does not cover the root Facet's screen compositions, which keep the shell rule
and nothing else; and it does not rule on whether a report should exist on a
phone, which §7 records as open rather than settled.

## Decision

### 1. ADR-0089 §5 protects the vocabulary, not the arrangement

§5 says a width difference "may buy more room, never a different shape". The
argument under it — do not grow a second codebase — is kept. What it protects
narrows:

> **One information architecture, one set of parts, one way in per action.**
> Width may re-arrange and un-stack the same parts. It may never add a part,
> remove a part, or give an action a second door.

A month calendar where a phone shows a week strip is the same part presented
differently, and passes. A control that exists at one width and not another does
not, unless it is a way in to something that width cannot hold — which is §7.

### 2. The shell centres and caps at every width, and splits at one

`.main` is centred and capped everywhere: `54rem` below the shell breakpoint,
`72rem` above it. The rule is written **once and shared by both Facets** — it is
currently duplicated character for character between `src/App.svelte` and
`src/Rations.svelte`, which is the same defect twice.

Above the shell breakpoint Rations is two regions: the meal timeline on the left
holding the reading edge, and a rail of `22rem` on the right. The rail is on the
right because the timeline is the subject and should keep the edge the eye
returns to, and because a left rail would rhyme with the root's navigation
sidebar while navigating nothing.

### 3. The two regions are the day's shape, not the shell's

The grid belongs to the day screen and is scoped to it. Left unscoped it outlives
the screen it was drawn for: a page carries no grid area, auto-places into the
first free cell, and renders into the timeline's column with the rail empty
beside it.

### 4. The rail is not pinned

The numbers do not follow the reader down a long day. This is decided, not
deferred.

Pinning would want the rail pinned **as one unit**, and there is no unit: the
calendar and the Nutrition block are siblings of the timeline rather than children
of a rail. Pinning them separately either overlaps them or needs the calendar's
height as a constant. **A rail that should be pinned is a rail that needs a real
element**, and that is the trigger for reopening this.

### 5. Above the shell breakpoint, Rations has pages

Settings, Recipes and Reports are pages. The header's icons are navigation there,
the icon of the current page is inverted, and **the title is the way back** — the
only way off a page, since the icon that opened one is a toggle to nowhere.

A page is reached only above the breakpoint. Below it the same icons open sheets
exactly as before, and a window narrowing past the breakpoint returns the reader
to the day rather than leaving them on a screen that cannot exist.

A page **reuses the surface it replaces** rather than growing a second copy:
`BottomSheet`'s `inline` renders the same header and body into the page's flow
([#341](https://github.com/palebluebytes/inventoria/issues/341)).

**This contradicts ADR-0078 §1 and the comment in `src/Rations.svelte` that says
Rations "is one Tracked Domain, so it is one screen", and the contradiction is
the decision rather than an oversight.** What ADR-0078 defends is that Rations
contains no way _out_ — no link to a screen outside this Facet's build, because
such a screen is not in it. That holds unchanged: every page here is Rations'
own, and a cross-Facet link remains unexpressible. What changes is that "one
Tracked Domain" stopped implying "one screen". The two were only ever the same
sentence because nothing had yet needed a second surface. `Rations.svelte`'s
comment must be corrected in the same change that builds this, or it is false.

### 6. A report is derived on read, and is never a datom

A report is a question asked of the ledger. It is computed from `datoms` when the
page renders and stored nowhere, so it cannot fall out of step with the facts it
summarises, and it needs no attribute in `docs/eavt-vocabulary.md`.

The period is weekly, monthly, yearly or custom. The three fixed periods are
**rolling, not calendar-aligned**: "this week" makes Monday morning a report on
one day, and the question is how someone has been eating lately. A custom period
shows no report until both ends are set, because a half-chosen range is not a
period.

A day with nothing logged is **absent** from a report rather than plotted as a
zero, on ADR-0048's rule that an absent measurement is not a zero.

### 7. Reports is desktop-only, and that is a product decision

Reports has no sheet form and therefore no control below the shell breakpoint. A
control that opened a phone-sized sheet of bar charts would be offering something
the surface cannot carry, and ADR-0059 §4 says a control that can only disappoint
is absent rather than disabled.

**This is recorded as a decision about the product, not about layout, and it is
the weakest clause in this record.** It means a phone never sees a report at all,
on an app whose floor platform is a phone. It is accepted now because a report is
a reading surface — dense, comparative, and about a period rather than a moment —
and no phone form for one has been designed or measured. It should be revisited
the first time somebody wants their week on the device they logged it with;
nothing here forecloses that, because §6 makes a report a function of the ledger
and not a thing that had to be stored differently for a phone.

### 8. A shape change is a breakpoint, and the roster is closed

The set of widths this app changes shape at is declared in
`src/lib/ui/breakpoints.ts` and proved closed by a gate. A media query that steps
a `clamp()` token up to a larger one is not a shape change — it is the Utopia
scale being distrusted, and seven such steps are deleted by this work.

The shell breakpoint is **1180px** and must stay at or below 1280, which is the
`chromium` Playwright project's viewport: a shell no test viewport reaches is a
shell nothing defends.

## Consequences

**There are now two shape breakpoints in this app, and the seam has to be said
out loud.** 768 carries the overlay shape and the root's sidebar; 1180 carries
Rations' shell. Between them, Rations is one column whose sheets are already
centred cards. Above 1180, Rations shows no bottom sheet at all, so ADR-0089 §5's
"above 768px the peek returns" is moot there while remaining live in the root.
Anyone opening Rations at 1280 and reading §5 will find it describing something
that is not on their screen; §5's Amendment says so.

**The root Facet gets the shell rule and nothing else.** De-duplicating `.main`
centres the root's six screens too. That is the same defect and the same fix, and
it moves all 13 of the root's desktop baselines — a cost paid on purpose rather
than avoided by preserving a bug.

**Rations' own shell has never been photographed.** `visual-catalog.spec.ts`
captures at `/?mem=1`, the root, so every `food-*` baseline shows the food screen
inside the root's shell with a sidebar taking ~200px. Two Facets render the same
screen into two different shells and only one of them is in a picture. This work
is not proved until Rations is captured at `/food/`.

**The rail is thin.** It holds the Nutrition accordion and a month calendar. If
it turns out not to earn its column, the answer is more of the day's numbers in
it, not the full-day panel promoted out of the control that opens it (§1
forbids removing that door).

**A month calendar costs Rations about 56 KiB** — measured, +0.58%, against a
±5% band with 387 KB of headroom left. `@internationalized/date` was new to that
bundle. The root also gains ~7.5 KiB, because `DailyDashboard` is shared and the
root's Food tab renders it; the root pays less because `habits` already carried
the date library. `registry.ts`'s declared `precacheBytes` must move with it.

**Deferred behind a seam**: a pinned rail (§4, triggered by a real rail element),
and a phone form for a report (§7, triggered by someone wanting one).
