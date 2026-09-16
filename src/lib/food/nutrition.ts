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
import { isBareMagnitude } from "./serving-size";

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
 * whole-number nutrition display (`roundNutritionPref`), so the same fold
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
 * One household measure a food's source offers, e.g. "1 medium" -> 118 g, or a
 * can's "1 can (330 ml)" -> 330 ml. A portion is a **labelled magnitude in one
 * measured unit and nothing more** (ADR-0030 §2, widened by ADR-0060 §6): it is
 * captured as source data on the twin (`food/portions`), not a nutrition
 * reading, and it resolves at entry time to an amount in the unit its own
 * magnitude is stated in. Picking one fills the amount field; the logged
 * Consumption Event and recipe `ReferenceIngredient` store that amount with the
 * unit beside it, as they do for a typed one.
 *
 * `grams` and `millilitres` are siblings and **exactly one of them is present**.
 * Read the pair through {@link portionMeasure} rather than field by field, so no
 * caller has to know which of the two a given source filled in.
 *
 * The millilitre field is a sibling rather than a widened `grams` deliberately
 * (ADR-0060 §6): it degrades in the safe direction, because a reader that knows
 * only `grams` sees no portion at all for a drink — which is exactly what every
 * reader saw before this field existed. A `grams` that sometimes held
 * millilitres would instead hand each of them a volume to go on treating as a
 * weight, and no migration would be needed for that either.
 */
export interface Portion {
  /** Human-readable measure, e.g. "1 medium" or "1 cup, sliced". */
  label: string;
  /** How many of `unit` this portion is (usually 1). */
  amount: number;
  /** The unit the measure is expressed in, e.g. "medium", "cup, sliced". */
  unit: string;
  /** What this portion weighs, in grams. Absent on a volume portion. */
  grams?: number;
  /** What this portion measures, in millilitres. Absent on a weight portion. */
  millilitres?: number;
}

/** The amount a {@link Portion} resolves to, in the unit that amount is in. */
export interface PortionMeasure {
  /** The magnitude, as the source stated it (unrounded). */
  amount: number;
  /** The unit that magnitude is in — which of the two sibling fields held it. */
  unit: MeasuredUnit;
}

/**
 * What a portion resolves to: its magnitude and the unit that magnitude is in.
 * **The one reader of `Portion`'s exactly-one-of pair** (ADR-0060 §6) — the
 * picker's chips, the chip text, the resolver behind a tap and the dedupe all
 * ask this, so none of them can conclude that a 330 ml can weighs 330 g by
 * reading the field it happens to know about.
 *
 * `null` — never a bogus number — for a portion carrying neither magnitude, or
 * one whose magnitude is absent, `NaN` or infinite. Callers drop such a portion
 * rather than filling an amount from it; `food/portions` is source data and a
 * source may publish a row we cannot use.
 *
 * `grams` is asked first, so a malformed row that broke the invariant by
 * carrying both reads exactly as it did before the sibling existed.
 */
export function portionMeasure(
  portion: Portion | undefined
): PortionMeasure | null {
  const grams = portion?.grams;
  if (typeof grams === "number" && Number.isFinite(grams)) {
    return { amount: grams, unit: "g" };
  }
  const millilitres = portion?.millilitres;
  if (typeof millilitres === "number" && Number.isFinite(millilitres)) {
    return { amount: millilitres, unit: "ml" };
  }
  return null;
}

/**
 * A magnitude and its unit as the exactly-one-of pair a {@link Portion} stores —
 * the **one writer** of that pair, and the mirror of {@link portionMeasure},
 * which is its one reader. A caller spreads the result into the portion it is
 * building, so no source has to decide for itself which of the two field names
 * a millilitre goes in.
 *
 * An absent or unusable magnitude writes **neither** field, which is what makes
 * it safe for a form: absent is not zero (#28, ADR-0030), and a portion carrying
 * a real `0` reads back through `portionMeasure` as a genuine magnitude of
 * nothing — a chip the picker offers and that fills nothing when tapped.
 */
export function portionMagnitude(
  amount: number | undefined,
  unit: MeasuredUnit
): Pick<Portion, "grams" | "millilitres"> {
  if (amount === undefined || !Number.isFinite(amount)) return {};
  return unit === "ml" ? { millilitres: amount } : { grams: amount };
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
 * Resolves the amount a chosen portion fills in, out of a food's `food/portions`
 * list, scaled by how many of that portion the user wants (`quantity`, default
 * 1 — two "1 medium" bananas resolve to 236 g). This is the pure function the
 * amount picker (ticket #27) calls to turn a picked portion into the number its
 * field takes.
 *
 * `unit` is the unit the field is entered in. A portion stated in the OTHER one
 * used to be no match at all, because handing back a 100 g serving for a
 * millilitre field would be a density conversion performed silently at ratio 1
 * (ADR-0060 §2/§6). On a food carrying a Density Class it is neither silent nor
 * at ratio 1, so `gPerMl` — the figure that class resolves to — lets such a
 * portion match after all (ADR-0108 §8). Without one §6 stands exactly as
 * written and the portion is refused.
 *
 * **An exact-unit match always wins.** A source may publish two servings of one
 * name, and the one to fill in is the one stated in the unit the field holds,
 * measured rather than converted. Only when no exact match exists does a
 * converted one answer, which is also why this scans the whole list twice rather
 * than returning the first label hit.
 *
 * Returns `undefined` — never a bogus number — when the list is missing or
 * empty, no portion matches `label`, the matched portion carries no usable
 * magnitude ({@link portionMeasure}), or it is stated in the other unit on a
 * food with nothing to convert by. Result is rounded to the stored food
 * precision to shed float noise.
 */
export function resolvePortionAmount(
  portions: Portion[] | undefined,
  label: string,
  unit: MeasuredUnit,
  quantity: number = 1,
  gPerMl?: number
): number | undefined {
  if (!portions?.length) return undefined;
  if (!Number.isFinite(quantity)) return undefined;
  let converted: number | undefined;
  for (const portion of portions) {
    if (portion?.label !== label) continue;
    const measure = portionMeasure(portion);
    if (!measure) continue;
    if (measure.unit === unit) return roundFood(quantity * measure.amount);
    if (converted !== undefined) continue;
    const across = convertMeasured(measure.amount, measure.unit, unit, gPerMl);
    if (across !== undefined) converted = roundFood(quantity * across);
  }
  return converted;
}

/**
 * One household portion prepared for the amount picker (ticket #27): the
 * resolved amount it fills in, the source `label` used to resolve it
 * ({@link resolvePortionAmount}), and the chip's display text (e.g.
 * "1 medium — 118 g"). A view model, not source data — it never touches the
 * ledger; the twin keeps its raw {@link Portion} list.
 *
 * The amount carries no unit of its own: every preset in a list is in the unit
 * that list was built for, which is the field's own unit ({@link portionPresets}).
 */
export interface PortionPreset {
  /** The source portion's label, the key {@link resolvePortionAmount} matches. */
  label: string;
  /** The amount tapping this preset sets, rounded to stored precision. */
  amount: number;
  /** The chip text shown in the picker, e.g. "1 medium — 118 g". */
  display: string;
}

/**
 * True when a portion label carries no household meaning beyond a bare amount —
 * "30 g", "30g", "30 grams", "330 ml", "1 litre", or just "30". A household
 * portion is meant to name a unit ("1 slice", "1 biscuit"); a label that only
 * restates the amount column is uninformative — {@link formatPortionPreset}
 * collapses its chip from "30 g — 30 g" to "30 g", and the capture form flags
 * the row so the user can give it a real name. Blank labels are not flagged
 * (they're simply incomplete).
 *
 * It was weights-only until #460, on a stated ground: it is asked of the capture
 * form's typed rows, and those were "a label and a grams box". That row carries
 * a unit now, so the ground is spent and the narrowing with it — a rule
 * outliving its reason is how the next reader gets misled.
 *
 * The unit vocabulary is `serving-size.ts`'s own rather than a list written
 * here: it is the one this app already reads OFF's servings with, in every
 * language OFF spells them, and a second copy would be a narrower duplicate of
 * the thing #139/#141 built.
 *
 * The check is deliberately unit-AGNOSTIC rather than asked against the row's
 * own unit: "330 ml" is no more a portion name in a gram row than in a
 * millilitre one, and pairing the two would only add a way to miss it. It is
 * still a different question from {@link formatPortionPreset}'s collapse — that
 * one asks whether a label equals the amount a portion actually RESOLVES to.
 */
export function portionLabelIsBareAmount(label: string): boolean {
  return isBareMagnitude(label);
}

/**
 * Formats a portion chip's display text — its label plus the amount it resolves
 * to and the unit that amount is in, e.g. "1 medium — 118 g" or
 * "1 can — 330 ml". The magnitude is shown at the display precision so a
 * source's finely-weighed portion doesn't read as noise.
 *
 * When the label is *itself* the resolved amount — as with an OFF serving size
 * of "30 g" or "330 ml" ({@link offPortions}) — the ` — N g` suffix would just
 * repeat it ("30 g — 30 g"), so it's dropped and the chip reads plainly.
 *
 * `shown` is what the chip will actually FILL, which differs from the source's
 * own magnitude only on a portion crossing the two units (ADR-0108 §8): a
 * 330 ml can read into a gram field is "1 can — ≈304 g". The `≈` is the whole
 * of the signal and it is doing real work — it says estimate without reopening
 * an argument already settled (§9) — and it is what keeps the chip from claiming
 * the source measured a weight it never stated. A chip filling the unit its
 * source stated carries no `≈`, because nothing about it is approximate.
 *
 * A portion carrying no usable magnitude reads as its bare label: there is
 * nothing true left to suffix it with. {@link portionPresets} drops such a
 * portion from the picker, so this is the defensive branch rather than a chip
 * anyone sees.
 */
export function formatPortionPreset(
  portion: Portion,
  shown?: PortionMeasure
): string {
  const measure = shown ?? portionMeasure(portion);
  if (!measure) return portion.label.trim();
  const source = portionMeasure(portion);
  const estimated = source !== null && source.unit !== measure.unit;
  const amount = roundFoodDisplay(measure.amount);
  // Normalise "30g" / "30 g" / " 30 G " to compare against the resolved amount.
  const bare = portion.label.trim().toLowerCase().replace(/\s+/g, "");
  if (!estimated && bare === `${amount}${measure.unit}`)
    return portion.label.trim();
  return `${portion.label} — ${estimated ? "≈" : ""}${amount} ${measure.unit}`;
}

/**
 * Maps a twin's `food/portions` to the presets the amount picker renders below
 * its numeric control (ticket #27). The single place that decides which portions
 * surface as chips and how each reads.
 *
 * Two reasons a portion is dropped, and they are different reasons. One carries
 * no usable magnitude ({@link portionMeasure}) and so could not fill a valid
 * amount at all. The other is stated in a unit the field does not take, and that
 * one is now **conditional**: filling it in would be a density conversion done
 * silently at ratio 1 (ADR-0060 §2/§6) only where there is no density, and on a
 * food carrying a Density Class it is neither silent nor at ratio 1 (ADR-0108
 * §8). `gPerMl` is that class's figure; without one §6 stands exactly as
 * written. Neither case is hypothetical — Open Food Facts publishes a drink
 * powder's serving as the prepared 100 ml against a per-100 g panel, and a
 * millilitre carton's as 100 g.
 *
 * A crossed portion's chip says what it fills and marks it `≈`
 * ({@link formatPortionPreset}), because the source stated a volume and the
 * weight beside it is this app's reading of it.
 *
 * The kept ones carry their amount rounded to stored precision so a tapped chip
 * and {@link resolvePortionAmount} agree exactly. Returns an empty list for a
 * portion-less (or missing) food, so the picker renders as it does today.
 */
export function portionPresets(
  portions: Portion[] | undefined,
  unit: MeasuredUnit,
  gPerMl?: number
): PortionPreset[] {
  if (!portions?.length) return [];
  return portions.flatMap((portion) => {
    const measure = portionMeasure(portion);
    if (!measure) return [];
    const amount =
      measure.unit === unit
        ? measure.amount
        : convertMeasured(measure.amount, measure.unit, unit, gPerMl);
    if (amount === undefined) return [];
    const shown = { amount, unit };
    return [
      {
        label: portion.label,
        amount: roundFood(amount),
        display: formatPortionPreset(portion, shown),
      },
    ];
  });
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
 * to the grams its `serving_size` names — so a food whose panel is a weighed
 * serving (`serving_size: "30 g"`) surfaces it as a chip on the amount screen
 * just like a source's household portions do. Returns an empty list (never a
 * zero-gram portion) for a per-100 food or a weightless "1 serving" panel, so
 * the caller can concatenate it unconditionally.
 *
 * The label form no longer writes such a panel — its toggle offers only the two
 * per-100 bases (ADR-0060's 2026-08-30 Amendment) — so what this reads today is
 * a twin already in the ledger, and any future source that publishes one.
 */
export function servingSizePortion(info: NutritionInfo | undefined): Portion[] {
  const grams = info ? servingSizeGrams(info.serving_size) : null;
  if (grams == null) return [];
  return [{ label: "1 serving", amount: 1, unit: "serving", grams }];
}

/**
 * Drops portions that stand at an amount already listed, keeping the first — so
 * the amount picker never shows two chips for the same thing. The synthesised
 * {@link servingSizePortion} is concatenated ahead of a twin's own list, and a
 * serving a source also publishes as a portion would otherwise appear twice.
 *
 * The key spells the amount a portion resolves to together with the measured
 * unit that amount is in ({@link portionMeasure}) — never the household `unit`
 * field ("1 cup") beside it. Both halves are load-bearing now that a portion can
 * be a volume: 100 g and 100 ml are not the same amount, and folding one into
 * the other is the conversion ADR-0060 §2 refuses.
 *
 * A portion carrying no usable magnitude is **passed through unkeyed** rather
 * than keyed on the absent number: a key built from one folds every such portion
 * into the first of them, which is a lost chip, where passing them through is at
 * worst a repeated one. {@link portionPresets} drops a portion with no finite
 * magnitude from the picker regardless, so this only refuses to fold two
 * malformed rows together.
 */
export function dedupePortions(portions: Portion[]): Portion[] {
  const seen = new Set<string>();
  return portions.filter((p) => {
    const measure = portionMeasure(p);
    if (!measure) return true;
    const key = `${measure.amount}${measure.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
 * The measured unit an amount was ENTERED in, for a caller holding a logged or
 * persisted {@link AmountUnit} and the panel it was measured against.
 *
 * A measured amount answers with its own unit, which on a food carrying a
 * Density Class is the one the user chose and not the one the panel implies
 * (ADR-0108 §7). A whole-serving entry names no measured unit at all
 * ({@link isMeasuredUnit}), and the panel's own is the honest fallback: a
 * caller re-opening one is rebuilding an amount out of the panel anyway, so the
 * unit it comes back in is the panel's by construction.
 *
 * One expression of the rule, because three screens ask it — the amount editor,
 * the log sheet's edit seed and the recipe row editor — and a fallback spelled
 * three times is three chances to spell it differently.
 */
export function enteredUnit(
  unit: AmountUnit,
  serving_size: string | undefined
): MeasuredUnit {
  return isMeasuredUnit(unit) ? unit : basisUnit(serving_size);
}

/**
 * An amount in `from`, expressed in `to`, at `gPerMl` grams per millilitre.
 *
 * The arithmetic of a volume becoming a weight, and nothing else: it knows
 * nothing about where the figure came from or what licenses using it. That is
 * `density.ts`'s `convertAmount`, which resolves a Density Class the user
 * asserted and then calls this — the one door, with this as the one sum behind
 * it (ADR-0108 §1).
 *
 * The split is here rather than there because this module owns {@link
 * MeasuredUnit} and `density.ts` already imports it; putting the sum the other
 * way round would make the two files import each other.
 *
 * `undefined` for a figure that cannot convert anything — absent, zero or
 * negative — never a silent ratio of 1 (ADR-0060 §2). Rounded to the stored
 * food precision, so an amount survives a round trip through the field it was
 * typed into.
 */
export function convertMeasured(
  amount: number,
  from: MeasuredUnit,
  to: MeasuredUnit,
  gPerMl: number | undefined
): number | undefined {
  if (from === to) return amount;
  if (gPerMl === undefined || !Number.isFinite(gPerMl) || gPerMl <= 0)
    return undefined;
  return roundFood(to === "g" ? amount * gPerMl : amount / gPerMl);
}

/**
 * A measured unit spelled out, for a control that names what it takes ("Amount
 * (millilitres)") rather than suffixing a value with it. The long-form sibling
 * of `unitLabel`, which gives the short `g` / `ml` that rides beside a number.
 */
export function measuredUnitName(unit: MeasuredUnit): string {
  return unit === "ml" ? "millilitres" : "grams";
}

/** Where an amount control opens (ADR-0060 §3). */
export interface AmountDefaults {
  /** The amount a freshly staged food is entered at. */
  amount: number;
}

/**
 * The amount control's starting point, which follows the unit it is entered in.
 * 100 g is the weighed food's opening as it always was; a drink opens at a
 * glass, because 100 ml is half of one.
 *
 * It carried a `sliderMax` beside the opening amount until the amount control's
 * slider was removed: the slider's whole-unit step wrote its own position back
 * over a typed value, so 12.34 became 12. Nothing bounds the range now — the
 * field's own `HARD_MAX` is the only ceiling — so the two numbers are one.
 */
export function amountDefaults(unit: MeasuredUnit): AmountDefaults {
  return { amount: unit === "ml" ? 250 : 100 };
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
 *
 * `gPerMl` — the figure a food's Density Class resolves to — adds what that
 * basis weighs: `Per 100 ml (≈103 g)` (ADR-0108 §9). Absent on every food
 * nobody has classified, which captions exactly as it always did.
 */
export function basisCaption(
  serving_size: string | undefined,
  gPerMl?: number
): string | null {
  const basis = (serving_size ?? "").trim();
  if (basis === "") return null;
  const match = BASIS_QUANTITY.exec(basis);
  if (!match) return "Per serving";
  const quantity = Number(match[1]);
  if (quantity <= 0) return "Per serving";
  const unit = measuredUnitFrom(match[2]);
  const head =
    quantity === 100
      ? `Per ${quantity} ${unit}`
      : `Per serving (${quantity} ${unit})`;
  // What that basis weighs, on a food the user has said what kind of liquid it
  // is (ADR-0108 §9): `Per 100 ml (≈103 g)`. The `≈` is the whole of the surface
  // signal, and it is doing real work — it says estimate without reopening an
  // argument already settled. A badge, tag or tint is deliberately not added:
  // ADR-0041's 2026-08-06 amendment removed exactly such a marker from inferred
  // NOVA values, and this follows that call rather than relitigating it.
  //
  // Only ever on a volume basis. The weight of a gram basis is the gram basis,
  // and restating it would be a conversion announcing itself for no reason.
  const weighed = convertMeasured(quantity, unit, "g", gPerMl);
  return unit === "ml" && weighed !== undefined
    ? `${head} (≈${roundFoodDisplay(weighed)} g)`
    : head;
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
