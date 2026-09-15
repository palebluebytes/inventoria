// ---------------------------------------------------------------------------
// A food's density: what the twin holds, and what it resolves to (ADR-0105)
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
import { basisUnit, convertMeasured, type MeasuredUnit } from "./nutrition";

/** Where a food's density lives on its twin. */
export const FOOD_DENSITY_ATTR = "food/density";

/**
 * A density asserted as one of the five classes — what the user said their
 * bottle IS. The figure is never stored beside it (ADR-0105 §4): 0.92 is our
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
 * It is an **asserted** density and never a measured one, and ADR-0105's
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
 * answer it is (ADR-0105 §4, as amended).
 *
 * Two attributes were refused for a reason that is structural rather than
 * tidiness. Latest-datom-wins is **per attribute**, so a food moving from a
 * typed figure to a class would take two datoms in the right order, and a wrong
 * order leaves it carrying both with nothing to arbitrate them. One assertion
 * that simply wins is the whole point of the append-only model.
 *
 * `food/portions` has the same shape for the same reason — its `grams` /
 * `millilitres` siblings are fields inside one value — and the shape leaves room
 * for what ADR-0105 §12 has already named: a per-food density matched to a USDA
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
 * volume food is already in and never a wrong figure (ADR-0105 §6).
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
 * converts only on a density the user asserted (ADR-0105 §1), and the sum behind
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
 * This is the seam ADR-0105 §5 turns on: a gram entry against a per-100 ml
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
 * ADR-0105 §12 refuses for a model's per-food density. The figure is not hidden:
 * §9 puts it on the basis caption the moment you choose, and the source
 * explainer carries the full account.
 *
 * A `Record` rather than a list, so a sixth class admitted to the table fails
 * the type check here until somebody writes the words for it.
 */
export const DENSITY_CLASS_OPTIONS: Record<DensityClassId, string> = {
  "water-like": "Water — still, sparkling, tea, coffee",
  "milk-like": "Milk — cow, goat, sheep, buttermilk",
  juice: "Juice — orange, apple, grape",
  oil: "Oil — olive, sunflower, rapeseed",
  "beer-wine": "Beer or wine",
};

/**
 * What the source explainer says about a food's density (ADR-0105 §9).
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
export function densityNote(density: FoodDensity | undefined): string | null {
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
  return (
    `You said this is ${words.toLowerCase()}, which the app reads as ` +
    `${entry.figure} g per millilitre. That figure is measured over the ` +
    `${entry.evidence.foods} foods of that kind the USDA reference tables ` +
    "state a volume measure for, not read off this label — so a weight shown " +
    "here is this app's reading of what you said, and the panel beside it is " +
    "still the source's own, unchanged."
  );
}

// ---------------------------------------------------------------------------
// The pre-fill: reading the source's own classification
// ---------------------------------------------------------------------------

/**
 * The Open Food Facts category tags that name each class.
 *
 * Reading these is not the app inferring a class. An OFF product arrives
 * carrying its own classification, and mapping `en:olive-oils` to the oil class
 * is the same act as `offPanelBasis` reading `product_quantity_unit` — a source
 * assertion consulted, not a judgement invented (ADR-0105's pre-fill amendment).
 *
 * Three structural facts about OFF's taxonomy constrain everything below, and
 * each of them breaks an assumption that looks safe:
 *
 *  - it is a **DAG with 65 roots**, not one beverages tree, so nothing can be
 *    anchored by walking up to a common parent;
 *  - **`en:milks` never inherits `en:beverages`**, and a plant milk never
 *    inherits `en:dairies`, so there is no tag that means "milk-like" from
 *    above;
 *  - the obvious names do not exist — it is `en:oat-based-drinks`, never
 *    `en:oat-milks`.
 *
 * So the tags are matched exactly and named one at a time. A tag absent from
 * this table names no class, which is the standing answer for the 41% of
 * millilitre products the five classes do not cover.
 */
const CLASS_TAGS: Record<DensityClassId, readonly string[]> = {
  "water-like": [
    "en:waters",
    "en:spring-waters",
    "en:mineral-waters",
    "en:natural-mineral-waters",
    "en:sparkling-waters",
    "en:still-waters",
    "en:coffees",
    "en:coffee-drinks",
    "en:teas",
    "en:black-teas",
    "en:green-teas",
    "en:herbal-teas",
  ],
  "milk-like": [
    "en:milks",
    "en:whole-milks",
    "en:semi-skimmed-milks",
    "en:skimmed-milks",
    "en:raw-milks",
    "en:pasteurised-milks",
    "en:uht-milks",
    "en:goat-milks",
    "en:sheep-milks",
    "en:buttermilks",
  ],
  juice: [
    "en:fruit-juices",
    "en:orange-juices",
    "en:apple-juices",
    "en:grape-juices",
    "en:vegetable-juices",
  ],
  oil: [
    "en:oils",
    "en:vegetable-oils",
    "en:olive-oils",
    "en:extra-virgin-olive-oils",
    "en:sunflower-oils",
    "en:rapeseed-oils",
    "en:corn-oils",
    "en:sesame-oils",
    "en:groundnut-oils",
    "en:grape-seed-oils",
  ],
  "beer-wine": [
    "en:beers",
    "en:lagers",
    "en:ales",
    "en:wines",
    "en:red-wines",
    "en:white-wines",
    "en:rose-wines",
    "en:sparkling-wines",
  ],
};

/**
 * Tags naming a kind of product **no class covers**, whose presence disqualifies
 * whatever else the tag list matched.
 *
 * This list is what stops the pre-fill being worse than useless, and squash is
 * why it exists. 18.6% of millilitre cordials carry `en:fruit-juices` **and**
 * `en:cordials` together, so a rule that only counted class matches would see
 * one class, call it unambiguous, and put 1.04 on a concentrate nearer 1.20.
 * Coconut milk carries `en:plant-based-creams-for-cooking` beside a drinkable
 * tag, making a cooking tin indistinguishable from a drinking carton.
 *
 * Carrying one of these does not make a product unclassifiable — the user can
 * still say what it is. It makes it un-PRE-fillable, which is the whole of the
 * claim: a wrong pre-fill converts a question into a nod, and a nod is what
 * ADR-0105 §2's "a guess wearing the costume of a measurement" describes.
 */
export const CONTRA_TAGS: readonly string[] = [
  // Concentrates and cordials: a juice tag on something you dilute.
  "en:cordials",
  "en:squashes",
  "en:concentrates",
  "en:fruit-juice-concentrates",
  "en:syrups",
  // Milk that is not milk — a concentrate, a powder, or a plant drink, none of
  // which the milk-like class measured (`density-class.ts` excludes the first
  // two from the class by pattern for the same reason).
  "en:condensed-milks",
  "en:evaporated-milks",
  "en:milk-powders",
  "en:plant-based-beverages",
  "en:plant-based-milk-alternatives",
  "en:oat-based-drinks",
  "en:soy-based-beverages",
  "en:almond-based-beverages",
  // Creams, cooking and otherwise: sold by volume, nowhere near a milk.
  "en:creams",
  "en:plant-based-creams-for-cooking",
  // Sold in millilitres and not a drink at all — the 41% the classes do not
  // name. An aerated ice cream sits near 0.55, where a five-class scheme would
  // be wrong by almost half.
  "en:ice-creams",
  "en:frozen-desserts",
  "en:sauces",
  "en:condiments",
  "en:vinegars",
  "en:soups",
  // Alcohol the beer/wine class was measured without. Spirits were measured and
  // refused outright at CV 2.63% (`REFUSED_DENSITY_CLASSES`).
  "en:spirits",
  "en:liqueurs",
  "en:aperitifs",
  // Fortified drinks the classes never reached.
  "en:energy-drinks",
  "en:sodas",
];

/**
 * The class a source's own tags name, or undefined where they name none, more
 * than one, or one beside something no class covers.
 *
 * **Undefined is the common answer and is not a failure.** ADR-0105 measured the
 * full 2026-09-14 dump — 4,747,804 products — and found that of the 201,821 sold
 * in millilitres, 77.47% carry tags at all while only 35.76% resolve to exactly
 * one class. The gap between those two numbers is the finding: having tags and
 * having *discriminating* tags are different properties.
 *
 * Those figures describe **the tag population, not this function's output**.
 * {@link CONTRA_TAGS} narrows it further, by an amount nobody has counted: the
 * measurement behind the 35.76% was of a rule that reads class tags alone, and
 * the disqualifier list was added afterwards on the strength of the squash case
 * rather than on a second count. So 35.76% is the ceiling here and not the
 * figure, and anyone re-costing this design should measure the rule that ships
 * rather than the one that was measured.
 *
 * The caller opens the picker on what this returns and **never writes it**
 * (ADR-0105's pre-fill amendment). A pre-fill is a proposal the user confirms,
 * and it is confirmable in a way a figure is not: a class is checkable by
 * somebody holding the bottle — you can see "juice" on a bottle of squash and
 * know it is wrong — where `1.04 g/ml` could never be checked by anyone.
 */
export function densityClassFromCategoryTags(
  tags: readonly string[] | undefined
): DensityClassId | undefined {
  if (!tags?.length) return undefined;
  const held = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  if (CONTRA_TAGS.some((tag) => held.has(tag))) return undefined;
  const matched = (Object.keys(CLASS_TAGS) as DensityClassId[]).filter((id) =>
    CLASS_TAGS[id].some((tag) => held.has(tag))
  );
  return matched.length === 1 ? matched[0] : undefined;
}

// ---------------------------------------------------------------------------
// Which unit the field opens on
// ---------------------------------------------------------------------------

/**
 * Where an amount is being entered, which is what decides the opening unit on a
 * food that can answer in either (ADR-0105 §7, as amended).
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
 * ADR-0105's 2026-09-15 amendment makes to itself. A flat per-food memory
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
 * available wherever the food is reached, so ADR-0105 §1's "a density is a
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
