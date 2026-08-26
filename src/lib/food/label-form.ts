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
import {
  isPer100Basis,
  portionMeasure,
  servingSizeGrams,
  PER_100G,
  PER_100ML,
  PER_SERVING,
  type NutritionInfo,
  type Portion,
} from "./nutrition";

/**
 * The basis a label printed its values against — the #52 form's toggle, which
 * offers all three (ADR-0060 §7).
 *
 * `per_100ml` was for a while inverted-only, reachable solely by re-opening a
 * twin OFF had already published per 100 ml (ADR-0052 §5, #148). That left a UK
 * bottle printing "per 100 ml" with no way to say so, so the toggle now offers
 * it outright.
 */
export type Basis = "per_100g" | "per_100ml" | "per_serving";
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

/** A twin's portions split into the ones this form can type and the rest. */
export interface PortionRowSplit {
  /** The rows the form renders and the user may edit. */
  rows: PortionRow[];
  /** The portions it has no row for, to be re-emitted untouched on save. */
  carried: Portion[];
}

/**
 * Splits a twin's `food/portions` for the form: a gram weight becomes an
 * editable row, and everything else is set aside to be written back exactly as
 * it was read.
 *
 * A row is a label and a grams box, so a **volume** portion (ADR-0060 §6) has
 * nowhere to sit — the form types a weight, and a volume serving is still not
 * something it can express. Carrying such a portion through is the difference
 * between a form that cannot edit a drink's "1 can — 330 ml" and one that
 * deletes it: without this it would arrive in the grams box as nothing and be
 * saved back as a zero-gram weight it never was.
 *
 * A portion carrying no usable magnitude at all is carried the same way, for the
 * same reason: the form has no honest row to show it in either.
 */
export function splitPortionRows(
  portions: Portion[] | undefined
): PortionRowSplit {
  const split: PortionRowSplit = { rows: [], carried: [] };
  for (const portion of portions ?? []) {
    const measure = portionMeasure(portion);
    if (measure?.unit === "g") {
      split.rows.push({ label: portion.label, grams: String(measure.amount) });
    } else {
      split.carried.push(portion);
    }
  }
  return split;
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
 * §3): `100 g` when the label prints per 100 g, `100 ml` when it prints per 100
 * ml (whether the user said so or a drink arrived carrying the basis OFF
 * published it against), else `N g` when a serving weight was given, or the bare
 * `1 serving` when it was not.
 *
 * A serving is stamped in grams unconditionally, so a "1 bottle = 330 ml" basis
 * still has nowhere to go: that is the volume SERVING basis ADR-0060 leaves
 * open, and it wants `serving_size` properly typed rather than a third literal.
 */
export function resolveServingSize(basis: Basis, servingGrams: string): string {
  if (basis === "per_100g") return PER_100G;
  if (basis === "per_100ml") return PER_100ML;
  const n = Number(servingGrams.trim());
  return Number.isFinite(n) && n > 0 ? `${n} g` : PER_SERVING;
}

/** How a stored panel's basis reads back onto the form's two controls. */
export interface InvertedBasis {
  basis: Basis;
  /** What the serving-weight field shows; empty for a per-100 basis. */
  servingGrams: string;
}

/**
 * The inverse of {@link resolveServingSize}: a saved panel's basis read back onto
 * the form's toggle, so re-opening a twin for correction shows the basis it was
 * stored with rather than a guess. Lives beside the forward mapping so the two
 * cannot drift, and round-trips every basis that mapping can emit.
 *
 * The weight comes from {@link servingSizeGrams}, which requires an explicit gram
 * unit. A bare `parseFloat` finds a `1` in "1 serving" and in OFF's "1 portion
 * (330 ml)", so re-opening a whole-serving panel used to offer a serving weight of
 * one gram — and saving it would have written that back as the panel's basis.
 */
export function invertServingSize(
  serving_size: string | undefined
): InvertedBasis {
  if (isPer100Basis(serving_size)) {
    return {
      basis: serving_size === PER_100ML ? "per_100ml" : "per_100g",
      servingGrams: "",
    };
  }
  const grams = serving_size ? servingSizeGrams(serving_size) : null;
  return {
    basis: "per_serving",
    servingGrams: grams == null ? "" : String(grams),
  };
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
