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

// ── Found-but-poor: the poor-quality predicate (ADR-0034 §1) ─────────────────
// The ONE place the label-capture effort decides a scanned twin is "poor" enough
// to nudge the user to improve it. Pure and unit-tested; both the scan path
// (found-but-poor door) and any staged-twin check call it.

/** The four core macros a usable food twin must carry (absent ≠ 0). */
const CORE_MACRO_KEYS: (keyof NutritionInfo)[] = [
  "calories",
  "protein_content",
  "fat_content",
  "carbohydrate_content",
];
/**
 * A name at or below this many characters counts as "short" — on its own that is
 * not poor (many good foods are "Egg", "Milk"); it only trips the predicate WITH
 * a corroborator (a missing macro or low completeness). Tuned to catch OFF's
 * generic placeholders like "Aceite" (Spanish "oil"), the grounding investigation.
 */
const SHORT_NAME_MAXLEN = 6;
/** OFF `completeness` below this corroborates a short generic name as poor. */
const LOW_COMPLETENESS = 0.5;

/**
 * Decides whether a scanned/looked-up food twin is _poor_ enough to nudge the
 * user to improve it (ADR-0034 §1, the found-but-poor door). A twin is poor when
 * its **name is blank or the mapper's `"Unknown"` fallback**, **or** any **core
 * macro is missing** (calories / protein / fat / carbohydrate — absent, not 0).
 * A **short generic name** is poor ONLY with a corroborator: a missing macro
 * (already covered) or an OFF `completeness` below ~0.5. **Sub-macros and micros
 * never trigger** — a label that omits vitamin B12 is not poor.
 */
export function isPoorFoodTwin(input: {
  name: string;
  nutrition: NutritionInfo | undefined;
  completeness?: number;
}): boolean {
  const name = input.name.trim();
  // Blank or the OFF mapper's placeholder → poor.
  if (name === "" || name.toLowerCase() === "unknown") return true;
  // Any core macro absent → poor. `== null` catches undefined (never 0, which is
  // a legitimate value — a zero-calorie drink is not "missing" calories).
  if (CORE_MACRO_KEYS.some((k) => input.nutrition?.[k] == null)) return true;
  // Short generic name, every macro present: poor only if OFF's own completeness
  // corroborates it. A short name with good/absent completeness is left alone.
  if (
    name.length <= SHORT_NAME_MAXLEN &&
    input.completeness != null &&
    input.completeness < LOW_COMPLETENESS
  )
    return true;
  return false;
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
