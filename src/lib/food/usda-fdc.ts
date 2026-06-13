import { get } from "svelte/store";
import type { EntityPayload } from "../ingestion/ingest";
import { settingsStore } from "../stores/settings.store";

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

// Nutrient IDs used by the FDC database
const NUTRIENT_ID_ENERGY = 1008;
const NUTRIENT_ID_PROTEIN = 1003;
const NUTRIENT_ID_FAT = 1004;
const NUTRIENT_ID_CARBS = 1005;

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function findNutrient(
  nutrients: FdcNutrient[],
  id: number
): FdcNutrient | undefined {
  return nutrients.find((n) => n.nutrientId === id);
}

/**
 * Maps a USDA FoodData Central food entry to an EntityPayload ready for
 * ingestion into the EAVT ledger.
 */
export function mapFdcFoodToPayload(food: FdcFood): EntityPayload {
  const energy = findNutrient(food.foodNutrients, NUTRIENT_ID_ENERGY);
  const protein = findNutrient(food.foodNutrients, NUTRIENT_ID_PROTEIN);
  const fat = findNutrient(food.foodNutrients, NUTRIENT_ID_FAT);
  const carbs = findNutrient(food.foodNutrients, NUTRIENT_ID_CARBS);

  return {
    entity: `fdc:${food.fdcId}`,
    attributes: {
      "food/name": food.description,
      "food/calories": energy
        ? `${energy.value} ${energy.unitName.toLowerCase()}`
        : "0 kcal",
      "food/protein": protein
        ? `${protein.value} ${protein.unitName.toLowerCase()}`
        : "0 g",
      "food/fat": fat ? `${fat.value} ${fat.unitName.toLowerCase()}` : "0 g",
      "food/carbs": carbs
        ? `${carbs.value} ${carbs.unitName.toLowerCase()}`
        : "0 g",
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
