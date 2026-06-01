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
