# 2. Unified Use of snake_case for meal_type

**Status:** Accepted  
**Implemented:** `event/meal_type` throughout; `src/lib/stores/calorie.store.ts`

We have adopted a strict naming convention to use snake_case `meal_type` across all layers of the application, including the ledger/EAVT database attributes (`event/meal_type`), client-side Svelte stores, and all UI code (variables, parameters, properties, and mock data).

## Context

During the implementation of Svelte-based calorie tracking, some files were introduced using camelCase (`mealType` / `selectedMealType` / `mealTypes`), while others or backend components used snake_case (`event/meal_type` / `meal_type`). This mismatch led to mapping complexities, potential database query issues, and inconsistency in the codebase.

## Decision

1. **LEDGER / EAVT DATA SCHEMA:** All logged events that categorize ingestion or activity under a meal must record the attribute as `event/meal_type`.
2. **STORE INTERFACES & DATAM HELPERS:** Functions in `calorie.store.ts` (e.g., `logFoodConsumption`) must accept `meal_type` as a parameter and returned event objects must expose `meal_type`.
3. **UI / COMPONENT LAYER:** All Svelte components (e.g., `DailyDashboard.svelte`, `FoodSearchModal.svelte`, `RecipeModal.svelte`, `AddPhotoModal.svelte`) must declare and pass `meal_type`, `selected_meal_type`, and `meal_types`.
4. **TEST SUITE:** All unit tests and end-to-end integration tests must check against `event/meal_type` and use `meal_type` as a parameter or attribute key.

## Consequences

- Improved consistency and developer readability by removing casing mismatches.
- Direct alignment between database attributes, Svelte store properties, and component properties, reducing mapping translations.

## Amendment (2026-08-14): the named components no longer exist

The decision holds without change: `meal_type` is snake_case everywhere the ledger
is involved, and that is enforced as a non-negotiable invariant in
`CODING_STANDARDS.md` §1.3.

The UI-layer clause names four components as examples. Two of them,
`FoodSearchModal.svelte` and `AddPhotoModal.svelte`, were removed by the food-screen
decomposition in [ADR-0029](0029-decompose-god-screens-into-sub-components.md) and
the sheet migration in [ADR-0028](0028-migrate-food-sheets-onto-bottomsheet.md).
Read the list as illustrative of the layer, not as a current inventory.
