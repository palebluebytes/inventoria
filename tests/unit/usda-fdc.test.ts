import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapFdcFoodToPayload,
  searchFdc,
  type FdcFood,
} from "../../src/lib/food/usda-fdc";

// ---- unit: mapFdcFoodToPayload --------------------------------------------

describe("mapFdcFoodToPayload", () => {
  const baseFood: FdcFood = {
    fdcId: 171705,
    description: "Bananas, raw",
    foodNutrients: [
      { nutrientId: 1008, nutrientName: "Energy", value: 89, unitName: "kcal" },
      { nutrientId: 1003, nutrientName: "Protein", value: 1.09, unitName: "g" },
      {
        nutrientId: 1004,
        nutrientName: "Total lipid (fat)",
        value: 0.33,
        unitName: "g",
      },
      {
        nutrientId: 1005,
        nutrientName: "Carbohydrate, by difference",
        value: 22.84,
        unitName: "g",
      },
    ],
  };

  it("maps fdcId to entity id with fdc: prefix", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.entity).toBe("fdc:171705");
  });

  it("maps description to food/name", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.attributes["food/name"]).toBe("Bananas, raw");
  });

  it("maps Energy nutrient to food/calories", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.attributes["food/calories"]).toBe("89 kcal");
  });

  it("maps Protein nutrient to food/protein", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.attributes["food/protein"]).toBe("1.09 g");
  });

  it("maps fat nutrient to food/fat", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.attributes["food/fat"]).toBe("0.33 g");
  });

  it("maps carbohydrate nutrient to food/carbs", () => {
    const payload = mapFdcFoodToPayload(baseFood);
    expect(payload.attributes["food/carbs"]).toBe("22.84 g");
  });

  it("falls back to '0 kcal' when Energy nutrient is absent", () => {
    const food: FdcFood = { ...baseFood, foodNutrients: [] };
    const payload = mapFdcFoodToPayload(food);
    expect(payload.attributes["food/calories"]).toBe("0 kcal");
  });

  it("falls back to '0 g' when Protein nutrient is absent", () => {
    const food: FdcFood = { ...baseFood, foodNutrients: [] };
    const payload = mapFdcFoodToPayload(food);
    expect(payload.attributes["food/protein"]).toBe("0 g");
  });
});

// ---- unit: searchFdc -------------------------------------------------------

describe("searchFdc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the correct USDA FDC search URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 171705,
            description: "Bananas, raw",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    await searchFdc("banana", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=banana&api_key=TEST_KEY"
    );
  });

  it("returns an array of EntityPayloads on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 171705,
            description: "Bananas, raw",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 89,
                unitName: "kcal",
              },
            ],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("banana", "KEY");
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe("fdc:171705");
  });

  it("returns empty array when result set is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ foods: [] }),
    } as Response);

    const results = await searchFdc("zzznomatch", "KEY");
    expect(results).toHaveLength(0);
  });
});
