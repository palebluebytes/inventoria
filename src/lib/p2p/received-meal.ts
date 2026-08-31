/**
 * The meal a payload turns out to be, for the surface that is holding it
 * (ADR-0073 §5 and §10, ADR-0074 §4).
 *
 * The receiving surface shows **the meal itself, with nothing in front of it**,
 * so it needs the payload as a meal rather than as datoms — and a received meal
 * IS a Past meal, the sender's, which is why this returns {@link PastMeal}
 * rather than a shape of its own. ADR-0073 §5 says the same thing from the
 * other side: receiving is `copyPastMeal` with a wire in front of it.
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
import { asMealType } from "../food/meal-type";
import { midnight, partitionCopyable, type PastMeal } from "../food/past-meals";
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
 * One payload as one meal, or `null` when it carries no meal at all.
 *
 * `null` is the narrower case that survives all seven of ADR-0073 §8's
 * refusals: §8.4 refuses a root the lines do not carry, but a root whose rows
 * fold to an event with no food to point at is carried and still cannot go in
 * anybody's day. The surface says so rather than drawing an empty meal with an
 * "add it" button under it, which would be an offer to add nothing.
 *
 * **The meal type is the first event's**, and a payload's events are one meal
 * by construction — the sender hands over a meal panel, which is one meal
 * entire. A payload that mixed them lands whole in the meal its earliest event
 * names, which is what "one meal" has to mean for a screen that shows one.
 * `asMealType` is the sanctioned narrowing and its fallback is load-bearing
 * here for the first time: the string came off another device's ledger, so it
 * is genuinely arbitrary rather than one of four.
 */
export function readReceivedMeal(
  payload: ReceivedMealPayload
): PastMeal | null {
  const events = receivedMealEvents(
    winningRows(payload.rows),
    payload.roots
  ).sort((a, b) => a.time - b.time);

  const { copyable } = partitionCopyable(events);
  const first = copyable[0];
  if (!first) return null;

  return {
    date: midnight(new Date(first.time)),
    meal_type: asMealType(first.meal_type, "snack"),
    items: copyable,
    calories: copyable.reduce((total, item) => total + item.calories, 0),
  };
}
