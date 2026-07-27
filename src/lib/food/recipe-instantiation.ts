import {
  deriveIngredientMacros,
  type ReferenceIngredient,
} from "./recipe-nutrition";
import type { NutritionInfo } from "./nutrition";

/**
 * One ingredient of a logged Recipe Instantiation, frozen (ADR-0022). It keeps
 * the pure `{ ref, amount, unit }` reference **plus** two things a bare reference
 * cannot survive on its own: a denormalized `name` for display resilience, and
 * the row's macros captured at log time. Freezing the macros is deliberate — a
 * logged occasion is a historical reading, so it must stay internally consistent
 * with its headline `event/metrics` and never move when the ingredient twin is
 * later corrected, renamed, or deleted. `ref` is retained but soft (may dangle).
 * The `{ calories, protein, fat, carbs }` shorthand matches `event/metrics`.
 */
export interface InstantiationRow {
  ref: string;
  name: string;
  amount: number;
  unit: "g" | "serving";
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * The `event/instantiation` blob on a Consumption Event (ADR-0022): a
 * self-contained snapshot of the one occasion a recipe was cooked. `based_on` is
 * the template it was seeded from (equal to `event/target`); `yield` is the
 * batch division used to reach the per-serving headline; `ingredients` are the
 * frozen rows. The projection reads this snapshot instead of live-deriving from
 * the (mutable) template, so logged history is immutable.
 */
export interface Instantiation {
  based_on: string;
  yield: number;
  ingredients: InstantiationRow[];
}

/**
 * Freezes a Recipe Instantiation snapshot from the live editor's reference
 * ingredients (ADR-0022) — the pure "snapshot on write" step. Each row's macros
 * are derived by the SAME {@link deriveIngredientMacros} formula the builder row
 * display and the headline `deriveRecipeNutrition` use, so the frozen rows sum
 * exactly to the batch total the headline is `÷ yield` of. `resolve` yields each
 * referenced twin's nutrition panel; `resolveName` its display name, denormalized
 * onto the row (falling back to the raw `ref` if the twin cannot be resolved).
 * Yield is only carried here, not applied to the rows: the rows are the batch as
 * cooked, and dividing by yield happens once, in the headline.
 */
export function buildInstantiation(
  based_on: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined,
  resolveName: (ref: string) => string | undefined
): Instantiation {
  const rows: InstantiationRow[] = ingredients.map((ing) => ({
    ref: ing.ref,
    name: resolveName(ing.ref) ?? ing.ref,
    amount: ing.amount,
    unit: ing.unit,
    ...deriveIngredientMacros(ing, resolve),
  }));
  return {
    based_on,
    yield: recipeYield > 0 ? recipeYield : 1,
    ingredients: rows,
  };
}
