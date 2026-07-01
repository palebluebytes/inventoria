import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { createProjectionStore } from "./datoms.store";
import type { ConsumptionEvent } from "../food/consumption-state";

export type { ConsumptionEvent };

// Helper to get local start/end of a given date
export function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

// Live store of every enriched Consumption Event, folded by the worker-side
// CONSUMPTION projection. The Food dashboard narrows to a day on the main
// thread (ADR-0019).
export const consumptionStore = createProjectionStore<ConsumptionEvent[]>(
  "CONSUMPTION",
  {},
  []
);

/** Filters a consumption list to the events that fall on a given local day. */
export function consumptionForDay(
  events: ConsumptionEvent[],
  date: Date
): ConsumptionEvent[] {
  const { start, end } = getDayBounds(date);
  return events.filter((e) => e.time >= start && e.time <= end);
}

// ---------------------------------------------------------------------------
// Logging helper actions
// ---------------------------------------------------------------------------

/**
 * Creates and appends a Consumption Event datoms to the ledger.
 */
export async function logFoodConsumption(
  targetEntity: string,
  quantity: string,
  meal_type: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  selectedDate: Date
) {
  // Use selected date's time, but keep current hour/minute/second so events don't all cluster at 00:00
  const now = new Date();
  const eventDate = new Date(selectedDate);
  eventDate.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  const timestamp = eventDate.getTime();

  const entityId = `event:consume_${Math.random().toString(36).substring(2, 9)}_${timestamp}`;

  const datoms = ingestEntity({
    entity: entityId,
    attributes: {
      "event/type": "ConsumeAction",
      "event/target": targetEntity,
      "event/quantity": quantity,
      "event/meal_type": meal_type,
      "event/metrics": {
        calories,
        protein,
        fat,
        carbs,
      },
    },
  });

  // Inject manually since ingestEntity maps all values. Note time is injected inside dbClient.append
  // but datoms array has .time field which dbClient uses.
  for (const datom of datoms) {
    datom.time = timestamp;
  }

  await dbClient.append(datoms);
  return entityId;
}

/**
 * Saves a custom manual entry or photo-based food twin.
 */
export async function saveCustomFood(
  name: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  photoBase64?: string,
  customEntityId?: string
): Promise<string> {
  const timestamp = Date.now();
  const entityId =
    customEntityId ||
    `food:custom_${Math.random().toString(36).substring(2, 9)}_${timestamp}`;

  const payload: any = {
    entity: entityId,
    attributes: {
      "food/name": name,
      "food/calories": `${calories} kcal`,
      "food/protein": `${protein} g`,
      "food/fat": `${fat} g`,
      "food/carbs": `${carbs} g`,
    },
  };

  if (photoBase64) {
    payload.attributes["food/photo_base64"] = photoBase64;
  }

  await dbClient.append(ingestEntity(payload));
  return entityId;
}

/**
 * Saves a Recipe twin.
 */
export async function saveRecipe(
  name: string,
  description: string,
  scrapeUrl: string,
  ingredients: any[],
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  sourceUrl?: string
): Promise<string> {
  const timestamp = Date.now();
  const entityId = `recipe:${Math.random().toString(36).substring(2, 9)}_${timestamp}`;

  const payload: any = {
    entity: entityId,
    attributes: {
      "food/name": name,
      "food/calories": `${calories} kcal`,
      "food/protein": `${protein} g`,
      "food/fat": `${fat} g`,
      "food/carbs": `${carbs} g`,
      "recipe/description": description,
      "recipe/scrape_url": scrapeUrl,
      "recipe/ingredients": ingredients, // Store direct JSON array, ingestEntity/worker stringifies it
    },
  };

  if (sourceUrl) {
    payload.attributes["recipe/source_url"] = sourceUrl;
  }

  await dbClient.append(ingestEntity(payload));
  return entityId;
}

/**
 * Retrieves a local digital twin by its entity ID if it exists in the database.
 */
export async function getLocalFoodTwin(entityId: string): Promise<any | null> {
  const rows = await dbClient.query<{ attribute: string; value: string }>(
    "SELECT attribute, value FROM datoms WHERE entity = ?",
    [entityId]
  );
  if (rows.length === 0) return null;

  const attributes: Record<string, any> = {};
  for (const row of rows) {
    try {
      attributes[row.attribute] = JSON.parse(row.value);
    } catch {
      attributes[row.attribute] = row.value;
    }
  }

  return {
    entity: entityId,
    attributes,
  };
}
