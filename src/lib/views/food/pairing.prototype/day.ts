/**
 * PROTOTYPE (#244) — a day built out of the population, so the meter can be
 * looked at rather than argued about.
 *
 * Six packs: the four paired foods at a plausible amount each, plus two that
 * #243 adjudicated `none` — cacao nibs and a chilli oil. The unpaired two are
 * there on purpose. A day where everything pairs would flatter the second band;
 * a real day is part paired and part not, and the meter has to stay readable
 * across both.
 *
 * The labels are real `nutrition/info` datoms out of #241's export. Amounts are
 * invented — they are not in this prototype and never were, because a
 * consumption event is the personal half and only the pack's printed panel is
 * needed to draw a meter.
 */

import {
  scaleNutrition,
  parseBasisQuantity,
  type NutritionBreakdown,
  type NutritionInfo,
} from "../../../food/nutrition";
import {
  MICRO_DESCRIPTORS,
  formatNutrientValue,
  type NutrientDescriptor,
} from "../../../food/nutrient-display";
import { BAKED_NUTRIENT_TARGETS_G } from "../../../food/nutrition-targets";
import { PAIRED_FOODS, OPENING_AMOUNT, type PairedFood } from "./data";

/** Two packs #243 adjudicated `none` — no reference food, so no second band. */
const UNPAIRED: { name: string; grams: number; label: NutritionInfo }[] = [
  {
    name: "Cacao Nibs",
    grams: 20,
    label: {
      serving_size: "100 g",
      calories: 652,
      protein_content: 12,
      fat_content: 55,
      carbohydrate_content: 29.5,
      fiber_content: 27,
      sugar_content: 2.5,
      sodium_content: 0,
      saturated_fat_content: 32,
    },
  },
  {
    name: "Crispy Chilli in Oil",
    grams: 15,
    label: {
      serving_size: "100 g",
      calories: 717,
      protein_content: 5.9,
      fat_content: 71.1,
      carbohydrate_content: 9.6,
      sugar_content: 3.8,
      sodium_content: 1.141,
      saturated_fat_content: 11.7,
      iron: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      vitamin_e: 0,
      magnesium: 0,
      zinc: 0,
    },
  },
];

export interface BandRow {
  key: string;
  label: string;
  /** What the labels actually printed, formatted. */
  measured: string;
  /** What the pairings would add, formatted — null when nothing would. */
  estimated: string | null;
  /** The resolved daily target, formatted. */
  target: string;
  /** Bar width 0-100 for the measured part. */
  measuredFill: number;
  /** Bar width 0-100 for the estimated part, measured from where the first ends. */
  estimatedFill: number;
  /** True when the label side carried nothing at all — the near-zero meter. */
  measuredAbsent: boolean;
}

export interface DayBands {
  rows: BandRow[];
  /** How many of the twelve the pairings move at all. */
  moved: number;
  /** How many read as nothing without the pairings. */
  silentWithout: number;
}

function sum(
  into: Record<string, number>,
  b: NutritionBreakdown,
  keysOnly?: Set<string>
): void {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== "number") continue;
    if (keysOnly && !keysOnly.has(k)) continue;
    into[k] = (into[k] ?? 0) + v;
  }
}

function scaled(panel: NutritionInfo, grams: number): NutritionBreakdown {
  return scaleNutrition(panel, grams / parseBasisQuantity(panel.serving_size));
}

/** The keys the reference food supplies because the label is silent on them. */
function silentKeys(food: PairedFood, grams: number): Set<string> {
  const label = scaled(food.label, grams) as unknown as Record<string, unknown>;
  const ref = scaled(food.reference.panel, grams) as unknown as Record<
    string,
    unknown
  >;
  const out = new Set<string>();
  for (const k of Object.keys(ref)) {
    if (typeof label[k] !== "number") out.add(k);
  }
  return out;
}

export function buildDayBands(): DayBands {
  const measured: Record<string, number> = {};
  const estimated: Record<string, number> = {};

  for (const food of PAIRED_FOODS) {
    const grams = OPENING_AMOUNT[food.id] ?? 100;
    sum(measured, scaled(food.label, grams));
    sum(
      estimated,
      scaled(food.reference.panel, grams),
      silentKeys(food, grams)
    );
  }
  for (const u of UNPAIRED) sum(measured, scaled(u.label, u.grams));

  const rows = MICRO_DESCRIPTORS.map((d: NutrientDescriptor): BandRow => {
    const key = d.key as string;
    const target = BAKED_NUTRIENT_TARGETS_G[key] ?? 1;
    const m = measured[key] ?? 0;
    const e = estimated[key] ?? 0;
    const mFill = Math.min(100, (m / target) * 100);
    return {
      key,
      label: d.label,
      measured: formatNutrientValue(m, d.unit),
      estimated: e > 0 ? formatNutrientValue(e, d.unit) : null,
      target: formatNutrientValue(target, d.unit),
      measuredFill: mFill,
      estimatedFill: Math.max(0, Math.min(100 - mFill, (e / target) * 100)),
      measuredAbsent: measured[key] === undefined || m === 0,
    };
  });

  return {
    rows,
    moved: rows.filter((r) => r.estimated !== null).length,
    silentWithout: rows.filter((r) => r.measuredAbsent).length,
  };
}
