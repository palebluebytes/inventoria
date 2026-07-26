import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";

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
  description?: string;
  scrapeUrl?: string;
  sourceUrl?: string;
  ingredients?: unknown;
  /** "retracted" hides the event from the projection (append-only "delete"). */
  status?: string;
  replaced_by?: string;
  // Recipe tracker fields (enriched from the recipe twin).
  notes?: string;
  steps?: string[];
  source?: string;
}

/**
 * Folds the consumption datom stream (Consumption Events joined to their food /
 * recipe twins) into enriched events for the whole history. The pure worker-side
 * projection behind `CONSUMPTION`; the Food dashboard narrows to a day on the
 * main thread (ADR-0019).
 *
 * A Consumption Event stores its macros either as an `event/metrics` blob or as
 * flat `event/<macro>` attributes; both are surfaced as flat fields here.
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
    event.foodName = t.name;
    event.photoBase64 = t.photo_base64 || t.photo;
    event.description = t.description;
    event.scrapeUrl = t.scrape_url;
    event.sourceUrl = t.source_url || t.source;
    event.ingredients = t.ingredients;
    // Recipe tracker fields.
    event.notes = t.notes;
    event.steps = t.steps;
    event.source = t.source;
  }

  return events;
}
