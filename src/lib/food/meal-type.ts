/**
 * The four meals a Consumption Event can be logged at (`event/meal_type`), and
 * the one sanctioned narrowing from a stored ledger string back to them.
 *
 * The ledger holds `meal_type` as an arbitrary string — `ConsumptionEvent`
 * types it that way deliberately, because a datom is whatever was written. This
 * module is the boundary where that string becomes a member of the union, so
 * everything downstream of a read can be typed and nothing has to re-declare
 * the four names.
 */

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export type MealType = (typeof MEAL_TYPES)[number];

/**
 * Narrow a stored `event/meal_type` back to the union at the single read
 * boundary — validating membership rather than blindly casting, so an out-of-set
 * value falls back instead of slipping through typed as valid. This is the one
 * sanctioned meal_type cast.
 *
 * The fallback fires for an out-of-set value, NOT for an absent one: there is
 * exactly one writer of a Consumption Event (`calorie.store.ts`) and it always
 * writes the meal of the button that opened the sheet, so no meal-less
 * population exists for a fallback to collect (ADR-0057).
 */
export function asMealType(
  value: string | undefined,
  fallback: MealType
): MealType {
  return (MEAL_TYPES as readonly string[]).includes(value ?? "")
    ? (value as MealType)
    : fallback;
}

/**
 * The meal nearest a moment on the clock.
 *
 * A domain rule rather than a presentation one, which is why it lives beside the
 * four names rather than in the bar that consumes it: what counts as breakfast
 * is a fact about meals, and a second screen asking the same question must get
 * the same answer.
 *
 * The bounds are settled by hand and not derived from anything in the ledger —
 * before 11 is breakfast, before 15 is lunch, before 21 is dinner, and the late
 * hours are the snack. Nothing here reads a clock: the caller passes the moment,
 * so the boundaries can be swept hour by hour without a fake timer.
 *
 * Its one use is a STARTING value for the day's Way-in bar (ADR-0101 §2), never
 * a later change. Being wrong costs one tap on a tab, which is the trade §2
 * refuses to dodge by inferring the meal from where the page is scrolled.
 */
export function mealNearest(at: Date): MealType {
  const hour = at.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}
