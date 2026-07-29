import { describe, it, expect } from "vitest";
import {
  deriveIngredientMacros,
  deriveRecipeNutrition,
  type ReferenceIngredient,
} from "../../src/lib/food/recipe-nutrition";
import type { NutritionInfo } from "../../src/lib/food/nutrition";

// Two reputable-style panels: oats reported per 100 g, a custom food per serving.
const PANELS: Record<string, NutritionInfo> = {
  "food:oats": {
    serving_size: "100 g",
    calories: 379,
    protein_content: 13.1,
    fat_content: 6.5,
    carbohydrate_content: 67.7,
  },
  "food:custom": {
    serving_size: "1 serving",
    calories: 90,
    protein_content: 1.1,
    fat_content: 0.3,
    carbohydrate_content: 22.8,
  },
};
const resolve = (ref: string): NutritionInfo | undefined => PANELS[ref];

describe("deriveIngredientMacros", () => {
  it("scales a gram ingredient against its panel's serving_size", () => {
    const oats: ReferenceIngredient = {
      ref: "food:oats",
      amount: 50,
      unit: "g",
    };
    // Every field scaled by .5 at the food precision: 379→189.5, 13.1→6.55,
    // 6.5→3.25, 67.7→33.85 (all within 3 dp, so exact).
    expect(deriveIngredientMacros(oats, resolve)).toEqual({
      calories: 189.5,
      protein: 6.55,
      fat: 3.25,
      carbs: 33.85,
    });
  });

  it("preserves a third decimal place a coarser rounding would flatten", () => {
    // A tiny amount yields 3-dp contributions: 379 × 0.005 = 1.895 (not 1.9),
    // 67.7 × 0.005 = 0.3385 → 0.339 (not 0.34). Logging keeps the finer value.
    const tiny = deriveIngredientMacros(
      { ref: "food:oats", amount: 0.5, unit: "g" },
      resolve
    );
    expect(tiny.calories).toBe(1.895);
    expect(tiny.carbs).toBe(0.339);
  });

  it("scales a serving ingredient by whole servings", () => {
    const custom: ReferenceIngredient = {
      ref: "food:custom",
      amount: 2,
      unit: "serving",
    };
    expect(deriveIngredientMacros(custom, resolve)).toEqual({
      calories: 180,
      protein: 2.2,
      fat: 0.6,
      carbs: 45.6,
    });
  });

  it("re-derives live when the amount changes (no stored copy to rot)", () => {
    const at50 = deriveIngredientMacros(
      { ref: "food:oats", amount: 50, unit: "g" },
      resolve
    );
    const at100 = deriveIngredientMacros(
      { ref: "food:oats", amount: 100, unit: "g" },
      resolve
    );
    expect(at50.calories).toBe(189.5);
    expect(at100.calories).toBe(379);
  });

  it("each row's contribution sums to the whole-recipe total at yield 1", () => {
    const ings: ReferenceIngredient[] = [
      { ref: "food:oats", amount: 50, unit: "g" },
      { ref: "food:custom", amount: 1, unit: "serving" },
    ];
    const rowSum = ings
      .map((i) => deriveIngredientMacros(i, resolve).calories)
      .reduce((a, b) => a + b, 0);
    const total = deriveRecipeNutrition(ings, 1, resolve).calories;
    expect(rowSum).toBe(total); // round-then-sum: rows add up exactly to the total
  });
});
