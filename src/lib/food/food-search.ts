import type { EntityPayload } from "../ingestion/ingest";
import { searchUsdaCorpus } from "./usda-corpus";
import { curatedMatches } from "./curated-foods";
import { macrosFromNutrition, type NutritionInfo } from "./nutrition";
import { manualEntryIsReusable, type ManualEntry } from "./provenance";

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
 * The ONE place the Recent/Search catalogue rule lives (ADR-0035 §6). Given a
 * logged food twin's attributes and the UNIT it was logged in, decides whether it
 * belongs in the reusable Recent/Search list:
 *
 * - A **gram-basis** log always qualifies (searched/scanned foods, unchanged).
 * - A **whole-serving** log qualifies **only** when it is a reusable `menu`
 *   manual entry. A `quick_estimate` / `plate_estimate` one-off, a legacy custom,
 *   and a label capture all stay out — they re-open via the edit path, never as a
 *   catalogue food. The decision keys off `food/manual_entry.kind` alone.
 */
export function isCatalogueFood(
  attributes: Record<string, unknown>,
  quantityUnit: string
): boolean {
  if (quantityUnit !== "serving") return true;
  const manualEntry = attributes["food/manual_entry"] as
    | ManualEntry
    | undefined;
  return manualEntry != null && manualEntryIsReusable(manualEntry.kind);
}

// ── Why a search came back empty (ADR-0047 §10) ────────────────────────────
// One message, because there is one thing left to say. #118 gave an empty search
// two verdicts — records USDA holds that the ADR-0042 filters dropped, versus
// records USDA does not hold — and ADR-0047 §4 removes the evidence for the
// distinction: the dropped records are not in the Search index to be counted, so
// every empty search now looks alike from here. The barcode route the first
// verdict offered goes with it.
//
// That is a deliberate regression and #123 carries the better answer, which is
// probably not a message at all. This constant is where the copy lives until it
// does; do not grow a replacement verdict here.

/** The one thing an empty food search says (ADR-0047 §10). */
export const NO_FOOD_FOUND = "No food found.";

/**
 * Thrown when a search returns no food. Distinct from the plain `Error`s the
 * search path throws for a genuine fault, so a broken artifact or a broken
 * service worker is never folded into "no food found".
 */
export class NoReferenceFoodError extends Error {
  constructor() {
    super(NO_FOOD_FOUND);
    this.name = "NoReferenceFoodError";
  }
}

/**
 * Searches the bundled USDA corpus and maps the matches to FoodResults, folding
 * in any curated stand-in the query reaches (ADR-0046 §1) — a base ingredient no
 * reference table carries, pinned to one vetted OFF record. Throws if nothing
 * matched, so callers only handle the error path; an empty query returns [].
 *
 * An exact curated hit LEADS the list and a partial one TRAILS it, so the stand-in
 * is the answer for "cacao nibs" without displacing USDA's cocoa powder for the
 * broader "cocoa".
 *
 * No key, no quota and no network (ADR-0047 §1): the corpus is a committed
 * artifact precached at install, so this answers on a plane and on a cold
 * offline install alike.
 */
export async function searchUsdaFoods(query: string): Promise<FoodResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const curated = curatedMatches(trimmed);
  const foods = await searchUsdaCorpus(trimmed);
  const results = [
    ...curated.filter((m) => m.exact),
    ...foods.map((payload) => ({ payload, exact: false })),
    ...curated.filter((m) => !m.exact),
  ].map(({ payload }) => mapPayloadToFoodResult(payload));
  if (results.length === 0) throw new NoReferenceFoodError();
  return results;
}
