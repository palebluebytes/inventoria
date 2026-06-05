# Inventoria

A local-first Progressive Web App (PWA) for tracking physical items and temporal behaviors using an immutable ledger.

## Language

**Datom**:
The atomic unit of storage representing a single fact, consisting of an entity ID, an attribute, a value, and a timestamp.
_Avoid_: Row, record, database entry

**Ledger**:
The append-only, immutable database table (`datoms`) containing the full chronological sequence of all datoms. Current state is derived by querying this historical log.
_Avoid_: Relational database, mutable table, state table

**Digital Twin**:
A virtual representation of a physical or distinct external item, tracked via static or slowly-changing attributes derived from external databases (e.g. Open Food Facts for food, TMDB for media).
_Avoid_: Product, item, asset

**Habit Lineage**:
A conceptual continuous habit that spans multiple immutable Habit Blueprints linked together chronologically.
_Avoid_: Habit history, habit chain

**Habit Blueprint**:
A strictly immutable definition profile establishing goals, schedules, and instrument requirements for a tracked behavior. Changes to a schedule create a new Blueprint in the Lineage.
_Avoid_: Routine, habit definition, plan

**Schedule Rule**:
A flexible JSON definition shared by both Habit Blueprints and Calendar Event Blueprints, describing recurrence frequency and constraints. Supports six paradigms: `daily_multiple` (count or Sub-Targets), `weekly_days` (specific days), `weekly_flexible` (N times per week), `monthly_fixed` (fixed day of month), `monthly_relative` (e.g. last Thursday), and `yearly_fixed` (specific month and day). All variants carry an optional `until` field (ISO date `"YYYY-MM-DD"`) marking when the recurrence ends.
_Avoid_: Frequency, time settings, schedule values, RRULE

**Sub-Target**:
A distinct, strictly identified temporal slot within a Schedule Rule (e.g., a specific time like "08:00"). If a Habit Blueprint or Calendar Event Blueprint uses Sub-Targets, a logged completion Event must explicitly reference one. An Event Blueprint with multiple Sub-Targets represents a single recurring event that occurs at several times per day (e.g. medication at 08:00 and 20:00).
_Avoid_: Time slot, session, checklist item

**Execution Event**:
A logged instance of a behavior or habit completion recorded as a timestamped action in the ledger. Qualitative and quantitative metrics are stored as a flexible JSON blob. It has a strict status of either `completed` or `exempt` (used to pause a streak gracefully without breaking it). The datom `time` field captures the exact millisecond the user confirmed completion.
_Avoid_: Activity log, workout record, check-in

**Calendar Event Blueprint**:
An immutable scheduled appointment or recurring reminder entity (entity prefix `cal_event:`) with a required start datetime (`cal_event/dtstart`), an optional end datetime (`cal_event/dtend`), an optional description (`cal_event/description`), a Schedule Rule, and a boolean `cal_event/tracking` attribute. A non-recurring Event Blueprint is a single appointment with no Schedule Rule. It is the direct source for iCal VEVENT export in V2.
_Avoid_: Habit, event definition

**Compliance Event**:
A Calendar Event Blueprint with `cal_event/tracking: true`. Requires explicit user confirmation per projected slot. If the scheduled time passes without a tap, the slot is marked **missed**. Writes an Occurrence Event on confirmation. Used for medication, recurring tasks, and any event where non-completion is meaningful.
_Avoid_: Reminder, tracked event

**Appointment**:
A Calendar Event Blueprint with `cal_event/tracking: false`. Purely informational — it occupies a slot on the Agenda timeline as context but requires no user action. Once the scheduled time passes the slot auto-fades to **past** with no failure state. No Occurrence Event is written.
_Avoid_: Calendar event (when tracking is irrelevant), meeting

**Occurrence Event**:
A logged instance confirming that a projected Compliance Event slot actually happened, recorded as an `OccurrenceAction` in the ledger. The datom `time` field is the exact millisecond the user tapped confirmation, which may differ from the Blueprint's scheduled `dtstart` time slot. Until confirmed, projected slots exist only in memory — nothing is written to the ledger. Appointments never produce Occurrence Events.
_Avoid_: Calendar entry, completed event, confirmed appointment

**Agenda**:
The tab and view that presents a unified, date-navigable view of the user's day. It contains two sections: SCHEDULE (a chronological timeline mixing projected Calendar Event Blueprint slots and timed Habit Blueprint Sub-Targets, sorted by time) and HABITS (Habit Blueprints without specific intra-day times, e.g. weekly or flexible habits).
_Avoid_: Habits view, schedule view, calendar view

**Consumption Event**:
A logged instance of a digital twin or recipe intake recorded as a timestamped action in the ledger. Nutritional metrics are stored as a flexible JSON blob.
_Avoid_: Food log, meal record

**Meal Type**:
A standardized classification (`meal_type`) used to organize Consumption Events chronologically and logically in UI timelines.
_Avoid_: mealType, meal-type

**Engagement Event**:
A logged instance of watching a movie/show or reading a book, recorded as a timestamped action in the ledger linking to a media Digital Twin.
_Avoid_: Consumption event (when referring to media), activity log

**Acquisition Event**:
A logged instance representing the ownership state of a physical Digital Twin, recorded as a timestamped action in the ledger with a status of either `owned` or `wanted`.
_Avoid_: Ownership event, item status, inventory log
