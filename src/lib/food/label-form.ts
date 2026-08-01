// The full-panel label-capture form's field catalogue + its pure panel builder
// (ADR-0034 §3, #57). The Custom tab's "Read-along" form (Variant B, prototype
// #52) transcribes a nutrition label top-to-bottom: name + brand, the four
// macros, the sat-fat/fibre/sugar/salt detail row, the twelve ADR-0030
// micronutrients, and household portions. Every row is TYPED in the label's own
// unit (kcal, g, mg, µg) but the panel STORES grams (the ADR-0031 idiom), so the
// assembly round-trips through the real `parseNutrientEntry`/`nutrientDisplayValue`
// helpers — no parallel conversion. Absent ≠ 0: an untouched or skipped row is
// OMITTED from the built panel, never written as 0 (ADR-0030 / #28), so "not on
// the label" stays distinct from a genuine zero.
//
// The catalogue and the builder live here — outside the Svelte component — so the
// mg/µg-to-grams assembly is a pure function the unit suite exercises directly
// (labels omitted, round-trips, basis→serving_size), and the form is a thin shell
// over it. The labels/units mirror `nutrient-display.ts` EXTRA_NUTRIENT_META, with
// `sugar` included: the display catalogue hides it, but a label-entry form must
// let you type it.
import {
  parseNutrientEntry,
  nutrientDisplayValue,
  type NutrientUnit,
} from "./nutrient-display";
import { PER_100G, PER_SERVING, type NutritionInfo } from "./nutrition";

/** The basis a label printed its values against — the #52 form's toggle. */
export type Basis = "per_100g" | "per_serving";
/** A row is typed in kcal (energy) or a nutrient mass unit; grams are stored. */
export type FieldUnit = "kcal" | NutrientUnit;

export interface FieldDef {
  /** The `NutritionInfo` key this row fills. */
  key: keyof NutritionInfo;
  /** Row label, e.g. "Saturated fat". */
  label: string;
  /** The unit the row is *typed* in (grams are stored; micros type in mg/µg). */
  unit: FieldUnit;
}

/** The common case — the four rows today's Custom tab already captures. */
export const CORE: FieldDef[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_content", label: "Protein", unit: "g" },
  { key: "fat_content", label: "Fat", unit: "g" },
  { key: "carbohydrate_content", label: "Carbs", unit: "g" },
];

/** The rest of the "big four corners" of a label — fats, fibre, sugar, salt. */
export const DETAIL: FieldDef[] = [
  { key: "saturated_fat_content", label: "Saturated fat", unit: "g" },
  { key: "trans_fat_content", label: "Trans fat", unit: "g" },
  { key: "unsaturated_fat_content", label: "Unsaturated fat", unit: "g" },
  { key: "fiber_content", label: "Fibre", unit: "g" },
  { key: "sugar_content", label: "Sugar", unit: "g" },
  { key: "sodium_content", label: "Salt / sodium", unit: "mg" },
  { key: "cholesterol_content", label: "Cholesterol", unit: "mg" },
];

/** The twelve US Nutrition-Facts micronutrients (ADR-0030), in panel order. */
export const MICROS: FieldDef[] = [
  { key: "vitamin_d", label: "Vitamin D", unit: "µg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "vitamin_a", label: "Vitamin A", unit: "µg" },
  { key: "vitamin_c", label: "Vitamin C", unit: "mg" },
  { key: "vitamin_e", label: "Vitamin E", unit: "mg" },
  { key: "vitamin_b6", label: "Vitamin B6", unit: "mg" },
  { key: "vitamin_b12", label: "Vitamin B12", unit: "µg" },
  { key: "folate", label: "Folate", unit: "µg" },
  { key: "magnesium", label: "Magnesium", unit: "mg" },
  { key: "zinc", label: "Zinc", unit: "mg" },
];

/** Every nutrient row the form renders, in read-along order. */
export const ALL_FIELDS: FieldDef[] = [...CORE, ...DETAIL, ...MICROS];

/** One household-portion row as typed in the form (mirrors {@link Portion}). */
export interface PortionRow {
  label: string;
  grams: string;
}

/**
 * Grams → the string a field shows in its typed unit (kcal passes through). The
 * inverse of {@link toGrams}; used to seed the form from a prefilled panel
 * (AI-confirm / OFF), so a stored 0.0026 g of iron reads back as "2.6" in "mg".
 */
export function toDisplay(grams: number, unit: FieldUnit): string {
  return unit === "kcal"
    ? String(grams)
    : String(nutrientDisplayValue(grams, unit));
}

/**
 * A typed display-unit string → stored grams, or `undefined` when the field is
 * blank/absent or non-numeric — the absent-not-zero guard, so an empty row is
 * omitted rather than assembled as 0. `parseNutrientEntry` reattaches the mass
 * scale (500 "mg" → 0.5 g); kcal passes straight through.
 */
export function toGrams(display: string, unit: FieldUnit): number | undefined {
  const trimmed = display.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return unit === "kcal" ? n : parseNutrientEntry(n, unit);
}

/**
 * The #52 basis toggle resolved to the panel's `serving_size` string (ADR-0034
 * §3): `100 g` when the label prints per 100 g, else `N g` when a serving weight
 * was given, or the bare `1 serving` when it was not.
 */
export function resolveServingSize(basis: Basis, servingGrams: string): string {
  if (basis === "per_100g") return PER_100G;
  const n = Number(servingGrams.trim());
  return Number.isFinite(n) && n > 0 ? `${n} g` : PER_SERVING;
}

export interface LabelPanelInput {
  /** Display-unit strings keyed by {@link NutritionInfo} field. */
  values: Record<string, string>;
  /** The label's basis, resolved onto `serving_size`. */
  basis: Basis;
  /** Grams one serving weighs — only read when `basis` is per_serving. */
  servingGrams: string;
  /** Keys the user marked "∅ not on label" — force-omitted even if typed. */
  skipped: Set<string>;
}

export interface BuiltLabelPanel {
  /** The assembled panel: grams, `serving_size` resolved, untouched keys omitted. */
  nutrition: NutritionInfo;
  /** The nutrient keys that received a value — the audit hint for provenance. */
  filledKeys: string[];
}

/**
 * Assembles the typed rows into a stored {@link NutritionInfo} (ADR-0034 §3) —
 * the pure heart of the Read-along form. Every filled, non-skipped row converts
 * to grams via {@link toGrams}; an untouched or skipped row is **omitted, never
 * 0** (absent ≠ 0). The basis resolves onto `serving_size`. Returns the panel
 * plus the keys that were filled, so the caller records what the user supplied
 * without re-deriving it.
 */
export function buildLabelPanel(input: LabelPanelInput): BuiltLabelPanel {
  const nutrition: NutritionInfo = {
    serving_size: resolveServingSize(input.basis, input.servingGrams),
  };
  const filledKeys: string[] = [];
  for (const f of ALL_FIELDS) {
    if (input.skipped.has(f.key)) continue;
    const grams = toGrams(input.values[f.key] ?? "", f.unit);
    if (grams === undefined) continue;
    (nutrition as unknown as Record<string, unknown>)[f.key] = grams;
    filledKeys.push(f.key);
  }
  return { nutrition, filledKeys };
}
