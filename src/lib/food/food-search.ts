import type { EntityPayload } from "../ingestion/ingest";
import { searchFdc } from "./usda-fdc";

/**
 * Shared food-search helpers for the food and recipe modals. Both turn an
 * ingested food twin (USDA, Open Food Facts, or a local ledger match) into the
 * same display shape, so the mapping and the USDA search-and-map flow live here
 * once instead of being copied per modal.
 */

export interface FoodResult {
  entity: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  payload: EntityPayload;
}

/** Pulls the leading number out of an EAVT attribute value like "12.5 g". */
export function parseAttrValue(val: string | number | undefined): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const match = val.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

/** Maps a food twin payload into the result shape both modals render. */
export function mapPayloadToFoodResult(payload: EntityPayload): FoodResult {
  return {
    entity: payload.entity,
    name: payload.attributes["food/name"],
    calories: parseAttrValue(payload.attributes["food/calories"]),
    protein: parseAttrValue(payload.attributes["food/protein"]),
    fat: parseAttrValue(payload.attributes["food/fat"]),
    carbs: parseAttrValue(payload.attributes["food/carbs"]),
    payload,
  };
}

/**
 * Searches USDA FoodData Central and maps the matches to FoodResults. Throws if
 * the query is empty or nothing matched, so callers only handle the error path.
 */
export async function searchUsdaFoods(query: string): Promise<FoodResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const payloads = await searchFdc(trimmed);
  if (payloads.length === 0) {
    throw new Error("No foods found matching your query.");
  }
  return payloads.map(mapPayloadToFoodResult);
}
