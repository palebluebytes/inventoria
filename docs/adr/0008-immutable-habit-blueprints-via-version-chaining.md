# 8. Immutable Habit Blueprints via Version Chaining

**Status:** Accepted  
**Implemented:** `habit/replaces` in `src/lib/stores/habits.store.ts`

**Context:**
We are introducing flexible scheduling and advanced "habit strength" scoring to the habit tracking module. To accurately compute historical habit scores without complex temporal logic, the system needs to know exactly what frequency a habit had at any given time. Because our EAVT ledger is append-only, simply appending a new frequency to an existing habit entity would require the UI to walk the ledger chronologically to evaluate past events against past frequencies.

**Decision:**
We will make Habit Blueprints strictly immutable. If a user modifies the nature of a habit (e.g., changing its frequency from "3 times a week" to "5 times a week"), the system will automatically archive the old Habit Blueprint and create a new one. The new blueprint will reference the old one via a `habit/replaces` attribute.

**Consequences:**

- **Pros:** Execution Events target a specific blueprint version with a fixed frequency, making scoring algorithms vastly simpler. The history of a habit can be easily stitched together by the UI by traversing the `habit/replaces` chain backwards.
- **Cons:** A single conceptual habit may span multiple entities in the database. Queries to fetch a user's complete history for a "Habit Lineage" require graph traversal.
