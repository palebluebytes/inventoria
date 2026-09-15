import { describe, it, expect, vi } from "vitest";
import { render } from "svelte/server";
import IngredientListEditor from "../../src/lib/views/food/IngredientListEditor.svelte";
import { logRecipeConsumption } from "../../src/lib/stores/calorie.store";
import { dbClient } from "../../src/lib/db/db.client";
import { parseLoggedQuantity } from "../../src/lib/food/recipe-ingredient";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import type { RecipeIngredient } from "../../src/lib/food/recipe-ingredient";

vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    query: vi.fn(),
    append: vi.fn(),
    onInvalidate: vi.fn(() => () => {}),
  },
}));

const PANEL: NutritionInfo = {
  serving_size: "100 g",
  calories: 100,
  protein: 5,
  fat: 2,
  carbs: 10,
} as NutritionInfo;

function row(entity: string, name: string, amount: number): RecipeIngredient {
  return {
    entity,
    name,
    amount,
    unit: "g",
    payload: {
      entity,
      attributes: { "food/name": name, "nutrition/info": PANEL },
    },
  };
}

describe("the serving count admits a fraction (ADR-0106 §6)", () => {
  it("steps freely and offers a decimal keypad", () => {
    // It stepped in whole servings from a floor of 1, so half a portion was not
    // sayable: the spinner could not reach it and `inputmode="numeric"` gives a
    // phone keypad no decimal point to type it with.
    const { body } = render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 1,
        servingsMode: "portions",
      },
    });
    const field = /<input[^>]*id="recipe-servings"[^>]*>/.exec(body)?.[0] ?? "";
    expect(field).toContain('step="any"');
    expect(field).toContain('inputmode="decimal"');
    expect(field).not.toContain('min="1"');
  });

  it("asks what the batch makes, not how much of it, while defining a recipe", () => {
    const { body } = render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 4,
        servingsMode: "makes",
      },
    });
    expect(body).toContain('id="recipe-yield"');
    expect(body).not.toContain('id="recipe-servings"');
  });
});

describe("a logged instantiation says how many servings it was (ADR-0106 §8)", () => {
  const loggedQuantity = async (servings?: number) => {
    (dbClient.append as any).mockClear();
    await logRecipeConsumption(
      "recipe:abc",
      [{ ref: "fdc:1", amount: 300, unit: "g" }],
      1,
      () => ({ panel: PANEL }),
      () => "Rice",
      "dinner",
      new Date("2026-09-14T12:00:00Z"),
      servings
    );
    const datoms = (dbClient.append as any).mock.calls[0][0];
    return datoms.find((d: any) => d.attribute === "event/quantity").value;
  };

  it("records the count the cook asked for, not a hard-coded one serving", async () => {
    expect(await loggedQuantity(3)).toBe("3 servings");
  });

  it("still says one serving when the occasion is one", async () => {
    expect(await loggedQuantity(1)).toBe("1 serving");
  });

  it("says one serving for a recipe logged as it is defined", async () => {
    // Consolidate and Define log one serving of the batch they just built.
    expect(await loggedQuantity()).toBe("1 serving");
  });

  it("carries a fraction of a serving through to the ledger", async () => {
    expect(await loggedQuantity(0.5)).toBe("0.5 servings");
  });

  it("writes a quantity the app reads back as a whole-serving amount", async () => {
    expect(parseLoggedQuantity(await loggedQuantity(3))).toEqual({
      amount: 1,
      unit: "serving",
    });
  });
});
