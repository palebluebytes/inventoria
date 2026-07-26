import type { FoodResult } from "./food-search";
import { nutritionFromMacros, PER_SERVING } from "./nutrition";
import type { ReferenceIngredient } from "./recipe-nutrition";

/**
 * A single recipe ingredient in the builder. It carries the display info the
 * builder shows (name, quantity label, its scaled macro contribution) plus the
 * `amount`/`unit` that, with `entity`, form the pure `{ ref, amount, unit }`
 * reference persisted on the recipe twin (ADR-0021). `event_id` is set when the
 * ingredient was seeded from a logged consumption event on the dashboard — on
 * save, such events are retracted (replaced by the recipe) if they remain.
 */
export interface RecipeIngredient {
  entity: string;
  name: string;
  /** Display label, e.g. "50 g" or "1 serving". */
  quantityLabel: string;
  /** Amount used, paired with {@link unit} to form the stored reference. */
  amount: number;
  /** `g` for scaled foods, `serving` for whole-serving/custom foods. */
  unit: "g" | "serving";
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Food-twin payload, ingested when the recipe is saved. */
  payload: any;
  /** Source consumption-event id, if this ingredient came from the day. */
  event_id?: string;
}

/** Reduces a builder ingredient to the pure reference persisted on the recipe. */
export function toReferenceIngredient(
  ing: RecipeIngredient
): ReferenceIngredient {
  return { ref: ing.entity, amount: ing.amount, unit: ing.unit };
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

/** Scales a searched/scanned food (per-100g) into a proportional ingredient. */
export function ingredientFromFood(
  food: FoodResult,
  grams: number
): RecipeIngredient {
  const f = grams / 100;
  return {
    entity: food.entity,
    name: food.name,
    quantityLabel: `${grams} g`,
    amount: grams,
    unit: "g",
    calories: Math.round(food.calories * f),
    protein: Math.round(food.protein * f * 10) / 10,
    fat: Math.round(food.fat * f * 10) / 10,
    carbs: Math.round(food.carbs * f * 10) / 10,
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
    quantityLabel: "1 serving",
    amount: 1,
    unit: "serving",
    calories,
    protein,
    fat,
    carbs,
    payload: {
      entity,
      attributes: {
        "food/name": name,
        "nutrition/info": nutrition,
      },
    },
  };
}
