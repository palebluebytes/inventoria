# V1 Domain Implementations

Physical items (Digital Twins) and temporal behaviors (Habits) are structurally unified as Entities and Events inside the EAVT framework.

## Module A: Calorie Counting (Physical Digital Twins)

Physical items represent static or slowly changing physical properties derived from external datasets like Open Food Facts.

- **The Twin Entity:** Instantiated using standard unique identifiers (e.g., `gtin:barcode`).
- **The Consumption Event:** An immutable, timestamped action referencing the physical twin ID.

### Ingestion Shapes (JSON to Datoms)

#### 1. Standard Digital Twins (Open Food Facts & USDA)

Nutrition is a first-class, atomic `nutrition/info` panel on every food-bearing
twin, mirroring **schema.org/NutritionInformation** in snake_case (ADR-0021).
Values are plain numbers in a unit fixed per field (calories in kcal, every
`*_content` in grams); `serving_size` states the basis. An adapter populates
only the subset of fields its source provides.

```typescript
// Open Food Facts (GTIN)
const offTwin = {
  entity: "gtin:3017620422003",
  attributes: {
    "food/name": "Nutella",
    "nutrition/info": {
      serving_size: "100 g",
      calories: 539,
      protein_content: 6.3,
      fat_content: 30.9,
      carbohydrate_content: 57.5,
      sugar_content: 56.3,
      sodium_content: 0.0428, // OFF's own sodium figure, not salt (0.107 g)
      saturated_fat_content: 10.6,
    },
  },
};

// USDA FoodData Central (FDC) — sodium is normalised from mg to grams
const usdaTwin = {
  entity: "fdc:170416",
  attributes: {
    "food/name": "Broccoli, raw",
    "nutrition/info": {
      serving_size: "100 g",
      calories: 34,
      protein_content: 2.82,
      // …plus whatever else the food carries (fiber, sugars, etc.)
    },
  },
};
```

#### 2. Custom & Photo-Based Foods

Custom foods are entered as totals for one serving, so the panel's basis is
`"1 serving"` rather than `100 g`.

```typescript
const customFoodTwin = {
  entity: "food:custom_xyz890_1717140000000",
  attributes: {
    "food/name": "Homemade Sandwich",
    "nutrition/info": {
      serving_size: "1 serving",
      calories: 450,
      protein_content: 20,
      fat_content: 15,
      carbohydrate_content: 50,
    },
    "food/photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  },
};
```

#### 3. Recipe Twins (Composed Entities)

A recipe stores **no** nutrition of its own — its per-serving macros are derived
from the referenced ingredient twins (ADR-0021), so the numbers can never rot
against their source. The full schema.org/Recipe shape (reference ingredients,
`recipe/yield`, derived nutrition) is specified in ADR-0021 and landed by the
recipe tickets; the panel below shows only the identity a recipe twin carries.

```typescript
const recipeTwin = {
  entity: "recipe:abc123_1717140000000",
  attributes: {
    "food/name": "Avocado Toast",
    "recipe/description": "Classic smashed avocado on sourdough",
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

````typescript
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

## Module C: Media Tracking (Digital Twins & Engagement Events)

Media items (Movies, TV Series, Books) are tracked as Digital Twins, ingested from TMDB and Open Library. Interacting with them generates an Engagement Event.

### Ingestion Shapes (JSON to Datoms)

#### 1. Media Twins (TMDB & Open Library)

```typescript
// Movie Twin
const movieTwin = {
  entity: "tmdb:movie_155",
  attributes: {
    "media/title": "The Dark Knight",
    "media/director": "Christopher Nolan",
    "media/release_date": "2008-07-16",
    "media/poster_url": "https://image.tmdb.org/t/p/w500/...poster.jpg",
  }
};

// Book Twin
const bookTwin = {
  entity: "isbn:9780141187761",
  attributes: {
    "media/title": "1984",
    "media/author": "George Orwell",
    "media/release_date": "1949-06-08",
    "media/poster_url": "https://covers.openlibrary.org/b/id/8358482-L.jpg",
  }
};
````

#### 2. The Engagement Event

All media engagements share a unified status enum: `["saved", "started", "progress", "completed"]`.

```typescript
// Movie Watch Event
const watchEvent = {
  entity: "event:engage_xyz123_1717140000000",
  attributes: {
    "event/type": "WatchAction",
    "event/target": "tmdb:movie_155",
    "event/status": "completed",
    "event/rating": 5, // Optional 1-5 scale
    "event/review": "Incredible.", // Optional text
  },
};

// TV Episode Watch Event (Progress)
const tvEvent = {
  entity: "event:engage_xyz124_1717140000000",
  attributes: {
    "event/type": "WatchAction",
    "event/target": "tmdb:tv_1399", // Game of Thrones
    "event/status": "progress",
    "event/season": 1,
    "event/episode": 1,
  },
};

// Book Read Event (Started / Progress)
const readEvent = {
  entity: "event:engage_xyz125_1717140000000",
  attributes: {
    "event/type": "ReadAction",
    "event/target": "isbn:9780141187761",
    "event/status": "started",
    "event/pages_read": 50, // Optional page count for session tracking
  },
};
```

```

```
