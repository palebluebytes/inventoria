import type { FoodResult } from "./food-search";
import { nutritionFromMacros, PER_SERVING } from "./nutrition";

/**
 * A single recipe ingredient. `event_id` is set when the ingredient was seeded
 * from a logged consumption event on the dashboard — on save, such events are
 * retracted (replaced by the recipe) if they remain in the list.
 */
export interface RecipeIngredient {
  entity: string;
  name: string;
  /** Display label, e.g. "50 g" or "1 serving". */
  quantityLabel: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Food-twin payload, ingested when the recipe is saved. */
  payload: any;
  /** Source consumption-event id, if this ingredient came from the day. */
  event_id?: string;
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
