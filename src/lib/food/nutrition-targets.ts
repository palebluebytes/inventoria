/**
 * The baked, cited daily nutrition targets and the override→baked resolver
 * (ADR-0031 §1/§2, ticket #40). This module is a faithful transcription of the
 * two primary-source reference docs — `docs/reference/fda-daily-values.md` and
 * `docs/reference/active-adult-macros.md` — so a corrected DV or AMDR moves the
 * doc and this module together.
 *
 * Every value is in its **consumer's canonical unit**: grams for mass, **kcal**
 * for `energy` (ADR-0021: one fixed unit per field). Keys are food-panel
 * breakdown keys. The maps carry only the **reach-toward set** — energy, the
 * three macros, fibre, and the twelve label micronutrients — so limit nutrients
 * (sodium, saturated/trans fat, cholesterol, sugar) never gain a fill bar.
 */

/**
 * FDA Daily Values (21 CFR 101.9), adults & children ≥4 yr, converted to grams
 * (energy stays kcal). Transcribed from `docs/reference/fda-daily-values.md`.
 * The twelve micronutrients here are the baked micro targets; its three energy
 * macros are the FDA reference-diet figures, deliberately superseded by
 * {@link ACTIVE_ADULT_MACROS_G} in the composed {@link BAKED_NUTRIENT_TARGETS_G}.
 */
export const FDA_DAILY_VALUES_G = {
  energy: 2000, // kcal (reference diet, not grams)
  protein: 50, // 50 g
  fat: 78, // 78 g
  carbs: 275, // 275 g
  fiber_content: 28, // 28 g
  vitamin_d: 0.00002, // 20 µg
  calcium: 1.3, // 1300 mg
  iron: 0.018, // 18 mg
  potassium: 4.7, // 4700 mg
  vitamin_a: 0.0009, // 900 µg RAE
  vitamin_c: 0.09, // 90 mg
  vitamin_e: 0.015, // 15 mg α-tocopherol
  vitamin_b6: 0.0017, // 1.7 mg
  vitamin_b12: 0.0000024, // 2.4 µg
  folate: 0.0004, // 400 µg DFE
  magnesium: 0.42, // 420 mg
  zinc: 0.011, // 11 mg
} as const;

/**
 * Active-adult reach-toward macro targets (issue #34). Derived from the IOM
 * (2005) DRI AMDRs + Atwater 4/4/9 factors at a 2,000-kcal reference diet.
 * Transcribed from `docs/reference/active-adult-macros.md`. Values in grams
 * except `energy` (kcal). Higher-protein than the FDA reference-diet DVs; these
 * are the macro/fibre targets the panel actually renders against.
 */
export const ACTIVE_ADULT_MACROS_G = {
  energy: 2000, // kcal — reference diet (DGA 2020–2025; FDA 21 CFR 101.9)
  protein: 125, // 25 % of energy (500 kcal ÷ 4); AMDR 10–35 %
  fat: 67, // 30 % of energy (600 kcal ÷ 9 = 66.7, rounded); AMDR 20–35 %
  carbs: 225, // 45 % of energy (900 kcal ÷ 4); AMDR 45–65 % (low edge)
  fiber_content: 28, // DRI Total Fiber AI: 14 g / 1000 kcal × 2000; matches FDA DV
} as const;

/**
 * The baked reach-toward targets map: FDA micros ⊕ active-adult macros. The
 * active-adult macros win the five keys the two bases share; fibre (28 g) and
 * energy (2000 kcal) coincide, so the composition needs no reconciliation. This
 * IS the reach-toward set — exactly seventeen keys, limit nutrients absent by
 * construction. Values in grams except `energy` (kcal).
 */
export const BAKED_NUTRIENT_TARGETS_G: Record<string, number> = {
  ...FDA_DAILY_VALUES_G,
  ...ACTIVE_ADULT_MACROS_G,
};

/**
 * The reach-toward key set — the only keys a target (baked or override) may
 * carry. Used to filter a stored override blob down to targetable nutrients.
 */
export const REACH_TOWARD_KEYS: ReadonlySet<string> = new Set(
  Object.keys(BAKED_NUTRIENT_TARGETS_G)
);

/**
 * The energy key clamps against its baked default rather than honouring a `0`
 * opt-out — the calorie ring is always on and cannot be left target-less.
 */
export const ENERGY_TARGET_KEY = "energy";

/**
 * Layers a user's override blob over the baked targets into the single resolved
 * `{ key: number }` map the dashboard meters and the calorie ring both read —
 * so neither surface re-implements the precedence (ADR-0031 §2).
 *
 * Per key, three states:
 * - **absent** from `overrides` → the baked default;
 * - **`> 0`** → the override value;
 * - **`0`** (or any non-positive) → an explicit opt-out: resolved to `0`, which
 *   `buildNutrientMeters` renders bar-less (a positive target is what draws a bar).
 *
 * `energy` is the one exception: a non-positive override **clamps back to the
 * baked default** (2000 kcal) so the always-on ring can never be target-less.
 * Pure and unit-test-reachable.
 */
export function resolveNutrientTargets(
  overrides: Partial<Record<string, number>> = {},
  baked: Record<string, number> = BAKED_NUTRIENT_TARGETS_G
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const key of Object.keys(baked)) {
    const override = overrides[key];
    if (typeof override !== "number") {
      resolved[key] = baked[key];
    } else if (key === ENERGY_TARGET_KEY && !(override > 0)) {
      resolved[key] = baked[key];
    } else {
      resolved[key] = override;
    }
  }
  return resolved;
}
