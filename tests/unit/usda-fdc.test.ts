import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapFdcFoodToPayload,
  mapFdcDetailToPayload,
  hydrateFdcFood,
  searchFdc,
  isBrandSpecific,
  isProcessedProduct,
  isPreparedProduct,
  type FdcFood,
  type FdcFoodDetail,
} from "../../src/lib/food/usda-fdc";
import bananaSearch from "./support/fixtures/usda-fdc-banana.json";
import cheddarSearch from "./support/fixtures/usda-fdc-cheddar.json";
import bananaDetail from "./support/fixtures/usda-fdc-banana-detail.json";

// Seam 1 (ADR-0016 isolated-Mapper contract): feed the mapper a saved copy of a
// real USDA FoodData Central search response and assert the emitted
// `nutrition/info` panel. Fixtures are real captured DEMO_KEY responses, so the
// mapping is exercised against the real field shape — uppercase unit names, the
// full micronutrient list, sodium reported in mg — not a hand-built minimum.

const banana = bananaSearch.foods[0] as unknown as FdcFood;
const cheddar = cheddarSearch.foods[0] as unknown as FdcFood;
const detail = bananaDetail as unknown as FdcFoodDetail;

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

// ---- Seam 1: mapFdcDetailToPayload (foodPortions -> food/portions) ---------

describe("mapFdcDetailToPayload", () => {
  it("keys the augmentation to the same fdc: entity", () => {
    expect(mapFdcDetailToPayload(detail).entity).toBe("fdc:173944");
  });

  it("maps foodPortions[] to an ordered food/portions list (ADR-0030)", () => {
    // Each portion resolves to its gramWeight; the label falls back to
    // amount + modifier when the record supplies no portionDescription.
    const portions = mapFdcDetailToPayload(detail).attributes["food/portions"];
    expect(portions).toEqual([
      { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
      { label: "1 cup, sliced", amount: 1, unit: "cup, sliced", grams: 150 },
      { label: "1 large", amount: 1, unit: "large", grams: 136 },
    ]);
  });

  it("prefers a portionDescription label over the amount+unit fallback", () => {
    const withDescription: FdcFoodDetail = {
      fdcId: 1,
      foodPortions: [
        {
          amount: 1,
          gramWeight: 57,
          portionDescription: "1 croissant",
          measureUnit: { name: "undetermined" },
        },
      ],
    };
    const portions =
      mapFdcDetailToPayload(withDescription).attributes["food/portions"];
    expect(portions[0].label).toBe("1 croissant");
    expect(portions[0].grams).toBe(57);
  });

  it("falls back to the named measureUnit when there is no modifier", () => {
    const withMeasure: FdcFoodDetail = {
      fdcId: 2,
      foodPortions: [
        { amount: 2, gramWeight: 30, measureUnit: { name: "tbsp" } },
      ],
    };
    const portions =
      mapFdcDetailToPayload(withMeasure).attributes["food/portions"];
    expect(portions[0]).toEqual({
      label: "2 tbsp",
      amount: 2,
      unit: "tbsp",
      grams: 30,
    });
  });

  it("omits food/portions when the detail record carries none", () => {
    const noPortions: FdcFoodDetail = { fdcId: 3, foodPortions: [] };
    const attrs = mapFdcDetailToPayload(noPortions).attributes;
    expect(attrs).not.toHaveProperty("food/portions");
    // absent entirely (not just empty) is also handled
    const missing: FdcFoodDetail = { fdcId: 4 };
    expect(mapFdcDetailToPayload(missing).attributes).not.toHaveProperty(
      "food/portions"
    );
  });

  it("skips portions with no usable gram weight", () => {
    const mixed: FdcFoodDetail = {
      fdcId: 5,
      foodPortions: [
        { amount: 1, gramWeight: 0, modifier: "pinch" },
        { amount: 1, gramWeight: 40, modifier: "slice" },
      ],
    };
    const portions = mapFdcDetailToPayload(mixed).attributes["food/portions"];
    expect(portions).toEqual([
      { label: "1 slice", amount: 1, unit: "slice", grams: 40 },
    ]);
  });

  it("refreshes twin/raw_provenance with the fuller detail record", () => {
    // Provenance now holds the /food/{id} detail (larger than the search hit),
    // verbatim, under the bumped adapter version.
    const prov =
      mapFdcDetailToPayload(detail).attributes["twin/raw_provenance"];
    expect(prov.raw_data).toEqual(detail);
    expect(prov.source_uri).toBe("https://api.nal.usda.gov/fdc/v1/food/173944");
    expect(prov.adapter).toBe("fdc");
    expect(prov.adapter_version).toEqual(expect.any(String));
  });
});

// ---- unit: hydrateFdcFood --------------------------------------------------

describe("hydrateFdcFood", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the /food/{id} detail endpoint with the api key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => bananaDetail,
    } as Response);

    await hydrateFdcFood(173944, "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/food/173944?api_key=TEST_KEY"
    );
  });

  it("returns the mapped portions-and-provenance augmentation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => bananaDetail,
    } as Response);

    const payload = await hydrateFdcFood(173944, "TEST_KEY");
    expect(payload.entity).toBe("fdc:173944");
    expect(payload.attributes["food/portions"]).toHaveLength(3);
    expect(payload.attributes["food/portions"][0].label).toBe("1 medium");
  });

  it("surfaces a key error on a 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(hydrateFdcFood(1, "BAD_KEY")).rejects.toThrow(/key/i);
  });
});

// ---- unit: searchFdc -------------------------------------------------------

describe("isBrandSpecific", () => {
  it("flags an SR Legacy record with a brand baked into the description", () => {
    // brandOwner/brandName are null on these records; the ALL-CAPS token is the
    // only signal that this is a specific product, not a generic food.
    expect(
      isBrandSpecific(
        "Grapefruit juice, white, bottled, unsweetened, OCEAN SPRAY"
      )
    ).toBe(true);
  });

  it("keeps generic foods that carry no brand token", () => {
    expect(isBrandSpecific("Grapes, red, seedless, raw")).toBe(false);
    expect(isBrandSpecific("Beef, ground, 80% lean, raw")).toBe(false);
  });

  it("never flags on a two-letter all-caps token (unit / state code)", () => {
    // "NY" here is a cut of beef, not a brand — the >=3-letter guard protects it.
    expect(isBrandSpecific("Beef, short loin (NY strip steak), raw")).toBe(
      false
    );
  });

  it("never flags a generic all-caps acronym (USDA commodity, DHA/ARA)", () => {
    expect(isBrandSpecific("Cheese, cheddar, USDA commodity")).toBe(false);
  });

  it("drops trademark cereals but keeps USDA's generic 'assorted brands' composite", () => {
    // Cream of Wheat / Cream of Rice are trademarked products -> dropped.
    expect(isBrandSpecific("Cereals, CREAM OF WHEAT, dry")).toBe(true);
    expect(isBrandSpecific("Cereals, CREAM OF RICE, dry")).toBe(true);
    // The generic farina composite that merely names the brand is kept.
    expect(
      isBrandSpecific(
        "Cereals, farina, enriched, assorted brands including CREAM OF WHEAT, dry"
      )
    ).toBe(false);
  });

  it("always drops a brand, even one the query names (brands -> OFF path)", () => {
    // Brands belong to the OFF barcode path, so USDA search drops them whether
    // or not the query names them — generic equivalents win instead.
    expect(isBrandSpecific("Beverages, OCEAN SPRAY, Cran Grape")).toBe(true);
    expect(isBrandSpecific("Babyfood, GERBER, 2nd Foods, apple")).toBe(true);
  });

  it("drops a brand a query merely prefix-matches (apple -> APPLEBEE'S)", () => {
    // "apple" prefixes "applebee's" and "almond" == the capitalised ALMOND in a
    // candy brand — both must still drop, so the fruit/nut search stays clean.
    expect(isBrandSpecific("APPLEBEE'S, chicken tenders platter")).toBe(true);
    expect(isBrandSpecific("Candies, ALMOND JOY Candy Bar")).toBe(true);
    expect(
      isBrandSpecific("Cereals ready-to-eat, POST, GRAPE-NUTS Cereal")
    ).toBe(true);
  });
});

describe("isProcessedProduct", () => {
  it("flags packaged/processed forms that carry a barcode (OFF's job)", () => {
    expect(
      isProcessedProduct("Grapes, canned, thompson seedless, heavy syrup pack")
    ).toBe(true);
    expect(isProcessedProduct("Beverages, carbonated, grape soda")).toBe(true);
    expect(isProcessedProduct("Beverages, grape drink, canned")).toBe(true);
    expect(isProcessedProduct("Fruit cocktail, (peach and pear), canned")).toBe(
      true
    );
    // packaged cereals and juices are barcoded products too
    expect(isProcessedProduct("Cereals ready-to-eat, corn flakes")).toBe(true);
    expect(
      isProcessedProduct("Grape juice, canned or bottled, unsweetened")
    ).toBe(true);
  });

  it("keeps base ingredients that never carry a marker", () => {
    expect(isProcessedProduct("Grapes, red, seedless, raw")).toBe(false);
    expect(isProcessedProduct("Oil, grapeseed")).toBe(false);
    expect(isProcessedProduct("Cheese, cheddar")).toBe(false);
    expect(isProcessedProduct("Spices, cinnamon, ground")).toBe(false);
    // raw-pressed juice is a base ingredient — the raw exemption keeps it
    expect(isProcessedProduct("Lemon juice, raw")).toBe(false);
  });

  it("never drops a food described 'raw', even a retail cut sold frozen", () => {
    // "frozen" is a marker, but the raw NZ lamb is a base ingredient, so the
    // raw exemption keeps it.
    expect(
      isProcessedProduct("Lamb, New Zealand, imported, frozen, loin, raw")
    ).toBe(false);
  });

  it("uses 'carbonated' (not 'soda') so baking soda survives", () => {
    expect(isProcessedProduct("Leavening agents, baking soda")).toBe(false);
  });
});

describe("isPreparedProduct", () => {
  it("drops wholly-prepared categories (composite foods with no brand/marker)", () => {
    expect(
      isPreparedProduct(
        "Breakfast Cereals",
        "Cereals ready-to-eat, corn flakes"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Soups, Sauces, and Gravies", "Sauce, barbecue")
    ).toBe(true);
    expect(
      isPreparedProduct("Meals, Entrees, and Side Dishes", "Lasagna, cheese")
    ).toBe(true);
    expect(isPreparedProduct("Snacks", "Snacks, potato chips")).toBe(true);
  });

  it("keeps generic beverages (coffee/tea) — packaged drinks fall to markers", () => {
    expect(isPreparedProduct("Beverages", "Beverages, coffee, brewed")).toBe(
      false
    );
    expect(
      isPreparedProduct("Beverages", "Beverages, tea, black, brewed")
    ).toBe(false);
  });

  it("drops composite dishes that leak into base categories (potato salad)", () => {
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potato salad, home-prepared"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potatoes, au gratin, home-prepared from recipe using butter"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Finfish and Shellfish Products", "Fish, tuna salad")
    ).toBe(true);
  });

  it("drops breaded/battered fried dishes but keeps simple cooked foods", () => {
    // Breaded fried chicken ("cooked, fried, flour") only matched a "flour"
    // search via its coating — a dish. French fries and breaded fish likewise.
    expect(
      isPreparedProduct(
        "Poultry Products",
        "Chicken, broilers or fryers, meat and skin, cooked, fried, flour"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potatoes, french fried, all types, salt added in processing"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Finfish and Shellfish Products",
        "Fish, fried, breaded"
      )
    ).toBe(true);
    // Simple cooked preparations stay — a plain fried egg is a reference food
    // like a scrambled egg, and a roast/pan-fried meat like a roast.
    expect(
      isPreparedProduct("Dairy and Egg Products", "Egg, whole, cooked, fried")
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Poultry Products",
        "Chicken, broilers or fryers, breast, meat only, cooked, roasted"
      )
    ).toBe(false);
  });

  it("keeps a base cooking oil that uses 'salad' as a descriptor", () => {
    // "salad or cooking" names a base oil, not a salad dish.
    expect(
      isPreparedProduct("Fats and Oils", "Oil, olive, salad or cooking")
    ).toBe(false);
    expect(
      isPreparedProduct("Fats and Oils", "Oil, soybean, salad or cooking")
    ).toBe(false);
  });

  it("drops confections in the mixed Sweets category", () => {
    expect(
      isPreparedProduct("Sweets", "Candies, milk chocolate, with almonds")
    ).toBe(true);
    expect(isPreparedProduct("Sweets", "Chocolate, dark, 70-85% cacao")).toBe(
      true
    );
    expect(isPreparedProduct("Sweets", "Jams and preserves")).toBe(true);
  });

  it("keeps bready staples in Baked Products, drops the sweet treats", () => {
    // Reference foods like a croissant stay; cake/cookies/doughnuts go.
    expect(isPreparedProduct("Baked Products", "Croissants, butter")).toBe(
      false
    );
    expect(
      isPreparedProduct("Baked Products", "Bread, 100% whole wheat, commercial")
    ).toBe(false);
    expect(isPreparedProduct("Baked Products", "Bagels, plain, enriched")).toBe(
      false
    );
    expect(
      isPreparedProduct("Baked Products", "English muffins, plain, enriched")
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Baked Products",
        "Cake, angelfood, commercially prepared"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Baked Products", "Doughnuts, cake-type, plain, glazed")
    ).toBe(true);
    expect(isPreparedProduct("Baked Products", "Cookies, chocolate")).toBe(
      true
    );
  });

  it("keeps single-ingredient sweeteners in Sweets (honey, sugar, cocoa)", () => {
    expect(isPreparedProduct("Sweets", "Honey")).toBe(false);
    expect(isPreparedProduct("Sweets", "Sugars, granulated")).toBe(false);
    expect(isPreparedProduct("Sweets", "Cocoa, dry powder, unsweetened")).toBe(
      false
    );
    expect(isPreparedProduct("Sweets", "Molasses")).toBe(false);
  });

  it("keeps base-ingredient categories and records with no category", () => {
    expect(
      isPreparedProduct("Fruits and Fruit Juices", "Apples, fuji, raw")
    ).toBe(false);
    expect(isPreparedProduct("Dairy and Egg Products", "Cheese, cheddar")).toBe(
      false
    );
    expect(isPreparedProduct("Fats and Oils", "Oil, olive")).toBe(false);
    expect(isPreparedProduct(undefined, "Some food, raw")).toBe(false);
  });
});

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
    // query is prefix-wildcarded (banana -> banana*) to match while typing, plus
    // a lowercaseDescription.keyword boost that floats name-leading foods first.
    const fetchSpy = mockFetchOk();

    await searchFdc("banana", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=banana%20banana*%20lowercaseDescription.keyword%3Abanana*%5E500&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("wildcards each token so partial multi-word queries still match", async () => {
    const fetchSpy = mockFetchOk();

    await searchFdc("  greek yog  ", "TEST_KEY");

    // Every token is wildcarded; the head boost uses the first token's prefix.
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=greek%20yog%20greek*%20yog*%20lowercaseDescription.keyword%3Agreek*%5E500&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("does not double-append a wildcard the caller already supplied", async () => {
    const fetchSpy = mockFetchOk();

    await searchFdc("bana*", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=bana%20bana*%20lowercaseDescription.keyword%3Abana*%5E500&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("sends the bare token too, so a stemmed word is reachable", async () => {
    // FDC's description index is stemmed and a wildcard term is matched
    // literally against the stored terms, never analysed: "balsamic" is indexed
    // as "balsam", so `balsamic*` matched nothing and searching balsamic
    // returned no balsamic vinegar. The bare token stems the same way the index
    // did and finds it; FDC ORs the clauses, so the wildcard still covers
    // mid-typing prefixes.
    const fetchSpy = mockFetchOk();

    await searchFdc("balsamic", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=balsamic%20balsamic*%20lowercaseDescription.keyword%3Abalsamic*%5E500&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
    );
  });

  it("lowercases the query so a phone's capitalised word still matches", async () => {
    // Both targets hold lowercase text and a wildcard term is matched literally
    // (never analysed), so "Banana*" would match nothing. A phone capitalises the
    // first word and its predictive bar inserts capitalised words, which is how
    // this reached a user: the same search worked on a desktop and returned
    // nothing on a phone.
    const fetchSpy = mockFetchOk();

    await searchFdc("Banana", "TEST_KEY");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=banana%20banana*%20lowercaseDescription.keyword%3Abanana*%5E500&dataType=Foundation,SR%20Legacy&api_key=TEST_KEY"
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
            description: "Bananas, ripe and slightly ripe",
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

    // Deduplication should leave 3 entries: ripe (non-raw), raw (Foundation), overripe raw
    expect(results).toHaveLength(3);

    // Raw foods sort to the top (isRaw before the ripe, non-raw entry), then the
    // comma tiebreak orders the two raw ones: "Bananas, raw" (1 comma -> 3)
    // before "Bananas, overripe, raw" (2 commas -> 2); the ripe entry ranks last.
    expect(results[0].entity).toBe("fdc:103"); // Bananas, raw
    expect(results[1].entity).toBe("fdc:104"); // Bananas, overripe, raw
    expect(results[2].entity).toBe("fdc:101"); // Bananas, ripe and slightly ripe
  });

  it("ranks grapes first for a partial query still short of a whole word", async () => {
    // "grap" prefix-matches grape, grapefruit and grape leaves alike, so none
    // reaches the whole-word tier yet. The head-completeness tiebreaker floats
    // the closest completion ("Grapes") above grapefruit (a longer word) and
    // grape leaves (an unmatched second head word) before the user finishes.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 501,
            description: "Grapefruit, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 502,
            description: "Grape leaves, raw",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 503,
            description: "Grapes, red, seedless, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const order = (await searchFdc("grap", "KEY")).map((r) => r.entity);

    expect(order[0]).toBe("fdc:503"); // Grapes leads
    expect(order.indexOf("fdc:503")).toBeLessThan(order.indexOf("fdc:501"));
    expect(order.indexOf("fdc:503")).toBeLessThan(order.indexOf("fdc:502"));
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
            description: "Soy milk, original, plain, refrigerated", // both tokens
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 203,
            description: "Soy milk, plain, shelf stable", // both tokens
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("Soy milk", "KEY");

    // The two soy-milk foods (both tokens) come first, in FDC's original order;
    // the milk-only rice milk falls to the bottom despite leading the raw list.
    expect(results[0].entity).toBe("fdc:202"); // Soy milk, original
    expect(results[1].entity).toBe("fdc:203"); // Soy milk, plain
    expect(results[2].entity).toBe("fdc:201"); // Beverages, rice milk
  });

  it("ranks the searched fruit above prefix-only lookalikes (grape vs grapefruit)", async () => {
    // `grape*` prefix-matches grapefruit and grape leaves too, and FDC floats
    // them up. The head-phrase / whole-word tiers must put the actual grapes
    // first: "Grapes, ..." (head is the query) > "Grape leaves, raw" / "Tomatoes,
    // grape, raw" (grape is a whole word) > "Grapefruit, raw" (grape is a prefix).
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 301,
            description: "Grapefruit, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 302,
            description: "Grape leaves, raw",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 303,
            description: "Grapes, red, seedless, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 304,
            description: "Tomatoes, grape, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("grape", "KEY");
    const order = results.map((r) => r.entity);

    // The real grape leads; grapefruit (prefix-only) sinks below every
    // whole-word "grape" match despite its tidy single-comma ", raw" name.
    expect(order[0]).toBe("fdc:303"); // Grapes, red, seedless, raw
    expect(order.indexOf("fdc:303")).toBeLessThan(order.indexOf("fdc:301"));
    expect(order.indexOf("fdc:302")).toBeLessThan(order.indexOf("fdc:301"));
    expect(order.indexOf("fdc:304")).toBeLessThan(order.indexOf("fdc:301")); // grape tomatoes (whole word) > grapefruit
  });

  it("drops packaged/processed rows (canned, soda) from the results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 601,
            description: "Grapes, red, seedless, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 602,
            description: "Grapes, canned, thompson seedless, heavy syrup pack",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 603,
            description: "Beverages, carbonated, grape soda",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const ids = (await searchFdc("grape", "KEY")).map((r) => r.entity);

    expect(ids).toEqual(["fdc:601"]); // only the raw grape survives
  });

  it("drops prepared-category rows (a Sweets confection) from the results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 701,
            description: "Nuts, almonds, whole, raw",
            dataType: "Foundation",
            foodCategory: "Nut and Seed Products",
            foodNutrients: [],
          },
          {
            fdcId: 702,
            description: "Candies, milk chocolate, with almonds",
            dataType: "SR Legacy",
            foodCategory: "Sweets",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const ids = (await searchFdc("almond", "KEY")).map((r) => r.entity);

    expect(ids).toEqual(["fdc:701"]); // the candy is dropped by category
  });

  it("drops brand-specific SR Legacy rows from the results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 401,
            description: "Grapes, red, seedless, raw",
            dataType: "Foundation",
            foodNutrients: [],
          },
          {
            fdcId: 402,
            description: "Grape leaves, raw",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 403,
            description: "Beverages, OCEAN SPRAY, Cran Grape",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("grape", "KEY");
    const ids = results.map((r) => r.entity);

    // The generic grapes and grape leaves survive; the OCEAN SPRAY drink is gone.
    expect(ids).toContain("fdc:401");
    expect(ids).toContain("fdc:402");
    expect(ids).not.toContain("fdc:403");
  });

  it("deduplicates the same food across datasets by ndbNumber despite differing descriptions", async () => {
    // The real chia case: USDA carries one food as two records with unrelated
    // descriptions across Foundation and SR Legacy, linked only by ndbNumber.
    // Keying dedup on the description leaves both; keying on ndbNumber collapses
    // them, and the Foundation re-sample (nicer description) wins.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 170554,
            description: "Seeds, chia seeds, dried",
            dataType: "SR Legacy",
            ndbNumber: 12006,
            foodNutrients: [],
          },
          {
            fdcId: 2710819,
            description: "Chia seeds, dry, raw",
            dataType: "Foundation",
            ndbNumber: 12006,
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("chia", "KEY");

    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe("fdc:2710819"); // Foundation re-sample wins
    expect(results[0].attributes["food/name"]).toBe("Chia seeds, dry, raw");
  });

  it("keeps records with no ndbNumber distinct, deduping them by description", async () => {
    // The fallback path: a record lacking ndbNumber must not collide with other
    // ndbNumber-less records on `undefined`; each stays keyed by its description.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 301,
            description: "Homemade trail mix",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
          {
            fdcId: 302,
            description: "Homemade granola",
            dataType: "SR Legacy",
            foodNutrients: [],
          },
        ],
      }),
    } as Response);

    const results = await searchFdc("homemade", "KEY");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.entity).sort()).toEqual(["fdc:301", "fdc:302"]);
  });
});
