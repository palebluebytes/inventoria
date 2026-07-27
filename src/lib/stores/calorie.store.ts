import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { createProjectionStore } from "./datoms.store";
import type { ConsumptionEvent } from "../food/consumption-state";
import {
  nutritionFromMacros,
  PER_SERVING,
  type NutritionInfo,
} from "../food/nutrition";
import {
  deriveRecipeNutrition,
  type ReferenceIngredient,
} from "../food/recipe-nutrition";
import {
  buildInstantiation,
  type Instantiation,
} from "../food/recipe-instantiation";

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
 * Creates and appends a Consumption Event's datoms to the ledger. `instantiation`
 * is the optional `event/instantiation` snapshot a logged recipe carries beside
 * its frozen `event/metrics` headline (ADR-0022); a plain food logs without one.
 */
export async function logFoodConsumption(
  targetEntity: string,
  quantity: string,
  meal_type: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  selectedDate: Date,
  instantiation?: Instantiation
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

  const attributes: Record<string, unknown> = {
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
  };
  if (instantiation) attributes["event/instantiation"] = instantiation;

  const datoms = ingestEntity({ entity: entityId, attributes });

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

  // Custom foods are entered as absolute totals for one serving, so the panel's
  // basis is "1 serving" rather than 100 g (ADR-0021).
  const nutrition = nutritionFromMacros(
    { calories, protein, fat, carbs },
    PER_SERVING
  );
  const payload: any = {
    entity: entityId,
    attributes: {
      "food/name": name,
      "nutrition/info": nutrition,
    },
  };

  if (photoBase64) {
    payload.attributes["food/photo_base64"] = photoBase64;
  }

  await dbClient.append(ingestEntity(payload));
  return entityId;
}

export interface RecipeInput {
  /** schema.org name. */
  name: string;
  /** Pure `{ ref, amount, unit }` references to the ingredient food twins. */
  ingredients: ReferenceIngredient[];
  /** schema.org description (the "Notes" field in the UI). */
  description?: string;
  /** schema.org url / isBasedOn (the "Source" field in the UI). */
  url?: string;
  /** schema.org image. */
  image?: string;
  /** schema.org recipeInstructions — ordered HowToStep text. */
  instructions?: string[];
  /** schema.org recipeYield; defaults to 1 (single-serving) this ticket. */
  yield?: number;
}

/**
 * Saves a schema.org/Recipe twin (ADR-0021). A recipe stores **no** macros of
 * its own — `recipe/ingredients` holds pure `{ ref, amount, unit }` references,
 * and per-serving nutrition is derived from the referenced ingredient twins.
 * That derived aggregate is frozen into the Consumption Event's `event/metrics`
 * snapshot at log time, so later recipe edits never rewrite logged history.
 */
export async function saveRecipe(input: RecipeInput): Promise<string> {
  const timestamp = Date.now();
  const entityId = `recipe:${Math.random().toString(36).substring(2, 9)}_${timestamp}`;

  const attributes: Record<string, any> = {
    "recipe/name": input.name,
    // Store direct JSON arrays/objects; ingestEntity/worker stringifies them.
    "recipe/ingredients": input.ingredients,
    "recipe/yield": input.yield ?? 1,
  };
  if (input.description?.trim())
    attributes["recipe/description"] = input.description.trim();
  if (input.url?.trim()) attributes["recipe/url"] = input.url.trim();
  if (input.instructions && input.instructions.length)
    attributes["recipe/instructions"] = input.instructions;
  if (input.image) attributes["recipe/image"] = input.image;

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

/**
 * Logs a recipe as a Recipe Instantiation — a Consumption Event carrying a frozen
 * `event/instantiation` snapshot beside its `event/metrics` headline (ADR-0022).
 * Both are derived from the referenced ingredient twins' real `nutrition/info`
 * panels ÷ `recipeYield`: the headline via `deriveRecipeNutrition`, the snapshot's
 * per-row macros via the same `deriveIngredientMacros` those sum from, so the rows
 * add up to the headline forever. This is the single store path that computes them,
 * so a logged recipe's numbers are the true derivation, not hand-supplied.
 * `resolve` yields each referenced twin's panel and `resolveName` its display name
 * (both from the in-memory builder, or a test double) — read, never mutated.
 */
export async function logRecipeConsumption(
  recipeId: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined,
  resolveName: (ref: string) => string | undefined,
  meal_type: string,
  selectedDate: Date
): Promise<string> {
  const snapshot = deriveRecipeNutrition(ingredients, recipeYield, resolve);
  const instantiation = buildInstantiation(
    recipeId,
    ingredients,
    recipeYield,
    resolve,
    resolveName
  );
  return logFoodConsumption(
    recipeId,
    "1 serving",
    meal_type,
    snapshot.calories,
    snapshot.protein,
    snapshot.fat,
    snapshot.carbs,
    selectedDate,
    instantiation
  );
}

/**
 * Retracts a Consumption Event by appending a newer `event/status = "retracted"`
 * datom (never deletes — the projection's latest-wins fold hides it). Mirrors the
 * habit soft-archive convention (ADR-0008). `replacedBy` links the retracted event
 * to whatever supersedes it (e.g. the recipe event, or the re-logged event of an
 * edit) for an auditable trail; omit it for a plain user-initiated removal.
 */
export async function retractConsumptionEvent(
  eventId: string,
  replacedBy?: string
): Promise<void> {
  const attributes: Record<string, string> = {
    "event/status": "retracted",
  };
  if (replacedBy) attributes["event/replaced_by"] = replacedBy;
  await dbClient.append(ingestEntity({ entity: eventId, attributes }));
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
