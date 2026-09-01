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
 * What a CONTROL is called — its accessible name in the meal header.
 *
 * EVERY label names its meal, including the two where the meal adds nothing to
 * the action itself. The header repeats for all four meals, so a name that
 * omits it is worn by four different buttons on the same screen: a screen
 * reader announces four identical "Scan a barcode"s, and any by-name lookup
 * matches the wrong one. Naming the meal is what makes a control identify
 * itself, which is the job the old `+` did with "Add breakfast".
 *
 * The sheet it opens is titled by {@link wayInTitle}, which drops the meal —
 * see there for why the two diverge.
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

/**
 * What the SHEET a way in opens is called (ADR-0059 §2, as amended).
 *
 * The meal is deliberately absent. A control has to identify itself among four
 * identical siblings, so {@link wayInLabel} names the meal; a sheet has no
 * siblings — you reached it by tapping one control in one meal's header, and
 * the meal is settled by the act that opened it. Repeating it in the title
 * spends the header's one line restating what the user just did.
 */
export function wayInTitle(kind: WayIn): string {
  switch (kind) {
    case "past":
      // The domain term itself (CONTEXT.md, *Past meal*), which is what the
      // sheet holds: not "copy a past" anything, but the past meals you have.
      return "Past meal";
    case "custom":
      return "Quick entry";
    case "recipe":
      return "Log a recipe";
    case "scan":
      return "Scan a barcode";
    case "search":
      return "Ingredient search";
  }
}

/**
 * What a way in DOES, for the legend the food screen's ⓘ unfolds.
 *
 * A third gloss rather than a reuse of the other two, because a legend answers
 * a different question. {@link wayInLabel} names a control so it can identify
 * itself among four identical siblings, and {@link wayInTitle} names the sheet
 * once you are already inside it; both assume you have decided to tap. A legend
 * is read by someone who has NOT, and who wants to know what the mark means
 * before spending a tap on it — so these say what the door leads to, and where
 * the ones that come and go are.
 *
 * The meal is absent for {@link wayInTitle}'s reason: a legend is written once
 * for a header that repeats per meal, so naming one meal would be wrong for the
 * other three.
 */
export function wayInLegend(kind: WayIn): string {
  switch (kind) {
    case "past":
      return "Copies a meal you have eaten before onto this day. It appears only once that meal has a past to copy.";
    case "custom":
      return "Writes a food down yourself: a quick calorie figure, a dish off a menu, a photo of the plate, or a pack's nutrition panel typed in.";
    case "recipe":
      return "Logs a serving of a recipe you have saved.";
    case "scan":
      return "Reads a barcode, by camera or from a photo of one.";
    case "search":
      return "Looks a food up in the bundled tables.";
  }
}
