import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig: it reads the
// mirrored archives with Node built-ins only, like the mirror check beside it.
// @ts-ignore
import {
  PANEL_ROWS,
  reportsField,
  createCoverageTally,
  pairTwins,
  descriptionTokens,
  jaccard,
  summarisePairSimilarity,
  energyProfile,
  reconcilesWithMacros,
  summariseEnergy,
  summariseMergedEnergy,
  formatCoverageTable,
  BUNDLE_PANEL,
  NUTRIENT_MASS_PANEL,
  panelEntries,
  bundleFood,
  mergeBundleFoods,
  buildBundle,
  serialiseBundle,
  gzippedBytes,
  unitsByField,
} from "../../scripts/usda-coverage.mjs";
import { PANEL_FIELDS } from "../../src/lib/food/usda-fdc";

// The measurement behind the completeness table in research note #108. What it
// answers is narrow: how many records of a bulk dataset report a panel field at
// all. Presence, not quality — a reported zero counts, a missing assay does not.

interface BulkNutrient {
  nutrient: { id: number };
  amount?: number | null;
}
const food = (nutrients: BulkNutrient[], ndbNumber?: number) => ({
  ndbNumber,
  foodNutrients: nutrients,
});
const reported = (id: number, amount: number = 1) => ({
  nutrient: { id },
  amount,
});

describe("reportsField — what counts as a reported value", () => {
  it("counts an entry carrying a non-null amount", () => {
    expect(reportsField(food([reported(1079, 2.4)]), [1079])).toBe(true);
  });

  it("counts a reported zero, which is a measurement like any other", () => {
    expect(reportsField(food([reported(1079, 0)]), [1079])).toBe(true);
  });

  it("does not count an entry whose amount is null or absent", () => {
    expect(
      reportsField(food([{ nutrient: { id: 1079 }, amount: null }]), [1079])
    ).toBe(false);
    expect(reportsField(food([{ nutrient: { id: 1079 } }]), [1079])).toBe(
      false
    );
  });

  it("does not count a nutrient the field is not carried by", () => {
    expect(reportsField(food([reported(1087)]), [1079, 2033])).toBe(false);
  });

  it("counts the field under any of the ids that carry it", () => {
    // Some Foundation foods report fibre only under AOAC 2011.25, and the app
    // reads either (ADR-0045 §3), so the measurement has to as well.
    expect(reportsField(food([reported(2033, 1.6)]), [1079, 2033])).toBe(true);
  });

  it("reads a food with no nutrients at all as reporting nothing", () => {
    expect(reportsField({ foodNutrients: [] }, [1079])).toBe(false);
    expect(reportsField({}, [1079])).toBe(false);
  });
});

describe("createCoverageTally — presence over a whole dataset", () => {
  const rows = [
    { label: "Fibre", ids: [1079, 2033] },
    { label: "B12", ids: [1178] },
  ];

  it("counts the records reporting each field, out of the records seen", () => {
    const tally = createCoverageTally(rows);
    tally.add(food([reported(1079, 2.4), reported(1178, 0.2)]));
    tally.add(food([reported(2033, 1.6)]));
    tally.add(food([reported(1087)]));
    expect(tally.total()).toEqual({
      records: 3,
      present: { Fibre: 2, B12: 1 },
    });
  });

  it("starts every row at zero, so an unmeasured field reads as measured absence", () => {
    expect(createCoverageTally(rows).total()).toEqual({
      records: 0,
      present: { Fibre: 0, B12: 0 },
    });
  });
});

describe("pairTwins — the twinned foods between two datasets", () => {
  const foundation = new Map([
    [9050, "Blueberries, raw"],
    [11090, "Broccoli, raw"],
    [16158, "Hummus, commercial"],
  ]);

  it("pairs the ndbNumbers both datasets carry, keeping both descriptions", () => {
    const { pairs, untwinned } = pairTwins(
      foundation,
      new Map([
        [9050, "Blueberries, raw"],
        [16158, "Hummus, home prepared"],
        [9999, "Something else"],
      ])
    );
    expect(pairs).toEqual([
      { ndbNumber: 9050, base: "Blueberries, raw", twin: "Blueberries, raw" },
      {
        ndbNumber: 16158,
        base: "Hummus, commercial",
        twin: "Hummus, home prepared",
      },
    ]);
    expect(untwinned).toBe(1);
  });

  it("counts every base food as untwinned when nothing pairs", () => {
    expect(pairTwins(foundation, new Map()).untwinned).toBe(3);
  });

  it("refuses to pair on an absent ndbNumber", () => {
    // A record with no ndbNumber is unjoinable, not a match for every other
    // record without one.
    const { pairs, untwinned } = pairTwins(
      new Map<number | undefined | null, string>([
        [undefined, "Foundation food with no number"],
        [null, "Another"],
        [9050, "Blueberries, raw"],
      ]),
      new Map<number | undefined | null, string>([
        [undefined, "SR food with no number"],
        [9050, "Blueberries, raw"],
      ])
    );
    expect(pairs.map((p: { ndbNumber: number }) => p.ndbNumber)).toEqual([
      9050,
    ]);
    expect(untwinned).toBe(0);
  });
});

describe("descriptionTokens — how a description is cut up for comparison", () => {
  it("lowercases and splits on everything that is not a letter or digit", () => {
    expect([...descriptionTokens("Beans, snap (green), raw")]).toEqual([
      "beans",
      "snap",
      "green",
      "raw",
    ]);
  });

  it("drops tokens under three characters, which carry no varietal signal", () => {
    expect([...descriptionTokens("Oats, w/ salt")]).toEqual(["oats", "salt"]);
  });

  it("counts a repeated word once", () => {
    expect([...descriptionTokens("Milk, milk, milk")]).toEqual(["milk"]);
  });
});

describe("jaccard — how alike two token sets are", () => {
  const of = (...words: string[]) => new Set(words);

  it("scores identical sets 1 and disjoint sets 0", () => {
    expect(jaccard(of("blueberries", "raw"), of("blueberries", "raw"))).toBe(1);
    expect(jaccard(of("blueberries"), of("broccoli"))).toBe(0);
  });

  it("scores an overlap as the shared tokens over all of them", () => {
    expect(
      jaccard(of("oats", "rolled"), of("oats", "steel", "cut"))
    ).toBeCloseTo(1 / 4);
  });

  it("scores two empty sets 0 rather than dividing by nothing", () => {
    expect(jaccard(of(), of())).toBe(0);
  });
});

describe("summarisePairSimilarity — how sound the ndbNumber link is", () => {
  const pair = (ndbNumber: number, base: string, twin: string) => ({
    ndbNumber,
    base: { description: base },
    twin: { description: twin },
  });

  it("reports the median, and the tail the median hides", () => {
    const summary = summarisePairSimilarity([
      pair(1, "Blueberries, raw", "Blueberries, raw"),
      pair(2, "Broccoli, raw", "Broccoli, raw"),
      // Weak but joinable: shares "soy", so it is tail rather than nonsense.
      pair(
        3,
        "Soy milk, unsweetened, plain",
        "Soy beverage, all flavors, with calcium, vitamins added"
      ),
    ]);
    expect(summary.pairs).toBe(3);
    expect(summary.median).toBe(1);
    expect(summary.identical).toBe(2);
    expect(summary.belowHalf).toBe(1);
    expect(summary.noSharedToken).toBe(0);
  });

  it("averages the two middle scores when the pair count is even", () => {
    // The median is the figure ADR-0045 quotes, so which convention produced it
    // is part of the measurement, not an implementation detail.
    const summary = summarisePairSimilarity([
      pair(1, "aaa", "aaa"),
      pair(2, "aaa", "bbb"),
      pair(3, "aaa bbb", "aaa ccc"),
      pair(4, "aaa", "aaa"),
    ]);
    expect(summary.median).toBeCloseTo((1 / 3 + 1) / 2);
  });

  it("counts a pair whose descriptions share no token at all", () => {
    const summary = summarisePairSimilarity([pair(1, "oats", "porridge")]);
    expect(summary.noSharedToken).toBe(1);
    expect(summary.median).toBe(0);
  });

  it("names the weakest pairs, worst first, so the tail can be read", () => {
    const summary = summarisePairSimilarity([
      pair(1, "aaa bbb", "aaa bbb"),
      pair(2, "oats", "porridge"),
      pair(3, "aaa bbb", "aaa ccc"),
    ]);
    expect(
      summary.weakest.map((w: { ndbNumber: number }) => w.ndbNumber)
    ).toEqual([2, 3, 1]);
    expect(summary.weakest[0].score).toBe(0);
  });
});

describe("formatCoverageTable — the table the correction quotes", () => {
  it("names the denominator in each column heading", () => {
    const table = formatCoverageTable([
      {
        name: "USDA Foundation",
        total: { records: 363, present: { Fibre: 202 } },
      },
      {
        name: "USDA SR Legacy",
        total: { records: 7793, present: { Fibre: 7168 } },
      },
    ]);
    expect(table).toContain("USDA Foundation (363)");
    expect(table).toContain("USDA SR Legacy (7,793)");
  });

  it("reports each field as a whole-number percentage of its own denominator", () => {
    const table = formatCoverageTable([
      {
        name: "USDA Foundation",
        total: { records: 363, present: { Fibre: 202, B12: 64 } },
      },
    ]);
    expect(table).toContain("| Fibre | 56% |");
    expect(table).toContain("| B12 | 18% |");
  });
});

describe("PANEL_ROWS — the fields the note's completeness table names", () => {
  it("measures each field under the same ids the app fills it from", () => {
    // The ids are restated rather than imported, because the measurement is a
    // plain-Node script and the panel is app TypeScript. This is what keeps the
    // restatement honest: a measured completeness that stopped describing what
    // the panel can fill would misdescribe the app while looking right.
    for (const row of PANEL_ROWS as { field: string; ids: number[] }[]) {
      const field = PANEL_FIELDS.find((f) => f.key === row.field);
      expect(field, `no panel field named ${row.field}`).toBeDefined();
      expect(field?.ids, row.field).toEqual(row.ids);
    }
  });

  it("carries every row of the §4 table, in the note's order", () => {
    expect(PANEL_ROWS.map((row: { label: string }) => row.label)).toEqual([
      "Energy",
      "Protein",
      "Carbohydrate",
      "Fibre",
      "Saturated fat",
      "Sodium",
      "Calcium",
      "Iron",
      "Vitamin C",
      "Vitamin D",
      "Vitamin A",
      "B12",
      "Folate",
    ]);
  });
});

// Energy is the one panel field USDA never measures: every value in both bulk
// archives is calculated from the macros beside it, under one of two Atwater
// factor systems. That is what makes the twin merge worth checking — a borrowed
// calorie is a calculation over another record's macros.

const nutrient = (id: number, amount: number) => ({
  nutrient: { id },
  amount,
});
const bulkFood = (
  description: string,
  nutrients: { nutrient: { id: number }; amount: number }[],
  factors?: {
    proteinValue: number;
    fatValue: number;
    carbohydrateValue: number;
  }
) => ({
  description,
  foodNutrients: nutrients,
  nutrientConversionFactors: factors
    ? [{ type: ".CalorieConversionFactor", ...factors }]
    : [],
});

describe("energyProfile — what a record says about its own calories", () => {
  it("reads the energy the panel would show, and names which id carried it", () => {
    // Foundation omits 1008 and publishes Atwater factors instead; the app
    // prefers 1008, then general, then specific (ADR-0045 §3).
    const profile = energyProfile(
      bulkFood("Blueberries, raw", [
        nutrient(2047, 63.9),
        nutrient(2048, 57.4),
        nutrient(1003, 0.703),
        nutrient(1004, 0.306),
        nutrient(1005, 14.6),
      ])
    );
    expect(profile.basis).toBe(2047);
    // Both systems are published; only one is what the panel shows.
    expect(profile.published).toEqual([2047, 2048]);
    expect(profile.kcal).toBe(63.9);
    expect(profile.protein).toBe(0.703);
    expect(profile.carbohydrate).toBe(14.6);
  });

  it("keeps the derivation code, which says whether USDA calculated or imputed it", () => {
    const food = bulkFood("x", [nutrient(2047, 165)]);
    food.foodNutrients[0].foodNutrientDerivation = { code: "NC" };
    expect(energyProfile(food).derivation).toBe("NC");
    expect(energyProfile(bulkFood("y", [nutrient(2047, 165)])).derivation).toBe(
      "unstated"
    );
    expect(energyProfile(bulkFood("z", [])).derivation).toBe(null);
  });

  it("prefers 1008 where a record carries it", () => {
    expect(
      energyProfile(bulkFood("x", [nutrient(1008, 57), nutrient(2047, 63.9)]))
        .basis
    ).toBe(1008);
  });

  it("reports no basis at all for a record that reports no energy", () => {
    const profile = energyProfile(
      bulkFood("Oil, canola", [nutrient(1004, 100)])
    );
    expect(profile.basis).toBe(null);
    expect(profile.kcal).toBeUndefined();
    expect(profile.fat).toBe(100);
  });

  it("keeps the record's own calorie factors when it publishes them", () => {
    const profile = energyProfile(
      bulkFood("Hummus, commercial", [nutrient(1008, 100)], {
        proteinValue: 3.47,
        fatValue: 8.37,
        carbohydrateValue: 4.07,
      })
    );
    expect(profile.factors).toEqual({
      proteinValue: 3.47,
      fatValue: 8.37,
      carbohydrateValue: 4.07,
    });
  });
});

describe("reconcilesWithMacros — is the stated energy the macros times its factors", () => {
  const macros = [nutrient(1003, 10), nutrient(1004, 5), nutrient(1005, 20)];

  it("checks a general-factor energy against 4/4/9", () => {
    // 4(10) + 4(20) + 9(5) = 165
    expect(
      reconcilesWithMacros(
        energyProfile(bulkFood("x", [nutrient(2047, 165), ...macros]))
      )
    ).toBe(true);
    expect(
      reconcilesWithMacros(
        energyProfile(bulkFood("x", [nutrient(2047, 140), ...macros]))
      )
    ).toBe(false);
  });

  it("checks a specific-factor energy against the record's own factors", () => {
    // 3(10) + 4(20) + 8(5) = 150, which 4/4/9 would put at 165
    const food = bulkFood("x", [nutrient(2048, 150), ...macros], {
      proteinValue: 3,
      fatValue: 8,
      carbohydrateValue: 4,
    });
    expect(reconcilesWithMacros(energyProfile(food))).toBe(true);
  });

  it("falls back to general factors for a 1008 energy with no factors published", () => {
    expect(
      reconcilesWithMacros(
        energyProfile(bulkFood("x", [nutrient(1008, 165), ...macros]))
      )
    ).toBe(true);
  });

  it("allows a point of rounding, since the archives publish three significant figures", () => {
    expect(
      reconcilesWithMacros(energyProfile(bulkFood("x", [nutrient(2047, 166)])))
    ).toBeUndefined();
    expect(
      reconcilesWithMacros(
        energyProfile(bulkFood("x", [nutrient(2047, 166), ...macros]))
      )
    ).toBe(true);
  });

  it("cannot answer for a record missing energy or a macro", () => {
    expect(
      reconcilesWithMacros(energyProfile(bulkFood("x", macros)))
    ).toBeUndefined();
    expect(
      reconcilesWithMacros(
        energyProfile(bulkFood("x", [nutrient(2047, 165), nutrient(1003, 10)]))
      )
    ).toBeUndefined();
  });
});

describe("summariseEnergy — how a dataset states its calories", () => {
  it("counts the basis each record used, and whether energy travels with its macros", () => {
    const summary = summariseEnergy([
      energyProfile(
        bulkFood("a", [
          nutrient(2047, 165),
          nutrient(1003, 10),
          nutrient(1004, 5),
          nutrient(1005, 20),
        ])
      ),
      energyProfile(bulkFood("b", [nutrient(1008, 100), nutrient(1003, 25)])),
      energyProfile(bulkFood("c", [nutrient(1004, 100)])),
    ]);
    expect(summary.records).toBe(3);
    expect(summary.basis).toEqual({ 1008: 1, 2047: 1, 2048: 0, none: 1 });
    expect(summary.publishing).toEqual({ 1008: 1, 2047: 1, 2048: 0 });
    expect(summary.derivations).toEqual({ unstated: 2 });
    // "b" states energy without a full macro set behind it
    expect(summary.energyWithoutFullMacros).toBe(1);
    expect(summary.reconciling).toBe(1);
    expect(summary.measurable).toBe(1);
  });
});

describe("summariseMergedEnergy — what the twin merge does to a calorie", () => {
  const profile = (
    kcal: number | undefined,
    p?: number,
    fat?: number,
    c?: number
  ) =>
    energyProfile(
      bulkFood("x", [
        ...(kcal === undefined ? [] : [nutrient(2047, kcal)]),
        ...(p === undefined ? [] : [nutrient(1003, p)]),
        ...(fat === undefined ? [] : [nutrient(1004, fat)]),
        ...(c === undefined ? [] : [nutrient(1005, c)]),
      ])
    );

  it("counts a pair that borrows the calorie itself", () => {
    const summary = summariseMergedEnergy([
      {
        ndbNumber: 1,
        base: profile(undefined, undefined, 100),
        twin: profile(884, 0, 100, 0),
      },
    ]);
    expect(summary.energyBorrowed).toBe(1);
    expect(summary.macroBorrowedUnderEnergy).toBe(0);
  });

  it("counts the case that would break the panel: a macro borrowed under the base's own energy", () => {
    const summary = summariseMergedEnergy([
      {
        ndbNumber: 1,
        base: profile(165, 10, 5, undefined),
        twin: profile(200, 12, 6, 20),
      },
    ]);
    expect(summary.macroBorrowedUnderEnergy).toBe(1);
    expect(summary.energyBorrowed).toBe(0);
  });

  it("reports whether the merge moved a panel's coherence at all", () => {
    const summary = summariseMergedEnergy([
      {
        ndbNumber: 1,
        base: profile(165, 10, 5, 20),
        twin: profile(165, 10, 5, 20),
      },
      {
        ndbNumber: 2,
        base: profile(165, 10, 5, 20),
        twin: profile(999, 99, 99, 99),
      },
    ]);
    expect(summary.coherenceMeasurable).toBe(2);
    expect(summary.coherenceUnchanged).toBe(2);
  });
});

// Sizing the offline bundle ADR-0045's last consequence leaves open (#120). The
// question is narrow: how many gzipped bytes are the two archives, merged as
// Decision 2 merges them and trimmed to the panel the app fills?

const panelNutrient = (id: number, amount: number, unitName = "G") => ({
  nutrient: { id, unitName },
  amount,
});
const panelFood = (
  fdcId: number,
  description: string,
  nutrients: ReturnType<typeof panelNutrient>[],
  ndbNumber?: number
) => ({ fdcId, description, ndbNumber, foodNutrients: nutrients });

describe("BUNDLE_PANEL — the whole panel a bundled subset would have to carry", () => {
  it("is the app's PANEL_FIELDS, key for key and id for id", () => {
    // The §4 rows measure thirteen fields; a bundle carries all of them, so the
    // two lists have to be locked together or the size describes a narrower
    // panel than the one that would ship.
    expect(
      BUNDLE_PANEL.map(({ key, ids }: { key: string; ids: number[] }) => ({
        key,
        ids,
      }))
    ).toEqual(PANEL_FIELDS.map(({ key, ids }) => ({ key, ids: [...ids] })));
  });

  it("is twenty-three fields, of which twenty-one are the nutrient masses", () => {
    // "A 21-nutrient panel" is what the original estimate said it trimmed to.
    // The twenty-one are the gram-valued nutrients: the panel less energy,
    // which USDA calculates rather than assays, and less the mono + poly sum.
    expect(BUNDLE_PANEL).toHaveLength(23);
    expect(NUTRIENT_MASS_PANEL).toHaveLength(21);
    expect(
      NUTRIENT_MASS_PANEL.map((field: { key: string }) => field.key)
    ).not.toContain("calories");
    expect(
      NUTRIENT_MASS_PANEL.map((field: { key: string }) => field.key)
    ).not.toContain("unsaturated_fat_content");
  });
});

describe("panelEntries — the values a bundle would carry out of one record", () => {
  it("takes the first id present, in the app's preference order", () => {
    const entries = panelEntries(
      panelFood(1, "x", [panelNutrient(1050, 12), panelNutrient(1005, 14.6)])
    );
    expect(entries.carbohydrate_content).toEqual({ amount: 14.6, unit: "G" });
  });

  it("keeps the published amount and its unit rather than normalising", () => {
    // A bundle ships what USDA published; mg -> g is the mapper's job at read
    // time, and doing it here would measure float noise as bytes.
    const entries = panelEntries(
      panelFood(1, "x", [panelNutrient(1093, 0.3, "MG")])
    );
    expect(entries.sodium_content).toEqual({ amount: 0.3, unit: "MG" });
  });

  it("sums the two unsaturated ids, as the panel does", () => {
    const entries = panelEntries(
      panelFood(1, "x", [panelNutrient(1292, 0.1), panelNutrient(1293, 0.2)])
    );
    expect(entries.unsaturated_fat_content).toEqual({
      amount: 0.3,
      unit: "G",
    });
  });

  it("omits a field the record does not report", () => {
    const entries = panelEntries(panelFood(1, "x", [panelNutrient(1003, 1)]));
    expect("fiber_content" in entries).toBe(false);
    expect(Object.keys(entries)).toEqual(["protein_content"]);
  });

  it("omits a field whose entry carries no amount", () => {
    const entries = panelEntries({
      foodNutrients: [{ nutrient: { id: 1003, unitName: "G" }, amount: null }],
    });
    expect(Object.keys(entries)).toEqual([]);
  });
});

describe("mergeBundleFoods — the fill-only merge, at bundle scale", () => {
  const base = panelFood(
    1,
    "Blueberries, raw",
    [panelNutrient(2047, 63.9), panelNutrient(1003, 0.703)],
    9050
  );
  const twin = panelFood(
    2,
    "Blueberries, raw (SR)",
    [panelNutrient(1008, 57), panelNutrient(1079, 2.4)],
    9050
  );

  it("fills only what the base does not carry, and never its energy", () => {
    const { record, filled } = mergeBundleFoods(
      bundleFood(base),
      bundleFood(twin)
    );
    expect(record.values.calories).toBe(63.9);
    expect(record.values.fiber_content).toBe(2.4);
    expect(filled).toEqual(["fiber_content"]);
  });

  it("keeps the base record's identity, so the entity id does not move", () => {
    const { record } = mergeBundleFoods(bundleFood(base), bundleFood(twin));
    expect(record.id).toBe(1);
    expect(record.description).toBe("Blueberries, raw");
  });
});

describe("buildBundle — the merged population a bundle would ship", () => {
  const foundation = [
    bundleFood(panelFood(1, "Twinned", [panelNutrient(1003, 1)], 100)),
    bundleFood(panelFood(2, "Foundation only", [panelNutrient(1003, 2)], 200)),
  ];
  const srLegacy = [
    bundleFood(panelFood(3, "Twinned, older", [panelNutrient(1079, 3)], 100)),
    bundleFood(panelFood(4, "SR only", [panelNutrient(1003, 4)], 300)),
  ];

  it("counts each twinned food once, not once per dataset", () => {
    const bundle = buildBundle(foundation, srLegacy);
    expect(bundle.records).toHaveLength(3);
    expect(bundle.twinned).toBe(1);
    expect(bundle.records.map((r: { id: number }) => r.id)).toEqual([1, 2, 4]);
  });

  it("reports how many panel fields the merge borrowed", () => {
    expect(buildBundle(foundation, srLegacy).filled).toBe(1);
  });

  it("keeps a record with no ndbNumber rather than joining it to every other", () => {
    const orphan = bundleFood(panelFood(5, "Unjoinable", [], undefined));
    const bundle = buildBundle([...foundation, orphan], [...srLegacy, orphan]);
    expect(bundle.records).toHaveLength(5);
    expect(bundle.twinned).toBe(1);
  });
});

describe("serialiseBundle — what gets gzipped", () => {
  const record = bundleFood(
    panelFood(9050, "Blueberries, raw", [
      panelNutrient(1079, 2.4),
      panelNutrient(2047, 63.9),
    ])
  );

  it("writes identity plus the reported fields, in panel order", () => {
    expect(serialiseBundle([record])).toBe(
      '[{"id":9050,"description":"Blueberries, raw","calories":63.9,"fiber_content":2.4}]'
    );
  });

  it("writes only the fields it was asked for, so a trim can be sized", () => {
    expect(serialiseBundle([record], NUTRIENT_MASS_PANEL)).toBe(
      '[{"id":9050,"description":"Blueberries, raw","fiber_content":2.4}]'
    );
  });
});

describe("gzippedBytes — the figure the record quotes", () => {
  it("measures the deflated size of the text it is given", () => {
    const text = serialiseBundle([
      bundleFood(panelFood(1, "x", [panelNutrient(1003, 1)])),
    ]);
    expect(gzippedBytes(text)).toBeGreaterThan(0);
    expect(gzippedBytes(text)).toBeLessThan(Buffer.byteLength(text) + 32);
  });

  it("is deterministic, so a published number can be re-derived", () => {
    const text = serialiseBundle(
      Array.from({ length: 50 }, (_, i) =>
        bundleFood(panelFood(i, `Food ${i}`, [panelNutrient(1003, i)]))
      )
    );
    expect(gzippedBytes(text)).toBe(gzippedBytes(text));
  });
});

describe("unitsByField — is a unit a property of the field or of the record", () => {
  it("collects every unit a field's values are published in", () => {
    const units = unitsByField([
      bundleFood(panelFood(1, "a", [panelNutrient(1093, 1, "MG")])),
      bundleFood(panelFood(2, "b", [panelNutrient(1093, 2, "MG")])),
      bundleFood(panelFood(3, "c", [panelNutrient(1114, 3, "UG")])),
    ]);
    expect([...units.get("sodium_content")]).toEqual(["MG"]);
    expect([...units.get("vitamin_d")]).toEqual(["UG"]);
  });

  it("shows a field published two ways, which a bundle could not ship unitless", () => {
    const units = unitsByField([
      bundleFood(panelFood(1, "a", [panelNutrient(1114, 1, "UG")])),
      bundleFood(panelFood(2, "b", [panelNutrient(1114, 2, "IU")])),
    ]);
    expect(units.get("vitamin_d")?.size).toBe(2);
  });
});
