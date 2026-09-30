// ---------------------------------------------------------------------------
// Density Classes (ADR-0108 §2, as amended by #505)
// ---------------------------------------------------------------------------
//
// A food published per 100 ml cannot be weighed, and ADR-0060 §2 refused to fix
// that with a density because "there is no reliable 'is this a liquid' signal in
// the corpus". True of USDA, and false of the record that needs one: a `gtin:`
// twin whose Open Food Facts payload says `product_quantity_unit: "ml"`. What
// was missing was never the signal but the figure, and the corpus this app
// already ships carries it — public domain, on disk.
//
// **The table used to have five classes and a question.** #499 measured that the
// question was not worth asking: the four non-oil classes pool to one figure
// inside ADR-0108 §2's own bar, and a rule over the nutrition panel picks the
// class without asking anybody. So the five became **three**, the question
// became a correction, and what a user says is no longer "which of five liquids
// is this" but nothing at all unless we got it wrong.
//
// Three properties are load-bearing, each a decision recorded in ADR-0108:
//
//  - Admission is gated, and now on **two** bars rather than one (§2 and its
//    #505 amendment). The statistical bar stands: n >= 8 distinct foods and
//    CV <= 2%. Beside it sits a **cost** bar, for the class the first one
//    refuses and the app needs anyway — see {@link DENSITY_COST_BAR}.
//  - The figures are PINNED, and `scripts/density-class-check.mjs` proves them
//    (§3). Computing them at build time is what §3 rejects: the corpus is
//    regenerated from time to time, so a computed figure would move between
//    releases with nobody deciding it should.
//  - The twin stores the CLASS, never the figure (§4) — and since #505, it
//    stores it **only when the user corrected us**. A class nobody was asked
//    about is derived at read time and reaches no datom, so the presence of one
//    now means something exact: a human disagreed with us.
//
// **The four retired ids are gone rather than translated.** `water-like`,
// `milk-like`, `juice` and `beer-wine` are not readable, not mapped and not
// deprecated — a pre-release ledger holding one simply loses that food's
// density, which is `secrets.ts`'s precedent for the USDA key ("no migration —
// pre-release; the old datoms are simply abandoned"). A translation layer would
// have been a second meaning of "class" kept alive to serve rows nobody has.
//
// The gate imports this file directly under a bare Node — no install step, no
// bundler — so every import here must stay type-only, as in `curated-stand-ins.ts`.
// ---------------------------------------------------------------------------

/**
 * The kinds of liquid the app has a figure for.
 *
 * Three, not five. `water-like`, `milk-like`, `juice` and `beer-wine` were
 * measured to be one class — see {@link DENSITY_CLASSES}'s `liquid` — and
 * **aerated is deliberately absent**: an ice cream needs the question asked, not
 * a figure applied, because even a pinned 0.65 leaves 10-17 kcal, above
 * {@link DENSITY_COST_BAR}. There is nothing to pin for it, only the knowledge
 * of when to ask.
 */
export type DensityClassId = "liquid" | "oil" | "syrup";

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

/**
 * Why a class ships when {@link DENSITY_CLASS_BAR} refuses it: because the worst
 * wrong answer it can give is not worth a question.
 *
 * Measured at each food's **own** energy density, over a serving of that food
 * somebody would actually have. Both halves matter, and a first pass got the
 * first one wrong: pricing every syrup at 3 kcal/g put sugar-free syrup 6x over
 * its real error, because it is 51 kcal/100 g rather than 300.
 */
export interface DensityCostEvidence {
  /** The realistic serving the worst case is priced over. */
  serving: string;
  /** The food that sits furthest from the figure, in kcal over that serving. */
  worstKcal: number;
  /** Which food that is, so the number can be re-derived rather than trusted. */
  worstFood: string;
}

/** One kind of liquid, its figure, and the measurement that admitted it. */
export interface DensityClass {
  id: DensityClassId;
  /** Grams per millilitre, at the two decimals the app reads a figure to. */
  figure: number;
  evidence: DensityClassEvidence;
  /**
   * How this class's members were selected, as one pattern or several.
   *
   * `liquid` carries **four**, and that is the honest shape rather than a
   * convenience: its 73 foods were selected four ways, and one regex that
   * happened to catch 73 foods would be a different claim about a different
   * population. The gate unions them and deduplicates by `fdcId`, because
   * `juice` and `beer-wine` can both reach a row.
   */
  patterns: readonly DensityClassPattern[];
  /**
   * Present only on a class {@link DENSITY_CLASS_BAR} refuses and
   * {@link DENSITY_COST_BAR} admits. Its absence is the claim that the
   * statistical bar was enough.
   */
  cost?: DensityCostEvidence;
}

/**
 * What a class must measure before it may ship on accuracy alone (ADR-0108 §2).
 *
 * Eight foods because a figure standing on fewer is one food's rounding away
 * from moving, and 2% because that is the width at which a class figure stops
 * being worth asserting over the 1 g/ml an absent density would assume.
 */
export const DENSITY_CLASS_BAR = { minFoods: 8, maxCvPercent: 2 } as const;

/**
 * The second bar, added by #505: **never ask a question whose worst wrong answer
 * is worth less than this.**
 *
 * It sits *beside* {@link DENSITY_CLASS_BAR} rather than over it. The CV bar is
 * an accuracy rationale and still does real work — it is what says `liquid` may
 * be applied silently at all. This one is a **usefulness** rationale, and it
 * does two different jobs:
 *
 *  - it admits `syrup`, which fails on CV at 8.99% and whose worst real error is
 *    3.8 kcal on a tablespoon, because refusing it means opening a picker in
 *    which no cell is right for a food the app has positively identified;
 *  - it is why **aerated has no figure at all**: 10-17 kcal is over this line,
 *    so no aerated figure may be applied silently however it was obtained.
 *
 * Ten kilocalories because that is beneath the width of the answers this app
 * already gives — a panel rounded to whole kcal, a portion the user estimated —
 * so a question that buys less than that buys nothing a person can perceive.
 */
export const DENSITY_COST_BAR = { maxKcalOnAServing: 10 } as const;

/**
 * The three classes that ship, measured against **schema 10** of the shipped
 * corpus (2,023 foods) by `scratch/505/measure-505.mjs`.
 *
 * A food none of the three fits takes the typed override of §4 — and since #505
 * the three are chosen *for* the user by `densityClassFromPanel`, so "fits" is
 * decided by a nutrition panel rather than by a question.
 */
export const DENSITY_CLASSES: readonly DensityClass[] = [
  {
    id: "liquid",
    figure: 1.0,
    // The pool of what were four classes. Measured 1.0009 and pinned at 1.00,
    // the two decimals the app reads, which is also what `water-like` read on
    // its own — so the collapse moves the figure for nobody who was previously
    // told "water".
    //
    // **It clears §2's own bar, and that is the point.** CV 1.90% against a 2%
    // ceiling, over 73 foods against a floor of 8. #505 framed the collapse as
    // something the cost bar admitted; it does not need the cost bar, and
    // saying so keeps that bar's job narrow.
    //
    // The spread is 6.9% and that is wider than any of the four it replaces,
    // which is the honest cost of pooling: a late-harvest dessert wine at
    // 1.0415 and a light beer at 0.9975 are now the same class.
    evidence: { foods: 73, portions: 100, spreadPercent: 6.9, cvPercent: 1.9 },
    patterns: [
      // Tap water and anything brewed through it. Coffee and tea are water that
      // has been through a leaf: the corpus states them at 1.0009-1.0182.
      { category: "Beverages", name: /^Beverages, water,|brewed/i },
      // Fluid milk of any animal, at any fat level. Evaporated and condensed
      // milks are concentrates, not milk, and 1.0651 puts the first of them
      // outside the class it would otherwise widen.
      { name: /^Milk,/i, except: /evaporated|condensed|dry|powder/i },
      // Sugar is what makes a juice heavier than the water it came from.
      { name: /juice/i },
      // Alcohol is lighter than water and sugar is heavier, so a drink lands
      // either side depending on which wins. `hard lemonade` is excluded
      // because a flavoured malt cooler is neither beer nor wine.
      {
        category: "Beverages",
        name: /\b(beer|wine)\b/i,
        except: /hard lemonade/i,
      },
    ],
  },
  {
    id: "oil",
    figure: 0.92,
    evidence: { foods: 41, portions: 119, spreadPercent: 3.7, cvPercent: 0.52 },
    patterns: [
      // Every pourable oil USDA states a volume portion for, olive at 0.9130
      // through corn-and-canola at 0.9468. `Fish oil, menhaden, fully
      // hydrogenated` is excluded because it is solid at room temperature: it
      // cannot be poured, so it cannot be what someone asserting "this is an
      // oil" means, and it was the class's only real outlier at 0.8665. The
      // category holds out `Butter oil, anhydrous`, which is clarified butter
      // filed under dairy. A spread or a margarine is not an oil whatever its
      // name carries, and the `oil,` in the pattern is what keeps them out.
      {
        category: "Fats and Oils",
        name: /^(\w+ )?oil,/i,
        except: /fully hydrogenated/i,
      },
    ],
  },
  {
    id: "syrup",
    figure: 1.39,
    // Measured 1.3885 over ten foods and pinned at 1.39.
    //
    // **ADR-0108 §2 refused this class and was right on its own terms**: CV
    // 8.99% over a 44.4% spread is nowhere near the 2% ceiling, and honey at
    // 1.4265 against maple at 1.3420 really are different liquids. What changed
    // is not the statistics but the question they were answering. Refusing the
    // class did not stop the app needing an answer; it made the app open a
    // five-cell picker in which no cell was right for a jar of honey, which is
    // worse than a figure 3.8 kcal out on a tablespoon.
    evidence: { foods: 10, portions: 19, spreadPercent: 44.4, cvPercent: 8.99 },
    cost: {
      serving: "1 tbsp",
      worstKcal: 3.8,
      worstFood: "Syrups, corn, high-fructose (1.2976)",
    },
    patterns: [{ name: /\b(syrups?|honey|molasses)\b/i }],
  },
];

/**
 * A class ADR-0108 §2 measured and refused, kept so a later reader finds the
 * numbers that stopped it rather than re-deriving them.
 *
 * **Syrup used to be here and is now in the table above**, admitted on
 * {@link DENSITY_COST_BAR} rather than on statistics — the entry did not become
 * wrong, it became insufficient. Spirits stay refused, and stay watched: a
 * refusal that quietly became wrong is as much a silence as a figure that
 * quietly moved.
 */
export interface RefusedDensityClass {
  id: string;
  refusedBecause: string;
  pattern: DensityClassPattern;
}

export const REFUSED_DENSITY_CLASSES: readonly RefusedDensityClass[] = [
  {
    id: "spirits",
    refusedBecause:
      "0.94 over 10 foods, failing on CV at 2.63%: 80 proof and 100 proof are " +
      "different liquids and the class cannot tell them apart. It is not " +
      "admitted on cost either, because no panel rule reaches it — a spirit's " +
      "panel is energy with almost no macros, which is the one shape " +
      "`densityClassFromPanel` cannot tell from a diet drink.",
    pattern: { name: /distilled/i },
  },
];
