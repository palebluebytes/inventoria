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
 * The basis a drink's panel is measured against. Open Food Facts publishes a
 * liquid's `*_100g` nutriments per 100 **millilitres**, and says so through
 * `product_quantity_unit` rather than through `nutrition_data_per` (whose enum
 * holds only `serving` and `100g`) — so a drink read from OFF carries this
 * basis, stated as published. It is never converted to a gram basis: rescaling
 * a panel by an assumed density would compute one measurement from another,
 * which ADR-0048 §3 forbids (ADR-0052).
 */
export const PER_100ML: string = "100 ml";

/**
 * A unit an amount is *measured* in, scaled against its panel's basis — a gram
 * weight or a millilitre volume. Never converted between the two: no density is
 * applied at entry, at logging, at scaling, or on display (ADR-0060 §2).
 */
export type MeasuredUnit = "g" | "ml";

/**
 * The unit an amount is expressed in: a measurement against the panel's basis,
 * or a count of whole servings for a food whose panel is a per-serving total.
 *
 * It is the persisted shape — held on `recipe/ingredients` and on the frozen
 * `event/instantiation` rows, and re-read out of `event/quantity` by
 * `parseLoggedQuantity` — so it stays a plain string union rather than a
 * discriminated object, which would be a ledger migration (ADR-0060 §5). The
 * Recent/Search catalogue rule keys off it (`isCatalogueFood`, ADR-0035 §6).
 */
export type AmountUnit = MeasuredUnit | "serving";

/**
 * True when an amount in `unit` is a measurement to be divided by its panel's
 * basis, as opposed to a count of whole servings.
 *
 * This is what five hand-written `=== "g"` ternaries were really asking, and
 * spelling it as a gram check is what made the millilitre a lurking bug rather
 * than a one-line change (ADR-0060 §5): widen the union without routing
 * `deriveRecipeNutrition`'s factor through here and 330 ml silently means 330
 * servings. Every scaler, unit label and amount-edit gate asks this instead.
 */
export function isMeasuredUnit(unit: AmountUnit): unit is MeasuredUnit {
  return unit !== "serving";
}

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
 * Rounds to the display precision. View layer only — using it on a value you
 * then store would silently drop precision. Defaults to {@link
 * FOOD_DISPLAY_DECIMALS}; callers pass `0` when the user has opted into
 * whole-number nutrition display (`settings/food/round_nutrition`), so the same fold
 * drives both modes and storage precision is untouched.
 */
export const roundFoodDisplay = (
  n: number,
  decimals: number = FOOD_DISPLAY_DECIMALS
): number => roundTo(n, decimals);

/**
 * The non-headline nutrients (fibre/sugar/sodium and the micronutrients) live in
 * grams, but micronutrients sit at milligram/microgram magnitudes — iron ≈
 * 2.6e-4 g, vitamins ≈ 1e-6 g — so the 3-dp {@link FOOD_DECIMALS} precision the
 * four macros use would round them to zero (iron would read "0 mg"). They are
 * instead rounded at this far finer precision: fine enough to keep a microgram,
 * still trimming binary-float noise. Gram-scale extras are unaffected.
 */
const MICRONUTRIENT_DECIMALS = 9;
export const roundExtraNutrient = (n: number): number =>
  roundTo(n, MICRONUTRIENT_DECIMALS);

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
 * True when a portion label carries no household meaning beyond a bare weight —
 * "30 g", "30g", "30 grams", or just "30". A household portion is meant to name
 * a unit ("1 slice", "1 biscuit"); a label that only restates the grams column
 * is uninformative — {@link formatPortionPreset} collapses its chip from
 * "30 g — 30 g" to "30 g", and the capture form flags the row so the user can
 * give it a real name. Blank labels are not flagged (they're simply incomplete).
 */
export function portionLabelIsBareWeight(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (t === "") return false;
  return /^\d+(?:\.\d+)?\s*(?:g|gram|grams)?$/.test(t);
}

/**
 * Formats a portion chip's display text — its label plus the gram weight it
 * resolves to, e.g. "1 medium — 118 g". Grams are shown at the display
 * precision so a source's finely-weighed portion doesn't read as noise.
 *
 * When the label is *itself* the resolved gram weight — as with an OFF serving
 * size of "30 g" ({@link offPortions}) — the ` — N g` suffix would just repeat
 * it ("30 g — 30 g"), so it's dropped and the chip reads plainly ("30 g").
 */
export function formatPortionPreset(portion: Portion): string {
  const grams = roundFoodDisplay(portion.grams);
  // Normalise "30g" / "30 g" / " 30 G " to compare against the resolved weight.
  const bare = portion.label.trim().toLowerCase().replace(/\s+/g, "");
  if (bare === `${grams}g`) return portion.label.trim();
  return `${portion.label} — ${grams} g`;
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

/**
 * The gram weight a panel's `serving_size` names, or `null` when it names no
 * concrete weight. Unlike {@link parseBasisQuantity} (which falls back to 100 so a
 * scaler always has a divisor), this returns `null` for every basis sentinel
 * that carries no household serving: the two per-100 reference bases
 * ({@link PER_100G}, {@link PER_100ML}) and a bare "1 serving" of unknown weight
 * ({@link PER_SERVING}, which parses to `NaN`). So it answers a different question
 * — "does this food weigh a known amount per serving?" — used to decide whether a
 * serving is surfaceable at all.
 */
export function servingSizeGrams(serving_size: string): number | null {
  const t = serving_size.trim();
  // The per-100 g reference basis names no household serving.
  if (t === PER_100G) return null;
  // Require an explicit gram weight ("30 g", "30g") — never a bare "1 serving"
  // (unknown weight, which parseFloat would misread as 1 g), nor a non-gram unit
  // ("240 ml"). resolveServingSize only ever emits "100 g" / "N g" / "1 serving".
  if (!/^\d+(?:\.\d+)?\s*g(?:rams?)?$/i.test(t)) return null;
  const grams = parseFloat(t);
  return Number.isFinite(grams) && grams > 0 ? roundFood(grams) : null;
}

/**
 * Synthesises the food's own serving as a picker portion — "1 serving" resolving
 * to the grams its `serving_size` names — so a label-captured food (basis
 * `per_serving`, e.g. `serving_size: "30 g"`) surfaces its serving as a chip on
 * the amount screen just like a source's household portions do. Returns an empty
 * list (never a zero-gram portion) for a per-100 g food or a weightless
 * "1 serving" panel, so the caller can concatenate it unconditionally.
 */
export function servingSizePortion(info: NutritionInfo | undefined): Portion[] {
  const grams = info ? servingSizeGrams(info.serving_size) : null;
  if (grams == null) return [];
  return [{ label: "1 serving", amount: 1, unit: "serving", grams }];
}

/** Matches a basis that names a quantity we can divide by: "100 g", "250 ml". */
const BASIS_QUANTITY = /^(\d+(?:\.\d+)?)\s*(g(?:rams?)?|ml)$/i;

/**
 * The quantity a panel's `serving_size` measures against — 100 for `"100 g"` and
 * for `"100 ml"`, 30 for a `"30 g"` label serving. **The one divisor** behind
 * every "scale this panel to the amount in front of me": the recipe derivation,
 * the amount panel's live preview, the staged card's button, and the log itself.
 *
 * Deliberately quantity, not grams. A per-100 ml drink panel divides by its own
 * 100 like any other basis; the millilitres are carried, never converted to a
 * weight, because rescaling a published panel by an assumed density computes a
 * measurement from another one (ADR-0048 §3, ADR-0052). What that leaves is a
 * residual: a user who typed a gram weight against a volume basis is off by the
 * density, disclosed by the basis rather than hidden by a conversion.
 *
 * Unlike {@link servingSizeGrams} — which answers "does one serving weigh a known
 * amount?" and returns `null` when it does not — this always yields a usable
 * divisor, falling back to 100 (the basis reputable sources report against) for
 * any string naming no quantity. `"1 serving"` is such a string: its weight is
 * unknown, so it takes the fallback rather than the `1` a bare `parseFloat` finds
 * in it, which would have scaled a whole-serving panel by the gram count.
 */
/**
 * True for a basis measured against 100 of the food's own unit, whichever unit
 * that is. The one place the two per-100 sentinels are named together, so a
 * caller asking "is this a per-100 panel?" cannot answer it for only one of them
 * — which is how a drink would slip into the per-serving branch (ADR-0052 §3).
 */
export function isPer100Basis(serving_size: string | undefined): boolean {
  return serving_size === PER_100G || serving_size === PER_100ML;
}

export function parseBasisQuantity(serving_size: string | undefined): number {
  const match = BASIS_QUANTITY.exec((serving_size ?? "").trim());
  const quantity = match ? Number(match[1]) : NaN;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 100;
}

/**
 * The unit a panel's amounts are entered and logged in: millilitres for a volume
 * basis, grams for everything else (ADR-0060 §1). The sibling of
 * {@link parseBasisQuantity} — one reads the basis's number, this one its unit —
 * so the two can never disagree about the same string.
 *
 * Grams is the fallback rather than an error, matching that sibling's own
 * fallback to 100: a weightless `"1 serving"` and a food carrying no panel at
 * all name no unit, and both are entered in grams. Nothing here converts; the
 * unit is read off the panel exactly as the source published it (§2).
 */
export function basisUnit(serving_size: string | undefined): MeasuredUnit {
  const match = BASIS_QUANTITY.exec((serving_size ?? "").trim());
  return match ? measuredUnitFrom(match[2]) : "g";
}

/**
 * The unit a matched unit token names. Two regexes read a unit off a string — a
 * panel's basis ({@link basisUnit}) and a logged quantity
 * (`parseLoggedQuantity`) — and this is the one narrowing behind both, so they
 * cannot come to different conclusions about the same "ml", and the next unit is
 * added here once rather than in each of them.
 */
export function measuredUnitFrom(token: string): MeasuredUnit {
  return token.trim().toLowerCase() === "ml" ? "ml" : "g";
}

/**
 * A measured unit spelled out, for a control that names what it takes ("Amount
 * (millilitres)") rather than suffixing a value with it. The long-form sibling
 * of `unitLabel`, which gives the short `g` / `ml` that rides beside a number.
 */
export function measuredUnitName(unit: MeasuredUnit): string {
  return unit === "ml" ? "millilitres" : "grams";
}

/** Where an amount control opens, and where its slider stops (ADR-0060 §3). */
export interface AmountDefaults {
  /** The amount a freshly staged food is entered at. */
  amount: number;
  /** The top of the slider's skim range; a typed amount may exceed it. */
  sliderMax: number;
}

/**
 * The amount control's starting point, which follows the unit it is entered in.
 * 100 g over a 500 g slider is the weighed food's range as it always was; a
 * drink opens at a glass and stops below a litre, because 100 ml is half a glass
 * and a 500 ml ceiling would put a carton out of the slider's reach.
 *
 * Held here rather than as literals on the control so the two numbers that
 * belong to a unit are named together, and so the staging screen (which seeds
 * the amount) and the control (which draws the slider) cannot pick different
 * ones.
 */
export function amountDefaults(unit: MeasuredUnit): AmountDefaults {
  return unit === "ml"
    ? { amount: 250, sliderMax: 1000 }
    : { amount: 100, sliderMax: 500 };
}

/**
 * What the panel's figures are measured per, as a caption: `Per 100 g`,
 * `Per 100 ml`, `Per serving (30 g)`, `Per serving`.
 *
 * A different question from the one the amount control answers — that names the
 * unit you are typing in, this names the divisor the figures below it come from
 * — and the two coincide only on a per-100 panel (ADR-0060 §3). A label-captured
 * food with a `"30 g"` basis divides by 30, which nothing on screen said before.
 *
 * A bare `"1 serving"` gets no weight: {@link parseBasisQuantity} divides it by
 * 100 as a last resort, and that fallback is not a fact about the food, so
 * printing it would show a number the source never gave. `null` for a food that
 * names no basis at all — it renders no caption, as it renders no preview.
 *
 * Both halves are re-spelled from the one match rather than echoed, so `"30g"`,
 * `"30 grams"` and `"100g"` caption exactly as their spaced forms do. Reading
 * them off that match is also why this does not simply call
 * {@link parseBasisQuantity} and {@link basisUnit}: a basis naming a zero
 * quantity would take the former's 100 fallback and caption a number the source
 * never gave, which is the one thing this function exists not to do.
 */
export function basisCaption(serving_size: string | undefined): string | null {
  const basis = (serving_size ?? "").trim();
  if (basis === "") return null;
  const match = BASIS_QUANTITY.exec(basis);
  if (!match) return "Per serving";
  const quantity = Number(match[1]);
  if (quantity <= 0) return "Per serving";
  const unit = measuredUnitFrom(match[2]);
  return quantity === 100
    ? `Per ${quantity} ${unit}`
    : `Per serving (${quantity} ${unit})`;
}

/** The four macros the food dashboard and recipe builder display and sum. */
export interface Macros {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * True when a panel reports no energy at all — an **absent** measurement, which
 * is not a zero (ADR-0048 §1). A panel carrying `calories: 0` is asserting a
 * measurement and is not this: tap water, iodised salt and decaffeinated tea all
 * genuinely contain no calories, and each of them answers `false` here.
 *
 * This is the **one** expression of that question in the app, and it has two
 * askers on purpose (ADR-0048 §6): the food card, deciding whether a log would be
 * honest, and `scripts/usda-bundle.mjs`, deciding whether a corpus row ships —
 * the latter through {@link fdcReportsNoEnergy}, which is written in terms of this
 * one so the two can never disagree about what "no energy" means. A second
 * expression of it, anywhere, is the drift ADR-0047 §4's import-don't-copy rule
 * exists to prevent, and it would be silent.
 *
 * A panel-less food answers `true`: it logs the same silent zero a calorie-less
 * panel does, and the card has no more honest thing to say about it.
 */
export function reportsNoEnergy(info: NutritionInfo | undefined): boolean {
  return !Number.isFinite(info?.calories);
}

/**
 * Reads the four display macros out of a nutrition panel, defaulting any field
 * the source omitted to 0. This is the single place the panel's schema.org
 * field names are mapped to the app's short macro names.
 *
 * The `?? 0` stays, deliberately (ADR-0048 §1): this is the display and
 * arithmetic path, where every consumer — meters, rings, day totals — already
 * expects a number, and where a zero is the right thing to render. The absent-
 * versus-measured distinction lives one level up in the panel, and is asked
 * there with {@link reportsNoEnergy}.
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

// ---------------------------------------------------------------------------
// Full frozen breakdown (ADR-0030 / #28)
// ---------------------------------------------------------------------------

/**
 * The nutrients a Consumption Event freezes *beyond* the four headline macros —
 * every {@link NutritionInfo} panel field except `serving_size` and the four
 * macros (which are the headline `{ calories, protein, fat, carbs }`). Kept under
 * their **panel names** so no key is duplicated (`protein` is the headline;
 * `protein_content` never appears). This is the list every scale/sum helper walks
 * so a new panel nutrient is carried through the whole freeze path by adding it
 * here once.
 */
export const EXTRA_NUTRIENT_KEYS = [
  "fiber_content",
  "sugar_content",
  "sodium_content",
  "saturated_fat_content",
  "trans_fat_content",
  "unsaturated_fat_content",
  "cholesterol_content",
  "vitamin_d",
  "calcium",
  "iron",
  "potassium",
  "vitamin_a",
  "vitamin_c",
  "vitamin_e",
  "vitamin_b6",
  "vitamin_b12",
  "folate",
  "magnesium",
  "zinc",
] as const;

/** A single extra (non-headline) nutrient key — a panel name, see {@link EXTRA_NUTRIENT_KEYS}. */
export type ExtraNutrientKey = (typeof EXTRA_NUTRIENT_KEYS)[number];

/**
 * The extra nutrients carried alongside the headline macros on a frozen snapshot
 * — present only for nutrients the food actually reported. A key is **absent
 * (undefined), never 0**, for a nutrient the source omitted, so a total can tell
 * "zero grams" from "never measured" (ADR-0030 / #28).
 */
export type NutritionExtras = Partial<Record<ExtraNutrientKey, number>>;

/**
 * A fully frozen nutrition breakdown: the four headline macros (always present,
 * defaulted to 0 like {@link macrosFromNutrition}) plus every extra nutrient the
 * food carried, scaled to the amount logged. This is the widened shape of a
 * Consumption Event's `event/metrics` and of each `event/instantiation` row
 * (ADR-0022 amended by ADR-0030 / #28) — backward-compatible with the four-key
 * headline: a food that reported only macros yields exactly `{ calories, protein,
 * fat, carbs }`.
 */
export interface NutritionBreakdown extends Macros, NutritionExtras {}

/**
 * Scales every nutrient a panel carries by `factor` — the pure "scale a panel by
 * a factor" mechanic behind logging a food and deriving a recipe row. Returns the
 * four headline macros (via {@link macrosFromNutrition}, so an omitted macro is 0)
 * plus only the extra nutrients the panel actually reported: a nutrient the source
 * omitted stays **absent, never invented as 0** (ADR-0030 / #28) — a food that
 * reports no iron must not claim `iron: 0`. Each field is rounded to the stored food
 * precision ({@link roundFood}) so this contribution is round-then-sum ready — the
 * same discipline `deriveRecipeNutrition` already applies to macros.
 */
export function scaleNutrition(
  info: NutritionInfo | undefined,
  factor: number
): NutritionBreakdown {
  const macros = macrosFromNutrition(info);
  const breakdown: NutritionBreakdown = {
    calories: roundFood(macros.calories * factor),
    protein: roundFood(macros.protein * factor),
    fat: roundFood(macros.fat * factor),
    carbs: roundFood(macros.carbs * factor),
  };
  for (const key of EXTRA_NUTRIENT_KEYS) {
    const v = info?.[key];
    if (typeof v === "number") breakdown[key] = roundExtraNutrient(v * factor);
  }
  return breakdown;
}

/**
 * Sums a list of frozen breakdowns into one total — the pure "sum breakdowns"
 * mechanic behind a day (or meal) total. Every nutrient present in **any**
 * breakdown is totalled with round-then-sum (each already rounded, the sum
 * rounded again to shed float noise), so a total matches the displayed rows. A
 * nutrient **no** breakdown froze stays absent, never fabricated as 0, so a
 * macro-only breakdown (a custom food with no source panel) contributes only its
 * macros and never invents a zero fibre/micronutrient (ADR-0030 / #28). The four
 * headline macros are always present (defaulting a missing one to 0).
 */
export function sumNutrition(
  breakdowns: NutritionBreakdown[]
): NutritionBreakdown {
  const total: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const extras: Record<string, number> = {};
  for (const b of breakdowns) {
    total.calories += b.calories ?? 0;
    total.protein += b.protein ?? 0;
    total.fat += b.fat ?? 0;
    total.carbs += b.carbs ?? 0;
    for (const key of EXTRA_NUTRIENT_KEYS) {
      const v = b[key];
      if (typeof v === "number") extras[key] = (extras[key] ?? 0) + v;
    }
  }
  const result: NutritionBreakdown = {
    calories: roundFood(total.calories),
    protein: roundFood(total.protein),
    fat: roundFood(total.fat),
    carbs: roundFood(total.carbs),
  };
  for (const key of EXTRA_NUTRIENT_KEYS) {
    if (key in extras) result[key] = roundExtraNutrient(extras[key]);
  }
  return result;
}
