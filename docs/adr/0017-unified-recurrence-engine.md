# ADR 0017: Unified Recurrence Engine

**Status:** Accepted  
**Implemented:** `src/lib/recurrence/rules.ts`

## Context

The codebase had two separate implementations of the same recurrence-evaluation logic:

1. **`src/lib/habits/habits.ts`** — A `getDailyLineageStates` function containing an inline `switch` statement that evaluated `ScheduleRule` variants (`daily_multiple`, `weekly_days`, `monthly_relative`, `yearly_fixed`, etc.) against calendar dates.
2. **`src/lib/cal_events/cal_events.ts`** — A structurally identical `switch` statement inside `isActiveOnDate`, plus a duplicated copy of the `getNthWeekdayOfMonth` helper function.

In addition, `AgendaView.svelte` had a data-filtering bug: the **HABITS** section displayed all active habits regardless of the currently selected date. The filter only checked for the absence of timed sub-targets, not whether the habit's `ScheduleRule` was actually active on that day (e.g., a `weekly_days` habit set to run on Tuesdays and Thursdays would still appear in the agenda on Sunday).

## Decision

### 1. Extract `src/lib/recurrence/rules.ts`

All `ScheduleRule` type definitions and the authoritative recurrence-evaluation function `isScheduleRuleActive(rules, dateStr)` are extracted into a dedicated module:

```
src/lib/recurrence/rules.ts
```

This module is the **single source of truth** for:

- All `ScheduleRule` variant type definitions (`DailyMultipleRule`, `WeeklyDaysRule`, `WeeklyFlexibleRule`, `MonthlyFixedRule`, `MonthlyRelativeRule`, `YearlyFixedRule`).
- The `DayOfWeek` string literal union.
- The `getNthWeekdayOfMonth` helper.
- The exported `isScheduleRuleActive(rules: ScheduleRule, dateStr: string): boolean` function.

### 2. Refactor consumers to delegate

- `habits.ts` — Imports `ScheduleRule`, `DayOfWeek`, and `isScheduleRuleActive` from `../recurrence/rules`. Re-exports them for backwards-compatible consumption by UI components.
- `cal_events.ts` — `isActiveOnDate` now delegates its recurrence branch to a single call to `isScheduleRuleActive(rules, dateStr)`.
- All removed: the duplicate `getNthWeekdayOfMonth` and inline `switch` from both files.

### 3. Fix the Agenda projection bug

`AgendaView.svelte`'s `generalHabitItems` derived value now calls `isScheduleRuleActive(rules, selected_date_str)` to filter habits by the currently selected date. Habits not scheduled for that day are hidden from view.

## Consequences

**Positive:**

- **No duplication:** Adding a new `ScheduleRule` variant (e.g., `biweekly`) requires a change in exactly one place.
- **Bug fixed:** The Agenda HABITS section is now date-aware. A `weekly_days` habit set to Mon/Wed/Fri will correctly disappear from the Tuesday agenda.
- **Consistent semantics:** Habit scoring/streak computation (`getDailyLineageStates`) and Calendar Event projection (`isActiveOnDate`) are now guaranteed to agree on which dates a given rule fires.

**Negative / Trade-offs:**

- `habits.ts` re-exports the types from `rules.ts` for backwards compatibility. This re-export layer could be removed in a future cleanup if all UI consumers are migrated to import directly from `recurrence/rules`.
