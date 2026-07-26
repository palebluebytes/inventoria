import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";
import type { NutritionInfo, Macros } from "./nutrition";
import {
  deriveRecipeNutrition,
  type ReferenceIngredient,
} from "./recipe-nutrition";

export interface ConsumptionEvent {
  id: string;
  time: number;
  type?: string;
  target?: string;
  quantity?: string;
  meal_type?: string;
  metrics?: {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
  };
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  foodName?: string;
  photoBase64?: string;
  /** "retracted" hides the event from the projection (append-only "delete"). */
  status?: string;
  replaced_by?: string;
  // schema.org/Recipe fields, enriched from the recipe twin (ADR-0021). A
  // logged event's macros come from its frozen `event/metrics` snapshot, never
  // re-derived from these, so recipe edits don't rewrite logged history.
  description?: string;
  url?: string;
  image?: string;
  instructions?: string[];
  yield?: number;
  ingredients?: unknown;
  /**
   * A recipe's **current** per-serving nutrition, derived live from the
   * referenced ingredient twins' `nutrition/info` panels ÷ `recipe/yield`
   * (ADR-0021) — a projected value, not stored. Distinct from `calories` et al.,
   * which for a logged event stay pinned to the frozen `event/metrics` snapshot
   * so history is immutable. Only present when the target is a recipe twin whose
   * ingredient twins are in the datom stream.
   */
  recipe_nutrition?: Macros;
}

/**
 * Folds the consumption datom stream (Consumption Events joined to their food /
 * recipe twins) into enriched events for the whole history. The pure worker-side
 * projection behind `CONSUMPTION`; the Food dashboard narrows to a day on the
 * main thread (ADR-0019).
 *
 * A Consumption Event stores its macros as an `event/metrics` blob, surfaced as
 * flat fields here. A recipe target additionally gets its live per-serving
 * nutrition derived from the referenced ingredient twins' panels (ADR-0021).
 * `nutrition/` is folded alongside `food/`/`recipe/` so each ingredient twin's
 * `nutrition/info` panel is available to resolve those references.
 */
export function computeConsumption(datoms: StoredDatom[]): ConsumptionEvent[] {
  const { twins: twinGroups, events: eventGroups } = groupByEntity(datoms, [
    "food/",
    "recipe/",
    "nutrition/",
  ]);

  const events: ConsumptionEvent[] = Array.from(eventGroups.values())
    .map((g) => {
      const f = g.fields as Record<string, any>;
      const event: ConsumptionEvent = { id: g.id, time: g.firstTime, ...f };
      if (f.metrics) {
        event.calories = f.metrics.calories;
        event.protein = f.metrics.protein;
        event.fat = f.metrics.fat;
        event.carbs = f.metrics.carbs;
      }
      return event;
    })
    // Retracted events (e.g. foods replaced by a recipe) are hidden but never
    // deleted — the ledger keeps their datoms.
    .filter((e) => e.status !== "retracted");

  // Enrich each event with its target twin's display fields.
  for (const event of events) {
    if (!event.target) continue;
    const twin = twinGroups.get(event.target);
    if (!twin) continue;
    const t = twin.fields as Record<string, any>;
    // `groupByEntity` merges the food/ and recipe/ prefixes into one flat map,
    // so a recipe twin's `recipe/name` and a food twin's `food/name` both land
    // as `t.name`.
    event.foodName = t.name;
    event.photoBase64 = t.photo_base64 || t.photo || t.image;
    // schema.org/Recipe display fields (ADR-0021).
    event.description = t.description;
    event.url = t.url;
    event.image = t.image;
    event.instructions = t.instructions;
    event.yield = t.yield;
    event.ingredients = t.ingredients;

    // Derive the recipe's CURRENT per-serving nutrition from its ingredient
    // twins' real panels ÷ yield (ADR-0021). This is a live projected value and
    // never overwrites the frozen snapshot in `calories`/`protein`/… above.
    if (Array.isArray(t.ingredients)) {
      const refs = t.ingredients as ReferenceIngredient[];
      const recipeYield = typeof t.yield === "number" ? t.yield : 1;
      event.recipe_nutrition = deriveRecipeNutrition(
        refs,
        recipeYield,
        (ref) => twinGroups.get(ref)?.fields.info as NutritionInfo | undefined
      );
    }
  }

  return events;
}
