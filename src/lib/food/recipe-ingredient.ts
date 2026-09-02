import type { FoodResult } from "./food-search";
import type { EntityPayload } from "../ingestion/ingest";
import {
  basisUnit,
  isMeasuredUnit,
  measuredUnitFrom,
  nutritionFromMacros,
  roundFood,
  PER_SERVING,
  type AmountUnit,
  type NutritionInfo,
} from "./nutrition";
import type { ReferenceIngredient } from "./recipe-nutrition";

/**
 * A single recipe ingredient in the builder. It carries only what cannot be
 * derived: the referenced twin (`entity` + its `payload`), a display `name`, and
 * the editable `amount`/`unit` that, with `entity`, form the pure
 * `{ ref, amount, unit }` reference persisted on the recipe twin (ADR-0021).
 *
 * It deliberately does NOT store the quantity label or the ingredient's scaled
 * macros: those are display copies of what the twin's `nutrition/info` panel and
 * `amount` already imply, and would rot the moment `amount` becomes editable.
 * The builder derives them per row via {@link deriveRecipeNutrition} over the
 * real panel — the single-source-of-truth rule #8 applied to the recipe total,
 * pushed down to each row. `event_ids` are set when the ingredient was seeded
 * from logged consumption events on the dashboard — on save, such events are
 * retracted (replaced by the recipe) if they remain.
 *
 * It is a LIST because one row can stand for several logged events: ADR-0024's
 * one-row-per-twin rule means two separate logs of the same food fold into one
 * ingredient, and both of them have to be retracted when the recipe replaces
 * them. Carrying a single id here left the second food sitting in the day
 * beside the recipe that had already swallowed it.
 */
export interface RecipeIngredient {
  entity: string;
  name: string;
  /**
   * Amount used, paired with {@link unit} to form the stored reference. Always a
   * number on a constructed ingredient; the inline editor binds it to a numeric
   * input that is transiently empty (`null` at runtime) while the user retypes,
   * so every reader that needs a number funnels through {@link coerceAmount} —
   * at the reference boundary ({@link toReferenceIngredient}) and when folding a
   * re-added row ({@link addOrMergeIngredient}) — never against the raw value.
   */
  amount: number;
  /** `g`/`ml` for foods scaled against a panel basis, `serving` for
   *  whole-serving/custom foods ({@link AmountUnit}). */
  unit: AmountUnit;
  /** Food-twin payload, ingested when the recipe is saved. */
  payload: EntityPayload;
  /** Source consumption-event ids, if this ingredient came from the day. */
  event_ids?: string[];
}

/**
 * Resolves a builder ingredient's `nutrition/info` panel by its twin ref — the
 * `resolve` the shared derivation ({@link deriveRecipeNutrition}) reads from. A
 * builder ingredient carries the referenced twin's real panel inline on its
 * `payload`, so both the live per-serving display and the log-time snapshot read
 * the single source of truth without touching the ledger. `undefined` when no
 * ingredient matches (or it carries no panel).
 */
export function panelFromIngredients(
  ings: RecipeIngredient[],
  ref: string
): NutritionInfo | undefined {
  return ings.find((i) => i.entity === ref)?.payload?.attributes?.[
    "nutrition/info"
  ] as NutritionInfo | undefined;
}

/**
 * Resolves a builder ingredient's display name by its twin ref — the
 * `resolveName` {@link buildInstantiation} denormalizes onto each frozen row so a
 * logged breakdown survives the twin being renamed or deleted (ADR-0022).
 */
export function nameFromIngredients(
  ings: RecipeIngredient[],
  ref: string
): string | undefined {
  return ings.find((i) => i.entity === ref)?.name;
}

/**
 * Builds a builder ingredient from a resolved food twin (as returned by
 * `getLocalFoodTwin`) plus the `amount`/`unit` it is used at — the seed step for
 * the instantiation editor, which resolves each template/snapshot ref to its
 * *current* twin so edits re-derive from live ingredient data (ADR-0022). Returns
 * `null` when the twin is missing or carries no `nutrition/info` panel, so the
 * caller can fall back (e.g. synthesize from a frozen snapshot row) rather than
 * seed a row that cannot derive. The `name` falls back to the raw ref.
 */
export function ingredientFromTwin(
  twin: EntityPayload | null,
  amount: number,
  unit: AmountUnit
): RecipeIngredient | null {
  const panel = twin?.attributes?.["nutrition/info"];
  if (!panel) return null;
  return {
    entity: twin.entity,
    name: twin.attributes?.["food/name"] ?? twin.entity,
    amount,
    unit,
    payload: twin,
  };
}

/**
 * Coerces a builder ingredient's `amount` to a clean non-negative number. The
 * inline editor binds `amount` to a numeric input that is momentarily empty
 * (`null`) while the user retypes, so every reader that needs a number funnels
 * through here — the single coercion boundary the reference and the derivation
 * depend on.
 */
export function coerceAmount(amount: number): number {
  return Number(amount) || 0;
}

/**
 * The unit label shown beside an ingredient's amount: the measured unit itself
 * (`g`, `ml`) for a food scaled against its panel's basis, and
 * `serving`/`servings` (pluralised by the amount) for a whole-serving food. The
 * single source for this label across the row display and the amount editor.
 *
 * A measured unit is never pluralised — "330 mls" is not a thing anyone writes —
 * so the pluralisation belongs to the serving branch alone.
 */
export function unitLabel(amount: number, unit: AmountUnit): string {
  if (isMeasuredUnit(unit)) return unit;
  return amount === 1 ? "serving" : "servings";
}

/**
 * The app's one quantity phrase: "363g" / "330ml" for a measured amount (no
 * space), "1 serving" for a whole-serving one. It mirrors what the user typed,
 * so the whole-number nutrition toggle — which governs derived nutrients, not
 * entered amounts — deliberately skips it.
 *
 * Every surface that shows a logged amount reads it from here, **and every site
 * that writes one spells it from here too** (ADR-0060 §4): `event/quantity` is
 * built by this function alone, so the logged row, the past-meal row that will
 * become it and the string in the ledger cannot phrase the same amount three
 * ways.
 *
 * Being a write site is why it rounds at storage rather than display precision.
 * `event/quantity` is parsed back — the amount picker opens on it, the bulk ×/÷
 * rescales it, a recipe seeds from it — so it is data, and
 * {@link FOOD_DISPLAY_DECIMALS} exists to trim what the view renders while "the
 * data keeps its full precision". Every amount reaching here has already been
 * clamped to {@link FOOD_DECIMALS} at entry, so this rounds nothing away; it
 * only refuses to introduce a lossy step on the way to the ledger.
 */
export function quantityLabel(amount: number, unit: AmountUnit): string {
  return `${roundFood(amount)}${isMeasuredUnit(unit) ? "" : " "}${unitLabel(
    amount,
    unit
  )}`;
}

/**
 * Reduces a builder ingredient to the pure reference persisted on the recipe.
 * {@link coerceAmount} keeps the reference/derivation a clean number even while
 * the inline editor's input is transiently empty mid-retype.
 */
export function toReferenceIngredient(
  ing: RecipeIngredient
): ReferenceIngredient {
  return { ref: ing.entity, amount: coerceAmount(ing.amount), unit: ing.unit };
}

/** Matches a logged quantity that names a measured amount: "150g", "330 ml". */
const LOGGED_MEASURED = /^\s*([\d.]+)\s*(g|ml)\b/i;

/**
 * Parses a logged Consumption Event's quantity ("150g", "330ml", "1 serving")
 * back into the `{ amount, unit }` that a reference ingredient scales its twin's
 * panel by (ADR-0021). A measured amount scales the twin's panel by its own
 * basis; anything else is treated as one whole serving.
 *
 * The millilitre arm is load-bearing rather than cosmetic (ADR-0060 §5). While
 * the match was gram-only, "330ml" failed it and fell through to
 * `{ amount: 1, unit: "serving" }` — a **silent misread**, not an error, which
 * dropped the drink out of the Recent catalogue (`isCatalogueFood`) and
 * re-seeded it into a recipe as a single serving.
 */
export function parseLoggedQuantity(quantity: string | undefined): {
  amount: number;
  unit: AmountUnit;
} {
  const measured = LOGGED_MEASURED.exec(quantity ?? "");
  if (measured) {
    return {
      amount: parseFloat(measured[1]),
      unit: measuredUnitFrom(measured[2]),
    };
  }
  return { amount: 1, unit: "serving" };
}

/**
 * References a searched/scanned food as an ingredient at `amount` of the unit
 * its own panel is measured in. The scaled macros are not captured here — the
 * builder derives each row's contribution from the twin's panel and this
 * `amount` (ADR-0021).
 *
 * The unit is read off the food's basis rather than assumed to be grams
 * (ADR-0060 §1): a drink published per 100 ml enters a recipe as a millilitre
 * row, so the amount the user typed on the panel's own screen is the amount
 * stored. Nothing converts. `FoodResult.basis` IS the panel's `serving_size`,
 * carried onto the row by `mapPayloadToFoodResult` — the same string
 * {@link parseBasisQuantity} takes the divisor from when
 * {@link deriveRecipeNutrition} scales this row, so a unit and a divisor cannot
 * read it to different conclusions.
 *
 * A basis naming no measured unit keeps grams: a weightless `"1 serving"` takes
 * `basisUnit`'s fallback, exactly as it takes `parseBasisQuantity`'s fallback to
 * 100. A food with no panel at all never reaches that fallback — its row carries
 * the per-100 g basis by construction — and is grams for that reason instead.
 */
export function ingredientFromFood(
  food: FoodResult,
  amount: number
): RecipeIngredient {
  return {
    entity: food.entity,
    name: food.name,
    amount,
    unit: basisUnit(food.basis),
    payload: food.payload,
  };
}

/**
 * Outcome of adding an ingredient to a builder list. Either the next list —
 * with the incoming row appended, or its `amount` summed into the row that
 * already references the same twin — or a block when that existing row uses an
 * incompatible unit (`g` vs `serving` can't be summed without a serving-size
 * conversion), carrying the display `name` so the caller can explain the block.
 */
export type IngredientAddition =
  | { ok: true; ingredients: RecipeIngredient[] }
  | { ok: false; reason: "unit_mismatch"; name: string };

/**
 * What the add-ingredient sheet is told once the editor has folded a chosen
 * food into the list: `ok` closes the sheet, otherwise `message` is the reason
 * the add was refused, which the sheet surfaces while staying open (issue #14).
 */
export type IngredientAddOutcome = { ok: boolean; message?: string };

/**
 * Adds `incoming` to `ingredients`, merging when its twin is already present.
 *
 * The builder keys its list — and every resolver ({@link panelFromIngredients},
 * {@link nameFromIngredients}) and the `remove` action — on `entity`, so two
 * rows sharing a twin are not representable: a keyed `{#each … (entity)}` throws
 * on the duplicate and the render aborts (issue #14). Re-adding a food therefore
 * folds its `amount` into the existing row (units agreeing), keeping one row per
 * twin and the single-source model intact. When the units disagree the amounts
 * are not summable, so the add is blocked rather than silently coerced.
 */
export function addOrMergeIngredient(
  ingredients: RecipeIngredient[],
  incoming: RecipeIngredient
): IngredientAddition {
  const i = ingredients.findIndex((ing) => ing.entity === incoming.entity);
  if (i === -1) return { ok: true, ingredients: [...ingredients, incoming] };

  const existing = ingredients[i];
  if (existing.unit !== incoming.unit) {
    return { ok: false, reason: "unit_mismatch", name: existing.name };
  }
  const merged = {
    ...existing,
    amount: coerceAmount(existing.amount) + coerceAmount(incoming.amount),
    // Both rows' provenance survives the fold. Spreading `existing` alone kept
    // the first row's ids and dropped the incoming's, so a merged seed left the
    // second logged food un-retracted — the recipe replaced one of the two
    // foods it was built from and the other stayed in the day.
    ...eventIds(existing, incoming),
  };
  const next = [...ingredients];
  next[i] = merged;
  return { ok: true, ingredients: next };
}

/**
 * The union of two rows' source events, or nothing at all when neither came
 * from the day. Returned as a partial so a row with no provenance does not gain
 * an empty `event_ids` it never had.
 */
function eventIds(
  existing: RecipeIngredient,
  incoming: RecipeIngredient
): { event_ids?: string[] } {
  const ids = [...(existing.event_ids ?? []), ...(incoming.event_ids ?? [])];
  return ids.length > 0 ? { event_ids: [...new Set(ids)] } : {};
}

/** Builds a manual (custom) ingredient with a synthesized food twin. */
export function customIngredient(
  name: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number
): RecipeIngredient {
  const entity = `food:custom_${Math.random().toString(36).substring(2, 9)}`;
  const nutrition = nutritionFromMacros(
    { calories, protein, fat, carbs },
    PER_SERVING
  );
  return {
    entity,
    name,
    amount: 1,
    unit: "serving",
    payload: {
      entity,
      attributes: {
        "food/name": name,
        "nutrition/info": nutrition,
      },
    },
  };
}
