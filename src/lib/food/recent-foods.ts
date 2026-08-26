import type { ConsumptionEvent } from "./consumption-state";
import { parseLoggedQuantity, type LoggedUnit } from "./recipe-ingredient";
import type { MealType } from "./meal-type";

/**
 * The meal's default content (ADR-0057).
 *
 * The Recent list is not a result list, it is what the log sheet offers before
 * the user has asked for anything — and the sheet's own title is the meal
 * (`LogFoodSheet.svelte`). So opening `breakfast` offers the foods logged at
 * breakfast, and everything else is reached by typing into the search box
 * already on screen. A default is judged on being right, not on being complete;
 * nothing is lost by narrowing it, because search sits beside it.
 *
 * This module is the candidate walk alone. The catalogue rule
 * (`isCatalogueFood`, ADR-0035 §6) and the twelve-slot cap both live downstream
 * in the caller, because both need the food twin, and fetching twins is I/O this
 * fold must not do (`CODING_STANDARDS.md` §2.1).
 */

/**
 * One food the meal's default may offer, before the twin is resolved: the twin's
 * entity and the unit it was last logged in AT THIS MEAL.
 *
 * The unit is carried because `isCatalogueFood` needs it — a whole-serving log
 * qualifies only as a reusable `menu` manual entry (ADR-0035 §6). Reading it
 * from the meal-scoped stream rather than from the history at large is what
 * stops a serving logged at dinner from governing how the same food qualifies
 * at breakfast.
 */
export interface RecentCandidate {
  target: string;
  unit: LoggedUnit;
}

/**
 * Every distinct food logged at `meal_type`, newest first.
 *
 * Uncapped by design. A meal's default cannot be computed from the newest N
 * events, because the N+1th may hold the only breakfast in the history — which
 * is exactly what the `RECENT_CANDIDATES = 40` cap this replaced would have done
 * to anyone logging three meals a day. The cap it existed to serve is applied by
 * the caller instead, once the twins it needs to apply it are in hand.
 *
 * Cheap enough to be uncapped: the caller already sorts the whole consumption
 * history on every recompute, so the linear pass here is not what the work costs
 * — and the recompute happens when the store CHANGES (a log, a retraction), not
 * on render.
 */
export function recentCandidatesForMeal(
  events: readonly ConsumptionEvent[],
  meal_type: MealType
): RecentCandidate[] {
  const seen = new Set<string>();
  const candidates: RecentCandidate[] = [];

  // Copied before sorting: the caller passes the consumption store's own array.
  for (const event of [...events].sort((a, b) => b.time - a.time)) {
    if (event.meal_type !== meal_type) continue;
    if (!event.target || seen.has(event.target)) continue;
    seen.add(event.target);
    candidates.push({
      target: event.target,
      unit: parseLoggedQuantity(event.quantity).unit,
    });
  }

  return candidates;
}

/**
 * Why a meal's default came back empty, as the caller can tell it apart.
 *
 * The two are not the same claim and the surface must not conflate them: the
 * walk above reports what was LOGGED at the meal, and the caller then drops
 * whatever the catalogue rule refuses (ADR-0035 §6) or whose twin has gone. A
 * meal logged only as quick-estimate one-offs has history and offers nothing.
 */
export type EmptyMealDefaultReason =
  /** Nothing has ever been logged at this meal. */
  | "none"
  /** Foods were logged here, but none of them can be offered again. */
  | "nothing-reusable";

/**
 * What the Search tab says when this meal's default is empty (ADR-0057 §5).
 *
 * A blank default used to render as silence, which a first-run user reads
 * correctly and a user with months of history does not: scoping means someone
 * who has never logged a breakfast now meets a blank where they are used to
 * twelve foods, and silence there reads as broken. So the line names the MEAL —
 * saying there is nothing *for this meal* rather than nothing at all.
 *
 * Only the `none` line says what fills the surface, because only there is that
 * true. The `nothing-reusable` line says less on purpose: it must cover both a
 * one-off amount the catalogue rule refuses and a twin that has since gone, so
 * it states the outcome and names no cause it cannot vouch for.
 *
 * Neither offers a route out: search is already the thing above it, and the
 * twelve slots are never topped up from other meals to hide this state.
 */
export function emptyMealDefaultHint(
  meal_type: MealType,
  reason: EmptyMealDefaultReason
): string {
  return reason === "none"
    ? `Nothing logged at ${meal_type} yet. Foods you log here will be waiting next time.`
    : `Nothing you've logged at ${meal_type} can be offered again. Search to add a food.`;
}
