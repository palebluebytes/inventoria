# ADR 0029: Decompose the god-screen components into focused sub-components

**Status:** Accepted  
**Implemented:** `food/DailyDashboard.svelte`, `AgendaView.svelte`, `habits/AddEventScreen.svelte`

## Context

After the sheet/staging work (ADR-0025 through ADR-0028) shared the food chrome,
three screens were still single files bundling many responsibilities:

- **`food/DailyDashboard.svelte`** (~790 lines) — a week-strip date selector, a
  calorie progress ring, three macro meters, the per-meal logged-food timeline,
  and a photo-preview modal, plus all their CSS in one `<style>`.
- **`AgendaView.svelte`** (~800 lines) — a date-nav header, the SCHEDULE
  time-gutter timeline, the untimed HABITS list, two bottom sheets, and — the
  meatiest part — ~140 lines of `$derived` that fuse timed habit sub-targets and
  projected calendar-event slots into one time-ordered, block-annotated,
  time-clustered list.
- **`habits/AddEventScreen.svelte`** (~1110 lines) — the whole add-event form:
  a bits-ui date-picker block copy-pasted three times (start / end / until),
  the recurrence controls, the time-slot editor, and ~95 lines mapping the form
  to a `ScheduleRule` (with inline nth-weekday-of-month date math).

Each file had several reasons to change and no piece was individually navigable
or testable. The schedule-grouping math in particular was pure logic trapped
inside a `.svelte` component, reachable only by driving the whole view in a
browser.

## Decision

**Split each screen along its natural seams into presentational sub-components,
and lift the one genuinely pure, non-trivial computation out into a plain module
so it can be unit-tested directly.**

Dashboard → three presentational children (all in `views/food/`):

- `CalorieRing.svelte` — owns the SVG ring geometry (radius, circumference,
  offset) given a running total and target.
- `MacroMeters.svelte` — the protein/fat/carbs meters; loops over one descriptor
  array instead of three copy-pasted blocks.
- `WeekStrip.svelte` — the Monday-aligned week selector; owns its own week math
  and two-way binds `selectedDate`.

Agenda → a header, two section components, and a pure module:

- `AgendaHeader.svelte` — the ASCII date-nav box.
- `ScheduleSection.svelte` — the time-gutter timeline; renders already-clustered
  groups and forwards interactions.
- `HabitsSection.svelte` — the untimed habits list.
- `cal_events/schedule-grouping.ts` — `annotateSchedule` (sort + `isDuring` /
  `isOverlap` block annotation) and `clusterByTime` (collapse same-time items
  into rows), plus the `ScheduleItem` / `TimeGroup` types. The view keeps only
  the store-reading (which habits/events exist for the day) and calls these two
  functions.

Add-event → two form-field components and a pure module:

- `DateField.svelte` — one bits-ui date input + calendar popover with an optional
  adjacent time input, replacing the three copy-pasted date-picker blocks (start
  binds date + time, end likewise, until is date-only).
- `EventRecurrenceField.svelte` — the RECURRENCE card: repeat controls, day grid,
  monthly mode, until date, and the extra time-slot editor.
- `cal_events/event-schedule-rules.ts` — `buildEventScheduleRules` (form →
  `ScheduleRule`) and `monthlyAnchors` (the nth/last-weekday-of-month date math
  the recurrence UI displays and the rule builder consumes). The sheet keeps the
  form state and calls these.

Each `.svelte` child moves its own scoped CSS with it. Where components share
identical chrome — the agenda's `.agenda-section` / `.section-title-bar` /
`.add-agenda-row`, or the add-event card's `.field-card` / `.field-label` — that
small block is duplicated into each self-contained component with a comment,
rather than hoisted to a global stylesheet, which is the point of the split.

## Consequences

- **One reason to change per file.** The dashboard drops to ~450 lines (its meal
  timeline + photo modal); the agenda view to ~390 (orchestration + sheets).
  Each extracted piece has a small, explicit prop interface.
- **The grouping math is now unit-tested.** `schedule-grouping.ts` gains a
  focused spec (`tests/unit/schedule-grouping.test.ts`, 9 cases) covering sort
  order, `isDuring`/`isOverlap` edges, and clustering — behaviour that was
  previously only exercisable end-to-end.
- **No behaviour change.** DOM structure, class names, and CSS are preserved, so
  the food, habits, agenda, visual-catalog, and layout-invariants suites pass
  untouched; `pnpm check` is clean.
- **Shared section chrome is duplicated, not centralised.** A future change to
  the section frame touches two files. That is the accepted trade for
  self-contained components; if a third section appears, revisit with a shared
  `AgendaSection` wrapper.
