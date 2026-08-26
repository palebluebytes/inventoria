import type { MealType } from "./meal-type";

/**
 * The ways into a meal (ADR-0059). Each one is a control in the meal-section
 * header and opens its own single-purpose sheet; there is no `+`.
 *
 * The order is the order the header shows them, left to right, and it is
 * settled by hand rather than derived: the past meal sits nearest the meal name
 * and search furthest from it.
 *
 * Four of the five are `FoodStager` methods and share their id with it, so a
 * header control opens the log sheet straight onto that method with no dock
 * (ADR-0059 §2). `past` is not a staging method at all — it picks a meal rather
 * than a food, so it has its own sheet (ADR-0058).
 */
export const MEAL_ENTRY_KINDS = [
  "past",
  "custom",
  "recipe",
  "scan",
  "search",
] as const;

export type MealEntryKind = (typeof MEAL_ENTRY_KINDS)[number];

/**
 * What a control is called. This is both the button's accessible name and the
 * title of the sheet it opens, because a single-purpose sheet should say the
 * same thing the control that opened it said (ADR-0059 §2).
 *
 * The meal is named where naming it helps ("Search for a breakfast food") and
 * left out where it would only add noise — a barcode is a barcode.
 */
export function mealEntryLabel(
  kind: MealEntryKind,
  meal_type: MealType
): string {
  switch (kind) {
    case "past":
      return `Copy a past ${meal_type}`;
    case "custom":
      return `Enter a ${meal_type} yourself`;
    case "recipe":
      return "Log a recipe";
    case "scan":
      return "Scan a barcode";
    case "search":
      return `Search for a ${meal_type} food`;
  }
}
