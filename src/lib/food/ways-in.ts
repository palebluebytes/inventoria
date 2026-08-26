import type { MealType } from "./meal-type";

/**
 * The ways into a meal (ADR-0059) — see *Way in* in `CONTEXT.md`.
 *
 * Named "way in" rather than "entry": this app already spends `entry` on a
 * manually entered food (`ManualEntryKind`, ADR-0035), and a "meal entry" would
 * read as a logged row in the meal rather than as the door to it. Each one is a control in the meal-section
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
export const WAYS_IN = ["past", "custom", "recipe", "scan", "search"] as const;

export type WayIn = (typeof WAYS_IN)[number];

/**
 * What a control is called. This is both the button's accessible name and the
 * title of the sheet it opens, because a single-purpose sheet should say the
 * same thing the control that opened it said (ADR-0059 §2).
 *
 * EVERY label names its meal, including the two where the meal adds nothing to
 * the action itself. The header repeats for all four meals, so a name that
 * omits it is worn by four different buttons on the same screen: a screen
 * reader announces four identical "Scan a barcode"s, and any by-name lookup
 * matches the wrong one. Naming the meal is what makes a control identify
 * itself, which is the job the old `+` did with "Add breakfast".
 */
export function wayInLabel(kind: WayIn, meal_type: MealType): string {
  switch (kind) {
    case "past":
      return `Copy a past ${meal_type}`;
    case "custom":
      return `Enter a ${meal_type} yourself`;
    case "recipe":
      return `Log a recipe for ${meal_type}`;
    case "scan":
      return `Scan a barcode for ${meal_type}`;
    case "search":
      return `Search for a ${meal_type} food`;
  }
}
