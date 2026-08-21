import { describe, it, expect } from "vitest";
import {
  mapFdcFoodToPayload,
  mapFdcPortions,
  resolveFdcGroup,
  isBrandSpecific,
  isProcessedProduct,
  isPreparedProduct,
  isDryBasisRecord,
  isManufacturingInput,
  fdcReportsNoEnergy,
  type FdcFood,
  type FdcFoodPortion,
} from "../../src/lib/food/usda-fdc";
import { reportsNoEnergy } from "../../src/lib/food/nutrition";
import bananaSearch from "./support/fixtures/usda-fdc-banana.json";
import cheddarSearch from "./support/fixtures/usda-fdc-cheddar.json";
import bananaDetail from "./support/fixtures/usda-fdc-banana-detail.json";
import blueberriesSearch from "./support/fixtures/usda-fdc-blueberries.json";

// Seam 1 (ADR-0016 isolated-Mapper contract): feed the mapper a saved copy of a
// real USDA FoodData Central search response and assert the emitted
// `nutrition/info` panel. Fixtures are real captured DEMO_KEY responses, so the
// mapping is exercised against the real field shape — uppercase unit names, the
// full micronutrient list, sodium reported in mg — not a hand-built minimum.

const banana = bananaSearch.foods[0] as unknown as FdcFood;
const cheddar = cheddarSearch.foods[0] as unknown as FdcFood;
const detailPortions = bananaDetail.foodPortions as unknown as FdcFoodPortion[];

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

  it('reads the archives\' "µg" as micrograms, like the API\'s "UG"', () => {
    // The API writes "UG" and the bulk archives write "µg" with the MICRO SIGN,
    // and the bundled corpus (ADR-0047) is generated from the archives — so a
    // unit match that missed the micro sign would stage 316 µg of vitamin A as
    // 316 GRAMS of it, and freeze that into the log.
    const microSign: FdcFood = {
      fdcId: 9,
      description: "Micrograms, as the archives spell them",
      dataType: "Foundation",
      foodNutrients: [
        {
          nutrientId: 1106,
          nutrientName: "Vitamin A, RAE",
          value: 316,
          unitName: "µg",
        },
      ],
    };
    const n = mapFdcFoodToPayload(microSign).attributes["nutrition/info"];
    expect(n.vitamin_a).toBeCloseTo(0.000316, 8);
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

// ---- Seam 1: mapFdcPortions (foodPortions -> food/portions) ----------------
//
// The portion mapping outlived the detail fetch that used to feed it: ADR-0047
// §6 retires `/food/{fdcId}` and `scripts/usda-bundle.mjs` runs this over the
// bulk archives instead, so a staged food's measures ride on the generated row.
// The mapping itself is unchanged, and these cover it directly rather than
// through a mapper that no longer exists.

describe("mapFdcPortions", () => {
  it("maps foodPortions[] to an ordered food/portions list (ADR-0030)", () => {
    // Each portion resolves to its gramWeight; the label falls back to
    // amount + modifier when the record supplies no portionDescription.
    expect(mapFdcPortions(detailPortions)).toEqual([
      { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
      { label: "1 cup, sliced", amount: 1, unit: "cup, sliced", grams: 150 },
      { label: "1 large", amount: 1, unit: "large", grams: 136 },
    ]);
  });

  it("prefers a portionDescription label over the amount+unit fallback", () => {
    const portions = mapFdcPortions([
      {
        amount: 1,
        gramWeight: 57,
        portionDescription: "1 croissant",
        measureUnit: { name: "undetermined" },
      },
    ]);
    expect(portions[0].label).toBe("1 croissant");
    expect(portions[0].grams).toBe(57);
  });

  it("falls back to the named measureUnit when there is no modifier", () => {
    expect(
      mapFdcPortions([
        { amount: 2, gramWeight: 30, measureUnit: { name: "tbsp" } },
      ])
    ).toEqual([{ label: "2 tbsp", amount: 2, unit: "tbsp", grams: 30 }]);
  });

  it("maps a record with no portions to no portions at all", () => {
    // Emitted as nothing rather than as an empty measure: the caller omits
    // `food/portions` entirely for a food USDA gives no household measure for.
    expect(mapFdcPortions([])).toEqual([]);
  });

  it("skips portions with no usable gram weight", () => {
    expect(
      mapFdcPortions([
        { amount: 1, gramWeight: 0, modifier: "pinch" },
        { amount: 1, gramWeight: 40, modifier: "slice" },
      ])
    ).toEqual([{ label: "1 slice", amount: 1, unit: "slice", grams: 40 }]);
  });
});

// ---- the ADR-0042 filters, run once per generation (ADR-0047 §4) -----------

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

  it("drops a brand whose only caps token is the country it trades under", () => {
    // #131: "USA" sat in the generic-acronym safelist, so every "Vitasoy USA …"
    // record was waved through the caps rule — sixteen branded tofu and soymilk
    // rows reached the corpus. The safelist is for acronyms that describe a food
    // (USDA commodity, DHA/ARA), not for the incorporation suffix on a brand.
    expect(isBrandSpecific("Vitasoy USA, Nasoya Lite Firm Tofu")).toBe(true);
    expect(isBrandSpecific("Vitasoy USA Azumaya, Firm Tofu")).toBe(true);
    expect(
      isBrandSpecific("Vitasoy USA, Vitasoy Organic Creamy Original Soymilk")
    ).toBe(true);
    // The generic tofu the corpus keeps instead carries no caps token at all.
    expect(
      isBrandSpecific("Tofu, raw, firm, prepared with calcium sulfate")
    ).toBe(false);
  });

  it("drops a Title-Case trademark the caps rule cannot see", () => {
    // #131's other hole: a trademark USDA did not shout. There is no ALL-CAPS
    // token to find and no processing marker in the description, so only the
    // denylist catches these four.
    expect(
      isBrandSpecific(
        "Beverages, Powerade Zero Ion4, calorie-free, assorted flavors"
      )
    ).toBe(true);
    expect(isBrandSpecific("Reddi Wip Fat Free Whipped Topping")).toBe(true);
    expect(isBrandSpecific("Light ice cream, Creamsicle")).toBe(true);
    expect(
      isBrandSpecific(
        "Oil, vegetable, Natreon canola, high stability, non trans, high oleic (70%)"
      )
    ).toBe(true);
  });

  it("keeps the Title-Case cultivars and grades a proper-noun rule would eat", () => {
    // Why #131 denylists four records instead of widening to Title Case: 697
    // corpus rows carry a mid-description Title-Case token and nearly all name a
    // cultivar, grade, geography or varietal rather than a brand.
    expect(isBrandSpecific("Mango, Tommy Atkins, peeled, raw")).toBe(false);
    expect(isBrandSpecific("Eggs, Grade A, Large, egg white")).toBe(false);
    expect(
      isBrandSpecific("Alcoholic Beverage, wine, table, red, Pinot Noir")
    ).toBe(false);
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

  it("drops a boxed dry mix, and the food reconstituted from one (#144)", () => {
    // §5's head-word keep list was letting two cornbread mixes through under
    // `bread`; a dry mix is a boxed, barcoded product, so it is §4's line, not
    // §5's. All nine corpus rows carrying the phrase are mixes or a serving
    // made up from one.
    expect(
      isProcessedProduct(
        "Bread, cornbread, dry mix, enriched (includes corn muffin mix)"
      )
    ).toBe(true);
    expect(isProcessedProduct("Bread, stuffing, dry mix")).toBe(true);
    expect(
      isProcessedProduct("Biscuits, plain or buttermilk, dry mix, prepared")
    ).toBe(true);
    // The from-scratch cornbread beside them is a bready staple and stays.
    expect(
      isProcessedProduct(
        "Bread, cornbread, prepared from recipe, made with low fat (2%) milk"
      )
    ).toBe(false);
    // "mix" alone is not the marker: a dry seasoning is a pantry staple.
    expect(
      isProcessedProduct("Seasoning mix, dry, sazon, coriander & annatto")
    ).toBe(false);
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

  it("drops a fast-food item USDA filed outside Fast Foods", () => {
    // #133: USDA filed both milkshakes under Beverages, so PREPARED_CATEGORIES
    // never saw them and no dish marker described them — the marker set was
    // built for home-prepared dishes, and a milkshake is neither home-prepared
    // nor a base ingredient.
    expect(isPreparedProduct("Beverages", "Shake, fast food, vanilla")).toBe(
      true
    );
    expect(
      isPreparedProduct("Beverages", "Beverages, shake, fast food, strawberry")
    ).toBe(true);
  });

  it("drops an ice cream that names an assembled form, keeps the plain tub", () => {
    // #133: the signal is the wafer, biscuit, stick or coating around the ice
    // cream, not the ice cream. A plain tub is a base dairy food on the same
    // reasoning that keeps cheese and butter.
    const DAIRY = "Dairy and Egg Products";
    expect(isPreparedProduct(DAIRY, "Ice cream sandwich")).toBe(true);
    expect(isPreparedProduct(DAIRY, "Ice cream cookie sandwich")).toBe(true);
    expect(
      isPreparedProduct(
        DAIRY,
        "Ice cream bar, stick or nugget, with crunch coating"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(DAIRY, "Ice cream, bar or stick, chocolate covered")
    ).toBe(true);
    expect(isPreparedProduct(DAIRY, "Ice cream sundae cone")).toBe(true);
    expect(
      isPreparedProduct(
        DAIRY,
        "Ice cream, lowfat, no sugar added, cone, added peanuts and chocolate sauce"
      )
    ).toBe(true);

    expect(isPreparedProduct(DAIRY, "Ice cream, soft serve, chocolate")).toBe(
      false
    );
    expect(
      isPreparedProduct(DAIRY, "Ice cream, light, soft serve, chocolate")
    ).toBe(false);
    expect(
      isPreparedProduct(
        DAIRY,
        "Fat free ice cream, no sugar added, flavors other than chocolate"
      )
    ).toBe(false);
  });

  it("never matches 'sandwich' on its own — three base foods carry the word", () => {
    // Why the novelty rule is anchored to ice cream. A bare \\bsandwich\\b marker
    // would take a spread, a raw beef cut and a Navajo tortilla with it.
    expect(
      isPreparedProduct(
        "Legumes and Legume Products",
        "Sandwich spread, meatless"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Beef Products",
        "Beef, sandwich steaks, flaked, chopped, formed and thinly sliced, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Tortilla, includes plain and from mutton sandwich (Navajo)"
      )
    ).toBe(false);
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

  it("drops a confection the head-word keep list named after a staple (#144)", () => {
    // §5 keeps two mixed categories by head word, which cannot tell a staple
    // from a confection USDA happened to name after one. A pound cake filed as
    // "Bread, …" and a pancake table blend filed as "Syrups, …" both escaped.
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, pound cake type, pan de torta salvadoran"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, salvadoran sweet cheese (quesadilla salvadorena)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Baked Products", "Bread, pan dulce, sweet yeast bread")
    ).toBe(true);
    expect(isPreparedProduct("Baked Products", "Rolls, dinner, sweet")).toBe(
      true
    );
    expect(
      isPreparedProduct("Sweets", "Syrups, table blends, pancake, with butter")
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Sweets",
        "Syrups, table blends, corn, refiner, and sugar"
      )
    ).toBe(true);
    expect(isPreparedProduct("Sweets", "Syrups, chocolate, fudge-type")).toBe(
      true
    );
  });

  it("scopes the confection markers to the two mixed categories (#144)", () => {
    // "sweet" and "cake" are ordinary English elsewhere: 37 corpus rows say
    // "sweet" and 34 of them are not baked — sweet potatoes, sweetcorn, sweet
    // peppers, sweet cherries — and cake flour is flour. None of those rows is
    // in a category the escape hatch is consulted for, so none can be taken.
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Sweet potato, raw, unprepared"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Corn, sweet, white, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Cereal Grains and Pasta",
        "Wheat flour, white, cake, enriched"
      )
    ).toBe(false);
    // And the markers leave the staples the keep lists were written for.
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, whole-wheat, commercially prepared"
      )
    ).toBe(false);
    expect(isPreparedProduct("Sweets", "Syrups, maple")).toBe(false);
  });

  it("drops a stew but keeps the raw cut sold for one (#144)", () => {
    // Eight composite stews sit in `American Indian/Alaska Native Foods`, which
    // is not a prepared category, with no dish marker between them. The word is
    // the marker; "for stew" names what a raw retail cut is SOLD for, which is
    // the same shape as the salad-oil exemption beside it.
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Stew, mutton, corn, squash (Navajo)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Stew/soup, caribou (Alaska Native)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Acorn stew (Apache)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Beef Products",
        "Beef, chuck for stew, separable lean and fat, select, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Lamb, Veal, and Game Products",
        'Lamb, cubed for stew or kabob (leg and shoulder), separable lean only, trimmed to 1/4" fat, cooked, braised'
      )
    ).toBe(false);
  });

  it("drops a packaged dessert topping but keeps real whipped cream (#144)", () => {
    // USDA files the three whipped-topping products beside the dairy they
    // imitate. They are packaged desserts and belong to the barcode path; the
    // cream and the grated parmesan beside them are base dairy foods.
    expect(
      isPreparedProduct("Dairy and Egg Products", "Dessert topping, powdered")
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Dessert topping, pressurized"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Cream, whipped, cream topping, pressurized"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Parmesan cheese topping, fat free"
      )
    ).toBe(false);
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

// ── ADR-0045 §2/§3: the Foundation + SR Legacy twin merges fill-only ─────────
// The merge runs at generation time now (ADR-0047 §4) rather than per keystroke,
// but it is still this module's rule and `scripts/usda-bundle.mjs` reaches for
// this function rather than restating it. Asserted here against the two real
// records USDA returns for ndbNumber 9050 — the 2022 Foundation re-assay (26
// nutrients, no fibre, energy only as Atwater factors) and the 2019 SR Legacy
// record (106 nutrients, fibre 2.4 g, energy 57 kcal) — which is the shape the
// synthetic pair in `usda-bundle.test.ts` cannot show.

describe("resolveFdcGroup", () => {
  const blueberryGroup = blueberriesSearch.foods as unknown as FdcFood[];

  /** The group folded and mapped, as the generator maps a survivor. */
  function stage(group: FdcFood[]) {
    const { food, merged_from } = resolveFdcGroup(group);
    return mapFdcFoodToPayload(food, merged_from);
  }

  it("fills a Foundation food's missing panel fields from its SR Legacy twin", () => {
    const payload = stage(blueberryGroup);

    // The Foundation record stays the food: its id, its description.
    expect(payload.entity).toBe("fdc:2346411");
    const n = payload.attributes["nutrition/info"];
    // Fibre was absent from Foundation entirely and is borrowed.
    expect(n.fiber_content).toBe(2.4);
    // So is the micronutrient tail Foundation never measured.
    expect(n.vitamin_a).toBe(3e-6);
    expect(n.folate).toBe(6e-6);
  });

  it("keeps the Foundation value for a field both records carry", () => {
    const n = stage(blueberryGroup).attributes["nutrition/info"];

    // Calcium: Foundation 11.7 mg, SR Legacy 6.0 mg. The newer assay stands.
    expect(n.calcium).toBeCloseTo(0.0117, 6);
  });

  it("does not borrow energy when the base record reports it under another id", () => {
    // ADR-0045 §3: energy is ONE panel field carried by three ids. Foundation
    // reports it as Atwater general factors (2047), so SR Legacy's 1008 (57) is
    // not borrowed — 63.9 is the figure that reconciles with the Foundation
    // macros shown beside it, and is what USDA's own FNDDS record states.
    const n = stage(blueberryGroup).attributes["nutrition/info"];

    expect(n.calories).toBe(63.9);
  });

  it("names the twin and the borrowed fields in provenance", () => {
    const provenance = stage(blueberryGroup).attributes["twin/raw_provenance"];

    expect(provenance.raw_data.fdcId).toBe(2346411);
    expect(provenance.merged_from).toHaveLength(1);
    const [twin] = provenance.merged_from;
    expect(twin.source_uri).toBe("https://api.nal.usda.gov/fdc/v1/food/171711");
    expect(twin.data_type).toBe("SR Legacy");
    expect(twin.description).toBe("Blueberries, raw");
    expect(twin.filled_fields).toContain("fiber_content");
    expect(twin.filled_fields).not.toContain("calories");
  });

  it("merges the same way whichever record USDA lists first", () => {
    const payload = stage([...blueberryGroup].reverse());

    expect(payload.entity).toBe("fdc:2346411");
    const n = payload.attributes["nutrition/info"];
    expect(n.fiber_content).toBe(2.4);
    expect(n.calories).toBe(63.9);
  });

  it("leaves an unmerged food's provenance exactly as it was", () => {
    // A food with no twin carries no merged_from key at all — not an empty one.
    const provenance = stage([blueberryGroup[0]]).attributes[
      "twin/raw_provenance"
    ];

    expect(provenance).not.toHaveProperty("merged_from");
    expect(provenance.adapter_version).toBe("9");
  });
});

// ── ADR-0048: the two things that make a record unloggable ──────────────────
// Both are asked at generation time (`scripts/usda-bundle.mjs`), and the second
// is asked again at log time by the food card. What these lock is that they are
// asked in ONE place: `fdcReportsNoEnergy` is written in terms of the app's own
// `buildNutritionPanel` and `reportsNoEnergy`, so an id joining `ENERGY_IDS`
// moves both answers at once and neither can drift from the other.

describe("isDryBasisRecord", () => {
  it("drops the dry-basis assays USDA marks (0% moisture)", () => {
    expect(isDryBasisRecord("Beans, Dry, Black (0% moisture)")).toBe(true);
    expect(isDryBasisRecord("Beans, Dry, Dark Red Kidney (0% moisture)")).toBe(
      true
    );
  });

  it("keeps the dried beans anyone actually buys", () => {
    // The corpus holds 38 of these, with complete panels; the dry-basis record
    // beside them is a laboratory basis, not a second food (ADR-0048 §5).
    expect(isDryBasisRecord("Beans, black, mature seeds, raw")).toBe(false);
    expect(isDryBasisRecord("Beans, pinto, mature seeds, raw")).toBe(false);
  });

  it("does not fire on a description that merely says the word", () => {
    // Seven corpus rows say "moisture" without being a dry-basis assay — four
    // "(may contain additives to retain moisture)" and three low-moisture
    // mozzarellas. A bare /moisture/ would have taken every one of them.
    expect(
      isDryBasisRecord(
        "Fish, cod, Pacific, cooked, dry heat (may contain additives to retain moisture)"
      )
    ).toBe(false);
    expect(
      isDryBasisRecord("Cheese, mozzarella, whole milk, low moisture")
    ).toBe(false);
    expect(isDryBasisRecord("Beans, Dry, Black (12% moisture)")).toBe(false);
  });
});

describe("isManufacturingInput", () => {
  it("drops the ingredient specifications USDA marks 'industrial' (#144)", () => {
    // USDA's own word for a food-manufacturing input sold to a factory rather
    // than a food anyone logs. #144 named one row; the corpus held 45.
    expect(
      isManufacturingInput(
        "Oil, industrial, coconut, principal uses candy coatings, oil sprays, roasting nuts"
      )
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Oil, industrial, palm kernel (hydrogenated), confection fat, intermediate grade product"
      )
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Wheat flour, white (industrial), 11.5% protein, bleached, enriched"
      )
    ).toBe(true);
    expect(
      isManufacturingInput("Shortening industrial, lard and vegetable oil")
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Margarine, industrial, soy and partially hydrogenated soy oil, use for baking, sauces and candy"
      )
    ).toBe(true);
  });

  it("keeps the retail forms of everything it drops", () => {
    // A drop is only correct because a generic equivalent stayed: the flours
    // come back as Foundation's own rows, and the household fats keep theirs.
    expect(
      isManufacturingInput("Flour, wheat, all-purpose, enriched, bleached")
    ).toBe(false);
    expect(isManufacturingInput("Oil, olive, salad or cooking")).toBe(false);
    expect(
      isManufacturingInput("Shortening, vegetable, household, composite")
    ).toBe(false);
    expect(
      isManufacturingInput(
        "Margarine, regular, 80% fat, composite, stick, with salt"
      )
    ).toBe(false);
  });
});

describe("fdcReportsNoEnergy", () => {
  const food = (nutrients: FdcFood["foodNutrients"]): FdcFood => ({
    fdcId: 748608,
    description: "Oil, olive, extra virgin",
    dataType: "Foundation",
    foodNutrients: nutrients,
  });
  const n = (nutrientId: number, value: number) => ({
    nutrientId,
    nutrientName: "n",
    value,
    unitName: "KCAL",
  });

  it("is true for a record carrying no energy id at all", () => {
    // Foundation 748608 as USDA publishes it: 30 nutrients, none of them energy,
    // and not even total fat. This is the record #126 was reported against.
    expect(
      fdcReportsNoEnergy(
        food([
          { nutrientId: 1085, nutrientName: "n", value: 100, unitName: "G" },
        ])
      )
    ).toBe(true);
    expect(fdcReportsNoEnergy(food([]))).toBe(true);
  });

  it("is false under any of the three energy ids, not just 1008", () => {
    // The Atwater fallback ENERGY_IDS already reads is the whole of what counts
    // as energy here — a Foundation food reporting only 2047 ships.
    expect(fdcReportsNoEnergy(food([n(1008, 884)]))).toBe(false);
    expect(fdcReportsNoEnergy(food([n(2047, 63.9)]))).toBe(false);
    expect(fdcReportsNoEnergy(food([n(2048, 63.9)]))).toBe(false);
  });

  it("is false for a measured zero, so tap water keeps its record", () => {
    expect(fdcReportsNoEnergy(food([n(1008, 0)]))).toBe(false);
  });

  it("answers exactly what the food card answers about the mapped panel", () => {
    // The §6 clause, as a property: the generator holds an FdcFood and the card
    // holds a NutritionInfo, and the bridge is the app's own mapper. Every
    // combination of the three energy ids, present and absent, zero and not.
    const cases: FdcFood[] = [
      food([]),
      food([n(1008, 884)]),
      food([n(1008, 0)]),
      food([n(2047, 63.9)]),
      food([n(2048, 63.9)]),
      food([n(2047, 0)]),
      food([
        { nutrientId: 1003, nutrientName: "n", value: 0.87, unitName: "G" },
      ]),
    ];
    for (const c of cases) {
      const panel = mapFdcFoodToPayload(c).attributes["nutrition/info"];
      expect(fdcReportsNoEnergy(c)).toBe(reportsNoEnergy(panel));
    }
  });

  it("reads the merged record, so a twin's energy saves the base", () => {
    // ADR-0048 §5's ordering, at the predicate: the five twinned oils carry no
    // energy of their own and borrow SR Legacy's, so the filter must run on the
    // resolved food and not on the Foundation record that went into it.
    const base = food([]);
    const twin: FdcFood = {
      fdcId: 171413,
      description: "Oil, canola",
      dataType: "SR Legacy",
      foodNutrients: [n(1008, 884)],
    };
    expect(fdcReportsNoEnergy(base)).toBe(true);
    expect(fdcReportsNoEnergy(resolveFdcGroup([base, twin]).food)).toBe(false);
  });
});
