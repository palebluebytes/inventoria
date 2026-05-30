# V1 Domain Implementations

Physical items (Digital Twins) and temporal behaviors (Habits) are structurally unified as Entities and Events inside the EAVT framework.

## Module A: Calorie Counting (Physical Digital Twins)

Physical items represent static or slowly changing physical properties derived from external datasets like Open Food Facts.

- **The Twin Entity:** Instantiated using standard unique identifiers (e.g., `gtin:barcode`).
- **The Consumption Event:** An immutable, timestamped action referencing the physical twin ID.

### Ingestion Shapes (JSON to Datoms)

```typescript
// Incoming digital twin data structure
const foodTwin = {
  entity: "gtin:3017620422003",
  attributes: {
    "food/name": "Nutella",
    "food/calories": "539 kcal",
    "food/protein": "6.3 g",
  },
};

// Logged Consumption Event
const consumeEvent = {
  entity: "event:consume_abc123",
  attributes: {
    "event/type": "ConsumeAction",
    "event/target": "gtin:3017620422003",
    "event/quantity": "30g",
  },
};
```

## Module B: Habit Tracking (Temporal Behaviors)

Habits are structural observation profiles coupled with a time-series record of execution instances.

- The Habit Blueprint: Establishes goals, metadata schedules, and links to physical equipment identifiers.

- The Execution Event: Captures completion moments to compute structural statistics like current streaks.

Ingestion Shapes (JSON to Datoms)

```typescript
// Incoming Habit Blueprint
const swingHabit = {
  entity: "habit:swing_01",
  attributes: {
    "habit/name": "1-Arm Swings",
    "habit/instrument": "twin:kettlebell_16kg",
    "habit/target_reps": "10 per side",
    "habit/rest_interval": "90 Seconds",
  },
};

// Logged Execution Event
const workoutEvent = {
  entity: "event:execute_xyz789",
  attributes: {
    "event/type": "ExerciseAction",
    "event/target": "habit:swing_01",
    "event/instrument_used": "twin:kettlebell_16kg",
    "event/status": "completed",
  },
};
```
