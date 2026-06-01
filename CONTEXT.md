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

**Habit Blueprint**:
A definition profile establishing goals, schedules, and instrument requirements for a tracked behavior.
_Avoid_: Routine, habit definition, plan

**Execution Event**:
A logged instance of a behavior or habit completion recorded as a timestamped action in the ledger.
_Avoid_: Activity log, workout record, check-in

**Consumption Event**:
A logged instance of a digital twin or recipe intake recorded as a timestamped action in the ledger.
_Avoid_: Food log, meal record

**Meal Type**:
A standardized classification (`meal_type`) used to organize Consumption Events chronologically and logically in UI timelines.
_Avoid_: mealType, meal-type

**Engagement Event**:
A logged instance of watching a movie/show or reading a book, recorded as a timestamped action in the ledger linking to a media Digital Twin.
_Avoid_: Consumption event (when referring to media), activity log
