/**
 * The baked, cited daily nutrition targets and the override→baked resolver
 * (ADR-0031 §1/§2, ticket #40). This module is a faithful transcription of the
 * two primary-source reference docs — `docs/reference/fda-daily-values.md` and
 * `docs/reference/active-adult-macros.md` — so a corrected DV or AMDR moves the
 * doc and this module together.
 *
 * Every value is in its **consumer's canonical unit**: grams for mass, **kcal**
 * for `energy` (ADR-0021: one fixed unit per field). Keys are food-panel
 * breakdown keys. Two parallel maps live here:
 * - the **reach-toward set** ({@link BAKED_NUTRIENT_TARGETS_G}) — energy, the
 *   three macros, fibre, and the twelve label micronutrients — a target you fill
 *   *up* toward; and
 * - the **stay-under set** ({@link BAKED_NUTRIENT_LIMITS_G}, ADR-0032) — sodium,
 *   saturated fat, cholesterol, and trans fat — a cap you keep *under*, amber once
 *   exceeded. Total sugar is deliberately absent (no citable total-sugar limit).
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
 * The five reach-toward keys the personalized calculator (ADR-0033) can move off
 * their baked default — energy, the three macros, and fibre. Fibre joins because
 * its guideline (14 g / 1000 kcal) is defined *per kcal*, so it tracks the
 * personalized energy rather than the frozen 2000-kcal reference (ADR-0033
 * Amendment 2); the twelve micros have no energy-linked basis and stay baked. A Set
 * so the store's blob filter and {@link defaultNutrientTargets} below share one
 * source of truth.
 */
export const PERSONALIZED_TARGET_KEYS: ReadonlySet<string> = new Set([
  ENERGY_TARGET_KEY,
  "protein",
  "fat",
  "carbs",
  "fiber_content",
]);

/**
 * The reach-toward **default** map: the baked defaults with the calculator's
 * frozen energy/macro set (ADR-0033) layered on top. This is the layer a target
 * reverts to when its override is cleared — so once "Calculate from body metrics"
 * has run, the ↺ reset and the greyed placeholder both show the *computed* figure
 * rather than the generic 2000-kcal reference set. An absent/empty `calculated`
 * map → the plain baked defaults, so a user who has never run the helper is
 * unchanged. Only the five {@link PERSONALIZED_TARGET_KEYS} are honoured; any
 * other key is ignored (the stored blob is already filtered — this is defence in
 * depth). The frozen numbers are stored, never recomputed here, so a later tweak
 * to the helper's constants can't silently shift a user's defaults. Pure and
 * unit-test-reachable; pass the result as the `baked` argument of
 * {@link resolveNutrientTargets}.
 */
export function defaultNutrientTargets(
  calculated: Partial<Record<string, number>> = {}
): Record<string, number> {
  const defaults = { ...BAKED_NUTRIENT_TARGETS_G };
  for (const key of PERSONALIZED_TARGET_KEYS) {
    const value = calculated[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      defaults[key] = value;
    }
  }
  return defaults;
}

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

/**
 * The baked, cited daily nutrient **limits** — the stay-under set (ADR-0032, #43),
 * a cap the day fills toward and passes into the amber over-state. Every value in
 * grams, keyed by breakdown key; transcribed from
 * `docs/reference/daily-nutrient-limits.md`. Sodium, saturated fat, and cholesterol
 * are FDA Daily Reference Values (21 CFR 101.9(c)(9)); trans fat has no FDA DV, so
 * its cap is the WHO <1%-of-energy ceiling (≈ 2.2 g at 2000 kcal, rounded to 2 g).
 * There is no energy/calorie limit — the set has no always-on member. Total sugar
 * is absent: the FDA 50 g DV is for *added* sugars, a quantity the panel doesn't
 * carry, and no citable *total*-sugar limit exists.
 */
export const BAKED_NUTRIENT_LIMITS_G: Record<string, number> = {
  sodium_content: 2.3, // 2300 mg — § 101.9(c)(9) DRV
  saturated_fat_content: 20, // 20 g — § 101.9(c)(9) DRV
  cholesterol_content: 0.3, // 300 mg — § 101.9(c)(9) DRV
  trans_fat_content: 2, // WHO <1% energy ≈ 2.2 g / 2000 kcal, rounded
};

/**
 * The stay-under key set — the only keys a limit (baked or override) may carry.
 * Used to filter a stored `settings/food/limits` override blob down to the four
 * limit nutrients, exactly as {@link REACH_TOWARD_KEYS} filters the targets blob.
 */
export const LIMIT_KEYS: ReadonlySet<string> = new Set(
  Object.keys(BAKED_NUTRIENT_LIMITS_G)
);

/**
 * Layers a user's limit-override blob over the baked limits into the single
 * resolved `{ key: number }` map the full-day modal reads (ADR-0032 §2). The
 * stay-under twin of {@link resolveNutrientTargets}, but simpler: there is **no
 * energy-clamp special case** — no limit is mandatory, so every key honours the
 * `0` opt-out uniformly.
 *
 * Per key, three states:
 * - **absent** from `overrides` → the baked cap;
 * - **`> 0`** → the override cap;
 * - **`0`** (or any non-positive) → an explicit opt-out: resolved to `0`, which the
 *   modal builder renders bar-less (the nutrient falls to "Not tracked" if carried).
 * Pure and unit-test-reachable.
 */
export function resolveNutrientLimits(
  overrides: Partial<Record<string, number>> = {},
  baked: Record<string, number> = BAKED_NUTRIENT_LIMITS_G
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const key of Object.keys(baked)) {
    const override = overrides[key];
    resolved[key] = typeof override === "number" ? override : baked[key];
  }
  return resolved;
}
