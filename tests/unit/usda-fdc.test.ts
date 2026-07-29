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
    // sodium and no saturated fat, so those keys are absent (not zeroed). The
    // beyond-schema.org micronutrient keys (asserted separately) are split off
    // here so this stays an exhaustive check of the schema.org macro subset.
    const n = mapFdcFoodToPayload(banana).attributes["nutrition/info"];
    const { vitamin_a, vitamin_c, vitamin_b6, folate, ...macros } = n;
    expect(macros).toEqual({
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

  it("maps trans fat, cholesterol and unsaturated (mono+poly) fat", () => {
    // Cheddar carries 1257 (1.14 g), 1253 (100 mg -> 0.1 g), and 1292/1293
    // (7.44 + 1.18 = 8.62 g). Cholesterol is normalised from mg like sodium.
    const n = mapFdcFoodToPayload(cheddar).attributes["nutrition/info"];
    expect(n.trans_fat_content).toBe(1.14);
    expect(n.cholesterol_content).toBeCloseTo(0.1, 6);
    expect(n.unsaturated_fat_content).toBe(8.62);
  });

  it("maps the label micronutrients, converting mg/µg to grams", () => {
    // Cheddar reports minerals in mg and vitamins in mg/µg; the panel stores
    // grams (ADR-0030), so every value is normalised with toGrams.
    const n = mapFdcFoodToPayload(cheddar).attributes["nutrition/info"];
    expect(n.calcium).toBeCloseTo(0.707, 6); // 707 mg
    expect(n.iron).toBeCloseTo(0.00016, 8); // 0.16 mg
    expect(n.potassium).toBeCloseTo(0.077, 6); // 77 mg
    expect(n.magnesium).toBeCloseTo(0.0268, 6); // 26.8 mg
    expect(n.zinc).toBeCloseTo(0.00367, 8); // 3.67 mg
    expect(n.vitamin_a).toBeCloseTo(0.000316, 8); // 316 µg
    expect(n.vitamin_e).toBeCloseTo(0.00075, 8); // 0.75 mg
    expect(n.vitamin_b6).toBeCloseTo(0.000069, 9); // 0.069 mg
    expect(n.vitamin_b12).toBeCloseTo(0.00000106, 10); // 1.06 µg
    expect(n.folate).toBeCloseTo(0.000021, 9); // 21 µg
  });

  it("omits micronutrients the food does not report", () => {
    // Cheddar carries no vitamin C (1162) and no vitamin D (1114), so both keys
    // are absent rather than zeroed.
    const n = mapFdcFoodToPayload(cheddar).attributes["nutrition/info"];
    expect(n).not.toHaveProperty("vitamin_c");
    expect(n).not.toHaveProperty("vitamin_d");
  });

  it("maps the micronutrients a plant food reports and omits the rest", () => {
    const n = mapFdcFoodToPayload(banana).attributes["nutrition/info"];
    expect(n.vitamin_c).toBeCloseTo(0.0097, 6); // 9.7 mg
    expect(n.vitamin_b6).toBeCloseTo(0.000234, 8); // 0.234 mg
    expect(n.folate).toBeCloseTo(0.000025, 9); // 25 µg
    expect(n.vitamin_a).toBeCloseTo(0.000001, 9); // 1 µg
    // Banana's fixture reports no minerals, so these stay absent.
    expect(n).not.toHaveProperty("calcium");
    expect(n).not.toHaveProperty("iron");
    expect(n).not.toHaveProperty("potassium");
    expect(n).not.toHaveProperty("magnesium");
    expect(n).not.toHaveProperty("zinc");
    expect(n).not.toHaveProperty("vitamin_d");
    expect(n).not.toHaveProperty("vitamin_b12");
  });

  it("maps foodCategory and scientificName to food record metadata (ADR-0030)", () => {
    // Banana's search hit carries both — captured as food-identity scalars at
    // search-map time, distinct from the nutrition panel.
    const attrs = mapFdcFoodToPayload(banana).attributes;
    expect(attrs["food/category"]).toBe("Fruits and Fruit Juices");
    expect(attrs["food/scientific_name"]).toBe("Musa acuminata Colla");
  });

  it("omits food/scientific_name when the source lacks it", () => {
    // Cheddar carries a foodCategory but no scientificName, so the missing
    // field is omitted (not emitted as empty/null); the present one still maps.
    const attrs = mapFdcFoodToPayload(cheddar).attributes;
    expect(attrs["food/category"]).toBe("Dairy and Egg Products");
    expect(attrs).not.toHaveProperty("food/scientific_name");
  });

  it("omits food/category when the source lacks it", () => {
    const noMeta: FdcFood = { ...banana };
    delete (noMeta as { foodCategory?: string }).foodCategory;
    delete (noMeta as { scientificName?: string }).scientificName;
    const attrs = mapFdcFoodToPayload(noMeta).attributes;
    expect(attrs).not.toHaveProperty("food/category");
    expect(attrs).not.toHaveProperty("food/scientific_name");
  });

  it("never emits the OFF-only assessment/ingredients/brand attributes", () => {
    // food/assessment, food/ingredients_text and twin/brand are Open Food Facts
    // signals (ADR-0030 §4); the FDC path must not populate them.
    const attrs = mapFdcFoodToPayload(banana).attributes;
    expect(attrs).not.toHaveProperty("food/assessment");
    expect(attrs).not.toHaveProperty("food/ingredients_text");
    expect(attrs).not.toHaveProperty("twin/brand");
  });

  it("omits every macro when the food carries no nutrients", () => {
    const empty: FdcFood = { ...banana, foodNutrients: [] };
    const n = mapFdcFoodToPayload(empty).attributes["nutrition/info"];
    expect(n).toEqual({ serving_size: "100 g" });
  });

  it("reads energy from Atwater factors when a food has no 1008 id", () => {
    // Foundation foods (e.g. "Apples, fuji, with skin, raw") omit id 1008 and
    // report energy only under 2047 (General) / 2048 (Specific). General wins.
    const foundation: FdcFood = {
      ...banana,
      foodNutrients: [
        {
          nutrientId: 2047,
          nutrientName: "Energy (Atwater General Factors)",
          value: 64.7,
          unitName: "KCAL",
        },
        {
          nutrientId: 2048,
          nutrientName: "Energy (Atwater Specific Factors)",
          value: 58.2,
          unitName: "KCAL",
        },
      ],
    };
    const n = mapFdcFoodToPayload(foundation).attributes["nutrition/info"];
    expect(n.calories).toBe(64.7);
  });

  it("reads fiber from the AOAC 2011.25 id when total-dietary is absent", () => {
    // Some Foundation foods (e.g. canned chickpeas) report fiber ONLY under
    // 2033, not 1079 — without the fallback they'd map to no fiber at all.
    const aoacFiber: FdcFood = {
      ...banana,
      foodNutrients: [
        {
          nutrientId: 2033,
          nutrientName: "Total dietary fiber (AOAC 2011.25)",
          value: 5.92,
          unitName: "G",
        },
      ],
    };
    const n = mapFdcFoodToPayload(aoacFiber).attributes["nutrition/info"];
    expect(n.fiber_content).toBe(5.92);
  });

  it("falls back to carbohydrate-by-summation when by-difference is absent", () => {
    const summationCarb: FdcFood = {
      ...banana,
      foodNutrients: [
        {
          nutrientId: 1050,
          nutrientName: "Carbohydrate, by summation",
          value: 15.4,
          unitName: "G",
        },
      ],
    };
    const n = mapFdcFoodToPayload(summationCarb).attributes["nutrition/info"];
    expect(n.carbohydrate_content).toBe(15.4);
  });

  it("prefers the 1008 energy id over the Atwater fallbacks", () => {
    const bothIds: FdcFood = {
      ...banana,
      foodNutrients: [
        {
          nutrientId: 1008,
          nutrientName: "Energy",
          value: 89,
          unitName: "KCAL",
        },
        {
          nutrientId: 2047,
          nutrientName: "Energy (Atwater General Factors)",
          value: 64.7,
          unitName: "KCAL",
        },
      ],
    };
    const n = mapFdcFoodToPayload(bothIds).attributes["nutrition/info"];
    expect(n.calories).toBe(89);
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

  function mockFetchOk() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
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
  }

  it("builds the correct USDA FDC search URL with a wildcard query", async () => {
    // FDC matches whole words on the small Foundation/SR Legacy datasets, so the
    // query is prefix-wildcarded (banana -> banana*) to match while typing.
    const fetchSpy = mockFetchOk();

    await searchFdc("banana", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=banana*&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("wildcards each token so partial multi-word queries still match", async () => {
    const fetchSpy = mockFetchOk();

    await searchFdc("  greek yog  ", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=greek*%20yog*&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("does not double-append a wildcard the caller already supplied", async () => {
    const fetchSpy = mockFetchOk();

    await searchFdc("bana*", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=bana*&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
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

  it("throws a key error (not 'no foods') on a 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "API_KEY_INVALID" } }),
    } as Response);

    await expect(searchFdc("banana", "BAD_KEY")).rejects.toThrow(/key/i);
  });

  it("throws a rate-limit error on a 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: "OVER_RATE_LIMIT" } }),
    } as Response);

    await expect(searchFdc("banana", "KEY")).rejects.toThrow(/rate limit/i);
  });

  it("throws a generic request error on other failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(searchFdc("banana", "KEY")).rejects.toThrow(/500/);
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

  it("ranks foods matching every query token above partial (single-token) matches", async () => {
    // FDC's OR semantics let a food matching only "milk" (rice milk) rank above
    // the real "Soy milk" in the raw relevance order. Re-ranking must float the
    // foods whose name contains BOTH tokens to the top.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 201,
            description: "Beverages, rice milk, unsweetened", // matches "milk" only
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 202,
            description: "Soy milk, sweetened, plain, refrigerated", // both tokens
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 203,
            description: "Soy milk, unsweetened, plain, shelf stable", // both tokens
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("Soy milk", "KEY");

    // The two soy-milk foods (both tokens) come first, in FDC's original order;
    // the milk-only rice milk falls to the bottom despite leading the raw list.
    expect(results[0].entity).toBe("fdc:202"); // Soy milk, sweetened
    expect(results[1].entity).toBe("fdc:203"); // Soy milk, unsweetened
    expect(results[2].entity).toBe("fdc:201"); // Beverages, rice milk
  });
});
