import type { EntityPayload } from "../ingestion/ingest";

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
  apiKey: string = (import.meta.env?.VITE_USDA_FDC_API_KEY as string) ?? ""
): Promise<EntityPayload[]> {
  const url = `${FDC_BASE}?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
  const res = await fetch(url);
  const data: { foods: FdcFood[] } = await res.json();
  return (data.foods ?? []).map(mapFdcFoodToPayload);
}
