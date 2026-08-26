import { describe, it, expect } from "vitest";
import {
  panelFromIngredients,
  nameFromIngredients,
  ingredientFromTwin,
  addOrMergeIngredient,
  parseLoggedQuantity,
  quantityLabel,
  unitLabel,
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

const BANANA: RecipeIngredient = {
  entity: "fdc:banana",
  name: "Banana",
  amount: 150,
  unit: "g",
  payload: {
    entity: "fdc:banana",
    attributes: { "food/name": "Banana", "nutrition/info": OATS_PANEL },
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

describe("addOrMergeIngredient", () => {
  it("appends an ingredient whose twin is not yet in the list", () => {
    const result = addOrMergeIngredient([OATS], BANANA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredients).toEqual([OATS, BANANA]);
  });

  it("sums the amount into the existing row when the same twin is re-added at the same unit", () => {
    // 50 g Oats already present; re-adding 30 g of the same twin folds to 80 g
    // rather than creating a duplicate-keyed row (issue #14).
    const more: RecipeIngredient = { ...OATS, amount: 30 };
    const result = addOrMergeIngredient([OATS, BANANA], more);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One row per twin, merged row keeps its position, other rows untouched.
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0]).toMatchObject({
      entity: "fdc:oats",
      amount: 80,
    });
    expect(result.ingredients[1]).toBe(BANANA);
  });

  it("coerces a transiently non-numeric existing amount before summing", () => {
    // The inline editor leaves `amount` briefly null while retyping; a merge
    // must still land on a clean number.
    const blankExisting: RecipeIngredient = { ...OATS, amount: null as any };
    const result = addOrMergeIngredient([blankExisting], {
      ...OATS,
      amount: 40,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredients[0].amount).toBe(40);
  });

  it("(unitLabel) shows g for grams, and pluralises servings by amount", () => {
    expect(unitLabel(100, "g")).toBe("g");
    expect(unitLabel(1, "g")).toBe("g");
    expect(unitLabel(1, "serving")).toBe("serving");
    expect(unitLabel(2, "serving")).toBe("servings");
    expect(unitLabel(0.5, "serving")).toBe("servings");
  });

  it("(unitLabel) shows ml for a volume amount, unpluralised", () => {
    expect(unitLabel(330, "ml")).toBe("ml");
    expect(unitLabel(1, "ml")).toBe("ml");
  });

  it("blocks the add when the same twin is present at an incompatible unit", () => {
    // Oats seeded from a logged whole-serving event (unit "serving") cannot be
    // summed with a searched-in gram amount without a conversion — block instead.
    const seededServing: RecipeIngredient = {
      ...OATS,
      unit: "serving",
      amount: 1,
    };
    const result = addOrMergeIngredient([seededServing], {
      ...OATS,
      unit: "g",
      amount: 50,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unit_mismatch");
    expect(result.name).toBe("Oats");
  });
});

describe("parseLoggedQuantity", () => {
  it("reads a gram amount back out of a logged quantity", () => {
    expect(parseLoggedQuantity("150g")).toEqual({ amount: 150, unit: "g" });
    expect(parseLoggedQuantity("63.5g")).toEqual({ amount: 63.5, unit: "g" });
    expect(parseLoggedQuantity(" 150 g ")).toEqual({ amount: 150, unit: "g" });
  });

  it("reads a millilitre amount rather than silently misreading it", () => {
    // Before ADR-0060 §5 "330ml" failed the gram match and fell through to one
    // whole serving — a silent misread that dropped the drink out of the Recent
    // catalogue and re-seeded it into a recipe as a single serving.
    expect(parseLoggedQuantity("330ml")).toEqual({ amount: 330, unit: "ml" });
    expect(parseLoggedQuantity("250 ML")).toEqual({ amount: 250, unit: "ml" });
  });

  it("treats anything naming no measured unit as one whole serving", () => {
    expect(parseLoggedQuantity("1 serving")).toEqual({
      amount: 1,
      unit: "serving",
    });
    expect(parseLoggedQuantity(undefined)).toEqual({
      amount: 1,
      unit: "serving",
    });
  });
});

describe("quantityLabel", () => {
  it("closes a measured amount up against its unit, and spaces a serving", () => {
    expect(quantityLabel(150, "g")).toBe("150g");
    expect(quantityLabel(330, "ml")).toBe("330ml");
    expect(quantityLabel(1, "serving")).toBe("1 serving");
    expect(quantityLabel(2, "serving")).toBe("2 servings");
  });

  it("round-trips through parseLoggedQuantity", () => {
    // The one spelling (ADR-0060 §4): what a log is written with is what the
    // dashboard reads back.
    for (const [amount, unit] of [
      [150, "g"],
      [330, "ml"],
      [1, "serving"],
    ] as const) {
      expect(parseLoggedQuantity(quantityLabel(amount, unit))).toEqual({
        amount,
        unit,
      });
    }
  });
});
