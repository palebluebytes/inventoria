import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapFdcFoodToPayload,
  searchFdc,
  type FdcFood,
} from "../../src/lib/food/usda-fdc";
import bananaSearch from "./support/fixtures/usda-fdc-banana.json";
import cheddarSearch from "./support/fixtures/usda-fdc-cheddar.json";

// Seam 1 (ADR-0016 isolated-Mapper contract): feed the mapper a saved copy of a
// real USDA FoodData Central search response and assert the emitted
// `nutrition/info` panel. Fixtures are real captured DEMO_KEY responses, so the
// mapping is exercised against the real field shape — uppercase unit names, the
// full micronutrient list, sodium reported in mg — not a hand-built minimum.

const banana = bananaSearch.foods[0] as unknown as FdcFood;
const cheddar = cheddarSearch.foods[0] as unknown as FdcFood;

describe("mapFdcFoodToPayload", () => {
  it("maps fdcId to entity id with fdc: prefix", () => {
    expect(mapFdcFoodToPayload(banana).entity).toBe("fdc:1105073");
  });

  it("maps description to food/name", () => {
    expect(mapFdcFoodToPayload(banana).attributes["food/name"]).toBe(
      "Bananas, overripe, raw"
    );
  });

  it("emits a nutrition/info panel with a 100 g serving basis", () => {
    const n = mapFdcFoodToPayload(banana).attributes["nutrition/info"];
    expect(n.serving_size).toBe("100 g");
  });

  it("populates the subset of schema.org fields the food provides", () => {
    // Banana carries energy, the three macros, fiber and total sugars — but no
    // sodium and no saturated fat, so those keys are absent (not zeroed).
    const n = mapFdcFoodToPayload(banana).attributes["nutrition/info"];
    expect(n).toEqual({
      serving_size: "100 g",
      calories: 85,
      protein_content: 0.73,
      fat_content: 0.22,
      carbohydrate_content: 20.1,
      fiber_content: 1.7,
      sugar_content: 15.8,
    });
    expect(n).not.toHaveProperty("sodium_content");
    expect(n).not.toHaveProperty("saturated_fat_content");
  });

  it("normalises sodium from milligrams to grams", () => {
    // Cheddar reports Sodium, Na as 654 mg — the panel stores grams.
    const n = mapFdcFoodToPayload(cheddar).attributes["nutrition/info"];
    expect(n.sodium_content).toBeCloseTo(0.654, 6);
  });

  it("maps saturated fat and total sugars for a food that carries them", () => {
    const n = mapFdcFoodToPayload(cheddar).attributes["nutrition/info"];
    expect(n.saturated_fat_content).toBe(19.2);
    expect(n.sugar_content).toBe(0.33);
    expect(n.calories).toBe(408);
    expect(n.protein_content).toBe(23.3);
  });

  it("omits every macro when the food carries no nutrients", () => {
    const empty: FdcFood = { ...banana, foodNutrients: [] };
    const n = mapFdcFoodToPayload(empty).attributes["nutrition/info"];
    expect(n).toEqual({ serving_size: "100 g" });
  });

  it("stores the raw source response as twin/raw_provenance (ADR-0016)", () => {
    // Provenance keeps the untouched FDC food so any nutrient not surfaced in
    // the panel today (the full micronutrient list) can be backfilled later
    // with no network re-fetch. raw_data is the verbatim fixture object.
    const prov = mapFdcFoodToPayload(banana).attributes["twin/raw_provenance"];
    expect(prov.raw_data).toEqual(banana);
  });

  it("wraps provenance in an extraction-metadata envelope", () => {
    const prov = mapFdcFoodToPayload(banana).attributes["twin/raw_provenance"];
    expect(prov.source_uri).toBe(
      "https://api.nal.usda.gov/fdc/v1/food/1105073"
    );
    expect(prov.adapter).toBe("fdc");
    expect(prov.adapter_version).toEqual(expect.any(String));
    // No live timestamp in the pure mapper: the ledger stamps each Datom's
    // `time` at ingest, and that IS the capture basis (keeps this deterministic).
    expect(prov).not.toHaveProperty("timestamp");
    expect(prov).not.toHaveProperty("captured_at");
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
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    await searchFdc("banana", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=banana&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
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
            dataType: "Foundation",
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

  it("deduplicates results preferring Foundation and sorts raw foods to the top", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 101,
            description: "Bananas, dehydrated",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 102,
            description: "Bananas, raw",
            dataType: "SR Legacy", // duplicate, but Foundation exists below
            foodNutrients: [],
          },
          {
            fdcId: 103,
            description: "Bananas, raw",
            dataType: "Foundation", // will overwrite fdcId 102
            foodNutrients: [],
          },
          {
            fdcId: 104,
            description: "Bananas, overripe, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("banana", "KEY");

    // Deduplication should leave 3 entries: dehydrated, raw (Foundation), overripe raw
    expect(results).toHaveLength(3);

    // Sorting order should prioritize "Bananas, raw" (ends in ', raw', 1 comma -> score 3)
    // then "Bananas, overripe, raw" (ends in ', raw', 2 commas -> score 2)
    // then "Bananas, dehydrated" (score 0)
    expect(results[0].entity).toBe("fdc:103"); // Bananas, raw
    expect(results[1].entity).toBe("fdc:104"); // Bananas, overripe, raw
    expect(results[2].entity).toBe("fdc:101"); // Bananas, dehydrated
  });
});
