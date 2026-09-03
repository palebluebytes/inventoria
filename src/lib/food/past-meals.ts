import type { ConsumptionEvent } from "./consumption-state";
import type { MealType } from "./meal-type";

/**
 * Copying a past meal (ADR-0058). Recent gives you a food; this gives you a
 * meal — its foods *and* their amounts, in one action.
 *
 * Everything here is a read over facts the ledger already holds. No attribute,
 * no migration, no projection change: a Consumption Event already carries its
 * `meal_type`, its quantity and its frozen `event/metrics`, which is the whole
 * of what a copy needs.
 */

/**
 * A logged entry a copy can actually reproduce. The four fields
 * {@link partitionCopyable} checks are non-optional here, so `copyPastMeal`
 * reads them without casting and the precondition is checked once, in the one
 * place that establishes it.
 */
export type CopyableEvent = ConsumptionEvent &
  Required<
    Pick<ConsumptionEvent, "target" | "quantity" | "calories" | "foodName">
  >;

/** The line a partial copy leaves behind, and the day it is true of. */
export interface CopyNote {
  meal_type: MealType;
  text: string;
  /** {@link dayKeyOf} of the day copied into. The note carries what it
   *  describes, so it cannot be shown beside a day it is not about. */
  day: string;
}

/** One meal as it was logged on one day — the thing a picker row offers. */
export interface PastMeal {
  /** Local midnight of the day it was eaten; the row's date line reads this. */
  date: Date;
  meal_type: MealType;
  /** As logged, in log order. */
  items: ConsumptionEvent[];
  /** The meal's total, summed over what each entry actually froze. */
  calories: number;
}

const DAY_MS = 86_400_000;

/**
 * A local calendar day's identity, for comparing two instants by the day a
 * person would say they fell on. Distinct from `getDayBounds`, which answers a
 * different question — the millisecond range of one day, for filtering a list
 * down to it. This one buckets a whole history without a range per bucket.
 */
export function dayKeyOf(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * The local midnight of a day, which is what a {@link PastMeal} carries: a meal
 * is a thing that happened on a day, not at an instant, and two meals on one
 * day have to compare equal. Exported for the receiving surface, which builds a
 * `PastMeal` out of a payload rather than out of a projection.
 */
export function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Every past instance of one meal, newest first (ADR-0058 §4 and §6).
 *
 * Each meal's `items` are in the order `events` supplied them, which the
 * CONSUMPTION projection orders by the ledger's logical clock — so a picker row
 * lists a meal's foods in the order they were logged, the same order the
 * dashboard's own list uses.
 *
 * §4 fixes the meal type: the control's position gives it its meaning, so a
 * past lunch is never offered for today's breakfast. §6 takes any logged day
 * *except* the one being viewed — later days included, since while back-filling
 * an old day they are still meals already eaten, and excluding them would be a
 * rule the user cannot see a reason for.
 *
 * The walk is uncapped for the same reason `recentCandidatesForMeal`'s is: the
 * Nth+1 event may be the only instance of this meal in the history.
 */
export function pastMealsFor(
  events: ConsumptionEvent[],
  meal_type: MealType,
  viewedDate: Date
): PastMeal[] {
  const viewedKey = dayKeyOf(viewedDate);
  const byDay = new Map<string, PastMeal>();

  for (const event of events) {
    if (event.meal_type !== meal_type) continue;
    const key = dayKeyOf(event.time);
    if (key === viewedKey) continue;

    const calories = typeof event.calories === "number" ? event.calories : 0;
    const meal = byDay.get(key);
    if (meal) {
      meal.items.push(event);
      meal.calories += calories;
    } else {
      byDay.set(key, {
        date: midnight(new Date(event.time)),
        meal_type,
        items: [event],
        calories,
      });
    }
  }

  return [...byDay.values()].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}

/**
 * Splits a past meal's entries into those a copy can reproduce and those it
 * cannot (ADR-0058 §11).
 *
 * Almost nothing can fail. The metrics are frozen on the event itself, so a
 * copy resolves no twin and re-derives no nutrition — §2 and §9 fall out of
 * simply carrying the event's own fields across. The one real gap is a target
 * whose twin no longer resolves: `foldConsumptionEvents` leaves `foodName`
 * unset for it, and the dashboard renders that as "Unknown Food". Copying one
 * would mint a second Unknown Food, so it is counted as lost instead. That is
 * the case §11's line is about.
 *
 * The `quantity` and `calories` checks are invariant guards rather than a
 * second user-facing case: there is exactly one writer of a Consumption Event
 * and it always freezes both, so no population exists for them to collect. They
 * are here because they are what makes {@link CopyableEvent} sound — the
 * precondition is established once, here, instead of being asserted with a cast
 * at the point of use. If one ever did fire, dropping is still the right answer
 * over logging a 0: ADR-0048 settled that an absent measurement is not a zero.
 */
export function partitionCopyable(items: ConsumptionEvent[]): {
  copyable: CopyableEvent[];
  lost: ConsumptionEvent[];
} {
  const copyable: CopyableEvent[] = [];
  const lost: ConsumptionEvent[] = [];
  for (const item of items) {
    if (
      item.target &&
      item.quantity &&
      item.foodName &&
      typeof item.calories === "number"
    )
      copyable.push(item as CopyableEvent);
    else lost.push(item);
  }
  return { copyable, lost };
}

/**
 * The line a copy leaves behind (ADR-0058 §11): nothing at all when the run was
 * clean, and what it did and could not do when it was not. `FoodView`'s
 * `scale_note` is the precedent, including that the line must not outlive what
 * it described.
 */
/**
 * Whether a meal has anything to copy (ADR-0058 §7 / ADR-0059 §4). Cheaper than
 * asking {@link pastMealsFor} for its length, and it says what the header
 * actually wants to know: the control is absent, not disabled, when this is
 * false.
 */
export function hasPastMeal(
  events: ConsumptionEvent[],
  meal_type: MealType,
  viewedDate: Date
): boolean {
  const viewedKey = dayKeyOf(viewedDate);
  return events.some(
    (e) => e.meal_type === meal_type && dayKeyOf(e.time) !== viewedKey
  );
}

export function copyTally(copied: number, lost: number): string | null {
  if (lost === 0) return null;
  return `${copied} copied · ${lost} no longer available`;
}

/**
 * "Thursday, September 3" — a date said in full, for a control whose visible
 * label is too terse to read aloud.
 *
 * Both of the food screen's date controls carry it: a week-strip day button
 * shows one letter and a number, and a month cell shows a number. Neither is
 * readable, so each hands this to `aria-label` instead — and they hand it the
 * same string, because they are the same control at two scales (ADR-0091 §1)
 * and are never on screen together to be compared.
 *
 * Distinct from {@link dayLabel}, which says how near a day is ("Yesterday")
 * and is a picker row's visible date line rather than anything's reading.
 */
export function spokenDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * "Yesterday" / "Thursday" / "Mon 11 Aug" — near days by name, far ones by
 * date, so a picker row dates itself the way a person would say it.
 *
 * Future days get the same treatment because ADR-0058 §6 lets them into the
 * list while an earlier day is being back-filled.
 */
export function dayLabel(date: Date, today: Date = new Date()): string {
  const days = Math.round(
    (midnight(date).getTime() - midnight(today).getTime()) / DAY_MS
  );
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  if (days > -7 && days < 7)
    return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
