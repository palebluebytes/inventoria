/**
 * PROTOTYPE (#244) — the view model all three variants read.
 *
 * One job: given a pack's label panel and the reference food it is paired to,
 * both scaled to the amount in view, say of every nutrient whether the figure
 * is **measured** (the manufacturer printed it), **estimated** (only the
 * reference food carries it, so #240's "USDA fills silence" rule supplies it),
 * or **contested** (both carry one, and #240 says the label wins and the
 * reference's is hidden).
 *
 * The three variants disagree about how to DRAW that, not about what it is,
 * which is why this module is shared and they share nothing else.
 *
 * Deliberately not clever: no conversion, no state factor, no confidence. A
 * reference food 3.20x out of state (the beans) produces exactly the same rows
 * as one that agrees to the decimal (the oil), because whether that is visible
 * on screen is the thing being looked at.
 */

import {
  scaleNutrition,
  parseBasisQuantity,
  type NutritionBreakdown,
  type NutritionInfo,
} from "../../../food/nutrition";
import {
  MACRO_DESCRIPTORS,
  MICRO_DESCRIPTORS,
  LIMIT_DESCRIPTORS,
  formatNutrientValue,
  formatCalories,
  type NutrientDescriptor,
} from "../../../food/nutrient-display";
import { BAKED_NUTRIENT_TARGETS_G } from "../../../food/nutrition-targets";
import type { PairedFood } from "./data";

/** Where a figure came from — the whole vocabulary this prototype is testing. */
export type Provenance = "measured" | "estimated" | "contested";

export interface AnnotationRow {
  key: string;
  label: string;
  provenance: Provenance;
  /** The figure the panel shows, already formatted. */
  shown: string;
  /** The reference's figure, formatted — present on estimated AND contested. */
  reference: string | null;
  /** Share of a day's target this row supplies, 0-100+, or null if untargeted. */
  dayPercent: number | null;
  /** A stay-under limit (sodium, saturated fat) rather than a reach-toward target. */
  isLimit: boolean;
}

export interface Annotation {
  food: PairedFood;
  /** The pack's own figures at this amount. */
  measured: NutritionBreakdown;
  /** The reference food's figures at this amount. */
  estimate: NutritionBreakdown;
  /** Energy, macros and fibre. */
  macros: AnnotationRow[];
  /** The twelve metered micronutrients. */
  micros: AnnotationRow[];
  /** The stay-under limits. */
  limits: AnnotationRow[];
  /** How many of the twelve micros the reference food would fill. */
  fills: number;
}

const ENERGY: NutrientDescriptor = {
  key: "calories" as never,
  label: "Energy",
  unit: "g",
  short: "kcal",
};

function present(b: NutritionBreakdown, key: string): boolean {
  const v = (b as unknown as Record<string, number | undefined>)[key];
  return typeof v === "number";
}

function value(b: NutritionBreakdown, key: string): number {
  return (b as unknown as Record<string, number | undefined>)[key] ?? 0;
}

function row(
  d: NutrientDescriptor,
  measured: NutritionBreakdown,
  estimate: NutritionBreakdown,
  isLimit: boolean
): AnnotationRow | null {
  const key = d.key as string;
  const onLabel = present(measured, key);
  const onRef = present(estimate, key);
  if (!onLabel && !onRef) return null;

  const format = (b: NutritionBreakdown) =>
    key === "calories"
      ? formatCalories(value(b, key), 0)
      : formatNutrientValue(value(b, key), d.unit);

  const provenance: Provenance = onLabel
    ? onRef
      ? "contested"
      : "measured"
    : "estimated";

  // The reading against a day. For an estimated row that is the prize; for a
  // measured one it is what the meter already shows.
  const target = BAKED_NUTRIENT_TARGETS_G[key];
  const supplier = provenance === "estimated" ? estimate : measured;
  const dayPercent =
    target === undefined
      ? null
      : Math.round((value(supplier, key) / target) * 1000) / 10;

  return {
    key,
    label: d.label,
    provenance,
    shown: format(onLabel ? measured : estimate),
    reference: onRef ? format(estimate) : null,
    dayPercent,
    isLimit,
  };
}

/**
 * The factor a panel is scaled by to reach `grams`. Both panels here are per
 * 100 g, so this is the app's own rule with nothing clever bolted on — a
 * density never enters, because no food in the set carries one.
 */
function factorFor(panel: NutritionInfo, grams: number): number {
  return grams / parseBasisQuantity(panel.serving_size);
}

export function annotate(food: PairedFood, grams: number): Annotation {
  const measured = scaleNutrition(food.label, factorFor(food.label, grams));
  const estimate = scaleNutrition(
    food.reference.panel,
    factorFor(food.reference.panel, grams)
  );

  // `scaleNutrition` fills the four headline macros with 0 rather than leaving
  // them absent, so a macro is never "estimated" — which is correct here and
  // worth saying: the label always prints its own macros.
  const macros = [ENERGY, ...MACRO_DESCRIPTORS]
    .map((d) => row(d, measured, estimate, false))
    .filter((r): r is AnnotationRow => r !== null);
  const micros = MICRO_DESCRIPTORS.map((d) =>
    row(d, measured, estimate, false)
  ).filter((r): r is AnnotationRow => r !== null);
  const limits = LIMIT_DESCRIPTORS.map((d) =>
    row(d, measured, estimate, true)
  ).filter((r): r is AnnotationRow => r !== null);

  return {
    food,
    measured,
    estimate,
    macros,
    micros,
    limits,
    fills: micros.filter((r) => r.provenance === "estimated").length,
  };
}

/** The rows a variant shows as the second band: everything the label is silent on. */
export function estimatedRows(a: Annotation): AnnotationRow[] {
  return [...a.macros, ...a.micros, ...a.limits].filter(
    (r) => r.provenance === "estimated"
  );
}

/** The rows both sources carry, which #240 says the label wins. */
export function contestedRows(a: Annotation): AnnotationRow[] {
  return [...a.macros, ...a.micros, ...a.limits].filter(
    (r) => r.provenance === "contested"
  );
}
