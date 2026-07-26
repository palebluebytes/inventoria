import type { EntityPayload } from "../ingestion/ingest";
import { searchFdc } from "./usda-fdc";
import { macrosFromNutrition, type NutritionInfo } from "./nutrition";

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

/**
 * Maps a food twin payload into the result shape both modals render, reading
 * its per-serving macros from the `nutrition/info` panel (ADR-0021). The panel
 * basis is 100 g for searched/scanned foods, which is what the modals scale by.
 */
export function mapPayloadToFoodResult(payload: EntityPayload): FoodResult {
  const info = payload.attributes["nutrition/info"] as
    | NutritionInfo
    | undefined;
  const macros = macrosFromNutrition(info);
  return {
    entity: payload.entity,
    name: payload.attributes["food/name"],
    ...macros,
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
