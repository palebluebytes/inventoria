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

function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Every past instance of one meal, newest first (ADR-0058 §4 and §6).
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
  const viewedKey = dayKey(viewedDate.getTime());
  const byDay = new Map<string, PastMeal>();

  for (const event of events) {
    if (event.meal_type !== meal_type) continue;
    const key = dayKey(event.time);
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
 * would mint a second Unknown Food, so it is counted as lost instead. An entry
 * with no frozen `calories` is refused for the same reason: §2 makes a copy
 * faithful or nothing, and logging a 0 would be neither.
 */
export function partitionCopyable(items: ConsumptionEvent[]): {
  copyable: ConsumptionEvent[];
  lost: ConsumptionEvent[];
} {
  const copyable: ConsumptionEvent[] = [];
  const lost: ConsumptionEvent[] = [];
  for (const item of items) {
    if (item.target && item.foodName && typeof item.calories === "number")
      copyable.push(item);
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
export function copyTally(copied: number, lost: number): string | null {
  if (lost === 0) return null;
  return `${copied} copied · ${lost} no longer available`;
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
