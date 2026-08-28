import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// A plain-Node ops script, deliberately outside the app's tsconfig: it reads the
// mirrored archives with Node built-ins only, like the backup and coverage
// scripts beside it.
// @ts-ignore
// @ts-ignore
import {
  APP_EXPORTS,
  FOOD_KIND_EXPORTS,
  VARIANT_DROP_EXPORTS,
  TWIN_LEDGER_EXPORTS,
} from "../../scripts/usda-app-module.mjs";
// @ts-ignore
import {
  BUNDLE_DATASETS,
  buildCorpus,
  applyVariantDrops,
  applyShippedNames,
  assertAdjudicatedVariantsShip,
  assertTwinNamesRetrieve,
  bundleArchives,
  groupByIdentity,
  projectArchiveFood,
} from "../../scripts/usda-bundle.mjs";
// @ts-ignore
import {
  ROW_MACRO_KEYS,
  SCHEMA_VERSION,
  buildArtifacts,
  buildIndexRow,
  buildNutrientEntry,
  collectNutrientDictionary,
  generatedFrom,
  serialiseIndex,
  serialiseNutrientStore,
} from "../../scripts/usda-artifacts.mjs";
import {
  compileReferenceFoodQuery,
  plainSiblingsOf,
  readReferenceFoodName,
} from "../../src/lib/food/reference-food-ranking";
import { reportsNoEnergy } from "../../src/lib/food/nutrition";
import {
  ADJUDICATED_NAMES,
  resolveShippedNames,
  stripNonNamingQualifiers,
} from "../../src/lib/food/usda-shipped-name";
import {
  TWIN_LEDGER,
  SPLIT_TWIN_NDB_NUMBERS,
  SUPERSEDED_RECORDS,
  SUPERSEDED_FDC_IDS,
} from "../../src/lib/food/usda-twin-ledger";
import * as usdaFdc from "../../src/lib/food/usda-fdc";
import {
  PANEL_FIELDS,
  fdcIdentityKey,
  fdcReportsNoEnergy,
  stripArchiveBoilerplate,
  twinSearchAliases,
  mapFdcFoodToPayload,
  mapFdcPortions,
  resolveFdcGroup,
  type FdcFood,
} from "../../src/lib/food/usda-fdc";
import {
  isBrandSpecific,
  isDryBasisRecord,
  isManufacturingInput,
  isPreparedProduct,
  isProcessedProduct,
} from "../../src/lib/food/usda-food-kind";
import {
  resolveVariantDrops,
  ADJUDICATED_VARIANTS,
} from "../../src/lib/food/usda-variant-drops";

// The generation step behind ADR-0047: USDA's bulk archives reduced to the two
// artifacts the app ships. What matters here is that the bundled row is exactly
// the row a live search would have produced, and that regenerating the same
// corpus is a no-op diff.

/** The app's own logic, in the shape `usda-bundle.mjs` loads it through esbuild. */
const app = {
  isBrandSpecific,
  isProcessedProduct,
  isPreparedProduct,
  isDryBasisRecord,
  isManufacturingInput,
  resolveVariantDrops,
  ADJUDICATED_VARIANTS,
  fdcReportsNoEnergy,
  fdcIdentityKey,
  resolveFdcGroup,
  stripArchiveBoilerplate,
  twinSearchAliases,
  mapFdcFoodToPayload,
  mapFdcPortions,
  TWIN_LEDGER,
  SPLIT_TWIN_NDB_NUMBERS,
  SUPERSEDED_RECORDS,
  SUPERSEDED_FDC_IDS,
  plainSiblingsOf,
};

/**
 * The one ranking export the ROWS are built from (ADR-0055 §6). The rest of
 * `RANKING_EXPORTS` is the vocabulary's, and never reaches `buildArtifacts`.
 */
const BUNDLE_RANKING_EXPORTS = ["plainSiblingsOf"];

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

describe("what the generator borrows, and what it never restates", () => {
  it("covers everything the corpus and the rows are built from", () => {
    // The roster lives in `usda-app-module.mjs`; what this pins is that the
    // generator's own stub uses all of it and nothing else, so a call site added
    // here without a roster entry fails rather than reaching a bare undefined.
    // Four rosters, because the twin ledger (ADR-0051), the food-kind
    // judgements (#146) and ADR-0061's variant rules are each reached through
    // the same seam from a module of their own — all four are borrowed, none is
    // restated.
    expect(
      [
        ...APP_EXPORTS,
        ...FOOD_KIND_EXPORTS,
        ...VARIANT_DROP_EXPORTS,
        ...TWIN_LEDGER_EXPORTS,
        ...BUNDLE_RANKING_EXPORTS,
      ].sort()
    ).toEqual(Object.keys(app).sort());
  });

  it("builds the corpus from Foundation and SR Legacy alone", () => {
    expect(BUNDLE_DATASETS).toEqual(["Foundation Foods", "SR Legacy"]);
  });

  // ── ADR-0048 §6: one predicate, and no second one ─────────────────────────
  // The behavioural tests below hold the generator and the food card to the same
  // ANSWER; these two hold them to the same EXPRESSION, which an exact copy
  // would otherwise satisfy silently. A restated id list is the specific drift
  // ADR-0047 §4's import-don't-copy rule exists to prevent.

  it("never states what counts as energy where the corpus is generated", () => {
    const script = readFileSync("scripts/usda-bundle.mjs", "utf8");
    // `ROW_MACRO_KEYS` names "calories" as a key to read off the mapped payload,
    // which is not a claim about which ids carry it and not a test of presence.
    expect(script).not.toMatch(/\b(?:1008|2047|2048)\b/);
    expect(script).not.toMatch(/ENERGY_IDS/);
    expect(script).not.toMatch(/calories\s*(?:===|!==|==|!=|\?\?)/);
  });

  it("asks the panel's own question rather than re-deriving it", () => {
    const app = readFileSync("src/lib/food/usda-fdc.ts", "utf8");
    const body =
      /export function fdcReportsNoEnergy\([\s\S]*?\n}/.exec(app)?.[0] ?? "";

    expect(body).toContain("reportsNoEnergy(buildNutritionPanel(");
    // An id loop here would answer the same way today and diverge the first time
    // `ENERGY_IDS` changed.
    expect(body).not.toMatch(/\b(?:1008|2047|2048)\b/);
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

describe("groupByIdentity — collecting the two records USDA holds for one food", () => {
  /** A projected record, as `projectArchiveFood` hands one over. */
  const projected = (
    fdcId: number,
    description: string,
    ndbNumber?: number
  ) => ({
    food: {
      fdcId,
      description,
      dataType: "SR Legacy",
      foodNutrients: [],
      ...(ndbNumber === undefined ? {} : { ndbNumber }),
    },
  });

  it("groups the pair under one key and leaves a lone record alone", () => {
    const groups = groupByIdentity(
      [
        projected(1, "Grapes", 9132),
        projected(2, "Grapes, raw", 9132),
        projected(3, "Pears", 9999),
      ],
      app
    );
    expect([...groups.keys()]).toEqual([9132, 9999]);
    expect(groups.get(9132)).toHaveLength(2);
  });

  it("keys through the app's own fdcIdentityKey, not a mirror of it", () => {
    // The key decides WHICH records merge, so a copy here would let the bundled
    // corpus pair twins a live search never paired.
    const foods = [
      projected(1, "Chia seeds, dry, raw", 12006),
      projected(2, "  Cocoa Nibs "),
    ];
    expect([...groupByIdentity(foods, app).keys()]).toEqual(
      foods.map(({ food }) => fdcIdentityKey(food, SPLIT_TWIN_NDB_NUMBERS))
    );
    expect(fdcIdentityKey(foods[1].food, SPLIT_TWIN_NDB_NUMBERS)).toBe(
      "desc:cocoa nibs"
    );
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
  // Energy by default, because a row without it no longer ships (ADR-0048 §5):
  // these cases are about the food-kind filters, so each food carries the one
  // measurement that keeps it loggable and the energy tests below override it.
  const energy = {
    nutrientId: 1008,
    nutrientName: "Energy",
    value: 69,
    unitName: "kcal",
  };
  const entry = (
    fdcId: number,
    description: string,
    over: Partial<FdcFood> = {}
  ): { food: FdcFood; foodPortions: [] } => ({
    food: {
      fdcId,
      description,
      dataType: "SR Legacy",
      foodNutrients: [energy],
      foodCategory: "Fruits and Fruit Juices",
      ...over,
    },
    foodPortions: [],
  });

  it("keeps a reference food and drops each kind the filters exist to drop", () => {
    const corpus = buildCorpus(
      groupByIdentity(
        [
          entry(1, "Grapes, red or green, raw"),
          entry(2, "Grapefruit juice, white, unsweetened, OCEAN SPRAY"),
          entry(3, "Grapes, canned, heavy syrup pack"),
          entry(4, "Potato salad, home-prepared", {
            foodCategory: "Vegetables and Vegetable Products",
          }),
        ],
        app
      ),
      app
    );
    expect(
      corpus.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([1]);
    expect(corpus.dropped).toEqual({
      brand_specific: 1,
      processed: 1,
      prepared: 1,
      dry_basis: 0,
      manufacturing_input: 0,
      no_energy: 0,
      superseded: 0,
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

    const built = buildCorpus(groupByIdentity(corpus, app), app);
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
      groupByIdentity(
        [
          entry(900, "Pears, raw"),
          entry(100, "Grapes, raw"),
          entry(500, "Apples, raw"),
        ],
        app
      ),
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
          {
            nutrientId: 1008,
            nutrientName: "Energy",
            value: 57,
            unitName: "kcal",
          },
        ],
      },
      foodPortions: [{ amount: 1, gramWeight: 999, modifier: "cup" }],
    };

    for (const order of [
      [foundation, twin],
      [twin, foundation],
    ]) {
      const [survivor] = buildCorpus(
        groupByIdentity(order, app),
        app
      ).survivors;
      expect(survivor.food.fdcId).toBe(11);
      // Fill-only: the base's own protein survives, the twin's fibre arrives.
      const values = Object.fromEntries(
        survivor.food.foodNutrients.map(
          (n: { nutrientId: number; value: number }) => [n.nutrientId, n.value]
        )
      );
      expect(values).toEqual({ 1003: 0.5, 1079: 2.4, 1008: 57 });
      expect(survivor.merged_from).toHaveLength(1);
      expect(survivor.merged_from[0].filled_fields).toEqual([
        "calories",
        "fiber_content",
      ]);
      // Portions come from the base record: a borrowed gram weight would
      // describe a different sample than the description names.
      expect(survivor.foodPortions[0].gramWeight).toBe(148);
    }
  });

  // ── ADR-0048 §5: two more filters, after the merge ────────────────────────

  it("drops a dry-basis assay and a record that reports no energy, each on its own tally", () => {
    const corpus = buildCorpus(
      groupByIdentity(
        [
          entry(1, "Beans, black, mature seeds, raw"),
          entry(2, "Beans, Dry, Black (0% moisture)"),
          entry(3, "Oil, olive, extra virgin", {
            foodCategory: "Fats and Oils",
            foodNutrients: [
              {
                nutrientId: 1085,
                nutrientName: "Total fat (NLEA)",
                value: 100,
                unitName: "g",
              },
            ],
          }),
        ],
        app
      ),
      app
    );

    expect(
      corpus.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([1]);
    expect(corpus.dropped).toEqual({
      brand_specific: 0,
      processed: 0,
      prepared: 0,
      dry_basis: 1,
      manufacturing_input: 0,
      no_energy: 1,
      superseded: 0,
    });
  });

  it("keeps a measured zero — tap water is not the bug (§1)", () => {
    const corpus = buildCorpus(
      groupByIdentity(
        [
          entry(1, "Beverages, water, tap, drinking", {
            foodCategory: "Beverages",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 0,
                unitName: "kcal",
              },
            ],
          }),
        ],
        app
      ),
      app
    );

    expect(corpus.survivors).toHaveLength(1);
    expect(corpus.dropped.no_energy).toBe(0);
  });

  it("runs the energy filter AFTER the merge, so a twinned oil survives on its twin's energy", () => {
    // The load-bearing ordering: `Oil, canola` (Foundation) reports no energy of
    // its own and borrows SR Legacy's 884 kcal along with its fat (ADR-0045 §2).
    // Filtering before `resolveFdcGroup` would drop it and four oils like it.
    const foundation = {
      food: {
        fdcId: 100258,
        description: "Oil, canola",
        dataType: "Foundation",
        ndbNumber: 4582,
        foodCategory: "Fats and Oils",
        foodNutrients: [
          {
            nutrientId: 1085,
            nutrientName: "Total fat (NLEA)",
            value: 94.5,
            unitName: "g",
          },
        ],
      },
      foodPortions: [],
    };
    const twin = {
      food: {
        fdcId: 171413,
        description: "Oil, canola",
        dataType: "SR Legacy",
        ndbNumber: 4582,
        foodCategory: "Fats and Oils",
        foodNutrients: [
          {
            nutrientId: 1008,
            nutrientName: "Energy",
            value: 884,
            unitName: "kcal",
          },
          {
            nutrientId: 1004,
            nutrientName: "Total lipid (fat)",
            value: 100,
            unitName: "g",
          },
        ],
      },
      foodPortions: [],
    };

    const built = buildCorpus(groupByIdentity([foundation, twin], app), app);
    expect(built.survivors).toHaveLength(1);
    expect(built.dropped.no_energy).toBe(0);
    // And it ships the twin's energy beside the twin's fat, not 94.5 g of NLEA
    // fat beside 884 kcal (ADR-0048 §2 — fat stays `1004`).
    const row = buildIndexRow(built.survivors[0], app);
    expect(row.macros).toEqual({ calories: 884, fat_content: 100 });
  });

  it("cannot disagree with the food card about what 'no energy' means", () => {
    // ADR-0048 §6, as a property rather than as an assertion about one row: the
    // survivors are exactly the foods whose MAPPED panel the card would accept,
    // because `fdcReportsNoEnergy` is written in terms of `reportsNoEnergy`.
    // A second predicate anywhere — an id list restated in the script, a
    // `macros.calories` check bolted on beside it — fails here.
    const corpus = [
      entry(1, "Grapes, red or green, raw"),
      entry(2, "Oil, olive, extra virgin", { foodNutrients: [] }),
      entry(3, "Beverages, water, tap, drinking", {
        foodCategory: "Beverages",
        foodNutrients: [
          {
            nutrientId: 1008,
            nutrientName: "Energy",
            value: 0,
            unitName: "kcal",
          },
        ],
      }),
      entry(4, "Blueberries, raw", {
        foodNutrients: [
          {
            nutrientId: 2047,
            nutrientName: "Energy (Atwater General)",
            value: 63.9,
            unitName: "kcal",
          },
        ],
      }),
      entry(5, "Watermelon, seedless, flesh only, raw", {
        foodNutrients: [
          {
            nutrientId: 1003,
            nutrientName: "Protein",
            value: 0.871,
            unitName: "g",
          },
        ],
      }),
    ];
    const cardWouldAccept = corpus
      .filter(
        ({ food }) =>
          !reportsNoEnergy(
            mapFdcFoodToPayload(food).attributes["nutrition/info"]
          )
      )
      .map(({ food }) => food.fdcId);

    const built = buildCorpus(groupByIdentity(corpus, app), app);
    expect(
      built.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual(cardWouldAccept);
    expect(cardWouldAccept).toEqual([1, 3, 4]);
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
    const [twin] = row.merged_from ?? [];
    expect(twin.source_uri).toContain("/food/22");
    expect(twin.filled_fields).toEqual(["fiber_content"]);
  });
});

describe("buildArtifacts — the plain-sibling flag (ADR-0055 §3)", () => {
  const survivor = (fdcId: number, description: string) => ({
    food: {
      fdcId,
      description,
      dataType: "SR Legacy",
      foodCategory: "Beverages",
      foodNutrients: [
        {
          nutrientId: 1008,
          nutrientName: "Energy",
          value: 83,
          unitName: "kcal",
        },
      ],
    },
    merged_from: [],
    foodPortions: [],
  });
  const flags = (descriptions: string[]) =>
    buildArtifacts(
      descriptions.map((d, i) => survivor(1000 + i, d)),
      [],
      app,
      { source: "off", licence: "ODbL", url: "u", sha256: "d", expansions: {} },
      { source: "hand", expansions: {} }
    ).index.foods.map((row) => row.plain_sibling);

  it("marks a row a plainer twin of it is a strict qualifier-prefix of", () => {
    expect(
      flags([
        "Alcoholic beverage, wine, table, white",
        "Alcoholic beverage, wine, table, white, Riesling",
        "Grapes, red, seedless, raw",
      ])
    ).toEqual([undefined, true, undefined]);
  });

  it("decides the flag over the whole corpus, not one row at a time", () => {
    // The parent is what makes the child a qualified form, so the answer cannot
    // be read off a description alone — which is why this is `buildArtifacts`'
    // job and not `buildIndexRow`'s.
    expect(flags(["Alcoholic beverage, wine, table, white, Riesling"])).toEqual(
      [undefined]
    );
  });

  it("never lets a row's alias make it its own parent", () => {
    // `Oil, corn` carries the alias "Oil, corn, industrial and retail, all
    // purpose salad or cooking", and fourteen rows are shaped like that. The
    // generator passes DESCRIPTIONS, so an alias has no way in.
    expect(flags(["Oil, corn"])).toEqual([undefined]);
  });
});

describe("buildNutrientEntry — every nutrient the record reports", () => {
  it("keys by nutrient id, sorted, in USDA's published unit", () => {
    const entry = buildNutrientEntry({
      merged_from: [],
      foodPortions: [],
      food: {
        fdcId: 1001,
        description: "Grapes, red or green, raw",
        dataType: "SR Legacy",
        foodNutrients: [
          {
            nutrientId: 1093,
            nutrientName: "Sodium",
            value: 2,
            unitName: "mg",
          },
          {
            nutrientId: 1003,
            nutrientName: "Protein",
            value: 0.72,
            unitName: "g",
          },
          {
            nutrientId: 1008,
            nutrientName: "Energy",
            value: 69,
            unitName: "kcal",
          },
        ],
      },
    });
    expect(Object.keys(entry)).toEqual(["1003", "1008", "1093"]);
    // Sodium stays 2 mg rather than becoming 0.002 g: normalising here would
    // store float noise, and the mapper normalises at read time anyway.
    expect(entry["1093"]).toBe(2);
  });
});

describe("assertTwinNamesRetrieve — no archived name left unanswerable", () => {
  const named = (fdcId: number, description: string) => ({
    food: { fdcId, description },
  });
  const groups = new Map([
    [11457, [named(1999633, "Spinach, mature"), named(168462, "Spinach, raw")]],
  ]);
  const ranking = {
    readReferenceFoodName,
    compileReferenceFoodQuery,
    stripArchiveBoilerplate,
  };

  it("passes when the surviving row carries the discarded name", () => {
    expect(
      assertTwinNamesRetrieve(
        groups,
        [
          {
            food: { fdcId: 1999633, description: "Spinach, mature" },
            also: ["Spinach, raw"],
          },
        ],
        ranking
      )
    ).toBe(2);
  });

  it("refuses a corpus whose surviving row lost a name USDA holds", () => {
    // The failure a future mirror refresh can introduce: a twin whose shape the
    // alias rule does not handle, discarded with nothing carrying it.
    expect(() =>
      assertTwinNamesRetrieve(
        groups,
        [{ food: { fdcId: 1999633, description: "Spinach, mature" } }],
        ranking
      )
    ).toThrow(/does not answer to it/);
  });

  it("looks for a name in the spelling an alias would carry", () => {
    // USDA's distribution note is stripped from an alias, so the check has to
    // ask for the food rather than for the note.
    expect(
      assertTwinNamesRetrieve(
        new Map([
          [
            1009,
            [
              named(1, "Cheese, cheddar"),
              named(
                2,
                "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)"
              ),
            ],
          ],
        ]),
        [{ food: { fdcId: 1, description: "Cheese, cheddar" } }],
        ranking
      )
    ).toBe(2);
  });

  it("says nothing about an identity every filter dropped", () => {
    expect(assertTwinNamesRetrieve(groups, [], ranking)).toBe(0);
  });
});

describe("applyVariantDrops — ADR-0061's variants of a food the corpus keeps", () => {
  const survivor = (fdcId: number, description: string) => ({
    food: { fdcId, description, foodNutrients: [] },
    merged_from: [],
    foodPortions: [],
  });
  // A head phrase read row by row, in miniature: a plain milk, a flavoured one,
  // a powder and a second fortification of the plain one.
  const milk = [
    survivor(171266, "Milk, producer, fluid, 3.7% milkfat"),
    survivor(
      170879,
      "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D"
    ),
    survivor(173454, "Milk, dry, whole, without added vitamin D"),
    survivor(
      172205,
      "Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D"
    ),
    survivor(
      746778,
      "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D"
    ),
    survivor(170875, "Milk, low sodium, fluid"),
  ];

  it("takes each rule's own casualties, and counts them apart", () => {
    const applied = applyVariantDrops(milk, app);
    expect(
      applied.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([171266, 172205]);
    expect(applied.variant_dropped).toEqual({
      flavoured_variant: 1,
      dehydrated_form: 1,
      fortification_duplicate: 1,
      adjudicated_variant: 1,
    });
  });

  it("refuses a corpus that has moved past a written verdict", () => {
    // The whole risk of a hand list, and the same failure `assertSupersededSurvive`
    // guards from the other side: a mirror refresh rewrites the description the
    // verdict was reached by reading, and nothing notices.
    //
    // Handed a one-entry roster the way `assertTwinNamesRetrieve`'s tests hand
    // it a one-entry ledger — the check reads the roster off the app module, so
    // narrowing it is how a test asks about one row instead of thirty.
    const one = {
      ...app,
      ADJUDICATED_VARIANTS: [[170875, "Milk, low sodium, fluid"]],
    };
    expect(() =>
      assertAdjudicatedVariantsShip(
        [survivor(170875, "Milk, low sodium, fluid, reformulated")],
        one
      )
    ).toThrow(/reached by reading the other name/);
    expect(() => assertAdjudicatedVariantsShip([], one)).toThrow(
      /no longer holds it/
    );
    expect(
      assertAdjudicatedVariantsShip(
        [survivor(170875, "Milk, low sodium, fluid")],
        one
      )
    ).toBe(1);
  });
});

describe("applyShippedNames — the hand-adjudicated names (ADR-0061 §5)", () => {
  const survivor = (fdcId: number, description: string) => ({
    food: { fdcId, description, foodNutrients: [] },
    merged_from: [],
    foodPortions: [],
  });
  const named = {
    ...app,
    resolveShippedNames,
    stripNonNamingQualifiers,
    ADJUDICATED_NAMES,
  };

  it("ships the milk under the name a reader was given, not USDA's", () => {
    const applied = applyShippedNames(
      [survivor(171266, "Milk, producer, fluid, 3.7% milkfat")],
      named
    );
    expect(applied.survivors[0].food.description).toBe(
      "Milk, whole, 3.7% milkfat"
    );
    expect(applied.adjudicated).toBe(1);
  });

  it("refuses a corpus that has moved past the published name", () => {
    expect(() =>
      applyShippedNames(
        [survivor(171266, "Milk, producer, fluid, 3.7 percent milkfat")],
        named
      )
    ).toThrow(/reached by reading the other name/);
  });
});

describe("bundleArchives — which datasets the bundle consumes", () => {
  const manifest = {
    archives: [
      { dataset: "Foundation Foods", file: "foundation.zip" },
      { dataset: "SR Legacy", file: "sr.zip" },
      { dataset: "Survey (FNDDS 2021-2023)", file: "survey.zip" },
    ],
  };

  it("selects the bundled datasets in the order they are read", () => {
    expect(bundleArchives(manifest).map((a) => a.dataset)).toEqual(
      BUNDLE_DATASETS
    );
  });

  it("leaves the Survey release out, since no Survey record can ship", () => {
    expect(bundleArchives(manifest).map((a) => a.file)).not.toContain(
      "survey.zip"
    );
  });

  it("refuses a manifest that has renamed a dataset out from under it", () => {
    // The defect this replaced was silent in exactly this situation: the audit
    // named a dataset the manifest no longer spelled that way, matched nothing,
    // and reported 5,432 ineligible records as corpus casualties (#137).
    expect(() =>
      bundleArchives({
        archives: [{ dataset: "Foundation Foods, 2026", file: "f.zip" }],
      })
    ).toThrow(/no "Foundation Foods" archive/);
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

describe("the committed artifacts", () => {
  // These are the bytes the app ships (ADR-0047 section 3). Nothing else reads
  // them yet — #113 and #114 are what will — so without this they would sit in
  // the repo unchecked until a hand-edit or a half-finished regeneration reached
  // a user.
  const manifest = JSON.parse(
    readFileSync("scripts/usda-backup.manifest.json", "utf8")
  );
  const read = (name: string) =>
    readFileSync(`public/usda/${name}.json`, "utf8");
  const indexText = read("search-index");
  const storeText = read("nutrient-store");
  const index = JSON.parse(indexText);
  const store = JSON.parse(storeText);

  it("is exactly what the generator writes, byte for byte", () => {
    // The strongest form the stability rule can take without the archives on
    // hand: re-serialising what is committed reproduces the committed file, so
    // a hand-edit, a reordering or a stray reformat fails here.
    expect(serialiseIndex(index)).toBe(indexText);
    expect(serialiseNutrientStore(store)).toBe(storeText);
  });

  it("names the archive releases and digests the manifest pins", () => {
    const pinned = generatedFrom(
      BUNDLE_DATASETS.map((dataset: string) =>
        manifest.archives.find(
          (a: { dataset: string }) => a.dataset === dataset
        )
      )
    );
    expect(index.generated_from).toEqual(pinned);
    expect(store.generated_from).toEqual(pinned);
  });

  it("carries the schema version both readers check", () => {
    expect(index.schema_version).toBe(SCHEMA_VERSION);
    expect(store.schema_version).toBe(SCHEMA_VERSION);
  });

  it("is sorted by fdcId, strictly ascending, with no duplicate food", () => {
    const ids = index.foods.map((row: { fdcId: number }) => row.fdcId);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds one nutrient-store entry per index row, and no orphans", () => {
    const ids = index.foods.map((row: { fdcId: number }) => String(row.fdcId));
    expect(Object.keys(store.foods).sort()).toEqual([...ids].sort());
  });

  it("names every nutrient id its foods report", () => {
    const named = new Set(Object.keys(store.nutrients));
    const reported = new Set(
      Object.values(store.foods).flatMap((entry) =>
        Object.keys(entry as Record<string, number>)
      )
    );
    for (const id of reported) expect(named.has(id)).toBe(true);
  });

  it("gives every row the macros a result list renders it by", () => {
    for (const row of index.foods)
      for (const key of Object.keys(row.macros))
        expect(ROW_MACRO_KEYS).toContain(key);
  });
});
