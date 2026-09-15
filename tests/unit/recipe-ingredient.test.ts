import { describe, it, expect } from "vitest";
import {
  sourceFromIngredients,
  nameFromIngredients,
  ingredientFromTwin,
  ingredientFromFood,
  addOrMergeIngredient,
  parseLoggedQuantity,
  quantityLabel,
  unitLabel,
  type RecipeIngredient,
} from "../../src/lib/food/recipe-ingredient";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import type { FoodResult } from "../../src/lib/food/food-search";

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

describe("sourceFromIngredients / nameFromIngredients", () => {
  it("resolves a builder ingredient's panel and name by ref", () => {
    expect(sourceFromIngredients([OATS], "fdc:oats")?.panel).toBe(OATS_PANEL);
    expect(nameFromIngredients([OATS], "fdc:oats")).toBe("Oats");
  });

  it("returns undefined for an unknown ref", () => {
    expect(sourceFromIngredients([OATS], "fdc:ghost")).toBeUndefined();
    expect(nameFromIngredients([OATS], "fdc:ghost")).toBeUndefined();
  });

  it("resolves the twin's density beside its panel", () => {
    // Both, together, because the derivation needs both: an ingredient's amount
    // may be stated in a unit the panel's basis is not (ADR-0105 §7), and the
    // density is what converts it. Absent on a food nobody has classified,
    // which is the standing case.
    const oil: RecipeIngredient = {
      entity: "gtin:oil",
      name: "Olive oil",
      amount: 30,
      unit: "g",
      payload: {
        entity: "gtin:oil",
        attributes: {
          "nutrition/info": OATS_PANEL,
          "food/density": { class: "oil" },
        },
      },
    };
    expect(sourceFromIngredients([oil], "gtin:oil")?.density).toEqual({
      class: "oil",
    });
    expect(sourceFromIngredients([OATS], "fdc:oats")?.density).toBeUndefined();
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

describe("ingredientFromFood", () => {
  // The staged card's shape, as `mapPayloadToFoodResult` builds it: the panel's
  // basis rides on the row, and the panel itself rides on the payload.
  function stagedFood(basis: string): FoodResult {
    const info: NutritionInfo = { ...OATS_PANEL, serving_size: basis };
    return {
      entity: "gtin:5000112637922",
      name: "Cola",
      calories: 42,
      protein: 0,
      fat: 0,
      carbs: 10.6,
      basis,
      payload: {
        entity: "gtin:5000112637922",
        attributes: { "food/name": "Cola", "nutrition/info": info },
      },
    };
  }

  it("references a food in the unit it was entered in", () => {
    expect(ingredientFromFood(stagedFood("100 ml"), 330, "ml")).toMatchObject({
      amount: 330,
      unit: "ml",
    });
    expect(ingredientFromFood(stagedFood("100 g"), 50, "g")).toMatchObject({
      amount: 50,
      unit: "g",
    });
  });

  it("takes a unit that differs from the panel's own basis", () => {
    // The whole of what #430 changed here. The unit was read off the food's
    // basis, which was the same answer while a unit could not be chosen
    // (ADR-0060 §1) and is the wrong one now: a bottle of oil weighed into a
    // recipe is a gram row against a per-100 ml panel, and re-deriving the unit
    // would silently relabel it as millilitres.
    expect(ingredientFromFood(stagedFood("100 ml"), 30, "g")).toMatchObject({
      amount: 30,
      unit: "g",
    });
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

  // A row seeded from the day stands for the logged events behind it, and on
  // save the recipe retracts every one of them. A fold therefore has to union
  // the provenance: spreading the existing row alone kept the first event and
  // dropped the second, so the recipe replaced one of the two foods it was
  // built from and the other stayed in the day.
  it("carries BOTH rows' source events through a fold", () => {
    const first: RecipeIngredient = { ...OATS, event_ids: ["event:a"] };
    const second: RecipeIngredient = {
      ...OATS,
      amount: 30,
      event_ids: ["event:b"],
    };

    const result = addOrMergeIngredient([first], second);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredients[0].event_ids).toEqual(["event:a", "event:b"]);
    expect(result.ingredients[0].amount).toBe(80);
  });

  it("keeps the day's events when a catalogue add folds into a seeded row", () => {
    // Adding from the catalogue brings no provenance; the seeded row's must not
    // be wiped by the incoming row's absence of one.
    const seeded: RecipeIngredient = { ...OATS, event_ids: ["event:a"] };

    const result = addOrMergeIngredient([seeded], { ...OATS, amount: 30 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredients[0].event_ids).toEqual(["event:a"]);
  });

  it("leaves a row with no provenance without an empty event list", () => {
    // `event_ids: []` and absent are not the same claim; only the second says
    // this ingredient never came from a logged food.
    const result = addOrMergeIngredient([OATS], { ...OATS, amount: 30 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("event_ids" in result.ingredients[0]).toBe(false);
  });

  it("never retracts the same event twice through repeated folds", () => {
    const seeded: RecipeIngredient = { ...OATS, event_ids: ["event:a"] };

    const result = addOrMergeIngredient([seeded], {
      ...OATS,
      amount: 30,
      event_ids: ["event:a"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredients[0].event_ids).toEqual(["event:a"]);
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
    expect(parseLoggedQuantity("2 servings")).toEqual({
      amount: 2,
      unit: "serving",
    });
    expect(parseLoggedQuantity("0.5 servings")).toEqual({
      amount: 0.5,
      unit: "serving",
    });
    // Anything that names no readable amount is still one serving.
    expect(parseLoggedQuantity("a bowlful")).toEqual({
      amount: 1,
      unit: "serving",
    });
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

  it("keeps a finely-entered amount whole, being the write site too", () => {
    // `event/quantity` is parsed back — the picker opens on it, the bulk x/÷
    // rescales it — so spelling it at display precision would drop a decimal
    // from stored data. An amount typed as "100/3" reaches here already clamped
    // to the storage precision, and must survive it.
    expect(quantityLabel(33.333, "g")).toBe("33.333g");
    expect(parseLoggedQuantity(quantityLabel(33.333, "g")).amount).toBe(33.333);
  });

  it("round-trips through parseLoggedQuantity", () => {
    // The one spelling (ADR-0060 §4): what a log is written with is what the
    // dashboard reads back.
    for (const [amount, unit] of [
      [150, "g"],
      [330, "ml"],
      [1, "serving"],
      // A count other than one, which is where this stopped holding: the serving
      // arm read every "N servings" back as one, so the invariant above was true
      // only of the single case that survives being flattened (#432).
      [2, "serving"],
      [0.5, "serving"],
      [3.25, "serving"],
    ] as const) {
      expect(parseLoggedQuantity(quantityLabel(amount, unit))).toEqual({
        amount,
        unit,
      });
    }
  });
});
