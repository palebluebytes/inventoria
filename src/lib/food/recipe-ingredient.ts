import type { FoodResult } from "./food-search";
import {
  nutritionFromMacros,
  PER_SERVING,
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
 * pushed down to each row. `event_id` is set when the ingredient was seeded from
 * a logged consumption event on the dashboard — on save, such events are
 * retracted (replaced by the recipe) if they remain.
 */
export interface RecipeIngredient {
  entity: string;
  name: string;
  /**
   * Amount used, paired with {@link unit} to form the stored reference. Always a
   * number on a constructed ingredient; the inline editor binds it to a numeric
   * input that is transiently empty (`null` at runtime) while the user retypes,
   * so it is coerced back to a clean number once at the boundary in
   * {@link toReferenceIngredient} — no other reader touches the raw value.
   */
  amount: number;
  /** `g` for scaled foods, `serving` for whole-serving/custom foods. */
  unit: "g" | "serving";
  /** Food-twin payload, ingested when the recipe is saved. */
  payload: any;
  /** Source consumption-event id, if this ingredient came from the day. */
  event_id?: string;
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
  twin: any | null,
  amount: number,
  unit: "g" | "serving"
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
 * Reduces a builder ingredient to the pure reference persisted on the recipe.
 * Coerces `amount` to a non-negative number: the inline editor binds `amount`
 * to a numeric input, which is momentarily empty (`null`) while the user retypes
 * a value, and the reference/derivation must stay a clean number throughout.
 */
export function toReferenceIngredient(
  ing: RecipeIngredient
): ReferenceIngredient {
  return { ref: ing.entity, amount: Number(ing.amount) || 0, unit: ing.unit };
}

/**
 * Parses a logged Consumption Event's quantity ("150g", "1 serving") back into
 * the `{ amount, unit }` that a reference ingredient scales its twin's panel by
 * (ADR-0021). A gram amount scales the twin's per-100g panel; anything else is
 * treated as one whole serving. Used when seeding a recipe from today's logged
 * foods so the reference resolves losslessly against the original twin.
 */
export function parseLoggedQuantity(quantity: string | undefined): {
  amount: number;
  unit: "g" | "serving";
} {
  const grams = /^\s*([\d.]+)\s*g\b/i.exec(quantity ?? "");
  if (grams) return { amount: parseFloat(grams[1]), unit: "g" };
  return { amount: 1, unit: "serving" };
}

/**
 * References a searched/scanned food as an ingredient of `grams` grams. The
 * scaled macros are not captured here — the builder derives each row's
 * contribution from the twin's per-100g panel and this `amount` (ADR-0021).
 */
export function ingredientFromFood(
  food: FoodResult,
  grams: number
): RecipeIngredient {
  return {
    entity: food.entity,
    name: food.name,
    amount: grams,
    unit: "g",
    payload: food.payload,
  };
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
