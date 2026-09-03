import type { ConsumptionEvent } from "./consumption-state";
import { parseLoggedQuantity } from "./recipe-ingredient";
import type { AmountUnit, MeasuredUnit } from "./nutrition";
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
 * This module is the folds over that history which the log sheet's defaults are
 * built from — which foods a meal offers, and the amount each one opens at. The
 * catalogue rule (`isCatalogueFood`, ADR-0035 §6) and the twelve-slot cap both
 * live downstream in the caller, because both need the food twin, and fetching
 * twins is I/O these folds must not do (`CODING_STANDARDS.md` §2.1).
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
  unit: AmountUnit;
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
 * The amount this food was last logged at, in `unit`, or null where there is
 * nothing to open on.
 *
 * A food is nearly always eaten in the same amount — a 40 g bowl of oats stays
 * a 40 g bowl — so the amount control opens on what the user last chose for
 * this food rather than on the unit's generic default (`amountDefaults`). The
 * caller falls back to that default on null, which keeps the two rules in one
 * readable line at the call site instead of a default buried in here.
 *
 * **The unit must match, and a mismatch is null rather than a number.** ADR-0060
 * §1/§2 is that nothing converts: a drink logged at `330ml` cannot seed a field
 * entered in grams, and a whole-serving log ("1 serving", ADR-0035 §6) names no
 * measurement at all. Both come back null and take the default, which is the
 * only honest answer — the alternative is a field pre-filled with a number
 * measured against something else.
 *
 * Unscoped by meal, unlike {@link recentCandidatesForMeal} above. That walk is
 * scoped because a meal's *offer* is about what belongs at breakfast; this is
 * about how much of one food a person eats, which the clock does not change.
 * The same 40 g of oats is 40 g whenever it is logged.
 *
 * A single pass for the newest match rather than a sorted copy: only one event
 * is wanted here, where the sibling walk needs the whole history in order. Two
 * events for one food can share a timestamp — copying a past meal that holds
 * the same food twice appends them together (ADR-0058) — and then either is
 * equally "the last time", so array order settles it and nothing is lost.
 *
 * Retraction needs no filter here: the projection this reads has already
 * dropped retracted events (`consumption-state.ts`), so an amount the user
 * undid is not in the history to be remembered.
 */
export function rememberedAmount(
  events: readonly ConsumptionEvent[],
  target: string,
  unit: MeasuredUnit
): number | null {
  let newest: ConsumptionEvent | null = null;
  for (const event of events) {
    if (event.target !== target) continue;
    if (newest === null || event.time > newest.time) newest = event;
  }
  if (newest === null) return null;

  const logged = parseLoggedQuantity(newest.quantity);
  return logged.unit === unit ? logged.amount : null;
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
