/**
 * The nutrition panel — schema.org/NutritionInformation expressed as snake_case
 * EAVT (ADR-0021). Stored as a single atomic `nutrition/info` blob on every
 * food-bearing Digital Twin (USDA, Open Food Facts, custom, photo).
 *
 * A panel is one coherent reading: values are plain numbers in a unit fixed per
 * field (calories in kcal; every `*_content` in grams), and `serving_size`
 * states the basis they were measured against. Numbers rather than unit-strings
 * because derivation needs arithmetic; the unit is reattached only on
 * schema.org export. Every macro field is optional — an adapter populates only
 * the subset its source actually provides.
 */
export interface NutritionInfo {
  /** schema.org servingSize — the basis of these values, e.g. "100 g". */
  serving_size: string;
  /** schema.org calories (kcal). */
  calories?: number;
  /** schema.org proteinContent (g). */
  protein_content?: number;
  /** schema.org fatContent (g). */
  fat_content?: number;
  /** schema.org carbohydrateContent (g). */
  carbohydrate_content?: number;
  /** schema.org fiberContent (g). */
  fiber_content?: number;
  /** schema.org sugarContent (g). */
  sugar_content?: number;
  /** schema.org sodiumContent (g). */
  sodium_content?: number;
  /** schema.org saturatedFatContent (g). */
  saturated_fat_content?: number;
  /** schema.org transFatContent (g). */
  trans_fat_content?: number;
  /** schema.org unsaturatedFatContent (g) — mono + poly unsaturated, summed. */
  unsaturated_fat_content?: number;
  /** schema.org cholesterolContent (g). */
  cholesterol_content?: number;

  // ---- Micronutrients (ADR-0030) --------------------------------------------
  // The twelve US Nutrition-Facts label vitamins and minerals, elevated to
  // first-class optional panel keys. schema.org/NutritionInformation defines no
  // vitamin or mineral properties, so these are app extensions with no
  // schema.org counterpart — the panel stays a superset of NutritionInformation.
  // All stored in GRAMS, like every `*_content` field, keeping the panel
  // invariant (one fixed unit per field); the display layer reformats to mg/µg.
  /** App extension (no schema.org property): vitamin D, grams. */
  vitamin_d?: number;
  /** App extension (no schema.org property): calcium, grams. */
  calcium?: number;
  /** App extension (no schema.org property): iron, grams. */
  iron?: number;
  /** App extension (no schema.org property): potassium, grams. */
  potassium?: number;
  /** App extension (no schema.org property): vitamin A, grams. */
  vitamin_a?: number;
  /** App extension (no schema.org property): vitamin C, grams. */
  vitamin_c?: number;
  /** App extension (no schema.org property): vitamin E, grams. */
  vitamin_e?: number;
  /** App extension (no schema.org property): vitamin B6, grams. */
  vitamin_b6?: number;
  /** App extension (no schema.org property): vitamin B12, grams. */
  vitamin_b12?: number;
  /** App extension (no schema.org property): folate, grams. */
  folate?: number;
  /** App extension (no schema.org property): magnesium, grams. */
  magnesium?: number;
  /** App extension (no schema.org property): zinc, grams. */
  zinc?: number;
}

/** The EAVT attribute that holds a twin's nutrition panel. */
export const NUTRITION_INFO_ATTR = "nutrition/info";

/** The serving basis reputable sources (USDA, OFF) report macros against. */
export const PER_100G: string = "100 g";

/** The serving basis for foods entered as whole-serving totals (custom foods). */
export const PER_SERVING: string = "1 serving";

/**
 * The precision food values are *stored* at — calories, macro grams, and
 * logged/typed amounts alike. 3 dp, fine enough to log a food entered with
 * milligram-ish amounts (e.g. 0.125 g) without inventing precision a coarser
 * food doesn't have.
 */
export const FOOD_DECIMALS = 3;

/**
 * The precision food values are *shown* at — coarser than {@link FOOD_DECIMALS}
 * so derived sums and finely-logged values don't read as noise on screen. The
 * data keeps its full precision; this only trims what the view renders.
 */
export const FOOD_DISPLAY_DECIMALS = 2;

/**
 * Rounds `n` to `decimals` places, trimming the binary-float noise that summing
 * accumulates (0.6 + 0.6 -> 1.2000000000000002). Returns a number, so trailing
 * zeros never pad ("0.5", not "0.50") — decimals surface only when the value
 * genuinely has them. The shared body behind the two intent-named rounders
 * below; call those, not this, so each site reads as storage or display.
 */
function roundTo(n: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

/**
 * Rounds to the stored food precision ({@link FOOD_DECIMALS}). Use for anything
 * logged, summed, or round-tripped through an editor — nothing loses precision.
 */
export const roundFood = (n: number): number => roundTo(n, FOOD_DECIMALS);

/**
 * Rounds to the display precision ({@link FOOD_DISPLAY_DECIMALS}). View layer
 * only — using it on a value you then store would silently drop precision.
 */
export const roundFoodDisplay = (n: number): number =>
  roundTo(n, FOOD_DISPLAY_DECIMALS);

// ---------------------------------------------------------------------------
// Household portions (ADR-0030 §2)
// ---------------------------------------------------------------------------

/**
 * One household measure a food's source offers, e.g. "1 medium" -> 118 g. A
 * portion is a **labelled gram weight and nothing more** (ADR-0030 §2): it is
 * captured as source data on the twin (`food/portions`), not a nutrition
 * reading, and it **resolves to grams** at entry time rather than being
 * persisted as a separate reference unit. Picking one fills a gram amount; the
 * logged Consumption Event and recipe `ReferenceIngredient` still store grams,
 * so the `{ ref, amount, unit }` model and `deriveRecipeNutrition` are untouched.
 */
export interface Portion {
  /** Human-readable measure, e.g. "1 medium" or "1 cup, sliced". */
  label: string;
  /** How many of `unit` this portion is (usually 1). */
  amount: number;
  /** The unit the measure is expressed in, e.g. "medium", "cup, sliced". */
  unit: string;
  /** What this portion weighs, in grams — the value it resolves to. */
  grams: number;
}

/** The EAVT attribute that holds a food twin's ordered household portions. */
export const FOOD_PORTIONS_ATTR = "food/portions";

/**
 * Formats a portion's display label from its `amount` and `unit` — the fallback
 * a source uses when it offers no ready-made description (e.g. FDC's
 * `portionDescription` is empty). Collapses stray whitespace so "1  medium"
 * reads as "1 medium".
 */
export function formatPortionLabel(amount: number, unit: string): string {
  return `${amount} ${unit}`.replace(/\s+/g, " ").trim();
}

/**
 * Resolves the gram weight of a chosen portion out of a food's `food/portions`
 * list, scaled by how many of that portion the user wants (`quantity`, default
 * 1 — two "1 medium" bananas resolve to 236 g). This is the pure function the
 * amount picker (ticket #27) calls to turn a picked portion into the grams the
 * existing gram path already handles.
 *
 * Returns `undefined` — never a bogus number — when the list is missing or
 * empty, the chosen `label` isn't in it, or the matched portion's `grams` is
 * malformed (absent/`NaN`/infinite), so the caller can fall back to a raw gram
 * entry. Result is rounded to the stored food precision to shed float noise.
 */
export function resolvePortionGrams(
  portions: Portion[] | undefined,
  label: string,
  quantity: number = 1
): number | undefined {
  if (!portions?.length) return undefined;
  const chosen = portions.find((p) => p?.label === label);
  if (!chosen) return undefined;
  if (typeof chosen.grams !== "number" || !Number.isFinite(chosen.grams)) {
    return undefined;
  }
  if (!Number.isFinite(quantity)) return undefined;
  return roundFood(quantity * chosen.grams);
}

/**
 * One household portion prepared for the amount picker (ticket #27): the
 * resolved gram weight it fills in, the source `label` used to resolve it
 * ({@link resolvePortionGrams}), and the chip's display text (e.g.
 * "1 medium — 118 g"). A view model, not source data — it never touches the
 * ledger; the twin keeps its raw {@link Portion} list.
 */
export interface PortionPreset {
  /** The source portion's label, the key {@link resolvePortionGrams} matches. */
  label: string;
  /** The gram weight tapping this preset sets, rounded to stored precision. */
  grams: number;
  /** The chip text shown in the picker, e.g. "1 medium — 118 g". */
  display: string;
}

/**
 * Formats a portion chip's display text — its label plus the gram weight it
 * resolves to, e.g. "1 medium — 118 g". Grams are shown at the display
 * precision so a source's finely-weighed portion doesn't read as noise.
 */
export function formatPortionPreset(portion: Portion): string {
  return `${portion.label} — ${roundFoodDisplay(portion.grams)} g`;
}

/**
 * Maps a twin's `food/portions` to the presets the amount picker renders
 * alongside its numeric + slider control (ticket #27). The single place that
 * decides which portions surface as chips and how each reads: a portion is
 * dropped when its `grams` is absent or non-finite (it could not fill a valid
 * amount), and the kept ones carry the gram weight rounded to stored precision
 * so a tapped chip and {@link resolvePortionGrams} agree exactly. Returns an
 * empty list for a portion-less (or missing) food, so the picker renders as it
 * does today.
 */
export function portionPresets(
  portions: Portion[] | undefined
): PortionPreset[] {
  if (!portions?.length) return [];
  return portions
    .filter((p) => p && typeof p.grams === "number" && Number.isFinite(p.grams))
    .map((p) => ({
      label: p.label,
      grams: roundFood(p.grams),
      display: formatPortionPreset(p),
    }));
}

/** The four macros the food dashboard and recipe builder display and sum. */
export interface Macros {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * Reads the four display macros out of a nutrition panel, defaulting any field
 * the source omitted to 0. This is the single place the panel's schema.org
 * field names are mapped to the app's short macro names.
 */
export function macrosFromNutrition(info: NutritionInfo | undefined): Macros {
  return {
    calories: info?.calories ?? 0,
    protein: info?.protein_content ?? 0,
    fat: info?.fat_content ?? 0,
    carbs: info?.carbohydrate_content ?? 0,
  };
}

/**
 * Builds a nutrition panel from the four display macros against a serving basis
 * — the inverse of {@link macrosFromNutrition}. Used where a food is entered or
 * synthesised as whole-serving totals (custom foods, manual ingredients).
 */
export function nutritionFromMacros(
  macros: Macros,
  serving_size: string
): NutritionInfo {
  return {
    serving_size,
    calories: macros.calories,
    protein_content: macros.protein,
    fat_content: macros.fat,
    carbohydrate_content: macros.carbs,
  };
}
