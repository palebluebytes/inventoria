import type { EntityPayload } from "../ingestion/ingest";
import { searchUsdaCorpus } from "./usda-corpus";
import { curatedMatches } from "./curated-foods";
import { byFrecency, type Frecency } from "./frecency";
import { matchLedgerFoods, type LedgerFood } from "./ledger-foods";
import {
  macrosFromNutrition,
  nutritionFromMacros,
  NUTRITION_INFO_ATTR,
  PER_100G,
  type NutritionInfo,
} from "./nutrition";
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
  /**
   * The panel basis the four macros above are quoted against — `"100 g"` for a
   * searched reference food, `"100 ml"` for a drink OFF publishes by volume, a
   * weighed `"N g"` for a label-corrected twin. Carried on the row because a
   * list that prints a figure has to say what it is per, and a Recent row can
   * hold any of the three (#148). `"100 g"` when the food has no panel at all.
   */
  basis: string;
  payload: EntityPayload;
}

/**
 * Maps a food twin payload into the result shape both modals render, reading its
 * macros and the basis they are quoted against from the `nutrition/info` panel
 * (ADR-0021). A searched reference food is per 100 g, but a Recent row is any
 * ledger twin — a drink OFF published per 100 ml, or a label-corrected serving —
 * so the basis is carried rather than assumed (#148); every scaler reads it back
 * off the panel through `parseBasisQuantity`.
 */
export function mapPayloadToFoodResult(payload: EntityPayload): FoodResult {
  return foodResult(payload, nameOf(payload), panelOf(payload));
}

// ── Reading a twin ───────────────────────────────────────────────────────────
// `EntityPayload.attributes` is a `Record<string, any>`, so every read off it is
// the boundary `CODING_STANDARDS.md` §3.2 says to guard once rather than doubt
// repeatedly. These two are that one place, and they are also what makes "a twin
// that does not carry this" a first-class answer instead of an `undefined` that
// leaks past a field declared `string`.

/**
 * A twin's display name, or `""` where it carries none.
 *
 * A twin outside the `food/` namespace has no `food/name` at all, and that is
 * not hypothetical: a `recipe:` twin is reachable from the "Your foods" block
 * (ADR-0110 §2), and the `undefined` this used to yield rendered as a row with
 * nothing in it that was still selectable (#485). Narrowed here so the render
 * tail can ask a plain emptiness question (`searchList`) instead of re-doubting
 * the type.
 */
function nameOf(payload: EntityPayload): string {
  const name = payload.attributes["food/name"];
  return typeof name === "string" ? name : "";
}

/**
 * A twin's nutrition panel, or `undefined` where it carries none — a recipe,
 * whose figures derive from the ingredient twins rather than being stored
 * (ADR-0021), or a macro-only custom food.
 */
function panelOf(payload: EntityPayload): NutritionInfo | undefined {
  return payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
}

/**
 * The display shape, given the two things that decide it: what to call the food,
 * and the reading its figures are quoted against. Both mappers below end here,
 * so each is one line naming only the thing it answers differently.
 */
function foodResult(
  payload: EntityPayload,
  name: string,
  panel: NutritionInfo | undefined
): FoodResult {
  return {
    entity: payload.entity,
    name,
    ...macrosFromNutrition(panel),
    basis: panel?.serving_size ?? PER_100G,
    payload,
  };
}

/**
 * Maps one food from THIS device's ledger into the same display shape, reading
 * what the payload mapper above cannot see: the log the row was matched on.
 *
 * The "Your foods" block resolves its rows from two things, and needed both
 * (#485). `mapPayloadToFoodResult` takes only the twin, so it could answer for
 * a `recipe:` target only by reading attributes a recipe does not carry —
 * `food/name` and `nutrition/info` — which is how a logged recipe became a
 * nameless row of zeros. The fix is a second seam rather than a namespace test
 * inside the first: what a ledger food knows extra is its LOG, and that is a
 * parameter, not a branch.
 *
 * - **The name is the log's**, which is also the string the query matched
 *   (`matchLedgerFoods`). A row that printed the twin's name could disagree
 *   with what was typed to reach it.
 * - **The reading is the twin's panel where it has one.** That is the reusable
 *   figure, quoted against its own basis, and every scaler downstream divides
 *   by it (#148). One occasion's frozen portion is not a substitute for it.
 * - **Otherwise it is what that occasion froze**, against the quantity it was
 *   logged at. A recipe stores no nutrition by design (ADR-0021) — its figures
 *   derive from the ingredient twins — so the honest number for it is the one
 *   the cook's own log recorded.
 *
 * The frozen reading is **never written onto the payload**, which is why it is
 * assembled here and discarded. The staged payload is what the host ingests on
 * commit (`ingestEntity`), so a synthesised `nutrition/info` would append a
 * nutrition panel to the recipe twin and contradict ADR-0021 by the back door.
 */
export function mapLedgerFoodToResult(
  food: LedgerFood,
  payload: EntityPayload
): FoodResult {
  return foodResult(
    payload,
    food.name,
    panelOf(payload) ?? frozenReading(food)
  );
}

/**
 * The reading one logged occasion froze, read back as a panel: `event/metrics`
 * against the `event/quantity` they were scaled to (ADR-0022), through the
 * documented inverse of the reader above it.
 *
 * Both halves or neither. A breakdown whose basis is missing is a figure with
 * no "per", and quoting it against the per-100 g fallback would state a
 * portion's calories as a reference food's.
 */
function frozenReading(food: LedgerFood): NutritionInfo | undefined {
  if (!food.metrics || !food.quantity) return undefined;
  return nutritionFromMacros(food.metrics, food.quantity);
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
 * - A **measured** log — grams or millilitres — always qualifies
 *   (searched/scanned foods, unchanged).
 * - A **whole-serving** log qualifies **only** when it is a reusable `menu`
 *   manual entry. A `quick_estimate` / `plate_estimate` one-off and a legacy
 *   custom stay out — they re-open via the edit path, never as a catalogue food.
 *   The decision keys off `food/manual_entry.kind` alone.
 *
 * A label capture is no longer among the whole-serving logs, and so no longer
 * stays out: it is recorded against its panel's own basis — "100g", "100ml" —
 * and qualifies on the first clause like any other scanned food (ADR-0060's
 * 2026-08-31 Amendments; ADR-0035's own amendment records the change). The rule
 * here is untouched; what changed is which side of it a capture falls on.
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
 * A finished reference-food search: the rows the user sees, and whether the
 * Vocabulary map is what reached them.
 *
 * The flag is here rather than derived by the caller because only the search
 * knows it — a rescued row arrives with the key folded into its name, and
 * nothing downstream can tell that from a food that was simply called that.
 * #149's search log is its one reader (ADR-0053 §3).
 */
export interface ReferenceFoodSearch {
  results: FoodResult[];
  rescued_by_vocabulary: boolean;
  /**
   * The foods from this device's own ledger that the query reached, best first
   * (#320), UNRESOLVED.
   *
   * Handed back as ledger foods rather than as `FoodResult`s because turning one
   * into a result means fetching its twin, and a fold may not do I/O
   * (`CODING_STANDARDS.md` §2.1). The caller already holds a twin cache for the
   * Recent list and resolves these through the same one, so a food shown in both
   * places is fetched once.
   *
   * They belong ABOVE `results` when rendered — #320's "shape" question, decided
   * as a pinned block rather than as interleaving. An OFF or hand-typed name is
   * not `Food, qualifier` shaped, so the corpus's ten name keys read it as noise
   * rather than ranking it; interleaving would sort your foods by a grammar they
   * do not have. Pinning also says the true thing, which is that a food you have
   * eaten before is a different kind of answer from a reference row.
   */
  your_foods: LedgerFood[];
}

/**
 * What this device already knows, for a search to read beside the corpus.
 *
 * Passed in rather than fetched, because both halves are folds over the
 * consumption store the caller already holds and a search that reached for a
 * store could not be tested without one (`CODING_STANDARDS.md` §2.1). Absent on
 * a caller with no ledger in hand, which is what every existing test and every
 * script relies on.
 */
export interface SearchContext {
  /** Every food already logged here that the corpus does not carry. */
  ledgerFoods?: readonly LedgerFood[];
  /** How recently and how often each entity has been logged (#165). */
  frecency?: ReadonlyMap<string, Frecency>;
}

/**
 * Searches the bundled USDA corpus and maps the matches to FoodResults, folding
 * in any curated stand-in the search reaches (ADR-0046 §1) — a base ingredient no
 * reference table carries, pinned to one vetted OFF record. Throws if nothing
 * matched, so callers only handle the error path; an empty query returns no rows.
 *
 * An exact curated hit LEADS the list and a partial one TRAILS it, so the stand-in
 * is the answer for "cacao nibs" without displacing USDA's cocoa powder for the
 * broader "cocoa".
 *
 * No key, no quota and no network (ADR-0047 §1): the corpus is a committed
 * artifact precached at install, so this answers on a plane and on a cold
 * offline install alike.
 */
export async function searchUsdaFoods(
  query: string,
  context: SearchContext = {}
): Promise<ReferenceFoodSearch> {
  const trimmed = query.trim();
  if (!trimmed)
    return { results: [], rescued_by_vocabulary: false, your_foods: [] };
  const frecency = context.frecency ?? new Map();
  // The phrases come back with the foods because the curated table reads them
  // too (ADR-0049 §6): what was typed, plus the vocabulary's expansions of it
  // where what was typed reached no reference food at all.
  const { phrases, foods, rescued_by_vocabulary } = await searchUsdaCorpus(
    trimmed,
    undefined,
    frecency
  );
  const curated = curatedMatches(phrases);
  // The same phrases again, for ADR-0049 §6's reason: three tables reading one
  // typed query must not disagree about what was typed.
  const curatedEntities = new Set(curated.map((m) => m.payload.entity));
  const yours = matchLedgerFoods(context.ledgerFoods ?? [], phrases)
    // A curated stand-in you have logged is already about to be shown as the
    // stand-in, under its disclosure (ADR-0046 §5). Showing it twice would make
    // the disclosure optional.
    .filter((food) => !curatedEntities.has(food.target))
    .sort(byFrecency(frecency, (food) => food.target));
  const results = [
    ...curated.filter((m) => m.exact).map((m) => m.payload),
    ...foods,
    ...curated.filter((m) => !m.exact).map((m) => m.payload),
  ].map(mapPayloadToFoodResult);
  // A query that reached only your own foods still answered. Throwing here would
  // send the caller down the "no food found" path for a search that found one,
  // and would record a vocabulary miss that did not happen (ADR-0053 §3).
  if (results.length === 0 && yours.length === 0)
    throw new NoReferenceFoodError();
  // A curated stand-in answering a query the corpus could not is not a rescue:
  // the flag says the VOCABULARY answered, and the two tables are deliberately
  // separate mechanisms (ADR-0049 §6).
  return { results, rescued_by_vocabulary, your_foods: yours };
}
