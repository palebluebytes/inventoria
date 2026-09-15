import { describe, it, expect, vi } from "vitest";
import { render } from "svelte/server";
import IngredientListEditor from "../../src/lib/views/food/IngredientListEditor.svelte";
import { logRecipeConsumption } from "../../src/lib/stores/recipe.store";
import type { OccasionSize } from "../../src/lib/food/batch-weight";
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

describe("the template keeps both numbers (ADR-0106 §4)", () => {
  it("asks what the batch weighs beside what it makes", () => {
    const { body } = render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 4,
        batchWeight: 1600,
        servingsMode: "makes",
      },
    });
    // Both, because neither derives the other: 1,600 g in the pot says nothing
    // about whether the cook thinks in four portions or six.
    expect(body).toContain('id="recipe-yield"');
    const field =
      /<input[^>]*id="recipe-batch-weight"[^>]*>/.exec(body)?.[0] ?? "";
    expect(field).toContain('value="1600"');
    // Grams and no unit picker (§2): a batch weight has one honest source.
    expect(field).toContain('inputmode="decimal"');
    expect(body).toContain("Batch weight (g)");
  });

  it("offers the weight empty on a recipe nobody has weighed", () => {
    const { body } = render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 4,
        servingsMode: "makes",
      },
    });
    expect(body).toContain('id="recipe-batch-weight"');
  });

  it("never asks a batch weight of an occasion whose recipe carries none", () => {
    const { body } = render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 1,
        servingsMode: "portions",
      },
    });
    expect(body).not.toContain('id="recipe-batch-weight"');
    // §7's fallback, and the only control it offers.
    expect(body).toContain('id="recipe-servings"');
  });
});

describe("an occasion is a fraction of a weighed batch (ADR-0106 §1, §5)", () => {
  const weighed = (props: Record<string, unknown> = {}) =>
    render(IngredientListEditor, {
      props: {
        ingredients: [row("fdc:1", "Rice", 180)],
        recipeYield: 1,
        batchWeight: 480,
        portionWeight: 160,
        // The host settles which question this occasion was opened on, when it
        // seeds the weights — the editor does not re-read it off them.
        sizedByWeight: true,
        servingsMode: "portions",
        ...props,
      },
    }).body;

  it("asks what the dish weighed and how much was eaten", () => {
    const body = weighed();
    expect(
      /<input[^>]*id="recipe-batch-weight"[^>]*>/.exec(body)?.[0] ?? ""
    ).toContain('value="480"');
    expect(
      /<input[^>]*id="recipe-portion-weight"[^>]*>/.exec(body)?.[0] ?? ""
    ).toContain('value="160"');
    expect(body).toContain("You ate (g)");
  });

  it("puts the serving count beyond typing, and reads it out of the weight", () => {
    // A 480 g pot the recipe calls four servings puts 120 g in a serving, so
    // 160 g of it is a third of a serving more than one.
    const body = weighed({ templateYield: 4 });
    expect(body).not.toContain('id="recipe-servings"');
    expect(body).toContain("1.333 servings");
  });

  it("reads out a fraction no whole-number field could have shown (§6)", () => {
    // The record's own example: 250 g of a 400 g serving.
    const body = weighed({
      batchWeight: 1600,
      portionWeight: 250,
      templateYield: 4,
    });
    expect(body).toContain("0.625 servings");
  });

  it("says nothing about servings where the batch's division is not known", () => {
    // Correcting a past occasion: its snapshot froze a yield of 1 over rows that
    // are already the portion, so how many servings the batch made is not in it.
    // The two weights still work, which is what §5 freezes the denominator for.
    const body = weighed();
    expect(body).toContain('id="recipe-portion-weight"');
    expect(body).not.toContain("servings");
  });
});

describe("a logged instantiation says how many servings it was (ADR-0106 §8)", () => {
  const logged = async (occasion?: OccasionSize) => {
    (dbClient.append as any).mockClear();
    await logRecipeConsumption(
      "recipe:abc",
      [{ ref: "fdc:1", amount: 300, unit: "g" }],
      1,
      () => ({ panel: PANEL }),
      () => "Rice",
      "dinner",
      new Date("2026-09-14T12:00:00Z"),
      occasion
    );
    const datoms = (dbClient.append as any).mock.calls[0][0];
    return {
      quantity: datoms.find((d: any) => d.attribute === "event/quantity").value,
      instantiation: datoms.find(
        (d: any) => d.attribute === "event/instantiation"
      ).value,
    };
  };
  const loggedQuantity = async (servings?: number) =>
    (await logged(servings === undefined ? undefined : { servings })).quantity;

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

  it("says what was eaten when the cook weighed the batch", async () => {
    // 160 g of a 480 g pot. The count was never the measurement; the weight is.
    const { quantity } = await logged({
      servings: 1,
      batch_weight: 480,
      portion_weight: 160,
    });
    expect(quantity).toBe("160g");
    expect(parseLoggedQuantity(quantity)).toEqual({ amount: 160, unit: "g" });
  });

  it("freezes what that portion was a fraction of (ADR-0106 §5)", async () => {
    const { instantiation } = await logged({
      servings: 1,
      batch_weight: 480,
      portion_weight: 160,
    });
    expect(instantiation.batch_weight).toBe(480);
  });

  it("keeps the count, and no denominator, for an occasion nobody weighed", async () => {
    const { quantity, instantiation } = await logged({ servings: 2 });
    expect(quantity).toBe("2 servings");
    expect("batch_weight" in instantiation).toBe(false);
  });

  it("refuses a portion with no batch behind it", async () => {
    // A numerator alone sizes nothing: it is a fraction of something, and
    // without the something it is not the occasion's quantity either.
    const { quantity, instantiation } = await logged({
      servings: 2,
      portion_weight: 160,
    });
    expect(quantity).toBe("2 servings");
    expect("batch_weight" in instantiation).toBe(false);
  });
});
