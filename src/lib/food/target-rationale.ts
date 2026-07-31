// "Why these defaults?" rationale copy (ADR-0033 §5, ticket #46).
//
// The one content module behind the Settings target editor's four ⓘ info sheets.
// Each entry is baked-in *authored copy* — a local-first PWA can't fetch, so the
// reasoning is transcribed here from the reference doc it maps to (offline-first),
// with full primary-source citations and clickable links. Copy and source doc move
// together: a corrected figure or a re-worded rationale moves the reference doc and
// this module in the same commit, exactly as `nutrition-targets.ts` mirrors the
// baked-target reference docs. The four rationales map 1:1 to the reference docs:
//
//   macros     → docs/reference/active-adult-macros.md
//   micros     → docs/reference/fda-daily-values.md
//   limits     → docs/reference/daily-nutrient-limits.md
//   calculator → docs/reference/personalized-energy-and-macros.md

/** A cited work with a clickable primary-source link. */
export type RationaleSource = {
  /** The source named as it appears in its reference doc. */
  label: string;
  /** A clickable link to the primary source. */
  url: string;
};

/** One renderable block of rationale copy. */
export type RationaleBlock =
  | { kind: "para"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] };

/** The source-and-reasoning behind one group of baked defaults. */
export type TargetRationale = {
  /** The info sheet's title. */
  title: string;
  /** The reference doc this copy is transcribed from (repo-relative path). */
  referenceDoc: string;
  /** A lead sentence or two summarising the group. */
  lead: string;
  /** The reasoning body, rendered in order. */
  blocks: RationaleBlock[];
  /** Full primary-source citations with clickable links. */
  sources: RationaleSource[];
};

/** The four info buttons — three section heads plus the calculator. */
export type RationaleId = "macros" | "micros" | "limits" | "calculator";

// Shared FDA sources reused by the micronutrient and limit groups (both cite
// 21 CFR 101.9 and the FDA consumer page).
const FDA_CFR: RationaleSource = {
  label: "21 CFR 101.9 — Nutrition labeling of food (eCFR, current text)",
  url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9",
};
const FDA_DV_PAGE: RationaleSource = {
  label:
    "FDA — “Daily Value on the Nutrition and Supplement Facts Labels” (consumer page)",
  url: "https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels",
};

export const TARGET_RATIONALES: Record<RationaleId, TargetRationale> = {
  macros: {
    title: "Why these Energy & macros targets?",
    referenceDoc: "docs/reference/active-adult-macros.md",
    lead: "The Energy & macros targets aim at a higher-protein active-adult profile against a 2,000-kcal reference diet. Every value sits inside a published DRI range — the app just picks a legitimate high-protein point within those ranges.",
    blocks: [
      { kind: "heading", text: "The numbers" },
      {
        kind: "list",
        items: [
          "Calories — 2,000 kcal, the reference diet both the Dietary Guidelines and the FDA label rule anchor on.",
          "Protein — 125 g (25% of energy). The AMDR allows 10–35%; this sits high for an active adult but under the 35% cap.",
          "Fat — 67 g (30% of energy, mid-AMDR of 20–35%).",
          "Carbs — 225 g (45% of energy, the low edge of the 45–65% AMDR, trimmed to make room for protein).",
          "Fibre — 28 g, the DRI Adequate Intake of 14 g per 1,000 kcal applied at 2,000 kcal.",
        ],
      },
      { kind: "heading", text: "Why these" },
      {
        kind: "para",
        text: "The percentages sum to 100% and each macro sits inside its Acceptable Macronutrient Distribution Range (AMDR) from the IOM 2005 DRI report. Grams come from each %-of-energy target via the Atwater factors (protein and carbs 4 kcal/g, fat 9 kcal/g). Carbohydrate is deliberately placed at the AMDR floor so protein can be pushed to the high end — a legitimate high-protein point, not an out-of-band choice.",
      },
      {
        kind: "para",
        text: "These differ from the FDA label Daily Values (protein 50 g, fat 78 g, carbs 275 g): those are a generic reference-diet denominator for computing a food's %DV, whereas Inventoria renders a personal fill bar and targets an active-adult profile. Fibre (28 g) is the one macro where the two bases coincide.",
      },
      {
        kind: "para",
        text: "Caveat: the 25/30/45% split itself is Inventoria's product choice (issue #34). Only the AMDR bounds it respects are primary-sourced.",
      },
    ],
    sources: [
      {
        label:
          "IOM (2005) — Dietary Reference Intakes: Energy, Carbohydrate, Fiber, Fat, Protein… (the “macronutrients” DRI report)",
        url: "https://www.nationalacademies.org/publications/10490",
      },
      {
        label:
          "NASEM DRI Macronutrients summary table (official one-page extract)",
        url: "https://www.nationalacademies.org/cdn/materials/9fb9fae1-63a0-4048-88ad-3f972639149a",
      },
      {
        label: "IOM (2005) full report on the NCBI Bookshelf (open access)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK56068/",
      },
      {
        label: "Dietary Guidelines for Americans, 2020–2025 (USDA / HHS)",
        url: "https://www.dietaryguidelines.gov/",
      },
      FDA_CFR,
    ],
  },

  micros: {
    title: "Why these Vitamins & minerals targets?",
    referenceDoc: "docs/reference/fda-daily-values.md",
    lead: "The vitamin and mineral targets are the FDA Daily Values — the reference amounts a Nutrition-Facts label's %DV is computed against, for adults and children 4 years and older.",
    blocks: [
      {
        kind: "para",
        text: "These come straight from the FDA's 2016 Nutrition Facts label rule (21 CFR 101.9). Each Daily Value is the amount used as the 100% mark on a food label, so aiming at it is aiming at a full day's reference intake.",
      },
      { kind: "heading", text: "The values" },
      {
        kind: "list",
        items: [
          "Vitamin D 20 µg · Calcium 1,300 mg · Iron 18 mg · Potassium 4,700 mg",
          "Vitamin A 900 µg RAE · Vitamin C 90 mg · Vitamin E 15 mg α-tocopherol",
          "Vitamin B6 1.7 mg · Vitamin B12 2.4 µg · Folate 400 µg DFE",
          "Magnesium 420 mg · Zinc 11 mg",
        ],
      },
      { kind: "heading", text: "Unit subtleties" },
      {
        kind: "para",
        text: "The 2016 rule moved several nutrients off the old IU units: vitamin A is µg RAE (not IU), vitamin E is mg α-tocopherol (not IU), folate is µg DFE, and vitamin D is µg (20 µg = 800 IU). Potassium (raised to 4,700 mg) and calcium (raised to 1,300 mg) both went up under the rule. Because these are already equivalence-weighted units, the stored value is a straight conversion of the published DV — no IU math is applied.",
      },
    ],
    sources: [FDA_CFR, FDA_DV_PAGE],
  },

  limits: {
    title: "Why these Limits?",
    referenceDoc: "docs/reference/daily-nutrient-limits.md",
    lead: "The Limits are stay-under caps — the day tints amber once a total goes over. Three are FDA Daily Reference Values; trans fat has no FDA value, so its cap comes from the WHO instead.",
    blocks: [
      { kind: "heading", text: "The caps" },
      {
        kind: "list",
        items: [
          "Sodium — 2,300 mg (FDA DRV). This is the element sodium, not salt (2,300 mg sodium ≈ 5.75 g salt).",
          "Saturated fat — 20 g (FDA DRV). Distinct from total fat (78 g), which is a reach-toward reference, not a limit.",
          "Cholesterol — 300 mg (FDA DRV).",
          "Trans fat — 2 g (WHO-derived, not an FDA value).",
        ],
      },
      { kind: "heading", text: "Where trans fat's 2 g comes from" },
      {
        kind: "para",
        text: "The FDA publishes no Daily Value for trans fat — the label only says “as low as possible.” A stay-under bar needs a number to fill against, so the cap comes from the WHO guideline of less than 1% of energy: 1% of 2,000 kcal = 20 kcal ÷ 9 kcal/g ≈ 2.2 g, rounded to 2 g. It is the ceiling WHO names, not a target to reach.",
      },
      {
        kind: "para",
        text: "Added sugar is deliberately not a limit here. The panel carries total sugar (fruit and milk sugars included), and capping that against the 50 g added-sugar DV would wrongly flag a bowl of fruit as over limit. There is no authoritative daily cap for total sugar.",
      },
    ],
    sources: [
      FDA_CFR,
      FDA_DV_PAGE,
      {
        label: "WHO — “Healthy diet” fact sheet (trans fat < 1% of energy)",
        url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
      },
      {
        label: "WHO REPLACE action package (eliminating industrial trans fat)",
        url: "https://www.who.int/teams/nutrition-and-food-safety/replace-trans-fat",
      },
    ],
  },

  calculator: {
    title: "About the calorie & macro calculator",
    referenceDoc: "docs/reference/personalized-energy-and-macros.md",
    lead: "The calculator turns your body metrics into a suggested energy and macro target. It composes three published formulae — a resting-metabolism equation, an activity multiplier, and a protein-anchored macro split — and writes the result into your targets, where it stays editable.",
    blocks: [
      { kind: "heading", text: "How it computes" },
      {
        kind: "list",
        items: [
          "Resting burn (BMR) — Mifflin-St Jeor (1990): 10·kg + 6.25·cm − 5·age + s, where s is +5 (male) or −161 (female). The Academy of Nutrition & Dietetics' recommended predictive equation; statistically unbiased and within ±10% for most adults.",
          "Daily burn (TDEE) — BMR × an IOM Physical Activity Level: Sedentary ×1.25 / Low active ×1.5 / Active ×1.75 / Very active ×2.2.",
          "Goal — a percentage of TDEE: Lose ×0.80 / Maintain ×1.00 / Gain ×1.10, then floored at your own BMR so the helper never suggests eating below resting burn.",
          "Macros — protein 1.6 g/kg bodyweight (Morton 2018, inside the ISSN 1.4–2.0 g/kg range), fat 30% of energy, carbs the remainder. Anchoring protein to bodyweight keeps it steady on a cut, when a %-of-energy split would drop it.",
        ],
      },
      { kind: "heading", text: "A sound pairing, but not IOM-blessed" },
      {
        kind: "para",
        text: "The activity bands are IOM's, but the single multiplier inside each band is the app's midpoint choice, and IOM's own energy equations don't use Mifflin-St Jeor as their basal term. “MSJ BMR × PAL” is a sound and very common pairing — a PAL is by definition a multiplier on basal energy — but it is not a unit the IOM itself publishes. Treat the output as a starting point, not a prescription: a ±10% BMR is roughly ±150 kcal, which is why the calculator lets you nudge the final number.",
      },
      { kind: "heading", text: "Biological sex is an estimate input only" },
      {
        kind: "para",
        text: "Mifflin-St Jeor has exactly two forms, differing only by the +5 / −161 constant, and there is no validated non-binary coefficient. “Biological sex” is used only to estimate resting metabolism — it affects nothing else in the app. An invented averaged third constant was rejected as pseudo-precision. If the equation doesn't fit you — including trans or HRT users — adjust the calorie result with the manual nudge, or skip the calculator and type your own targets.",
      },
    ],
    sources: [
      {
        label:
          "Mifflin MD, St Jeor ST, et al. (1990) — “A new predictive equation for resting energy expenditure”, Am J Clin Nutr 51(2):241–247",
        url: "https://doi.org/10.1093/ajcn/51.2.241",
      },
      {
        label:
          "Academy of Nutrition & Dietetics — Evidence Analysis Library, “Determination of Resting Metabolic Rate”",
        url: "https://www.andeal.org/template.cfm?template=guide_summary&key=621",
      },
      {
        label:
          "IOM (2005) — DRI for Energy… (the four Physical Activity Level categories)",
        url: "https://www.nationalacademies.org/read/26818",
      },
      {
        label:
          "Jäger R, et al. (2017) — ISSN Position Stand: protein and exercise (1.4–2.0 g/kg range)",
        url: "https://doi.org/10.1186/s12970-017-0177-8",
      },
      {
        label:
          "Morton RW, et al. (2018) — protein supplementation meta-analysis, Br J Sports Med 52(6):376–384 (~1.6 g/kg breakpoint)",
        url: "https://doi.org/10.1136/bjsports-2017-097608",
      },
    ],
  },
};
