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

// The recipe path mirrors the food path: the full panel — not just the four
// macros — is derived and frozen (ADR-0030 / #28), summed across ingredients that
// carry each nutrient and never fabricating a zero for one that omits it.
describe("deriveRecipeNutrition — full breakdown", () => {
  const PANELS_FULL: Record<string, NutritionInfo> = {
    "fdc:oats": {
      serving_size: "100 g",
      calories: 380,
      protein_content: 13,
      fat_content: 7,
      carbohydrate_content: 67,
      fiber_content: 10,
      sodium_content: 0.006,
    },
    "fdc:milk": {
      serving_size: "100 g",
      calories: 64,
      protein_content: 3.4,
      fat_content: 3.6,
      carbohydrate_content: 4.7,
      // No fibre; carries calcium the oats lack.
      calcium: 0.12,
    },
  };
  const resolveFull = (ref: string) => PANELS_FULL[ref];

  it("totals each extra only across the ingredients that report it (round-then-sum ÷ yield)", () => {
    const ings: ReferenceIngredient[] = [
      { ref: "fdc:oats", amount: 50, unit: "g" }, // ×0.5
      { ref: "fdc:milk", amount: 200, unit: "g" }, // ×2
    ];
    // oats ×0.5: fibre 5, sodium 0.003 ; milk ×2: calcium 0.24 (no fibre).
    expect(deriveRecipeNutrition(ings, 1, resolveFull)).toEqual({
      calories: 318, // 190 + 128
      protein: 13.3, // 6.5 + 6.8
      fat: 10.7, // 3.5 + 7.2
      carbs: 42.9, // 33.5 + 9.4
      fiber_content: 5, // oats only
      sodium_content: 0.003, // oats only
      calcium: 0.24, // milk only
    });
  });

  it("divides every extra by yield, like the macros", () => {
    const ings: ReferenceIngredient[] = [
      { ref: "fdc:oats", amount: 100, unit: "g" }, // ×1: fibre 10, sodium 0.006
    ];
    const perServing = deriveRecipeNutrition(ings, 2, resolveFull);
    expect(perServing.fiber_content).toBe(5); // 10 ÷ 2
    expect(perServing.sodium_content).toBe(0.003); // 0.006 ÷ 2
    expect(perServing.calories).toBe(190); // 380 ÷ 2
  });

  it("keeps a nutrient absent when no ingredient reports it — never 0", () => {
    const macroOnly: Record<string, NutritionInfo> = {
      "fdc:x": {
        serving_size: "100 g",
        calories: 100,
        protein_content: 2,
        fat_content: 1,
        carbohydrate_content: 20,
      },
    };
    const derived = deriveRecipeNutrition(
      [{ ref: "fdc:x", amount: 100, unit: "g" }],
      1,
      (r) => macroOnly[r]
    );
    expect(derived).toEqual({ calories: 100, protein: 2, fat: 1, carbs: 20 });
    expect("fiber_content" in derived).toBe(false);
  });
});
