import type { ConsumptionEvent } from "./consumption-state";
import type { Instantiation, InstantiationRow } from "./recipe-instantiation";
import { midnight } from "./past-meals";
import { asMealType, type MealType } from "./meal-type";

/**
 * The two reads behind the Recipes screen (ADR-0110 §6 and §7): the impromptu
 * dishes you assembled, and every day one twin was made.
 *
 * Both are folds over Consumption Events the ledger already holds. No attribute
 * records that a dish was impromptu and none records a twin's history — the
 * first is the absence of a name (§1) and the second is the events that name the
 * twin, which is what makes these reads rather than projections.
 */

/**
 * One occasion a recipe twin was made — a row in either list.
 *
 * It is per-occasion and not per twin, which is the whole of §6's shape: a dish
 * assembled on two days is two rows that open one twin, and a day on which two
 * dishes were assembled contributes two rows and repeats its date (ADR-0058 §12,
 * inherited).
 */
export interface RecipeOccasion {
  /** The Consumption Event this occasion was — unique, so it keys the row. */
  id: string;
  /** The twin instantiated. Picking the row opens it (§7). */
  target: string;
  /** Local midnight of the day it was logged; `dayLabel` reads this. */
  date: Date;
  meal_type: MealType;
  /**
   * The occasion's OWN frozen ingredient rows (`event/instantiation`), which is
   * what the row's body lines spell out. Per-occasion rather than read off the
   * twin: the snapshot is what was actually made that day, and it survives the
   * twin changing (ADR-0022 §2).
   */
  ingredients: InstantiationRow[];
}

/**
 * A Consumption Event that is a recipe occasion: it names a twin and froze a
 * snapshot of what was made. The two fields are non-optional here, so the walk
 * below reads them without casting and the precondition is checked once, in
 * {@link isOccasion} — the shape {@link import("./past-meals").CopyableEvent}
 * takes for the same reason.
 */
type OccasionEvent = ConsumptionEvent & {
  target: string;
  instantiation: Instantiation;
};

/**
 * Whether an event is a recipe occasion at all.
 *
 * **It is the frozen snapshot that says so.** A row is made of that snapshot —
 * its lines are the ingredient rows — so an event without one has nothing to
 * show and is not an occasion. It is also the only shape a recipe occasion
 * takes: the one writer of a logged recipe freezes a snapshot
 * (`logRecipeConsumption`), and a copy carries the original's forward
 * (`copyPastMeal`), which is why a copied dish lists as the second occasion it
 * is.
 */
function isOccasion(event: ConsumptionEvent): event is OccasionEvent {
  return event.target !== undefined && event.instantiation !== undefined;
}

/**
 * The occasions among `events` whose twin `keep` accepts, newest first.
 *
 * Uncapped, for `recentCandidatesForMeal`'s reason: the Nth+1 event may be the
 * only occasion of the dish being looked for.
 */
function occasionsWhere(
  events: readonly ConsumptionEvent[],
  keep: (target: string) => boolean
): RecipeOccasion[] {
  return events
    .filter(isOccasion)
    .filter((event) => keep(event.target))
    .sort((a, b) => b.time - a.time)
    .map((event) => ({
      id: event.id,
      target: event.target,
      date: midnight(new Date(event.time)),
      meal_type: asMealType(event.meal_type, "snack"),
      ingredients: event.instantiation.ingredients,
    }));
}

/**
 * Every occasion of an Impromptu Recipe, newest first — the second list on the
 * Recipes screen (ADR-0110 §6).
 *
 * `named` is the twins that carry a `recipe/name`, which is exactly what
 * `recipeTwinsStore` holds (`WHERE attribute = 'recipe/name'`). Membership is
 * therefore derived from the one query the library is defined by, so the two
 * lists cannot come to disagree about which twins are named — §2's rule, read
 * from both ends. It could not be read off the event instead: after §3 an
 * impromptu dish carries a derived `foodName` indistinguishable from a typed
 * name, and §1 forbids a flag that would tell them apart.
 *
 * Naming a twin therefore empties its rows from this list and fills them into
 * the library, all of them, with the one datom §5 spends.
 */
export function impromptuOccasions(
  events: readonly ConsumptionEvent[],
  named: ReadonlySet<string>
): RecipeOccasion[] {
  return occasionsWhere(events, (target) => !named.has(target));
}

/**
 * Every occasion of one twin, newest first — the history §7 puts on the screen
 * both kinds of twin open into.
 *
 * It asks nothing about the name, because the history is the same fact either
 * way: a template's instantiations over time are its history, which `CONTEXT.md`
 * has said since ADR-0022 and nothing has shown until now. Promotion leaves it
 * untouched, since the id survives naming (§5) and the events name the id.
 */
export function occasionsOf(
  events: readonly ConsumptionEvent[],
  entity: string
): RecipeOccasion[] {
  return occasionsWhere(events, (target) => target === entity);
}
