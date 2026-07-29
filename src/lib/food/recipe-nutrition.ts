import {
  roundFood,
  scaleNutrition,
  EXTRA_NUTRIENT_KEYS,
  type Macros,
  type NutritionBreakdown,
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
 * Sanitises a `recipeYield` — held loosely in the editor so the field can be
 * cleared/retyped (`number | string`, transiently empty) — to a positive divisor.
 * The single rule behind every per-serving division (the live editor, the
 * log-time headline, and the persisted `recipe/yield`): a non-positive or
 * unparseable yield falls back to 1 (single-serving).
 */
export function sanitizeYield(recipeYield: number | string): number {
  const n = Number(recipeYield);
  return n > 0 ? n : 1;
}

/**
 * Derives a recipe's per-serving macros from its reference ingredients
 * (ADR-0021): `Σ(ingredient panel × amount ÷ serving_size) ÷ yield`. Each
 * ingredient's panel is resolved from its referenced food twin via `resolve`; a
 * `g` ingredient scales by `amount ÷ (grams in the panel's serving_size)`, a
 * `serving` ingredient by `amount` against a per-serving panel. Pure, and the
 * single derivation formula: the same helper over the same real ingredient
 * panels runs at log time (`logRecipeConsumption`, freezing the `event/metrics`
 * headline) and in the live editor / template-browsing paths (`RecipeModal`'s
 * per-serving panel). A logged recipe reads its frozen snapshot, never this
 * derivation, so history stays immutable (ADR-0022).
 *
 * Each ingredient's scaled contribution is rounded to the food precision
 * (`roundFood`, kcal and grams alike) **before** it is summed — the same rounding
 * every food gets when logged or shown (`ingredientFromFood`). Round-then-sum,
 * not sum-then-round, so a recipe's total is the sum of its ingredients'
 * displayed values (bar the binary-float noise the final `roundFood` trims):
 * folding foods already logged today into a recipe never nudges the day's total
 * by a trailing rounding step.
 *
 * The whole panel is derived, not just the four macros (ADR-0030 / #28): each
 * ingredient contributes its full {@link scaleNutrition} breakdown, and an extra
 * nutrient is totalled only across the ingredients that actually reported it — a
 * nutrient no ingredient carried stays absent, never fabricated as 0. The macro
 * arithmetic is byte-identical to before, so the frozen headline never moves.
 */
export function deriveRecipeNutrition(
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined
): NutritionBreakdown {
  const total: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const extras: Record<string, number> = {};
  for (const ing of ingredients) {
    const panel = resolve(ing.ref);
    const factor =
      ing.unit === "g"
        ? ing.amount / parseServingGrams(panel?.serving_size)
        : ing.amount;
    const scaled = scaleNutrition(panel, factor);
    total.calories += scaled.calories;
    total.protein += scaled.protein;
    total.fat += scaled.fat;
    total.carbs += scaled.carbs;
    for (const key of EXTRA_NUTRIENT_KEYS) {
      const v = scaled[key];
      if (typeof v === "number") extras[key] = (extras[key] ?? 0) + v;
    }
  }
  const y = sanitizeYield(recipeYield);
  const result: NutritionBreakdown = {
    calories: roundFood(total.calories / y),
    protein: roundFood(total.protein / y),
    fat: roundFood(total.fat / y),
    carbs: roundFood(total.carbs / y),
  };
  for (const key of EXTRA_NUTRIENT_KEYS) {
    if (key in extras) result[key] = roundFood(extras[key] / y);
  }
  return result;
}

/**
 * A single reference ingredient's rounded contribution — what it adds to a
 * recipe's batch total. A one-ingredient recipe at yield 1, so it runs the SAME
 * `deriveRecipeNutrition` formula (round-then-sum, resolved from the real panel)
 * the whole-recipe total uses: a builder row's displayed macros are derived by
 * the identical rule as the total they sum into, and can never rot against the
 * ingredient's `amount` (ADR-0021). Returns the full {@link NutritionBreakdown}
 * (every nutrient the ingredient carried, ADR-0030 / #28), which a frozen
 * instantiation row snapshots; the four headline macros are the display subset.
 * Keeps the derivation in the food domain layer rather than a `.svelte` file.
 */
export function deriveIngredientMacros(
  ingredient: ReferenceIngredient,
  resolve: (ref: string) => NutritionInfo | undefined
): NutritionBreakdown {
  return deriveRecipeNutrition([ingredient], 1, resolve);
}
