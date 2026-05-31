# V1 Domain Implementations

Physical items (Digital Twins) and temporal behaviors (Habits) are structurally unified as Entities and Events inside the EAVT framework.

## Module A: Calorie Counting (Physical Digital Twins)

Physical items represent static or slowly changing physical properties derived from external datasets like Open Food Facts.

- **The Twin Entity:** Instantiated using standard unique identifiers (e.g., `gtin:barcode`).
- **The Consumption Event:** An immutable, timestamped action referencing the physical twin ID.

### Ingestion Shapes (JSON to Datoms)

#### 1. Standard Digital Twins (Open Food Facts & USDA)

```typescript
// Open Food Facts (GTIN)
const offTwin = {
  entity: "gtin:3017620422003",
  attributes: {
    "food/name": "Nutella",
    "food/calories": "539 kcal",
    "food/protein": "6.3 g",
    "food/fat": "30.9 g",
    "food/carbs": "57.5 g",
  },
};

// USDA FoodData Central (FDC)
const usdaTwin = {
  entity: "fdc:170416",
  attributes: {
    "food/name": "Broccoli, raw",
    "food/calories": "34 kcal",
    "food/protein": "2.82 g",
  },
};
```

#### 2. Custom & Photo-Based Foods

```typescript
const customFoodTwin = {
  entity: "food:custom_xyz890_1717140000000",
  attributes: {
    "food/name": "Homemade Sandwich",
    "food/calories": "450 kcal",
    "food/protein": "20 g",
    "food/fat": "15 g",
    "food/carbs": "50 g",
    "food/photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  },
};
```

#### 3. Recipe Twins (Composed Entities)

```typescript
const recipeTwin = {
  entity: "recipe:abc123_1717140000000",
  attributes: {
    "food/name": "Avocado Toast",
    "food/calories": "250 kcal",
    "food/protein": "5 g",
    "food/fat": "12 g",
    "food/carbs": "20 g",
    "recipe/description": "Classic smashed avocado on sourdough",
    "recipe/scrape_url": "https://example.com/recipe/avo-toast",
    "recipe/ingredients": [
      { id: "fdc:170372", amount: "50g", name: "Avocado" },
      { id: "fdc:174092", amount: "1 slice", name: "Sourdough bread" },
    ], // Stored as a stringified JSON array
  },
};
```

#### 4. The Consumption Event

```typescript
// Logged Consumption Event with structural macros & naming standard
const consumeEvent = {
  entity: "event:consume_abc123_1717140000000",
  attributes: {
    "event/type": "ConsumeAction",
    "event/target": "gtin:3017620422003", // References any twin (gtin, fdc, custom, recipe)
    "event/quantity": "30g",
    "event/meal_type": "breakfast", // Strictly snake_case enforcing architectural standard
    "event/calories": 161, // Numerical snapshots for rapid dashboard aggregations
    "event/protein": 1.8,
    "event/fat": 9.2,
    "event/carbs": 17.2,
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
