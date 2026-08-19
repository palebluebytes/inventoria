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
  formatCoverageTable,
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
    base,
    twin,
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
