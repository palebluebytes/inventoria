/**
 * What a saved recipe's row says its per-serving figures are (#488).
 *
 * The figures are not stored — a Recipe Twin holds bare ingredient references
 * (ADR-0021), so the macros on a library row are derived at read time from
 * three things the ledger holds separately: the twin's `recipe/ingredients`,
 * its `recipe/yield`, and each referenced food twin's own panel. All three move
 * under an edit, and none of them is the entity id. That is the whole of #488:
 * the list cached the derivation by entity, so a recipe kept the figures it had
 * when the list first rendered until the app was reloaded.
 *
 * These tests pin the derivation to the ledger's *latest* datoms rather than
 * its first, which is what a cacheless read buys and what an entity-keyed cache
 * took away. The rows are handed back in HLC-ascending order, as
 * `getLocalFoodTwin`'s own `ORDER BY` puts them, so an edit is simply the later
 * row and latest-wins is what folding them must produce.
 *
 * That ordering is **assumed here, not asserted**: the mock ignores the SQL and
 * answers by entity alone, so what these fixtures prove is that a fold over
 * rows in that order takes the last one. A dropped `ORDER BY ${HLC_ORDER_ASC}`
 * in `getLocalFoodTwin` would sail past every case below — and past the whole
 * suite, since nothing pins that clause anywhere and `calorie-store.test.ts`
 * re-encodes its rows "in ascending order" on the same assumption. Saying so is
 * cheaper than a test that would have to stand up the real engine to read one
 * twin, but it is a gap rather than a division of labour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import { recipePerServingNutrition } from "../../src/lib/stores/recipe.store";
import type { NutritionInfo } from "../../src/lib/food/nutrition";

vi.mock("../../src/lib/db/db.client", () => {
  return {
    dbClient: {
      query: vi.fn(),
      append: vi.fn(),
      onInvalidate: vi.fn(() => () => {}),
    },
  };
});

const OATS: NutritionInfo = {
  serving_size: "100 g",
  calories: 380,
  protein_content: 13,
  fat_content: 6.5,
  carbohydrate_content: 68,
};

const HONEY: NutritionInfo = {
  serving_size: "100 g",
  calories: 300,
  protein_content: 0.3,
  fat_content: 0,
  carbohydrate_content: 82,
};

interface Row {
  attribute: string;
  value: string;
}

/**
 * A ledger as `getLocalFoodTwin` reads one: entity → its datoms, oldest first.
 * Values arrive JSON-encoded, the way the worker stores them.
 */
function ledger(entities: Record<string, [string, unknown][]>) {
  vi.mocked(dbClient.query<Row>).mockImplementation(
    async (_sql: string, params: unknown[] = []) =>
      (entities[String(params[0])] ?? []).map(([attribute, value]) => ({
        attribute,
        value: JSON.stringify(value),
      }))
  );
}

describe("a saved recipe's per-serving figures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives them from the referenced twins' panels and the yield", async () => {
    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 1],
      ],
      "food:oats": [
        ["food/name", "Oats"],
        ["nutrition/info", OATS],
      ],
    });

    expect(await recipePerServingNutrition("recipe:porridge")).toEqual({
      calories: 380,
      protein: 13,
      fat: 6.5,
      carbs: 68,
    });
  });

  it("follows a later yield, not the one the twin was written with", async () => {
    // The edit that #488 made invisible: the entity is the same, the name is
    // the same, and only the divisor moved.
    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 1],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 2],
      ],
      "food:oats": [
        ["food/name", "Oats"],
        ["nutrition/info", OATS],
      ],
    });

    expect(await recipePerServingNutrition("recipe:porridge")).toEqual({
      calories: 190,
      protein: 6.5,
      fat: 3.25,
      carbs: 34,
    });
  });

  it("follows a later ingredient list, not the one the twin was written with", async () => {
    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 1],
        [
          "recipe/ingredients",
          [
            { ref: "food:oats", amount: 100, unit: "g" },
            { ref: "food:honey", amount: 20, unit: "g" },
          ],
        ],
        ["recipe/yield", 1],
      ],
      "food:oats": [
        ["food/name", "Oats"],
        ["nutrition/info", OATS],
      ],
      "food:honey": [
        ["food/name", "Honey"],
        ["nutrition/info", HONEY],
      ],
    });

    expect(await recipePerServingNutrition("recipe:porridge")).toEqual({
      calories: 440,
      protein: 13.06,
      fat: 6.5,
      carbs: 84.4,
    });
  });

  it("follows a corrected ingredient twin, which the recipe's own datoms do not record", async () => {
    // The third input, and the one no key over the recipe's datoms can see: the
    // recipe is untouched and its figures still have to move.
    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 1],
      ],
      "food:oats": [
        ["food/name", "Oats"],
        ["nutrition/info", OATS],
        ["nutrition/info", { ...OATS, calories: 400 }],
      ],
    });

    expect(await recipePerServingNutrition("recipe:porridge")).toMatchObject({
      calories: 400,
    });
  });

  it("answers the ledger it is asked against, holding nothing from the last one", async () => {
    // #488 as the list met it: one entity, asked twice, edited in between. The
    // entity is the only thing a cache could key on and the only thing the edit
    // leaves alone, so a memo here reads the first answer back forever.
    const oats: [string, unknown][] = [
      ["food/name", "Oats"],
      ["nutrition/info", OATS],
    ];
    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 100, unit: "g" }]],
        ["recipe/yield", 1],
      ],
      "food:oats": oats,
    });
    expect(await recipePerServingNutrition("recipe:porridge")).toMatchObject({
      calories: 380,
    });

    ledger({
      "recipe:porridge": [
        ["recipe/name", "Porridge"],
        ["recipe/ingredients", [{ ref: "food:oats", amount: 50, unit: "g" }]],
        ["recipe/yield", 1],
      ],
      "food:oats": oats,
    });
    expect(await recipePerServingNutrition("recipe:porridge")).toMatchObject({
      calories: 190,
    });
  });

  it("is null for an entity the ledger does not hold", async () => {
    ledger({});

    expect(await recipePerServingNutrition("recipe:gone")).toBeNull();
  });

  it("reads a yield-less twin as single-serving rather than dividing by nothing", async () => {
    ledger({
      "recipe:dressing": [
        ["recipe/name", "Dressing"],
        ["recipe/ingredients", [{ ref: "food:honey", amount: 50, unit: "g" }]],
      ],
      "food:honey": [
        ["food/name", "Honey"],
        ["nutrition/info", HONEY],
      ],
    });

    expect(await recipePerServingNutrition("recipe:dressing")).toMatchObject({
      calories: 150,
    });
  });
});
