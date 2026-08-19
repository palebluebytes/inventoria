import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig: it reads the
// mirrored archives with Node built-ins only, like the backup and coverage
// scripts beside it.
// @ts-ignore
import {
  APP_EXPORTS,
  BUNDLE_DATASETS,
  ROW_MACRO_KEYS,
  SCHEMA_VERSION,
  buildCorpus,
  buildIndexRow,
  buildNutrientEntry,
  collectNutrientDictionary,
  groupByIdentity,
  identityKey,
  generatedFrom,
  projectArchiveFood,
  serialiseIndex,
  serialiseNutrientStore,
} from "../../scripts/usda-bundle.mjs";
import * as usdaFdc from "../../src/lib/food/usda-fdc";
import {
  PANEL_FIELDS,
  isBrandSpecific,
  isPreparedProduct,
  isProcessedProduct,
  mapFdcFoodToPayload,
  mapFdcPortions,
  resolveFdcGroup,
} from "../../src/lib/food/usda-fdc";

// The generation step behind ADR-0047: USDA's bulk archives reduced to the two
// artifacts the app ships. What matters here is that the bundled row is exactly
// the row a live search would have produced, and that regenerating the same
// corpus is a no-op diff.

/** The app's own logic, in the shape `usda-bundle.mjs` loads it through esbuild. */
const app = {
  isBrandSpecific,
  isProcessedProduct,
  isPreparedProduct,
  resolveFdcGroup,
  mapFdcFoodToPayload,
  mapFdcPortions,
};

/** One record in the bulk archives' own serialisation. */
const archiveFood = (over: Record<string, unknown> = {}) => ({
  fdcId: 1001,
  description: "Grapes, red or green, raw",
  dataType: "SR Legacy",
  ndbNumber: 9132,
  foodCategory: { description: "Fruits and Fruit Juices" },
  foodNutrients: [
    { nutrient: { id: 1003, name: "Protein", unitName: "g" }, amount: 0.72 },
  ],
  ...over,
});

const nutrient = (id: number, amount: number, unitName = "g", name = "n") => ({
  nutrient: { id, name, unitName },
  amount,
});

describe("APP_EXPORTS — the script borrows the app's logic instead of copying it", () => {
  it("names only real exports of usda-fdc.ts", () => {
    // The lock the ticket asks for: the survivor population is produced by the
    // app's own filters, so a rename there has to be followed here. Failing as a
    // test beats failing as a regeneration nobody runs for months.
    for (const name of APP_EXPORTS)
      expect(typeof (usdaFdc as Record<string, unknown>)[name]).toBe(
        "function"
      );
  });

  it("covers everything the corpus and the rows are built from", () => {
    expect([...APP_EXPORTS].sort()).toEqual(Object.keys(app).sort());
  });

  it("builds the corpus from Foundation and SR Legacy alone", () => {
    expect(BUNDLE_DATASETS).toEqual(["Foundation Foods", "SR Legacy"]);
  });
});

describe("ROW_MACRO_KEYS — what a search result row renders", () => {
  it("names panel fields the app fills, never a field of its own", () => {
    const panel = PANEL_FIELDS.map(({ key }) => key);
    for (const key of ROW_MACRO_KEYS) expect(panel).toContain(key);
  });
});

describe("projectArchiveFood — the archives' serialisation against the app's", () => {
  it("flattens a nutrient's nested id, name and unit", () => {
    const { food } = projectArchiveFood(archiveFood());
    expect(food.foodNutrients).toEqual([
      { nutrientId: 1003, nutrientName: "Protein", value: 0.72, unitName: "g" },
    ]);
  });

  it("flattens foodCategory from the archive's object to the API's string", () => {
    const { food } = projectArchiveFood(archiveFood());
    expect(food.foodCategory).toBe("Fruits and Fruit Juices");
  });

  it("drops a nutrient with no numeric amount, which is absence not a zero", () => {
    const { food } = projectArchiveFood(
      archiveFood({
        foodNutrients: [
          { nutrient: { id: 1079, unitName: "g" }, amount: null },
          { nutrient: { id: 1079, unitName: "g" } },
          nutrient(1079, 0),
        ],
      })
    );
    expect(food.foodNutrients.map((n: { value: number }) => n.value)).toEqual([
      0,
    ]);
  });

  it("omits ndbNumber, foodCategory and scientificName when the record has none", () => {
    const { food } = projectArchiveFood(
      archiveFood({ ndbNumber: null, foodCategory: undefined })
    );
    expect(food).not.toHaveProperty("ndbNumber");
    expect(food).not.toHaveProperty("foodCategory");
    expect(food).not.toHaveProperty("scientificName");
  });

  it("orders portions by sequenceNumber rather than by array position", () => {
    const { foodPortions } = projectArchiveFood(
      archiveFood({
        foodPortions: [
          { sequenceNumber: 2, amount: 1, gramWeight: 92 },
          { sequenceNumber: 1, amount: 1, gramWeight: 151 },
        ],
      })
    );
    expect(
      foodPortions.map((p: { gramWeight: number }) => p.gramWeight)
    ).toEqual([151, 92]);
  });
});

describe("identityKey — collecting the two records USDA holds for one food", () => {
  it("keys on ndbNumber, which is what links a Foundation re-sample to its twin", () => {
    expect(identityKey({ ndbNumber: 12006, description: "Chia seeds" })).toBe(
      12006
    );
  });

  it("falls back to a prefixed description so an id and a name cannot collide", () => {
    expect(identityKey({ description: "  Chia Seeds " })).toBe(
      "desc:chia seeds"
    );
  });

  it("groups the pair under one key and leaves a lone record alone", () => {
    const groups = groupByIdentity([
      { food: { ndbNumber: 9132, description: "Grapes" } },
      { food: { ndbNumber: 9132, description: "Grapes, raw" } },
      { food: { ndbNumber: 9999, description: "Pears" } },
    ]);
    expect([...groups.keys()]).toEqual([9132, 9999]);
    expect(groups.get(9132)).toHaveLength(2);
  });
});

describe("collectNutrientDictionary — one unit per nutrient id", () => {
  it("names each id once, with the unit USDA publishes it in", () => {
    const dictionary = collectNutrientDictionary([
      {
        foodNutrients: [
          { nutrientId: 1093, nutrientName: "Sodium, Na", unitName: "mg" },
        ],
      },
    ]);
    expect(dictionary.get(1093)).toEqual({ name: "Sodium, Na", unit: "mg" });
  });

  it("refuses an id reported in two units, which would make every amount ambiguous", () => {
    expect(() =>
      collectNutrientDictionary([
        {
          foodNutrients: [
            { nutrientId: 1093, nutrientName: "x", unitName: "mg" },
          ],
        },
        {
          foodNutrients: [
            { nutrientId: 1093, nutrientName: "x", unitName: "g" },
          ],
        },
      ])
    ).toThrow(/reported in both/);
  });
});

describe("buildCorpus — the ADR-0042 survivors, merged at generation time", () => {
  const entry = (
    fdcId: number,
    description: string,
    over: Record<string, unknown> = {}
  ) => ({
    food: {
      fdcId,
      description,
      dataType: "SR Legacy",
      foodNutrients: [],
      foodCategory: "Fruits and Fruit Juices",
      ...over,
    },
    foodPortions: [],
  });

  it("keeps a reference food and drops each kind the filters exist to drop", () => {
    const corpus = buildCorpus(
      groupByIdentity([
        entry(1, "Grapes, red or green, raw"),
        entry(2, "Grapefruit juice, white, unsweetened, OCEAN SPRAY"),
        entry(3, "Grapes, canned, heavy syrup pack"),
        entry(4, "Potato salad, home-prepared", {
          foodCategory: "Vegetables and Vegetable Products",
        }),
      ]),
      app
    );
    expect(
      corpus.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([1]);
    expect(corpus.dropped).toEqual({
      brand_specific: 1,
      processed: 1,
      prepared: 1,
    });
  });

  it("agrees with the app's filters run directly, food for food", () => {
    // The population is the app's, not a copy of it. Assert that over a corpus
    // spanning every guard the three filters carry: the caps stoplist, the
    // "raw is always a base ingredient" rule, the salad-oil rescue, the mixed
    // Sweets and Baked Products categories.
    const corpus = [
      entry(1, "Grapes, red or green, raw"),
      entry(
        2,
        "Cereals, farina, enriched, assorted brands including CREAM OF WHEAT"
      ),
      entry(3, "Cereals, CREAM OF WHEAT, dry"),
      entry(4, "Beef, short loin (NY strip steak), raw"),
      entry(5, "Lamb, leg, frozen, raw"),
      entry(6, "Oil, olive, salad or cooking", {
        foodCategory: "Fats and Oils",
      }),
      entry(7, "Honey", { foodCategory: "Sweets" }),
      entry(8, "Candies, milk chocolate, with almonds", {
        foodCategory: "Sweets",
      }),
      entry(9, "Croissants, butter", { foodCategory: "Baked Products" }),
      entry(10, "Cookies, chocolate chip", { foodCategory: "Baked Products" }),
      entry(11, "Soup, chicken noodle, canned", {
        foodCategory: "Soups, Sauces, and Gravies",
      }),
      entry(12, "Baking soda"),
      entry(13, "Chicken, breast, cooked, fried, flour"),
    ];
    const expected = corpus
      .filter(
        ({ food }) =>
          !isBrandSpecific(food.description) &&
          !isProcessedProduct(food.description) &&
          !isPreparedProduct(food.foodCategory, food.description)
      )
      .map(({ food }) => food.fdcId);

    const built = buildCorpus(groupByIdentity(corpus), app);
    expect(
      built.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual(expected);
    // Not vacuous: the corpus has to contain both verdicts for this to mean
    // anything.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(corpus.length);
  });

  it("sorts by fdcId, so the artifact's order is the key rather than arrival", () => {
    const built = buildCorpus(
      groupByIdentity([
        entry(900, "Pears, raw"),
        entry(100, "Grapes, raw"),
        entry(500, "Apples, raw"),
      ]),
      app
    );
    expect(
      built.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([100, 500, 900]);
  });

  it("merges a twinned pair fill-only, keeping the Foundation base's identity", () => {
    const foundation = {
      food: {
        fdcId: 11,
        description: "Blueberries, raw",
        dataType: "Foundation",
        ndbNumber: 9050,
        foodNutrients: [
          {
            nutrientId: 1003,
            nutrientName: "Protein",
            value: 0.5,
            unitName: "g",
          },
        ],
      },
      foodPortions: [{ amount: 1, gramWeight: 148, modifier: "cup" }],
    };
    const twin = {
      food: {
        fdcId: 22,
        description: "Blueberries, raw (SR)",
        dataType: "SR Legacy",
        ndbNumber: 9050,
        foodNutrients: [
          {
            nutrientId: 1003,
            nutrientName: "Protein",
            value: 0.9,
            unitName: "g",
          },
          {
            nutrientId: 1079,
            nutrientName: "Fiber",
            value: 2.4,
            unitName: "g",
          },
        ],
      },
      foodPortions: [{ amount: 1, gramWeight: 999, modifier: "cup" }],
    };

    for (const order of [
      [foundation, twin],
      [twin, foundation],
    ]) {
      const [survivor] = buildCorpus(groupByIdentity(order), app).survivors;
      expect(survivor.food.fdcId).toBe(11);
      // Fill-only: the base's own protein survives, the twin's fibre arrives.
      const values = Object.fromEntries(
        survivor.food.foodNutrients.map(
          (n: { nutrientId: number; value: number }) => [n.nutrientId, n.value]
        )
      );
      expect(values).toEqual({ 1003: 0.5, 1079: 2.4 });
      expect(survivor.merged_from).toHaveLength(1);
      expect(survivor.merged_from[0].filled_fields).toEqual(["fiber_content"]);
      // Portions come from the base record: a borrowed gram weight would
      // describe a different sample than the description names.
      expect(survivor.foodPortions[0].gramWeight).toBe(148);
    }
  });
});

describe("buildIndexRow — identity plus what a result row renders", () => {
  const survivor = (over: Record<string, unknown> = {}) => ({
    food: {
      fdcId: 1001,
      description: "Grapes, red or green, raw",
      dataType: "SR Legacy",
      foodCategory: "Fruits and Fruit Juices",
      foodNutrients: [
        {
          nutrientId: 1008,
          nutrientName: "Energy",
          value: 69,
          unitName: "kcal",
        },
        {
          nutrientId: 1003,
          nutrientName: "Protein",
          value: 0.72,
          unitName: "g",
        },
        { nutrientId: 1093, nutrientName: "Sodium", value: 2, unitName: "mg" },
      ],
    },
    merged_from: [],
    foodPortions: [],
    ...over,
  });

  it("carries the four macros the results list shows and nothing else of the panel", () => {
    const row = buildIndexRow(survivor(), app);
    expect(row.macros).toEqual({ calories: 69, protein_content: 0.72 });
    // Sodium is in the panel and not on a result row; it lives in the store.
    expect(row.macros).not.toHaveProperty("sodium_content");
  });

  it("writes identity, category and scientific name in a fixed key order", () => {
    const row = buildIndexRow(
      survivor({
        food: { ...survivor().food, scientificName: "Vitis vinifera" },
      }),
      app
    );
    expect(Object.keys(row)).toEqual([
      "fdcId",
      "description",
      "dataType",
      "foodCategory",
      "scientificName",
      "macros",
    ]);
  });

  it("maps portions to the food/portions shape and omits an empty list", () => {
    expect(buildIndexRow(survivor(), app)).not.toHaveProperty("portions");
    const row = buildIndexRow(
      survivor({
        foodPortions: [
          { amount: 1, gramWeight: 151, modifier: "cup" },
          // No usable weight: a portion the app cannot scale by is dropped.
          { amount: 1, gramWeight: 0, modifier: "handful" },
        ],
      }),
      app
    );
    expect(row.portions).toEqual([
      { label: "1 cup", amount: 1, unit: "cup", grams: 151 },
    ]);
  });

  it("omits merged_from where nothing was borrowed", () => {
    expect(buildIndexRow(survivor(), app)).not.toHaveProperty("merged_from");
    const row = buildIndexRow(
      survivor({
        merged_from: [
          {
            source_uri: "https://api.nal.usda.gov/fdc/v1/food/22",
            description: "Blueberries, raw (SR)",
            data_type: "SR Legacy",
            filled_fields: ["fiber_content"],
          },
        ],
      }),
      app
    );
    expect(row.merged_from[0].source_uri).toContain("/food/22");
    expect(row.merged_from[0].filled_fields).toEqual(["fiber_content"]);
  });
});

describe("buildNutrientEntry — every nutrient the record reports", () => {
  it("keys by nutrient id, sorted, in USDA's published unit", () => {
    const entry = buildNutrientEntry({
      food: {
        foodNutrients: [
          { nutrientId: 1093, value: 2, unitName: "mg" },
          { nutrientId: 1003, value: 0.72, unitName: "g" },
          { nutrientId: 1008, value: 69, unitName: "kcal" },
        ],
      },
    });
    expect(Object.keys(entry)).toEqual(["1003", "1008", "1093"]);
    // Sodium stays 2 mg rather than becoming 0.002 g: normalising here would
    // store float noise, and the mapper normalises at read time anyway.
    expect(entry["1093"]).toBe(2);
  });
});

describe("generatedFrom — the releases an artifact was built from", () => {
  it("names each archive's dataset, release, file and digest", () => {
    expect(
      generatedFrom([
        {
          dataset: "SR Legacy",
          release: "2018-04",
          file: "sr.zip",
          sha256: "abc",
          root_key: "SRLegacyFoods",
          records: 7793,
        },
      ])
    ).toEqual([
      {
        dataset: "SR Legacy",
        release: "2018-04",
        file: "sr.zip",
        sha256: "abc",
      },
    ]);
  });
});

describe("serialisation — stable, diffable, one food per line", () => {
  const index = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    foods: [
      { fdcId: 100, description: "Apples, raw" },
      { fdcId: 900, description: "Pears, raw" },
    ],
  };
  const store = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    nutrients: { 1003: { name: "Protein", unit: "g" } },
    foods: { 100: { 1003: 0.3 }, 900: { 1003: 0.4 } },
  };

  it("puts each index food on its own line, so a refresh diffs as changed foods", () => {
    const lines = serialiseIndex(index).trimEnd().split("\n");
    expect(lines).toContain('{"fdcId":100,"description":"Apples, raw"},');
    expect(lines).toContain('{"fdcId":900,"description":"Pears, raw"}');
  });

  it("puts each nutrient-store food on its own line, keyed by fdcId", () => {
    const lines = serialiseNutrientStore(store).trimEnd().split("\n");
    expect(lines).toContain('"100": {"1003":0.3},');
    expect(lines).toContain('"900": {"1003":0.4}');
  });

  it("names which artifact it is, and the schema a reader has to understand", () => {
    expect(JSON.parse(serialiseIndex(index))).toMatchObject({
      artifact: "usda-search-index",
      schema_version: SCHEMA_VERSION,
    });
    expect(JSON.parse(serialiseNutrientStore(store))).toMatchObject({
      artifact: "usda-nutrient-store",
      schema_version: SCHEMA_VERSION,
    });
  });

  it("round-trips through JSON.parse with every field intact", () => {
    expect(JSON.parse(serialiseIndex(index)).foods).toEqual(index.foods);
    const parsed = JSON.parse(serialiseNutrientStore(store));
    expect(parsed.foods).toEqual({ 100: { 1003: 0.3 }, 900: { 1003: 0.4 } });
    expect(parsed.nutrients).toEqual(store.nutrients);
  });

  it("is byte-identical on a second run, so regenerating is a no-op diff", () => {
    expect(serialiseIndex(index)).toBe(serialiseIndex(index));
    expect(serialiseNutrientStore(store)).toBe(serialiseNutrientStore(store));
  });

  it("writes an empty corpus without emitting a stray blank line", () => {
    expect(serialiseIndex({ ...index, foods: [] })).toContain('"foods": []');
  });
});
