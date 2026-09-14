// ---------------------------------------------------------------------------
// Density Classes (ADR-0105 §2)
// ---------------------------------------------------------------------------
//
// A food published per 100 ml cannot be weighed, and ADR-0060 §2 refused to fix
// that with a density because "there is no reliable 'is this a liquid' signal in
// the corpus". True of USDA, and false of the record that needs one: a `gtin:`
// twin whose Open Food Facts payload says `product_quantity_unit: "ml"`. What
// was missing was never the signal but the figure, and the corpus this app
// already ships carries it — 942 volume portions across 636 foods, public
// domain, on disk.
//
// A user never types a density. They say what KIND of liquid they have — "this
// is an oil" — and the class resolves to a figure measured over every food of
// that kind USDA states a volume portion for. On 100 ml of olive oil, assuming
// 1 g/ml is wrong by 78 kcal; the class leaves 0.73% of that.
//
// Three properties are load-bearing, each a decision recorded in ADR-0105:
//
//  - Admission is STATISTICAL and gated (§2): n >= 8 distinct foods and CV <= 2%,
//    with the figure, the n, the spread, the CV and the exact match pattern that
//    selected the members all recorded here. ADR-0046 §2 needed prose evidence
//    because its four tests are not computable; these are, and a bar a gate can
//    check is worth more than one a reviewer attests to.
//  - The figures are PINNED, and `scripts/density-class-check.mjs` proves them
//    (§3). Computing them at build time is what §3 rejects: the corpus is
//    regenerated from time to time, so a computed figure would move between
//    releases with nobody deciding it should.
//  - The twin stores the CLASS, never the figure (§4). What the user asserted is
//    "this is an oil"; 0.92 is our reading of that assertion, and a reading
//    belongs derived, so improving a class figure improves every food under it.
//
// The gate imports this file directly under a bare Node — no install step, no
// bundler — so every import here must stay type-only, as in `curated-stand-ins.ts`.
// ---------------------------------------------------------------------------

/** The kinds of liquid a user can say they have. */
export type DensityClassId =
  | "water-like"
  | "milk-like"
  | "juice"
  | "oil"
  | "beer-wine";

/**
 * How a class's members were selected out of the corpus, recorded so the figure
 * can be re-measured rather than taken on trust.
 *
 * The pattern rather than a list of food names is what makes the gate able to
 * notice anything: a pinned list of names stays intact after the corpus drops a
 * member, where a pattern re-selects and the count moves.
 */
export interface DensityClassPattern {
  /** The USDA food category a member must sit in, where the class needs one. */
  category?: string;
  /** What a member's description must match. */
  name: RegExp;
  /** What disqualifies a food the name pattern reaches. */
  except?: RegExp;
}

/** What was measured over a class's members, at the precision recorded here. */
export interface DensityClassEvidence {
  /** Distinct foods stating a density. This is the n the bar is set against. */
  foods: number;
  /** Volume portions those foods stated it in. A food with three counts once. */
  portions: number;
  /** The heaviest member over the lightest, as a percentage of the lightest. */
  spreadPercent: number;
  /** Population standard deviation over the per-food medians, as a percentage. */
  cvPercent: number;
}

/** One kind of liquid, its figure, and the measurement that admitted it. */
export interface DensityClass {
  id: DensityClassId;
  /** Grams per millilitre, at the two decimals the app reads a figure to. */
  figure: number;
  evidence: DensityClassEvidence;
  pattern: DensityClassPattern;
}

/**
 * What a class must measure before it may ship (ADR-0105 §2).
 *
 * Eight foods because a figure standing on fewer is one food's rounding away
 * from moving, and 2% because that is the width at which a class figure stops
 * being worth asserting over the 1 g/ml an absent density would assume.
 */
export const DENSITY_CLASS_BAR = { minFoods: 8, maxCvPercent: 2 } as const;

/**
 * The five classes that clear the bar, measured against schema 9 of the shipped
 * corpus (2,437 foods).
 *
 * The classes are wide by design: a class figure sits within 0.75% of the
 * per-food figure for every common case measured, which is the same fact as
 * their CVs. A food the five do not cover takes the typed override of §4.
 */
export const DENSITY_CLASSES: readonly DensityClass[] = [
  {
    id: "water-like",
    figure: 1.0,
    evidence: { foods: 15, portions: 23, spreadPercent: 4.7, cvPercent: 1.2 },
    // Tap water and anything brewed through it. Coffee and tea are water that
    // has been through a leaf: the corpus states them at 1.0009-1.0182.
    pattern: { category: "Beverages", name: /^Beverages, water,|brewed/i },
  },
  {
    id: "milk-like",
    figure: 1.03,
    evidence: { foods: 8, portions: 16, spreadPercent: 0.8, cvPercent: 0.28 },
    // Fluid milk of any animal, at any fat level: cow, goat, sheep, buffalo and
    // buttermilk sit inside 0.8% of one another, the tightest class here.
    // Evaporated and condensed milks are concentrates, not milk, and 1.0651
    // puts the first of them outside the class it would otherwise widen.
    pattern: { name: /^Milk,/i, except: /evaporated|condensed|dry|powder/i },
  },
  {
    id: "juice",
    figure: 1.04,
    evidence: { foods: 9, portions: 17, spreadPercent: 2.6, cvPercent: 0.8 },
    // Sugar is what makes a juice heavier than the water it came from, and the
    // corpus's juices agree to 2.6% across citrus, apple and grape.
    pattern: { name: /juice/i },
  },
  {
    id: "oil",
    figure: 0.92,
    evidence: { foods: 41, portions: 119, spreadPercent: 3.7, cvPercent: 0.52 },
    // Every pourable oil USDA states a volume portion for, olive at 0.9130
    // through corn-and-canola at 0.9468. `Fish oil, menhaden, fully
    // hydrogenated` is excluded because it is solid at room temperature: it
    // cannot be poured, so it cannot be what someone asserting "this is an oil"
    // means, and it was the class's only real outlier at 0.8665. The category
    // holds out `Butter oil, anhydrous`, which is clarified butter filed under
    // dairy. A spread or a margarine is not an oil whatever its name carries,
    // and the `oil,` in the pattern is what keeps them out.
    pattern: {
      category: "Fats and Oils",
      name: /^(\w+ )?oil,/i,
      except: /fully hydrogenated/i,
    },
  },
  {
    id: "beer-wine",
    figure: 0.99,
    evidence: { foods: 43, portions: 46, spreadPercent: 6.2, cvPercent: 1.21 },
    // Alcohol is lighter than water and sugar is heavier, so a drink lands
    // either side of 0.99 depending on which wins: a table red at 0.9941, a
    // late-harvest white at 1.0415, a light beer at 0.9975. `hard lemonade` is
    // excluded because a flavoured malt cooler is neither beer nor wine.
    pattern: {
      category: "Beverages",
      name: /\b(beer|wine)\b/i,
      except: /hard lemonade/i,
    },
  },
];

/**
 * A class ADR-0105 §2 measured and refused, kept so a later reader finds the
 * numbers that stopped it rather than re-deriving them.
 *
 * Neither is curated around: both take the typed override of §4. The gate
 * watches them, because a refusal that quietly became wrong is as much a silence
 * as a figure that quietly moved.
 */
export interface RefusedDensityClass {
  id: string;
  refusedBecause: string;
  pattern: DensityClassPattern;
}

export const REFUSED_DENSITY_CLASSES: readonly RefusedDensityClass[] = [
  {
    id: "syrup",
    refusedBecause:
      "CV 8.99% over a 44.4% spread, and it stays worst after dropping the " +
      "polyol outlier: honey at 1.4265 against maple at 1.3420 is a 6.3% gap " +
      "between two of the three products anyone owns.",
    pattern: { name: /\b(syrups?|honey|molasses)\b/i },
  },
  {
    id: "spirits",
    refusedBecause:
      "0.94 over 10 foods, failing on CV at 2.63%: 80 proof and 100 proof are " +
      "different liquids and the class cannot tell them apart.",
    pattern: { name: /distilled/i },
  },
];
