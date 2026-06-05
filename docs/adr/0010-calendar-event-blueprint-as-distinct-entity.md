# 10. Calendar Event Blueprint as a Distinct Entity Prefix

Date: 2026-06-05

## Status

Accepted

## Context

The Agenda tab needed to support two distinct concepts on one view: **Habit Blueprints** (tracked behaviors with streak/score semantics) and **Calendar Event Blueprints** (time-anchored appointments or reminders with iCal export intent). Both project virtual slots onto the Agenda and only write to the ledger when the user confirms completion.

The simplest implementation would have been to add a `habit/type` discriminator attribute (`"habit"` vs `"event"`) to the existing `habit:` entity prefix, keeping a single ingestion and query path.

## Decision

Calendar Event Blueprints use a **dedicated `cal_event:` entity prefix** and dedicated attributes (`cal_event/title`, `cal_event/dtstart`, `cal_event/dtend`, `cal_event/description`). Their logged completions use the new `event/type: "OccurrenceAction"` rather than reusing `"ExerciseAction"`.

Both entity types share the same **Schedule Rule** JSON schema (including the newly added `monthly_fixed`, `monthly_relative`, `yearly_fixed` variants and the universal `until` field), and both project virtual slots in the same Agenda SCHEDULE section.

## Consequences

- **Positives**: The domain boundary between "tracked behavior" and "appointment" is explicit and queryable without discriminators. The iCal V2 export can select all `cal_event:` entities directly. The `ExerciseAction` / `OccurrenceAction` distinction preserves semantic clarity in the ledger history. Adding Event-specific attributes (location in V2) does not pollute the habit attribute namespace.
- **Negatives**: Two ingestion/store paths must be maintained (habits.ts + a new cal_events.ts). The Agenda projection logic must merge two heterogeneous data sources before rendering.
- **Rejected alternative**: A `habit/type` discriminator on the shared `habit:` prefix would have been simpler to implement but would blur the ledger's domain model, complicate the iCal export filter, and make habit-specific queries noisier.
