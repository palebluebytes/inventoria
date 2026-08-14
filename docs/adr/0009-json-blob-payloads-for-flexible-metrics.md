# 9. JSON Blob Payloads for Flexible Metrics

**Status:** Accepted  
**Implemented:** JSON blob payloads throughout the ledger

**Context:**
When logging execution events for habits, users need the ability to add rich context such as notes, duration, or difficulty. Similarly, calorie tracking currently uses flat attributes (e.g., `event/calories`, `event/protein`) for each metric. Adding flat attributes for every possible metric across habits and food tracking leads to schema sprawl and requires database migrations (conceptually) whenever a new metric type is introduced.

**Decision:**
We will use stringified JSON blobs to store qualitative and quantitative metrics for events, prioritizing flexibility over strictly structured flat attributes.

- For Execution Events (Habits), we will use an `event/metadata` attribute containing a JSON object (e.g., `{"note": "Felt great", "duration": 30}`).
- For Consumption Events (Calorie Tracking), we will migrate from flat attributes (`event/calories`, `event/protein`) to a consolidated JSON payload attribute.

**Consequences:**

- **Pros:** Total flexibility for the client. The datom table remains small without attribute sprawl. Users can track arbitrary metrics without architectural changes.
- **Cons:** Requires `json_extract()` in SQLite to query or aggregate specific metrics (like total calories), which is slightly slower and more complex to write in the Svelte stores compared to querying flat attributes.
