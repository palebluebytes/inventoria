import type { EntityPayload } from "../ingestion/ingest";
import { searchFdc } from "./usda-fdc";
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

// ── Why a search came back empty (issue #118) ───────────────────────────────
// An empty result set has two causes the user must be able to tell apart, and
// USDA already reports the difference: a query it matched records for, all of
// which the ADR-0042 brand/processed/prepared filters then dropped, versus a
// query it matched nothing for. The first is a food we hold records of and
// deliberately route to the barcode path; the second is a coverage hole. Only
// the first can honestly point at scanning. Neither is an API failure — those
// throw out of `searchFdc` before this is ever reached, and stay failures.

export type EmptySearchReason = "filtered-out" | "not-covered";

export interface EmptySearchVerdict {
  reason: EmptySearchReason;
  /** The sentence shown to the user; the ONE place this copy lives. */
  message: string;
  /** True only where the barcode path is genuinely the better next route. */
  offerScan: boolean;
}

/**
 * Decides which empty-search story a query got, from how many records USDA
 * matched BEFORE the ADR-0042 reference-food filters ran. Pure, so the wording
 * and the distinction are asserted directly instead of branched inside markup.
 *
 * The `not-covered` wording claims only what is known — that USDA's tables do
 * not carry the food — and never that the food does not exist. Absence from a
 * composition table is exactly the hole ADR-0046 curates against, not a verdict
 * on the world.
 */
export function explainEmptySearch(input: {
  query: string;
  matchedFoods: number;
}): EmptySearchVerdict {
  const { query, matchedFoods } = input;
  if (matchedFoods > 0) {
    // No count in the copy: `matchedFoods` is one page of a wildcarded OR query,
    // so "USDA holds 12 records for X" would assert both a total we did not ask
    // for and a relevance the query does not guarantee. That USDA returned
    // something is the whole of what is known, and the whole of what is said.
    return {
      reason: "filtered-out",
      message: `USDA does hold records for “${query}”, but none of them is a reference food — search leaves brand-specific, packaged and prepared foods to the barcode path.`,
      offerScan: true,
    };
  }
  return {
    reason: "not-covered",
    message: `No reference food matches “${query}”. USDA’s tables do not carry every food — a packaged product belongs to the barcode path, and anything else you can add by hand.`,
    offerScan: false,
  };
}

/**
 * Thrown when a search returns no food, carrying the verdict that says WHY.
 * Distinct from the plain `Error`s `searchFdc` throws for a missing key, an
 * exhausted quota or an outage, so a real fault is never folded into
 * "not covered" (issue #118).
 */
export class NoReferenceFoodError extends Error {
  readonly verdict: EmptySearchVerdict;
  constructor(verdict: EmptySearchVerdict) {
    super(verdict.message);
    this.name = "NoReferenceFoodError";
    this.verdict = verdict;
  }
}

/**
 * Searches USDA FoodData Central and maps the matches to FoodResults, folding in
 * any curated stand-in the query reaches (ADR-0046 §1) — a base ingredient no
 * reference table carries, pinned to one vetted OFF record. Throws if nothing
 * matched, so callers only handle the error path; an empty query returns [].
 *
 * An exact curated hit LEADS the list and a partial one TRAILS it, so the stand-in
 * is the answer for "cacao nibs" without displacing USDA's cocoa powder for the
 * broader "cocoa". USDA errors (missing key, quota, outage) still propagate
 * untouched: a curated entry needs no key, but silently succeeding on one query
 * while the rest of search is misconfigured would hide the real fault.
 *
 * The empty case throws a `NoReferenceFoodError` carrying `explainEmptySearch`'s
 * verdict, so the caller can say whether the food was filtered out or is simply
 * not covered.
 */
export async function searchUsdaFoods(query: string): Promise<FoodResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const curated = curatedMatches(trimmed);
  const { foods, matchedFoods } = await searchFdc(trimmed);
  const results = [
    ...curated.filter((m) => m.exact),
    ...foods.map((payload) => ({ payload, exact: false })),
    ...curated.filter((m) => !m.exact),
  ].map(({ payload }) => mapPayloadToFoodResult(payload));
  if (results.length === 0) {
    throw new NoReferenceFoodError(
      explainEmptySearch({ query: trimmed, matchedFoods })
    );
  }
  return results;
}
