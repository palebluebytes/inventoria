import { get } from "svelte/store";
import type { EntityPayload } from "../ingestion/ingest";
import { settingsStore } from "../stores/settings.store";
import { PER_100G, type NutritionInfo } from "./nutrition";
import { buildRawProvenance } from "./provenance";

// Mapper version, bumped when the FDC -> nutrition/info normalisation changes.
// v2: energy now falls back to the Atwater IDs so Foundation foods aren't 0 kcal.
const ADAPTER_VERSION = "2";
const FDC_FOOD_BASE = "https://api.nal.usda.gov/fdc/v1/food";

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
// Energy (kcal). SR Legacy and Branded foods report it under 1008 ("Energy"),
// but Foundation foods omit 1008 and give only Atwater factors — 2047 (General)
// and 2048 (Specific). Prefer 1008, then Atwater General, then Specific, so
// Foundation foods (e.g. "Apples, fuji, with skin, raw") don't read 0 kcal. All
// three are kcal-valued; the kilojoule id (1062) is intentionally excluded.
const ENERGY_IDS = [1008, 2047, 2048];
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

  for (const id of ENERGY_IDS) {
    const energy = findNutrient(food.foodNutrients, id);
    if (energy) {
      nutrition.calories = energy.value;
      break;
    }
  }

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
      // Keep the untouched FDC entry as immutable Provenance so any nutrient not
      // in the panel (the full micronutrient list) can be backfilled later with
      // no network re-fetch (ADR-0016).
      "twin/raw_provenance": buildRawProvenance({
        adapter: "fdc",
        adapter_version: ADAPTER_VERSION,
        source_uri: `${FDC_FOOD_BASE}/${food.fdcId}`,
        raw_data: food,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

/**
 * Turns a free-text query into an FDC prefix search. FDC matches whole words,
 * so a fragment like "bana" matches nothing on the small Foundation/SR Legacy
 * datasets; appending a Lucene "*" wildcard to each token makes it prefix-match
 * ("bana" -> "bana*"), so results appear while the user is still typing.
 */
function toPrefixQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => (token.endsWith("*") ? token : `${token}*`))
    .join(" ");
}

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
  const search = encodeURIComponent(toPrefixQuery(query));
  const url = `${FDC_BASE}?query=${search}&dataType=Foundation,SR%20Legacy&api_key=${apiKey}`;
  const res = await fetch(url);
  // A failed request (bad/expired key -> 403, exhausted quota -> 429, outage ->
  // 5xx) returns a body with no `foods` field. Without this guard that collapses
  // to an empty result set and surfaces as "No foods found", masking the real
  // cause; distinguish the common failures so the user can act on them.
  if (!res.ok) {
    if (res.status === 403)
      throw new Error("USDA API rejected the key. Check it in Settings.");
    if (res.status === 429)
      throw new Error("USDA API rate limit reached. Try again shortly.");
    throw new Error(`USDA API request failed (${res.status}).`);
  }
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
