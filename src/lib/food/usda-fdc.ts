import { get } from "svelte/store";
import type { EntityPayload } from "../ingestion/ingest";
import { settingsStore } from "../stores/settings.store";
import { PER_100G, type NutritionInfo } from "./nutrition";

// Read the current key on demand (default param, evaluated per call) instead of
// holding a module-level store subscription that is never cleaned up.
function activeUsdaKey(): string {
  return get(settingsStore).usda_api_key;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FdcNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: FdcNutrient[];
}

// FDC nutrient IDs mapped onto the schema.org nutrition panel. FDC reports macro
// masses in grams and sodium in milligrams; `toGrams` normalises whatever unit
// the source used so every `*_content` field is grams (ADR-0021).
const NUTRIENT_ID_ENERGY = 1008; // Energy (kcal)
/** The gram-valued panel fields (everything except serving_size and calories). */
type MassField = Exclude<keyof NutritionInfo, "serving_size" | "calories">;
const MASS_NUTRIENTS: { id: number; key: MassField }[] = [
  { id: 1003, key: "protein_content" }, // Protein
  { id: 1004, key: "fat_content" }, // Total lipid (fat)
  { id: 1005, key: "carbohydrate_content" }, // Carbohydrate, by difference
  { id: 1079, key: "fiber_content" }, // Fiber, total dietary
  { id: 1258, key: "saturated_fat_content" }, // Fatty acids, total saturated
  { id: 1093, key: "sodium_content" }, // Sodium, Na (mg)
];
// FDC uses either 2000 ("Total Sugars") or the older 1063 ("Sugars, Total");
// prefer whichever the food carries.
const SUGAR_IDS = [2000, 1063];

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function findNutrient(
  nutrients: FdcNutrient[],
  id: number
): FdcNutrient | undefined {
  return nutrients.find((n) => n.nutrientId === id);
}

/** Normalises an FDC mass value to grams from its (case-insensitive) unit. */
function toGrams(value: number, unitName: string): number {
  switch (unitName.toUpperCase()) {
    case "MG":
      return value / 1000;
    case "UG":
    case "µG":
      return value / 1_000_000;
    default:
      return value; // G
  }
}

/**
 * Maps a USDA FoodData Central food entry to an EntityPayload ready for
 * ingestion into the EAVT ledger. Nutrition is emitted as a single atomic
 * `nutrition/info` panel (ADR-0021), populated with whatever subset of the
 * schema.org fields the food provides.
 */
export function mapFdcFoodToPayload(food: FdcFood): EntityPayload {
  const nutrition: NutritionInfo = { serving_size: PER_100G };

  const energy = findNutrient(food.foodNutrients, NUTRIENT_ID_ENERGY);
  if (energy) nutrition.calories = energy.value;

  for (const { id, key } of MASS_NUTRIENTS) {
    const n = findNutrient(food.foodNutrients, id);
    if (n) nutrition[key] = toGrams(n.value, n.unitName);
  }

  for (const id of SUGAR_IDS) {
    const sugar = findNutrient(food.foodNutrients, id);
    if (sugar) {
      nutrition.sugar_content = toGrams(sugar.value, sugar.unitName);
      break;
    }
  }

  return {
    entity: `fdc:${food.fdcId}`,
    attributes: {
      "food/name": food.description,
      "nutrition/info": nutrition,
    },
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

/**
 * Searches the USDA FoodData Central API and returns matching foods as
 * EntityPayloads.
 *
 * @param query  - Free-text search query (e.g. "banana").
 * @param apiKey - USDA FDC API key. Defaults to VITE_USDA_FDC_API_KEY env var.
 */
export async function searchFdc(
  query: string,
  apiKey: string = activeUsdaKey()
): Promise<EntityPayload[]> {
  if (!apiKey) {
    throw new Error("USDA API Key is not configured.");
  }
  const url = `${FDC_BASE}?query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&api_key=${apiKey}`;
  const res = await fetch(url);
  const data: { foods: FdcFood[] } = await res.json();

  // Deduplicate by description, preferring Foundation over SR Legacy
  const foodMap = new Map<string, FdcFood>();
  for (const food of data.foods ?? []) {
    const key = food.description.toLowerCase().trim();
    if (foodMap.has(key)) {
      const existing = foodMap.get(key)!;
      // If the existing one is SR Legacy and the new one is Foundation, replace it.
      if (existing.dataType === "SR Legacy" && food.dataType === "Foundation") {
        foodMap.set(key, food);
      }
    } else {
      foodMap.set(key, food);
    }
  }

  const uniqueFoods = Array.from(foodMap.values());

  // Prioritize raw foods (e.g., "Bananas, raw" over "Bananas, overripe, raw" and others)
  uniqueFoods.sort((a, b) => {
    const getScore = (desc: string) => {
      const d = desc.toLowerCase().trim();
      if (d.endsWith(", raw")) {
        const commas = (d.match(/,/g) || []).length;
        return commas === 1 ? 3 : 2;
      }
      return /\braw\b/.test(d) ? 1 : 0;
    };
    return getScore(b.description) - getScore(a.description);
  });

  return uniqueFoods.map(mapFdcFoodToPayload);
}
