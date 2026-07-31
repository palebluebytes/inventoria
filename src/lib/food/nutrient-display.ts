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
  FOOD_DISPLAY_DECIMALS,
  roundFoodDisplay,
  type ExtraNutrientKey,
  type NutritionBreakdown,
} from "./nutrition";
import { REACH_TOWARD_KEYS } from "./nutrition-targets";

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
  key: keyof NutritionBreakdown;
  /** Display label, e.g. "Protein", "Fibre". */
  label: string;
  /** The unit its stored-grams total is reformatted into for display. */
  unit: NutrientUnit;
  /** Compact label for tight one-line contexts (e.g. a meal subtotal), e.g.
   *  "Prot", "Ca". Unambiguous within the catalogue so Fat/Fibre never collide. */
  short: string;
}

/**
 * The three display macros, keyed by their headline {@link NutritionBreakdown}
 * names (`protein`/`fat`/`carbs`, not the panel's `*_content`). Calories are the
 * always-on ring/pill and are deliberately NOT selectable here.
 */
const MACRO_NUTRIENTS: NutrientDescriptor[] = [
  { key: "protein", label: "Protein", unit: "g", short: "Prot" },
  { key: "fat", label: "Fat", unit: "g", short: "Fat" },
  { key: "carbs", label: "Carbs", unit: "g", short: "Carb" },
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
  { label: string; unit: NutrientUnit; short: string }
> = {
  fiber_content: { label: "Fibre", unit: "g", short: "Fib" },
  sugar_content: { label: "Sugar", unit: "g", short: "Sug" },
  sodium_content: { label: "Sodium", unit: "mg", short: "Na" },
  saturated_fat_content: { label: "Saturated Fat", unit: "g", short: "SatFat" },
  trans_fat_content: { label: "Trans Fat", unit: "g", short: "Trans" },
  unsaturated_fat_content: {
    label: "Unsaturated Fat",
    unit: "g",
    short: "Unsat",
  },
  cholesterol_content: { label: "Cholesterol", unit: "mg", short: "Chol" },
  vitamin_d: { label: "Vitamin D", unit: "µg", short: "Vit D" },
  calcium: { label: "Calcium", unit: "mg", short: "Ca" },
  iron: { label: "Iron", unit: "mg", short: "Fe" },
  potassium: { label: "Potassium", unit: "mg", short: "K" },
  vitamin_a: { label: "Vitamin A", unit: "µg", short: "Vit A" },
  vitamin_c: { label: "Vitamin C", unit: "mg", short: "Vit C" },
  vitamin_e: { label: "Vitamin E", unit: "mg", short: "Vit E" },
  vitamin_b6: { label: "Vitamin B6", unit: "mg", short: "B6" },
  vitamin_b12: { label: "Vitamin B12", unit: "µg", short: "B12" },
  folate: { label: "Folate", unit: "µg", short: "Folate" },
  magnesium: { label: "Magnesium", unit: "mg", short: "Mg" },
  zinc: { label: "Zinc", unit: "mg", short: "Zn" },
};

/**
 * Nutrients kept as captured data but withheld from every display surface.
 * `sugar_content` is schema.org total sugar; the only citable daily cap is the
 * FDA *added*-sugars DV — a different quantity the panel doesn't carry — so total
 * sugar has no honest reach-toward target or stay-under limit (ADR-0032, "Out of
 * scope"). It stays in {@link EXTRA_NUTRIENT_KEYS} / the freeze path and keeps its
 * {@link EXTRA_NUTRIENT_META} entry; this set only removes it from the catalogue
 * the UI renders, so a future `added_sugar_content` key restores sugar display
 * with a one-line change.
 */
const HIDDEN_NUTRIENT_KEYS: ReadonlySet<string> = new Set(["sugar_content"]);

/**
 * The fixed catalogue of nutrients a user can choose to display — the three
 * macros followed by every extra panel nutrient, in panel order. Data-driven off
 * {@link EXTRA_NUTRIENT_KEYS}: adding a nutrient there (and a meta entry above)
 * makes it selectable everywhere with no view change, unless it is in
 * {@link HIDDEN_NUTRIENT_KEYS} (captured but not displayed).
 */
export const NUTRIENT_CATALOGUE: NutrientDescriptor[] = [
  ...MACRO_NUTRIENTS,
  ...EXTRA_NUTRIENT_KEYS.filter((key) => !HIDDEN_NUTRIENT_KEYS.has(key)).map(
    (key) => ({ key, ...EXTRA_NUTRIENT_META[key] })
  ),
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

/** Fast key → descriptor lookup over the fixed catalogue. Keyed by plain string
 *  because a stored selection arrives from the ledger as arbitrary strings. */
const BY_KEY = new Map<string, NutrientDescriptor>(
  NUTRIENT_CATALOGUE.map((d) => [d.key, d])
);

/**
 * The compact one-line label for a nutrient (e.g. `protein` → "Prot"), for
 * tight tallies like a meal subtotal. Unknown keys (calories, stale data) have
 * no catalogue entry and read as an empty string, so the caller shows the value
 * alone rather than a stray code.
 */
export function nutrientShortLabel(key: string): string {
  return BY_KEY.get(key)?.short ?? "";
}

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
 * sodium → "500 mg", 12.345 g of protein → "12.35 g". Rounded to `decimals`
 * (default {@link FOOD_DISPLAY_DECIMALS}; `0` for whole-number display) so summed
 * floats don't leak their mantissa; never returns NaN.
 */
export function formatNutrientValue(
  grams: number,
  unit: NutrientUnit,
  decimals: number = FOOD_DISPLAY_DECIMALS
): string {
  return `${nutrientDisplayValue(grams, unit, decimals)} ${unit}`;
}

/**
 * A nutrient's stored-grams value as the plain number it reads as in its display
 * unit (0.5 g sodium → `500` for "mg"), rounded to `decimals`. This is the
 * numeric half of {@link formatNutrientValue} — that function is just this plus
 * the unit suffix — so the two can never drift. The settings target editor
 * (ticket #41) shows a baked default / override in a numeric input whose unit
 * lives in its own column, so it needs the number alone rather than slicing the
 * unit back off the formatted string. Never NaN.
 */
export function nutrientDisplayValue(
  grams: number,
  unit: NutrientUnit,
  decimals: number = FOOD_DISPLAY_DECIMALS
): number {
  return roundFoodDisplay((Number(grams) || 0) * UNIT_SCALE[unit], decimals);
}

/**
 * The pure inverse of {@link formatNutrientValue}: turns a target typed in a
 * nutrient's display unit back into the stored canonical unit (grams for mass,
 * kcal passed through for energy). `parseNutrientEntry(500, "mg")` → `0.5`
 * (grams); `parseNutrientEntry(12.5, "g")` → `12.5`; `parseNutrientEntry(2000,
 * "kcal")` → `2000`. Round-trips with {@link formatNutrientValue} so a target
 * shown then re-entered is unchanged; a non-numeric input reads as 0, never NaN.
 * The editor edge (ticket #41) is the only place display units exist — storage
 * stays grams/kcal end-to-end (ADR-0031).
 */
export function parseNutrientEntry(
  displayValue: number,
  unit: NutrientUnit | "kcal"
): number {
  const n = Number(displayValue) || 0;
  return unit === "kcal" ? n : n / UNIT_SCALE[unit];
}

/** Formats a calories total, always shown in kcal — the always-on headline. */
export function formatCalories(
  kcal: number,
  decimals: number = FOOD_DISPLAY_DECIMALS
): string {
  return `${roundFoodDisplay(Number(kcal) || 0, decimals)} kcal`;
}

/**
 * Shown for a *selected* nutrient a given food never measured — the always-on
 * pill row keeps the nutrient in place (per #29) but must not print a fabricated
 * "0 g" for data the source never carried (absent ≠ 0, #21/#30). A genuine
 * reported zero still formats as "0 g"; only an absent key reads as this marker.
 */
export const ABSENT_NUTRIENT = "—";

/** Reads a nutrient's day total out of a breakdown, treating absent as 0. */
function totalFor(
  breakdown: NutritionBreakdown,
  key: keyof NutritionBreakdown
): number {
  const v = breakdown[key];
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
  targets: Partial<Record<string, number>> = {},
  decimals: number = FOOD_DISPLAY_DECIMALS
): NutrientMeter[] {
  return selectedNutrients(selection).map((d) => {
    const grams = totalFor(breakdown, d.key);
    const meter: NutrientMeter = {
      key: d.key,
      label: d.label,
      value: formatNutrientValue(grams, d.unit, decimals),
    };
    const target = targets[d.key];
    if (typeof target === "number" && target > 0) {
      meter.fill = Math.min((grams / target) * 100, 100);
      meter.target = formatNutrientValue(target, d.unit, decimals);
    }
    return meter;
  });
}

/**
 * One row of the full nutrient breakdown (ticket #30): a labelled, formatted
 * value for a single nutrient the food actually carries. Same shape as a pill,
 * named for its own surface — a read-only "show everything" detail list rather
 * than the always-on selected-pill summary.
 */
export interface NutrientRow {
  key: string;
  label: string;
  value: string;
}

/**
 * A plain labelled row for a catalogued nutrient's day total, formatted in its
 * display unit — the shared shape of the full breakdown ({@link buildNutrientBreakdown},
 * #30) and the RDA view's "Not tracked" section ({@link buildDayRdaView}, #42), so
 * the two can never format the same nutrient differently.
 */
function nutrientRow(
  breakdown: NutritionBreakdown,
  d: NutrientDescriptor,
  decimals: number
): NutrientRow {
  return {
    key: d.key,
    label: d.label,
    value: formatNutrientValue(totalFor(breakdown, d.key), d.unit, decimals),
  };
}

/**
 * Builds the full nutrient breakdown for a (already-scaled) panel — the ordered
 * list a food's disclosure/expander renders (ticket #30, parent #21). Leads with
 * the always-on Calories row, then every catalogued nutrient the breakdown
 * actually carries, in panel order (the three macros, then the extras and the
 * twelve micronutrients).
 *
 * Only nutrients **present** in the breakdown appear: an extra a food never
 * reported is absent from a {@link scaleNutrition} result, so it is omitted here
 * rather than shown as 0/blank (the hard "omit absent" rule of #30/#21). The
 * three headline macros are always present (defaulted to 0 like the pills), so
 * they always show. Micronutrients reformat from their stored grams to mg/µg via
 * {@link formatNutrientValue}. Pure: the `.svelte` disclosure just renders it.
 */
export function buildNutrientBreakdown(
  breakdown: NutritionBreakdown,
  decimals: number = FOOD_DISPLAY_DECIMALS
): NutrientRow[] {
  const rows: NutrientRow[] = [
    {
      key: "calories",
      label: "Calories",
      value: formatCalories(totalFor(breakdown, "calories"), decimals),
    },
  ];
  for (const d of NUTRIENT_CATALOGUE) {
    if (!(d.key in breakdown)) continue;
    rows.push(nutrientRow(breakdown, d, decimals));
  }
  return rows;
}

/**
 * The reach-toward keys that make up the "Energy & macros" section body — Calories
 * (`energy`) leads it separately as the always-on row, so it is not listed here.
 * The rest of the reach-toward set forms "Vitamins & minerals". A new reach-toward
 * macro added here lands in the macro section on both surfaces; anything else
 * reach-toward falls to the micronutrient section on its own.
 */
const MACRO_SECTION_KEYS = new Set<string>([
  "protein",
  "fat",
  "carbs",
  "fiber_content",
]);

/**
 * The section headings the full-day RDA modal (#42) and the Settings target editor
 * (#41) both render — one source of truth so the two surfaces name the groups
 * identically. Calories/energy is the always-on row each surface leads with.
 */
export const SECTION_MACROS = "Energy & macros";
export const SECTION_MICROS = "Vitamins & minerals";

/**
 * The reach-toward nutrient grouping the RDA modal and the Settings target editor
 * share, so the two always agree on which nutrient sits in which section and in
 * what order:
 * - {@link MACRO_DESCRIPTORS} — the reach-toward macros (protein/fat/carbs/fibre),
 *   the body of "{@link SECTION_MACROS}" (Calories leads it separately).
 * - {@link MICRO_DESCRIPTORS} — the twelve reach-toward micronutrients,
 *   "{@link SECTION_MICROS}".
 * Both are derived from {@link NUTRIENT_CATALOGUE} + {@link REACH_TOWARD_KEYS} in
 * panel order, so a nutrient added to either list flows through on its own. The
 * limit nutrients (sodium, sugar, the fats, cholesterol) have no target and are
 * NOT configurable — they surface only in the modal's "Not tracked" section,
 * read-only, when a day carries them.
 */
export const MACRO_DESCRIPTORS: NutrientDescriptor[] =
  NUTRIENT_CATALOGUE.filter(
    (d) => REACH_TOWARD_KEYS.has(d.key) && MACRO_SECTION_KEYS.has(d.key)
  );
export const MICRO_DESCRIPTORS: NutrientDescriptor[] =
  NUTRIENT_CATALOGUE.filter(
    (d) => REACH_TOWARD_KEYS.has(d.key) && !MACRO_SECTION_KEYS.has(d.key)
  );

/**
 * One targeted row of the full-day RDA-vs-target modal (ticket #42): a
 * reach-toward nutrient shown against its resolved target with a fill bar.
 * `value` is the formatted day total, or {@link ABSENT_NUTRIENT} (`—`) when the
 * day carried none of it — absent stays distinct from a reported `0` (ADR-0030 /
 * #21). `fill` is the bar width (0–100); `over` marks a day total past target
 * (bar full + amber). Pure: the modal draws the bar from these numbers.
 */
export interface DayRdaRow {
  key: string;
  label: string;
  /** Formatted day total, or {@link ABSENT_NUTRIENT} when the day carried none. */
  value: string;
  /** Formatted target, e.g. "125 g" / "2000 kcal". */
  target: string;
  /** Percent of target, clamped 0–100 for the bar width. */
  fill: number;
  /** Day total exceeds target — the bar fills full and tints amber. */
  over: boolean;
  /** The day carried none of this nutrient (`value` reads as `—`). */
  absent: boolean;
}

/**
 * One entry in the modal's "Biggest gaps" strip — the **only** place a percentage
 * appears in the full-day view, and it is a shortfall *ranking* signal, not a
 * "% DV" readout (ADR-0031 §4 / #34). `percent` is the day total as a whole-number
 * percent of target, or `null` for "no data" — a nutrient the day never carried,
 * *or* carried only an amount that rounds to 0 % (both the maximal gap, shown
 * first). So a gap chip never reads "0 %".
 */
export interface DayRdaGap {
  key: string;
  label: string;
  percent: number | null;
}

/**
 * The four grouped sections of the full-day RDA-vs-target modal (ticket #42,
 * ADR-0031 §4, Variant C): a Biggest-gaps ranking strip, the energy+macros rows,
 * the vitamins+minerals rows, and the "Not tracked" plain rows for everything the
 * day carried without a positive target (limit nutrients + `0` opt-outs). Built
 * independent of `visible_nutrients` — this is the "everything, against target"
 * surface, so the targeted sections show the full reach-toward set (absent ones
 * as `— / target`), not just the user's selected meters.
 */
export interface DayRdaView {
  gaps: DayRdaGap[];
  macros: DayRdaRow[];
  micros: DayRdaRow[];
  untracked: NutrientRow[];
}

/**
 * Builds the full-day RDA-vs-target view model (ticket #42) from a day's totals
 * and the resolved per-nutrient targets. Beside {@link buildNutrientBreakdown} and
 * just as pure — the `.svelte` modal renders the returned sections. Sections are
 * built off the shared {@link MACRO_DESCRIPTORS}/{@link MICRO_DESCRIPTORS} groups,
 * so the modal and the Settings editor always agree on the grouping.
 *
 * - **Energy & macros / Vitamins & minerals** carry every reach-toward nutrient
 *   with a positive target (a `0` opt-out drops out, see below), each as a
 *   {@link DayRdaRow}: a fill bar against `override ?? baked`. A nutrient the day
 *   never carried still appears, reading `— / target` (absent ≠ 0). Calories lead
 *   the macros — its total lives under the `calories` key, its target under
 *   `energy` (kcal), and the always-on ring means it is always shown.
 * - **Not tracked** is every nutrient the day *carried* that has no positive
 *   target — the limit nutrients (sodium, saturated/trans fat, cholesterol, sugar)
 *   and any reach-toward key opted out to `0` — as a plain value with no bar.
 * - **Biggest gaps** ranks the nutrients the user *tracks* furthest below target
 *   (the sole percentage in the modal): the "no data" ones first (absent, or
 *   carried only a rounds-to-0 % amount — `percent` `null`), then the `gapLimit`
 *   present nutrients with the lowest fill. A met or over-target nutrient has no
 *   shortfall and is never a gap. Only the `selection` (the user's visible meters,
 *   plus always Calories) is ranked — the strip is "what to eat next" for your own
 *   goals, not the full reference set the two card sections show. An omitted
 *   `selection` ranks every targeted nutrient.
 */
export function buildDayRdaView(
  breakdown: NutritionBreakdown,
  targets: Partial<Record<string, number>>,
  decimals: number = FOOD_DISPLAY_DECIMALS,
  gapLimit = 3,
  selection?: string[]
): DayRdaView {
  const hasTarget = (key: string): boolean => {
    const t = targets[key];
    return typeof t === "number" && t > 0;
  };

  // A targeted row: the day total against its target with a fill bar. `breakdownKey`
  // and `targetKey` differ only for energy (total under `calories`, target under
  // `energy`); every other nutrient keys both the same. An absent nutrient reads
  // `—` and draws no bar; a present one fills toward — and can overrun — target.
  const targetedRow = (
    breakdownKey: keyof NutritionBreakdown,
    targetKey: string,
    label: string,
    unit: NutrientUnit | "kcal"
  ): DayRdaRow => {
    const target = targets[targetKey] ?? 0;
    const present = breakdownKey in breakdown;
    const total = totalFor(breakdown, breakdownKey);
    const fmt = (v: number): string =>
      unit === "kcal"
        ? formatCalories(v, decimals)
        : formatNutrientValue(v, unit, decimals);
    const bar = present && target > 0;
    return {
      key: breakdownKey,
      label,
      value: present ? fmt(total) : ABSENT_NUTRIENT,
      target: fmt(target),
      fill: bar ? Math.min((total / target) * 100, 100) : 0,
      over: bar && total > target,
      absent: !present,
    };
  };

  // Energy & macros: Calories first (always on), then each reach-toward macro that
  // still carries a positive target (an opt-out falls through to Not tracked).
  const macros: DayRdaRow[] = [
    targetedRow("calories", "energy", "Calories", "kcal"),
  ];
  for (const d of MACRO_DESCRIPTORS) {
    if (hasTarget(d.key))
      macros.push(targetedRow(d.key, d.key, d.label, d.unit));
  }

  // Vitamins & minerals: the twelve reach-toward micronutrients (minus any opt-out),
  // from the same shared grouping the Settings editor renders.
  const micros: DayRdaRow[] = [];
  for (const d of MICRO_DESCRIPTORS) {
    if (hasTarget(d.key))
      micros.push(targetedRow(d.key, d.key, d.label, d.unit));
  }

  // Not tracked: every catalogued nutrient the day carried that has no positive
  // target — the limit nutrients and any reach-toward key opted out to 0 — as a
  // plain value, no bar. Absent nutrients are omitted (nothing to show).
  const untracked: NutrientRow[] = [];
  for (const d of NUTRIENT_CATALOGUE) {
    if (!(d.key in breakdown) || hasTarget(d.key)) continue;
    untracked.push(nutrientRow(breakdown, d, decimals));
  }

  // Biggest gaps: the "no data" nutrients first — the day carried none, OR carried
  // so little it rounds to 0 % of target — since both are the maximal gap and read
  // identically; then the lowest-fill present nutrients still below target, capped.
  // A ranking, not a % DV; a met or over-target nutrient has no shortfall, so it
  // never appears. Ranked over only the nutrients the user tracks (their selected
  // meters) plus the always-on Calories — not the full reference set the sections
  // show; an absent `selection` ranks every targeted nutrient.
  const tracked = (key: string): boolean =>
    key === "calories" || selection == null || selection.includes(key);
  const targeted = [...macros, ...micros].filter((r) => tracked(r.key));
  // A gap's percent, or null for "no data": absent, or a total that rounds to 0 %.
  const gapPercent = (r: DayRdaRow): number | null =>
    r.absent ? null : Math.round(r.fill) || null;
  const scored = targeted.map((r) => ({
    gap: { key: r.key, label: r.label, percent: gapPercent(r) } as DayRdaGap,
    fill: r.fill,
  }));
  const gaps: DayRdaGap[] = [
    ...scored.filter((s) => s.gap.percent === null).map((s) => s.gap),
    ...scored
      .filter((s) => s.gap.percent !== null && s.fill < 100)
      .sort((a, b) => a.fill - b.fill)
      .slice(0, gapLimit)
      .map((s) => s.gap),
  ];

  return { gaps, macros, micros, untracked };
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
 * caller's selection in order. A selected nutrient the breakdown never carried
 * keeps its pill (the summary stays a stable set, #29) but reads as
 * {@link ABSENT_NUTRIENT} rather than a fabricated "0 g" (absent ≠ 0, #21/#30);
 * a genuine reported zero still formats normally. Pure: the `.svelte` view just
 * renders it.
 */
export function buildNutrientPills(
  breakdown: NutritionBreakdown,
  selection: string[] | undefined,
  decimals: number = FOOD_DISPLAY_DECIMALS
): NutrientPill[] {
  const pills: NutrientPill[] = [
    {
      key: "calories",
      label: "Calories",
      value: formatCalories(totalFor(breakdown, "calories"), decimals),
    },
  ];
  for (const d of selectedNutrients(selection)) {
    pills.push({
      key: d.key,
      label: d.label,
      value:
        d.key in breakdown
          ? formatNutrientValue(totalFor(breakdown, d.key), d.unit, decimals)
          : ABSENT_NUTRIENT,
    });
  }
  return pills;
}
