import { readable, type Readable } from "svelte/store";
import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";

// Helper to get local start/end of a given date
export function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

// Fetch and structure events for a given day
export async function getEventsForDay(date: Date) {
  const { start, end } = getDayBounds(date);

  // 1. Fetch all datoms for consume events in the day range
  const eventDatoms = await dbClient.query<{
    entity: string;
    attribute: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'event:consume_%' AND time >= ? AND time <= ?",
    [start, end]
  );

  // 2. Group datoms by event entity
  const eventsMap = new Map<string, any>();
  for (const row of eventDatoms) {
    if (!eventsMap.has(row.entity)) {
      eventsMap.set(row.entity, {
        id: row.entity,
        time: row.time,
      });
    }
    const event = eventsMap.get(row.entity);
    let key = row.attribute.replace("event/", ""); // e.g. "target", "quantity", "metrics"
    let parsedValue;
    try {
      parsedValue = JSON.parse(row.value);
    } catch {
      parsedValue = row.value;
    }
    if (key === "metrics") {
      event.metrics = parsedValue;
      if (parsedValue) {
        event.calories = parsedValue.calories;
        event.protein = parsedValue.protein;
        event.fat = parsedValue.fat;
        event.carbs = parsedValue.carbs;
      }
    } else {
      event[key] = parsedValue;
    }
  }

  const events = Array.from(eventsMap.values());
  if (events.length === 0) return [];

  // 3. Fetch names and macros for target twins
  const targets = Array.from(
    new Set(events.map((e) => e.target).filter(Boolean))
  );
  if (targets.length > 0) {
    const placeholders = targets.map(() => "?").join(",");
    const twinDatoms = await dbClient.query<{
      entity: string;
      attribute: string;
      value: string;
    }>(
      `SELECT entity, attribute, value FROM datoms WHERE entity IN (${placeholders})`,
      targets
    );

    // Group twin attributes
    const twinsMap = new Map<string, any>();
    for (const row of twinDatoms) {
      if (!twinsMap.has(row.entity)) {
        twinsMap.set(row.entity, {});
      }
      const twin = twinsMap.get(row.entity);
      const key = row.attribute.replace("food/", "").replace("recipe/", "");
      try {
        twin[key] = JSON.parse(row.value);
      } catch {
        twin[key] = row.value;
      }
    }

    // 4. Merge twin details into events
    for (const event of events) {
      const twin = twinsMap.get(event.target);
      if (twin) {
        event.food_name = twin.name;
        event.photo_base64 = twin.photo_base64 || twin.photo;
        event.description = twin.description;
        event.scrape_url = twin.scrape_url;
        event.source_url = twin.source_url || twin.source;
        event.ingredients = twin.ingredients;
      }
    }
  }

  return events;
}

// Svelte readable store that live-updates when database invalidates
export function createCalorieTrackerStore(date: Date): Readable<any[]> {
  return readable<any[]>([], (set) => {
    let live = true;

    async function refresh() {
      try {
        const data = await getEventsForDay(date);
        if (live) set(data);
      } catch (err) {
        console.error("Failed to load calorie tracker data:", err);
      }
    }

    refresh();

    const unsubscribe = dbClient.onInvalidate(() => {
      if (live) refresh();
    });

    return () => {
      live = false;
      unsubscribe();
    };
  });
}

// ---------------------------------------------------------------------------
// Logging helper actions
// ---------------------------------------------------------------------------

/**
 * Creates and appends a Consumption Event datoms to the ledger.
 */
export async function logFoodConsumption(
  target_entity: string,
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
      "event/target": target_entity,
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
  photo_base64?: string,
  custom_entity_id?: string
): Promise<string> {
  const timestamp = Date.now();
  const entityId =
    custom_entity_id ||
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

  if (photo_base64) {
    payload.attributes["food/photo_base64"] = photo_base64;
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
  scrape_url: string,
  ingredients: any[],
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  source_url?: string
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
      "recipe/scrape_url": scrape_url,
      "recipe/ingredients": ingredients, // Store direct JSON array, ingestEntity/worker stringifies it
    },
  };

  if (source_url) {
    payload.attributes["recipe/source_url"] = source_url;
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
