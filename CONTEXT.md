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
A virtual representation of a physical item, tracked via static or slowly-changing attributes derived from external databases (e.g. Open Food Facts).
_Avoid_: Product, item, asset

**Habit Blueprint**:
A definition profile establishing goals, schedules, and instrument requirements for a tracked behavior.
_Avoid_: Routine, habit definition, plan

**Execution Event**:
A logged instance of a behavior or habit completion recorded as a timestamped action in the ledger.
_Avoid_: Activity log, workout record, check-in
