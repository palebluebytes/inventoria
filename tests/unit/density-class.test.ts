import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DENSITY_CLASSES,
  DENSITY_CLASS_BAR,
  REFUSED_DENSITY_CLASSES,
} from "../../src/lib/food/density-class";
// A plain-Node gate script, deliberately outside the app's tsconfig: it reads a
// file already in the repo and runs inside `pnpm check` (ADR-0108 §3).
// @ts-ignore
import {
  portionDensity,
  foodDensity,
  classStats,
  selectClass,
  driftFindings,
  refusalFindings,
} from "../../scripts/density-class-check.mjs";

// The measurement behind the Density Class table (ADR-0108 §2, #429).
//
// A density here is always grams per millilitre, derived from a USDA portion
// that states both: `1 tbsp = 13.5 g` is a measurement of the substance, and
// dividing by the millilitres in a tablespoon is the whole of the arithmetic.
//
// What it must refuse is the reason the figures are reproducible at all. A unit
// that merely CONTAINS a volume word — `cup, chopped`, `cup slices` — is a
// heaped solid, and its grams answer "how much fits in a cup when you chop it",
// which is a packing density and not the substance's. 423 portions in the
// shipped corpus are excluded on exactly that ground.

describe("portionDensity", () => {
  it("reads a density off a portion stated in a volume unit", () => {
    // Olive oil is ~0.913 g/ml, the figure this whole arc exists to reach.
    expect(
      portionDensity({ amount: 1, unit: "tbsp", grams: 13.5 })
    ).toBeCloseTo(0.913, 3);
  });

  it("refuses a unit that merely contains a volume word", () => {
    // `Cheese, cheddar` states `1 cup, diced = 132 g`. Read as a volume that is
    // 0.56 g/ml, which is cheddar with air between the cubes rather than
    // cheddar: the same food's `1 cup, melted` states 244 g.
    expect(portionDensity({ amount: 1, unit: "cup, diced", grams: 132 })).toBe(
      null
    );
    expect(portionDensity({ amount: 1, unit: "cup slices", grams: 132 })).toBe(
      null
    );
  });

  it("refuses a portion stated in no unit of volume at all", () => {
    expect(portionDensity({ amount: 1, unit: "slice", grams: 28 })).toBe(null);
  });
});

// A food states a density once, however many portions it happens to carry.
// `Oil, olive` states a cup, a tablespoon and a teaspoon; counting all three
// would let a food with more rows outvote one with fewer, and the class's n
// would stop being a count of foods. ADR-0108 §2's n is foods, its parenthetical
// is portions, and the figure is a median of medians.
describe("foodDensity", () => {
  it("takes the median of a food's volume portions, not their mean", () => {
    // Densities 1, 1 and 2: the median is 1 and the mean is 1.33.
    const food = {
      portions: [
        { amount: 1, unit: "cup", grams: 236.588 },
        { amount: 1, unit: "tbsp", grams: 14.787 },
        { amount: 1, unit: "tsp", grams: 9.858 },
      ],
    };
    expect(foodDensity(food)).toBeCloseTo(1, 6);
  });

  it("splits the difference when a food states an even number of them", () => {
    const food = {
      portions: [
        { amount: 1, unit: "cup", grams: 236.588 },
        { amount: 1, unit: "tbsp", grams: 29.574 },
      ],
    };
    expect(foodDensity(food)).toBeCloseTo(1.5, 6);
  });

  it("reads nothing off a food that states no volume portion", () => {
    expect(
      foodDensity({ portions: [{ amount: 1, unit: "slice", grams: 28 }] })
    ).toBe(null);
    expect(foodDensity({ portions: [] })).toBe(null);
    expect(foodDensity({})).toBe(null);
  });
});

// The four numbers ADR-0108 §2 records beside every figure. Two of them are a
// choice, and the pinned figures are only reproducible because the choice is
// fixed: the spread of a class is measured against its LIGHTEST member, and its
// CV is a population standard deviation over the per-food medians rather than a
// sample one. A class is the whole of its population — there is nothing outside
// it being estimated — and the two differ by enough to matter at a 2% bar.
describe("classStats", () => {
  const foodsAt = (...medians: number[]) =>
    medians.map((d) => ({
      // One cup portion each, so a stated density of `d` g/ml.
      portions: [{ amount: 1, unit: "cup", grams: 236.588 * d }],
    }));

  it("counts the foods and the portions they stated it in", () => {
    const stats = classStats([
      {
        portions: [
          { amount: 1, unit: "cup", grams: 236.588 },
          { amount: 1, unit: "tbsp", grams: 14.787 },
        ],
      },
      { portions: [{ amount: 1, unit: "tsp", grams: 4.929 }] },
    ]);
    expect(stats.foods).toBe(2);
    expect(stats.portions).toBe(3);
  });

  it("measures the spread against the lightest member", () => {
    // 0.9, 1.0, 1.1 → (1.1 − 0.9) / 0.9 = 22.2%, not 20% over the middle.
    expect(classStats(foodsAt(0.9, 1.0, 1.1)).spread).toBeCloseTo(0.2222, 4);
  });

  it("takes the CV over the whole population, not a sample of it", () => {
    // 0.9, 1.0, 1.1: mean 1.0, population sd 0.08165 → 8.165%.
    // A sample sd would be 0.1 → 10%, which is a different verdict at the bar.
    expect(classStats(foodsAt(0.9, 1.0, 1.1)).cv).toBeCloseTo(0.08165, 5);
  });

  it("reports the figure as the median of the per-food medians", () => {
    expect(classStats(foodsAt(0.9, 1.0, 1.4)).figure).toBeCloseTo(1.0, 6);
  });
});

// A class selects its members by a pattern recorded WITH the figure (ADR-0108
// §2), not by a list of food names. The pattern is the reproducible half: a
// pinned list would still be a pinned list after the corpus dropped a member,
// and the gate would have nothing to notice.
describe("selectClass", () => {
  const corpus = [
    {
      description: "Oil, olive, salad or cooking",
      foodCategory: "Fats and Oils",
    },
    { description: "Fish oil, menhaden", foodCategory: "Fats and Oils" },
    {
      description: "Fish oil, menhaden, fully hydrogenated",
      foodCategory: "Fats and Oils",
    },
    {
      description: "Butter oil, anhydrous",
      foodCategory: "Dairy and Egg Products",
    },
    {
      description: "Margarine-like, vegetable oil spread",
      foodCategory: "Fats and Oils",
    },
  ];

  it("takes the foods whose name the pattern matches", () => {
    const picked = selectClass(corpus, { name: /^(\w+ )?oil,/i });
    expect(picked.map((f) => f.description)).toContain(
      "Oil, olive, salad or cooking"
    );
    // A spread is not an oil, whatever its name carries.
    expect(picked.map((f) => f.description)).not.toContain(
      "Margarine-like, vegetable oil spread"
    );
  });

  it("holds a class to one food category", () => {
    // `Butter oil, anhydrous` is clarified butter, filed under dairy, and it is
    // 0.8661 g/ml against the class's 0.92.
    const picked = selectClass(corpus, {
      category: "Fats and Oils",
      name: /^(\w+ )?oil,/i,
    });
    expect(picked.map((f) => f.description)).not.toContain(
      "Butter oil, anhydrous"
    );
  });

  it("drops a member the class names but does not mean", () => {
    // Fully hydrogenated menhaden oil is solid at room temperature: it cannot be
    // poured, so it cannot be what someone asserting "this is an oil" means.
    const picked = selectClass(corpus, {
      category: "Fats and Oils",
      name: /^(\w+ )?oil,/i,
      except: /fully hydrogenated/i,
    });
    expect(picked.map((f) => f.description)).toEqual([
      "Oil, olive, salad or cooking",
      "Fish oil, menhaden",
    ]);
  });
});

// What the gate does when a figure has moved (ADR-0108 §3). It never rewrites a
// pinned value: the corpus being regenerated is a decision for a human, and the
// whole argument for pinning is that a figure which moves on its own moves with
// nobody deciding it should. So every kind of movement lands as a finding, and
// the two the record cares about most are told apart — a figure that drifted,
// and a class that stopped clearing its own bar.
describe("driftFindings", () => {
  /** A food stating one cup portion at `d` g/ml, in the class's category. */
  const at = (description: string, d: number) => ({
    description,
    foodCategory: "Test",
    portions: [{ amount: 1, unit: "cup", grams: 236.588 * d }],
  });

  const corpus = [
    at("Test oil, one", 0.92),
    at("Test oil, two", 0.92),
    at("Test oil, three", 0.93),
  ];

  const pinned = {
    id: "test-oil",
    figure: 0.92,
    // Worked by hand from 0.92, 0.92, 0.93: spread (0.93 − 0.92) / 0.92 = 1.1%,
    // mean 0.92333, population sd 0.004714, so CV = 0.51%.
    evidence: { foods: 3, portions: 3, spreadPercent: 1.1, cvPercent: 0.51 },
    pattern: { category: "Test", name: /^Test oil,/i },
  };

  it("says nothing while the corpus still states what was pinned", () => {
    expect(driftFindings(corpus, [pinned])).toEqual([]);
  });

  it("reports a figure that moved", () => {
    const heavier = [...corpus, at("Test oil, four", 1.4)];
    const findings = driftFindings(heavier, [pinned]);
    expect(findings.map((f) => f.kind)).toContain("figure");
    expect(findings[0].id).toBe("test-oil");
  });

  it("reports a membership that moved even when the figure did not", () => {
    // A fourth food at the pinned figure: 0.92 still, over a class of four.
    const findings = driftFindings(
      [...corpus, at("Test oil, four", 0.92)],
      [pinned]
    );
    expect(findings.map((f) => f.kind)).toContain("members");
    expect(findings.map((f) => f.kind)).not.toContain("figure");
  });

  it("reports a class that stopped clearing its own bar", () => {
    // ADR-0108 §2 admits a class at n >= 8 foods and CV <= 2%. `milk-like`
    // already sits at exactly 8, so a corpus collapse touching one milk row
    // fails the bar, which is the bar working rather than a thing to route
    // around.
    const scattered = [
      at("Test oil, one", 0.8),
      at("Test oil, two", 0.92),
      at("Test oil, three", 1.1),
    ];
    const findings = driftFindings(scattered, [
      { ...pinned, bar: { minFoods: 3, maxCvPercent: 2 } },
    ]);
    expect(findings.map((f) => f.kind)).toContain("bar");
  });
});

// The two classes ADR-0108 §2 measured and refused. They are in the record so a
// later reader finds the numbers that stopped them — syrup at CV 8.99% over a
// 44.4% spread, spirits at 2.63% — and the gate watches them for the same reason
// it watches the five that shipped: if the corpus moves far enough that a
// refused class would now clear the bar, that is a decision to take, not a class
// to adopt quietly.
describe("refusalFindings", () => {
  const at = (description: string, d: number) => ({
    description,
    foodCategory: "Test",
    portions: [{ amount: 1, unit: "cup", grams: 236.588 * d }],
  });
  const bar = { minFoods: 3, maxCvPercent: 2 };
  const syrup = {
    id: "syrup",
    refusedBecause: "CV 8.99% over a 44.4% spread",
    pattern: { category: "Test", name: /^Test syrup/i },
  };

  it("says nothing while a refused class still fails the bar", () => {
    const scattered = [
      at("Test syrup, honey", 1.43),
      at("Test syrup, maple", 1.34),
      at("Test syrup, sugar free", 1.0),
    ];
    expect(refusalFindings(scattered, [syrup], bar)).toEqual([]);
  });

  it("reports a refused class that would now clear the bar", () => {
    const tight = [
      at("Test syrup, honey", 1.4),
      at("Test syrup, maple", 1.4),
      at("Test syrup, golden", 1.41),
    ];
    const findings = refusalFindings(tight, [syrup], bar);
    expect(findings.map((f) => f.kind)).toEqual(["admissible"]);
    expect(findings[0].id).toBe("syrup");
  });
});

// The gate itself, run over the corpus that ships. Everything above tests a rule
// against a fixture; this is the one that would fail if a regenerated corpus
// moved a figure, and it is the whole point of pinning them (ADR-0108 §3).
describe("the shipped Density Class table", () => {
  const corpus = JSON.parse(
    readFileSync("public/usda/search-index.json", "utf8")
  ) as { foods: Array<Record<string, unknown>> };

  it("still measures what it was pinned at", () => {
    expect(
      driftFindings(corpus.foods, DENSITY_CLASSES, DENSITY_CLASS_BAR)
    ).toEqual([]);
  });

  it("still fails the bar on the two classes it refused", () => {
    expect(
      refusalFindings(corpus.foods, REFUSED_DENSITY_CLASSES, DENSITY_CLASS_BAR)
    ).toEqual([]);
  });

  it("clears the bar on every class that ships", () => {
    for (const cls of DENSITY_CLASSES) {
      expect(cls.evidence.foods).toBeGreaterThanOrEqual(
        DENSITY_CLASS_BAR.minFoods
      );
      expect(cls.evidence.cvPercent).toBeLessThanOrEqual(
        DENSITY_CLASS_BAR.maxCvPercent
      );
    }
  });
});
