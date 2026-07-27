import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";
import type { Instantiation } from "./recipe-instantiation";

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
  // schema.org/Recipe display fields, enriched live from the recipe twin
  // (ADR-0021). These are the template's identity, safe to read live; the logged
  // occasion's nutrition and ingredient breakdown come from `instantiation`, not
  // from the (mutable) template, so recipe edits never rewrite logged history.
  description?: string;
  url?: string;
  image?: string;
  instructions?: string[];
  /**
   * The frozen Recipe Instantiation snapshot (`event/instantiation`, ADR-0022):
   * what was actually cooked this occasion — `based_on`, `yield`, and per-row
   * `{ ref, name, amount, unit, calories, protein, fat, carbs }`. The projection
   * reads a logged recipe's breakdown and per-serving macros from here rather
   * than live-deriving from the template, so correcting or deleting an ingredient
   * twin leaves an already-logged instantiation untouched. Present on recipe
   * Consumption Events; absent on plain food logs.
   */
  instantiation?: Instantiation;
}

/**
 * Folds the consumption datom stream (Consumption Events joined to their food /
 * recipe twins) into enriched events for the whole history. The pure worker-side
 * projection behind `CONSUMPTION`; the Food dashboard narrows to a day on the
 * main thread (ADR-0019).
 *
 * A Consumption Event stores its macros as an `event/metrics` blob, surfaced as
 * flat fields here. A logged recipe additionally carries its frozen
 * `event/instantiation` snapshot (ADR-0022) — its breakdown and per-serving
 * macros are read from that snapshot, never live-derived from the (mutable)
 * template, so logged history is immutable. The twin join only supplies the
 * recipe's live display identity (name, image, description, …).
 */
export function computeConsumption(datoms: StoredDatom[]): ConsumptionEvent[] {
  const { twins: twinGroups, events: eventGroups } = groupByEntity(datoms, [
    "food/",
    "recipe/",
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
    // schema.org/Recipe display identity, read live from the template (ADR-0021).
    // The logged occasion's nutrition and ingredient breakdown are NOT read here:
    // they live on the event's frozen `event/instantiation` snapshot (ADR-0022),
    // surfaced via the field spread above, so a template edit or an ingredient-
    // twin correction can never rewrite this logged event.
    event.description = t.description;
    event.url = t.url;
    event.image = t.image;
    event.instructions = t.instructions;
  }

  return events;
}
