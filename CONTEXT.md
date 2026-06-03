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
A flexible JSON definition on a Habit Blueprint describing its frequency and constraints. It can specify pure quantitative goals (e.g., 3 times daily) or strict temporal Sub-Targets (e.g., Morning, Afternoon, Evening).
_Avoid_: Frequency, time settings, schedule values

**Sub-Target**:
A distinct, strictly identified temporal requirement within a Schedule Rule (e.g., "morning"). If a Habit Blueprint uses Sub-Targets, an Execution Event must explicitly fulfill one.
_Avoid_: Time slot, session, checklist item

**Execution Event**:
A logged instance of a behavior or habit completion recorded as a timestamped action in the ledger. Qualitative and quantitative metrics are stored as a flexible JSON blob. It has a strict status of either `completed` or `exempt` (used to pause a streak gracefully without breaking it).
_Avoid_: Activity log, workout record, check-in

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
