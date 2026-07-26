import {
  macrosFromNutrition,
  type Macros,
  type NutritionInfo,
} from "./nutrition";

/**
 * A recipe ingredient as it is persisted on the recipe twin: a **pure
 * reference** to a food Digital Twin plus how much of it the recipe uses
 * (schema.org/Recipe, ADR-0021). The ingredient's name and nutrition are never
 * duplicated here — they resolve from the referenced twin, the single source of
 * truth, so a recipe's numbers can never rot against their source.
 */
export interface ReferenceIngredient {
  /** Entity id of the referenced food twin. */
  ref: string;
  /** How much of the ingredient the recipe uses, expressed in {@link unit}. */
  amount: number;
  /** `g` scales against the panel's gram basis; `serving` against one serving. */
  unit: "g" | "serving";
}

/**
 * Parses the gram basis out of a `nutrition/info.serving_size` string like
 * "100 g" → 100. Falls back to 100 g — the basis reputable sources (USDA, OFF)
 * report against — when the string carries no usable number.
 */
export function parseServingGrams(serving_size: string | undefined): number {
  const grams = parseFloat(serving_size ?? "");
  return Number.isFinite(grams) && grams > 0 ? grams : 100;
}

/**
 * Derives a recipe's per-serving macros from its reference ingredients
 * (ADR-0021): `Σ(ingredient panel × amount ÷ serving_size) ÷ yield`. Each
 * ingredient's panel is resolved from its referenced food twin via `resolve`; a
 * `g` ingredient scales by `amount ÷ (grams in the panel's serving_size)`, a
 * `serving` ingredient by `amount` against a per-serving panel. Pure, and the
 * single derivation formula: the same helper over the same real ingredient
 * panels runs both at log time (`logRecipeConsumption`, freezing the snapshot)
 * and in the Consumption projection (`recipe_nutrition`, live), so a logged
 * recipe's frozen macros equal what the projection would derive at the moment it
 * was logged.
 *
 * Each ingredient's scaled contribution is rounded (calories → integer, grams →
 * 1 dp) **before** it is summed — the same rounding every food gets when logged
 * or shown (`ingredientFromFood`). Round-then-sum, not sum-then-round, so a
 * recipe's total is the exact sum of its ingredients' displayed values: folding
 * foods already logged today into a recipe never nudges the day's total by a
 * trailing rounding step.
 */
export function deriveRecipeNutrition(
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined
): Macros {
  const total: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  for (const ing of ingredients) {
    const panel = resolve(ing.ref);
    const macros = macrosFromNutrition(panel);
    const factor =
      ing.unit === "g"
        ? ing.amount / parseServingGrams(panel?.serving_size)
        : ing.amount;
    total.calories += Math.round(macros.calories * factor);
    total.protein += Math.round(macros.protein * factor * 10) / 10;
    total.fat += Math.round(macros.fat * factor * 10) / 10;
    total.carbs += Math.round(macros.carbs * factor * 10) / 10;
  }
  const y = recipeYield > 0 ? recipeYield : 1;
  return {
    calories: Math.round(total.calories / y),
    protein: Math.round((total.protein / y) * 10) / 10,
    fat: Math.round((total.fat / y) * 10) / 10,
    carbs: Math.round((total.carbs / y) * 10) / 10,
  };
}

/**
 * A single reference ingredient's rounded macro contribution — what it adds to a
 * recipe's batch total. A one-ingredient recipe at yield 1, so it runs the SAME
 * `deriveRecipeNutrition` formula (round-then-sum, resolved from the real panel)
 * the whole-recipe total uses: a builder row's displayed macros are derived by
 * the identical rule as the total they sum into, and can never rot against the
 * ingredient's `amount` (ADR-0021). Keeps the derivation in the food domain
 * layer rather than a `.svelte` file.
 */
export function deriveIngredientMacros(
  ingredient: ReferenceIngredient,
  resolve: (ref: string) => NutritionInfo | undefined
): Macros {
  return deriveRecipeNutrition([ingredient], 1, resolve);
}
