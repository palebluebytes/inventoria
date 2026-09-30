// ---------------------------------------------------------------------------
// A food's density: what the twin holds, and what it resolves to (ADR-0108)
// ---------------------------------------------------------------------------
//
// `density-class.ts` holds the five classes and the measurement that admitted
// each. This module is the other half: the attribute a twin carries, the figure
// a reader resolves out of it, and the one place a volume is turned into a
// weight.
//
// The split is the ADR's own. §2 and §3 are about what a class IS — a figure
// pinned against a corpus, with a gate that re-measures it — and are imported by
// `scripts/density-class-check.mjs` under a bare Node. §1 and §4 are about what
// a FOOD says, which is a ledger question and reaches the stores and the
// screens. Keeping them apart is what lets the gate import the table without
// dragging the ledger in behind it.
// ---------------------------------------------------------------------------

import {
  DENSITY_CLASSES,
  type DensityClass,
  type DensityClassId,
} from "./density-class";
import {
  basisUnit,
  convertMeasured,
  type MeasuredUnit,
  type NutritionInfo,
} from "./nutrition";

/** Where a food's density lives on its twin. */
export const FOOD_DENSITY_ATTR = "food/density";

/**
 * A density asserted as one of the five classes — what the user said their
 * bottle IS. The figure is never stored beside it (ADR-0108 §4): 0.92 is our
 * reading of "this is an oil", and a reading belongs derived, so improving a
 * class improves every food filed under it.
 */
export interface DensityByClass {
  class: DensityClassId;
}

/**
 * A density asserted as a bare figure, for a food no class fits — squash,
 * cordial, a cooking coconut tin.
 *
 * It is an **asserted** density and never a measured one, and ADR-0108's
 * 2026-09-15 amendment is emphatic about the difference: nobody puts a bottle on
 * a scale and divides. The figure reaching this field is a remembered or
 * looked-up one far more often than a weighed one, the app cannot tell those
 * apart, and ADR-0060 §2 named "a per-food density that is _measured_" as the
 * thing that would reopen its refusal — so calling this measured would be
 * claiming a test it does not pass. It is admissible as the user's own claim
 * about their own food, disclosed and overridable, and on nothing else.
 */
export interface DensityByFigure {
  g_per_ml: number;
}

/**
 * What `food/density` holds: one attribute whose value names which kind of
 * answer it is (ADR-0108 §4, as amended).
 *
 * Two attributes were refused for a reason that is structural rather than
 * tidiness. Latest-datom-wins is **per attribute**, so a food moving from a
 * typed figure to a class would take two datoms in the right order, and a wrong
 * order leaves it carrying both with nothing to arbitrate them. One assertion
 * that simply wins is the whole point of the append-only model.
 *
 * `food/portions` has the same shape for the same reason — its `grams` /
 * `millilitres` siblings are fields inside one value — and the shape leaves room
 * for what ADR-0108 §12 has already named: a per-food density matched to a USDA
 * food arrives as a third variant and sits beside these two, where under a bare
 * number it would be indistinguishable from a typed override.
 */
export type FoodDensity = DensityByClass | DensityByFigure;

/**
 * What an asserted figure may be, so a slipped decimal point is refused at the
 * field rather than written to the ledger.
 *
 * The bounds are the pourable world at its extremes and deliberately wider than
 * the classes: an aerated ice cream sits near 0.55 and honey at 1.43, so
 * anything inside 0.1 to 2 is a figure somebody could mean. A typo of `92` for
 * `0.92` is not, and it is the one error this catches.
 */
export const ASSERTED_FIGURE_BOUNDS = { min: 0.1, max: 2 } as const;

/** True when `value` is a figure a user could mean (see the bounds above). */
export function isAssertableFigure(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= ASSERTED_FIGURE_BOUNDS.min &&
    value <= ASSERTED_FIGURE_BOUNDS.max
  );
}

/** The class entry for an id, or undefined for an id no longer in the table. */
export function densityClassOf(id: DensityClassId): DensityClass | undefined {
  return DENSITY_CLASSES.find((entry) => entry.id === id);
}

/**
 * The density a twin's attributes assert, or undefined where it asserts none.
 *
 * Guarded once, here, rather than trusted: this value crosses the ledger as JSON
 * and can arrive from an older build, a hand-edited import or one of your own
 * devices. A malformed one reads as *no density*, which is the standing state a
 * volume food is already in and never a wrong figure (ADR-0108 §6).
 */
export function readFoodDensity(
  attributes: Record<string, unknown> | undefined
): FoodDensity | undefined {
  const raw = attributes?.[FOOD_DENSITY_ATTR];
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Partial<DensityByClass & DensityByFigure>;
  if (typeof value.class === "string") {
    return densityClassOf(value.class) ? { class: value.class } : undefined;
  }
  if (
    typeof value.g_per_ml === "number" &&
    isAssertableFigure(value.g_per_ml)
  ) {
    return { g_per_ml: value.g_per_ml };
  }
  return undefined;
}

/**
 * Grams per millilitre for an asserted density — the class's pinned figure, or
 * the figure the user asserted directly.
 *
 * This is the read §4 means by "the figure is derived": a class resolves through
 * the table on every read and is never copied onto the twin, so a class figure
 * that improves improves every food under it without a migration.
 */
export function densityGramsPerMl(
  density: FoodDensity | undefined
): number | undefined {
  if (!density) return undefined;
  if ("class" in density) return densityClassOf(density.class)?.figure;
  return density.g_per_ml;
}

/**
 * An amount entered in `from`, expressed in `to`.
 *
 * The **one door** in the app through which a volume becomes a weight: it
 * converts only on a density the user asserted (ADR-0108 §1), and the sum behind
 * it is `convertMeasured`, which knows nothing about where a figure came from.
 * With no density the two units cannot be bridged and this returns undefined
 * rather than the ratio-1 pretence ADR-0060 §2 refuses — the caller then has a
 * unit it cannot offer, which is the honest answer and the state every
 * unclassified volume food stays in.
 */
export function convertAmount(
  amount: number,
  from: MeasuredUnit,
  to: MeasuredUnit,
  density: FoodDensity | undefined
): number | undefined {
  return convertMeasured(amount, from, to, densityGramsPerMl(density));
}

/**
 * An amount, expressed in whatever unit the panel's own basis is stated in —
 * the number every scaler divides by `parseBasisQuantity` (ADR-0021's formula).
 *
 * This is the seam ADR-0108 §5 turns on: a gram entry against a per-100 ml
 * panel converts the AMOUNT and never the panel. Rescaling the assay to an
 * assumed basis is what ADR-0048 §3 forbids, and a rewritten panel is also
 * unreadable afterwards, since nothing would distinguish it from one the source
 * published.
 *
 * Falls back to the amount unchanged where the two units cannot be bridged.
 * That is the identity everywhere the units agree, which is every food carrying
 * no density; where they disagree it can only be reached by a row logged under a
 * class since retired, and holding the figure is the least wrong of the answers
 * available (the alternative is dropping a logged amount to zero).
 */
export function amountAgainstBasis(
  amount: number,
  unit: MeasuredUnit,
  serving_size: string | undefined,
  density: FoodDensity | undefined
): number {
  return (
    convertAmount(amount, unit, basisUnit(serving_size), density) ?? amount
  );
}

// ---------------------------------------------------------------------------
// The picker's options
// ---------------------------------------------------------------------------

/**
 * How a class reads in the picker: the thing, then the bottles it names.
 *
 * Each option names **what you have**, never what it resolves to. You pick by
 * recognising your bottle, and showing `0.92 g/ml` beside it would ask you to
 * validate a number you have no way to check — which is exactly the trade
 * ADR-0108 §12 refuses for a model's per-food density. The figure is not hidden:
 * §9 puts it on the basis caption the moment you choose, and the source
 * explainer carries the full account.
 *
 * A `Record` rather than a list, so a sixth class admitted to the table fails
 * the type check here until somebody writes the words for it.
 */
export const DENSITY_CLASS_OPTIONS: Record<DensityClassId, string> = {
  liquid: "A drink — water, tea, coffee, milk, juice, beer, wine",
  oil: "Oil — olive, sunflower, rapeseed",
  syrup: "Syrup or honey",
};

/**
 * What the source explainer says about a food's density (ADR-0108 §9).
 *
 * The screen itself carries one mark and one only — the `≈` on the basis caption
 * — and everything else about the reading lives here, one tap deeper. That split
 * is ADR-0041's 2026-08-06 amendment applied rather than re-argued: it removed a
 * provenance badge from inferred NOVA values as "a deliberate owner call
 * favouring a calmer badge over an at-a-glance provenance cue", moving the
 * honesty into explainer copy and withheld attribution.
 *
 * Three things, because three things are true and each of them could be
 * misread on its own: which class was asserted, what it resolved to, and that
 * the figure is USDA's measurement of a reference food rather than anything read
 * off this label. A typed figure says the second and third differently, because
 * for it they are different facts: the user asserted it and nothing measured it.
 *
 * `null` for a food carrying no density, which is most of them and renders no
 * paragraph at all.
 */
export function densityNote(
  density: FoodDensity | undefined,
  asserted = true
): string | null {
  if (!density) return null;
  if ("g_per_ml" in density) {
    return (
      `You said this weighs ${density.g_per_ml} g per millilitre, and that is ` +
      "what the app converts by. It is your own figure: nothing here measured " +
      "it and nothing here can check it, so the weights this food shows are " +
      "only as good as it is."
    );
  }
  const entry = densityClassOf(density.class);
  if (!entry) return null;
  const words = DENSITY_CLASS_OPTIONS[density.class].split(" — ")[0];
  const measured =
    `${entry.figure} g per millilitre. That figure is measured over the ` +
    `${entry.evidence.foods} foods of that kind the USDA reference tables ` +
    "state a volume measure for, not read off this label — so the weight shown " +
    "here is a reading, and the panel beside it is still the source's own, " +
    "unchanged.";
  // **Who said so is the part that must not be got wrong** (#505). Before the
  // panel rule the only way a food had a class was that somebody picked one, so
  // "you said" was always true. Now it is usually false, and a screen claiming
  // the user asserted something the app worked out would be exactly the "guess
  // wearing the costume of a measurement" ADR-0108 §2 refused.
  return asserted
    ? `You said this is ${words.toLowerCase()}, which the app reads as ${measured}`
    : `This app read the nutrition panel and took this for ${words.toLowerCase()}, ` +
        `at ${measured} Nobody asked you, because on a drink the difference is ` +
        "worth a few kilocalories — but if it is wrong you can say so.";
}

// ---------------------------------------------------------------------------
// The pre-fill: reading the source's own classification
// ---------------------------------------------------------------------------

/**
 * The class a food's own nutrition panel names (#505, amending ADR-0108 §6).
 *
 * **This is what stopped the app asking.** ADR-0108 asked a five-way question
 * of every volume food, and its pre-fill amendment required the answer to be
 * confirmed rather than applied — a floor of one question per volume food,
 * forever. #499 then measured that the question was not worth asking, and that
 * the answer was already on the twin: three lines over the panel recover the
 * class for all but a handful of foods, and the panel is the one thing every
 * twin has.
 *
 * Three clauses, in order, and the order matters:
 *
 *  - **fat >= 80 g/100 means oil.** Nothing else in a kitchen is four-fifths
 *    fat by mass. A butter or a margarine would be, and is not sold by volume.
 *  - **>= 250 kcal with almost no fat and a lot of carbohydrate means syrup.**
 *    Honey, maple, molasses and corn syrup all sit there; a cola does not,
 *    because 42 kcal is nowhere near 250.
 *  - **anything else is a liquid**, which is the common case and the one the
 *    collapsed class was measured for.
 *
 * **The caller must gate this on a volume basis, and that gate is load-bearing.**
 * Over the whole corpus this rule calls dry noodles and freeze-dried chives
 * "syrup" and would be wrong by 400 kcal; they cannot reach it because a panel
 * per 100 g is never asked. `offPanelBasis` is what decides that, and a caller
 * that skips it is not using this function, it is misusing it.
 *
 * Checked against the corpus by `scratch/505/verify-505-rule.mjs`: over the 139
 * foods the class evidence patterns select, the rule agrees on **136**, and all
 * three disagreements are the **name patterns** over-selecting rather than the
 * rule failing — honey-roasted almonds and honey-mustard dressing are not
 * syrups, and sugar-free syrup at 51 kcal is a liquid, which the rule gets right
 * and the word "syrup" in its name does not.
 *
 * It returns `undefined` for a panel with nothing on it, because a food that
 * states no energy states nothing this rule can read.
 */
export function densityClassFromPanel(panel: {
  calories?: number;
  fat_content?: number;
  carbohydrate_content?: number;
}): DensityClassId | undefined {
  const kcal = panel.calories;
  if (typeof kcal !== "number") return undefined;
  const fat = panel.fat_content ?? 0;
  const carb = panel.carbohydrate_content ?? 0;
  if (fat >= 80) return "oil";
  if (kcal >= 250 && fat < 5 && carb >= 55) return "syrup";
  return "liquid";
}

/**
 * What density a food should be weighed with, and where it came from (#505).
 *
 * **One place, because there are now three ways a food can have a density and
 * only one of them is a datom.** Before #505 the answer was simply "read the
 * attribute"; now the attribute is the exception rather than the rule, and a
 * screen that derived the class for itself would be a second copy of a rule that
 * has a threshold in it.
 *
 * The order is the whole design:
 *
 *  1. **A correction wins, always.** A `food/density` datom exists only because
 *     somebody disagreed with us (§4 as amended), so it outranks anything
 *     derivable. That is also what makes the datom worth keeping: it is not a
 *     cache of a derivation, it is a person's answer.
 *  2. **A food not sold by volume has no density question at all**, and this is
 *     the load-bearing gate. Over the whole corpus the panel rule calls dry
 *     noodles and freeze-dried chives "syrup" and would be wrong by 400 kcal;
 *     they never reach it, because their panel is per 100 g. A caller that skips
 *     this gate is not using the rule, it is misusing it.
 *  3. **What no panel can classify is asked, never applied.** Air has no macros
 *     and a concentrate's panel describes the bottle rather than the glass, so
 *     an ice cream and a squash are the two volume foods still worth a question
 *     — see {@link PANEL_CANNOT_ANSWER_TAGS}.
 *  4. **Otherwise the panel decides, silently.** This is the case #499 measured
 *     and the reason the five-way picker is gone.
 *
 * `asserted` is what the `≈` explainer reads to say whether the figure is the
 * app's reading or the user's own answer, and `mustAsk` is what a control reads
 * to decide between converting and asking.
 */
export interface DensityReading {
  /** What to convert with, or `undefined` when nothing may be applied. */
  density: FoodDensity | undefined;
  /** True when a datom said so, which means a person did. */
  asserted: boolean;
  /** True when the app must ask rather than apply anything. */
  mustAsk: boolean;
}

export function densityFor(
  attributes: Record<string, unknown> | undefined,
  panel: NutritionInfo | undefined,
  tags: readonly string[] | undefined
): DensityReading {
  const asserted = readFoodDensity(attributes);
  if (asserted) return { density: asserted, asserted: true, mustAsk: false };

  const nothing = { density: undefined, asserted: false, mustAsk: false };
  if (!panel || basisUnit(panel.serving_size) !== "ml") return nothing;

  if (panelCannotAnswer(tags))
    return { density: undefined, asserted: false, mustAsk: true };

  const derived = densityClassFromPanel(panel);
  return derived
    ? { density: { class: derived }, asserted: false, mustAsk: false }
    : nothing;
}

/**
 * The Open Food Facts category tags naming a food **no nutrition panel can
 * classify**, which is the one job left of the tag route (#505, amending
 * ADR-0108's pre-fill amendment).
 *
 * Everything the tag route used to do — naming oils, milks, juices, waters,
 * beers — {@link densityClassFromPanel} now does better, on every twin rather
 * than on the 35.76% carrying discriminating tags. What is left is two
 * populations where the panel is **physically unable** to answer, and both of
 * them cost far more than {@link DENSITY_COST_BAR} if guessed:
 *
 *  - **Aerated.** Air has no macros, so an ice cream's panel is a custard's.
 *    A pinned 0.65 would still leave 10-17 kcal, so there is no figure to apply
 *    however it is obtained.
 *  - **Concentrates.** A squash's panel is a juice's panel — both are
 *    sugar-water — and nothing in it says "you will dilute this". A cordial near
 *    1.20 read as a liquid at 1.00 is about **90 kcal** out on a 300 ml pour,
 *    nine times the bar. This is the population the retired `CONTRA_TAGS` was
 *    built for, and #505 was wrong to call that list redundant: the half about
 *    oils and syrups was, and the half about dilution was not.
 *
 * **These force a question, never answer one.** Neither group has a pinned
 * figure and neither may get one, so the answer the app takes is §4's typed
 * override — the user says what it weighs, because nobody else can.
 *
 * Reading these is not the app inferring anything. An OFF product arrives
 * carrying its own classification, and `en:cordials` is a source assertion
 * consulted, exactly as `offPanelBasis` reads `product_quantity_unit`.
 */
export const PANEL_CANNOT_ANSWER_TAGS: readonly string[] = [
  // Aerated: air has no macros.
  "en:ice-creams",
  "en:frozen-desserts",
  "en:sorbets",
  "en:frozen-yogurts",
  "en:whipped-creams",
  "en:mousses",
  // Concentrates: the panel describes the bottle, not the glass. 18.6% of
  // millilitre cordials carry `en:fruit-juices` beside one of these, which is
  // why a juice rule on tags alone put 1.04 on something nearer 1.20.
  "en:cordials",
  "en:squashes",
  "en:concentrates",
  "en:fruit-juice-concentrates",
  "en:condensed-milks",
  "en:evaporated-milks",
];

/**
 * Do a source's own tags say the panel cannot classify this food?
 *
 * `false` is the common answer and means "the panel decides", not "this is a
 * liquid" — the caller still has to gate on a volume basis before reading a
 * panel at all.
 */
export function panelCannotAnswer(
  tags: readonly string[] | undefined
): boolean {
  if (!tags?.length) return false;
  const held = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  return PANEL_CANNOT_ANSWER_TAGS.some((tag) => held.has(tag));
}

// ---------------------------------------------------------------------------
// Which unit the field opens on
// ---------------------------------------------------------------------------

/**
 * Where an amount is being entered, which is what decides the opening unit on a
 * food that can answer in either (ADR-0108 §7, as amended).
 *
 * `"recipe"` is an ingredient list — a thing measured **into** something.
 * `"log"` is a food being consumed. Unqualified "grams the default" would open a
 * can of Coke in grams, and nobody weighs a can of Coke.
 */
export type AmountContext = "recipe" | "log";

/**
 * The unit an amount field opens on: the context's default, overridden by what
 * this food was last entered in **here**.
 *
 * `remembered` is read per context and never per food, which is the correction
 * ADR-0108's 2026-09-15 amendment makes to itself. A flat per-food memory
 * retires the context rule almost entirely: a can of Coke logged and drunk in
 * millilitres for months, then added to a recipe — where it is a thing measured
 * into something, which is the entire reason the context rule exists — would
 * take its memory and open in millilitres, and the rule that was supposed to
 * decide the case would never run.
 *
 * A food that cannot be weighed has no choice to make and opens on its panel's
 * own unit, exactly as ADR-0060 §1 has it — this function is a no-op everywhere
 * a density is absent, which is most foods.
 *
 * The split is only ever about which unit the field OPENS on. Both units stay
 * available wherever the food is reached, so ADR-0108 §1's "a density is a
 * property of the food, not of the screen" is not breached: the density is one
 * fact on one twin, and a food classified once answers in grams everywhere.
 */
export function openingUnit(
  context: AmountContext,
  basis: MeasuredUnit,
  density: FoodDensity | undefined,
  remembered: MeasuredUnit | null
): MeasuredUnit {
  if (densityGramsPerMl(density) === undefined) return basis;
  return remembered ?? (context === "recipe" ? "g" : basis);
}
