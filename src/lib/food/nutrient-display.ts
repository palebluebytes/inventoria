/**
 * The nutrient *display* layer: which nutrients the dashboard summary and the
 * staged-food pills may show, how each is labelled and unitised, and how a day
 * total is turned into meter/pill view models (ticket #29, parent #21).
 *
 * Pure and data-driven — the catalogue is derived from {@link EXTRA_NUTRIENT_KEYS}
 * in `nutrition.ts` (the single list every freeze helper already walks), so a new
 * panel nutrient becomes selectable by adding it there once. The `.svelte` views
 * stay thin: they call {@link buildNutrientMeters}/{@link buildNutrientPills} and
 * render the result, mirroring the existing `macrosFromNutrition`/`unitLabel`
 * split (label + unit logic never lives in markup).
 */
import {
  EXTRA_NUTRIENT_KEYS,
  roundFoodDisplay,
  type ExtraNutrientKey,
  type NutritionBreakdown,
} from "./nutrition";

/**
 * The unit a nutrient's total is *shown* in. Panel values are stored in grams
 * (ADR-0021/-0030 keep one fixed unit per field), so a descriptor's unit is the
 * display unit its stored grams are reformatted into — macros/`*_content` fields
 * read naturally in grams, micronutrients in mg or µg like a Nutrition-Facts
 * label.
 */
export type NutrientUnit = "g" | "mg" | "µg";

/** How many display units one stored gram is worth (g×1, mg×1e3, µg×1e6). */
const UNIT_SCALE: Record<NutrientUnit, number> = {
  g: 1,
  mg: 1_000,
  µg: 1_000_000,
};

/**
 * One selectable nutrient: the {@link NutritionBreakdown} key its day total lives
 * under, the label the UI shows, and the unit that total is displayed in.
 */
export interface NutrientDescriptor {
  /** The breakdown key this nutrient totals under (e.g. `protein`, `fiber_content`). */
  key: string;
  /** Display label, e.g. "Protein", "Fibre". */
  label: string;
  /** The unit its stored-grams total is reformatted into for display. */
  unit: NutrientUnit;
}

/**
 * The three display macros, keyed by their headline {@link NutritionBreakdown}
 * names (`protein`/`fat`/`carbs`, not the panel's `*_content`). Calories are the
 * always-on ring/pill and are deliberately NOT selectable here.
 */
const MACRO_NUTRIENTS: NutrientDescriptor[] = [
  { key: "protein", label: "Protein", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
];

/**
 * Label + display unit for every extra (non-headline) nutrient. Keyed by
 * {@link ExtraNutrientKey} so the compiler forces an entry for each key the freeze
 * path carries — a new panel nutrient can't slip in without a label/unit. The
 * `*_content` macro-scale fields read in grams; the twelve micronutrients (stored
 * in grams) reformat to mg/µg the way a Nutrition-Facts label lists them.
 */
const EXTRA_NUTRIENT_META: Record<
  ExtraNutrientKey,
  { label: string; unit: NutrientUnit }
> = {
  fiber_content: { label: "Fibre", unit: "g" },
  sugar_content: { label: "Sugar", unit: "g" },
  sodium_content: { label: "Sodium", unit: "mg" },
  saturated_fat_content: { label: "Saturated Fat", unit: "g" },
  trans_fat_content: { label: "Trans Fat", unit: "g" },
  unsaturated_fat_content: { label: "Unsaturated Fat", unit: "g" },
  cholesterol_content: { label: "Cholesterol", unit: "mg" },
  vitamin_d: { label: "Vitamin D", unit: "µg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  vitamin_a: { label: "Vitamin A", unit: "µg" },
  vitamin_c: { label: "Vitamin C", unit: "mg" },
  vitamin_e: { label: "Vitamin E", unit: "mg" },
  vitamin_b6: { label: "Vitamin B6", unit: "mg" },
  vitamin_b12: { label: "Vitamin B12", unit: "µg" },
  folate: { label: "Folate", unit: "µg" },
  magnesium: { label: "Magnesium", unit: "mg" },
  zinc: { label: "Zinc", unit: "mg" },
};

/**
 * The fixed catalogue of nutrients a user can choose to display — the three
 * macros followed by every extra panel nutrient, in panel order. Data-driven off
 * {@link EXTRA_NUTRIENT_KEYS}: adding a nutrient there (and a meta entry above)
 * makes it selectable everywhere with no view change.
 */
export const NUTRIENT_CATALOGUE: NutrientDescriptor[] = [
  ...MACRO_NUTRIENTS,
  ...EXTRA_NUTRIENT_KEYS.map((key) => ({ key, ...EXTRA_NUTRIENT_META[key] })),
];

/**
 * The default visible-nutrient selection when the user has set none: the three
 * macros plus fibre, so a brand-new user sees a Fibre meter beside Protein/Fat/
 * Carbs (ticket #29). The settings store injects this when its datom is absent.
 */
export const DEFAULT_VISIBLE_NUTRIENTS: string[] = [
  "protein",
  "fat",
  "carbs",
  "fiber_content",
];

/** Fast key → descriptor lookup over the fixed catalogue. */
const BY_KEY = new Map(NUTRIENT_CATALOGUE.map((d) => [d.key, d]));

/**
 * Resolves a stored selection (an array of breakdown keys) to catalogue
 * descriptors, preserving the user's order and silently dropping any key that
 * isn't a known nutrient (so stale/garbage data can never crash a view). An
 * absent selection falls back to {@link DEFAULT_VISIBLE_NUTRIENTS}; an explicit
 * empty array is honoured as "show only calories".
 */
export function selectedNutrients(
  selection: string[] | undefined
): NutrientDescriptor[] {
  const keys = selection ?? DEFAULT_VISIBLE_NUTRIENTS;
  return keys
    .map((k) => BY_KEY.get(k))
    .filter((d): d is NutrientDescriptor => d != null);
}

/**
 * Formats a nutrient's stored-grams value into its display unit, e.g. 0.5 g of
 * sodium → "500 mg", 12.345 g of protein → "12.35 g". Rounded to the display
 * precision so summed floats don't leak their mantissa; never returns NaN.
 */
export function formatNutrientValue(grams: number, unit: NutrientUnit): string {
  const scaled = (Number(grams) || 0) * UNIT_SCALE[unit];
  return `${roundFoodDisplay(scaled)} ${unit}`;
}

/** Formats a calories total, always shown in kcal — the always-on headline. */
export function formatCalories(kcal: number): string {
  return `${roundFoodDisplay(Number(kcal) || 0)} kcal`;
}

/** Reads a nutrient's day total out of a breakdown, treating absent as 0. */
function totalFor(breakdown: NutritionBreakdown, key: string): number {
  const v = (breakdown as unknown as Record<string, number | undefined>)[key];
  return typeof v === "number" ? v : 0;
}

/**
 * One dashboard meter's view model: label, formatted value, and — only when a
 * target is configured for that nutrient — the fill percent (0–100) and the
 * formatted target. A nutrient with no target carries neither, so the view
 * renders it as a plain total with a neutral (empty) track rather than inventing
 * a bar or showing NaN (ticket #29).
 */
export interface NutrientMeter {
  key: string;
  label: string;
  /** Formatted running total, e.g. "12.5 g" or "500 mg". */
  value: string;
  /** Percent of target, clamped 0–100; absent when the nutrient has no target. */
  fill?: number;
  /** Formatted target, e.g. "130 g"; absent when the nutrient has no target. */
  target?: string;
}

/**
 * Builds the dashboard's macro/nutrient meters from a day total, the user's
 * selection, and the per-nutrient targets (in grams, keyed by breakdown key —
 * only the macros carry one today). Each selected nutrient becomes a meter; one
 * with a positive target gets a fill bar, one without gets a neutral no-target
 * rendering. Pure: the `.svelte` view just renders the returned list.
 */
export function buildNutrientMeters(
  breakdown: NutritionBreakdown,
  selection: string[] | undefined,
  targets: Partial<Record<string, number>> = {}
): NutrientMeter[] {
  return selectedNutrients(selection).map((d) => {
    const grams = totalFor(breakdown, d.key);
    const meter: NutrientMeter = {
      key: d.key,
      label: d.label,
      value: formatNutrientValue(grams, d.unit),
    };
    const target = targets[d.key];
    if (typeof target === "number" && target > 0) {
      meter.fill = Math.min((grams / target) * 100, 100);
      meter.target = formatNutrientValue(target, d.unit);
    }
    return meter;
  });
}

/** One staged-food / preview pill: a labelled formatted value, no target. */
export interface NutrientPill {
  key: string;
  label: string;
  value: string;
}

/**
 * Builds the always-on Calories pill followed by one pill per selected nutrient,
 * read from a (scaled) breakdown — the staged-food preview and any fixed
 * calories+macros pill row. Calories lead every list; the rest honour the
 * caller's selection in order. Pure: the `.svelte` view just renders it.
 */
export function buildNutrientPills(
  breakdown: NutritionBreakdown,
  selection: string[] | undefined
): NutrientPill[] {
  const pills: NutrientPill[] = [
    {
      key: "calories",
      label: "Calories",
      value: formatCalories(totalFor(breakdown, "calories")),
    },
  ];
  for (const d of selectedNutrients(selection)) {
    pills.push({
      key: d.key,
      label: d.label,
      value: formatNutrientValue(totalFor(breakdown, d.key), d.unit),
    });
  }
  return pills;
}
