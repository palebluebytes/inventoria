import { describe, it, expect } from "vitest";
import {
  panelFromIngredients,
  nameFromIngredients,
  ingredientFromTwin,
  type RecipeIngredient,
} from "../../src/lib/food/recipe-ingredient";
import type { NutritionInfo } from "../../src/lib/food/nutrition";

const OATS_PANEL: NutritionInfo = {
  serving_size: "100 g",
  calories: 379,
  protein_content: 13.1,
  fat_content: 6.5,
  carbohydrate_content: 67.7,
};

const OATS: RecipeIngredient = {
  entity: "fdc:oats",
  name: "Oats",
  amount: 50,
  unit: "g",
  payload: {
    entity: "fdc:oats",
    attributes: { "food/name": "Oats", "nutrition/info": OATS_PANEL },
  },
};

describe("panelFromIngredients / nameFromIngredients", () => {
  it("resolves a builder ingredient's panel and name by ref", () => {
    expect(panelFromIngredients([OATS], "fdc:oats")).toBe(OATS_PANEL);
    expect(nameFromIngredients([OATS], "fdc:oats")).toBe("Oats");
  });

  it("returns undefined for an unknown ref", () => {
    expect(panelFromIngredients([OATS], "fdc:ghost")).toBeUndefined();
    expect(nameFromIngredients([OATS], "fdc:ghost")).toBeUndefined();
  });

  it("returns the same resolvers deriveRecipeNutrition can consume", () => {
    // The resolvers are exactly what the live editor and the log-time snapshot
    // read from — a builder ingredient carries the twin's real panel inline.
    const panel = panelFromIngredients([OATS], "fdc:oats");
    expect(panel?.calories).toBe(379);
  });
});

describe("ingredientFromTwin", () => {
  it("builds a builder ingredient from a resolved food twin", () => {
    const twin = {
      entity: "fdc:oats",
      attributes: { "food/name": "Oats", "nutrition/info": OATS_PANEL },
    };
    expect(ingredientFromTwin(twin, 50, "g")).toEqual({
      entity: "fdc:oats",
      name: "Oats",
      amount: 50,
      unit: "g",
      payload: twin,
    });
  });

  it("returns null when the twin carries no nutrition panel", () => {
    const twin = { entity: "fdc:oats", attributes: { "food/name": "Oats" } };
    expect(ingredientFromTwin(twin, 50, "g")).toBeNull();
  });

  it("returns null for a missing twin", () => {
    expect(ingredientFromTwin(null, 50, "g")).toBeNull();
  });

  it("falls back to the ref when the twin has no name", () => {
    const twin = {
      entity: "fdc:oats",
      attributes: { "nutrition/info": OATS_PANEL },
    };
    expect(ingredientFromTwin(twin, 50, "g")?.name).toBe("fdc:oats");
  });
});
