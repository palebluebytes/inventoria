import { describe, it, expect } from "vitest";
import { buildInstantiation } from "../../src/lib/food/recipe-instantiation";
import {
  deriveIngredientMacros,
  deriveRecipeNutrition,
  type ReferenceIngredient,
} from "../../src/lib/food/recipe-nutrition";
import type { NutritionInfo } from "../../src/lib/food/nutrition";

// Two reputable-style panels — oats per 100 g, a custom food per serving —
// mirroring recipe-nutrition.test.ts so the snapshot is asserted against the
// same derivation the projection and live editor use.
const PANELS: Record<string, NutritionInfo> = {
  "fdc:oats": {
    serving_size: "100 g",
    calories: 379,
    protein_content: 13.1,
    fat_content: 6.5,
    carbohydrate_content: 67.7,
  },
  "food:custom_milk": {
    serving_size: "1 serving",
    calories: 90,
    protein_content: 1.1,
    fat_content: 0.3,
    carbohydrate_content: 22.8,
  },
};
const NAMES: Record<string, string> = {
  "fdc:oats": "Oats",
  "food:custom_milk": "Milk",
};
const resolve = (ref: string): NutritionInfo | undefined => PANELS[ref];
const resolveName = (ref: string): string | undefined => NAMES[ref];

const INGREDIENTS: ReferenceIngredient[] = [
  { ref: "fdc:oats", amount: 50, unit: "g" },
  { ref: "food:custom_milk", amount: 2, unit: "serving" },
];

describe("buildInstantiation", () => {
  it("freezes a self-contained snapshot with based_on, yield, and per-row macros", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      INGREDIENTS,
      1,
      resolve,
      resolveName
    );

    expect(snapshot.based_on).toBe("recipe:oatmeal");
    expect(snapshot.yield).toBe(1);
    // Each row denormalizes name and freezes the derived macros for its amount.
    expect(snapshot.ingredients).toEqual([
      {
        ref: "fdc:oats",
        name: "Oats",
        amount: 50,
        unit: "g",
        // 379 × 0.5 = 189.5 → 190 ; 13.1 × .5 = 6.55 → 6.6 …
        calories: 190,
        protein: 6.6,
        fat: 3.3,
        carbs: 33.9,
      },
      {
        ref: "food:custom_milk",
        name: "Milk",
        amount: 2,
        unit: "serving",
        calories: 180,
        protein: 2.2,
        fat: 0.6,
        carbs: 45.6,
      },
    ]);
  });

  it("freezes each row via the same derivation the row display uses", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      INGREDIENTS,
      1,
      resolve,
      resolveName
    );
    for (const ing of INGREDIENTS) {
      const derived = deriveIngredientMacros(ing, resolve);
      const row = snapshot.ingredients.find((r) => r.ref === ing.ref)!;
      expect({
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
      }).toEqual(derived);
    }
  });

  it("rows sum to the headline event/metrics (round-then-sum, yield 1)", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      INGREDIENTS,
      1,
      resolve,
      resolveName
    );
    const headline = deriveRecipeNutrition(INGREDIENTS, 1, resolve);
    const rowSum = snapshot.ingredients.reduce((a, r) => a + r.calories, 0);
    expect(rowSum).toBe(headline.calories);
  });

  it("keeps rows as batch contributions and preserves a >1 yield", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      INGREDIENTS,
      2,
      resolve,
      resolveName
    );
    // yield only divides the headline; the rows are the batch as-cooked.
    expect(snapshot.yield).toBe(2);
    expect(snapshot.ingredients.map((r) => r.calories)).toEqual([190, 180]);
    const headline = deriveRecipeNutrition(INGREDIENTS, 2, resolve);
    const rowSum = snapshot.ingredients.reduce((a, r) => a + r.calories, 0);
    expect(rowSum).toBe(headline.calories * 2);
  });

  it("falls back to the ref when a name cannot be resolved (soft ref)", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      [{ ref: "fdc:oats", amount: 50, unit: "g" }],
      1,
      resolve,
      () => undefined
    );
    expect(snapshot.ingredients[0].name).toBe("fdc:oats");
  });

  it("zeroes a row whose panel is missing but keeps it in the breakdown", () => {
    const snapshot = buildInstantiation(
      "recipe:oatmeal",
      [{ ref: "fdc:ghost", amount: 100, unit: "g" }],
      1,
      () => undefined,
      () => "Ghost ingredient"
    );
    expect(snapshot.ingredients[0]).toMatchObject({
      ref: "fdc:ghost",
      name: "Ghost ingredient",
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });
});
