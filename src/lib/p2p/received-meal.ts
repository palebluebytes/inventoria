/**
 * The meals a payload turns out to be, for the surface that is holding it
 * (ADR-0073 §5 and §10, ADR-0074 §4).
 *
 * The receiving surface shows **the meal itself, with nothing in front of it**,
 * so it needs the payload as meals rather than as datoms — and a received meal
 * IS a Past meal, the sender's, which is why this returns {@link PastMeal}s
 * rather than a shape of its own. ADR-0073 §5 says the same thing from the
 * other side: receiving is `copyPastMeal` with a wire in front of it.
 *
 * **Meals, plural, since a day can be handed over too.** One send carries one
 * *payload* and never one meal: the full-day panel's way out hands over
 * everything on the day, so the meal type is read per event rather than once
 * off the front (ADR-0073's 2026-09-01 amendment).
 *
 * **What the surface shows is exactly what accept can land.** The events are
 * folded here through the same {@link receivedMealEvents} the accept path
 * folds, and narrowed by the same `partitionCopyable`, so the two can never
 * disagree about what is in the meal. A panel that counted three foods and
 * landed two would be lying about the one thing the person is deciding on.
 */

import type { LedgerRow } from "../db/db.core";
import {
  computeConsumption,
  type ConsumptionEvent,
} from "../food/consumption-state";
import { asMealType, type MealType } from "../food/meal-type";
import {
  midnight,
  partitionCopyable,
  type CopyableEvent,
  type PastMeal,
} from "../food/past-meals";
import { winningRows } from "./meal-payload";
import type { ReceivedMealPayload } from "./meal-reader";

/**
 * The Consumption Events a payload's declared roots fold to, read by the app's
 * own fold so a received event is understood exactly as a locally logged one.
 *
 * The rows are the payload's, already narrowed to one per `(entity, attribute)`
 * — the caller does that, because the accept path needs the narrowed rows for
 * the twins as well and narrowing twice would be a second answer to the same
 * question.
 */
export function receivedMealEvents(
  rows: LedgerRow[],
  roots: readonly string[]
): ConsumptionEvent[] {
  const declared = new Set(roots);
  return computeConsumption(rows).filter((event) => declared.has(event.id));
}

/**
 * One received meal: a Past meal whose every food accept can reproduce.
 *
 * The narrowing is the type saying what {@link readReceivedMeals} promises — the
 * surface shows exactly what accept can land — so a caller reads a food's name
 * and its calories without a guard, and without the guard drifting from the one
 * `partitionCopyable` already applied.
 */
export interface ReceivedMeal extends PastMeal {
  items: CopyableEvent[];
}

/**
 * One payload as the meals it carries, in earliest-event order. Empty when it
 * carries nothing anybody can be given.
 *
 * **A payload is not one meal, and grouping is how that stopped being an
 * assumption** (ADR-0073's 2026-09-01 amendment). It used to be: the way out
 * was on a meal's own panel, so the sender handed over one meal entire and this
 * read the meal type off the earliest event and filed everything under it. The
 * full-day panel has a way out too now, so the same payload can carry a
 * breakfast and a dinner, and reading one meal type off the front of it would
 * put the dinner in the recipient's breakfast.
 *
 * The rows already answer this. Each event carries its **own** `meal_type`, so
 * grouping narrows what is there rather than adding anything to the wire, and
 * the single-meal case falls out without a branch: one meal's events share one
 * meal type, so they form one group and land exactly as they did before.
 *
 * An empty list is the narrower case that survives all seven of ADR-0073 §8's
 * refusals: §8.4 refuses a root the lines do not carry, but a root whose rows
 * fold to an event with no food to point at is carried and still cannot go in
 * anybody's day. The surface says so rather than drawing an empty meal with an
 * "add it" button under it, which would be an offer to add nothing.
 *
 * `asMealType` is the sanctioned narrowing and its fallback is load-bearing
 * here: the string came off another device's ledger, so it is genuinely
 * arbitrary rather than one of four, and a junk value must join the snacks
 * rather than open a fifth meal on the recipient's day.
 */
export function readReceivedMeals(
  payload: ReceivedMealPayload
): ReceivedMeal[] {
  const grouped = mealsByType(
    receivedMealEvents(winningRows(payload.rows), payload.roots)
  );

  return [...grouped].map(([meal_type, items]) => ({
    date: midnight(new Date(items[0].time)),
    meal_type,
    items,
    calories: items.reduce((total, item) => total + item.calories, 0),
  }));
}

/**
 * The copyable events of a payload, grouped by the Meal Type each one carries,
 * in the order the day was eaten.
 *
 * **Shared with the accept path rather than repeated there**, for the reason
 * this module's header gives: what the person was shown and what accept lands
 * must be the same meals, and two groupings could disagree. It sorts before it
 * groups so that promise does not rest on how a caller happened to order its
 * events.
 */
export function mealsByType(
  events: ConsumptionEvent[]
): Map<MealType, CopyableEvent[]> {
  const { copyable } = partitionCopyable(
    [...events].sort((a, b) => a.time - b.time)
  );

  // Insertion order is earliest-event order, because the events are sorted and
  // a group is created by its first one.
  const meals = new Map<MealType, CopyableEvent[]>();
  for (const item of copyable) {
    const meal_type = asMealType(item.meal_type, "snack");
    const held = meals.get(meal_type);
    if (held) held.push(item);
    else meals.set(meal_type, [item]);
  }
  return meals;
}
