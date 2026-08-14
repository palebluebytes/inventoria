# 4. Advanced Habit Scheduling via JSON Rules

**Status:** Accepted  
**Implemented:** `habit/schedule_rules` in `src/lib/habits/state.ts`

Date: 2026-06-03

## Context

The initial habit scheduling model used two scalar attributes: `habit/schedule_type` ("daily" or "weekly") and `habit/schedule_value` (integer). This model was too rigid to support "world-class" scheduling features like specific days of the week ("Mondays, Wednesdays, Fridays"), quantitative daily targets ("3 times a day"), or specific time-of-day targets ("Morning, Afternoon, Evening").

Furthermore, missing a single execution broke streaks entirely, punishing users for legitimate exemptions like illness or vacation.

## Decision

We are migrating habit scheduling to a flexible **Schedule Rule** stored as a JSON blob under the `habit/schedule_rules` attribute, deprecating the primitive `schedule_type` and `schedule_value` fields.

The JSON schema supports three paradigms:

1. `daily_multiple`: A quantitative target (e.g., count: 3) or an array of distinct **Sub-Targets** (e.g., `["morning", "afternoon", "evening"]`).
2. `weekly_days`: Strict adherence to specific days (e.g., `["mon", "wed", "fri"]`).
3. `weekly_flexible`: A raw count required per week regardless of days (e.g., `count: 3`).

Execution Events will now support:

1. An optional `target_id` referencing a specific Sub-Target within the Schedule Rule.
2. A strict `status` of either `"completed"` or `"exempt"`. The `"exempt"` status allows the user to log an authorized skip (e.g., "vacation"), preserving the active streak by pausing the algorithmic expectation.

We explicitly rejected "rolling intervals" (e.g., "Every 3 days") because they create excessive complexity in streak calculation algorithms and shift unpredictably across calendar boundaries, muddying the UX.

## Consequences

- **Positives**: Extreme flexibility allowing for virtually any realistic scheduling requirement. Streak retention logic becomes significantly more empathetic via the `"exempt"` status.
- **Negatives**: Streak and scoring algorithms (`computeHabitScore`, `computeStreak`) must become significantly more complex. We must deserialize JSON on the client when evaluating lineages and iterate over sub-targets.
- **Migration**: As with previous migrations (Calorie tracking), the database is append-only. Because we are in early development, we will clear the database locally to test the new schema cleanly rather than writing a backward compatibility shim.
